import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../entities/course.entity';
import { Program } from '../../program/entities/program.entity';
import { CourseType } from '../enums/course-type';

@Injectable()
export class CourseDetailsRepository {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
  ) {}

  /**
   * Find group course by ID with related entities including schedule
   * @param locationId - Location ID
   * @param courseId - Course ID
   * @returns Course entity with program, teacher, rate, and schedule information
   */
  async findCourseById(
    locationId: number,
    courseId: number,
  ): Promise<Course | null> {
    return this.courseRepository
      .createQueryBuilder('course')
      .innerJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .leftJoinAndSelect('course.courseProgramRates', 'courseProgramRate')
      .leftJoinAndSelect(
        'course.courseSchedule',
        'courseSchedule',
        'courseSchedule.isRecent = :isRecent',
        { isRecent: true },
      )
      .where('course.id = :courseId', { courseId })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.isConfirmed = :isConfirmed', { isConfirmed: 1 })
      .andWhere('course.type = :courseType', { courseType: CourseType.REGULAR })
      .andWhere('program.type = :programType', {
        programType: Program.TYPE_GROUP_PROGRAM,
      })
      .getOne();
  }
}
