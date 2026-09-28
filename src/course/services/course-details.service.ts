import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CourseDetailsRepository } from '../repositories/course-details.repository';
import { CourseDetailsDataDto } from '../dto/course-details-response.dto';
import { CourseDetailsTransformationService } from './transformation/course-details-transformation.service';

@Injectable()
export class CourseDetailsService {
  constructor(
    private readonly courseDetailsRepository: CourseDetailsRepository,
    private readonly transformationService: CourseDetailsTransformationService,
  ) {}

  /**
   * Get course details by ID
   * @param locationId - Location ID
   * @param courseId - Course ID
   * @returns Course details with Program, Teacher, Rate, Online, Schedule
   */
  async getCourseDetails(
    locationId: number,
    courseId: number,
  ): Promise<CourseDetailsDataDto> {
    try {
      const course = await this.courseDetailsRepository.findCourseById(
        locationId,
        courseId,
      );

      if (!course) {
        throw new NotFoundException(
          `Course with ID ${courseId} not found`,
        );
      }

      return this.transformationService.transformToDto(course);
    } catch (error) {
      console.error('Error in getCourseDetails service:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to retrieve course details: ${error.message}`,
      );
    }
  }
}
