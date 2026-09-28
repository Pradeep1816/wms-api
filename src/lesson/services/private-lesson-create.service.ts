import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LessonRepository } from '../repositories/lesson.repository';
import { CreatePrivateLessonRequestDto } from '../dto/create-private-lesson-request.dto';
import { CreatePrivateLessonResponseDto } from '../dto/create-private-lesson-response.dto';
import { LessonStatusEnum } from '../enums/lesson-status';
import { LogRepository } from '../../log/repositories/log.repository';
import { LogObjectRepository } from '../../log/repositories/log-object.repository';
import { LogActivityRepository } from '../../log/repositories/log-activity.repository';
import { LogObjectType } from '../../log/enums/log-object-type.enum';
import { LogActivityType } from '../../log/enums/log-activity.enum';
import { parseLocalDateTime } from '../../utils/date-utils';
import { User } from '../../user/entities/user.entity';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { ExtraLessonRateService } from './extra-lesson-rate.service';

@Injectable()
export class PrivateLessonCreateService {
  constructor(
    private readonly lessonRepository: LessonRepository,
    private readonly logRepository: LogRepository,
    private readonly logObjectRepository: LogObjectRepository,
    private readonly logActivityRepository: LogActivityRepository,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
    private readonly extraLessonRate: ExtraLessonRateService,
  ) {}

