/**
 * Transactional persistence for building permanent schedule change drafts.
 * This adapter owns TypeORM details and delegates existing enrolment lesson
 * provisioning behavior without duplicating it in the PSC business service.
 */
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThan, Not, Repository } from 'typeorm';
import { Course } from '../../../course/entities/course.entity';
import { Invoice } from '../../../invoice/entities/invoice.entity';
import { Lesson } from '../../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../../lesson/enums/lesson-status';
import {
  formatUtcTime,
  getLegacyPscWeekday,
  parseDurationToSeconds,
} from '../../../utils/date-utils';
import { Enrolment } from '../../entities/enrolment.entity';
import { EnrolmentScheduleService } from '../../services/enrolment-schedule.service';
import { getPermanentScheduleEligibleLessonWhere } from '../../permanent-schedule-change/domain/permanent-schedule-eligibility.policy';
import { PermanentScheduleChangeQueryRepository } from './permanent-schedule-change-query.repository';
import type { PermanentScheduleMonthConstraintReader } from '../../validators/permanent-schedule-change/permanent-schedule-change.validator';

type DraftLessonProvisioning = Pick<
  EnrolmentScheduleService,
  | 'applyDiscountsToLessons'
  | 'createPrivateLessons'
  | 'makeLessonsAsRoot'
  | 'updateStudentAndUserStatus'
>;

export interface PermanentScheduleChangeDraftPersistence extends PermanentScheduleMonthConstraintReader {
  /** Lock the owning course to serialize competing PSC draft replacements. */
  lockCourse(courseId: number): Promise<void>;
  /** Remove any prior unconfirmed draft lessons for the course. */
  deleteUnconfirmedLessons(courseId: number): Promise<void>;
  /** Find eligible lessons already carrying the rescheduled status. */
  findRescheduledLessons(courseId: number, boundary: Date): Promise<Lesson[]>;
  /** Find confirmed regular lessons affected from the selected boundary. */
  findEligibleLessons(courseId: number, boundary: Date): Promise<Lesson[]>;
  /** Find the latest confirmed lesson before the selected boundary. */
  findLastLessonBefore(
    courseId: number,
    boundary: Date,
  ): Promise<Lesson | null>;
  /** Create an in-memory lesson entity using the transaction repository. */
  createLesson(values: Partial<Lesson>): Lesson;
  /** Return affected lesson IDs that belong to active invoices. */
  findInvoicedLessonIds(lessonIds: number[]): Promise<Set<number>>;
  /** Persist the generated replacement lessons. */
  saveLessons(lessons: Lesson[]): Promise<Lesson[]>;
  /** Make a lesson's persisted original date point to its current date. */
  updateOriginalDate(lesson: Lesson): Promise<void>;
  /** Resolve an available classroom for the new teacher and lesson slot. */
  resolveClassroom(
    teacherId: number,
    locationId: number,
    lessonDate: Date,
    duration: string,
  ): Promise<number | null>;
  /** Establish each generated lesson as the root of its hierarchy. */
  makeLessonsAsRoot(lessons: Lesson[]): Promise<void>;
  /** Apply enrolment discounts to the generated lessons. */
  applyDiscounts(
    enrolment: Enrolment,
    lessons: Lesson[],
    loggedUserId: number,
  ): Promise<void>;
  /** Create private-lesson records for the generated lessons. */
  createPrivateLessons(lessons: Lesson[], enrolment: Enrolment): Promise<void>;
}

