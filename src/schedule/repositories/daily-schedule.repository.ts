import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { CalendarEventColor } from '../../color-code/entities/calendar-event-color.entity';

@Injectable()
export class DailyScheduleRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(CalendarEventColor)
    private readonly calendarEventColorRepository: Repository<CalendarEventColor>,
  ) {}

  async getDailyScheduleLessons(
    locationId: number,
    targetDate: string,
    rescheduledRootIds: number[],
  ): Promise<Lesson[]> {
    const targetDateStart = `${targetDate} 00:00:00`;

    return this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect(
        'course.enrolments',
        'enrolment',
        `enrolment.isDeleted = false
          AND enrolment.id = (
            SELECT MIN(firstEnrolment.id)
            FROM enrolment firstEnrolment
            WHERE firstEnrolment.courseId = course.id
              AND firstEnrolment.isDeleted = false
          )`,
      )
      .leftJoinAndSelect(
        'enrolment.student',
        'student',
        'student.isDeleted = 0',
      )
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .leftJoinAndSelect('lesson.classroom', 'classroom')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .leftJoinAndSelect(
        'lesson.lessonHierarchy',
        'hierarchy',
        `hierarchy.lessonId <> lesson.id
          AND hierarchy.lessonId = (
            SELECT MIN(rootHierarchy.lessonId)
            FROM lesson_hierarchy rootHierarchy
            WHERE rootHierarchy.childLessonId = lesson.id
              AND rootHierarchy.lessonId <> lesson.id
          )`,
      )
      .leftJoinAndSelect('hierarchy.lesson', 'rootLesson')
      .leftJoinAndSelect(
        'lesson.bulkRescheduleLesson',
        'bulkRescheduleLesson',
        `bulkRescheduleLesson.id = (
          SELECT MIN(firstBulkReschedule.id)
          FROM bulk_reschedule_lesson firstBulkReschedule
          WHERE firstBulkReschedule.lessonId = lesson.id
        )`,
      )
      .where('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = false')
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.isPresent = true')
      .andWhere('lesson.date >= :targetDateStart', { targetDateStart })
      .andWhere('lesson.date < DATE_ADD(:targetDateStart, INTERVAL 1 DAY)')
      .andWhere(
        new Brackets((qb) => {
          qb.where('lesson.status <> :canceledStatus', {
            canceledStatus: LessonStatusEnum.CANCELED,
          });

          if (rescheduledRootIds.length > 0) {
            qb.orWhere('lesson.id IN (:...rescheduledRootIds)', {
              rescheduledRootIds,
            });
          }
        }),
      )
      .orderBy('TIME(lesson.date)', 'ASC')
      .getMany();
  }

  async getFirstNonCanceledLessonIdMap(
    courseIds: number[],
  ): Promise<Map<number, number>> {
    if (courseIds.length === 0) {
      return new Map<number, number>();
    }

    const firstDateSubQuery = this.lessonRepository
      .createQueryBuilder('firstLesson')
      .select('firstLesson.courseId', 'courseId')
      .addSelect('MIN(firstLesson.date)', 'firstLessonDate')
      .where('firstLesson.courseId IN (:...courseIds)', { courseIds })
      .andWhere('firstLesson.isDeleted = false')
      .andWhere('firstLesson.status <> :canceledStatus', {
        canceledStatus: LessonStatusEnum.CANCELED,
      })
      .groupBy('firstLesson.courseId');

    const rows = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin(
        `(${firstDateSubQuery.getQuery()})`,
        'firstDate',
        `firstDate.courseId = lesson.courseId
          AND firstDate.firstLessonDate = lesson.date`,
      )
      .select('lesson.courseId', 'courseId')
      .addSelect('MIN(lesson.id)', 'lessonId')
      .where('lesson.courseId IN (:...courseIds)', { courseIds })
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.status <> :canceledStatus', {
        canceledStatus: LessonStatusEnum.CANCELED,
      })
      .groupBy('lesson.courseId')
      .orderBy('lesson.courseId', 'ASC')
      .setParameters(firstDateSubQuery.getParameters())
      .getRawMany<{ courseId: string; lessonId: string }>();

    const firstLessonIdMap = new Map<number, number>();

    for (const row of rows) {
      const courseId = Number(row.courseId);
      const lessonId = Number(row.lessonId);

      if (!courseId || !lessonId) {
        continue;
      }

      firstLessonIdMap.set(courseId, lessonId);
    }

    return firstLessonIdMap;
  }

  async getCalendarEventColorMap(): Promise<Map<string, string>> {
    const rows = await this.calendarEventColorRepository.find({
      order: { id: 'ASC' },
      select: ['cssClass', 'code'],
    });

    const colorMap = new Map<string, string>();
    for (const row of rows) {
      const cssClass = row.cssClass?.trim();
      const code = row.code?.trim();

      if (!cssClass || !code) {
        continue;
      }

      const normalizedClass = cssClass.toLowerCase();
      if (!colorMap.has(normalizedClass)) {
        colorMap.set(normalizedClass, code);
      }
    }

    return colorMap;
  }

  async getRescheduledLeafDateMap(
    locationId: number,
    targetDate: string,
  ): Promise<Map<number, Date>> {
    const targetDateStart = `${targetDate} 00:00:00`;

    const rows = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('course', 'course', 'course.id = lesson.courseId')
      .innerJoin(
        'lesson_hierarchy',
        'latestLeafLesson',
        `latestLeafLesson.lessonId = lesson.id
          AND latestLeafLesson.childLessonId = (
            SELECT MAX(lessonHierarchy.childLessonId)
            FROM lesson_hierarchy lessonHierarchy
            WHERE lessonHierarchy.lessonId = lesson.id
          )`,
      )
      .innerJoin(
        'lesson',
        'leafLesson',
        'leafLesson.id = latestLeafLesson.childLessonId',
      )
      .where('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = false')
      .andWhere('lesson.status = :canceledStatus', {
        canceledStatus: LessonStatusEnum.CANCELED,
      })
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.isPresent = true')
      .andWhere('lesson.date >= :targetDateStart', { targetDateStart })
      .andWhere('lesson.date < DATE_ADD(:targetDateStart, INTERVAL 1 DAY)')
      .andWhere(
        `NOT EXISTS (
          SELECT 1
          FROM lesson_hierarchy rootAncestors
          WHERE rootAncestors.childLessonId = lesson.id
            AND rootAncestors.lessonId <> rootAncestors.childLessonId
        )`,
      )
      .andWhere('leafLesson.status = :rescheduledStatus', {
        rescheduledStatus: LessonStatusEnum.RESCHEDULED,
      })
      .select('lesson.id', 'rootLessonId')
      .addSelect('leafLesson.date', 'leafLessonDate')
      .orderBy('lesson.id', 'ASC')
      .getRawMany<{ rootLessonId: string; leafLessonDate: string }>();

    const result = new Map<number, Date>();

    for (const row of rows) {
      const rootLessonId = Number(row.rootLessonId);
      if (!rootLessonId || result.has(rootLessonId) || !row.leafLessonDate) {
        continue;
      }

      result.set(rootLessonId, new Date(row.leafLessonDate));
    }

    return result;
  }
}
