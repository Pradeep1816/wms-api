import { Injectable } from '@nestjs/common';
import { Lesson } from '../../entities/lesson.entity';
import { EmailTemplate } from '../../../notification/entities/email-template.entity';
import {
  LessonEmailStatementDataDto,
  LessonDetailsDto,
  EmailTemplateDto,
} from '../../dto/lesson-email-statement-response.dto';
import { formatDate, formatLongDateUTC } from '../../../utils/date-utils';
import { formatEasternTime, formatDuration } from '../../../utils/formatters';
import { publicProgramName } from '../../../pricing/utils/program-public-name';


@Injectable()
export class LessonEmailStatementTransformationService {
  /**
   * Transform raw lesson and email template data to response DTO
   */
  transformEmailStatementData(
    lesson: Lesson,
    emails: string[],
    emailTemplate: EmailTemplate | null,
    originalLesson: Lesson | null = null,
  ): LessonEmailStatementDataDto {
    const lessonDetails = this.formatLessonDetails(lesson, originalLesson);
    const template = this.formatEmailTemplate(emailTemplate, lesson, emails);

    return {
      body: {
        lesson: lessonDetails,
      },
      emailTemplate: template,
    };
  }

  /**
   * Format lesson details with proper date/time formatting
   */
  private formatLessonDetails(lesson: Lesson, originalLesson: Lesson | null = null): LessonDetailsDto {
    const enrolment = lesson.course?.enrolments?.[0];
    const student = enrolment?.student;
    const customer = student?.user;
    const customerProfile = customer?.profile;
    const teacher = lesson.teacher;
    const teacherProfile = teacher?.profile;
    const privateLesson = lesson.privateLesson?.[0];

    // Build customer name with fallbacks
    const customerName = (() => {
      if (customerProfile?.firstname || customerProfile?.lastname) {
        return `${customerProfile.firstname || ''} ${customerProfile.lastname || ''}`.trim();
      }
      if (customer?.username) {
        return customer.username;
      }
      return 'N/A';
    })();

    // Build teacher name with fallbacks
    const teacherName = (() => {
      if (teacherProfile?.firstname || teacherProfile?.lastname) {
        return `${teacherProfile.firstname || ''} ${teacherProfile.lastname || ''}`.trim();
      }
      if (teacher?.username) {
        return teacher.username;
      }
      return 'N/A';
    })();

    // Check if lesson is rescheduled or unscheduled to show original date
    const isRescheduled = lesson.status === 1; // LessonStatusEnum.RESCHEDULED
    const isUnscheduled = lesson.status === 5; // LessonStatusEnum.UNSCHEDULED
    const showOriginalDate = (isRescheduled || isUnscheduled) && lesson.originalDate;

    const result: any = {
      student: student ? `${student.firstName} ${student.lastName}`.trim() : '',
      customer: customerName,
      teacher: teacherName,
    };

    // Only add originalDate if it exists (for rescheduled/unscheduled lessons)
    if (showOriginalDate) {
      result.originalDate = formatLongDateUTC(lesson.originalDate);
    }

    result.scheduledDate = lesson.date ? formatLongDateUTC(lesson.date) : '';
    result.time = lesson.date ? formatEasternTime(lesson.date) : '';
    result.duration = lesson.duration ? formatDuration(lesson.duration) : '00:00';
    result.status = lesson.getStatus();
    result.expiryDate = privateLesson?.expiryDate ? formatDate(privateLesson.expiryDate) : '';
    result.rescheduleStatement = this.buildRescheduleStatement(lesson, originalLesson);

    return result;
  }

  /**
   * Build the reschedule statement sentence shown at the bottom of the email.
   * PHP equivalent: body.php lines ~57-80
   * Condition: reschedule record exists (hierarchy) AND enrolment exists AND NOT bulk-reschedule
   * Statement fires when date OR teacher changed compared to original lesson.
   */
  private buildRescheduleStatement(lesson: Lesson, originalLesson: Lesson | null): string | null {
    if (!originalLesson) return null;

    const enrolment = lesson.course?.enrolments?.[0];
    if (!enrolment) return null;

    // PHP: !$model->bulkRescheduleLesson
    const isBulkReschedule = lesson.bulkRescheduleLesson?.length > 0;
    if (isBulkReschedule) return null;

    const durationToMinutes = (duration: string): number => {
      const parts = duration.split(':');
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    };

    const newDuration = durationToMinutes(lesson.duration);
    const oldDuration = durationToMinutes(originalLesson.duration);

    const oldDate = lesson.originalDate ? formatLongDateUTC(lesson.originalDate) : null;
    const oldTime = lesson.originalDate ? formatEasternTime(lesson.originalDate) : null;
    const newDate = lesson.date ? formatLongDateUTC(lesson.date) : null;
    const newTime = lesson.date ? formatEasternTime(lesson.date) : null;

    const student = enrolment.student;
    const studentName = student ? `${student.firstName} ${student.lastName}`.trim() : '';
    const programName =
      publicProgramName(lesson.course?.program, lesson.course?.locationId) || '';

    const newTeacherProfile = lesson.teacher?.profile;
    const newTeacherName = newTeacherProfile
      ? `${newTeacherProfile.firstname || ''} ${newTeacherProfile.lastname || ''}`.trim()
      : lesson.teacher?.username || '';

    // PHP: new \DateTime($model->date) != new \DateTime($lesson->date)  (lesson = original)
    const dateChanged =
      lesson.date && originalLesson.date &&
      new Date(lesson.date).getTime() !== new Date(originalLesson.date).getTime();

    // PHP: (int)$model->teacherId !== (int)$lesson->teacherId
    const teacherChanged = !dateChanged && lesson.teacherId !== originalLesson.teacherId;

    if (dateChanged || teacherChanged) {
      return `${studentName}'s ${programName} lesson on ${oldDate} @ ${oldTime} for ${oldDuration} minutes has been rescheduled to ${newDate} @ ${newTime} for ${newDuration} minutes with ${newTeacherName}.`;
    }

    return null;
  }

  /**
   * Format email template data
   */
  private formatEmailTemplate(
    emailTemplate: EmailTemplate | null,
    lesson: Lesson,
    emails: string[],
  ): EmailTemplateDto {
    const customerEmails = emails.join(', ');

    if (emailTemplate) {
      return {
        id: emailTemplate.id,
        to: customerEmails,
        subject: emailTemplate.subject,
        header: emailTemplate.header || '',
        footer: emailTemplate.footer || '',
      };
    }

    // Default template if not found
    const programName =
      publicProgramName(lesson.course?.program, lesson.course?.locationId) ||
      'Lesson';
    return {
      id: 0,
      to: customerEmails,
      subject: `${programName} lesson reschedule`,
      header: '<p style="text-align: left;">Please find the lesson below</p>',
      footer: '<p style="text-align: left;">Thank you,<br>Arcadia Academy of Music</p>',
    };
  }
}
