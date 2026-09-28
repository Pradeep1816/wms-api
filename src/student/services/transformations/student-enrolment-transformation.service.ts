import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { StudentEnrolmentDto, StudentEnrolmentsDataDto } from '../../dto/student-enrolments-response.dto';
import { formatDate, getWeekdaysList } from '../../../utils/date-utils';
import { formatDuration, formatTime } from '../../../utils/formatters';

@Injectable()
export class StudentEnrolmentTransformationService {
  /**
   * Transform enrolment entity to Student Enrolment DTO
   * @param enrolment - Enrolment entity with relations
   * @returns StudentEnrolmentDto
   */
  transformEnrolmentToDto(enrolment: any): StudentEnrolmentDto {
    const course = enrolment.course;
    const program = course?.program;
    const courseSchedule = course?.courseSchedule?.[0]; // Get first schedule (isRecent = true)
    const lesson = course?.lessons?.[0];
    // Priority: courseSchedule.teacher (most recent) > course.teacher > lesson.teacher
    // This ensures we show the updated teacher when it's changed on the courseSchedule
    const teacher = courseSchedule?.teacher || course?.teacher || lesson?.teacher;

    // Format day name using courseSchedule day
    const day = courseSchedule?.day;
    const weekdays = getWeekdaysList();
    const weekday = weekdays[day] || '';
    const fromTime = formatTime(courseSchedule?.fromTime) || '';
    
    // Get teacher name from profile
    const teacherName = teacher?.profile ? 
      `${teacher.profile.firstname || ''} ${teacher.profile.lastname || ''}`.trim() : '';
    
    const dtoData = {
      id: enrolment.id,
      courseId: course?.id, // Include courseId for review API
      programId: program?.id,
      teacherId: teacher?.id,
      programName: program?.name || '',
      teacherName: teacherName,
      day: weekday,
      fromTime: fromTime,
      duration: formatDuration(courseSchedule?.duration),
      startDate: formatDate(course?.startDate),
      endDate: formatDate(enrolment.endDateTime),
    };

    return plainToInstance(StudentEnrolmentDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform multiple enrolment entities to StudentEnrolmentDto array
   * @param enrolments - Array of enrolment entities
   * @returns Array of StudentEnrolmentDto
   */
  transformEnrolmentList(enrolments: any[]): StudentEnrolmentDto[] {
    return enrolments.map(enrolment => this.transformEnrolmentToDto(enrolment));
  }

  /**
   * Transform enrolments data to StudentEnrolmentsDataDto format
   * @param enrolments - Array of enrolment entities
   * @param total - Total number of enrolments
   * @param page - Current page number
   * @param limit - Items per page
   * @returns StudentEnrolmentsDataDto
   */
  transformEnrolmentsData(
    enrolments: any[],
    total: number,
    page: number,
    limit: number,
  ): StudentEnrolmentsDataDto {
    const formattedEnrolments = this.transformEnrolmentList(enrolments);
    const totalPages = Math.ceil(total / limit);

    const dtoData = {
      body: formattedEnrolments,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    return plainToInstance(StudentEnrolmentsDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }
}
