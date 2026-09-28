import { Injectable, NotFoundException, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { TeacherScheduleResponseDto, LessonEventDto, AvailabilityEventDto } from '../dto/teacher-schedule-response.dto';
import { TeacherScheduleRepository } from '../repositories/teacher-schedule.repository';
import { TeacherScheduleTransformationService } from './transformations/teacher-schedule-transformation.service';
import { CustomerValidationService } from 'src/shared/services/customer-validation.service';
import { TeacherAvailabilityRepository } from '../repositories/teacher-availability.repository';
import { LocationRepository } from '../../location/repositories/location.repository';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LocationAvailability } from '../../location/entities/location-availability.entity';
import { plainToInstance } from 'class-transformer';

const dayjs = require('dayjs');
const isoWeek = require('dayjs/plugin/isoWeek');

dayjs.extend(isoWeek);

@Injectable()
export class TeacherScheduleService {
  constructor(
    private readonly scheduleRepository: TeacherScheduleRepository,
    private readonly transformationService: TeacherScheduleTransformationService,
    private readonly validationService: CustomerValidationService,
    private readonly availabilityRepository: TeacherAvailabilityRepository,
    private readonly locationRepository: LocationRepository,
  ) {}

  /**
   * Calculate Monday-Sunday week range from a given date
   */
  private getWeekRange(date: string): { startDate: string; endDate: string } {
    const targetDate = dayjs(date);
    const monday = targetDate.startOf('isoWeek'); // ISO week starts on Monday
    const sunday = monday.endOf('isoWeek'); // ISO week ends on Sunday
    
    return {
      startDate: monday.format('YYYY-MM-DD'),
      endDate: sunday.format('YYYY-MM-DD'),
    };
  }


  async getTeacherScheduleEvents(
    locationSlug: string, // This is only for showing in the error message
    locationId: number,
    teacherId: number,
    date?: string,
    showAll: boolean = false,
  ): Promise<TeacherScheduleResponseDto> {
    try {
      const isExists = await this.validationService.validateCustomerExists(teacherId, locationId);
      if (!isExists) {
        throw new BadRequestException(`Teacher with id: ${teacherId} not found in location ${locationSlug}`);
      }

      const targetDate = date || new Date().toISOString().split('T')[0];
      const { startDate, endDate } = this.getWeekRange(targetDate);

      // Fetch lessons and availability in parallel
      const [lessons, availability] = await Promise.all([
        this.scheduleRepository.findUpcomingLessonsByTeacher(
          teacherId,
          locationId,
          startDate,
          endDate,
        ),
        this.availabilityRepository.findByTeacherAndLocation(teacherId, locationId),
      ]);

      // Calculate time range from location availability based on showAll parameter FIRST
      // This is needed to filter events by time range
      // Determine type based on showAll parameter
      // showAll = false (locationVisibility = false) → TYPE_SCHEDULE_TIME
      // showAll = true (locationVisibility = true) → TYPE_OPERATION_TIME
      const type = showAll
        ? LocationAvailability.TYPE_OPERATION_TIME  // showAll = true: use operation time
        : LocationAvailability.TYPE_SCHEDULE_TIME;  // showAll = false: use schedule visibility

      // Get location availabilities from location repository
      const locationAvailabilities = await this.locationRepository.findLocationAvailabilitiesByType(
        locationId,
        type,
      );

      // Calculate time range using transformation service
      const timeRange = this.transformationService.calculateTimeRangeFromLocationAvailabilities(
        locationAvailabilities,
      );

      // Load all required maps in parallel
      const [
        colorMap,
        customerAccountsMap,
        equipmentRentalsMap,
        teacherProfilesMap,
        enrolmentCountsMap,
        firstLessonDatesMap,
      ] = await Promise.all([
        this.loadCalendarEventColors(),
        this.loadCustomerAccountsForLessons(lessons),
        this.loadEquipmentRentalsForLessons(lessons),
        this.loadTeacherProfilesForLessons(lessons),
        this.loadEnrolmentCountsForLessons(lessons),
        this.loadFirstLessonDatesForLessons(lessons),
      ]);

      // Transform to events for the entire week
      const { lessonEvents, availabilityEvents } =
        await this.transformationService.transformToEvents(
          lessons,
          availability,
          startDate,
          endDate,
          locationSlug,
          teacherId,
          colorMap,
          customerAccountsMap,
          equipmentRentalsMap,
          teacherProfilesMap,
          enrolmentCountsMap,
          firstLessonDatesMap,
        );

      // Filter events to only include those within the time range
      const filteredLessonEvents = this.filterEventsByTimeRange(lessonEvents, timeRange);
      const filteredAvailabilityEvents = this.filterAvailabilityByTimeRange(availabilityEvents, timeRange);

      const scheduleData = {
        lessons: filteredLessonEvents,
        availability: filteredAvailabilityEvents,
        time: timeRange,
        date: {
          from: startDate,
          to: endDate,
        },
        totalEvents: filteredLessonEvents.length,
        teacherId,
      };

      return plainToInstance(TeacherScheduleResponseDto, {
        body: scheduleData,
      });
    } catch (error) {
      console.error('Error in TeacherScheduleService:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve teacher schedule details');
    }
  }

