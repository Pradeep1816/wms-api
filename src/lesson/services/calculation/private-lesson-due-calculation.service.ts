import { Injectable } from '@nestjs/common';
import { IPrivateLessonDueCalculationService } from '../../interfaces/private-lesson-due-service.interface';

@Injectable()
export class PrivateLessonDueCalculationService implements IPrivateLessonDueCalculationService {
  calculateLessonAmount(lesson: any): number {
    return lesson.privateLesson?.[0]?.balance ? parseFloat(lesson.privateLesson[0].balance) : 0;
  }

  calculateTotalAmount(lessons: any[]): number {
    return lessons.reduce((total, lesson) => {
      return total + this.calculateLessonAmount(lesson);
    }, 0);
  }

  calculatePagination(total: number, page: number, limit: number): {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } {
    const totalPages = Math.ceil(total / limit);
    return {
      page,
      limit,
      total,
      totalPages,
    };
  }
}
