import { ensurePrivateLessonEmailStatuses } from '../helpers/ensure-lesson-email-statuses';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, EntityManager } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { Qualification } from '../../qualification/entities/qualification.entity';
import { User } from '../../user/entities/user.entity';
import { UserLocation } from '../../user/entities/user-location.entity';
import { LessonStatusEnum } from '../enums/lesson-status';
import { Program } from '../../program/entities/program.entity';
import { TeacherAvailability } from '../../teacher/entities/teacher-availability.entity';
import { RbacAuthAssignment } from '../../auth/entities/rbac-auth-assignment.entity';
import { TeacherSubstituteHierarchyHelper } from './helpers/teacher-substitute/teacher-substitute-hierarchy.helper';
import { TeacherSubstitutePrivateLessonHelper } from './helpers/teacher-substitute/teacher-substitute-private-lesson.helper';
import { TeacherSubstituteGroupLessonHelper } from './helpers/teacher-substitute/teacher-substitute-group-lesson.helper';
import { TeacherSubstitutePaymentHelper } from './helpers/teacher-substitute/teacher-substitute-payment.helper';
import { TeacherSubstituteDiscountHelper } from './helpers/teacher-substitute/teacher-substitute-discount.helper';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { PrivateLesson } from '../entities/private-lesson.entity';
import { PrivateLessonEmailStatus } from '../entities/private-lesson-email-status.entity';
import { getCurrentESTDate } from 'src/utils/date-utils';

