import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CourseLessonRepository } from '../../lesson/repositories/course-lesson.repository';
import { CourseLessonRequestDto } from '../dto/course-lesson-request.dto';
import { CourseLessonDataDto } from '../dto/course-lesson-response.dto';
import { CourseLessonTransformationService } from './transformation/course-lesson-transformation.service';

@Injectable()
export class CourseLessonService {
  constructor(
    private readonly courseLessonRepository: CourseLessonRepository,
    private readonly transformationService: CourseLessonTransformationService,
  ) {}

  /**
   * Get lessons for a specific course
   * @param courseId - Course ID
   * @param searchDto - Pagination parameters
   * @returns Course lessons with pagination
   */
  async getCourseLessons(
    locationId: number,
    courseId: number,
    searchDto: CourseLessonRequestDto,
  ): Promise<CourseLessonDataDto> {
    try {
      const { page = 1, limit = 20 } = searchDto;

      // Get lessons from repository
      const { lessons, total } =
        await this.courseLessonRepository.getLessonsByCourseId(locationId, {
          courseId,
          page,
          limit,
        });

        if (lessons.length === 0) {
          throw new NotFoundException('No lessons found for this course');
        }

      // Transform results using transformation service
      return this.transformationService.transformLessonsData(
        lessons,
        total,
        page,
        limit,
      );
    } catch (error) {
      console.error('Error in getCourseLessons service:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to retrieve course lessons: ${error.message}`,
      );
    }
  }
}
