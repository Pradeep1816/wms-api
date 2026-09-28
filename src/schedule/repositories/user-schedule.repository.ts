import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../../lesson/entities/lesson.entity';

@Injectable()
export class CustomerUserScheduleRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  async findCustomerLessonsByDate(
    formattedDate: string,
    customerId: number,
    locationId: number,
  ): Promise<Lesson[]> {
    return await this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('lesson.classroom', 'classroom')
      .leftJoinAndSelect(
        'course.enrolments',
        'enrolment',
        'enrolment.isDeleted = false',
      )
      .leftJoinAndSelect(
        'enrolment.student',
        'student',
        'student.isDeleted = 0',
      )
      .leftJoinAndSelect('lesson.lessonHierarchy', 'hierarchy')
      .leftJoinAndSelect('hierarchy.lesson', 'rootLesson')
      .leftJoinAndSelect('lesson.bulkRescheduleLesson', 'bulkRescheduleLesson')
      .where('lesson.isDeleted = false')
      .andWhere('lesson.status IN (1, 2)')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.isPresent = true')
      .andWhere('DATE(lesson.date) = :formattedDate', { formattedDate })
      .andWhere('course.isDeleted = false')
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('student.customerId = :customerId', { customerId })
      .getMany();
  }
}
