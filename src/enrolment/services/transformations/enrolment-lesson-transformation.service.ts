import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { EnrolmentLessonDto, EnrolmentLessonsDataDto } from '../../dto/enrolment-lesson-response.dto';
import { formatDate, formatDateWithTime } from '../../../utils/date-utils';
import { formatCurrency, formatDuration } from '../../../utils/formatters';
import { LessonStatusEnum } from '../../../lesson/enums/lesson-status';

@Injectable()
export class EnrolmentLessonTransformationService {
  
  private getStatus(
    status: number,
    isPresent: boolean,
    lessonDate: Date | string,
    expiryDate?: Date | string,
    isExploded?: number,
  ): string {
    const now = new Date();
    const date = new Date(lessonDate);
    const isCompleted = date <= now;

    // 1. Check expired first (for UNSCHEDULED private lessons)
    if (expiryDate && status === LessonStatusEnum.UNSCHEDULED) {
      if (new Date(expiryDate) < now) {
        return 'Expired';
      }
    }

    // 2. Handle each status with full logic
    switch (status) {
      case LessonStatusEnum.SCHEDULED:
        if (!isCompleted && isPresent) {
          return 'Scheduled';
        } else if (!isPresent) {
          return 'Absent';
        } else {
          return 'Completed';
        }

      case LessonStatusEnum.CANCELED:
        return 'Canceled';

      case LessonStatusEnum.RESCHEDULED:
        if (!isCompleted) {
          return 'Rescheduled';
        } else if (!isPresent) {
          return 'Absent';
        } else {
          return 'Completed';
        }

      case LessonStatusEnum.UNSCHEDULED:
        if (isExploded) {
          return 'Unscheduled (Exploded)';
        }
        return 'Unscheduled';

      default:
        return 'Unknown';
    }
  }

  /**
   * Transform a single lesson record to EnrolmentLessonDto
   */
  transformLesson(lesson: any): EnrolmentLessonDto {
    const status = this.getStatus(
      lesson.status,
      !!lesson.isPresent,
      lesson.date,
      lesson.expiryDate,
      lesson.isExploded,
    );
    console.log(lesson.isExploded);

    const lessonData = {
      id: lesson.lessonId,
      dueDate: lesson.dueDate ? formatDate(new Date(lesson.dueDate)) : '',
      date: formatDateWithTime(new Date(lesson.date)),
      duration: formatDuration(lesson.duration),
      status,
      price: formatCurrency(lesson.price),
      owing: formatCurrency(lesson.owing),
      online: lesson.online ? 'Yes' : 'No',
    };

    return plainToInstance(EnrolmentLessonDto, lessonData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform lessons array to EnrolmentLessonsDataDto
   */
  transformLessonsData(lessons: any[]): EnrolmentLessonsDataDto {
    const transformedLessons = lessons.map(lesson => this.transformLesson(lesson));

    const dtoData = {
      body: transformedLessons,
    };

    return plainToInstance(EnrolmentLessonsDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform lessons array to EnrolmentLessonsDataDto with pagination (for group lessons)
   */
  transformLessonsDataWithPagination(
    lessons: any[],
    total: number,
    page: number,
    limit: number,
  ): EnrolmentLessonsDataDto {
    const transformedLessons = lessons.map(lesson => this.transformLesson(lesson));

    const dtoData = {
      body: transformedLessons,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };

    return plainToInstance(EnrolmentLessonsDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }
}
