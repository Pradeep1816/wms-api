import { ensurePrivateLessonEmailStatuses } from '../../lesson/helpers/ensure-lesson-email-statuses';
import { PrivateLessonEmailStatus } from '../../lesson/entities/private-lesson-email-status.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { Course } from '../../course/entities/course.entity';
import { CourseProgramRate } from '../../course/entities/course-program-rate.entity';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { CustomerDiscount } from '../../customer/entities/customer-discount.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { AutoRenewal } from '../../enrolment/entities/auto-renewal.entity';
import { AutoRenewalLessons } from '../../enrolment/entities/auto-renewal-lessons.entity';
import { AutoRenewalPaymentCycle } from '../../enrolment/entities/auto-renewal-payment-cycle.entity';
import { EnrolmentDiscount } from '../../enrolment/entities/enrolment-discount.entity';
import { PaymentCycleLesson } from '../../enrolment/entities/payment-cycle-lesson.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonDiscount } from '../../lesson/entities/lesson-discount.entity';
import { LessonHierarchy } from '../../lesson/entities/lesson-hierarchy.entity';
import { PrivateLesson } from '../../lesson/entities/private-lesson.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { PaymentCycle } from '../../payment/entities/payment-cycle.entity';
import { PaymentFrequency } from '../../payment/entities/payment-frequency.entity';
import { Program } from '../../program/entities/program.entity';
import { Qualification } from '../../qualification/entities/qualification.entity';
import { Student } from '../../student/entities/student.entity';
import { getCurrentESTDate } from '../../utils/date-utils';
import { RoundingUtils } from '../../utils/rounding.utils';

export interface EnrolmentAutoRenewalCandidate {
  courseId: number;
  enrolmentId: number;
}

@Injectable()
export class EnrolmentAutoRenewalCronRepository {
  constructor(private readonly dataSource: DataSource) {}

