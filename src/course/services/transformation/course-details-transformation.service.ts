import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Course } from '../../entities/course.entity';
import {
  CourseDetailsDto,
  CourseDetailsDataDto,
  CourseScheduleDto,
} from '../../dto/course-details-response.dto';
import { formatCurrency, formatTime, formatDuration } from '../../../utils/formatters';
import { formatDate } from '../../../utils/date-utils';

@Injectable()
export class CourseDetailsTransformationService {
  /**
   * Transform a course entity to course details DTO
   * @param course - Course entity with relations (including schedule)
   * @returns CourseDetailsDataDto
   */
  transformToDto(course: Course): CourseDetailsDataDto {
    const currentRate = this.getCurrentRate(course);
    const teacherName = this.getTeacherName(course);
    const scheduleDto = this.transformSchedule(course);

    const detailsDto: CourseDetailsDto = plainToInstance(
      CourseDetailsDto,
      {
        id: course.id,
        program: course.program?.name || '',
        teacher: teacherName,
        rate: formatCurrency(currentRate),
        online: course.isOnline ? 'Yes' : 'No',
      },
      { excludeExtraneousValues: true },
    );

    const data={
      course: detailsDto,
      schedule: scheduleDto,
    }

    return plainToInstance(
      CourseDetailsDataDto,
      { body: data },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Transform schedule from course entity to DTO
   * @param course - Course entity with courseSchedule relation
   * @returns CourseScheduleDto
   */
  private transformSchedule(course: Course): CourseScheduleDto {
    const schedule = course.courseSchedule?.find((s) => s.isRecent) || course.courseSchedule?.[0];
    const duration = schedule?.duration ? formatDuration(schedule.duration) : '';

    const time = schedule?.fromTime ? formatTime(schedule.fromTime) : '';

    const period = this.formatPeriod(course.startDate, course.endDate);

    return plainToInstance(
      CourseScheduleDto,
      {
        id: schedule?.id,
        duration,
        time,
        period,
      },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Format period as "MMM DD, YYYY to MMM DD, YYYY"
   */
  private formatPeriod(startDate: Date | null, endDate: Date | null): string {
    if (!startDate || !endDate) {
      return '';
    }

    const startFormatted = formatDate(new Date(startDate));
    const endFormatted = formatDate(new Date(endDate));

    return `${startFormatted} to ${endFormatted}`;
  }

  /**
   * Get rate from course program rate
   * Uses hasOne relation - first/only rate record
   * Falls back to program rate if no course program rate exists
   */
  private getCurrentRate(course: Course): number {
    const courseProgramRate = course.courseProgramRates?.[0];

    if (courseProgramRate?.programRate) {
      return Number(courseProgramRate.programRate);
    }

    // Fallback to program rate
    return course.program?.rate ? Number(course.program.rate) : 0;
  }

  /**
   * Get teacher full name from course
   */
  private getTeacherName(course: Course): string {
    const profile = course.teacher?.profile;

    if (profile?.firstname && profile?.lastname) {
      return `${profile.firstname} ${profile.lastname}`;
    }

    return profile?.firstname || '';
  }
}
