import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Enrolment } from '../entities/enrolment.entity';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { Course } from '../../course/entities/course.entity';

@Injectable()
export class EnrolmentScheduleRepository {
  constructor(
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
  ) {}

  /**
   * Get enrolment schedule by ID for a specific location
   */
  async getEnrolmentScheduleById(
    enrolmentId: number,
    locationId: number,
  ): Promise<Enrolment | null> {
    return this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoinAndSelect('enrolment.course', 'course')
      .leftJoinAndSelect('course.courseSchedule', 'courseSchedule')
      .where('enrolment.id = :enrolmentId', { enrolmentId })
      .andWhere('enrolment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('enrolment.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .orderBy('courseSchedule.id', 'DESC')
      .getOne();
  }

  /**
   * Get schedule history for an enrolment (all course schedules)
   */
  async getScheduleHistory(
    enrolmentId: number,
    locationId: number,
  ): Promise<CourseSchedule[]> {
    // First get the enrolment to find the courseId
    const enrolment = await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoin('enrolment.course', 'course')
      .select(['enrolment.id', 'course.id'])
      .where('enrolment.id = :enrolmentId', { enrolmentId })
      .andWhere('enrolment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .getOne();

    if (!enrolment) {
      return [];
    }

    // Get all course schedules for this course with teacher info
    return this.courseScheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .where('schedule.courseId = :courseId', { courseId: enrolment.course.id })
      .orderBy('schedule.startDate', 'DESC')
      .addOrderBy('schedule.id', 'DESC')
      .getMany();
  }
}
