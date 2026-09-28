import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Enrolment } from '../entities/enrolment.entity';
import { Course } from '../../course/entities/course.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';

@Injectable()
export class EnrolmentParkedRepository {
  constructor(
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
  ) {}

  /**
   * Distinct parked enrolments grouped by program (instrument/category).
   * One row per enrolment — unscheduled lesson credits do not inflate the count.
   */
  async getParked(
    locationId: number,
    fromDate: string,
    toDate: string,
    referenceDate: string,
  ): Promise<Array<{ name: string; count: string }>> {
    const futureScheduledStatuses = [
      LessonStatusEnum.SCHEDULED,
      LessonStatusEnum.RESCHEDULED,
    ];

    return this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoin('course', 'course', 'enrolment.courseId = course.id')
      .leftJoin('program', 'program', 'course.programId = program.id')
      .select([
        "COALESCE(program.name, 'Unassigned Program') as name",
        'COUNT(DISTINCT enrolment.id) as count',
      ])
      .where('enrolment.isConfirmed = :enrolmentConfirmed', {
        enrolmentConfirmed: true,
      })
      .andWhere('enrolment.isDeleted = :enrolmentDeleted', {
        enrolmentDeleted: false,
      })
      .andWhere('course.isConfirmed = :courseConfirmed', {
        courseConfirmed: true,
      })
      .andWhere('course.isDeleted = :courseDeleted', { courseDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.type = :courseType', {
        courseType: Course.TYPE_REGULAR,
      })
      .andWhere('DATE(course.startDate) <= :toDate', { toDate })
      .andWhere(
        '(course.endDate IS NULL OR DATE(course.endDate) >= :referenceDate)',
        {
          referenceDate,
        },
      )
      .andWhere('DATE(course.startDate) NOT BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      })
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM course_extra courseExtra
          WHERE courseExtra.courseId = course.id
            AND courseExtra.isDeleted = 0
        )`,
      )
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM course_schedule courseSchedule
          WHERE courseSchedule.courseId = course.id
            AND courseSchedule.isRecent = 1
            AND DATE(courseSchedule.startDate) <= :toDate
            AND DATE(courseSchedule.endDate) >= :referenceDate
        )`,
        { toDate, referenceDate },
      )
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM lesson futureLesson
          WHERE futureLesson.courseId = course.id
            AND futureLesson.isDeleted = 0
            AND futureLesson.isConfirmed = 1
            AND futureLesson.status IN (:...futureScheduledStatuses)
            AND DATE(futureLesson.date) > :referenceDate
            AND DATE(futureLesson.date) <= DATE(enrolment.endDateTime)
        )`,
        { futureScheduledStatuses, referenceDate },
      )
      .groupBy('course.programId, program.name')
      .orderBy('count', 'DESC')
      .getRawMany();
  }
}
