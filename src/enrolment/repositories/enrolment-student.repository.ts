import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Enrolment } from '../entities/enrolment.entity';
import { CourseType } from '../../course/enums/course-type';

@Injectable()
export class EnrolmentStudentRepository {
  constructor(
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
  ) {}

  /**
   * Get enrolments by student ID with pagination
   * @param studentId - The student ID
   * @param locationId - The location ID
   * @param page - Page number for pagination
   * @param limit - Items per page
   * @param showAll - If true, show all enrolments including past ones. If false, only show active and future ones.
   */
  async getEnrolmentsByStudentId(
    studentId: number,
    locationId: number,
    page: number = 1,
    limit: number = 20,
    showAll: boolean = false,
  ): Promise<{ enrolments: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const currentDate = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'

    const queryBuilder = this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoinAndSelect('enrolment.student', 'student')
      .innerJoinAndSelect('enrolment.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.teacher', 'courseTeacher')
      .leftJoinAndSelect('courseTeacher.profile', 'courseTeacherProfile')
      .leftJoinAndSelect('course.courseSchedule', 'courseSchedule', 'courseSchedule.isRecent = true')
      .leftJoinAndSelect('courseSchedule.teacher', 'scheduleTeacher')
      .leftJoinAndSelect('scheduleTeacher.profile', 'scheduleTeacherProfile')
      .innerJoinAndSelect('course.lessons', 'lessons')
      .leftJoinAndSelect('lessons.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'profile')
      .where('student.id = :studentId', { studentId })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('course.type = :type', { type: CourseType.REGULAR })
      .andWhere('course.isDeleted = false')
      .andWhere('course.isConfirmed = true')
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('lessons.id IS NOT NULL');

    if (!showAll) {
      queryBuilder.andWhere('DATE(enrolment.endDateTime) >= :currentDate', { currentDate });
    }

    const [enrolments, count] = await queryBuilder
      .groupBy('enrolment.id')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { enrolments, total: count };
  }
}