  /**
   * Load calendar event colors
   */
  private async loadCalendarEventColors(): Promise<Map<string, string>> {
    try {
      const colors = await this.scheduleRepository.findCalendarEventColors();
      const colorMap = new Map<string, string>();
      colors.forEach((color) => {
        if (color.cssClass) {
          colorMap.set(color.cssClass, color.code);
        }
      });
      return colorMap;
    } catch (error) {
      console.error('Error loading calendar event colors:', error);
      return new Map();
    }
  }

  /**
   * Load customer accounts for lessons
   */
  private async loadCustomerAccountsForLessons(
    lessons: Lesson[],
  ): Promise<Map<number, number>> {
    try {
      const courseIds = [...new Set(lessons.map((lesson) => lesson.courseId))];
      if (courseIds.length === 0) {
        return new Map();
      }

      const enrolments = await this.scheduleRepository.findEnrolmentsWithStudentsByCourseIds(courseIds);

      const customerIds = [
        ...new Set(enrolments.map((e) => e.student?.customerId).filter(Boolean)),
      ];

      if (customerIds.length === 0) {
        return new Map();
      }

      const customerAccounts = await this.scheduleRepository.findCustomerAccountsByCustomerIds(customerIds);

      // Map: courseId -> balance (for the student enrolled in that course)
      const customerAccountsMap = new Map<number, number>();
      enrolments.forEach((enrolment) => {
        if (enrolment.student?.customerId) {
          const account = customerAccounts.find(
            (a) => a.customerId === enrolment.student.customerId,
          );
          if (account) {
            customerAccountsMap.set(enrolment.courseId, account.balance);
          }
        }
      });

      return customerAccountsMap;
    } catch (error) {
      console.error('Error loading customer accounts for lessons:', error);
      return new Map();
    }
  }

  /**
   * Load equipment rentals for lessons
   */
  private async loadEquipmentRentalsForLessons(
    lessons: Lesson[],
  ): Promise<Map<number, boolean>> {
    try {
      const courseIds = [...new Set(lessons.map((lesson) => lesson.courseId))];
      if (courseIds.length === 0) {
        return new Map();
      }

      const enrolments = await this.scheduleRepository.findEnrolmentsByCourseIds(courseIds);

      const studentIds = [
        ...new Set(enrolments.map((e) => e.studentId).filter(Boolean)),
      ];

      if (studentIds.length === 0) {
        return new Map();
      }

      const equipmentRentals = await this.scheduleRepository.findEquipmentRentalsByStudentIds(studentIds);

      const equipmentRentalsMap = new Map<number, boolean>();
      enrolments.forEach((enrolment) => {
        const hasUnreturnedRentals = equipmentRentals.some(
          (rental) => rental.studentId === enrolment.studentId,
        );
        equipmentRentalsMap.set(enrolment.courseId, hasUnreturnedRentals);
      });

      return equipmentRentalsMap;
    } catch (error) {
      console.error('Error loading equipment rentals for lessons:', error);
      return new Map();
    }
  }

