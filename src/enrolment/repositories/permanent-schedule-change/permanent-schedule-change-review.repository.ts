/**
 * Database operations used only by permanent schedule change lesson review.
 * Keeping these queries in enrolment prevents the generic lesson review flow
 * from depending on PSC policy or persistence details.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../../../course/entities/course.entity';
import { CourseSchedule } from '../../../course/entities/course-schedule.entity';
import { Holiday } from '../../../holiday/entities/holiday.entity';
import { Lesson } from '../../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../../lesson/enums/lesson-status';
import { Enrolment } from '../../entities/enrolment.entity';
import { getPermanentScheduleEligibleLessonWhere } from '../../permanent-schedule-change/domain/permanent-schedule-eligibility.policy';

export interface PermanentScheduleChangeConflictFlags {
  student: boolean;
  teacher: boolean;
}

export interface PermanentScheduleChangeChangedLessons {
  unscheduledLessons: Lesson[];
  rescheduledLessons: Lesson[];
}

/** Provides every database read required to build a PSC lesson review. */
@Injectable()
export class PermanentScheduleChangeReviewRepository {
  /** Inject repositories owned by the PSC review query boundary. */
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
    @InjectRepository(Holiday)
    private readonly holidayRepository: Repository<Holiday>,
  ) {}

  /** Load the active course and display relations required by PSC review. */
  findCourse(courseId: number): Promise<Course | null> {
    return this.courseRepository.findOne({
      where: { id: courseId, isDeleted: false },
      relations: [
        'program',
        'teacher',
        'teacher.profile',
        'enrolments',
        'enrolments.student',
      ],
    });
  }

  /** Load the course enrolment and student displayed in PSC review. */
  findEnrolment(courseId: number): Promise<Enrolment | null> {
    return this.enrolmentRepository.findOne({
      where: { courseId },
      relations: ['student'],
    });
  }

  /** Load unconfirmed replacement lessons inside the requested review range. */
  async findDraftLessons(
    courseId: number,
    courseStartDate: Date,
    showAllReviewLessons: boolean,
    rescheduleBeginDate?: Date,
    rescheduleEndDate?: Date,
  ): Promise<Lesson[]> {
    const query = this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: false })
      .andWhere('lesson.status = :status', {
        status: LessonStatusEnum.SCHEDULED,
      })
      .orderBy('lesson.date', 'ASC');

    if (!showAllReviewLessons) {
      if (rescheduleBeginDate) {
        const beginDateKey = rescheduleBeginDate.toISOString().split('T')[0];
        query.andWhere('DATE(lesson.date) >= :beginDate', {
          beginDate: beginDateKey,
        });
      } else {
        const startDateKey = courseStartDate.toISOString().split('T')[0];
        query.andWhere('DATE(lesson.date) >= :startDate', {
          startDate: startDateKey,
        });
      }
    }

    if (rescheduleEndDate) {
      const endDateKey = rescheduleEndDate.toISOString().split('T')[0];
      query.andWhere('DATE(lesson.date) <= :endDate', {
        endDate: endDateKey,
      });
    }

    return query.getMany();
  }

  /** Find old lessons considered by PSC review, generation, and confirmation. */
  findEligibleOldLessons(
    courseId: number,
    dateToChangeSchedule: Date,
  ): Promise<Lesson[]> {
    return this.lessonRepository.find({
      where: getPermanentScheduleEligibleLessonWhere(
        courseId,
        dateToChangeSchedule,
      ),
      select: ['id', 'status', 'date', 'originalDate'],
    });
  }

  /** Load holidays for all distinct dates appearing in the PSC draft. */
  findHolidays(reviewDateKeys: string[]): Promise<Holiday[]> {
    if (reviewDateKeys.length === 0) {
      return Promise.resolve([]);
    }
    return this.holidayRepository
      .createQueryBuilder('holiday')
      .where('DATE(holiday.date) IN (:...reviewDates)', {
        reviewDates: reviewDateKeys,
      })
      .andWhere('holiday.isDeleted = :isDeleted', { isDeleted: false })
      .getMany();
  }

  /** Load same-course draft lessons used for overlap detection. */
  findCourseDraftLessons(courseId: number): Promise<Lesson[]> {
    return this.lessonRepository.find({
      where: {
        courseId,
        isConfirmed: false,
        isDeleted: false,
      },
    });
  }

  /** Resolve student and teacher overlap flags for every PSC draft lesson. */
  async findConflictFlags(
    lessons: Lesson[],
    studentId: number,
    fallbackTeacherId: number,
    locationId: number,
    excludedLessonIds: number[],
  ): Promise<Map<number, PermanentScheduleChangeConflictFlags>> {
    const flags = new Map<number, PermanentScheduleChangeConflictFlags>();
    if (lessons.length === 0) {
      return flags;
    }

    const query = this.lessonRepository
      .createQueryBuilder('draftLesson')
      .innerJoin(
        Lesson,
        'conflictLesson',
        `conflictLesson.id != draftLesson.id
          AND conflictLesson.status IN (:...conflictStatuses)
          AND conflictLesson.isDeleted = :conflictIsDeleted
          AND conflictLesson.isConfirmed = :conflictIsConfirmed
          AND DATE(conflictLesson.date) = DATE(draftLesson.date)
          AND conflictLesson.date < ADDTIME(draftLesson.date, draftLesson.duration)
          AND draftLesson.date < ADDTIME(conflictLesson.date, conflictLesson.duration)`,
        {
          conflictStatuses: [
            LessonStatusEnum.SCHEDULED,
            LessonStatusEnum.RESCHEDULED,
          ],
          conflictIsDeleted: false,
          conflictIsConfirmed: true,
        },
      )
      .innerJoin(
        Course,
        'conflictCourse',
        `conflictCourse.id = conflictLesson.courseId
          AND conflictCourse.isDeleted = :conflictCourseIsDeleted
          AND conflictCourse.locationId = :conflictLocationId`,
        {
          conflictCourseIsDeleted: false,
          conflictLocationId: locationId,
        },
      )
      .leftJoin(
        Enrolment,
        'conflictEnrolment',
        `conflictEnrolment.courseId = conflictCourse.id
          AND conflictEnrolment.studentId = :conflictStudentId
          AND conflictEnrolment.isConfirmed = :conflictEnrolmentIsConfirmed
          AND conflictEnrolment.isDeleted = :conflictEnrolmentIsDeleted`,
        {
          conflictStudentId: studentId,
          conflictEnrolmentIsConfirmed: true,
          conflictEnrolmentIsDeleted: false,
        },
      )
      .where('draftLesson.id IN (:...draftLessonIds)', {
        draftLessonIds: lessons.map(({ id }) => id),
      })
      .andWhere(
        `(
          (
            conflictLesson.teacherId = COALESCE(draftLesson.teacherId, :fallbackTeacherId)
            AND conflictLesson.isPresent = :teacherConflictIsPresent
          )
          OR conflictEnrolment.id IS NOT NULL
        )`,
        { fallbackTeacherId, teacherConflictIsPresent: true },
      )
      .select('draftLesson.id', 'draftLessonId')
      .addSelect(
        'MAX(CASE WHEN conflictEnrolment.id IS NOT NULL THEN 1 ELSE 0 END)',
        'hasStudentConflict',
      )
      .addSelect(
        `MAX(CASE WHEN
          conflictLesson.teacherId = COALESCE(draftLesson.teacherId, :fallbackTeacherId)
          AND conflictLesson.isPresent = :teacherConflictIsPresent
          THEN 1 ELSE 0 END)`,
        'hasTeacherConflict',
      )
      .groupBy('draftLesson.id');

    if (excludedLessonIds.length > 0) {
      query.andWhere(
        'conflictLesson.id NOT IN (:...excludeConflictLessonIds)',
        { excludeConflictLessonIds: excludedLessonIds },
      );
    }

    const rows = await query.getRawMany<{
      draftLessonId: number | string;
      hasStudentConflict: number | string;
      hasTeacherConflict: number | string;
    }>();
    for (const row of rows) {
      flags.set(Number(row.draftLessonId), {
        student: Number(row.hasStudentConflict) === 1,
        teacher: Number(row.hasTeacherConflict) === 1,
      });
    }
    return flags;
  }

  /** Load the current course schedule for an empty PSC review. */
  findRecentSchedule(courseId: number): Promise<CourseSchedule | null> {
    return this.courseScheduleRepository.findOne({
      where: { courseId, isRecent: true },
    });
  }

  /** Load old unscheduled and rescheduled lessons shown beside the PSC draft. */
  async findChangedLessons(
    courseId: number,
    rescheduleBeginDate: Date,
  ): Promise<PermanentScheduleChangeChangedLessons> {
    const beginDateKey = rescheduleBeginDate.toISOString().split('T')[0];
    const oldLessons = await this.lessonRepository
      .createQueryBuilder('lesson')
      .select(['lesson.id', 'lesson.type', 'lesson.date', 'lesson.duration'])
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('DATE(lesson.date) >= :beginDate', {
        beginDate: beginDateKey,
      })
      .andWhere('lesson.status != :canceled', {
        canceled: LessonStatusEnum.CANCELED,
      })
      .orderBy('lesson.date', 'ASC')
      .getMany();
    const oldLessonIds = oldLessons.map(({ id }) => id);
    if (oldLessonIds.length === 0) {
      return { unscheduledLessons: [], rescheduledLessons: [] };
    }

    const unscheduledLessons = await this.findChangedLessonsByStatus(
      oldLessonIds,
      LessonStatusEnum.UNSCHEDULED,
    );
    const rescheduledLessons = await this.findChangedLessonsByStatus(
      oldLessonIds,
      LessonStatusEnum.RESCHEDULED,
    );
    return { unscheduledLessons, rescheduledLessons };
  }

  /** Load selected old lessons carrying one changed status. */
  private findChangedLessonsByStatus(
    lessonIds: number[],
    status: LessonStatusEnum,
  ): Promise<Lesson[]> {
    return this.lessonRepository
      .createQueryBuilder('lesson')
      .select(['lesson.id', 'lesson.type', 'lesson.date', 'lesson.duration'])
      .where('lesson.id IN (:...ids)', { ids: lessonIds })
      .andWhere('lesson.status = :status', { status })
      .orderBy('lesson.date', 'ASC')
      .getMany();
  }
}
