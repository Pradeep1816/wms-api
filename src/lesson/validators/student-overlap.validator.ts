import { Injectable, BadRequestException } from '@nestjs/common';
import { LessonRepository } from '../repositories/lesson.repository';
import { LocationService } from '../../location/services/location.service';
import { ProgramTypeEnum } from '../../program/enums/program-type';

/**
 * Validate if a student is already occupied with another lesson
 * during the same time period (mirrors legacy StudentValidator).
 */
@Injectable()
export class StudentOverlapValidator {
  constructor(
    private readonly lessonRepository: LessonRepository,
    private readonly locationService: LocationService,
  ) {}

  /**
   * Validate student overlap for a given lesson/time.
   *
   * @param lessonId     - Current lesson ID (to exclude from search)
   * @param lessonDate   - Proposed new lesson datetime
   * @param duration     - Duration string (HH:mm or HH:mm:ss)
   * @param locationSlug - Location slug for resolving locationId
   * @param courseId     - Course ID (kept for parity with legacy signature; not strictly needed)
   */
  async validateStudentOverlap(
    lessonId: number,
    lessonDate: Date,
    duration: string,
    locationId: number,
  ): Promise<void> {

    // Load lesson with course + program + enrolments using existing helper
    const lesson = await this.lessonRepository.findLessonById(lessonId, locationId);
    if (!lesson || !lesson.course) {
      throw new BadRequestException('Lesson not found');
    }

    // Only validate overlap for private programs (same as legacy StudentValidator)
    if (lesson.course.program?.type !== ProgramTypeEnum.PRIVATE_PROGRAM) {
      return;
    }

    const enrolment = lesson.course.enrolments?.[0];
    const studentId = enrolment?.studentId;

    if (!studentId) {
      // No student bound (not a standard private lesson) – nothing to validate
      return;
    }

    // Reuse existing repository helper that implements the overlap logic
    const conflict = await this.lessonRepository.checkLessonConflict(
      studentId,
      lessonDate,
      duration,
      locationId,
      lessonId,
    );

    if (conflict) {
      throw new BadRequestException(
        "Lesson time conflicts with student's another lesson",
      );
    }
  }
}

