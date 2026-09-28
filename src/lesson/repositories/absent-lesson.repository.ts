import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { LessonStatusEnum } from '../enums/lesson-status';

export interface AbsentLessonRaw {
  lesson_id: number;
  lesson_date: Date;
  lesson_duration: string;
  lesson_isOnline: number;
  programName: string;
  teacherFirstName: string | null;
  teacherLastName: string | null;
  invoiceId: number | null;
  invoiceNumber: number | null;
}

@Injectable()
export class AbsentLessonRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  /**
   * Get absent lessons for a student
   * Absent lessons are completed lessons where isPresent = false
   */
  async getAbsentLessonsByStudentId(
    studentId: number,
    locationId: number,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ lessons: AbsentLessonRaw[]; total: number }> {
    const offset = (page - 1) * limit;
    const currentDateTime = new Date().toISOString();

    const baseQuery = () => this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('course', 'course', 'lesson.courseId = course.id')
      .innerJoin('program', 'program', 'course.programId = program.id')
      .innerJoin('enrolment', 'enrolment', 'enrolment.courseId = course.id')
      .leftJoin('user', 'teacher', 'lesson.teacherId = teacher.id')
      .leftJoin('user_profile', 'teacherProfile', 'teacher.id = teacherProfile.user_id')
      .leftJoin('invoice_item_lesson', 'invoiceItemLesson', 'invoiceItemLesson.lessonId = lesson.id')
      .leftJoin('invoice_line_item', 'invoiceLineItem', 'invoiceItemLesson.invoiceLineItemId = invoiceLineItem.id AND invoiceLineItem.isDeleted = false')
      .leftJoin('invoice', 'invoice', 'invoiceLineItem.invoiceId = invoice.id AND invoice.isDeleted = false')
      .where('enrolment.studentId = :studentId', { studentId })
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('enrolment.isDeleted = false')
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = false')
      .andWhere('lesson.isPresent = false')
      .andWhere('lesson.status IN (:...statuses)', { 
        statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED] 
      })
      .andWhere('lesson.date <= :currentDateTime', { currentDateTime })
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.isDeleted = false');

    const [lessons, total] = await Promise.all([
      baseQuery()
        .select('lesson.id', 'lesson_id')
        .addSelect('lesson.date', 'lesson_date')
        .addSelect('lesson.duration', 'lesson_duration')
        .addSelect('lesson.is_online', 'lesson_isOnline')
        .addSelect('program.name', 'programName')
        .addSelect('teacherProfile.firstname', 'teacherFirstName')
        .addSelect('teacherProfile.lastname', 'teacherLastName')
        .addSelect('invoice.id', 'invoiceId')
        .addSelect('invoice.invoiceNumber', 'invoiceNumber')
        .orderBy('lesson.date', 'ASC')
        .offset(offset)
        .limit(limit)
        .getRawMany(),
      baseQuery().getCount(),
    ]);

    return { lessons, total };
  }
}
