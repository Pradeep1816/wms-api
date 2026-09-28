import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LessonRepository } from '../repositories/lesson.repository';
import { ValidatePrivateLessonRequestDto } from '../dto/validate-private-lesson-request.dto';
import { ValidatePrivateLessonResponseDto } from '../dto/validate-private-lesson-response.dto';
import { ValidateLessonUpdateRequestDto } from '../dto/validate-lesson-update-request.dto';
import { LessonStatusEnum } from '../enums/lesson-status';
import { Lesson } from '../entities/lesson.entity';
import { Course } from '../../course/entities/course.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { ProgramTypeEnum } from '../../program/enums/program-type';

@Injectable()
export class LessonValidationService {
  constructor(
    private readonly lessonRepository: LessonRepository,
    @InjectRepository(Lesson)
    private readonly lessonEntityRepository: Repository<Lesson>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
  ) {}

  /**
   * Validate private lesson data
   * Matches legacy: actionValidatePrivate($studentId)
   */
  async validatePrivateLesson(
    locationId: number,
    studentId: number,
    data: ValidatePrivateLessonRequestDto,
  ): Promise<ValidatePrivateLessonResponseDto> {
    const errors: Record<string, string[]> = {};

    try {
      // 1. Find student enrolment for the program (matching legacy logic)
      // Note: Enrolment is optional for extra lessons - courseId can be null
      // The legacy code sets courseId to null if no enrolment is found, which is valid
      const studentEnrolment = await this.lessonRepository.findStudentEnrolmentByProgram(
        studentId,
        data.programId,
      );

      // For extra lessons, enrolment is not required - course will be created if needed
      // We still check for conflicts using studentId directly

      // 2. Parse and validate date
      const lessonDate = new Date(data.date);
      if (isNaN(lessonDate.getTime())) {
        errors.date = ['Invalid date format'];
        return {
          success: false,
          errors,
          message: 'Validation failed',
        };
      }

      // 3. Validate duration format (HH:mm:ss)
      const durationRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
      if (!durationRegex.test(data.duration)) {
        errors.duration = ['Invalid duration format. Expected HH:mm:ss'];
        return {
          success: false,
          errors,
          message: 'Validation failed',
        };
      }

      // 4. Check for lesson conflicts (overlapping lessons for the student)
      // Matches legacy StudentValidator: checks for student conflicts on same date with time overlap
      // This matches legacy query 7: checks for student conflicts on same date with time overlap
      const conflictingLesson = await this.lessonRepository.checkLessonConflict(
        studentId,
        lessonDate,
        data.duration,
        locationId,
      );

      if (conflictingLesson) {
        errors.date = ['Lesson time conflicts with student\'s another lesson'];
        return {
          success: false,
          errors,
          message: 'Validation failed',
        };
      }

      // All validations passed
      return {
        success: true,
        message: 'Validation passed',
      };
    } catch (error) {
      console.error('Error in validatePrivateLesson:', error);
      return {
        success: false,
        errors: {
          _general: [error.message || 'Validation error occurred'],
        },
        message: 'Validation failed',
      };
    }
  }

