import { Injectable } from '@nestjs/common';
import { formatCurrency } from '../../../utils/formatters';
import { IGroupLessonDueCalculationService } from '../../interfaces/group-lesson-due-service.interface';

@Injectable()
export class GroupLessonDueCalculationService implements IGroupLessonDueCalculationService {
  /**
   * Calculate individual lesson amount (use balance if > 0, otherwise use total)
   */
  calculateLessonAmount(groupLesson: any): number {
    const balance = parseFloat(groupLesson?.balance?.toString() || '0');
    const total = parseFloat(groupLesson?.total?.toString() || '0');
    return balance > 0 ? balance : total;
  }

  /**
   * Calculate total amount from multiple lessons
   */
  calculateTotalAmount(lessons: any[]): number {
    return lessons.reduce((sum, lesson) => {
      return sum + this.calculateLessonAmount(lesson);
    }, 0);
  }

  
  /**
   * Calculate pagination info
   */
  calculatePagination(total: number, page: number, limit: number): {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}
