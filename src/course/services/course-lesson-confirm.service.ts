import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CourseLessonConfirmRepository } from '../repositories/course-lesson-confirm.repository';
import { CourseLessonConfirmDataDto } from '../dto/course-lesson-confirm-response.dto';

/**
 * Service for confirming course lessons
 * Confirms both the course and all its unconfirmed lessons
 
 * PERFORMANCE NOTE:
 * - Current: Processes ALL lessons in single transaction (works for typical 4-36 lessons)
 * - Legacy: Processes 12 at a time, queues remaining via 'MakeLessonAsRoot' job
 * - If timeout/memory issues occur with large courses (50+ lessons), implement batching
 * - See repository comments for implementation details
 */
@Injectable()
export class CourseLessonConfirmService {
  constructor(
    private readonly repository: CourseLessonConfirmRepository,
  ) {}

  /**
   * Confirm group course lessons - 100% Legacy Identical
   * 
   * Steps:
   * 1. Confirm course (isConfirmed = 1)
   * 2. For each lesson:
   *    - makeAsRoot (create lesson_hierarchy)
   *    - Confirm lesson (isConfirmed = true)
   *    - setDiscount (SKIPPED for group courses)
   * 
   * @param courseId - The course ID to confirm
   * @param locationSlug - Location slug for redirect URL
   * @returns Confirmation result with redirect URL
   */
  async confirmGroupCourseLessons(
    courseId: number,
    locationSlug: string,
  ): Promise<CourseLessonConfirmDataDto> {
    const course = await this.repository.getCourseById(courseId);

    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    // Check if already confirmed
    if (course.isConfirmed === 1) {
      throw new BadRequestException(`Course with ID ${courseId} is already confirmed`);
    }

    const lessons = await this.repository.getUnconfirmedLessons(courseId);

    if (lessons.length === 0) {
      throw new BadRequestException(`No unconfirmed lessons found for course ${courseId}`);
    }

    const confirmedCount = await this.repository.runInTransaction(async (manager) => {
      // 1. Confirm course
      await this.repository.updateCourseConfirmStatus(courseId, 1, manager);

      let count = 0;
      for (const lesson of lessons) {
        // 2. makeAsRoot - create lesson_hierarchy record
        await this.repository.createLessonHierarchyRoot(lesson.id, manager);

        // 3. Confirm lesson
        await this.repository.updateLessonConfirmStatus(lesson.id, true, manager);

        // 4. setDiscount - SKIPPED for group courses (legacy does nothing)

        count++;
      }

      return count;
    });

    return {
      courseId,
      confirmedLessons: confirmedCount,
      url: `/admin/v2/${locationSlug}/group-courses/${courseId}`,
    };
  }
}