  /**
   * Validate lesson update (date, time, teacher changes)
   * Matches legacy: actionValidateOnUpdate($id)
   */
  async validateLessonUpdate(
    locationId: number,
    lessonId: number,
    data: ValidateLessonUpdateRequestDto,
  ): Promise<ValidatePrivateLessonResponseDto> {
    const errors: Record<string, string[]> = {};

    try {
      // 1. Find the lesson to update (matching legacy query 5)
      // Legacy: SELECT `lesson`.* FROM `lesson` LEFT JOIN `course` ON ... WHERE (`lesson`.`isDeleted`=FALSE) AND (`lesson`.`id`='4927969')
      const lesson = await this.lessonEntityRepository
        .createQueryBuilder('lesson')
        .leftJoinAndSelect('lesson.course', 'course', 'course.isDeleted = FALSE')
        .leftJoinAndSelect('course.program', 'program')
        .where('lesson.id = :lessonId', { lessonId })
        .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('course.locationId = :locationId', { locationId })
        .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
        .getOne();

      if (!lesson) {
        throw new NotFoundException(`Lesson with ID ${lessonId} not found or not in specified location`);
      }

      // Check if this is a group course
      // Group courses don't require student enrolment at lesson creation time
      // Students are enrolled later, so we skip student validation for group courses
      const isGroupCourse = lesson.course?.program?.type === ProgramTypeEnum.GROUP_PROGRAM;

      // 2. Get student ID from enrolment (only for private lessons)
      // Legacy: SELECT * FROM `enrolment` WHERE `courseId`=30854
      // Legacy: SELECT * FROM `student` WHERE `id`=12360
      // For group courses, enrolment check is skipped (matching legacy behavior)
      let studentId: number | null = null;
      
      if (!isGroupCourse) {
        const enrolment = await this.enrolmentRepository.findOne({
          where: { courseId: lesson.courseId },
          relations: ['student'],
        });

        if (!enrolment || !enrolment.student) {
          errors._general = ['Student not found for this lesson'];
          return {
            success: false,
            errors,
            message: 'Validation failed',
          };
        }

        studentId = enrolment.studentId;
      }

      // 3. Parse and validate date
      const lessonDate = new Date(data.date);
      if (isNaN(lessonDate.getTime())) {
        errors.date = ['Invalid date format'];
        return {
          success: false,
          errors,
          message: 'Validation failed',
        };
      }

      // 4. Validate duration format (HH:mm:ss)
      const durationRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
      if (!durationRegex.test(data.duration)) {
        errors.duration = ['Invalid duration format. Expected HH:mm:ss'];
        return {
          success: false,
          errors,
          message: 'Validation failed',
        };
      }

      // 5. Check for student conflict (only for private lessons, not group courses)
      // Group courses don't have a single student, so we skip this check
      if (!isGroupCourse && studentId) {
        const conflictingLesson = await this.lessonRepository.checkLessonConflict(
          studentId,
          lessonDate,
          data.duration,
          locationId,
          lessonId, // Exclude current lesson
        );

        if (conflictingLesson) {
          errors.date = ["Lesson time conflicts with student's another lesson"];
          return {
            success: false,
            errors,
            message: 'Validation failed',
          };
        }
      }

      // 6. Check for teacher conflict (overlapping lessons for the same teacher, excluding current lesson)
      const teacherConflict = await this.checkTeacherConflictForUpdate(
        data.teacherId,
        lessonDate,
        data.duration,
        locationId,
        lessonId,
      );

      if (teacherConflict) {
        errors.date = ["Lesson time conflicts with teacher's another lesson"];
        return {
          success: false,
          errors,
          message: 'Validation failed',
        };
      }

      // All validations passed
      return {
        success: true,
        message: 'Validation passed',
      };
    } catch (error) {
      console.error('Error in validateLessonUpdate:', error);
      if (error instanceof NotFoundException) {
        return {
          success: false,
          errors: {
            _general: [error.message],
          },
          message: 'Validation failed',
        };
      }
      return {
        success: false,
        errors: {
          _general: [error.message || 'Validation error occurred'],
        },
        message: 'Validation failed',
      };
    }
  }

  /**
   * Check for teacher conflict when updating a lesson
   * Two datetime ranges overlap if: start1 < end2 AND start2 < end1
   */
  private async checkTeacherConflictForUpdate(
    teacherId: number,
    date: Date,
    duration: string,
    locationId: number,
    excludeLessonId: number,
  ): Promise<Lesson | null> {
    // Format date as MySQL datetime string using UTC to match database storage
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const dateTimeStr = `${dateStr} ${hours}:${minutes}:${seconds}`;

    const queryBuilder = this.lessonEntityRepository
      .createQueryBuilder('lesson')
      .leftJoin('lesson.course', 'course', 'course.isDeleted = FALSE')
      .where('lesson.status IN (:...statuses)', { statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED] })
      .andWhere('lesson.teacherId = :teacherId', { teacherId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.isPresent = :isPresent', { isPresent: true })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('DATE(lesson.date) = :dateStr', { dateStr })
      .andWhere('lesson.id != :excludeLessonId', { excludeLessonId })
      .andWhere(
        // Simplified overlap check: lesson.date < (new lesson end) AND (new lesson start) < (existing lesson end)
        `lesson.date < ADDTIME(:dateTime, :duration) AND :dateTime < ADDTIME(lesson.date, lesson.duration)`,
        { dateTime: dateTimeStr, duration }
      );

    return await queryBuilder.getOne();
  }
}

