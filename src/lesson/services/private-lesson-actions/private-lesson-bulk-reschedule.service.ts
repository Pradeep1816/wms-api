import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Lesson } from '../../entities/lesson.entity';
import { LessonStatusEnum } from '../../enums/lesson-status';
import { PrivateLessonBulkRescheduleDto } from '../../dto/private-lesson-action-dto/private-lesson-bulk-reschedule.dto';
import { PrivateLessonBulkRescheduleRepository } from '../../repositories/private-lesson-actions/private-lesson-bulk-reschedule.repository';

/**
 * Bulk reschedule for private lessons from the listing page.
 *
 * - Orchestrates validation and delegation to the repository.
 * - Throws HTTP exceptions for all error cases.
 * - Returns a simple success message on success.
 */
@Injectable()
export class PrivateLessonBulkRescheduleService {
  constructor(
    private readonly bulkRescheduleRepository: PrivateLessonBulkRescheduleRepository,
  ) {}

  async bulkReschedule(
    locationId: number,
    dto: PrivateLessonBulkRescheduleDto,
    loggedUserId: number,
  ): Promise<{ message: string; rescheduledLessons: { oldLessonId: number; newLessonId: number }[] }> {
    const { lessonIds, newDate } = dto;

    if (!lessonIds?.length) {
      throw new BadRequestException('No lessons selected.');
    }

    return this.bulkRescheduleRepository.transaction(async (manager) => {
      const lessons = await this.loadAndValidateLessons(
        manager,
        locationId,
        lessonIds,
      );

      await this.ensureLessonsNotInvoiced(manager, lessons);

      const { rescheduledCount, skippedCount, rescheduledLessons } =
        await this.rescheduleLessons(manager, lessons, newDate, loggedUserId);

      return {
        message: this.buildResultMessage(rescheduledCount, skippedCount),
        rescheduledLessons,
      };
    });
  }

  /**
   * Load all requested lessons and validate:
   * - all exist
   * - all belong to the same location
   * - all share the same original date (Y-m-d)
   */
  private async loadAndValidateLessons(
    manager: EntityManager,
    locationId: number,
    lessonIds: number[],
  ): Promise<Lesson[]> {
    const lessons =
      await this.bulkRescheduleRepository.findLessonsForBulkReschedule(
        manager,
        lessonIds,
      );

    if (lessons.length !== lessonIds.length) {
      throw new BadRequestException('One or more lessons not found.');
    }

    const hasLessonFromAnotherLocation = lessons.some(
      (lesson) => lesson.course?.locationId !== locationId,
    );
    if (hasLessonFromAnotherLocation) {
      throw new BadRequestException(
        'One or more lessons do not belong to this location.',
      );
    }

    const firstDate = lessons[0].date.toISOString().slice(0, 10);
    const hasDifferentDate = lessons.some(
      (lesson) => lesson.date.toISOString().slice(0, 10) !== firstDate,
    );
    if (hasDifferentDate) {
      throw new BadRequestException('Choose lessons from the same date.');
    }

    const hasCanceledLesson = lessons.some(
      (lesson) => lesson.status === LessonStatusEnum.CANCELED,
    );
    if (hasCanceledLesson) {
      throw new BadRequestException(
        "One or more lessons are already rescheduled (canceled) and cannot be rescheduled again.",
      );
    }

    return lessons;
  }

  /**
   * Ensure none of the lessons are invoiced (legacy hasInvoice).
   */
  private async ensureLessonsNotInvoiced(
    manager: EntityManager,
    lessons: Lesson[],
  ): Promise<void> {
    const lessonIds = lessons.map((lesson) => lesson.id);
    const invoicedLessonIds =
      await this.bulkRescheduleRepository.findInvoicedLessonIds(
        manager,
        lessonIds,
      );

    if (invoicedLessonIds.length > 0) {
      throw new BadRequestException(
        "One of the chosen lessons is invoiced. You can't reschedule these lessons.",
      );
    }
  }

  /**
   * Perform the actual rescheduling for each lesson.
   * Returns how many lessons were rescheduled vs skipped.
   */
  private async rescheduleLessons(
    manager: EntityManager,
    lessons: Lesson[],
    newDate: string,
    loggedUserId: number,
  ): Promise<{
    rescheduledCount: number;
    skippedCount: number;
    rescheduledLessons: { oldLessonId: number; newLessonId: number }[];
  }> {
    let rescheduledCount = 0;
    let skippedCount = 0;
    const rescheduledLessons: { oldLessonId: number; newLessonId: number }[] =
      [];

    for (const lesson of lessons) {
      const { wasRescheduled, newLessonId } =
        await this.bulkRescheduleRepository.rescheduleSingleLesson(
          lesson,
          newDate,
          loggedUserId,
          manager,
        );

      if (wasRescheduled && newLessonId != null) {
        rescheduledCount++;
        rescheduledLessons.push({ oldLessonId: lesson.id, newLessonId });
      } else {
        skippedCount++;
      }
    }

    if (rescheduledCount === 0) {
      throw new BadRequestException(
        "Lessons can't be rescheduled because the chosen date already has some lessons.",
      );
    }

    return { rescheduledCount, skippedCount, rescheduledLessons };
  }

  /**
   * Build a user-friendly result message based on the counts.
   */
  private buildResultMessage(
    rescheduledCount: number,
    skippedCount: number,
  ): string {
    if (skippedCount === 0) {
      return 'Lesson has been rescheduled successfully.';
    }

    return `${rescheduledCount} lesson(s) rescheduled successfully and ${skippedCount} skipped.`;
  }
}