  /**
   * Create private lesson (extra lesson)
   * Matches legacy: actionCreatePrivate($studentId)
   */
  async createPrivateLesson(
    locationSlug: string,
    locationId: number,
    studentId: number,
    data: CreatePrivateLessonRequestDto,
    loggedUserId: number,
  ): Promise<CreatePrivateLessonResponseDto> {
    try {
      // 1. Find student
      const student = await this.lessonRepository.findStudentById(studentId);
      if (!student) {
        throw new NotFoundException(`Student with ID ${studentId} not found`);
      }

      // 2. Parse date and handle timezone correctly
      // Format: "YYYY-MM-DD HH:mm:ss" - treat as UTC to store exact time
      // Uses parseLocalDateTime utility to handle timezone conversion correctly
      let lessonDate: Date;
      try {
        lessonDate = parseLocalDateTime(data.date);
      } catch (error) {
        throw new BadRequestException(`Invalid date format: ${error.message}`);
      }

      // 3. Find or create extra course
      const course = await this.lessonRepository.findOrCreateExtraCourse(
        studentId,
        data.programId,
        data.teacherId,
        locationId,
        lessonDate,
      );

      // 4. The rate this extra lesson is priced at - see ExtraLessonRateService,
      // which the group-to-private conversion uses too.
      const programRate = await this.extraLessonRate.resolveAndRecord({
        courseId: course.id,
        studentId,
        programId: data.programId,
        locationId,
        duration: data.duration,
        lessonDate,
      });

      // 5. Create enrolment if it doesn't exist for this course
      // Matches legacy: course->createExtraLessonEnrolment() (only if new course)
      const existingEnrolment = await this.lessonRepository
        .findStudentEnrolmentByProgram(studentId, data.programId);
      
      // Check if enrolment exists for this specific course
      const courseEnrolment = existingEnrolment && existingEnrolment.courseId === course.id
        ? existingEnrolment
        : null;
      
      if (!courseEnrolment) {
        await this.lessonRepository.createExtraCourseEnrolment(
          course.id,
          studentId,
          loggedUserId,
        );

        // Create course schedule (matches legacy: courseSchedule() - only for new courses)
        await this.lessonRepository.createCourseSchedule(
          course.id,
          studentId,
          lessonDate,
          data.duration,
        );
      }

      // 6. Create lesson with program rate
      const lesson = await this.lessonRepository.createLesson(
        course.id,
        data.teacherId,
        lessonDate,
        data.duration,
        data.programId,
        locationId,
        data.isOnline || false,
        loggedUserId,
        programRate, // Pass the program rate to ensure it's set correctly
        LessonStatusEnum.SCHEDULED, // Extra lessons with a set date should be scheduled
      );

      // 7. Make lesson as root (set up hierarchy) - matches legacy query 56
      await this.lessonRepository.makeLessonAsRoot(lesson.id);

      const enrolmentDiscount =
        await this.extraLessonRate.applyEnrolmentDiscounts({
          lessonId: lesson.id,
          studentId,
          programId: data.programId,
          locationId,
          duration: data.duration,
          lessonDate,
          programRate,
        });

      // 8. Create private lesson record - matches legacy query 65. Pass the
      // copied reduction so its total and balance agree with the discount row.
      await this.lessonRepository.createPrivateLessonRecord(
        lesson.id,
        lessonDate,
        data.duration,
        programRate,
        Number(lesson.tax) || 0,
        enrolmentDiscount,
      );

      // Keep the stored customer account balance in sync so schedule isOwing is
      // correct immediately instead of waiting for the daily balance cron.
      await this.recalculateCustomerBalance(
        student.customerId,
        locationSlug,
        loggedUserId,
      );

      // 10. Create log entry - matches legacy: LessonLog::extraLessonCreate()
      await this.createExtraLessonLog(
        lesson.id,
        student,
        loggedUserId,
        locationId,
        locationSlug,
      );

      return {
        success: true,
        data: {
          lessonId: lesson.id,
          url: `/admin/v2/lesson/${lesson.id}`, // Match legacy URL format
        },
        message: 'Private lesson created successfully',
      };
    } catch (error) {
      console.error('Error in createPrivateLesson:', error);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        return {
          success: false,
          errors: {
            _general: [error.message],
          },
          message: 'Failed to create private lesson',
        };
      }

      return {
        success: false,
        errors: {
          _general: [error.message || 'Failed to create private lesson'],
        },
        message: 'Failed to create private lesson',
      };
    }
  }

  private async recalculateCustomerBalance(
    customerId: number,
    locationSlug: string,
    updatedByUserId: number,
  ): Promise<void> {
    if (!Number.isFinite(customerId) || customerId <= 0) {
      console.error(
        'Unable to recalculate customer balance after extra lesson creation: invalid customer ID',
      );
      return;
    }

    try {
      await this.customerBalanceRecalculatorService.recalculateAndPersist(
        customerId,
        {
          locationSlug,
          updatedByUserId,
        },
      );
    } catch (error) {
      // The lesson has already been created. Do not return a failure that could
      // cause the user to retry and create a duplicate lesson. The daily
      // customer balance cron remains the recovery path for sync failures.
      console.error(
        `Error recalculating customer balance after creating extra lesson for customer ${customerId}:`,
        error,
      );
    }
  }

  /**
   * Create log entry for extra lesson creation
   * Matches legacy: LessonLog::extraLessonCreate()
   */
  private async createExtraLessonLog(
    lessonId: number,
    student: any,
    loggedUserId: number,
    locationId: number,
    locationSlug: string,
  ): Promise<void> {
    try {
      // Get student full name
      const studentFullName = `${student.firstName || ''} ${student.lastName || ''}`.trim();

      // Get logged user identity - matches legacy: $loggedUser->publicIdentity
      // Follows same pattern as log-student.service.ts
      const loggedUser = await this.userRepository.findOne({
        where: { id: loggedUserId },
        relations: ['profile'],
      });

      if (!loggedUser) {
        throw new NotFoundException(`User with ID ${loggedUserId} not found`);
      }

      // Get user name - matches log-student.service.ts pattern exactly
      const loggedUserProfile = loggedUser.profile;
      let loggedUserIdentity = '';
      
      // Check if profile exists and has name fields (matching log-student.service.ts)
      if (loggedUserProfile?.firstname && loggedUserProfile?.lastname) {
        loggedUserIdentity = `${loggedUserProfile.firstname} ${loggedUserProfile.lastname}`.trim();
      } else if (loggedUserProfile?.firstname) {
        loggedUserIdentity = loggedUserProfile.firstname.trim();
      } else if (loggedUserProfile?.lastname) {
        loggedUserIdentity = loggedUserProfile.lastname.trim();
      } else if (loggedUser.username) {
        loggedUserIdentity = loggedUser.username;
      }
      
      // Final fallback if nothing found
      if (!loggedUserIdentity || loggedUserIdentity.length === 0) {
        loggedUserIdentity = `User ${loggedUserId}`;
      }

      // Get log object (TYPE_LESSON)
      const logObject = await this.logObjectRepository.findLogObjectByName(LogObjectType.LESSON);
      if (!logObject) {
        console.error('Log object not found for type:', LogObjectType.LESSON);
        return;
      }
      
      // Get log activity (TYPE_CREATE)
      const logActivity = await this.logActivityRepository.findLogActivityByName(LogActivityType.TYPE_CREATE);
      if (!logActivity) {
        console.error('Log activity not found for type:', LogActivityType.TYPE_CREATE);
        return;
      }

      // Create message: "{loggedUser} created new extra lesson for {{studentName}}"
      const message = `${loggedUserIdentity} created new extra lesson for {{${studentFullName}}}`;

      // Get student path - matches log-student.service.ts pattern
      const studentPath = `/admin/v2/${locationSlug}/students/${student.id}`;
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

      // Create log entry
      const logCreatedOn = new Date();
      
      await this.logRepository.createLog(
        {
          logObjectId: logObject.id,
          logActivityId: logActivity.id,
          message,
          data: JSON.stringify({ lessonId }),
          locationId,
          createdUserId: loggedUserId,
          createdOn: logCreatedOn,
        },
        {
          index: studentFullName,
          baseUrl,
          path: studentPath,
        },
        {
          instanceId: lessonId,
          instanceType: LogObjectType.LESSON,
        },
      );
    } catch (error) {
      // Log error but don't fail the lesson creation
      console.error('Error creating extra lesson log:', error);
    }
  }
}
