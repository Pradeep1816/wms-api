import { Injectable } from '@nestjs/common';
import { TeacherAvailability } from '../../entities/teacher-availability.entity';
import { TeacherAvailabilityResponseDto } from '../../dto/teacher-availability-response.dto';
import { AvailabilityEventDto, LessonEventDto } from '../../dto/teacher-schedule-response.dto';
import { LocationAvailability } from '../../../location/entities/location-availability.entity';

const dayjs = require('dayjs');
const isoWeek = require('dayjs/plugin/isoWeek');

dayjs.extend(isoWeek);

@Injectable()
export class TeacherAvailabilityTransformationService {
  /**
   * Transform teacher availability to schedule-events format
   * Includes both teacher availability and location operation time/schedule visibility
   */
  transformToResponse(
    teacherAvailability: (TeacherAvailability & { classroomName?: string })[],
    locationOperationTime: LocationAvailability[],
    locationScheduleVisibility: LocationAvailability[],
    startDate: string,
    endDate: string,
    teacherId: number,
    timeRange: { from: string; to: string },
  ): TeacherAvailabilityResponseDto {
    // Process teacher availability into lesson events (editable) for the week
    const teacherAvailabilityLessons = this.processTeacherAvailabilityToLessons(
      teacherAvailability,
      startDate,
      endDate,
    );

    // Process location operation time availability for all days (background rendering)
    const operationTimeEvents = this.processLocationAvailabilityToEvents(
      locationOperationTime,
      startDate,
      endDate,
      'location-operation-time',
    );

    // Process location schedule visibility time range for all days (background rendering)
    const scheduleVisibilityEvents = this.processLocationAvailabilityToEvents(
      locationScheduleVisibility,
      startDate,
      endDate,
      'location-schedule-visibility',
    );

    // Combine location availability events (background rendering only)
    const allAvailabilityEvents = [
      ...operationTimeEvents,
      ...scheduleVisibilityEvents,
    ];

    // Filter lesson events by time range
    const filteredLessonEvents = this.filterLessonsByTimeRange(
      teacherAvailabilityLessons,
      timeRange,
    );

    // Filter availability events by time range
    const filteredAvailabilityEvents = this.filterAvailabilityByTimeRange(
      allAvailabilityEvents,
      timeRange,
    );

    const data = {
      lessons: filteredLessonEvents, // Teacher availability as editable lessons
      availability: filteredAvailabilityEvents, // Location operation time and schedule visibility as background
      time: timeRange,
      date: {
        from: startDate,
        to: endDate,
      },
      totalEvents: filteredLessonEvents.length,
      teacherId,
    };

    return {
      body: data,
    };
  }

  /**
   * Process teacher availability into lesson events (editable) for a week (Monday-Sunday)
   */
  private processTeacherAvailabilityToLessons(
    availability: (TeacherAvailability & { classroomName?: string })[],
    startDate: string,
    endDate: string,
  ): LessonEventDto[] {
    const lessons: LessonEventDto[] = [];
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

      // Create lesson events for each availability slot
      for (const avail of dayAvailability) {
        const lesson = this.createAvailabilityLesson(
          avail,
          date,
        );
        lessons.push(lesson);
      }
    }

