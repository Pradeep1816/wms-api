import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { LessonExplodeRepository } from '../../repositories/private-lesson-actions/lesson-explode.repository';
import { 
  LessonExplodeRequestDto, 
  LessonExplodeResponseDto, 
  CanExplodeResponseDto,
  ExplodedLessonDto,
} from '../../dto/private-lesson-action-dto/lesson-explode.dto';
import { Lesson } from '../../entities/lesson.entity';
import { LessonStatusEnum } from '../../enums/lesson-status';

@Injectable()
export class LessonExplodeService {
  constructor(
    private readonly lessonExplodeRepository: LessonExplodeRepository,
  ) {}

  /**
   * Check if a lesson can be explodedx
   * 
   * Rules:
   * 1. Must be a private lesson
   * 2. Must be unscheduled
   * 3. Must not already be exploded
   * 4. Must not be expired
   * 5. Must not have an invoice
   */
  async canExplode(lessonId: number): Promise<CanExplodeResponseDto> {
    const lesson = await this.lessonExplodeRepository.findLessonWithRelations(lessonId);

    if (!lesson) {
      return {
        canExplode: false,
        reason: 'Lesson not found',
        lessonId,
        checks: {
          isPrivate: false,
          isUnscheduled: false,
          notExploded: false,
          notExpired: false,
          notInvoiced: false,
        },
      };
    }

    const checks = {
      isPrivate: await this.lessonExplodeRepository.isPrivateLesson(lessonId),
      isUnscheduled: lesson.status === LessonStatusEnum.UNSCHEDULED,
      notExploded: lesson.isExploded !== 1,
      notExpired: !(await this.lessonExplodeRepository.isExpired(lessonId)),
      notInvoiced: !(await this.lessonExplodeRepository.hasInvoice(lessonId)),
    };

    const canExplode = Object.values(checks).every(check => check);

    let reason: string | undefined;
    if (!canExplode) {
      if (!checks.isPrivate) {
        reason = 'Only private lessons can be exploded';
      } else if (!checks.isUnscheduled) {
        reason = 'Only unscheduled lessons can be exploded';
      } else if (!checks.notExploded) {
        reason = 'Lesson is already exploded';
      } else if (!checks.notExpired) {
        reason = 'Lesson has expired';
      } else if (!checks.notInvoiced) {
        reason = 'Invoiced lessons cannot be exploded';
      }
    }

    return {
      canExplode,
      reason,
      lessonId,
      checks,
    };
  }

  /**
   * Validate that lessons can be exploded
   * Throws exception if any lesson cannot be exploded
   */
  async validateCanExplode(lessonIds: number[]): Promise<void> {
    for (const lessonId of lessonIds) {
      const check = await this.canExplode(lessonId);
      
      if (!check.canExplode) {
        throw new BadRequestException(
          `Lesson ${lessonId} cannot be exploded: ${check.reason}`,
        );
      }
    }
  }

  /**
   * Check if lessons belong to the location
   */
  async validateLessonsInLocation(lessonIds: number[], locationId: number): Promise<void> {
    for (const lessonId of lessonIds) {
      const lesson = await this.lessonExplodeRepository.findLessonWithRelations(lessonId);
      
      if (!lesson) {
        throw new BadRequestException(`Lesson ${lessonId} not found`);
      }

      if (lesson.course?.locationId !== locationId) {
        throw new ForbiddenException(
          `Lesson ${lessonId} does not belong to this location`,
        );
      }
    }
  }

  /**
   * Explode (split) lessons into 15-minute segments
   * 
   * Process:
   * 1. Validate all lessons can be exploded
   * 2. For each lesson:
   *    a. Calculate number of 15-min segments
   *    b. Create new lessons for each segment
   *    c. Distribute cost proportionally
   *    d. Clone and adjust discounts
   *    e. Redistribute payments
   *    f. Create lesson hierarchy (reschedule relationship)
   *    g. Cancel original lesson
   */
  async explodeLessons(
    locationId: number,
    dto: LessonExplodeRequestDto,
    userId: number,
  ): Promise<LessonExplodeResponseDto[]> {
    // Validate location ownership
    await this.validateLessonsInLocation(dto.lessonIds, locationId);

    // Validate can explode
    await this.validateCanExplode(dto.lessonIds);

    const results: LessonExplodeResponseDto[] = [];

    for (const lessonId of dto.lessonIds) {
      const lesson = await this.lessonExplodeRepository.findLessonWithRelations(lessonId);
      
      if (!lesson) {
        throw new BadRequestException(`Lesson ${lessonId} not found`);
      }

      // Get enrolment for payment distribution
      const enrolment = await this.lessonExplodeRepository.getEnrolment(lessonId);
      if (!enrolment) {
        throw new BadRequestException(`No enrolment found for lesson ${lessonId}`);
      }

      // Execute explode in transaction
      const { explodedLessons, originalLessonId } = await this.lessonExplodeRepository.executeExplode(
        lesson,
        enrolment.id,
        userId,
      );

      // Map to response DTO
      const explodedLessonDtos: ExplodedLessonDto[] = explodedLessons.map(l => ({
        id: l.id,
        courseId: l.courseId,
        teacherId: l.teacherId,
        date: l.date,
        duration: l.duration,
        status: l.status,
        isExploded: l.isExploded,
        programRate: Number(l.programRate),
      }));

      results.push({
         originalLessonId,
        explodedLessons: explodedLessonDtos,
        totalSegments: explodedLessons.length,
        studentId: enrolment.studentId,  // For redirect URL
      });
    }

    return results;
  }

  /**
   * Get explode preview/status for lessons
   * Returns information about whether lessons can be exploded
   */
  async getExplodeStatus(lessonIds: number[]): Promise<CanExplodeResponseDto[]> {
    const results: CanExplodeResponseDto[] = [];

    for (const lessonId of lessonIds) {
      const status = await this.canExplode(lessonId);
      results.push(status);
    }

    return results;
  }
}
