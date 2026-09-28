import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrivateLessonEmailSelectedRepository } from '../../repositories/private-lesson-actions/private-lesson-email-selected.repository';
import { PrivateLessonEmailSelectedRequestDto, PrivateLessonEmailSelectedSendRequestDto } from '../../dto/private-lesson-action-dto/private-lesson-email-selected-request.dto';
import { MailerService } from '../../../shared/services/mailer.service';
import { EmailQueueService } from '../../../shared/services/email-queue.service';
import { LogRepository } from '../../../log/repositories/log.repository';
import { LogObjectRepository } from '../../../log/repositories/log-object.repository';
import { LogActivityRepository } from '../../../log/repositories/log-activity.repository';
import { LogObjectType } from '../../../log/enums/log-object-type.enum';
import { LogActivityType } from '../../../log/enums/log-activity.enum';
import { LocationRepository } from '../../../location/repositories/location.repository';
import { getCurrentESTDate } from '../../../utils/date-utils';

/**
 * Service for getting email form data (to, subject) for selected private lessons.
 * Used when user selects lessons to send an email (e.g. from private lesson listing).
 */
@Injectable()
export class PrivateLessonEmailSelectedService {
  private readonly baseUrl = process.env.BASE_URL || '';

  constructor(
    private readonly privateLessonEmailSelectedRepository: PrivateLessonEmailSelectedRepository,
    private readonly mailerService: MailerService,
    private readonly emailQueueService: EmailQueueService,
    private readonly logRepository: LogRepository,
    private readonly logObjectRepository: LogObjectRepository,
    private readonly logActivityRepository: LogActivityRepository,
    private readonly locationRepository: LocationRepository,
  ) {}

  async getEmailMultiCustomer(
    locationId: number,
    dto: PrivateLessonEmailSelectedRequestDto,
  ): Promise<any> {
    const { lessonIds } = dto;

    if (!lessonIds?.length) {
      throw new BadRequestException('No lessons selected.');
    }


    const validLessonIds =
      await this.privateLessonEmailSelectedRepository.findLessonIdsInLocation(
        lessonIds,
        locationId,
      );

    if (validLessonIds.length === 0) {
      throw new BadRequestException(
        'Lessons not found or do not belong to this location.',
      );
    }

    if (validLessonIds.length !== lessonIds.length) {
      throw new BadRequestException(
        'One or more lessons not found or do not belong to this location.',
      );
    }
    const emailMultiCustomer = await this.privateLessonEmailSelectedRepository.getEmailMultiCustomer(lessonIds);

    return {body: emailMultiCustomer};
  }

  /**
   * Send bulk email to selected private lesson customers.
   * Legacy: EmailController::actionLessonBulkEmailSend()
   */
  async sendEmailMultiCustomer(
    locationId: number,
    dto: PrivateLessonEmailSelectedSendRequestDto,
    currentUserId: number,
  ): Promise<{
    body: {
      jobId: string;
      queued: boolean;
      status: 'queued';
      isSent: boolean;
      partiallySent: boolean;
      recipientCount: number;
      normalizedRecipientCount: number;
      lessonCount: number;
      sentRecipientCount: number | null;
      failedRecipientCount: number | null;
      batchCount: number | null;
      failedBatches: Array<{ recipients: string[]; error: string }> | null;
    };
  }> {
    const { lessonIds, to, subject, content } = dto;

    if (!lessonIds?.length) {
      throw new BadRequestException('No lessons selected.');
    }

    // Validate lessons belong to location
    const validLessonIds = await this.privateLessonEmailSelectedRepository.findLessonIdsInLocation(
      lessonIds,
      locationId,
    );

    if (validLessonIds.length === 0) {
      throw new BadRequestException('Lessons not found or do not belong to this location.');
    }

    if (validLessonIds.length !== lessonIds.length) {
      throw new BadRequestException('One or more lessons not found or do not belong to this location.');
    }

    // Get location email for from/replyTo
    const location = await this.locationRepository.getLocationDetails(locationId);
    if (!location || !location.email) {
      throw new NotFoundException(`Location email not found for location ${locationId}`);
    }

    const normalizedRecipients = this.normalizeRecipients(to);
    if (!normalizedRecipients.length) {
      throw new BadRequestException('No valid recipient emails found.');
    }

    const job = this.emailQueueService.enqueue('private-lesson-email-selected', async () => {
      const bulkSendResult = await this.mailerService.sendBulkEmail({
        from: location.email,
        replyTo: location.email,
        to: normalizedRecipients,
        subject,
        html: content,
      });

      if (bulkSendResult.sentRecipients > 0) {
        await this.createLessonMailedLogs(validLessonIds, locationId, currentUserId);
      }
    });

    return {
      body: {
        jobId: job.id,
        queued: true,
        status: 'queued',
        isSent: false,
        partiallySent: false,
        recipientCount: to.length,
        normalizedRecipientCount: normalizedRecipients.length,
        lessonCount: validLessonIds.length,
        sentRecipientCount: null,
        failedRecipientCount: null,
        batchCount: null,
        failedBatches: null,
      },
    };
  }

  private normalizeRecipients(recipients: string[]): string[] {
    return Array.from(
      new Set(
        recipients
          .map((recipient) => recipient?.trim().toLowerCase())
          .filter((recipient): recipient is string => Boolean(recipient)),
      ),
    );
  }

  /**
   * Create lesson mailed log entries for each lesson
   */
  private async createLessonMailedLogs(
    lessonIds: number[],
    locationId: number,
    currentUserId: number,
  ): Promise<void> {
    try {
      const logObject = await this.logObjectRepository.findLogObjectByName(LogObjectType.LESSON);
      const logActivity = await this.logActivityRepository.findLogActivityByName(LogActivityType.TYPE_MAIL);

      if (!logObject || !logActivity) {
        console.error('Log object or activity not found for lesson mailed log');
        return;
      }

      // Get logged-in user's name
      const loggedUser = await this.privateLessonEmailSelectedRepository.findUserWithProfile(currentUserId);
      const loggedUserName = loggedUser?.profile
        ? `${loggedUser.profile.firstname || ''} ${loggedUser.profile.lastname || ''}`.trim()
        : loggedUser?.username || 'Unknown';

      // Fetch lessons with student info for log messages
      const lessons = await this.privateLessonEmailSelectedRepository.findLessonsWithStudentInfo(lessonIds);

      for (const lesson of lessons) {
        const message = `${loggedUserName} mailed this lesson details`;

        const lessonIndex = `lesson (ID: ${lesson.id})`;

        // Serialize lesson data
        const lessonData = JSON.stringify({
          id: lesson.id,
          courseId: lesson.courseId,
          teacherId: lesson.teacherId,
          date: lesson.date,
          duration: lesson.duration,
          status: lesson.status,
        });

        // Create log + link + history (matching legacy: only lesson link)
        const { log } = await this.logRepository.createLog(
          {
            logObjectId: logObject.id,
            logActivityId: logActivity.id,
            message,
            data: lessonData,
            locationId,
            createdOn: getCurrentESTDate(),
            createdUserId: currentUserId,
          },
          {
            index: lessonIndex,
            baseUrl: this.baseUrl,
            path: `/v2/admin/private-lessons/${lesson.id}`,
          },
          {
            instanceId: lesson.id,
            instanceType: LogObjectType.LESSON,
          },
        );
      }
    } catch (error) {
      // Log error but don't fail the email send - the email was already sent successfully
      console.error('Error creating lesson mailed logs:', error);
    }
  }
}
