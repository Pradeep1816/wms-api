import { Injectable } from '@nestjs/common';
import {
  LessonEventDto,
  AvailabilityEventDto,
} from '../../dto/teacher-schedule-response.dto';
import { Lesson } from '../../../lesson/entities/lesson.entity';
import { TeacherAvailability } from '../../entities/teacher-availability.entity';
import { Program } from '../../../program/entities/program.entity';
import { CalendarEventColor } from '../../../color-code/entities/calendar-event-color.entity';
import { LocationAvailability } from '../../../location/entities/location-availability.entity';

@Injectable()
export class TeacherScheduleTransformationService {
  /**
   * Transform lessons and availability into events format matching schedule module
   * Returns events for the entire week (Monday-Sunday)
   */
  async transformToEvents(
    lessons: Lesson[],
    availability: TeacherAvailability[],
    startDate: string,
    endDate: string,
    locationSlug: string,
    teacherId: number,
    colorMap: Map<string, string>,
    customerAccountsMap: Map<number, number>,
    equipmentRentalsMap: Map<number, boolean>,
    teacherProfilesMap: Map<number, string>,
    enrolmentCountsMap: Map<number, number>,
    firstLessonDatesMap: Map<number, Date>,
  ): Promise<{
    lessonEvents: LessonEventDto[];
    availabilityEvents: AvailabilityEventDto[];
  }> {
    // Process lessons into events
    const lessonEvents = await Promise.all(
      lessons.map((lesson) =>
        this.processLessonToEvent(
          lesson,
          locationSlug,
          colorMap,
          customerAccountsMap,
          equipmentRentalsMap,
          teacherProfilesMap,
          enrolmentCountsMap,
          firstLessonDatesMap,
        ),
      ),
    );

    // Process availability into events for the entire week (Monday-Sunday)
    const availabilityEvents = await this.processAvailabilityToEventsForWeek(
      availability,
      startDate,
      endDate,
      teacherId,
    );

    return {
      lessonEvents,
      availabilityEvents,
    };
  }

  /**
   * Process lesson into event format (similar to schedule service)
   */
  private async processLessonToEvent(
    lesson: Lesson,
    locationSlug: string,
    colorMap: Map<string, string>,
    customerAccountsMap: Map<number, number>,
    equipmentRentalsMap: Map<number, boolean>,
    teacherProfilesMap: Map<number, string>,
    enrolmentCountsMap: Map<number, number>,
    firstLessonDatesMap: Map<number, Date>,
  ): Promise<LessonEventDto> {
    // Calculate end time by adding duration to start time
    const startTime = new Date(lesson.date);
    const durationParts = lesson.duration.split(':');
    const durationHours = parseInt(durationParts[0]);
    const durationMinutes = parseInt(durationParts[1]);

    const endTime = new Date(startTime);
    endTime.setHours(
      startTime.getHours() + durationHours,
      startTime.getMinutes() + durationMinutes,
    );

    // Get course and program information from pre-loaded relations
    const course = (lesson as any).course;
    const program = course?.program;

    // Get student name from pre-loaded relations
    const studentName = this.getStudentNameFromRelations(lesson);

    // Determine lesson title based on program type
    let title: string;
    switch (program?.type) {
      case 2: // GROUP_PROGRAM
        title = program.name || 'Group Lesson';
        break;
      case 1: // PRIVATE_PROGRAM - Format: <student_name> (program_name)
        const programName = program?.name || 'Private Lesson';
        title = studentName ? `${studentName} (${programName})` : programName;
        break;
      default:
        title = 'Private Lesson';
        break;
    }

    // Determine CSS class based on lesson properties
    let className = '';
    if (lesson.colorCode) {
      className = '';
    } else if (!lesson.isPresent) {
      className = 'absent-lesson';
    } else if (program?.type === 1) {
      className = 'private-lesson';
    } else if (program?.type === 2) {
      className = 'group-lesson';
    }

    // Check for rescheduled lessons
    if (!lesson.colorCode && lesson.status === 1) {
      className = 'lesson-rescheduled';
    }

    // Check for teacher substitution
    const hierarchy = (lesson as any).lessonHierarchy;
    const rootLesson = hierarchy?.[0]?.lesson;
    if (rootLesson && !lesson.colorCode) {
      if (!lesson.isPresent) {
        className = 'absent-lesson';
      } else if (lesson.status === 1) {
        className = 'lesson-rescheduled';
      } else if (
        rootLesson.teacherId !== lesson.teacherId &&
        !(lesson as any).bulkRescheduleLesson?.length
      ) {
        className = 'teacher-substituted';
      }
    }

    // Check for first lesson
    if (
      !className ||
      (className !== 'absent-lesson' &&
        className !== 'lesson-rescheduled' &&
        className !== 'teacher-substituted')
    ) {
      const isFirstLesson = this.isEnrolmentFirstLessonWithMap(
        lesson,
        firstLessonDatesMap,
      );
      if (isFirstLesson) {
        className = 'first-lesson';
      }
    }

    // Calculate isOwing
    const isOwing = this.calculateIsOwingWithMap(lesson, customerAccountsMap);

    // Calculate isOwingRentalAgreement
    const isOwingRentalAgreement = this.calculateIsOwingRentalAgreementWithMap(
      lesson,
      equipmentRentalsMap,
    );

    // Get backgroundColor
    const backgroundColor =
      colorMap.get(className) || lesson.colorCode || '#3788d8';

    // Calculate day of week (1-7, Monday-Sunday) for teacher schedule view
    // In teacher schedule, each column is a day, so resourceId should be day of week
    const dayOfWeek = startTime.getDay(); // 0-6 (Sunday-Saturday)
    const resourceId = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert to 1-7 (Monday-Sunday)

    return {
      lessonId: lesson.id,
      isOwing,
      isOwingRentalAgreement,
      resourceId, // Day of week (1-7) for teacher schedule view
      title,
      start: startTime.toISOString().replace('T', ' ').substring(0, 19),
      end: endTime.toISOString().replace('T', ' ').substring(0, 19),
      url: `/v2/admin/${locationSlug}/private-lessons/${lesson.id}`,
      className,
      backgroundColor,
      isOnline: lesson.isOnline || false,
      programId: program?.id || null,
    };
  }

