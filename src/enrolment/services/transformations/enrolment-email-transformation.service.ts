import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  EnrolmentEmailDataDto,
  EnrolmentEmailBodyDto,
  EnrolmentDetailsDto,
  EmailTemplateDto,
  LessonDto,
  ScheduleDto,
} from '../../dto/enrolment-email-response.dto';
import { EnrolmentEmailData, LessonEmailDetail } from '../../repositories/enrolment-email.repository';
import { getStatus } from '../../../lesson/enums/lesson-status';
import { formatDate } from 'src/utils/date-utils';
import { formatDuration, formatTime } from 'src/utils/formatters';
import { publicProgramName } from '../../../pricing/utils/program-public-name';

@Injectable()
export class EnrolmentEmailTransformationService {
  /**
   * Transform raw database data to EnrolmentEmailDataDto
   */
  transformEmailData(rawData: EnrolmentEmailData): EnrolmentEmailDataDto {
    const { enrolment, emails, emailTemplate, lessons, schedules, totalLessons, remainingLessons } = rawData;

    const enrolmentDto = this.transformEnrolment(enrolment);
    const emailTemplateDto = this.transformEmailTemplate(emailTemplate);
    const lessonDtos = this.transformLessons(lessons);
    const scheduleDtos = this.transformSchedules(schedules);

    // Create body with all the email data
    const bodyData = {
      enrolment: enrolmentDto,
      emails,
      emailTemplate: emailTemplateDto,
      lessons: lessonDtos,
      schedules: scheduleDtos,
      totalLessons,
      remainingLessons,
    };

    const body = plainToInstance(EnrolmentEmailBodyDto, bodyData, {
      excludeExtraneousValues: true,
    });

    // Wrap body in data structure
    const dtoData = { body };

    return plainToInstance(EnrolmentEmailDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform enrolment entity to EnrolmentDetailsDto
   */
  private transformEnrolment(enrolment: any): EnrolmentDetailsDto | null {
    if (!enrolment) return null;

    const dtoData = {
      id: enrolment.id,
      studentId: enrolment.studentId,
      studentName: this.formatStudentName(enrolment),
      customerId: enrolment.student?.customerId || 0,
      customerName: this.formatCustomerName(enrolment),
      courseId: enrolment.courseId,
      programName: publicProgramName(
        enrolment.course?.program,
        enrolment.course?.locationId,
      ) || '',
      teacherName: this.formatTeacherName(enrolment.course?.teacher),
      startDate: formatDate(enrolment.course?.startDate),
      endDate: formatDate(enrolment.course?.endDate),
    };

    return plainToInstance(EnrolmentDetailsDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform email template entity to EmailTemplateDto
   */
  private transformEmailTemplate(emailTemplate: any): EmailTemplateDto | null {
    if (!emailTemplate) return null;

    const dtoData = {
      id: emailTemplate.id,
      subject: emailTemplate.subject || '',
      header: emailTemplate.header || '',
      footer: emailTemplate.footer || '',
    };

    return plainToInstance(EmailTemplateDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform lessons to LessonDto array
   * Works for both private and group lesson formats
   */
  private transformLessons(lessons: LessonEmailDetail[]): LessonDto[] {
    return lessons.map((lesson) => {
      const dtoData = {
        id: lesson.id,
        teacherName: lesson.teacherName,
        date: formatDate(lesson.date),
        status: getStatus(lesson),
      };

      return plainToInstance(LessonDto, dtoData, {
        excludeExtraneousValues: true,
      });
    });
  }

  /**
   * Transform course schedules to ScheduleDto array
   */
  private transformSchedules(schedules: any[]): ScheduleDto[] {
    return schedules.map((schedule) => {
      const dtoData = {
        id: schedule.id,
        day: schedule.day,
        dayName: this.getDayName(schedule.day),
        fromTime: formatTime(schedule.fromTime) || '',
        duration: formatDuration(schedule.duration) || '',
      };

      return plainToInstance(ScheduleDto, dtoData, {
        excludeExtraneousValues: true,
      });
    });
  }

  /**
   * Format student name from enrolment
   */
  private formatStudentName(enrolment: any): string {
    const student = enrolment?.student;
    if (!student) return '';
    return `${student.firstName || ''} ${student.lastName || ''}`.trim();
  }

  /**
   * Format customer name from enrolment
   */
  private formatCustomerName(enrolment: any): string {
    const customer = enrolment?.student?.user;
    const profile = customer?.profile;
    if (!profile) return '';
    return `${profile.firstname || ''} ${profile.lastname || ''}`.trim();
  }

  /**
   * Format teacher name from user entity
   */
  private formatTeacherName(teacher: any): string {
    const profile = teacher?.profile;
    if (!profile) return '';
    return `${profile.firstname || ''} ${profile.lastname || ''}`.trim();
  }


  /**
   * Get day name from day number (0 = Sunday, 1 = Monday, etc.)
   */
  private getDayName(day: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day] || '';
  }
}
