import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Enrolment } from '../entities/enrolment.entity';
import { Course } from '../../course/entities/course.entity';

@Injectable()
export class EnrolmentInfoRepository {
  constructor(
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
  ) {}

  /**
   * Get enrolment info by ID for a specific location
   */
  async getEnrolmentById(
    enrolmentId: number,
    locationId: number,
  ): Promise<Enrolment | null> {
    return this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoinAndSelect('enrolment.student', 'student')
      .leftJoin('student.user', 'customerUser')
      .leftJoin('customerUser.profile', 'customerProfile')
      .addSelect(['customerUser.id', 'customerProfile.firstname', 'customerProfile.lastname'])
      .innerJoinAndSelect('enrolment.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.courseSchedule', 'courseSchedule')
      .leftJoinAndSelect('courseSchedule.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .leftJoinAndSelect('course.courseProgramRates', 'courseProgramRates')
      .leftJoinAndSelect('enrolment.discounts', 'discounts')
      .where('enrolment.id = :enrolmentId', { enrolmentId })
      .andWhere('enrolment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .orderBy('courseSchedule.id', 'DESC')
      .getOne();
  }
}

