import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { ChangeTeacherRequestDto } from '../dto/change-teacher-request.dto';
import { Enrolment } from '../entities/enrolment.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { PrivateLessonEmailStatus } from '../../lesson/entities/private-lesson-email-status.entity';
import { PrivateLesson } from '../../lesson/entities/private-lesson.entity';
import { LessonDiscount } from '../../lesson/entities/lesson-discount.entity';
import { LessonPayment } from '../../payment/entities/lesson-payment.entity';
import { PaymentCycleLesson } from '../entities/payment-cycle-lesson.entity';
import { InvoiceItemLesson } from '../../invoice/entities/invoice-item-lesson.entity';
import { BulkRescheduleLesson } from '../../lesson/entities/bulk-reschedule-lesson.entity';
import { formatDateYMD, getCurrentESTDate } from '../../utils/date-utils';

@Injectable()
export class EnrolmentTeacherChangeService {
  /**
   * Injects the database connection used to run the teacher-change transaction.
   */
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Validates the legacy teacher-change request rules before any draft lessons are created.
   */
  private validateTeacherChangeRequest(enrolments: Enrolment[], changesFrom: string): void {
    if (enrolments.length === 0) {
      throw new NotFoundException('No enrolments found for the provided IDs');
    }

    const missingCourse = enrolments.find((enrolment) => !enrolment.courseId || !enrolment.course);
    if (missingCourse) {
      throw new NotFoundException(`Enrolment with ID ${missingCourse.id} not found or has no course`);
    }

    const referenceTeacherId = enrolments[0]?.course?.teacherId;
    const hasMixedTeachers = enrolments.some((enrolment) => enrolment.course?.teacherId !== referenceTeacherId);
    if (hasMixedTeachers) {
      throw new BadRequestException('Choose enrolments with same teacher!');
    }

    const currentDateKey = formatDateYMD(getCurrentESTDate());
    const changesFromDateKey = formatDateYMD(new Date(changesFrom));
    if (currentDateKey > changesFromDateKey) {
      throw new BadRequestException('Effect from cannot be in past date');
    }
  }

  /**
   * Groups enrolments by course so we only clone each course's lesson stream once.
   */
  private groupEnrolmentsByCourse(enrolments: Enrolment[]): Map<number, Enrolment[]> {
    const enrolmentsByCourse = new Map<number, Enrolment[]>();

    for (const enrolment of enrolments) {
      if (!enrolment.courseId) {
        continue;
      }

      if (!enrolmentsByCourse.has(enrolment.courseId)) {
        enrolmentsByCourse.set(enrolment.courseId, []);
      }

      enrolmentsByCourse.get(enrolment.courseId)!.push(enrolment);
    }

    return enrolmentsByCourse;
  }

  /**
   * Loads the enrolments and their course relation so we can validate the teacher selection.
   */
  private async loadEnrolmentsWithCourses(
    enrolmentIds: number[],
    manager: EntityManager,
  ): Promise<Enrolment[]> {
    const enrolmentRepository = manager.getRepository(Enrolment);
    const enrolments = await enrolmentRepository.find({
      where: {
        id: In(enrolmentIds),
        isDeleted: false,
      },
      relations: ['course'],
    });

    if (enrolments.length === 0) {
      throw new NotFoundException('No enrolments found for the provided IDs');
    }

    return enrolments;
  }