  /**
   * Load teacher profiles for lessons
   */
  private async loadTeacherProfilesForLessons(
    lessons: Lesson[],
  ): Promise<Map<number, string>> {
    try {
      const teacherIds = [...new Set(lessons.map((lesson) => lesson.teacherId))];
      if (teacherIds.length === 0) {
        return new Map();
      }

      const [teacherProfiles, teachers] = await Promise.all([
        this.scheduleRepository.findUserProfilesByUserIds(teacherIds),
        this.scheduleRepository.findUsersByUserIds(teacherIds),
      ]);

      const teacherProfilesMap = new Map<number, string>();
      teacherIds.forEach((teacherId) => {
        const profile = teacherProfiles.find((p) => p.userId === teacherId);
        const teacher = teachers.find((t) => t.id === teacherId);

        let teacherName = 'Unknown Teacher';
        if (profile) {
          const fullName = `${profile.firstname || ''} ${profile.lastname || ''}`.trim();
          if (fullName) {
            teacherName = fullName;
          } else if (teacher?.username) {
            teacherName = teacher.username;
          }
        } else if (teacher?.username) {
          teacherName = teacher.username;
        }

        teacherProfilesMap.set(teacherId, teacherName);
      });

      return teacherProfilesMap;
    } catch (error) {
      console.error('Error loading teacher profiles for lessons:', error);
      return new Map();
    }
  }

  /**
   * Load enrolment counts for lessons
   */
  private async loadEnrolmentCountsForLessons(
    lessons: Lesson[],
  ): Promise<Map<number, number>> {
    try {
      const courseIds = [...new Set(lessons.map((lesson) => lesson.courseId))];
      if (courseIds.length === 0) {
        return new Map();
      }

      const enrolmentCounts = await this.scheduleRepository.getEnrolmentCountsByCourseIds(courseIds);

      const enrolmentCountsMap = new Map<number, number>();
      enrolmentCounts.forEach((result) => {
        enrolmentCountsMap.set(result.courseId, result.count);
      });

      return enrolmentCountsMap;
    } catch (error) {
      console.error('Error loading enrolment counts for lessons:', error);
      return new Map();
    }
  }

  /**
   * Load first lesson dates for lessons
   */
  private async loadFirstLessonDatesForLessons(
    lessons: Lesson[],
  ): Promise<Map<number, Date>> {
    try {
      const courseIds = [...new Set(lessons.map((lesson) => lesson.courseId))];
      if (courseIds.length === 0) {
        return new Map();
      }

      const firstLessonPromises = courseIds.map(async (courseId) => {
        const firstLesson = await this.scheduleRepository.findFirstLessonByCourseId(courseId);
        return firstLesson ? { courseId, date: firstLesson.date } : null;
      });

      const firstLessons = await Promise.all(firstLessonPromises);
      const firstLessonDatesMap = new Map<number, Date>();

      firstLessons.forEach((result) => {
        if (result) {
          firstLessonDatesMap.set(result.courseId, result.date);
        }
      });

      return firstLessonDatesMap;
    } catch (error) {
      console.error('Error loading first lesson dates for lessons:', error);
      return new Map();
    }
  }

  /**
   * Filter lesson events by time range
   * Only include events that overlap with the visible time range
   */
  private filterEventsByTimeRange(
    events: LessonEventDto[],
    timeRange: { from: string; to: string },
  ): LessonEventDto[] {
    const [fromHours, fromMinutes, fromSeconds] = timeRange.from.split(':').map(Number);
    const [toHours, toMinutes, toSeconds] = timeRange.to.split(':').map(Number);

    return events.filter((event) => {
      // Parse event start time (format: "YYYY-MM-DD HH:mm:ss")
      const eventStartParts = event.start.split(' ');
      if (eventStartParts.length !== 2) return false;

      const eventTimeParts = eventStartParts[1].split(':').map(Number);
      if (eventTimeParts.length < 2) return false;

      const eventStartHours = eventTimeParts[0];
      const eventStartMinutes = eventTimeParts[1];
      const eventStartSeconds = eventTimeParts[2] || 0;

      // Parse event end time (format: "YYYY-MM-DD HH:mm:ss")
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

      // Event must start and end within the time range
      // Event is included if it overlaps with the range (starts before range end and ends after range start)
      return eventStartSecondsTotal < rangeToSeconds && eventEndSecondsTotal > rangeFromSeconds;
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
}