  private resolveRepository<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    manager?: EntityManager,
  ): Repository<T> {
    return manager ? manager.getRepository(entity) : this.dataSource.getRepository(entity);
  }

  async getTargetEnrolments(
    fromDate: string,
    toDate: string,
  ): Promise<EnrolmentAutoRenewalCandidate[]> {
    const courseRepository = this.resolveRepository(Course);
    const enrolmentSubquery = courseRepository
      .createQueryBuilder()
      .subQuery()
      .select('MIN(enrolmentMatch.id)')
      .from('enrolment', 'enrolmentMatch')
      .where('enrolmentMatch.courseId = course.id')
      .andWhere('enrolmentMatch.isDeleted = :enrolmentIsDeleted')
      .andWhere('enrolmentMatch.isConfirmed = :enrolmentIsConfirmed')
      .andWhere('enrolmentMatch.isAutoRenew = :isAutoRenew')
      .getQuery();

    const rows = await courseRepository
      .createQueryBuilder('course')
      .innerJoin(
        'course.enrolments',
        'enrolment',
        `enrolment.id = ${enrolmentSubquery}`,
        {
          enrolmentIsDeleted: false,
          enrolmentIsConfirmed: true,
          isAutoRenew: true,
        },
      )
      .innerJoin('course.program', 'program')
      .select([
        'course.id AS courseId',
        'enrolment.id AS enrolmentId',
      ])
      .where('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('course.isConfirmed = :courseIsConfirmed', { courseIsConfirmed: true })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('program.type = :programType', { programType: Program.TYPE_PRIVATE_PROGRAM })
      .andWhere('DATE(course.endDate) >= :fromDate', { fromDate })
      .andWhere('DATE(course.endDate) <= :toDate', { toDate })
      .orderBy('course.id', 'ASC')
      .getRawMany<{ courseId: string | number; enrolmentId: string | number }>();

    return rows
      .map((row) => ({
        courseId: Number(row.courseId),
        enrolmentId: Number(row.enrolmentId),
      }))
      .filter(
        (row) =>
          Number.isFinite(row.courseId) && Number.isFinite(row.enrolmentId),
      );
  }

  async getEnrolmentForLegacyAutoRenewal(
    enrolmentId: number,
    manager?: EntityManager,
  ): Promise<Enrolment | null> {
    return this.resolveRepository(Enrolment, manager)
      .createQueryBuilder('enrolment')
      .innerJoinAndSelect('enrolment.course', 'course')
      .innerJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('enrolment.paymentFrequency', 'paymentFrequency')
      .where('enrolment.id = :enrolmentId', { enrolmentId })
      .andWhere('enrolment.isDeleted = :enrolmentIsDeleted', { enrolmentIsDeleted: false })
      .andWhere('enrolment.isConfirmed = :enrolmentIsConfirmed', { enrolmentIsConfirmed: true })
      .andWhere('enrolment.isAutoRenew = :isAutoRenew', { isAutoRenew: true })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('course.isConfirmed = :courseIsConfirmed', { courseIsConfirmed: true })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('program.type = :programType', { programType: Program.TYPE_PRIVATE_PROGRAM })
      .getOne();
  }

  async getLegacyExecutionEnrolmentForCourse(
    courseId: number,
    manager?: EntityManager,
  ): Promise<Enrolment | null> {
    return this.resolveRepository(Enrolment, manager)
      .createQueryBuilder('enrolment')
      .where('enrolment.courseId = :courseId', { courseId })
      .andWhere('enrolment.isDeleted = :enrolmentIsDeleted', { enrolmentIsDeleted: false })
      .getOne();
  }

  async findPaymentFrequencyById(
    id: number,
    manager?: EntityManager,
  ): Promise<PaymentFrequency | null> {
    return this.resolveRepository(PaymentFrequency, manager).findOne({
      where: { id },
    });
  }

  async getCourseWithProgramForLegacyAutoRenewal(
    courseId: number,
    manager?: EntityManager,
  ): Promise<Course | null> {
    return this.resolveRepository(Course, manager).findOne({
      where: { id: courseId },
      relations: ['program'],
    });
  }

  async getLastPaymentCycleForLegacyAutoRenewal(
    enrolmentId: number,
    manager?: EntityManager,
  ): Promise<PaymentCycle | null> {
    return this.resolveRepository(PaymentCycle, manager).findOne({
      where: {
        enrolmentId,
        isDeleted: 0,
      },
      order: {
        endDate: 'DESC',
      },
    });
  }

  async getFirstLessonForLegacyAutoRenewal(
    courseId: number,
    manager?: EntityManager,
  ): Promise<Lesson | null> {
    return this.resolveRepository(Lesson, manager)
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [
          LessonStatusEnum.RESCHEDULED,
          LessonStatusEnum.SCHEDULED,
          LessonStatusEnum.UNSCHEDULED,
        ],
      })
      .orderBy('lesson.date', 'ASC')
      .getOne();
  }

  async getRecentCourseScheduleForLegacyAutoRenewal(
    courseId: number,
    manager?: EntityManager,
  ): Promise<CourseSchedule | null> {
    return this.resolveRepository(CourseSchedule, manager).findOne({
      where: {
        courseId,
        isRecent: true,
      },
      order: { startDate: 'DESC' },
    });
  }

  async getTeacherQualificationRateForLegacyAutoRenewal(
    teacherId: number,
    programId: number,
    manager?: EntityManager,
  ): Promise<number> {
    const qualification = await this.resolveRepository(Qualification, manager).findOne({
      where: {
        teacherId,
        programId,
      },
    });

    return Number(qualification?.rate ?? 0);
  }

  /** Every rate period already recorded for a course. */
  async findCourseProgramRatesForLegacyAutoRenewal(
    courseId: number,
    manager?: EntityManager,
  ): Promise<CourseProgramRate[]> {
    return this.resolveRepository(CourseProgramRate, manager).find({
      where: { courseId },
    });
  }

  async createCourseProgramRateForLegacyAutoRenewal(
    courseId: number,
    startDate: Date,
    endDate: Date,
    programRate: number,
    manager?: EntityManager,
  ): Promise<CourseProgramRate> {
    const repository = this.resolveRepository(CourseProgramRate, manager);
    return repository.save(
      repository.create({
        courseId,
        startDate: this.formatDateForQuery(startDate) as unknown as Date,
        endDate: this.formatDateForQuery(endDate) as unknown as Date,
        programRate,
        applyFullDiscount: false,
      }),
    );
  }

  async createAutoRenewalForLegacyAutoRenewal(
    enrolmentId: number,
    paymentFrequency: number,
    enrolmentEndDateCurrent: Date,
    enrolmentEndDateNew: Date,
    lastPaymentCycleStartDate: Date,
    lastPaymentCycleEndDate: Date,
    userId: number,
    manager?: EntityManager,
  ): Promise<AutoRenewal> {
    const repository = this.resolveRepository(AutoRenewal, manager);
    const now = getCurrentESTDate();
    return repository.save(
      repository.create({
        enrolmentId,
        paymentFrequency,
        enrolmentEndDateCurrent,
        enrolmentEndDateNew,
        lastPaymentCycleStartDate,
        lastPaymentCycleEndDate,
        createdOn: now,
        createdByUserId: userId,
      }),
    );
  }

  async createLessonForLegacyAutoRenewal(
    courseId: number,
    enrolmentId: number,
    studentId: number,
    teacherId: number,
    date: Date,
    duration: string,
    programRate: number,
    teacherRate: number,
    isOnline: number,
    userId: number,
    manager?: EntityManager,
  ): Promise<Lesson> {
    const lessonRepository = this.resolveRepository(Lesson, manager);
    const now = getCurrentESTDate();

    const lesson = await lessonRepository.save(
      lessonRepository.create({
        courseId,
        teacherId,
        date,
        duration,
        status: 2,
        isPresent: true,
        isDeleted: false,
        isConfirmed: true,
        type: 1,
        isExploded: 0,
        isOnline: isOnline === 1,
        createdByUserId: userId,
        updatedByUserId: userId,
        programRate,
        teacherRate,
        teacherRateOld: 0,
        tax: 0,
        paidStatus: 0,
        total: 0,
        dueDate: date,
        originalDate: date,
        createdOn: now,
        updatedOn: now,
      }),
    );

    await this.makeLessonAsRootForLegacyAutoRenewal(lesson.id, manager);
    await this.applyLessonDiscountsForLegacyAutoRenewal(
      lesson.id,
      enrolmentId,
      studentId,
      manager,
    );

    return lesson;
  }

  async createAutoRenewalLessonForLegacyAutoRenewal(
    autoRenewalId: number,
    lessonId: number,
    userId: number,
    manager?: EntityManager,
  ): Promise<AutoRenewalLessons> {
    const repository = this.resolveRepository(AutoRenewalLessons, manager);
    return repository.save(
      repository.create({
        autoRenewalId,
        lessonId,
        createdByUserId: userId,
      }),
    );
  }

  async createPrivateLessonsForLegacyAutoRenewal(
    lessons: Lesson[],
    manager?: EntityManager,
  ): Promise<void> {
    if (lessons.length === 0) {
      return;
    }

    const privateLessonRepository = this.resolveRepository(PrivateLesson, manager);
    const lessonIds = lessons.map((lesson) => lesson.id);
    await ensurePrivateLessonEmailStatuses(
      (manager ?? this.dataSource.manager).getRepository(PrivateLessonEmailStatus),
      lessonIds,
    );
    const existingPrivateLessons = await privateLessonRepository.find({
      where: lessonIds.map((lessonId) => ({ lessonId })),
    });
    const existingLessonIds = new Set(existingPrivateLessons.map((item) => item.lessonId));
    const lessonRepository = this.resolveRepository(Lesson, manager);

    const inserts: Array<{
      lessonId: number;
      expiryDate: Date;
      total: number;
      balance: number;
      dueDate: string;
    }> = [];

    for (const lesson of lessons) {
      if (existingLessonIds.has(lesson.id)) {
        continue;
      }

      const lessonDate = new Date(lesson.date);
      const expiryDate = new Date(lessonDate);
      expiryDate.setUTCDate(expiryDate.getUTCDate() + 90);
      const lessonForNetPrice = await lessonRepository.findOne({
        where: { id: lesson.id },
        relations: ['discounts'],
      });
      const total = RoundingUtils.roundDecimal(
        Number((lessonForNetPrice ?? lesson).getNetPrice()),
        2,
      );

      inserts.push({
        lessonId: lesson.id,
        expiryDate,
        total,
        balance: total,
        dueDate: this.formatDateForQuery(new Date(lesson.dueDate ?? lesson.date)),
      });
    }

    if (inserts.length > 0) {
      await privateLessonRepository
        .createQueryBuilder()
        .insert()
        .into(PrivateLesson)
        .values(inserts)
        .execute();
    }
  }

  async updateCourseScheduleEndDateForLegacyAutoRenewal(
    courseScheduleId: number,
    endDate: Date,
    manager?: EntityManager,
  ): Promise<void> {
    await this.resolveRepository(CourseSchedule, manager).update(
      { id: courseScheduleId },
      { endDate: this.formatDateTime(this.formatDateForQuery(endDate)) as unknown as Date },
    );
  }

  async updateCourseScheduleIsRecentForLegacyAutoRenewal(
    courseScheduleId: number,
    isRecent: boolean,
    manager?: EntityManager,
  ): Promise<void> {
    await this.resolveRepository(CourseSchedule, manager).update(
      { id: courseScheduleId },
      { isRecent },
    );
  }

  async createCourseScheduleForLegacyAutoRenewal(
    courseId: number,
    lastLessonGenerated: Lesson,
    renewalStartDate: Date,
    endDate: Date,
    manager?: EntityManager,
  ): Promise<CourseSchedule> {
    const repository = this.resolveRepository(CourseSchedule, manager);
    const previousSchedule = await repository.findOne({
      where: { courseId },
      order: { endDate: 'DESC' },
    });
    const lessonDate = new Date(lastLessonGenerated.date);
    const previousScheduleEndDate = previousSchedule
      ? this.formatDateForQuery(new Date(previousSchedule.endDate))
      : null;
    const startDate = previousSchedule
      ? this.addDaysToDateString(previousScheduleEndDate!, 1)
      : renewalStartDate;
    const normalizedStartDate =
      startDate instanceof Date
        ? this.formatDateTime(this.formatDateForQuery(startDate))
        : this.formatDateTime(startDate);

    const fromTime = [
      String(lessonDate.getUTCHours()).padStart(2, '0'),
      String(lessonDate.getUTCMinutes()).padStart(2, '0'),
      String(lessonDate.getUTCSeconds()).padStart(2, '0'),
    ].join(':');
    const day = lessonDate.getUTCDay() === 0 ? 7 : lessonDate.getUTCDay();

    return repository.save(
      repository.create({
        courseId,
        fromTime,
        duration: lastLessonGenerated.duration,
        day,
        startDate: normalizedStartDate as unknown as Date,
        endDate: this.formatDateTimeValue(endDate) as unknown as Date,
        teacherId: lastLessonGenerated.teacherId,
        isRecent: true,
      }),
    );
  }

  async updatePaymentCycleEndDateForLegacyAutoRenewal(
    paymentCycleId: number,
    endDate: Date,
    manager?: EntityManager,
  ): Promise<void> {
    await this.resolveRepository(PaymentCycle, manager).update(
      { id: paymentCycleId },
      { endDate },
    );
  }

  async createPaymentCycleForLegacyAutoRenewal(
    enrolmentId: number,
    courseId: number,
    startDate: Date,
    endDate: Date,
    manager?: EntityManager,
  ): Promise<PaymentCycle> {
    const repository = this.resolveRepository(PaymentCycle, manager);
    const paymentCycle = await repository.save(
      repository.create({
        enrolmentId,
        startDate: this.formatDateForQuery(startDate) as unknown as Date,
        endDate: this.formatDateForQuery(endDate) as unknown as Date,
        isDeleted: 0,
        isPreferredPaymentEnabled: false,
      }),
    );
    await this.linkLessonsForLegacyAutoRenewalPaymentCycle(
      paymentCycle.id,
      courseId,
      startDate,
      endDate,
      manager,
    );
    return paymentCycle;
  }

  async createAutoRenewalPaymentCycleForLegacyAutoRenewal(
    autoRenewalId: number,
    paymentCycleId: number,
    userId: number,
    manager?: EntityManager,
  ): Promise<AutoRenewalPaymentCycle> {
    const repository = this.resolveRepository(AutoRenewalPaymentCycle, manager);
    return repository.save(
      repository.create({
        autoRenewalId,
        paymentCycleId,
        createdByUserId: userId,
      }),
    );
  }

  async createPaymentCycleLessonForLegacyAutoRenewal(
    paymentCycleId: number,
    lessonId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.resolveRepository(PaymentCycleLesson, manager);
    const existing = await repository.findOne({
      where: {
        paymentCycleId,
        lessonId,
      },
    });

    if (existing) {
      if (existing.isDeleted === 0) {
        return;
      }

      existing.isDeleted = 0;
      await repository.save(existing);
      return;
    }

    await repository.save(
      repository.create({
        paymentCycleId,
        lessonId,
        isDeleted: 0,
      }),
    );
  }

  async getConfirmedLessonsForLegacyAutoRenewalEnrolment(
    enrolmentId: number,
    manager?: EntityManager,
  ): Promise<
    Array<{
      lesson: Lesson;
      paymentCycleId: number | null;
      paymentCycleStartDate: Date | string | null;
    }>
  > {
    const lessonRepository = this.resolveRepository(Lesson, manager);
    const rows = await lessonRepository
      .createQueryBuilder('lesson')
      .leftJoin(
        PaymentCycleLesson,
        'pcl',
        'pcl.lessonId = lesson.id AND pcl.isDeleted = 0',
      )
      .leftJoin(PaymentCycle, 'pc', 'pc.id = pcl.paymentCycleId AND pc.isDeleted = 0')
      .leftJoin(Enrolment, 'enrolment', 'enrolment.courseId = lesson.courseId')
      .select([
        'lesson.id AS lesson_id',
        'lesson.courseId AS lesson_courseId',
        'lesson.teacherId AS lesson_teacherId',
        'lesson.classroomId AS lesson_classroomId',
        'lesson.date AS lesson_date',
        'lesson.duration AS lesson_duration',
        'lesson.status AS lesson_status',
        'lesson.isPresent AS lesson_isPresent',
        'lesson.isDeleted AS lesson_isDeleted',
        'lesson.isConfirmed AS lesson_isConfirmed',
        'lesson.type AS lesson_type',
        'lesson.isExploded AS lesson_isExploded',
        'lesson.is_online AS lesson_isOnline',
        'lesson.createdByUserId AS lesson_createdByUserId',
        'lesson.updatedByUserId AS lesson_updatedByUserId',
        'lesson.programRate AS lesson_programRate',
        'lesson.teacherRate AS lesson_teacherRate',
        'lesson.teacherRateOld AS lesson_teacherRateOld',
        'lesson.tax AS lesson_tax',
        'lesson.paidStatus AS lesson_paidStatus',
        'lesson.total AS lesson_total',
        'lesson.dueDate AS lesson_dueDate',
        'lesson.originalDate AS lesson_originalDate',
        'pc.id AS paymentCycleId',
        'pc.startDate AS paymentCycleStartDate',
      ])
      .where('enrolment.id = :enrolmentId', { enrolmentId })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.status != :canceledStatus', { canceledStatus: LessonStatusEnum.CANCELED })
      .getRawMany();

    return rows.map((row) => {
      const lessonData: Record<string, unknown> = {
        id: Number(row.lesson_id),
        courseId: Number(row.lesson_courseId),
        teacherId: Number(row.lesson_teacherId),
        date: row.lesson_date,
        duration: row.lesson_duration,
        status: Number(row.lesson_status),
        isPresent: Boolean(row.lesson_isPresent),
        isDeleted: Boolean(row.lesson_isDeleted),
        isConfirmed: Boolean(row.lesson_isConfirmed),
        type: Number(row.lesson_type),
        isExploded: Number(row.lesson_isExploded),
        isOnline: Boolean(row.lesson_isOnline),
        createdByUserId: Number(row.lesson_createdByUserId),
        updatedByUserId: Number(row.lesson_updatedByUserId),
        programRate: Number(row.lesson_programRate),
        teacherRate: Number(row.lesson_teacherRate),
        teacherRateOld: Number(row.lesson_teacherRateOld),
        tax: Number(row.lesson_tax),
        paidStatus: Number(row.lesson_paidStatus),
        total: Number(row.lesson_total),
        dueDate: row.lesson_dueDate,
        originalDate: row.lesson_originalDate,
      };
      if (row.lesson_classroomId !== null && row.lesson_classroomId !== undefined) {
        lessonData.classroomId = Number(row.lesson_classroomId);
      }
      const lesson = Object.assign(new Lesson(), lessonData);

      return {
        lesson,
        paymentCycleId: row.paymentCycleId ? Number(row.paymentCycleId) : null,
        paymentCycleStartDate: row.paymentCycleStartDate || null,
      };
    });
  }

  async updateLessonDueDateForLegacyAutoRenewal(
    lessonId: number,
    dueDate: Date,
    manager?: EntityManager,
  ): Promise<void> {
    await this.resolveRepository(Lesson, manager).update(
      { id: lessonId },
      { dueDate },
    );
  }

  async linkLessonsForLegacyAutoRenewalPaymentCycle(
    paymentCycleId: number,
    courseId: number,
    startDate: Date,
    endDate: Date,
    manager?: EntityManager,
  ): Promise<void> {
    const lessonRepository = this.resolveRepository(Lesson, manager);
    const startBoundary = `${this.formatDateForQuery(startDate)} 00:00:00`;
    const endBoundary = `${this.formatDateForQuery(endDate)} 23:59:59`;
    const lessons = await lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.status != :canceledStatus', { canceledStatus: LessonStatusEnum.CANCELED })
      .andWhere('lesson.date >= :startDate', { startDate: startBoundary })
      .andWhere('lesson.date <= :endDate', { endDate: endBoundary })
      .getMany();

    for (const lesson of lessons) {
      await this.createPaymentCycleLessonForLegacyAutoRenewal(
        paymentCycleId,
        lesson.id,
        manager,
      );
    }
  }

  async updateCourseAndEnrolmentDatesFromLessonsForLegacyAutoRenewal(
    courseId: number,
    enrolmentId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const lessonRepository = this.resolveRepository(Lesson, manager);
    const courseRepository = this.resolveRepository(Course, manager);
    const enrolmentRepository = this.resolveRepository(Enrolment, manager);

    const statuses = [
      LessonStatusEnum.RESCHEDULED,
      LessonStatusEnum.SCHEDULED,
      LessonStatusEnum.UNSCHEDULED,
    ];

    const firstLesson = await lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status IN (:...statuses)', { statuses })
      .orderBy('lesson.date', 'ASC')
      .getOne();

    const lastLesson = await lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status IN (:...statuses)', { statuses })
      .orderBy('lesson.date', 'DESC')
      .getOne();

    if (!firstLesson || !lastLesson) {
      return;
    }

    await courseRepository.update(
      { id: courseId },
      {
        startDate: firstLesson.date,
        endDate: lastLesson.date,
      },
    );

    await enrolmentRepository.update(
      { id: enrolmentId },
      {
        endDateTime: lastLesson.date,
      },
    );
  }

  private async makeLessonAsRootForLegacyAutoRenewal(
    lessonId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.resolveRepository(LessonHierarchy, manager);
    const existingRoot = await repository.findOne({
      where: {
        lessonId,
        childLessonId: lessonId,
      },
    });

    if (!existingRoot) {
      await repository
        .createQueryBuilder()
        .insert()
        .into(LessonHierarchy)
        .values({
          lessonId,
          childLessonId: lessonId,
          depth: 0,
        })
        .execute();
    }
  }

  private async applyLessonDiscountsForLegacyAutoRenewal(
    lessonId: number,
    enrolmentId: number,
    studentId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const lessonDiscountRepository = this.resolveRepository(LessonDiscount, manager);
    const enrolmentDiscountRepository = this.resolveRepository(EnrolmentDiscount, manager);
    const studentRepository = this.resolveRepository(Student, manager);
    const customerDiscountRepository = this.resolveRepository(CustomerDiscount, manager);

    const existingDiscounts = await lessonDiscountRepository.find({
      where: { lessonId },
    });
    const existingKeys = new Set(
      existingDiscounts.map((discount) => `${discount.type}-${discount.enrolmentId ?? ''}`),
    );

    const discountInserts: Array<{
      lessonId: number;
      type: number;
      value: number;
      valueType: number;
      enrolmentId: number;
    }> = [];

    const student = await studentRepository.findOne({
      where: { id: studentId },
      relations: ['user'],
    });
    const customerId = student?.user?.id;
    if (customerId) {
      const customerDiscount = await customerDiscountRepository.findOne({
        where: {
          customerId,
          isDeleted: false,
        },
      });
      if (customerDiscount && customerDiscount.value !== null && customerDiscount.value !== undefined) {
        const customerKey = `${LessonDiscount.TYPE_CUSTOMER}-${enrolmentId}`;
        if (!existingKeys.has(customerKey)) {
          discountInserts.push({
            lessonId,
            type: LessonDiscount.TYPE_CUSTOMER,
            value: Number(customerDiscount.value),
            valueType: 1,
            enrolmentId,
          });
          existingKeys.add(customerKey);
        }
      }
    }

    const enrolmentDiscounts = await enrolmentDiscountRepository.find({
      where: { enrolmentId },
    });
    for (const discount of enrolmentDiscounts) {
      if (!discount.discount) {
        continue;
      }

      const lessonDiscountType = this.mapEnrolmentDiscountTypeToLessonDiscountType(
        discount.type,
      );
      const discountKey = `${lessonDiscountType}-${enrolmentId}`;
      if (existingKeys.has(discountKey)) {
        continue;
      }

      let discountValue = Number(discount.discount);
      if (lessonDiscountType === LessonDiscount.TYPE_MULTIPLE_ENROLMENT) {
        discountValue /= 4;
      }

      const discountValueType =
        discount.discountType === EnrolmentDiscount.VALUE_TYPE_DOLLAR ? 0 : 1;

      discountInserts.push({
        lessonId,
        type: lessonDiscountType,
        value: discountValue,
        valueType: discountValueType,
        enrolmentId,
      });
      existingKeys.add(discountKey);
    }

    if (discountInserts.length > 0) {
      await lessonDiscountRepository
        .createQueryBuilder()
        .insert()
        .into(LessonDiscount)
        .values(discountInserts)
        .execute();
    }
  }

  private mapEnrolmentDiscountTypeToLessonDiscountType(
    enrolmentDiscountType: number,
  ): number {
    if (enrolmentDiscountType === EnrolmentDiscount.TYPE_PAYMENT_FREQUENCY) {
      return LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY;
    }
    if (enrolmentDiscountType === EnrolmentDiscount.TYPE_MULTIPLE_ENROLMENT) {
      return LessonDiscount.TYPE_MULTIPLE_ENROLMENT;
    }
    return enrolmentDiscountType;
  }

  private formatDateForQuery(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDateTime(value: string): string {
    return `${value} 00:00:00`;
  }

  private formatDateTimeValue(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  private addDaysToDateString(dateString: string, days: number): string {
    const date = new Date(`${dateString}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return this.formatDateForQuery(date);
  }
}
