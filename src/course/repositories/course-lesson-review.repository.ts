import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../entities/course.entity';
import { CourseSchedule } from '../entities/course-schedule.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { Holiday } from '../../holiday/entities/holiday.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';

/**
 * Repository for course lesson review operations
 * Handles all database queries for reviewing course lessons
 */
@Injectable()
export class CourseLessonReviewRepository {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(Holiday)
    private readonly holidayRepository: Repository<Holiday>,
  ) {}

  /**
   * Get course with program and teacher relations
   */
  async getCourseWithRelations(courseId: number): Promise<Course | null> {
    return await this.courseRepository.findOne({
      where: { id: courseId, isDeleted: false },
      relations: ['program', 'teacher', 'teacher.profile'],
    });
  }

  /**
   * Get enrolment for a course with student relation
   */
  async getEnrolmentWithStudent(courseId: number): Promise<Enrolment | null> {
    return await this.enrolmentRepository.findOne({
      where: { courseId, isDeleted: false },
      relations: ['student'],
    });
  }

  /**
   * Get unconfirmed scheduled lessons for a course
   */
  async getUnconfirmedLessons(courseId: number): Promise<Lesson[]> {
    return await this.lessonRepository.find({
      where: {
        courseId,
        isDeleted: false,
        isConfirmed: false,
        status: LessonStatusEnum.SCHEDULED,
      },
      order: { date: 'ASC' },
    });
  }

  /**
   * Get recent course schedule for start time
   */
  async getRecentCourseSchedule(courseId: number): Promise<CourseSchedule | null> {
    return await this.courseScheduleRepository.findOne({
      where: { courseId, isRecent: true },
    });
  }

  /**
   * Check if a date is a holiday
   */
  async getHolidayByDate(dateStr: string): Promise<Holiday | null> {
    return await this.holidayRepository
      .createQueryBuilder('holiday')
      .where('DATE(holiday.date) = :date', { date: dateStr })
      .andWhere('holiday.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();
  }

  /**
   * Check if teacher has a conflicting lesson at the given time
   */
  async checkTeacherConflict(
    teacherId: number,
    date: Date,
    duration: string,
    locationId: number,
    excludeLessonId: number,
  ): Promise<boolean> {
    // Format date as MySQL datetime string
    const dateStr = date.toISOString().split('T')[0];
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const dateTimeStr = `${dateStr} ${hours}:${minutes}:${seconds}`;

    const conflict = await this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoin('lesson.course', 'course')
      .where('lesson.teacherId = :teacherId', { teacherId })
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.RESCHEDULED, LessonStatusEnum.SCHEDULED],
      })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isPresent = :isPresent', { isPresent: true })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('DATE(lesson.date) = :dateStr', { dateStr })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('lesson.id != :excludeLessonId', { excludeLessonId })
      .andWhere(
        `lesson.date < ADDTIME(:dateTime, :duration) AND :dateTime < ADDTIME(lesson.date, lesson.duration)`,
        { dateTime: dateTimeStr, duration },
      )
      .getOne();

    return !!conflict;
  }

  /**
   * Check if student has a conflicting lesson at the given time
   */
  async checkStudentConflict(
    studentId: number,
    date: Date,
    duration: string,
    locationId: number,
    excludeLessonId: number,
  ): Promise<boolean> {
    // Format date as MySQL datetime string
    const dateStr = date.toISOString().split('T')[0];
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const dateTimeStr = `${dateStr} ${hours}:${minutes}:${seconds}`;

    const conflict = await this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoin('lesson.course', 'course')
      .leftJoin('course.enrolments', 'enrolment')
      .where('enrolment.studentId = :studentId', { studentId })
      .andWhere('enrolment.isConfirmed = :enrolmentIsConfirmed', { enrolmentIsConfirmed: true })
      .andWhere('enrolment.isDeleted = :enrolmentIsDeleted', { enrolmentIsDeleted: false })
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.RESCHEDULED, LessonStatusEnum.SCHEDULED],
      })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('DATE(lesson.date) = :dateStr', { dateStr })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('lesson.id != :excludeLessonId', { excludeLessonId })
      .andWhere(
        `lesson.date < ADDTIME(:dateTime, :duration) AND :dateTime < ADDTIME(lesson.date, lesson.duration)`,
        { dateTime: dateTimeStr, duration },
      )
      .getOne();

    return !!conflict;
  }
}
