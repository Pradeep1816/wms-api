import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EnrolmentLessonsDataDto } from '../dto/enrolment-lesson-response.dto';
import { EnrolmentLessonRequestDto } from '../dto/enrolment-lesson-request.dto';
import { EnrolmentLessonRepository } from '../repositories/enrolment-lesson.repository';
import { EnrolmentLessonTransformationService } from './transformations/enrolment-lesson-transformation.service';
import { ProgramTypeEnum } from '../../program/enums/program-type';

@Injectable()
export class EnrolmentLessonService {
  constructor(
    private readonly enrolmentLessonRepository: EnrolmentLessonRepository,
    private readonly enrolmentLessonTransformationService: EnrolmentLessonTransformationService,
  ) {}

  /**
   * Get lessons for an enrolment
   * Private: fixed 12 lessons, Group: paginated (default 10 per page)
   */
  async getEnrolmentLessons(
    locationId: number,
    enrolmentId: number,
    query: EnrolmentLessonRequestDto,
  ): Promise<EnrolmentLessonsDataDto> {
    try {

      // Validate enrolment and get program type
      const enrolment = await this.enrolmentLessonRepository.findEnrolmentWithProgram(
        enrolmentId,
        locationId,
      );

      if (!enrolment) {
        throw new NotFoundException('Enrolment not found');
      }

      const programType = enrolment.course?.program?.type;
      const courseId = enrolment.course.id;

      if (programType === ProgramTypeEnum.PRIVATE_PROGRAM) {
        // Private lessons: fixed limit of 12, no pagination
        const lessons = await this.enrolmentLessonRepository.getPrivateLessons(courseId);
        return this.enrolmentLessonTransformationService.transformLessonsData(lessons);
      } else {
        // Group lessons: with pagination
        const result = await this.enrolmentLessonRepository.getGroupLessons(
          courseId,
          enrolmentId,
          query,
        );
        return this.enrolmentLessonTransformationService.transformLessonsDataWithPagination(
          result.lessons,
          result.total,
          query.page || 1,
          query.limit || 10,
        );
      }
    } catch (error) {
      console.error('Error in getEnrolmentLessons service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve enrolment lessons: ${error.message}`);
    }
  }
}
