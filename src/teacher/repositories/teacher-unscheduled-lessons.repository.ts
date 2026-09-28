import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { formatDateToEasternString } from '../../utils/formatters';

@Injectable()
export class TeacherUnscheduledLessonsRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  async findUnscheduledLessonsByTeacher(
    teacherId: number,
    locationId: number,
    showAll: boolean = false,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ lessons: Lesson[]; total: number }> {
    try {
      const skip = (page - 1) * limit;

      const query = this.lessonRepository
        .createQueryBuilder('lesson')
        .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
        .leftJoinAndSelect('lesson.course', 'course')
        .leftJoinAndSelect('course.program', 'program')
        .leftJoinAndSelect('lesson.teacher', 'teacher')
        .leftJoinAndSelect('teacher.profile', 'teacherProfile')
        .leftJoinAndSelect('course.enrolments', 'enrolment', 'enrolment.isDeleted = :enrolmentDeleted AND enrolment.isConfirmed = :enrolmentConfirmed', { enrolmentDeleted: 0, enrolmentConfirmed: 1 })
        .leftJoinAndSelect('enrolment.student', 'student')
        .leftJoinAndSelect('student.user', 'studentUser')
        .leftJoinAndSelect('studentUser.contacts', 'contact', 'contact.isDeleted = :contactDeleted', { contactDeleted: 0 })
        .leftJoinAndSelect('contact.phones', 'phones', 'phones.isDeleted = :phoneDeleted', { phoneDeleted: 0 })
        .where('lesson.isDeleted = :isDeleted', { isDeleted: 0 })
        .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: 1 })
        .andWhere('lesson.teacherId = :teacherId', { teacherId })
        .andWhere('lesson.status = :status', { status: LessonStatusEnum.UNSCHEDULED })
        .andWhere('course.locationId = :locationId', { locationId })
        .andWhere('privateLesson.id IS NOT NULL') // Only private lessons
        .orderBy('privateLesson.expiryDate', 'ASC')
        .addOrderBy('lesson.id', 'ASC');

      // Filter out expired lessons if showAll is false
      if (!showAll) {
        const today = formatDateToEasternString();
        query.andWhere('DATE(privateLesson.expiryDate) > :today', { today });
      }

      const [lessons, total] = await query
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      return { lessons, total };
    } catch (error) {
      console.error('Error in TeacherUnscheduledLessonsRepository:', error);
      throw new InternalServerErrorException(
        'Failed to retrieve teacher unscheduled lessons',
      );
    }
  }
}

