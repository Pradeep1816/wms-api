import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  ExplodedLessonLineageRow,
  LessonRepository,
} from '../repositories/lesson.repository';
import { ExtraLessonRateService } from './extra-lesson-rate.service';
import { ChangeLessonRequestDto } from '../dto/change-lesson-request.dto';
import { ChangeLessonResponseDto } from '../dto/change-lesson-response.dto';
import { LessonStatusEnum } from '../enums/lesson-status';
import { LogRepository } from '../../log/repositories/log.repository';
import { LogObjectRepository } from '../../log/repositories/log-object.repository';
import { LogActivityRepository } from '../../log/repositories/log-activity.repository';
import { LogObjectType } from '../../log/enums/log-object-type.enum';
import { LogActivityType } from '../../log/enums/log-activity.enum';
import { User } from '../../user/entities/user.entity';
import { Lesson } from '../entities/lesson.entity';
import { RoundingUtils } from '../../utils/rounding.utils';

interface ChangedLessonPair {
  original: Lesson;
  replacement: Lesson;
  enrolmentDiscount: number;
}

interface CreatedExtraLesson {
  lesson: Lesson;
  enrolmentDiscount: number;
}

@Injectable()
export class LessonChangeService {
  constructor(
    private readonly lessonRepository: LessonRepository,
    private readonly logRepository: LogRepository,
    private readonly logObjectRepository: LogObjectRepository,
    private readonly logActivityRepository: LogActivityRepository,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly extraLessonRate: ExtraLessonRateService,
  ) {}

