import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LessonService } from '../../lesson/services/lesson.service';
import { UpdateLessonFieldRequestDto } from '../../lesson/dto/update-lesson-field-request.dto';
import { UpdateLessonRequestDto } from '../../lesson/dto/update-lesson-request.dto';
import { calculateNextWeekdayDateTime } from '../../utils/date-utils';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import { CourseLessonReviewService } from './course-lesson-review.service';

@Injectable()
export class CourseLessonApplyAllService {
  constructor(
    private readonly lessonService: LessonService,
    private readonly courseLessonReviewService: CourseLessonReviewService,
  ) {}

  async applyAllGroupCourseLessons(
    lessonId: number,
    locationId: number,
    body: UpdateLessonFieldRequestDto,
    userId: number,
  ): Promise<{ updatedCount: number; totalCount: number }> {
    const sourceLesson = await this.lessonService.getLessonEntityById(lessonId, locationId);
    if (!sourceLesson?.courseId) {
      throw new NotFoundException('Lesson or course not found');
    }
    if (sourceLesson.course?.program?.type !== ProgramTypeEnum.GROUP_PROGRAM) {
      throw new BadRequestException('Apply All is only available for Group Courses');
    }

    const targetDate = this.getTargetDate(body);
    if (!targetDate) {
      throw new BadRequestException('A valid date and time are required');
    }

    const review = await this.courseLessonReviewService.getLessonReview(
      sourceLesson.courseId,
      locationId,
      true,
    );
    const conflictedIds = new Set(
      review.lessons.filter((lesson) => lesson.isConflict).map((lesson) => lesson.id),
    );
    const draftLessons = await this.lessonService.getUnconfirmedLessonsByCourse(sourceLesson.courseId);
    const conflictedLessons = draftLessons.filter((lesson) => conflictedIds.has(lesson.id));

    const results = await Promise.all(
      conflictedLessons.map((lesson) => {
        const updateData: UpdateLessonRequestDto = {
          date: calculateNextWeekdayDateTime(new Date(lesson.date), targetDate).toISOString(),
        };
        if (body.teacherId !== undefined) updateData.teacherId = body.teacherId;
        if (body.duration) updateData.duration = body.duration;

        return this.lessonService.updateLesson(lesson.id, locationId, updateData, userId);
      }),
    );

    return {
      updatedCount: results.filter(Boolean).length,
      totalCount: conflictedLessons.length,
    };
  }

  private getTargetDate(body: UpdateLessonFieldRequestDto): Date | null {
    const dateValue = body.date || body.goToDate;
    if (!dateValue) return null;

    const parsed = body.date && /T/.test(body.date)
      ? new Date(body.date)
      : this.parseCalendarDate(body.goToDate || body.date!);
    if (body.hour !== undefined && body.minute !== undefined) {
      parsed.setUTCHours(Number(body.hour), Number(body.minute), 0, 0);
    }

    return isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseCalendarDate(value: string): Date {
    const isoDate = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
    if (isoDate) {
      return new Date(Date.UTC(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3])));
    }

    const legacyDate = /^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/.exec(value.trim());
    if (legacyDate) {
      const month = new Date(`${legacyDate[1]} 1, 2000`).getMonth();
      if (!isNaN(month)) {
        return new Date(Date.UTC(Number(legacyDate[3]), month, Number(legacyDate[2])));
      }
    }

    const parsed = new Date(value);
    return isNaN(parsed.getTime())
      ? parsed
      : new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  }
}
