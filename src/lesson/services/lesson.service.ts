import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LessonEditScheduleResponseDto } from '../dto/lesson-edit-schedule-response.dto';
import { LessonRepository } from '../repositories/lesson.repository';
import { LessonTransformationService } from './transformation/lesson-transformation.service';
import { UpdateLessonRequestDto } from '../dto/update-lesson-request.dto';
import { Lesson } from '../entities/lesson.entity';
import { LessonStatusEnum } from '../enums/lesson-status';
import { CustomerAccount } from '../../customer/entities/customer-account.entity';
import { LessonConfirmationService } from './lesson-confirmation.service';
import { parseLocalDateTime } from '../../utils/date-utils';

@Injectable()
export class LessonService {
  constructor(
    private readonly lessonRepository: LessonRepository,
    private readonly transformationService: LessonTransformationService,
    @InjectRepository(Lesson)
    private readonly lessonEntityRepository: Repository<Lesson>,
    @InjectRepository(CustomerAccount)
    private readonly customerAccountRepository: Repository<CustomerAccount>,
    @Inject(forwardRef(() => LessonConfirmationService))
    private readonly lessonConfirmationService: LessonConfirmationService,
  ) {}

  /**
   * Get lesson data for edit schedule form
   */
  async getLessonById(
    lessonId: number,
    locationSlug: string,
    locationId: number,
  ): Promise<LessonEditScheduleResponseDto> {
    try {
      const lesson = await this.lessonRepository.findLessonById(lessonId, locationId);

      if (!lesson) {
        throw new NotFoundException(`Lesson with id ${lessonId} not found in location ${locationSlug}`);
      }

      // Transform lesson entity to DTO
      return this.transformationService.transformToDto(lesson);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to retrieve lesson data: ${error.message}`);
    }
  }

  /**
   * Update lesson date, time, or teacher
   * Used for editing conflicted lessons from review page
   * Matches legacy: updates lesson, originalDate, and customer account balance
   */
  async updateLesson(
    lessonId: number,
    locationId: number,
    updateData: UpdateLessonRequestDto,
    loggedUserId: number,
  ): Promise<Lesson> {
    // Find lesson with course and enrolment relations
    const lesson = await this.lessonRepository.findLessonById(lessonId, locationId);

    if (!lesson) {
      throw new NotFoundException(`Lesson with id ${lessonId} not found`);
    }

    // Check if lesson is confirmed (can't edit confirmed lessons from review)
    if (lesson.isConfirmed) {
      throw new BadRequestException('Cannot edit confirmed lessons from review page');
    }

    // Store original date before updating (for originalDate field)
    const oldDate = lesson.date;

    // Update date if provided
    if (updateData.date) {
      // Parse the date string - it can be in ISO format or local datetime format
      let newDate: Date;
      try {
        // Try parsing as ISO string first
        const dateObj = new Date(updateData.date);
        if (!isNaN(dateObj.getTime())) {
          // If it's a valid ISO date, use it directly
          newDate = dateObj;
        } else {
          // Otherwise, try parseLocalDateTime format (YYYY-MM-DD HH:mm:ss)
          newDate = parseLocalDateTime(updateData.date);
        }
      } catch {
        // Fallback to parseLocalDateTime
        newDate = parseLocalDateTime(updateData.date);
      }
      
      lesson.date = newDate;
      
      // Set originalDate to the new date (matching legacy behavior: UPDATE lesson SET originalDate='...' WHERE id=...)
      lesson.originalDate = newDate;
    }

    // Update teacher if provided
    if (updateData.teacherId !== undefined) {
      lesson.teacherId = updateData.teacherId;
    }

    // Update duration if provided
    if (updateData.duration) {
      lesson.duration = updateData.duration;
    }

    const updateStatus = (updateData as { status?: LessonStatusEnum }).status;
    if (updateStatus !== undefined) {
      lesson.status = updateStatus;
    }

    // Update updatedByUserId
    lesson.updatedByUserId = loggedUserId;

    // Save the lesson (matching legacy query 1: UPDATE lesson SET ...)
    const updatedLesson = await this.lessonEntityRepository.save(lesson);

    // Update customer account balance (matching legacy query 2: UPDATE customer_account SET balance=...)
    // Get customer ID (userId) from enrolment
    if (lesson.course && lesson.course.enrolments && lesson.course.enrolments.length > 0) {
      const enrolment = lesson.course.enrolments[0];
      if (enrolment.student && enrolment.student.user) {
        const userId = enrolment.student.user.id;
        // Use LessonConfirmationService to update customer balance (full calculation)
        await this.lessonConfirmationService.updateCustomerBalance(userId);
      }
    }

    return updatedLesson;
  }

  /**
   * Get lesson entity by ID (returns raw entity, not DTO)
   * Used internally for getting courseId and other entity properties
   */
  async getLessonEntityById(lessonId: number, locationId: number): Promise<Lesson | null> {
    return await this.lessonRepository.findLessonById(lessonId, locationId);
  }

  /**
   * Get all unconfirmed lessons for a course
   * Used for "Apply All" functionality
   */
  async getUnconfirmedLessonsByCourse(courseId: number): Promise<Lesson[]> {
    return await this.lessonEntityRepository.find({
      where: {
        courseId,
        isDeleted: false,
        isConfirmed: false,
      },
      order: {
        date: 'ASC',
      },
    });
  }
}
