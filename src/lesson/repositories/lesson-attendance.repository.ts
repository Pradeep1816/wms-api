import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { LessonStatusEnum } from '../enums/lesson-status';
import { ProgramTypeEnum } from '../../program/enums/program-type';

@Injectable()
export class LessonAttendanceRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  //Find lesson by ID with required relations for attendance update
  async findLessonById(lessonId: number, locationId: number): Promise<Lesson | null> {
    return await this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .getOne();
  }

  isPrivateLesson(lesson: Lesson): boolean {
    return lesson.course?.program?.type === ProgramTypeEnum.PRIVATE_PROGRAM;
  }

  isNotUnscheduled(lesson: Lesson): boolean {
    return lesson.status !== LessonStatusEnum.UNSCHEDULED;
  }

  //Update lesson attendance (isPresent field)
  async updateAttendance(lessonId: number, isPresent: boolean, userId: number): Promise<void> {
    await this.lessonRepository.update(
      { id: lessonId },
      {
        isPresent,
        updatedByUserId: userId,
      },
    );
  }

  async getCustomerIdByLesson(lessonId: number): Promise<number | null> {
    const result = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.enrolments', 'enrolment', 'enrolment.isDeleted = 0 AND enrolment.isConfirmed = 1')
      .innerJoin('enrolment.student', 'student', 'student.isDeleted = 0')
      .innerJoin('student.user', 'user')
      .select('user.id', 'customerId')
      .where('lesson.id = :lessonId', { lessonId })
      .getRawOne();

    return result?.customerId || null;
  }
}