  /**
   * Change group lessons to private extra lessons
   * Matches legacy: CourseController::actionChange()
   */
  async changeLessons(
    locationSlug: string,
    locationId: number,
    lessonIds: number[],
    data: ChangeLessonRequestDto,
    loggedUserId: number,
  ): Promise<ChangeLessonResponseDto> {
    // Use transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Find all lessons by IDs
      const lessons = await this.lessonRepository.findLessonsByIds(
        lessonIds,
        locationId,
      );

      if (!lessons || lessons.length === 0) {
        throw new NotFoundException('No lessons found with the provided IDs');
      }

      // 2. Get course from the last lesson (matches legacy: end($lessons)->courseId)
      const lastLesson = lessons[lessons.length - 1];
      const course = await this.lessonRepository.findCourseWithEnrolment(
        lastLesson.courseId,
      );

      if (!course) {
        throw new NotFoundException(
          `Course with ID ${lastLesson.courseId} not found`,
        );
      }

      // 3. Get student ID from enrolment (matches legacy: $model->enrolment->studentId)
      const enrolment =
        course.enrolments && course.enrolments.length > 0
          ? course.enrolments[0]
          : null;

      if (!enrolment) {
        throw new NotFoundException(
          'No active enrolment found for this course',
        );
      }

      const studentId = enrolment.studentId;

      // Get student from enrolment (should be loaded by findCourseWithEnrolment)
      // Fallback: get student from lessons that were already loaded with student relation
      let student = enrolment.student;

      if (!student) {
        // Try to get from loaded lessons
        for (const lesson of lessons) {
          if (lesson.course?.enrolments?.[0]?.student) {
            student = lesson.course.enrolments[0].student;
            break;
          }
        }
      }

      // Final fallback: fetch student directly using repository method
      if (!student && studentId) {
        const fetchedStudent =
          await this.lessonRepository.findStudentById(studentId);
        if (!fetchedStudent) {
          throw new NotFoundException(`Student with ID ${studentId} not found`);
        }
        student = fetchedStudent;
      }

      if (!student) {
        throw new NotFoundException('Student not found for enrolment');
      }

      // Pre-fetch logged user once (used for all lessons)
      const loggedUser = await this.userRepository.findOne({
        where: { id: loggedUserId },
        relations: ['profile'],
      });

      // 4. Process each lesson
      const processedLessons: Array<{
        oldLessonId: number;
        newLessonId: number;
      }> = [];
      const changedLessonPairs: ChangedLessonPair[] = [];

      for (const lesson of lessons) {
        // 4a. Create new ExtraLesson (private lesson)
        const { lesson: newLesson, enrolmentDiscount } =
          await this.createExtraLesson(
            lesson,
            data.programId,
            data.teacherId,
            studentId,
            locationId,
            loggedUserId,
          );

        if (!newLesson) {
          throw new BadRequestException(
            `Failed to create extra lesson for lesson ID ${lesson.id}`,
          );
        }

        // 4b. Transfer lesson payments and update references
        await this.transferLessonPayments(lesson.id, newLesson.id);

        // 4c. Create log entry (pass pre-fetched loggedUser)
        await this.createExtraLessonLog(
          newLesson.id,
          student,
          loggedUser, // Pass pre-fetched user instead of loggedUserId
          locationId,
          locationSlug,
        );

        // 4d. Cancel original lesson
        await this.lessonRepository.cancelLesson(lesson.id);

        processedLessons.push({
          oldLessonId: lesson.id,
          newLessonId: newLesson.id,
        });
        changedLessonPairs.push({
          original: lesson,
          replacement: newLesson,
          enrolmentDiscount,
        });
      }

      await this.preserveExplodedSelectionTotal(changedLessonPairs);

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Lessons successfully changed',
        data: {
          processedCount: processedLessons.length,
          lessons: processedLessons,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error in changeLessons:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        return {
          success: false,
          errorCode:
            error instanceof NotFoundException ? 'NOT_FOUND' : 'BAD_REQUEST',
          message: error.message,
        };
      }

      return {
        success: false,
        errorCode: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to change lessons',
      };
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Keep a complete set of converted exploded lessons equal to one lesson at
   * the destination rate. Without this, two 15-minute children at $72.50/hr
   * are independently rounded to $18.13 and become $36.26 instead of $36.25.
   *
   * Partial selections are deliberately left alone because their unselected
   * sibling is not part of this operation and must not be repriced indirectly.
   */
  private async preserveExplodedSelectionTotal(
    pairs: ChangedLessonPair[],
  ): Promise<void> {
    if (pairs.length < 2) {
      return;
    }

    const lineage = await this.lessonRepository.findExplodedLineageForLessons(
      pairs.map((pair) => pair.original.id),
    );
    if (lineage.length === 0) {
      return;
    }

    const pairByOriginalId = new Map(
      pairs.map((pair) => [pair.original.id, pair]),
    );
    const nearestLineageByLessonId = new Map<
      number,
      ExplodedLessonLineageRow
    >();

    for (const row of lineage) {
      // Rescheduling an exploded child creates another depth-1 hierarchy edge,
      // but that one-child edge is not an explode family. Resolve descendants
      // through the nearest ancestor that actually split into multiple lessons.
      if (Number(row.splitCount) < 2) {
        continue;
      }

      const lessonId = Number(row.lessonId);
      const existing = nearestLineageByLessonId.get(lessonId);
      if (
        !existing ||
        Number(row.descendantDepth) < Number(existing.descendantDepth)
      ) {
        nearestLineageByLessonId.set(lessonId, row);
      }
    }

    const groups = new Map<number, ExplodedLessonLineageRow[]>();
    for (const row of nearestLineageByLessonId.values()) {
      if (!pairByOriginalId.has(Number(row.lessonId))) {
        continue;
      }

      const parentId = Number(row.explodedParentId);
      const rows = groups.get(parentId) ?? [];
      rows.push(row);
      groups.set(parentId, rows);
    }

    for (const rows of groups.values()) {
      const splitCount = Number(rows[0]?.splitCount ?? 0);
      const rowsByBranch = new Map<number, ExplodedLessonLineageRow[]>();
      for (const row of rows) {
        const branchId = Number(row.explodedBranchId);
        const branchRows = rowsByBranch.get(branchId) ?? [];
        branchRows.push(row);
        rowsByBranch.set(branchId, branchRows);
      }

      if (
        splitCount < 2 ||
        rowsByBranch.size !== splitCount ||
        [...rowsByBranch.values()].some((branchRows) => branchRows.length !== 1)
      ) {
        continue;
      }

      const orderedRows = [...rowsByBranch.values()]
        .map(([row]) => row)
        .sort((left, right) => {
          const dateOrder =
            new Date(left.explodedBranchDate).getTime() -
            new Date(right.explodedBranchDate).getTime();
          return (
            dateOrder ||
            Number(left.explodedBranchId) - Number(right.explodedBranchId)
          );
        });
      const groupPairs = orderedRows.map(
        (row) => pairByOriginalId.get(Number(row.lessonId))!,
      );
      const baseRate = Number(groupPairs[0].replacement.programRate ?? 0);
      const parentHours = RoundingUtils.durationToHours(rows[0].parentDuration);
      const childHours = RoundingUtils.durationToHours(
        groupPairs[0].original.duration,
      );

      if (
        baseRate <= 0 ||
        childHours.isLessThanOrEqualTo(0) ||
        !childHours.times(groupPairs.length).isEqualTo(parentHours) ||
        groupPairs.some(
          (pair) =>
            Number(pair.replacement.programRate ?? 0) !== baseRate ||
            !RoundingUtils.durationToHours(pair.original.duration).isEqualTo(
              childHours,
            ),
        )
      ) {
        continue;
      }

      const targetTotal = RoundingUtils.roundDecimal(
        RoundingUtils.decimal(baseRate).times(parentHours),
        2,
      );
      const shares = RoundingUtils.splitAmountPreservingTotal(
        targetTotal,
        groupPairs.length,
      );

      for (const [index, pair] of groupPairs.entries()) {
        const adjustedRate = RoundingUtils.roundDecimal(
          RoundingUtils.decimal(shares[index]).dividedBy(childHours),
          RoundingUtils.MONEY_SCALE,
        );
        const discountedTotal = RoundingUtils.roundDecimal(
          RoundingUtils.decimal(shares[index]).minus(
            pair.enrolmentDiscount,
          ),
          2,
        );
        await this.lessonRepository.updateChangedLessonPricing(
          pair.replacement.id,
          adjustedRate,
          discountedTotal,
        );
        pair.replacement.programRate = adjustedRate;
      }
    }
  }

  /**
   * Create extra lesson (private lesson) from group lesson
   * Matches legacy: new ExtraLesson() and addPrivate()
   */
  private async createExtraLesson(
    originalLesson: Lesson,
    programId: number,
    teacherId: number,
    studentId: number,
    locationId: number,
    loggedUserId: number,
  ): Promise<CreatedExtraLesson> {
    // Use date directly (originalLesson.date is already a Date object)
    const lessonDate = originalLesson.date;

    // Find or create extra course
    const course = await this.lessonRepository.findOrCreateExtraCourse(
      studentId,
      programId,
      teacherId,
      locationId,
      lessonDate,
    );

    // The rate this extra lesson is priced at.
    //
    // This used to fall through to `program.rate` - the program's list price,
    // from before tiers existed - exactly as adding a private lesson did. That
    // one was corrected on 2026-09-02; this door was missed, and found the same
    // day. Both now follow the student's own pricing through one service.
    const programRate = await this.extraLessonRate.resolveAndRecord({
      courseId: course.id,
      studentId,
      programId,
      locationId,
      duration: originalLesson.duration,
      lessonDate,
    });

    // Create enrolment if it doesn't exist
    const existingEnrolment =
      await this.lessonRepository.findStudentEnrolmentByProgram(
        studentId,
        programId,
      );

    const courseEnrolment =
      existingEnrolment && existingEnrolment.courseId === course.id
        ? existingEnrolment
        : null;

    if (!courseEnrolment) {
      await this.lessonRepository.createExtraCourseEnrolment(
        course.id,
        studentId,
        loggedUserId,
      );

      // Create course schedule
      await this.lessonRepository.createCourseSchedule(
        course.id,
        studentId,
        lessonDate,
        originalLesson.duration,
      );
    }

    // Create lesson with UNSCHEDULED status (matches legacy: status=5 directly)
    const lesson = await this.lessonRepository.createLesson(
      course.id,
      teacherId,
      lessonDate,
      originalLesson.duration,
      programId,
      locationId,
      originalLesson.isOnline || false,
      loggedUserId,
      programRate,
    );

    // Note: createLesson now creates with UNSCHEDULED status directly, no update needed

    // Make lesson as root
    await this.lessonRepository.makeLessonAsRoot(lesson.id);

    const enrolmentDiscount =
      await this.extraLessonRate.applyEnrolmentDiscounts({
        lessonId: lesson.id,
        studentId,
        programId,
        locationId,
        duration: originalLesson.duration,
        lessonDate,
        programRate,
      });

    // Create private lesson record
    // Pass programRate and tax directly to avoid extra query
    // Convert tax to number (it might be stored as string in DB)
    const taxValue = lesson.tax != null ? Number(lesson.tax) : 0;
    await this.lessonRepository.createPrivateLessonRecord(
      lesson.id,
      lessonDate,
      originalLesson.duration,
      programRate, // Pass programRate directly
      isNaN(taxValue) || !isFinite(taxValue) ? 0 : taxValue, // Ensure tax is a valid number
      enrolmentDiscount,
    );

    return { lesson, enrolmentDiscount };
  }

  /**
   * Transfer lesson payments from old lesson to new lesson
   * Also updates payment references for credit usage
   */
  private async transferLessonPayments(
    oldLessonId: number,
    newLessonId: number,
  ): Promise<void> {
    // Get all lesson payments for the old lesson
    const lessonPayments =
      await this.lessonRepository.getLessonPayments(oldLessonId);

    if (lessonPayments.length === 0) {
      return; // No payments to transfer
    }

    // Get new lesson number for reference updates
    const newLessonNumber =
      await this.lessonRepository.getLessonNumber(newLessonId);

    // Transfer all lesson_payment records (updates each by ID, matches legacy)
    await this.lessonRepository.transferLessonPayments(
      oldLessonId,
      newLessonId,
    );

    // Update payment references for credit usage
    if (newLessonNumber) {
      for (const lessonPayment of lessonPayments) {
        if (lessonPayment.payment_id) {
          await this.lessonRepository.updatePaymentReferenceForCreditUsage(
            lessonPayment.payment_id,
            newLessonNumber,
          );
        }
      }
    }
  }

  /**
   * Create log entry for extra lesson creation
   * Matches legacy: LessonLog::extraLessonCreate()
   */
  private async createExtraLessonLog(
    lessonId: number,
    student: any,
    loggedUser: any, // Accept pre-fetched user object instead of fetching again
    locationId: number,
    locationSlug: string,
  ): Promise<void> {
    try {
      // Validate student object
      if (!student) {
        console.error('Student object is undefined for lesson log creation');
        return;
      }

      // Get student full name
      const studentFullName =
        `${student.firstName || ''} ${student.lastName || ''}`.trim();

      if (!studentFullName) {
        console.error('Student name is empty for lesson log creation', {
          studentId: student.id,
        });
        // Continue with fallback - log will still be created but with empty name
      }

      // Validate logged user (should be pre-fetched)
      if (!loggedUser) {
        console.error(
          'Logged user object is undefined for lesson log creation',
        );
        return;
      }

      // Get user name
      const loggedUserProfile = loggedUser.profile;
      let loggedUserIdentity = '';

      if (loggedUserProfile?.firstname && loggedUserProfile?.lastname) {
        loggedUserIdentity =
          `${loggedUserProfile.firstname} ${loggedUserProfile.lastname}`.trim();
      } else if (loggedUserProfile?.firstname) {
        loggedUserIdentity = loggedUserProfile.firstname.trim();
      } else if (loggedUserProfile?.lastname) {
        loggedUserIdentity = loggedUserProfile.lastname.trim();
      } else if (loggedUser.username) {
        loggedUserIdentity = loggedUser.username;
      }

      if (!loggedUserIdentity || loggedUserIdentity.length === 0) {
        loggedUserIdentity = `User ${loggedUser.id}`;
      }

      // Get log object (TYPE_LESSON)
      const logObject = await this.logObjectRepository.findLogObjectByName(
        LogObjectType.LESSON,
      );
      if (!logObject) {
        console.error('Log object not found for type:', LogObjectType.LESSON);
        return;
      }

      // Get log activity (TYPE_CREATE)
      const logActivity =
        await this.logActivityRepository.findLogActivityByName(
          LogActivityType.TYPE_CREATE,
        );
      if (!logActivity) {
        console.error(
          'Log activity not found for type:',
          LogActivityType.TYPE_CREATE,
        );
        return;
      }

      // Create message: "{loggedUser} created new extra lesson for {{studentName}}"
      const message = `${loggedUserIdentity} created new extra lesson for {{${studentFullName}}}`;

      // Get student path
      const studentPath = `/admin/v2/${locationSlug}/students/${student.id}`;
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

      // Create log entry
      const logCreatedOn = new Date();

      await this.logRepository.createLog(
        {
          logObjectId: logObject.id,
          logActivityId: logActivity.id,
          message,
          data: JSON.stringify({ lessonId }),
          locationId,
          createdUserId: loggedUser.id,
          createdOn: logCreatedOn,
        },
        {
          index: studentFullName,
          baseUrl,
          path: studentPath,
        },
        {
          instanceId: lessonId,
          instanceType: LogObjectType.LESSON,
        },
      );
    } catch (error) {
      // Log error but don't fail the lesson creation
      console.error('Error creating extra lesson log:', error);
    }
  }
}
