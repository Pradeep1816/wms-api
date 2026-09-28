import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CourseReviewLessonDeleteRepository } from '../repositories/course-review-lesson-delete.repository';

@Injectable()
export class CourseReviewLessonDeleteService {
  constructor(private readonly courseReviewLessonDeleteRepository: CourseReviewLessonDeleteRepository) {}

  async deleteReviewLesson(params: {
    courseId: number;
    lessonId: number;
    locationId: number;
    locationSlug: string;
    loggedUserId: number;
  }): Promise<void> {
    try {
      const { courseId, lessonId, locationId, locationSlug, loggedUserId } = params;

      const isCourseExists = await this.courseReviewLessonDeleteRepository.getCourse(courseId, locationId);
      if (!isCourseExists) {
        throw new NotFoundException(
          `Course with ID ${courseId} not found in location ${locationSlug}`,
        );
      }

      const lesson = await this.courseReviewLessonDeleteRepository.getLessonForCourse(
        lessonId,
        courseId,
      );
      if (!lesson) {
        throw new NotFoundException(
          `Lesson with ID ${lessonId} not found for course ${courseId} in location ${locationSlug}`,
        );
      }

      // Prevent deletion if invoiced (same as update rule)
      const isLessonInvoiced = await this.courseReviewLessonDeleteRepository.isLessonInvoiced(lesson.id);
      if (isLessonInvoiced) {
        throw new BadRequestException("Lesson can't be deleted once invoiced.");
      }

      await this.courseReviewLessonDeleteRepository.delete(lesson.id, loggedUserId);

      // Recalculate programRate for remaining lessons (legacy: Lesson::calcLessonPrice())
      await this.courseReviewLessonDeleteRepository.recalcProgramRatesForCourse(courseId);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(error?.message || 'Failed to delete lesson');
    }
  }
}

