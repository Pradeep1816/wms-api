import { Injectable, BadRequestException } from '@nestjs/common';
import { CourseLessonEditOnlineTypeRepository } from '../repositories/course-lesson-edit-online-type.repository';
import { CourseLessonEditOnlineTypeDto, CourseLessonEditOnlineTypeResponseDto } from '../dto/course-lesson-edit-online-type.dto';

@Injectable()
export class CourseLessonEditOnlineTypeService {
  constructor(
    private readonly courseLessonEditOnlineTypeRepository: CourseLessonEditOnlineTypeRepository,
  ) {}

  /**
   * Edit online type for group lessons
   */
  async editOnlineType(
    courseId: number,
    dto: CourseLessonEditOnlineTypeDto,
    locationId: number,
    userId: number,
  ): Promise<CourseLessonEditOnlineTypeResponseDto> {
    const { lessonIds, online } = dto;

    // 1. Validate course exists for location
    const course = await this.courseLessonEditOnlineTypeRepository.findCourseById(
      courseId,
      locationId,
    );

    if (!course) {
      return {
        status: false,
        error: 'Course not found or does not belong to this location',
      };
    }

    // 2. Validate lessons exist and belong to this course
    const lessons = await this.courseLessonEditOnlineTypeRepository.findLessonsByIdsAndCourse(
      lessonIds,
      courseId,
    );

    if (lessons.length === 0) {
      return {
        status: false,
        error: 'Lessons not found or do not belong to this course',
      };
    }

    if (lessons.length !== lessonIds.length) {
      return {
        status: false,
        error: 'Some lessons were not found or do not belong to this course',
      };
    }

    // 3. Update the online type
    try {
      await this.courseLessonEditOnlineTypeRepository.updateOnlineType(
        lessonIds,
        online,
        userId,
      );

      // 5. Return success response
      const message = online === 1
        ? 'Group Lesson Edited To Make Online Class Successfully'
        : 'Group Lesson Edited To Make In Class Successfully';

      return {
        status: true,
        message,
        courseId,
        updatedBy: userId,
      };
    } catch (error) {
      console.error('Error updating online type:', error);
      throw new BadRequestException('Failed to update online type');
    }
  }
}
