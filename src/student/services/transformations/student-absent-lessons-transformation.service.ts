import { Injectable } from '@nestjs/common';
import {
  StudentAbsentLessonDto,
  StudentAbsentLessonsDataDto,
} from '../../dto/student-absent-lessons-response.dto';
import { formatDateWithTime } from '../../../utils/date-utils';
import { formatDuration } from '../../../utils/formatters';

@Injectable()
export class StudentAbsentLessonsTransformationService {
  /**
   * Transform absent lessons data to response DTO with pagination
   */
  transformAbsentLessonsData(
    lessons: any[],
    total: number,
    page: number,
    limit: number,
  ): StudentAbsentLessonsDataDto {
    return {
      body: lessons.map(lesson => this.transformAbsentLessonToDto(lesson)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Transform a single absent lesson to DTO
   */
  private transformAbsentLessonToDto(lesson: any): StudentAbsentLessonDto {
    const teacherName = `${lesson.teacherFirstName} ${lesson.teacherLastName}`;
    const invoiceNumber =
      lesson.invoiceNumber != null
        ? `I-${String(lesson.invoiceNumber).padStart(5, '0')}`
        : '';

    return {
      id: lesson.lesson_id,
      date: formatDateWithTime(new Date(lesson.lesson_date)),
      program: lesson.programName || '',
      teacher: teacherName,
      duration: formatDuration(lesson.lesson_duration),
      invoiceId: lesson.invoiceId ?? 0,
      invoiceNumber,
      online: lesson.lesson_isOnline === 1 ? 'Yes' : 'No',
      url: `lesson/${lesson.lesson_id}`,
    };
  }
}
