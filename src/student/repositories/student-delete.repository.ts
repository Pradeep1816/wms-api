import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from '../entities/student.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { Course } from '../../course/entities/course.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { formatDate } from '../../utils/date-utils';

@Injectable()
export class StudentDeleteRepository {
  constructor(
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  
  /**
   * Check if student has active enrolment
   */
  async hasActiveEnrolment(studentId: number): Promise<boolean> {
    const count = await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoin('enrolment.course', 'course')
      .where('enrolment.studentId = :studentId', { studentId })
      .andWhere('enrolment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('enrolment.isConfirmed = :isConfirmed', { isConfirmed: 1 })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .getCount();

    return count > 0;
  }

  /**
   * Check if student has active lessons
   * Conditions:
   * - lesson.isDeleted = false
   * - lesson.isConfirmed = true
   * - lesson.status IN (1, 2, 5) - RESCHEDULED, SCHEDULED, UNSCHEDULED
   */
  async hasActiveLesson(studentId: number): Promise<boolean> {
    const activeStatuses = [
      LessonStatusEnum.RESCHEDULED,
      LessonStatusEnum.SCHEDULED,
      LessonStatusEnum.UNSCHEDULED,
    ];

    const count = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.enrolments', 'enrolment')
      .where('enrolment.studentId = :studentId', { studentId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status IN (:...statuses)', { statuses: activeStatuses })
      .getCount();

    return count > 0;
  }

  /**
   * Soft delete student by setting isDeleted = 1
   * @param studentId - The student ID to delete
   * @param locationId - The location ID for verification
   * @param updatedByUserId - The user ID who is deleting
   * @returns The student data before deletion
   */
  async softDeleteStudent(
    studentId: number,
    locationId: number,
    updatedByUserId: number,
  ): Promise<any> {
    const queryRunner = this.studentRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Soft delete student record
      await queryRunner.manager
        .createQueryBuilder()
        .update('student')
        .set({
          isDeleted: true,
          updatedOn: new Date(),
          updatedByUserId,
        })
        .where('id = :studentId', { studentId })
        .execute();

      await queryRunner.commitTransaction();

      return{
        id: studentId,
        deletedByUserId: updatedByUserId,
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