  /**
   * Loads the confirmed lessons for a single course that must be cloned to the new teacher.
   */
  private async findConfirmedLessonsForCourse(
    courseId: number,
    changesFrom: string,
    manager: EntityManager,
  ): Promise<Lesson[]> {
    const lessonRepository = manager.getRepository(Lesson);
    const changesFromDateKey = formatDateYMD(new Date(changesFrom));

    return lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.course', 'course')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status != :canceled', { canceled: LessonStatusEnum.CANCELED })
      .andWhere('DATE(lesson.date) >= :changesFrom', { changesFrom: changesFromDateKey })
      .orderBy('lesson.date', 'ASC')
      .getMany();
  }

  /**
   * Builds a new draft lesson from the confirmed legacy lesson row.
   */
  private cloneLessonForTeacherChange(
    lesson: Lesson,
    teacherId: number,
    userId: number,
  ): Partial<Lesson> {
    return {
      courseId: lesson.courseId,
      teacherId,
      classroomId: lesson.classroomId,
      colorCode: lesson.colorCode,
      date: new Date(lesson.date),
      duration: lesson.duration,
      status: lesson.status,
      isPresent: lesson.isPresent,
      isDeleted: false,
      isConfirmed: false,
      type: lesson.type,
      isExploded: lesson.isExploded,
      isOnline: lesson.isOnline,
      createdByUserId: userId,
      updatedByUserId: userId,
      programRate: lesson.programRate,
      teacherRate: lesson.teacherRate,
      teacherRateOld: lesson.teacherRateOld,
      tax: lesson.tax,
      paidStatus: lesson.paidStatus,
      total: lesson.total,
      dueDate: lesson.dueDate ? new Date(lesson.dueDate) : new Date(lesson.date),
      originalDate: lesson.originalDate ? new Date(lesson.originalDate) : undefined,
    };
  }

  /**
   * Copies legacy lesson-discount rows onto the replacement draft lesson.
   * This matches the old queued teacher-change job so the review screen sees
   * the same discounted price as the confirmed lesson.
   */
  private async copyLessonDiscounts(
    sourceLessonId: number,
    targetLessonId: number,
    manager: EntityManager,
  ): Promise<void> {
    const lessonDiscountRepository = manager.getRepository(LessonDiscount);
    const discounts = await lessonDiscountRepository.find({
      where: { lessonId: sourceLessonId },
    });

    if (discounts.length === 0) {
      return;
    }

    const copiedDiscounts = discounts.map((discount) =>
      lessonDiscountRepository.create({
        lessonId: targetLessonId,
        value: discount.value,
        enrolmentId: discount.enrolmentId,
        valueType: discount.valueType,
        type: discount.type,
      }),
    );

    await lessonDiscountRepository.save(copiedDiscounts);
  }

  /**
   * Creates replacement draft lessons for the selected enrolments using the legacy clone-first behaviour.
   */
  async changeTeacherForEnrolments(
    locationId: number,
    request: ChangeTeacherRequestDto,
    userId: number,
  ): Promise<{ success: boolean; message: string }> {
    void locationId;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;
      const enrolments = await this.loadEnrolmentsWithCourses(request.enrolmentIds, manager);
      this.validateTeacherChangeRequest(enrolments, request.changesFrom);

      const enrolmentsByCourse = this.groupEnrolmentsByCourse(enrolments);

      // Remove existing unconfirmed drafts for the affected courses before cloning the confirmed lessons.
      await this.deleteDraftLessonsForCourses(Array.from(enrolmentsByCourse.keys()), manager);

      const lessonRepository = manager.getRepository(Lesson);

      for (const [, courseEnrolments] of enrolmentsByCourse.entries()) {
        const firstEnrolment = courseEnrolments[0];
        const course = firstEnrolment.course;
        if (!course || course.isDeleted) {
          continue;
        }

        const confirmedLessons = await this.findConfirmedLessonsForCourse(
          course.id,
          request.changesFrom,
          manager,
        );

        if (confirmedLessons.length === 0) {
          continue;
        }

        const draftLessons = confirmedLessons.map((lesson) =>
          lessonRepository.create(this.cloneLessonForTeacherChange(lesson, request.teacherId, userId)),
        );

        const savedDraftLessons = await lessonRepository.save(draftLessons);
        const savedDraftLessonArray = Array.isArray(savedDraftLessons)
          ? savedDraftLessons
          : [savedDraftLessons];

        for (const [index, confirmedLesson] of confirmedLessons.entries()) {
          const savedDraftLesson = savedDraftLessonArray[index];
          if (!savedDraftLesson?.id) {
            continue;
          }

          await this.copyLessonDiscounts(confirmedLesson.id, savedDraftLesson.id, manager);
        }
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Draft lessons created successfully',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new Error(`Failed to change teacher for enrolments: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Removes old unconfirmed draft lessons and their dependent rows before the new teacher-change drafts are created.
   */
  private async deleteDraftLessonsForCourses(
    courseIds: number[],
    manager: EntityManager,
  ): Promise<void> {
    if (courseIds.length === 0) {
      return;
    }

    const draftLessons = await manager.getRepository(Lesson).find({
      where: {
        courseId: In(courseIds),
        isDeleted: false,
        isConfirmed: false,
      },
      select: ['id'],
    });

    if (draftLessons.length === 0) {
      return;
    }

    const draftLessonIds = draftLessons.map((lesson) => lesson.id);

    await manager.getRepository(PrivateLessonEmailStatus).delete({
      lessonId: In(draftLessonIds),
    });
    await manager.getRepository(PrivateLesson).delete({
      lessonId: In(draftLessonIds),
    });
    await manager.getRepository(LessonDiscount).delete({
      lessonId: In(draftLessonIds),
    });
    await manager.getRepository(LessonPayment).delete({
      lessonId: In(draftLessonIds),
    });
    await manager.getRepository(PaymentCycleLesson).delete({
      lessonId: In(draftLessonIds),
    });
    await manager.getRepository(BulkRescheduleLesson).delete({
      lessonId: In(draftLessonIds),
    });
    await manager.getRepository(InvoiceItemLesson).delete({
      lessonId: In(draftLessonIds),
    });

    await manager.getRepository(Lesson).delete({
      id: In(draftLessonIds),
    });
  }
}
