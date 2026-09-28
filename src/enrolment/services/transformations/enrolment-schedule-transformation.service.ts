import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { EnrolmentScheduleDto, EnrolmentScheduleDataDto } from '../../dto/enrolment-schedule-response.dto';
import { ScheduleHistoryItemDto, EnrolmentScheduleHistoryDataDto } from '../../dto/enrolment-schedule-history-response.dto';
import { formatDate, getWeekdaysList } from '../../../utils/date-utils';
import { formatTime, formatDuration } from '../../../utils/formatters';

@Injectable()
export class EnrolmentScheduleTransformationService {
  /**
   * Transform enrolment entity to EnrolmentScheduleDto
   */
  transformEnrolmentToSchedule(enrolment: any): EnrolmentScheduleDto {
    const course = enrolment.course;
    const courseSchedule = course?.courseSchedule?.[0];

    // Get weekday name from day number
    const weekdays = getWeekdaysList();
    const dayName = courseSchedule?.day ? weekdays[courseSchedule.day] || '' : '';
    const time = formatTime(courseSchedule?.fromTime) || '';
    const startDate = course?.startDate ? formatDate(course.startDate) : '';
    const endDate = enrolment?.endDateTime ? formatDate(enrolment.endDateTime) : '';

    const scheduleData = {
      id: courseSchedule?.id,
      day: dayName,
      time,
      startDate,
      endDate,
    };

    return plainToInstance(EnrolmentScheduleDto, scheduleData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform enrolment data to EnrolmentScheduleDataDto
   */
  transformEnrolmentScheduleData(enrolment: any): EnrolmentScheduleDataDto {
    const enrolmentSchedule = this.transformEnrolmentToSchedule(enrolment);

    const dtoData = {
      body: enrolmentSchedule,
    };

    return plainToInstance(EnrolmentScheduleDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform a single course schedule to ScheduleHistoryItemDto
   */
  transformScheduleHistoryItem(schedule: any): ScheduleHistoryItemDto {
    const weekdays = getWeekdaysList();
    const dayName = schedule?.day ? weekdays[schedule.day] || '' : '';

    // Format date range (e.g., "Nov 17, 2025 - Mar 31, 2026")
    const startDate = schedule?.startDate ? formatDate(schedule.startDate) : '';
    const endDate = schedule?.endDate ? formatDate(schedule.endDate) : '';
    const dateRange = startDate && endDate ? `${startDate} - ${endDate}` : startDate || endDate;

    // Get teacher name from profile
    const teacher = schedule?.teacher;
    const teacherName = teacher?.profile
      ? `${teacher.profile.firstname || ''} ${teacher.profile.lastname || ''}`.trim()
      : '';

    const historyData = {
      id: schedule?.id,
      date: dateRange,
      day: dayName,
      time: formatTime(schedule?.fromTime) || '',
      duration: formatDuration(schedule?.duration),
      teacher: teacherName,
    };

    return plainToInstance(ScheduleHistoryItemDto, historyData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform all course schedules to EnrolmentScheduleHistoryDataDto
   */
  transformScheduleHistoryData(schedules: any[]): EnrolmentScheduleHistoryDataDto {
    const historyItems = schedules.map(schedule => this.transformScheduleHistoryItem(schedule));

    const dtoData = {
      body: historyItems,
    };

    return plainToInstance(EnrolmentScheduleHistoryDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }
}

