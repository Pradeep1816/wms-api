import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { UnscheduledLessonListRepository } from '../repositories/unscheduled-lesson-list.repository';
import { UnscheduledLessonListRequestDto } from '../dto/unscheduled-lesson-list-request.dto';
import { UnscheduledLessonListDataDto } from '../dto/unscheduled-lesson-list-response.dto';
import { UnscheduledLessonListTransformationService } from './transformation/unscheduled-lesson-list-transformation.service';

@Injectable()
export class UnscheduledLessonListService {
  constructor(
    private readonly unscheduledLessonListRepository: UnscheduledLessonListRepository,
    private readonly transformationService: UnscheduledLessonListTransformationService,
  ) {}

  /**
   * Get unscheduled lessons with filters and pagination
   */
  async getUnscheduledLessons(
    locationId: number,
    searchDto: UnscheduledLessonListRequestDto,
  ): Promise<UnscheduledLessonListDataDto> {
    try {
      const { page = 1, limit = 20, showAll = false } = searchDto;

      // Get unscheduled lessons
      const { lessons, total } = await this.unscheduledLessonListRepository.getUnscheduledLessons(
        locationId,
        searchDto,
      );

      // When showAll is true, set limit to total so pagination reflects all items
      const effectiveLimit = showAll ? total : limit;
      const effectivePage = showAll ? 1 : page;

      // Transform results using transformation service
      return this.transformationService.transformLessonsData(
        lessons,
        total,
        effectivePage,
        effectiveLimit,
      );
    } catch (error) {
      console.error('Error in getUnscheduledLessons service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve unscheduled lessons: ${error.message}`);
    }
  }
}

