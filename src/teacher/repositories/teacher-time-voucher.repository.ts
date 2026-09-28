import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';

@Injectable()
export class TeacherTimeVoucherRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  async findTimeVoucherLessonsByTeacher(
    teacherId: number,
    locationId: number,
    fromDate?: string,
    toDate?: string,
  ): Promise<Lesson[]> {
    try {
      const lessons = this.lessonRepository
        .createQueryBuilder('lesson')
        .innerJoinAndSelect('lesson.course', 'course')
        .leftJoinAndSelect('course.program', 'program')
        .innerJoinAndSelect('course.enrolments', 'enrolment')
        .leftJoinAndSelect('enrolment.student', 'student')
        .where('lesson.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
        .andWhere('lesson.teacherId = :teacherId', { teacherId })
        .andWhere('lesson.status IN (:...statuses)', { statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED] })
        .andWhere('course.locationId = :locationId', { locationId })
        .andWhere('course.isDeleted = :courseDeleted', { courseDeleted: false })
        .orderBy('lesson.date', 'ASC')
        .addOrderBy('lesson.id', 'ASC');

      if (fromDate != null && toDate != null) {
        lessons.andWhere('lesson.date BETWEEN :fromDateTime AND :toDateTime', {
          fromDateTime: `${fromDate} 00:00:00`,
          toDateTime: `${toDate} 23:59:59`,
        });
      }

      return lessons.getMany();
    } catch (error) {
      console.error('Error in TeacherTimeVoucherRepository:', error);
      throw new InternalServerErrorException(
        'Failed to retrieve teacher time voucher lessons',
      );
    }
  }
}