    return lessons;
  }

  /**
   * Create lesson event from teacher availability (editable)
   */
  private createAvailabilityLesson(
    availability: TeacherAvailability & { classroomName?: string },
    date: Date,
  ): LessonEventDto {
    const start = this.combineDateWithTime(date, availability.fromTime);
    const end = this.combineDateWithTime(date, availability.toTime);

    // Calculate day of week (1-7, Monday-Sunday) for teacher schedule view
    const dayOfWeek = date.getDay(); // 0-6 (Sunday-Saturday)
    const resourceId = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert to 1-7 (Monday-Sunday)

    // Use classroom name if available, otherwise use "Available"
    const title = availability.classroomName || '';

    return {
      lessonId: availability.id, // Use availability ID as lessonId
      isOwing: null,
      isOwingRentalAgreement: null,
      resourceId, // Day of week (1-7) for teacher schedule view
      title, // Use classroom name if available
      start: this.formatDateTime(start),
      end: this.formatDateTime(end),
      url: '', // Empty URL for availability
      className: 'teacher-availability',
      backgroundColor: '#97ef83', // Green color like legacy
      isOnline: false,
      programId: null,
    };
  }

  /**
   * Process location availability into events for a week (Monday-Sunday)
   */
  private processLocationAvailabilityToEvents(
    locationAvailability: LocationAvailability[],
    startDate: string,
    endDate: string,
    className: string,
  ): AvailabilityEventDto[] {
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

    // Process location availability for each day in the week
    for (const date of weekDates) {
      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();

      // Filter location availability for this day
      const dayAvailability = locationAvailability.filter(
        (avail) => avail.day === dayOfWeek,
      );

      // Create availability events for each slot
      for (const avail of dayAvailability) {
        const event = this.createAvailabilityEvent(
          avail.fromTime,
          avail.toTime,
          date,
          className,
        );
        events.push(event);
      }
    }

    return events;
  }

  /**
   * Create availability event
   */
  private createAvailabilityEvent(
    fromTime: string,
    toTime: string,
    date: Date,
    className: string,
  ): AvailabilityEventDto {
    const start = this.combineDateWithTime(date, fromTime);
    const end = this.combineDateWithTime(date, toTime);

    // Calculate day of week (1-7, Monday-Sunday) for teacher schedule view
    const dayOfWeek = date.getDay(); // 0-6 (Sunday-Saturday)
    const resourceId = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert to 1-7 (Monday-Sunday)

    return {
      resourceId, // Day of week (1-7) for teacher schedule view
      start: this.formatDateTime(start),
      end: this.formatDateTime(end),
      rendering: 'background',
      className,
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
   * Filter lesson events by time range
   * Only include lessons that overlap with the visible time range
   */
  private filterLessonsByTimeRange(
    lessons: LessonEventDto[],
    timeRange: { from: string; to: string },
  ): LessonEventDto[] {
    const [fromHours, fromMinutes, fromSeconds] = timeRange.from.split(':').map(Number);
    const [toHours, toMinutes, toSeconds] = timeRange.to.split(':').map(Number);

    return lessons.filter((lesson) => {
      // Parse lesson start time (format: "YYYY-MM-DD HH:mm:ss")
      const lessonStartParts = lesson.start.split(' ');
      if (lessonStartParts.length !== 2) return false;

      const lessonTimeParts = lessonStartParts[1].split(':').map(Number);
      if (lessonTimeParts.length < 2) return false;

      const lessonStartHours = lessonTimeParts[0];
      const lessonStartMinutes = lessonTimeParts[1];
      const lessonStartSeconds = lessonTimeParts[2] || 0;

      // Parse lesson end time (format: "YYYY-MM-DD HH:mm:ss")
      const lessonEndParts = lesson.end.split(' ');
      if (lessonEndParts.length !== 2) return false;

      const lessonEndTimeParts = lessonEndParts[1].split(':').map(Number);
      if (lessonEndTimeParts.length < 2) return false;

      const lessonEndHours = lessonEndTimeParts[0];
      const lessonEndMinutes = lessonEndTimeParts[1];
      const lessonEndSeconds = lessonEndTimeParts[2] || 0;

      // Convert to seconds for comparison
      const rangeFromSeconds = fromHours * 3600 + fromMinutes * 60 + fromSeconds;
      const rangeToSeconds = toHours * 3600 + toMinutes * 60 + toSeconds;
      const lessonStartSecondsTotal = lessonStartHours * 3600 + lessonStartMinutes * 60 + lessonStartSeconds;
      const lessonEndSecondsTotal = lessonEndHours * 3600 + lessonEndMinutes * 60 + lessonEndSeconds;

      // Lesson must overlap with the time range
      return lessonStartSecondsTotal < rangeToSeconds && lessonEndSecondsTotal > rangeFromSeconds;
    });
  }

  /**
   * Filter availability events by time range
   * Only include availability that overlaps with the visible time range
   */
  private filterAvailabilityByTimeRange(
    events: AvailabilityEventDto[],
    timeRange: { from: string; to: string },
  ): AvailabilityEventDto[] {
    const [fromHours, fromMinutes, fromSeconds] = timeRange.from.split(':').map(Number);
    const [toHours, toMinutes, toSeconds] = timeRange.to.split(':').map(Number);

    return events.filter((event) => {
      // Parse availability start time (format: "YYYY-MM-DD HH:mm:ss")
      const eventStartParts = event.start.split(' ');
      if (eventStartParts.length !== 2) return false;

      const eventTimeParts = eventStartParts[1].split(':').map(Number);
      if (eventTimeParts.length < 2) return false;

      const eventStartHours = eventTimeParts[0];
      const eventStartMinutes = eventTimeParts[1];
      const eventStartSeconds = eventTimeParts[2] || 0;

      // Parse availability end time (format: "YYYY-MM-DD HH:mm:ss")
      const eventEndParts = event.end.split(' ');
      if (eventEndParts.length !== 2) return false;

      const eventEndTimeParts = eventEndParts[1].split(':').map(Number);
      if (eventEndTimeParts.length < 2) return false;

      const eventEndHours = eventEndTimeParts[0];
      const eventEndMinutes = eventEndTimeParts[1];
      const eventEndSeconds = eventEndTimeParts[2] || 0;

      // Convert to seconds for comparison
      const rangeFromSeconds = fromHours * 3600 + fromMinutes * 60 + fromSeconds;
      const rangeToSeconds = toHours * 3600 + toMinutes * 60 + toSeconds;
      const eventStartSecondsTotal = eventStartHours * 3600 + eventStartMinutes * 60 + eventStartSeconds;
      const eventEndSecondsTotal = eventEndHours * 3600 + eventEndMinutes * 60 + eventEndSeconds;

      // Availability must overlap with the time range
      return eventStartSecondsTotal < rangeToSeconds && eventEndSecondsTotal > rangeFromSeconds;
    });
  }

  /**
   * Calculate fromTime and toTime from location availabilities
   * Uses schedule visibility time range (same as schedule-events with showAll=false)
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

