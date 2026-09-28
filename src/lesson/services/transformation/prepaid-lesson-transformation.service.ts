import { Injectable } from '@nestjs/common';
import { PrepaidLessonDto } from '../../dto/prepaid-lesson-response.dto';
import { formatDate, formatDateWithTime } from '../../../utils/date-utils';
import { formatCurrency } from '../../../utils/formatters';
import { Lesson } from '../../entities/lesson.entity';

@Injectable()
export class PrepaidLessonTransformationService {
  /**
   * Transform lesson to prepaid lesson DTO
   */
  transformToDto(lesson: Lesson, paymentMap: Record<number, number>): PrepaidLessonDto {
    const lessonDate = new Date(lesson.date);
    const formattedDate = formatDate(lessonDate);
    const status = lesson.getStatus() || 'Unknown';
    const paid = Number(paymentMap[lesson.id] || 0);

    return {
      lessonId: `L-${lesson?.id || ''}`,
      lessonDate: formattedDate,
      status: status,
      paid: formatCurrency(paid),
    };
  }

  /**
   * Transform multiple lessons to DTOs
   */
  transformLessonsToDtos(lessons: Lesson[], paymentMap: Record<number, number>): PrepaidLessonDto[] {
    return lessons.map((lesson) => this.transformToDto(lesson, paymentMap));
  }
}

