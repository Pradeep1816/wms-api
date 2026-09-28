import { Injectable } from '@nestjs/common';
import { Lesson } from '../../../lesson/entities/lesson.entity';
import {
  CourseLessonItemDto,
  CourseLessonDataDto,
} from '../../dto/course-lesson-response.dto';
import { getStatus } from '../../../lesson/enums/lesson-status';
import { formatDateWithTime } from 'src/utils/date-utils';

@Injectable()
export class CourseLessonTransformationService {
  /**
   * Transform lessons data to DTO format with pagination
   */
  transformLessonsData(
    lessons: Lesson[],
    total: number,
    page: number,
    limit: number,
  ): CourseLessonDataDto {
    const totalPages = Math.ceil(total / limit);

    return {
      body: lessons.map((lesson) => this.transformLesson(lesson)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Transform a single lesson entity to DTO
   */
  private transformLesson(lesson: Lesson): CourseLessonItemDto {
    return {
      id: lesson.id,
      date: formatDateWithTime(lesson.date),
      status: getStatus(lesson),
      teacher: `${lesson.teacher?.profile?.firstname} ${lesson.teacher?.profile?.lastname}`.trim(),
      online: lesson.isOnline ? 'Yes' : 'No',
    };
  }
}
