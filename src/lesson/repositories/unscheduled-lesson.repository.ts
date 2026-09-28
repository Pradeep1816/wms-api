import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { LessonStatusEnum } from '../enums/lesson-status';
import { formatDateToEasternString } from '../../utils/formatters';

@Injectable()
export class UnscheduledLessonRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  /**
   * Get unscheduled lessons for a student
   * Unscheduled lessons are private lessons with status = UNSCHEDULED
   * @param showAll - If false, only show non-expired lessons (expiryDate > today)
   */
  async getUnscheduledLessonsByStudentId(
    studentId: number,
    locationId: number,
    page: number = 1,
    limit: number = 10,
    showAll: boolean = false,
  ): Promise<{ lessons: Lesson[]; total: number }> {
    const offset = (page - 1) * limit;

    const query = this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.enrolments', 'enrolment', 
        'enrolment.isDeleted = :enrolmentDeleted AND enrolment.isConfirmed = :enrolmentConfirmed', 
        { enrolmentDeleted: 0, enrolmentConfirmed: 1 }
      )
      .leftJoinAndSelect('enrolment.student', 'student')
      .leftJoinAndSelect('student.user', 'customerUser')
      .leftJoinAndSelect('customerUser.contacts', 'contact', 'contact.isDeleted = :contactDeleted', { contactDeleted: 0 })
      .leftJoinAndSelect('contact.phones', 'phones', 'phones.isDeleted = :phoneDeleted', { phoneDeleted: 0 })
      // Join for original date
      .leftJoinAndSelect('lesson.lessonHierarchy', 'hierarchy')
      .leftJoinAndSelect('hierarchy.lesson', 'ancestorLesson')
      .leftJoinAndSelect('ancestorLesson.bulkRescheduleLesson', 'bulkReschedule')
      .where('enrolment.studentId = :studentId', { studentId })
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('enrolment.isDeleted = false')
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = false')
      .andWhere('lesson.status = :status', { status: LessonStatusEnum.UNSCHEDULED })
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.isDeleted = false')
      .andWhere('privateLesson.id IS NOT NULL');

    // notExpired(): DATE(expiryDate) > NOW() - only if showAll is false
    if (!showAll) {
      const today = formatDateToEasternString(); 
      query.andWhere('DATE(privateLesson.expiryDate) > :today', { today });
    }

    query
      .orderBy('privateLesson.expiryDate', 'ASC')
      .addOrderBy('lesson.id', 'ASC');

    const [lessons, total] = await query
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { lessons, total };
  }
}
