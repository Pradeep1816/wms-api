import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrivateLessonListRepository } from '../repositories/private-lesson-list.repository';
import { PrivateLessonListRequestDto } from '../dto/private-lesson-list-request.dto';
import { PrivateLessonListDataDto } from '../dto/private-lesson-list-response.dto';
import { PrivateLessonListTransformationService } from './transformation/private-lesson-list-transformation.service';

@Injectable()
export class PrivateLessonListService {
  constructor(
    private readonly privateLessonListRepository: PrivateLessonListRepository,
    private readonly transformationService: PrivateLessonListTransformationService,
  ) {}

  /**
   * Get private lessons with filters and pagination
   */
  async getPrivateLessons(
    locationId: number,
    searchDto: PrivateLessonListRequestDto,
  ): Promise<PrivateLessonListDataDto> {
    try {
      const { page = 1, limit = 20 } = searchDto;

      // Get private lessons
      const {
        lessons,
        total,
        customerEmailByLessonId,
        customerEmailsByLessonId,
      } =
        await this.privateLessonListRepository.getPrivateLessons(
          locationId,
          searchDto,
        );

      // Transform results using transformation service
      return this.transformationService.transformLessonsData(
        lessons,
        customerEmailByLessonId,
        customerEmailsByLessonId,
        total,
        page,
        limit,
      );
    } catch (error) {
      console.error('Error in getPrivateLessons service:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to retrieve private lessons: ${error.message}`,
      );
    }
  }
}