@Injectable()
export class TeacherSubstituteRepository {
  constructor(
    @InjectRepository(Lesson)
    public readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Qualification)
    private readonly qualificationRepository: Repository<Qualification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserLocation)
    private readonly userLocationRepository: Repository<UserLocation>,
    @InjectRepository(TeacherAvailability)
    private readonly teacherAvailabilityRepository: Repository<TeacherAvailability>,
    private readonly hierarchyHelper: TeacherSubstituteHierarchyHelper,
    private readonly privateLessonHelper: TeacherSubstitutePrivateLessonHelper,
    private readonly groupLessonHelper: TeacherSubstituteGroupLessonHelper,
    private readonly paymentHelper: TeacherSubstitutePaymentHelper,
    private readonly discountHelper: TeacherSubstituteDiscountHelper,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
  ) {}

  /**
   * Get lessons by IDs with course and program relations.
   * Returns lessons in the same order as lessonIds (required for correct pairing in confirm).
   */
  async getLessonsByIds(lessonIds: number[]): Promise<Lesson[]> {
    if (lessonIds.length === 0) return [];
    const lessons = await this.lessonRepository.find({
      where: { id: In(lessonIds) },
      relations: [
        'course',
        'course.program',
        'teacher',
        'teacher.profile',
        'privateLesson',
        'discounts',
      ],
    });
    const byId = new Map(lessons.map((l) => [l.id, l]));
    return lessonIds.map((id) => byId.get(id)).filter(Boolean) as Lesson[];
  }

  /**
   * Get minimal lesson data for preview/validation (lightweight - no discounts).
   * Returns lessons in the same order as lessonIds.
   */
  async getLessonsByIdsMinimal(lessonIds: number[]): Promise<Lesson[]> {
    if (lessonIds.length === 0) return [];
    const lessons = await this.lessonRepository.find({
      where: { id: In(lessonIds) },
      relations: [
        'course',
        'course.program',
      ],
      select: ['id', 'teacherId', 'courseId'],
    });
    const byId = new Map(lessons.map((l) => [l.id, l]));
    return lessonIds.map((id) => byId.get(id)).filter(Boolean) as Lesson[];
  }

  /**
   * Get draft lessons created by user
   */
  async getDraftLessonsByUser(userId: number): Promise<Lesson[]> {
    return this.lessonRepository.find({
      where: {
        isDeleted: false,
        isConfirmed: false,
        createdByUserId: userId,
      },
      select: ['id', 'type', 'courseId'],
    });
  }

  /**
   * Delete draft lessons
   */
  async deleteDraftLessons(lessonIds: number[]): Promise<void> {
    if (lessonIds.length > 0) {
      await this.lessonRepository.manager.transaction(async (manager) => {
        // Clean private-lesson child rows first to avoid orphaned/corrupted lessonId values.
        await manager.getRepository(PrivateLessonEmailStatus).delete({
          lessonId: In(lessonIds),
        });
        await manager.getRepository(PrivateLesson).delete({
          lessonId: In(lessonIds),
        });
        await manager.getRepository(Lesson).delete({ id: In(lessonIds) });
      });
    }
  }

  /**
   * Create draft lesson (clone with new teacher)
   */
  async createDraftLesson(
    originalLesson: Lesson,
    newTeacherId: number,
    userId: number,
  ): Promise<Lesson> {
    const now = getCurrentESTDate();
    // Create new lesson by copying properties (excluding relations and id)
    const newLesson = this.lessonRepository.create({
      courseId: originalLesson.courseId,
      teacherId: newTeacherId, // ✅ Set new teacher ID
      classroomId: originalLesson.classroomId,
      colorCode: originalLesson.colorCode,
      date: originalLesson.date,
      duration: originalLesson.duration,
      status: originalLesson.status,
      isPresent: originalLesson.isPresent,
      isDeleted: false,
      isConfirmed: false, // ✅ Draft lesson
      type: originalLesson.type,
      isExploded: originalLesson.isExploded,
      isOnline: originalLesson.isOnline,
      createdByUserId: userId,
      updatedByUserId: userId,
      programRate: originalLesson.programRate,
      teacherRate: originalLesson.teacherRate, // Will be updated later if needed
      teacherRateOld: originalLesson.teacherRateOld,
      tax: originalLesson.tax,
      paidStatus: originalLesson.paidStatus,
      total: originalLesson.total,
      dueDate: originalLesson.dueDate,
      originalDate: originalLesson.originalDate,
      createdOn: now,
      updatedOn: now,
    });

    return this.lessonRepository.save(newLesson);
  }

  /**
   * Get qualified teachers for programs in location
   * Optimized to avoid N+1 query problem - uses single JOIN query instead of loop
   * Legacy: User::find()->teachers($programId, $locationId)->notDeleted()->all()
   * Legacy's teachers() scope calls allTeachers(), which filters by rbac_auth_assignment.item_name = 'teacher'
   */
  async getQualifiedTeachers(
    programIds: number[],
    locationId: number,
    excludeTeacherId: number,
  ): Promise<User[]> {
    // Get all qualified teachers in one query using JOIN (avoids N+1 problem)
    // Matches legacy teachers() scope: joins userLocation, qualifications, and rbac_auth_assignment
    const qualifiedTeachers = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'userProfile')
      .innerJoin('user.userLocation', 'userLocation')
      .innerJoin(
        Qualification,
        'qualification',
        'qualification.teacherId = user.id AND qualification.programId IN (:...programIds) AND qualification.isDeleted = :qualDeleted',
        { programIds, qualDeleted: false },
      )
      .innerJoin(
        RbacAuthAssignment,
        'rbacAuthAssignment',
        'rbacAuthAssignment.user_id = CAST(user.id AS CHAR) AND rbacAuthAssignment.item_name = :teacherRole',
        { teacherRole: 'teacher' },
      )
      .where('userLocation.locationId = :locationId', { locationId })
      .andWhere('user.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('user.id != :excludeTeacherId', { excludeTeacherId })
      .orderBy('userProfile.firstname', 'ASC')
      .distinct(true) // Remove duplicates if teacher has multiple qualifications
      .getMany();

    return qualifiedTeachers;
  }


  /**
   * Get lessons with relations.
   * Returns lessons in the same order as lessonIds (for correct pairing in confirm).
   */
  async getLessonsWithRelations(lessonIds: number[]): Promise<Lesson[]> {
    if (lessonIds.length === 0) return [];
    const lessons = await this.lessonRepository.find({
      where: { id: In(lessonIds) },
      relations: [
        'course',
        'course.program',
        'course.enrolments',
        'course.enrolments.student',
        'teacher',
        'teacher.profile',
        'privateLesson',
      ],
    });
    const byId = new Map(lessons.map((l) => [l.id, l]));
    return lessonIds.map((id) => byId.get(id)).filter(Boolean) as Lesson[];
  }

  /**
   * Check if teacher is qualified for the program at the location
   * Uses the exact same logic as getQualifiedTeachers to ensure 100% consistency
   * Legacy: !in_array($model->teacherId, ArrayHelper::getColumn(User::find()->teachers($model->course->programId, $locationId)->notDeleted()->all(), 'id'))
   * Legacy's teachers() scope calls allTeachers(), which filters by rbac_auth_assignment.item_name = 'teacher'
   * Returns true if teacher is NOT qualified (conflict)
   */
  async checkTeacherQualification(
    teacherId: number,
    programId: number,
    locationId: number,
  ): Promise<boolean> {
    // Use the exact same query structure as getQualifiedTeachers for consistency
    // This ensures if a teacher is in getQualifiedTeachers, they will pass this check
    // Matches legacy teachers() scope: joins userLocation, qualifications, and rbac_auth_assignment
    const qualifiedTeacher = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user.userLocation', 'userLocation')
      .innerJoin(
        Qualification,
        'qualification',
        'qualification.teacherId = user.id AND qualification.programId = :programId AND qualification.isDeleted = :qualDeleted',
        { programId, qualDeleted: false },
      )
      .innerJoin(
        RbacAuthAssignment,
        'rbacAuthAssignment',
        'rbacAuthAssignment.user_id = CAST(user.id AS CHAR) AND rbacAuthAssignment.item_name = :teacherRole',
        { teacherRole: 'teacher' },
      )
      .where('user.id = :teacherId', { teacherId })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('user.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();

    // Return true if NOT qualified (conflict exists)
    return !qualifiedTeacher;
  }

  /**
   * Check teacher conflict (overlap) - Teacher Occupied
   * Legacy: Checks for another confirmed, present lesson that overlaps in time
   * Returns true if teacher has another confirmed, present lesson at the same time
   */
  async checkTeacherConflict(
    teacherId: number,
    date: Date,
    duration: string,
    locationId: number,
    excludeLessonIds: number[] = [],
  ): Promise<boolean> {
    // Parse duration to get end time (legacy: adds duration and subtracts 1 second)
    const parts = duration.split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const seconds = parseInt(parts[2], 10) || 0;
    const durationInSeconds = hours * 3600 + minutes * 60 + seconds;

    const lessonDate = new Date(date);
    const lessonDateStr = lessonDate.toISOString().split('T')[0]; // Y-m-d format

    // Extract UTC time to match MySQL TIME() function output
    const utcHours = lessonDate.getUTCHours();
    const utcMinutes = lessonDate.getUTCMinutes();
    const utcSeconds = lessonDate.getUTCSeconds();
    const lessonStartTime = `${String(utcHours).padStart(2, '0')}:${String(utcMinutes).padStart(2, '0')}:${String(utcSeconds).padStart(2, '0')}`;

    // Calculate end time (legacy: adds duration and subtracts 1 second)
    const lessonEndTimeDate = new Date(
      lessonDate.getTime() + durationInSeconds * 1000 - 1000,
    );
    const endUtcHours = lessonEndTimeDate.getUTCHours();
    const endUtcMinutes = lessonEndTimeDate.getUTCMinutes();
    const endUtcSeconds = lessonEndTimeDate.getUTCSeconds();
    const lessonEndTime = `${String(endUtcHours).padStart(2, '0')}:${String(endUtcMinutes).padStart(2, '0')}:${String(endUtcSeconds).padStart(2, '0')}`;

    const query = this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .where('lesson.teacherId = :teacherId', { teacherId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.isPresent = :isPresent', { isPresent: true })
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('DATE(lesson.date) = :lessonDate', { lessonDate: lessonDateStr }) // ✅ Same day check
      .andWhere(
        // ✅ Legacy overlap() OR conditions (exact match):
        `(
          TIME(lesson.date) BETWEEN :lessonStartTime AND :lessonEndTime
          OR
          DATE_SUB(ADDTIME(TIME(lesson.date), lesson.duration), INTERVAL 1 SECOND) BETWEEN :lessonStartTime AND :lessonEndTime
          OR
          (
            TIME(lesson.date) < :lessonStartTime
            AND
            DATE_SUB(ADDTIME(TIME(lesson.date), lesson.duration), INTERVAL 1 SECOND) > :lessonEndTime
          )
        )`,
        {
          lessonStartTime,
          lessonEndTime,
        },
      );

    // Exclude specified lesson IDs
    if (excludeLessonIds.length > 0) {
      query.andWhere('lesson.id NOT IN (:...excludeLessonIds)', {
        excludeLessonIds,
      });
    }

    const count = await query.getCount();
    return count > 0;
  }

  /**
   * Check if teacher has availability scheduled for the day
   * Legacy: Check 3 - Teacher not scheduled for the day (warning - yellow)
   * Legacy: TeacherAvailability::find()->teacher($teacherId)->day($day)->notDeleted()->all()
   * Legacy's teacher() joins through user_location -> user, filters by user.id, but NOT by location
   * So it checks if teacher has availability at ANY location for that day
   * Returns true if teacher has NO availability for that day (warning)
   */
  async checkTeacherScheduledForDay(
    teacherId: number,
    date: Date,
    locationId: number, // Note: locationId parameter kept for API consistency but not used in query
  ): Promise<boolean> {
    // Get day of week (1 = Monday, 7 = Sunday, matching legacy)
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();

    // Legacy: TeacherAvailability::find()->teacher($teacherId)->day($day)->notDeleted()->all()
    // Legacy's teacher() joins through user_location -> user, filters by user.id, but NOT by location
    // So it checks if teacher has availability at ANY location for that day
    const availability = await this.teacherAvailabilityRepository
      .createQueryBuilder('availability')
      .innerJoin('user_location', 'userLocation', 'userLocation.id = availability.teacher_location_id')
      .innerJoin('user', 'user', 'user.id = userLocation.user_id')
      .where('user.id = :teacherId', { teacherId })
      .andWhere('availability.day = :dayOfWeek', { dayOfWeek })
      .andWhere('availability.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();

    // Return true if NOT scheduled for the day (warning)
    return !availability;
  }

  /**
   * Check if teacher has availability for the specific time slot
   * Legacy: Check 4 - Teacher not available at that time (warning - yellow)
   * Legacy: TeacherAvailability::find()->teacher($teacherId)->day($day)->time($startTime, $endTime)->notDeleted()->all()
   * Legacy's teacher() joins through user_location -> user, filters by user.id, but NOT by location
   * So it checks if teacher has availability at ANY location for that time slot
   * Returns true if teacher has availability for the day but NOT for the specific time slot
   */
  async checkTeacherAvailableAtTime(
    teacherId: number,
    date: Date,
    lessonStartTime: string,
    lessonEndTime: string,
    locationId: number, // Note: locationId parameter kept for API consistency but not used in query
  ): Promise<boolean> {
    // Get day of week (1 = Monday, 7 = Sunday, matching legacy)
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();

    // Legacy: TeacherAvailability::find()->teacher($teacherId)->day($day)->time($startTime, $endTime)->notDeleted()->all()
    // Legacy's teacher() joins through user_location -> user, filters by user.id, but NOT by location
    // So it checks if teacher has availability at ANY location for that time slot
    // Availability must cover the lesson time: from_time <= lessonStartTime AND to_time >= lessonEndTime
    const availability = await this.teacherAvailabilityRepository
      .createQueryBuilder('availability')
      .innerJoin('user_location', 'userLocation', 'userLocation.id = availability.teacher_location_id')
      .innerJoin('user', 'user', 'user.id = userLocation.user_id')
      .where('user.id = :teacherId', { teacherId })
      .andWhere('availability.day = :dayOfWeek', { dayOfWeek })
      .andWhere('availability.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere(
        // Availability must cover the lesson time:
        // from_time <= lessonStartTime AND to_time >= lessonEndTime
        'availability.fromTime <= :lessonStartTime AND availability.toTime >= :lessonEndTime',
        { lessonStartTime, lessonEndTime },
      )
      .getOne();

    // Return true if NOT available at that time (warning)
    return !availability;
  }

  /**
   * Get the primary studentId for a private lesson's course.
   * Legacy: Private lesson has a single confirmed, not-deleted enrolment.
   */
  async getPrivateLessonStudentId(courseId: number): Promise<number | null> {
    const enrolment = await this.enrolmentRepository.findOne({
      where: {
        courseId,
        isDeleted: false,
        isConfirmed: 1,
      },
      order: { id: 'ASC' },
    });

    return enrolment ? enrolment.studentId : null;
  }

  /**
   * Batch version: get primary studentId per course (same logic as getPrivateLessonStudentId).
   * Returns map courseId -> studentId (or null). One query instead of N.
   */
  async getPrivateLessonStudentIds(
    courseIds: number[],
  ): Promise<Map<number, number | null>> {
    const map = new Map<number, number | null>();
    if (courseIds.length === 0) return map;

    const enrolments = await this.enrolmentRepository.find({
      where: {
        courseId: In(courseIds),
        isDeleted: false,
        isConfirmed: 1,
      },
      order: { courseId: 'ASC', id: 'ASC' },
      select: ['id', 'courseId', 'studentId'],
    });

    // First enrolment per courseId (by id ASC) - same as getPrivateLessonStudentId
    for (const e of enrolments) {
      if (!map.has(e.courseId)) {
        map.set(e.courseId, e.studentId);
      }
    }
    // CourseIds with no enrolment get null (caller can check)
    for (const cid of courseIds) {
      if (!map.has(cid)) map.set(cid, null);
    }
    return map;
  }

  /**
   * Check student conflict (overlap) for private lessons - Student Occupied.
   * Mirrors checkTeacherConflict but joins by enrolment.studentId instead of teacherId.
   * Returns true if student has another confirmed lesson that overlaps in time.
   */
  async checkStudentConflict(
    studentId: number,
    date: Date,
    duration: string,
    locationId: number,
    excludeLessonIds: number[] = [],
  ): Promise<boolean> {
    // Parse duration to get end time (legacy: adds duration and subtracts 1 second)
    const parts = duration.split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const seconds = parseInt(parts[2], 10) || 0;
    const durationInSeconds = hours * 3600 + minutes * 60 + seconds;

    const lessonDate = new Date(date);
    const lessonDateStr = lessonDate.toISOString().split('T')[0]; // Y-m-d format

    // Extract UTC time to match MySQL TIME() function output
    const utcHours = lessonDate.getUTCHours();
    const utcMinutes = lessonDate.getUTCMinutes();
    const utcSeconds = lessonDate.getUTCSeconds();
    const lessonStartTime = `${String(utcHours).padStart(2, '0')}:${String(
      utcMinutes,
    ).padStart(2, '0')}:${String(utcSeconds).padStart(2, '0')}`;

    // Calculate end time (legacy: adds duration and subtracts 1 second)
    const lessonEndTimeDate = new Date(
      lessonDate.getTime() + durationInSeconds * 1000 - 1000,
    );
    const endUtcHours = lessonEndTimeDate.getUTCHours();
    const endUtcMinutes = lessonEndTimeDate.getUTCMinutes();
    const endUtcSeconds = lessonEndTimeDate.getUTCSeconds();
    const lessonEndTime = `${String(endUtcHours).padStart(2, '0')}:${String(
      endUtcMinutes,
    ).padStart(2, '0')}:${String(endUtcSeconds).padStart(2, '0')}`;

    const query = this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.enrolments', 'enrolment')
      .where('enrolment.studentId = :studentId', { studentId })
      .andWhere('enrolment.isDeleted = :enrolmentDeleted', {
        enrolmentDeleted: false,
      })
      .andWhere('enrolment.isConfirmed = :enrolmentConfirmed', {
        enrolmentConfirmed: 1,
      })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('DATE(lesson.date) = :lessonDate', { lessonDate: lessonDateStr })
      .andWhere(
        `(
          TIME(lesson.date) BETWEEN :lessonStartTime AND :lessonEndTime
          OR
          DATE_SUB(ADDTIME(TIME(lesson.date), lesson.duration), INTERVAL 1 SECOND) BETWEEN :lessonStartTime AND :lessonEndTime
          OR
          (
            TIME(lesson.date) < :lessonStartTime
            AND
            DATE_SUB(ADDTIME(TIME(lesson.date), lesson.duration), INTERVAL 1 SECOND) > :lessonEndTime
          )
        )`,
        {
          lessonStartTime,
          lessonEndTime,
        },
      );

    if (excludeLessonIds.length > 0) {
      query.andWhere('lesson.id NOT IN (:...excludeLessonIds)', {
        excludeLessonIds,
      });
    }

    const count = await query.getCount();
    return count > 0;
  }

  /**
   * Cancel lesson and reschedule to new lesson
   * Legacy: oldLesson->cancel() + oldLesson->rescheduleTo($newLesson)
   */
  async cancelAndReschedule(
    oldLesson: Lesson,
    newLesson: Lesson,
    currentUserId: number,
    permanentRescheduleDate: Date | null = null,
    enrolmentId: number | null = null,
    manager: EntityManager,
  ): Promise<void> {
    const oldLessonIsPrivate = await this.privateLessonHelper.isPrivateLesson(
      oldLesson,
    );
    const newLessonIsPrivate = await this.privateLessonHelper.isPrivateLesson(
      newLesson,
    );

    // 1. Cancel old lesson
    const now = getCurrentESTDate();
    await manager.update(
      Lesson,
      { id: oldLesson.id },
      {
        status: LessonStatusEnum.CANCELED,
        updatedByUserId: currentUserId,
        updatedOn: now,
      },
    );
    oldLesson.status = LessonStatusEnum.CANCELED;
    oldLesson.updatedByUserId = currentUserId;

    // 2. Create lesson hierarchy link
    await this.hierarchyHelper.makeAsChild(
      oldLesson.id,
      newLesson.id,
      manager,
    );

    // 3. Update teacher rate if teacher changed (MUST run BEFORE setExpiryForPrivateLesson)
    if (oldLesson.teacherId !== newLesson.teacherId) {
      await this.updateTeacherRate(newLesson, manager);
    }

    // 4. Set expiry date for private lessons (must be called right after hierarchy creation)
    if (newLessonIsPrivate || oldLessonIsPrivate) {
      await this.privateLessonHelper.setExpiryForPrivateLesson(
        newLesson,
        manager,
      );
    }

    // 5. For PRIVATE lessons: Handle private lesson specific logic
    if (oldLessonIsPrivate) {
      await this.privateLessonHelper.handlePrivateLessonReschedule(
        oldLesson,
        newLesson,
        manager,
      );
    }

    // 6. Copy discounts from old lesson to new lesson
    // Must run before createGroupLessonsForAllEnrolments so discount records
    // exist on newLessonId when group lesson amounts are calculated.
    if (!permanentRescheduleDate && !enrolmentId) {
      await this.discountHelper.copyDiscounts(
        oldLesson.id,
        newLesson.id,
        manager,
      );
    }

    // 7. For GROUP programs: Create GroupLesson records for all enrolments
    const isGroupProgram =
      Number(oldLesson.course?.program?.type) === Program.TYPE_GROUP_PROGRAM;

    if (isGroupProgram) {
      await this.groupLessonHelper.createGroupLessonsForAllEnrolments(
        oldLesson.id,
        newLesson.id,
        newLesson.courseId,
        manager,
      );
    }

    // 8. Transfer lesson payments from old to new
    await this.paymentHelper.transferLessonPayments(
      oldLesson.id,
      newLesson.id,
      manager,
    );

    // 9. Recalculate private_lesson total/balance after discount + payment transfer.
    if (newLessonIsPrivate || oldLessonIsPrivate) {
      await this.privateLessonHelper.recalculatePrivateLessonAmounts(
        newLesson.id,
        manager,
      );
    }

    // 10. Confirm new lesson
    const confirmedAt = getCurrentESTDate();
    const confirmUpdate: Partial<Lesson> = {
      isConfirmed: true as any,
      updatedByUserId: currentUserId,
      updatedOn: confirmedAt,
      createdOn: confirmedAt,
    };
    await manager.update(Lesson, { id: newLesson.id }, confirmUpdate);
    newLesson.isConfirmed = true;
    newLesson.createdOn = confirmedAt;
    newLesson.updatedByUserId = currentUserId;
    newLesson.updatedOn = confirmedAt;

    if (newLessonIsPrivate) {
      await ensurePrivateLessonEmailStatuses(
        manager.getRepository(PrivateLessonEmailStatus),
        [newLesson.id],
      );
    }

  }

  /**
   * Update teacher rate from qualification
   * Legacy: teacherRate = $qualification->rate ?? 0 (always set when qualification exists)
   * Uses transaction manager for all DB access when provided (so confirm runs in one transaction).
   */
  async updateTeacherRate(
    lesson: Lesson,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(Lesson)
      : this.lessonRepository;
    const qualRepo = manager
      ? manager.getRepository(Qualification)
      : this.qualificationRepository;
    let lessonWithCourse = lesson;
    if (!lessonWithCourse.course?.programId) {
      const loadedLesson = await repo.findOne({
        where: { id: lesson.id },
        relations: ['course', 'course.program'],
      });
      if (!loadedLesson) {
        return;
      }
      lessonWithCourse = loadedLesson;
    }

    if (!lessonWithCourse.course?.programId) {
      return;
    }

    const qualification = await qualRepo.findOne({
      where: {
        teacherId: lesson.teacherId ?? lessonWithCourse.teacherId,
        programId: lessonWithCourse.course.programId,
        isDeleted: false,
      },
    });

    // Legacy parity: when qualification is missing, teacherRate falls back to 0.
    const newRate = qualification?.rate ?? 0;
    lessonWithCourse.teacherRate = newRate;
    await (manager || this.lessonRepository.manager).save(lessonWithCourse);

    if (lesson.id === lessonWithCourse.id) {
      lesson.teacherRate = newRate;
    }
  }

  /**
   * Copy discounts from old lesson to new lesson
   */
  async copyDiscounts(
    oldLessonId: number,
    newLessonId: number,
    manager?: EntityManager,
  ): Promise<void> {
    return this.discountHelper.copyDiscounts(oldLessonId, newLessonId, manager);
  }

  /**
   * Create GroupLessonEmailStatus records for all students
   */
  async createGroupLessonEmailStatuses(
    lessonId: number,
    courseId: number,
    manager: EntityManager,
  ): Promise<void> {
    return this.groupLessonHelper.createGroupLessonEmailStatuses(
      lessonId,
      courseId,
      manager,
    );
  }

  // update draft lesson date and teacher id to resolve conflict

  async updateDraftLessonDate(lesson: Lesson): Promise<void> {
    await this.lessonRepository.save(lesson);
  }
}