  /**
   * Process availability into events for a week (Monday-Sunday)
   */
  private async processAvailabilityToEventsForWeek(
    availability: TeacherAvailability[],
    startDate: string,
    endDate: string,
    teacherId: number,
  ): Promise<AvailabilityEventDto[]> {
    const events: AvailabilityEventDto[] = [];
    const monday = new Date(startDate);
    const sunday = new Date(endDate);
    
    // Generate all dates in the week (Monday to Sunday)
    const weekDates: Date[] = [];
    const currentDate = new Date(monday);
    while (currentDate <= sunday) {
      weekDates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Process availability for each day in the week
    for (const date of weekDates) {
      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
      
      // Filter availability for this day
      const dayAvailability = availability.filter(
        (avail) => avail.day === dayOfWeek,
      );

      // Create availability events for each slot
      for (const avail of dayAvailability) {
        const regularEvent = this.createAvailabilityEvent(
          avail,
          date,
          teacherId,
        );
        events.push(regularEvent);
      }
    }

    return events;
  }

  /**
   * Create availability event
   */
  private createAvailabilityEvent(
    availability: TeacherAvailability,
    date: Date,
    teacherId: number,
  ): AvailabilityEventDto {
    const start = this.combineDateWithTime(date, availability.fromTime);
    const end = this.combineDateWithTime(date, availability.toTime);

    // Calculate day of week (1-7, Monday-Sunday) for teacher schedule view
    // In teacher schedule, each column is a day, so resourceId should be day of week
    const dayOfWeek = date.getDay(); // 0-6 (Sunday-Saturday)
    const resourceId = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert to 1-7 (Monday-Sunday)

    return {
      resourceId, // Day of week (1-7) for teacher schedule view
      start: this.formatDateTime(start),
      end: this.formatDateTime(end),
      rendering: 'background',
      className: 'teacher-availability',
      backgroundColor: '#a6a6a6',
    };
  }


  /**
   * Combine date with time string
   */
  private combineDateWithTime(date: Date, timeString: string): Date {
    const [hours, minutes, seconds] = timeString.split(':').map(Number);
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${(seconds || 0).toString().padStart(2, '0')}`;
    const datetimeStr = `${dateStr} ${timeStr}`;
    return new Date(datetimeStr);
  }

  /**
   * Format datetime to YYYY-MM-DD HH:MM:SS
   */
  private formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Get student name from lesson relations
   */
  private getStudentNameFromRelations(lesson: Lesson): string {
    try {
      const course = (lesson as any).course;
      if (!course || !course.enrolments || course.enrolments.length === 0) {
        return '';
      }

      const enrolment = course.enrolments[0];
      const student = enrolment.student;
      if (!student) {
        return '';
      }

      const firstName = student.firstName || '';
      const lastName = student.lastName || '';
      return `${firstName} ${lastName}`.trim();
    } catch (error) {
      return '';
    }
  }

  /**
   * Generate lesson tooltip
   */
  private generateLessonDescription(
    lesson: Lesson,
    program: Program | null,
    title: string,
    teacherProfilesMap: Map<number, string>,
    enrolmentCountsMap: Map<number, number>,
  ): Array<{ name: string; value: string }> {
    try {
      const description: Array<{ name: string; value: string }> = [];
      const teacherName =
        teacherProfilesMap.get(lesson.teacherId) || 'Unknown Teacher';

      switch (program?.type) {
        case 2: // GROUP_PROGRAM
          description.push({ name: 'Teacher', value: teacherName });
          description.push({
            name: 'Program',
            value: program.name || 'Unknown Program',
          });
          const enrolmentCount =
            enrolmentCountsMap.get(lesson.courseId) || 0;
          description.push({
            name: 'Student Count',
            value: enrolmentCount.toString(),
          });
          break;
        default:
          // Private lesson
          description.push({ name: 'Student', value: title });
          description.push({ name: 'Teacher', value: teacherName });
          description.push({
            name: 'Program',
            value: program?.name || 'Unknown Program',
          });
          break;
      }

      if (lesson.classroomId && (lesson as any).classroom) {
        description.push({
          name: 'Classroom',
          value: (lesson as any).classroom.name || 'Unknown Classroom',
        });
      }

      return description;
    } catch (error) {
      return [];
    }
  }

  /**
   * Calculate isOwing with map
   */
  private calculateIsOwingWithMap(
    lesson: Lesson,
    customerAccountsMap: Map<number, number>,
  ): boolean | null {
    try {
      const course = (lesson as any).course;
      if (!course || !course.enrolments || course.enrolments.length === 0) {
        return null;
      }

      const enrolment = course.enrolments[0];
      const balance = customerAccountsMap.get(lesson.courseId) || 0;
      return balance > 0;
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate isOwingRentalAgreement with map
   */
  private calculateIsOwingRentalAgreementWithMap(
    lesson: Lesson,
    equipmentRentalsMap: Map<number, boolean>,
  ): boolean | null {
    try {
      const course = (lesson as any).course;
      if (!course || !course.enrolments || course.enrolments.length === 0) {
        return null;
      }

      const enrolment = course.enrolments[0];
      const student = enrolment.student;
      if (!student) {
        return null;
      }

      return equipmentRentalsMap.get(student.customerId) || false;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if lesson is first lesson in enrolment with map
   */
  private isEnrolmentFirstLessonWithMap(
    lesson: Lesson,
    firstLessonDatesMap: Map<number, Date>,
  ): boolean {
    try {
      const course = (lesson as any).course;
      if (!course) {
        return false;
      }

      const firstLessonDate = firstLessonDatesMap.get(course.id);
      if (!firstLessonDate) {
        return false;
      }

      const lessonDate = new Date(lesson.date);
      return (
        lessonDate.toISOString().split('T')[0] ===
        firstLessonDate.toISOString().split('T')[0]
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate fromTime and toTime from location availabilities
   */
  calculateTimeRangeFromLocationAvailabilities(
    locationAvailabilities: LocationAvailability[],
  ): { from: string; to: string } {
    if (locationAvailabilities.length === 0) {
      // Use defaults if no availability found
      return {
        from: LocationAvailability.DEFAULT_FROM_TIME,
        to: LocationAvailability.DEFAULT_TO_TIME,
      };
    }

    // Find minimum fromTime and maximum toTime across all records
    const { minTime, maxTime } = locationAvailabilities.reduce(
      (acc, availability) => ({
        minTime: availability.fromTime < acc.minTime ? availability.fromTime : acc.minTime,
        maxTime: availability.toTime > acc.maxTime ? availability.toTime : acc.maxTime,
      }),
      {
        minTime: locationAvailabilities[0].fromTime,
        maxTime: locationAvailabilities[0].toTime,
      },
    );

    return {
      from: minTime,
      to: maxTime,
    };
  }
}