/** Provides the transaction-scoped persistence used to replace a PSC draft. */
@Injectable()
export class PermanentScheduleChangeDraftRepository {
  /** Inject TypeORM access and reusable enrolment lesson-provisioning behavior. */
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    private readonly queryRepository: PermanentScheduleChangeQueryRepository,
    @Inject(EnrolmentScheduleService)
    private readonly lessonProvisioning: DraftLessonProvisioning,
  ) {}

  /** Run a PSC draft operation against one transaction-scoped adapter. */
  async transaction<T>(
    work: (persistence: PermanentScheduleChangeDraftPersistence) => Promise<T>,
  ): Promise<T> {
    return this.lessonRepository.manager.transaction((manager) =>
      work(this.createPersistence(manager)),
    );
  }

  /** Refresh student and user status after the PSC transaction succeeds. */
  updateStudentAndUserStatus(enrolment: Enrolment): Promise<void> {
    return this.lessonProvisioning.updateStudentAndUserStatus(enrolment);
  }

  /** Build the persistence contract backed by the supplied entity manager. */
  private createPersistence(
    manager: EntityManager,
  ): PermanentScheduleChangeDraftPersistence {
    const lessonRepository = manager.getRepository(Lesson);

    return {
      getMonthConstraintCounts: (courseId, boundary) =>
        this.queryRepository.getMonthConstraintCounts(
          courseId,
          boundary,
          manager,
        ),
      lockCourse: async (courseId) => {
        await manager
          .getRepository(Course)
          .createQueryBuilder('course')
          .setLock('pessimistic_write')
          .where('course.id = :courseId', { courseId })
          .getOneOrFail();
      },
      deleteUnconfirmedLessons: async (courseId) => {
        await lessonRepository.delete({ courseId, isConfirmed: false });
      },
      findRescheduledLessons: (courseId, boundary) =>
        lessonRepository.find({
          where: {
            ...getPermanentScheduleEligibleLessonWhere(courseId, boundary),
            status: LessonStatusEnum.RESCHEDULED,
          },
          order: { date: 'ASC' },
        }),
      findEligibleLessons: (courseId, boundary) =>
        lessonRepository.find({
          where: getPermanentScheduleEligibleLessonWhere(courseId, boundary),
          order: { date: 'ASC' },
        }),
      findLastLessonBefore: (courseId, boundary) =>
        lessonRepository.findOne({
          where: {
            courseId,
            isDeleted: false,
            isConfirmed: true,
            status: Not(LessonStatusEnum.CANCELED),
            date: LessThan(boundary),
          },
          order: { date: 'DESC' },
        }),
      createLesson: (values) => lessonRepository.create(values),
      findInvoicedLessonIds: async (lessonIds) => {
        if (lessonIds.length === 0) return new Set<number>();
        const rows = await lessonRepository
          .createQueryBuilder('lesson')
          .innerJoin('lesson.invoiceItemLessons', 'iil')
          .innerJoin('iil.invoiceLineItem', 'ili')
          .innerJoin('ili.invoice', 'inv')
          .where('lesson.id IN (:...lessonIds)', { lessonIds })
          .andWhere('ili.isDeleted = :iliIsDeleted', { iliIsDeleted: false })
          .andWhere('inv.isDeleted = :invIsDeleted', { invIsDeleted: false })
          .andWhere('inv.type = :invType', { invType: Invoice.TYPE_INVOICE })
          .select('DISTINCT lesson.id', 'id')
          .getRawMany<{ id: string | number }>();
        return new Set(rows.map(({ id }) => Number(id)));
      },
      saveLessons: (lessons) => lessonRepository.save(lessons),
      updateOriginalDate: async (lesson) => {
        await lessonRepository.update(lesson.id, { originalDate: lesson.date });
      },
      resolveClassroom: (teacherId, locationId, lessonDate, duration) =>
        this.resolveClassroom(
          manager,
          teacherId,
          locationId,
          lessonDate,
          duration,
        ),
      makeLessonsAsRoot: (lessons) =>
        this.lessonProvisioning.makeLessonsAsRoot(lessons, manager),
      applyDiscounts: (enrolment, lessons, loggedUserId) =>
        this.lessonProvisioning.applyDiscountsToLessons(
          enrolment,
          lessons,
          loggedUserId,
          manager,
        ),
      createPrivateLessons: (lessons, enrolment) =>
        this.lessonProvisioning.createPrivateLessons(
          lessons,
          enrolment,
          manager,
        ),
    };
  }

  /**
   * Resolve the teacher's available classroom for the exact UTC lesson period,
   * excluding classrooms unavailable on the lesson date.
   */
  private async resolveClassroom(
    manager: EntityManager,
    teacherId: number,
    locationId: number,
    lessonDate: Date,
    duration: string,
  ): Promise<number | null> {
    const lessonDateKey = lessonDate.toISOString().slice(0, 10);
    const day = getLegacyPscWeekday(lessonDate);
    const startTime = formatUtcTime(lessonDate);
    const endTime = formatUtcTime(
      new Date(lessonDate.getTime() + parseDurationToSeconds(duration) * 1000),
    );
    const teacherLocation = await manager
      .createQueryBuilder()
      .select('ul.id', 'id')
      .from('user_location', 'ul')
      .where('ul.user_id = :teacherId', { teacherId })
      .andWhere('ul.location_id = :locationId', { locationId })
      .getRawOne<{ id?: number | string }>();

    if (!teacherLocation?.id) return null;

    const availability = await manager
      .createQueryBuilder()
      .select('ta.id', 'id')
      .addSelect('tr.classroomId', 'classroomId')
      .from('teacher_availability_day', 'ta')
      .leftJoin('teacher_room', 'tr', 'tr.teacherAvailabilityId = ta.id')
      .where('ta.teacher_location_id = :teacherLocationId', {
        teacherLocationId: Number(teacherLocation.id),
      })
      .andWhere('ta.day = :day', { day })
      .andWhere('ta.from_time <= :startTime', { startTime })
      .andWhere('ta.to_time >= :endTime', { endTime })
      .andWhere('ta.isDeleted = false')
      .getRawOne<{ classroomId?: number | string }>();
    const classroomId = Number(availability?.classroomId);
    if (!Number.isFinite(classroomId) || classroomId <= 0) return null;

    const unavailable = await manager
      .createQueryBuilder()
      .select('1')
      .from('classroom_unavailability', 'cu')
      .where('cu.classroomId = :classroomId', { classroomId })
      .andWhere('DATE(cu.fromDate) <= :lessonDate', {
        lessonDate: lessonDateKey,
      })
      .andWhere('DATE(cu.toDate) >= :lessonDate', {
        lessonDate: lessonDateKey,
      })
      .getRawOne<{ id?: number | string }>();

    return unavailable ? null : classroomId;
  }
}
