import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Course } from '../../entities/course.entity';
import {
  GroupCourseListItemDto,
  GroupCourseListDataDto,
} from '../../dto/group-course-list-response.dto';
import { formatDate } from '../../../utils/date-utils';
import { formatCurrency, formatDuration, formatTime } from '../../../utils/formatters';

@Injectable()
export class GroupCourseListTransformationService {
  /**
   * Transform a single course entity to DTO
   */
  transformToDto(course: Course): GroupCourseListItemDto {
    const recentSchedule =
      course.courseSchedule?.find((s) => s.isRecent) ||
      course.courseSchedule?.[0];

    // Find current rate from course program rates
    const currentRate = this.getCurrentRate(course);

    // Format time from HH:mm:ss to HH:mm AM/PM
    const fromTime = recentSchedule?.fromTime
      ? formatTime(recentSchedule.fromTime) || ''
      : '';

    // Format duration from HH:mm:ss to HH:mm
    const duration = recentSchedule?.duration
      ? formatDuration(recentSchedule.duration)
      : '';

    // Format dates
    const startDate = course.startDate
      ? formatDate(new Date(course.startDate))
      : '';
    const endDate = course.endDate
      ? formatDate(new Date(course.endDate))
      : '';

    // Get teacher name
    const teacherName = this.getTeacherName(course);

    const dtoData = {
      id: course.id,
      course: course.program?.name || '',
      teacher: teacherName,
      rate: formatCurrency(currentRate),
      fromTime,
      duration,
      startDate,
      endDate,
    };

    return plainToInstance(GroupCourseListItemDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform multiple course entities to DTOs
   */
  transformCoursesToDtos(courses: Course[]): GroupCourseListItemDto[] {
    return courses.map((course) => this.transformToDto(course));
  }

  /**
   * Transform courses data to GroupCourseListDataDto
   */
  transformCoursesData(
    courses: Course[],
    total: number,
    page: number,
    limit: number,
  ): GroupCourseListDataDto {
    const formattedCourses = this.transformCoursesToDtos(courses);
    const totalPages = Math.ceil(total / limit);

    const dtoData = {
      body: formattedCourses,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    return plainToInstance(GroupCourseListDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Get rate from course program rate (matching legacy exactly)
   * Legacy: Simply uses hasOne relation - first/only rate record
   */
  private getCurrentRate(course: Course): number {
    // Legacy just gets the first course program rate (no date filtering)
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

