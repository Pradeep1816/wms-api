import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not, In } from 'typeorm';
import { LocationAvailability } from '../../location/entities/location-availability.entity';
import { Holiday } from '../../holiday/entities/holiday.entity';
import { LocationService } from '../../location/services/location.service';
import { ScheduleDetailsResponseDto, AvailabilityResponseDto, HolidayResponseDto } from '../dto/schedule-details-response.dto';
import { User } from '../../user/entities/user.entity';
import { UserProfile } from '../../user/entities/user-profile.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { TeacherAvailability } from '../../teacher/entities/teacher-availability.entity';
import { TeacherUnavailability } from '../../teacher/entities/teacher-unavailability.entity';
import { Course } from '../../course/entities/course.entity';
import { Program } from '../../program/entities/program.entity';
import { LessonHierarchy } from '../../lesson/entities/lesson-hierarchy.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { Student } from '../../student/entities/student.entity';
import { EquipmentRental } from '../../equipment-rental/entities/equipment-rental.entity';
import { CustomerAccount } from '../../customer/entities/customer-account.entity';
import { Classroom } from '../../classroom/entities/classroom.entity';
import { ClassroomUnavailability } from '../../classroom/entities/classroom-unavailability.entity';
import { CalendarEventColor } from '../../color-code/entities/calendar-event-color.entity';
import { TeacherViewResponseDto, TeacherResourceDto } from '../dto/teacher-view-response.dto';
import { RenderDayEventsRequestDto } from '../dto/render-day-events-request.dto';
import { RenderDayEventsResponseDto, LessonEventDto, AvailabilityEventDto } from '../dto/render-day-events-response.dto';
import { ClassroomResourcesResponseDto, ClassroomResourceDto } from '../dto/classroom-resources-response.dto';
import { ClassroomEventsResponseDto, ClassroomEventDto, ClassroomAvailabilityDto } from '../dto/classroom-events-response.dto';

@Injectable()
export class ScheduleService {
  constructor(
    @InjectRepository(LocationAvailability)
    private readonly locationAvailabilityRepository: Repository<LocationAvailability>,
    @InjectRepository(Holiday)
    private readonly holidayRepository: Repository<Holiday>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(TeacherAvailability)
    private readonly teacherAvailabilityRepository: Repository<TeacherAvailability>,
    @InjectRepository(TeacherUnavailability)
    private readonly teacherUnavailabilityRepository: Repository<TeacherUnavailability>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(LessonHierarchy)
    private readonly lessonHierarchyRepository: Repository<LessonHierarchy>,
    @InjectRepository(CalendarEventColor)
    private readonly calendarEventColorRepository: Repository<CalendarEventColor>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(EquipmentRental)
    private readonly equipmentRentalRepository: Repository<EquipmentRental>,
    @InjectRepository(CustomerAccount)
    private readonly customerAccountRepository: Repository<CustomerAccount>,
    @InjectRepository(Classroom)
    private readonly classroomRepository: Repository<Classroom>,
    @InjectRepository(ClassroomUnavailability)
    private readonly classroomUnavailabilityRepository: Repository<ClassroomUnavailability>,
    private readonly locationService: LocationService,
  ) {}

  /**
   * Get schedule details for a specific location and date
   * Returns availability times and holiday information
   */
  async getScheduleDetails(locationId: number, date: Date): Promise<ScheduleDetailsResponseDto> {
    try {      
      // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
      
      // Run all independent operations in parallel to reduce response time
      const [scheduleAvailability, operationTimeAvailability, holiday] = await Promise.all([
        // Get schedule availability (type = 2)
        this.getLocationAvailability(
          locationId, 
          dayOfWeek, 
          LocationAvailability.TYPE_SCHEDULE_TIME
        ),
        // Get operation time availability (type = 1)
        this.getLocationAvailability(
          locationId, 
          dayOfWeek, 
          LocationAvailability.TYPE_OPERATION_TIME
        ),
        // Get holiday for the date
        this.getHolidayForDate(date),
      ]);
      
      const result = {
        Availabilities: scheduleAvailability,
        OperationTimeAvailability: operationTimeAvailability,
        Holiday: holiday,
      };
      
      return result;
    } catch (error) {
      throw new Error(`Failed to get schedule details: ${error.message}`);
    }
  }

  /**
   * Get location availability for specific day and type
   * Equivalent to: SELECT * FROM location_availability 
   * WHERE isDeleted=FALSE AND locationId=? AND day=? AND type=?
   */
  private async getLocationAvailability(
    locationId: number, 
    day: number, 
    type: number
  ): Promise<AvailabilityResponseDto> {
    try {
      
      const availability = await this.locationAvailabilityRepository.findOne({
        where: {
          locationId,
          day,
          type,
          isDeleted: false,
        },
      });

      if (availability) {
        return {
          from: availability.fromTime,
          to: availability.toTime,
        };
      }

      // Return default times if no availability found
      return {
        from: LocationAvailability.DEFAULT_FROM_TIME,
        to: LocationAvailability.DEFAULT_TO_TIME,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get holiday for specific date
   * Equivalent to: SELECT * FROM holiday WHERE date=?
   */
  private async getHolidayForDate(date: Date): Promise<HolidayResponseDto | null> {
    try {
      
      // Create start and end of day for date comparison
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      
      const holiday = await this.holidayRepository.findOne({
        where: {
          date: Between(startOfDay, endOfDay),
          isDeleted: false,
        },
      });

      if (holiday) {
        return {
          id: holiday.id,
          date: holiday.date,
          description: holiday.description,
          isDeleted: holiday.isDeleted,
        };
      }

      return null;
    } catch (error) {
      console.error(`Error in getHolidayForDate:`, error);
      throw error;
    }
  }

  /**
   * Get teacher resources for schedule view
   * Equivalent to the legacy actionRenderResources() method
   */
  async getTeacherView(
    locationSlug: string,
    date: string,
    showAll: string = '0',
    programId?: string,
    teacherId?: string,
    type?: string,
  ): Promise<TeacherViewResponseDto> {
    try {
      // Get location ID from slug
      const locationId = await this.locationService.getLocationId(locationSlug);
      
      // Parse date and get day of week (1=Monday, 7=Sunday)
      const targetDate = new Date(date);
      const formattedDate = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      const dayOfWeek = targetDate.getDay() === 0 ? 7 : targetDate.getDay(); // Convert Sunday from 0 to 7
      
      let teachers: User[] = [];

      if (showAll === '1' && !teacherId && !programId) {
        // Use UNION query to get both teachers with lessons AND available teachers
        teachers = await this.getTeachersWithUnionQuery(locationId, formattedDate, dayOfWeek);
      } 
      else if (type === 'all-teachers-by-program') {
        teachers = await this.getTeachersWithProgramsQuery(locationId, formattedDate, teacherId, programId);
      } 
      else {
        // Use regular query for teachers with lessons only
        teachers = await this.getTeachersWithLessonsQuery(locationId, formattedDate, teacherId, programId);
      }

      // Get teacher profiles for the found teachers
      const teacherIds = teachers.map(teacher => teacher.id);
      let profiles: UserProfile[] = [];
      if (teacherIds.length > 0) {
        profiles = await this.userProfileRepository
          .createQueryBuilder('profile')
          .where('profile.userId IN (:...teacherIds)', { teacherIds })
          .orderBy('profile.firstname', 'ASC')
          .getMany();
      }

      // Create resources array
      const resources: TeacherResourceDto[] = teachers.map(teacher => {
        const profile = profiles.find(p => p.userId === teacher.id);
        const title = profile 
          ? `${profile.firstname || ''} ${profile.lastname || ''}`.trim() || teacher.username || 'Unknown'
          : teacher.username || 'Unknown';
        
        return {
          id: teacher.id,
          title,
        };
      });

      // Handle empty results with appropriate fallback messages
      if (resources.length === 0) {
        if (teacherId) {
          resources.push({
            id: 0,
            title: 'Teacher not available today',
          });
        } else if (programId) {
          resources.push({
            id: 0,
            title: 'No teacher available today for the selected program',
          });
        } else {
          resources.push({
            id: 0,
            title: 'No teacher available today',
          });
        }
      }

      return { resources };
    } catch (error) {
      throw new Error(`Failed to get teacher view: ${error.message}`);
    }
  }

  /**
   * Get teachers with lessons on specific date
   */
  private async getTeachersWithLessonsQuery(
    locationId: number,
    formattedDate: string,
    teacherId?: string,
    programId?: string,
    type?: string,
  ): Promise<User[]> {
    let query = this.userRepository
      .createQueryBuilder('user')
      .leftJoin('lesson', 'lesson', 
        'user.id = lesson.teacherId AND lesson.status IN (1, 2) AND lesson.isDeleted = false AND lesson.isConfirmed = true')
      .leftJoin('user_profile', 'user_profile', 'user.id = user_profile.user_id')
      .leftJoin('user_location', 'user_location', 'user.id = user_location.user_id')
      .leftJoin('rbac_auth_assignment', 'rbac_auth_assignment', 'user.id = rbac_auth_assignment.user_id')
      .where('user_location.location_id = :locationId', { locationId })
      .andWhere('DATE(lesson.date) = :formattedDate', { formattedDate })
      .andWhere('rbac_auth_assignment.item_name = :role', { role: 'teacher' })
      .andWhere('user.isDeleted = false')
      .groupBy('user.id')
      .orderBy('user_profile.firstname', 'ASC');

    // Handle specific teacher filter
    if (teacherId) {
      query = query.andWhere('user.id = :teacherId', { teacherId: parseInt(teacherId) });
    }

    // Handle program filter - join with qualifications table
    if (programId) {
      query = query
        .leftJoin('qualification', 'qualification', 'user.id = qualification.teacher_id')
        .andWhere('qualification.program_id = :programId', { programId: parseInt(programId) })
        .andWhere('qualification.isDeleted = false');
    }

    return await query.getMany();
  }

    /**
   * Get teachers with lessons on specific date
   */
    private async getTeachersWithProgramsQuery(
      locationId: number,
      formattedDate: string,
      teacherId?: string,
      programId?: string,
    ): Promise<User[]> {
      let query = this.userRepository
        .createQueryBuilder('user')
        .leftJoin('lesson', 'lesson', 
          'user.id = lesson.teacherId AND lesson.status IN (1, 2) AND lesson.isDeleted = false AND lesson.isConfirmed = true')
        .leftJoin('user_profile', 'user_profile', 'user.id = user_profile.user_id')
        .leftJoin('user_location', 'user_location', 'user.id = user_location.user_id')
        .leftJoin('rbac_auth_assignment', 'rbac_auth_assignment', 'user.id = rbac_auth_assignment.user_id')
        .where('user_location.location_id = :locationId', { locationId })
        .andWhere('rbac_auth_assignment.item_name = :role', { role: 'teacher' })
        .andWhere('user.isDeleted = false')
        .groupBy('user.id')
        .orderBy('user_profile.firstname', 'ASC');
  
      // Handle specific teacher filter
      if (teacherId) {
        query = query.andWhere('user.id = :teacherId', { teacherId: parseInt(teacherId) });
      }
  
      // Handle program filter - join with qualifications table
      if (programId) {
        query = query
          .leftJoin('qualification', 'qualification', 'user.id = qualification.teacher_id')
          .andWhere('qualification.program_id = :programId', { programId: parseInt(programId) })
          .andWhere('qualification.isDeleted = false');
      }
  
      return await query.getMany();
    }

  /**
   * Get teachers using UNION query (teachers with lessons + available teachers)
   * This matches the legacy logic exactly
   */
  private async getTeachersWithUnionQuery(
    locationId: number,
    formattedDate: string,
    dayOfWeek: number,
  ): Promise<User[]> {
    // First query: Teachers with lessons on the date (matches legacy base query)
    // Legacy: User::find()->joinWith(['teacherLessons' => function ($query) use ($formatedDate) {
    //   $query->andWhere(['DATE(lesson.date)' => $formatedDate]);
    // }])->joinWith(['userProfile' => function ($query) {
    //   $query->orderBy(['user_profile.firstname' => SORT_ASC]);
    // }])
    const teachersWithLessonsQuery = this.userRepository
      .createQueryBuilder('user')
      .leftJoin('lesson', 'lesson', 
        'user.id = lesson.teacherId AND lesson.status IN (1, 2) AND lesson.isDeleted = false AND lesson.isConfirmed = true')
      .leftJoin('user_profile', 'user_profile', 'user.id = user_profile.user_id')
      .leftJoin('user_location', 'user_location', 'user.id = user_location.user_id')
      .leftJoin('rbac_auth_assignment', 'rbac_auth_assignment', 'user.id = rbac_auth_assignment.user_id')
      .where('user_location.location_id = :locationId', { locationId })
      .andWhere('DATE(lesson.date) = :formattedDate', { formattedDate })
      .andWhere('rbac_auth_assignment.item_name = :role', { role: 'teacher' })
      .andWhere('user.isDeleted = false')
      .groupBy('user.id')
      .orderBy('user_profile.firstname', 'ASC');

    // Second query: Available teachers (EXACT legacy query - NO RBAC filter!)
    // Legacy: SELECT user.* FROM user 
    // LEFT JOIN user_location ON user.id = user_location.user_id 
    // LEFT JOIN teacher_availability_day ON (user_location.id = teacher_availability_day.teacher_location_id) AND (teacher_availability_day.isDeleted=FALSE) 
    // LEFT JOIN user_location uslo ON user.id = uslo.user_id 
    // WHERE (uslo.location_id=22) AND (teacher_availability_day.day='6')
    const availableTeachersQuery = this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user_location', 'user_location', 'user.id = user_location.user_id')
      .leftJoin('teacher_availability_day', 'teacher_availability_day', 
        'user_location.id = teacher_availability_day.teacher_location_id AND teacher_availability_day.isDeleted = false')
      .leftJoin('user_location', 'uslo', 'user.id = uslo.user_id')
      .where('uslo.location_id = :locationId', { locationId })
      .andWhere('teacher_availability_day.day = :dayOfWeek', { dayOfWeek });

    // Execute both queries
    const [teachersWithLessons, availableTeachers] = await Promise.all([
      teachersWithLessonsQuery.getMany(),
      availableTeachersQuery.getMany(),
    ]);

    // Combine teachers with lessons + available teachers
    const allTeachers = [...teachersWithLessons, ...availableTeachers];
    const uniqueTeachers = allTeachers.filter((teacher, index, self) => 
      index === self.findIndex(t => t.id === teacher.id)
    );

    return uniqueTeachers;
  }

  /**
   * Render day events for schedule view
   * Equivalent to the legacy actionRenderDayEvents() method
   */
  async renderDayEvents(
    locationId: number,
    locationSlug: string,
    request: RenderDayEventsRequestDto,
    portal: 'admin' | 'user' = 'admin',
  ): Promise<RenderDayEventsResponseDto> {
    try {
      // Extract parameters from request
      const scheduleSearch = request.ScheduleSearch || {};
      const { date, showAll = false, programId, teacherId } = scheduleSearch;
      
      if (!date) {
        throw new Error('Date parameter is required');
      }

      // Parse date
      const targetDate = new Date(date);
      const formattedDate = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      // const dayOfWeek = targetDate.getDay() === 0 ? 7 : targetDate.getDay(); // Convert Sunday from 0 to 7

      // Run independent operations in parallel
      const [teachersAvailabilities, lessons, colorMap] = await Promise.all([
        // Get teacher availability
        this.getTeacherAvailability(
          teacherId, 
          programId, 
          showAll, 
          targetDate, 
          locationId
        ),
        // Get lessons
        this.getLessons(targetDate, teacherId, locationId, programId, portal),
        // Load calendar event colors for efficient lookup
        this.loadCalendarEventColors(),
      ]);

      // Get availability events (depends on teachersAvailabilities)
      const availabilityEvents = await this.getTeacherAvailabilityEvents(
        teachersAvailabilities, 
        targetDate,
        colorMap
      );

      // Run all lesson-dependent data loading operations in parallel
      const [
        customerAccountsMap,
        equipmentRentalsMap,
        teacherProfilesMap,
        enrolmentCountsMap,
        firstLessonDatesMap,
      ] = await Promise.all([
        // Load customer account data for all students to optimize calculateIsOwing
        this.loadCustomerAccountsForLessons(lessons),
        // Load equipment rental data for all students to optimize calculateIsOwingRentalAgreement
        this.loadEquipmentRentalsForLessons(lessons),
        // Load teacher profile data to optimize getTeacherPublicIdentity
        this.loadTeacherProfilesForLessons(lessons),
        // Load enrolment counts for all courses to optimize getEnrolmentsCount
        this.loadEnrolmentCountsForLessons(lessons),
        // Load first lesson dates for all courses to optimize isEnrolmentFirstLesson
        this.loadFirstLessonDatesForLessons(lessons),
      ]);

      // Process lessons into events in parallel
      const lessonEvents = await Promise.all(
        lessons.map(lesson =>
          this.processLessonToEvent(
            lesson,
            locationSlug,
            colorMap,
            customerAccountsMap,
            equipmentRentalsMap,
            teacherProfilesMap,
            enrolmentCountsMap,
            firstLessonDatesMap,
            portal,
          )
        )
      );

      const sanitizedLessonEvents =
        portal === 'user'
          ? lessonEvents.map(
              ({ isOwing, isOwingRentalAgreement, ...lessonEvent }) =>
                lessonEvent,
            )
          : lessonEvents;

      return {
        lessons: sanitizedLessonEvents,
        availability: availabilityEvents,
        totalEvents: sanitizedLessonEvents.length + availabilityEvents.length,
        date: formattedDate,
        locationId,
      };
    } catch (error) {
      throw new Error(`Failed to render day events: ${error.message}`);
    }
  }

  /**
   * Get teacher availability records for a specific date and filters
   * Equivalent to the legacy getTeacherAvailability() method
   */
  private async getTeacherAvailability(
    teacherId?: number,
    programId?: number,
    showAll: boolean = false,
    date?: Date,
    locationId?: number
  ): Promise<TeacherAvailability[]> {
    try {
      if (!date || !locationId) {
        return [];
      }

      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
      const formattedDate = date.toISOString().split('T')[0];

      let query = this.teacherAvailabilityRepository
        .createQueryBuilder('availability')
        .leftJoinAndSelect('availability.userLocation', 'userLocation')
        .leftJoinAndSelect('userLocation.user', 'user')
        .leftJoinAndSelect('userLocation.location', 'location')
        .where('availability.isDeleted = false')
        .andWhere('availability.day = :dayOfWeek', { dayOfWeek })
        .andWhere('userLocation.location_id = :locationId', { locationId });

      // If not showAll, only include teachers with lessons on that date
      if (!showAll) {
        query = query
          .leftJoin('lesson', 'lesson', 
            'user.id = lesson.teacherId AND lesson.status IN (1, 2) AND lesson.isDeleted = false AND lesson.isConfirmed = true')
          .andWhere('DATE(lesson.date) = :formattedDate', { formattedDate });
      }

      // Filter by specific teacher
      if (teacherId) {
        query = query.andWhere('user.id = :teacherId', { teacherId });
      }

      // Filter by program qualifications
      if (programId) {
        query = query
          .leftJoin('qualification', 'qualification', 'user.id = qualification.teacher_id')
          .andWhere('qualification.program_id = :programId', { programId })
          .andWhere('qualification.isDeleted = false');
      }

      return await query.getMany();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Convert teacher availability records into calendar events, handling unavailability periods
   * Equivalent to the legacy getTeacherAvailabilityEvents() method
   */
  private async getTeacherAvailabilityEvents(
    teachersAvailabilities: TeacherAvailability[],
    date: Date,
    colorMap: Map<string, string>
  ): Promise<AvailabilityEventDto[]> {
    const events: AvailabilityEventDto[] = [];

    for (const availability of teachersAvailabilities) {
      // Get unavailability periods for this teacher
      const unavailabilities = await this.getTeacherUnavailability(availability, date);

      if (unavailabilities.length > 0) {
        // Handle availability with unavailability periods
        for (const unavailability of unavailabilities) {
          // Skip if unavailability completely matches availability times
          if (this.isUnavailabilityCompleteMatch(availability, unavailability)) {
            continue;
          }

          const splitEvents = await this.getAvailabilityEvents(availability, unavailability, date, colorMap);
          events.push(...splitEvents);
        }
      } else {
        // No unavailability, create single availability event
        const regularEvent = await this.getRegularAvailability(availability, date, colorMap);
        events.push(regularEvent);
      }
    }

    return events;
  }

  /**
   * Find unavailability periods for a teacher on a specific date
   * Equivalent to the legacy getTeacherUnavailability() method
   */
  private async getTeacherUnavailability(
    teacherAvailability: TeacherAvailability,
    date: Date
  ): Promise<TeacherUnavailability[]> {
    try {
      const teacherId = teacherAvailability.userLocation.user.id;
      const formattedDate = date.toISOString().split('T')[0];

      return await this.teacherUnavailabilityRepository
        .createQueryBuilder('unavailability')
        .where('unavailability.teacherId = :teacherId', { teacherId })
        .andWhere('unavailability.isDeleted = false')
        .andWhere('DATE(unavailability.fromDateTime) = :formattedDate', { formattedDate })
        .getMany();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Check if unavailability completely matches availability times
   */
  private isUnavailabilityCompleteMatch(
    availability: TeacherAvailability,
    unavailability: TeacherUnavailability
  ): boolean {
    const availabilityStart = availability.fromTime;
    const availabilityEnd = availability.toTime;
    const unavailabilityStart = unavailability.fromDateTime.toTimeString().substring(0, 8);
    const unavailabilityEnd = unavailability.toDateTime.toTimeString().substring(0, 8);

    return (unavailabilityStart === availabilityStart && unavailabilityEnd === availabilityEnd) ||
           (unavailabilityStart === '' && unavailabilityEnd === '');
  }

  /**
   * Create availability events by splitting around unavailability periods
   * Equivalent to the legacy getAvailabilityEvents() method
   */
  private async getAvailabilityEvents(
    availability: TeacherAvailability,
    unavailability: TeacherUnavailability,
    date: Date,
    colorMap: Map<string, string>
  ): Promise<AvailabilityEventDto[]> {
    const events: AvailabilityEventDto[] = [];

    // Create datetime objects for the specific date
    const availabilityStart = this.combineDateWithTime(date, availability.fromTime);
    const availabilityEnd = this.combineDateWithTime(date, availability.toTime);
    const unavailabilityStart = unavailability.fromDateTime;
    const unavailabilityEnd = unavailability.toDateTime;

    // Handle different overlap scenarios
    if (unavailabilityStart > availabilityStart && availabilityEnd >= unavailabilityEnd) {
      // Unavailability in middle: create events before and after
      events.push(this.createAvailabilityEvent(availability, availabilityStart, unavailabilityStart, colorMap));
      
      if (unavailabilityEnd < availabilityEnd) {
        events.push(this.createAvailabilityEvent(availability, unavailabilityEnd, availabilityEnd, colorMap));
      }
    } else if (unavailabilityStart <= availabilityStart && availabilityEnd > unavailabilityEnd) {
      // Unavailability at start: create event after unavailability ends
      events.push(this.createAvailabilityEvent(availability, unavailabilityEnd, availabilityEnd, colorMap));
    } else if (unavailabilityStart > availabilityStart && availabilityEnd < unavailabilityEnd) {
      // Unavailability at end: create event before unavailability starts
      events.push(this.createAvailabilityEvent(availability, availabilityStart, unavailabilityStart, colorMap));
    }

    return events;
  }

  /**
   * Create single availability event when no unavailability exists
   * Equivalent to the legacy getRegularAvailability() method
   */
  private async getRegularAvailability(
    availability: TeacherAvailability,
    date: Date,
    colorMap: Map<string, string>
  ): Promise<AvailabilityEventDto> {
    const start = this.combineDateWithTime(date, availability.fromTime);
    const end = this.combineDateWithTime(date, availability.toTime);

    return this.createAvailabilityEvent(availability, start, end, colorMap);
  }

  /**
   * Create standardized availability event object
   * Equivalent to the legacy setEvents() method
   */
  private createAvailabilityEvent(
    availability: TeacherAvailability,
    start: Date,
    end: Date,
    colorMap: Map<string, string>
  ): AvailabilityEventDto {
    // Format dates to match legacy format exactly (YYYY-MM-DD HH:MM:SS)
    const formatDateTime = (date: Date): string => {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    // Get backgroundColor from database using className, fallback to default if not found
    const backgroundColor = colorMap.get('teacher-availability') || '#a6a6a6';

    return {
      resourceId: availability.userLocation.user.id,
      title: '',
      start: formatDateTime(start),
      end: formatDateTime(end),
      rendering: 'background',
      className: 'teacher-availability', // Add className for availability events
      backgroundColor, // Get color from database via colorMap
    };
  }

  /**
   * Combine date with time string (timezone-safe)
   */
  private combineDateWithTime(date: Date, timeString: string): Date {
    const [hours, minutes, seconds] = timeString.split(':').map(Number);
    
    // Create date string in YYYY-MM-DD format
    const dateStr = date.toISOString().split('T')[0];
    
    // Create datetime string in YYYY-MM-DD HH:MM:SS format
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${(seconds || 0).toString().padStart(2, '0')}`;
    const datetimeStr = `${dateStr} ${timeStr}`;
    
    // Parse as local time to avoid timezone conversion
    return new Date(datetimeStr);
  }

  /**
   * Get lessons for a specific date with various filters
   * Equivalent to the legacy getLessons() method
   */
  private async getLessons(
    date: Date,
    teacherId?: number,
    locationId?: number,
    programId?: number,
    portal: 'admin' | 'user' = 'admin',
  ): Promise<Lesson[]> {
    try {
      const formattedDate = date.toISOString().split('T')[0];

      let query = this.lessonRepository
        .createQueryBuilder('lesson')
        .leftJoinAndSelect('lesson.course', 'course')
        .leftJoinAndSelect('course.program', 'program')
        .leftJoinAndSelect('lesson.teacher', 'teacher')
        .leftJoinAndSelect('lesson.classroom', 'classroom')
        .leftJoinAndSelect('course.enrolments', 'enrolment', 'enrolment.isDeleted = false')
        .leftJoinAndSelect('enrolment.student', 'student', 'student.isDeleted = 0')
        .leftJoinAndSelect('lesson.lessonHierarchy', 'hierarchy')
        .leftJoinAndSelect('hierarchy.lesson', 'rootLesson')
        .leftJoinAndSelect('lesson.bulkRescheduleLesson', 'bulkRescheduleLesson')
        .where('lesson.isDeleted = false')
        .andWhere('lesson.status IN (1, 2)') // SCHEDULED or RESCHEDULED
        .andWhere('lesson.isConfirmed = true')
        .andWhere('DATE(lesson.date) = :formattedDate', { formattedDate })
        .andWhere('course.isDeleted = false')
        .andWhere('course.locationId = :locationId', { locationId });

      if (portal !== 'user') {
        query = query.andWhere('lesson.isPresent = true');
      }

      // Filter by specific teacher
      if (teacherId) {
        query = query.andWhere('lesson.teacherId = :teacherId', { teacherId });
      }

      // Filter by specific program - match legacy behavior
      if (programId) {
        // Legacy behavior: filter teachers by program, not lessons by program
        // Find teachers who are qualified for this program
        query = query
          .leftJoin('qualification', 'qualification', 'teacher.id = qualification.teacher_id')
          .andWhere('qualification.program_id = :programId', { programId })
          .andWhere('qualification.isDeleted = false');
      }

      const lessons = await query.getMany();
      
      return lessons;
    } catch (error) {
      console.error('Error in getLessons:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Process lesson into event format
   * Equivalent to the legacy lesson processing logic
   */
  private async processLessonToEvent(lesson: Lesson, locationSlug: string, colorMap: Map<string, string>, customerAccountsMap: Map<number, number>, equipmentRentalsMap: Map<number, boolean>, teacherProfilesMap: Map<number, string>, enrolmentCountsMap: Map<number, number>, firstLessonDatesMap: Map<number, Date>, portal: 'admin' | 'user' = 'admin'): Promise<LessonEventDto> {
    // Calculate end time by adding duration to start time
    const startTime = new Date(lesson.date);
    const durationParts = lesson.duration.split(':');
    const durationHours = parseInt(durationParts[0]);
    const durationMinutes = parseInt(durationParts[1]);
    
    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + durationHours, startTime.getMinutes() + durationMinutes);

    // Get course and program information from pre-loaded relations
    const course = (lesson as any).course;
    const program = course?.program;


    // Get student name from pre-loaded relations
    const studentName = this.getStudentNameFromRelations(lesson);
    
    // Determine lesson title based on program type
    let title: string;
    if (program?.type === 2) { // GROUP_PROGRAM
      // For group lessons, always use program name
      title = program.name || 'Group Lesson';
    } else if (program?.type === 1) { // PRIVATE_PROGRAM
      // For private lessons, use student name if available
      title = studentName || 'Private Lesson';
    } else {
      title = 'Private Lesson';
    }

    // Determine CSS class based on lesson properties (equivalent to getClass())
    let className = '';
    if (lesson.colorCode) {
      className = ''; // No class if colorCode is set
    } else if (!lesson.isPresent) {
      className = 'absent-lesson';
    } else if (program?.type === 1) { // PRIVATE_PROGRAM
      className = 'private-lesson';
    } else if (program?.type === 2) { // GROUP_PROGRAM
      className = 'group-lesson';
    }

    // Complete lesson status logic based on legacy getClass() method
    if (!lesson.colorCode) {
      // Check for rescheduled lessons (status = 1) - HIGHEST PRIORITY
      if (lesson.status === 1) { // STATUS_RESCHEDULED
        className = 'lesson-rescheduled';
      }
      
      // Check for teacher substitution and other hierarchy-based statuses
      const hierarchy = (lesson as any).lessonHierarchy;
      const rootLesson = hierarchy?.[0]?.lesson; // Get first hierarchy entry's root lesson
      if (rootLesson) {
        if (!lesson.isPresent) {
          className = 'absent-lesson';
        } else if (lesson.status === 1) { // isRescheduled()
          className = 'lesson-rescheduled';
        } else if (rootLesson.teacherId !== lesson.teacherId && !(lesson as any).bulkRescheduleLesson?.length) {
          // Teacher was substituted (not a bulk reschedule)
          className = 'teacher-substituted';
        }
      }
      
      // Check for first lesson in enrolment (applies to both private and group lessons)
      // Only apply if no status-based class has been set (absent, rescheduled, substituted)
      if (!className || (className !== 'absent-lesson' && className !== 'lesson-rescheduled' && className !== 'teacher-substituted') && !this.isExtraLesson(lesson)) {
        const isFirstLesson = this.isEnrolmentFirstLessonWithMap(lesson, firstLessonDatesMap);
        if (isFirstLesson) {
          className = 'first-lesson';
        }
      }
    }



    // Calculate isOwing based on lesson type and balance
    const isOwing = this.calculateIsOwingWithMap(lesson, customerAccountsMap);

    // Calculate isOwingRentalAgreement (equipment rentals not returned)
    const isOwingRentalAgreement = this.calculateIsOwingRentalAgreementWithMap(lesson, equipmentRentalsMap);

    // Get backgroundColor from className using pre-loaded color map
    const backgroundColor = colorMap.get(className) || null;

    // Generate tooltip based on lesson type (equivalent to legacy templates)
    const tooltip = this.generateLessonDescriptionOptimized(lesson, program, title, teacherProfilesMap, enrolmentCountsMap);

    // Get enrolment ID from pre-loaded relations
    const enrolmentId = this.getEnrolmentIdFromRelations(lesson);

    return {
      lessonId: lesson.id,
      isOwing,
      isOwingRentalAgreement,
      resourceId: lesson.teacherId,
      title,
      start: startTime.toISOString().replace('T', ' ').substring(0, 19),
      end: endTime.toISOString().replace('T', ' ').substring(0, 19),
      url:`/v2/${portal}/${locationSlug}/private-lessons/${lesson.id}`,
      className,
      backgroundColor: backgroundColor || lesson.colorCode || '#3788d8', // Use className color, fallback to colorCode, then default
      tooltip,
      isOnline: lesson.isOnline || false,
      programId: program?.id || null, // Add program ID for frontend filtering
      enrolmentId: enrolmentId || null, // Add enrolment ID for frontend
    };
  }

  /**
   * Get course by ID
   */
  private async getCourseById(courseId: number): Promise<Course | null> {
    try {
      return await this.courseRepository.findOne({
        where: { id: courseId, isDeleted: false }
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * Get program by ID
   */
  private async getProgramById(programId: number): Promise<Program | null> {
    try {
      return await this.programRepository.findOne({
        where: { id: programId, isDeleted: false }
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate isOwing based on student customer account balance
   * Equivalent to legacy ScheduleController logic: $lesson->student->customer->customerAccount->balance > 0
   */
  private async calculateIsOwing(lesson: Lesson, program: Program | null): Promise<boolean> {
    try {
      // Get enrolment for this course
      const enrolment = await this.enrolmentRepository.findOne({
        where: {
          courseId: lesson.courseId,
          isDeleted: false
        }
      });

      if (!enrolment) {
        return false;
      }

      // Get student
      const student = await this.studentRepository.findOne({
        where: {
          id: enrolment.studentId,
          isDeleted: 0
        }
      });

      if (!student) {
        return false;
      }

      // Check customer account balance - this matches the legacy behavior exactly
      // Legacy: $lesson->student->customer->customerAccount->balance > 0
      const customerAccount = await this.customerAccountRepository.findOne({
        where: { customerId: student.customerId }
      });

      if (!customerAccount) {
        return false;
      }

      return customerAccount.balance > 0;
    } catch (error) {
      console.error('Error calculating isOwing:', error);
      return false;
    }
  }

  /**
   * Calculate isOwingRentalAgreement based on equipment rentals not returned
   * Equivalent to legacy: $lesson->student->equipmentRentalsNotRetruned
   */
  private async calculateIsOwingRentalAgreement(lesson: Lesson): Promise<boolean> {
    try {
      // Get enrolment for this course
      const enrolment = await this.enrolmentRepository.findOne({
        where: {
          courseId: lesson.courseId,
          isDeleted: false
        }
      });

      if (!enrolment) {
        return false;
      }

      // Get student
      const student = await this.studentRepository.findOne({
        where: {
          id: enrolment.studentId,
          isDeleted: 0
        }
      });

      if (!student) {
        return false;
      }

      // Check if student has equipment rentals that are not returned
      const equipmentRentalsNotReturned = await this.equipmentRentalRepository.find({
        where: {
          studentId: student.id,
          isDeleted: false,
          isReturned: false // Equipment not returned
        }
      });

      // Return true if there are any equipment rentals not returned
      return equipmentRentalsNotReturned.length > 0;
    } catch (error) {
      console.error('Error calculating isOwingRentalAgreement:', error);
      return false;
    }
  }

  /**
   * Get root lesson from lesson hierarchy
   * Equivalent to legacy rootLesson relationship
   */
  private async getRootLesson(lessonId: number): Promise<Lesson | null> {
    try {
      const hierarchy = await this.lessonHierarchyRepository.findOne({
        where: { childLessonId: lessonId },
        relations: ['lesson']
      });
      
      return hierarchy?.lesson || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if lesson is an extra lesson
   * Equivalent to legacy isExtra() method
   * TYPE_REGULAR = 1, TYPE_EXTRA = 2
   */
  private isExtraLesson(lesson: Lesson): boolean {
    return lesson.type === 2; // TYPE_EXTRA
  }

  /**
   * Check if this is the first lesson in an enrolment
   * Equivalent to legacy isEnrolmentFirstlesson() method
   * Finds the first lesson in the course and compares dates
   */
  private async isEnrolmentFirstLesson(lesson: Lesson): Promise<boolean> {
    try {
      const courseId = lesson.courseId;
      
      // Find the first lesson in the course (not deleted, not canceled, ordered by date ASC)
      const firstLesson = await this.lessonRepository.findOne({
        where: {
          courseId: courseId,
          isDeleted: false,
          // Exclude canceled lessons (status !== 4)
          status: Not(4) // STATUS_CANCELED = 4
        },
        order: {
          date: 'ASC'
        }
      });
      
      // Compare dates as ISO strings to avoid timezone/object comparison issues
      const currentDateStr = new Date(lesson.date).toISOString();
      const firstDateStr = firstLesson?.date ? new Date(firstLesson.date).toISOString() : null;
      const isFirstLesson = firstDateStr === currentDateStr;
      
      return isFirstLesson;
    } catch (error) {
      console.error('Error checking if enrolment first lesson:', error);
      return false;
    }
  }

  /**
   * Load all calendar event colors for efficient lookup
   */
  private async loadCalendarEventColors(): Promise<Map<string, string>> {
    try {
      const colors = await this.calendarEventColorRepository.find();
      const colorMap = new Map<string, string>();
      
      colors.forEach(color => {
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
   * Load customer account balances for all students in lessons
   */
  private async loadCustomerAccountsForLessons(lessons: Lesson[]): Promise<Map<number, number>> {
    try {
      // Get all unique course IDs from lessons
      const courseIds = [...new Set(lessons.map(lesson => lesson.courseId))];
      
      if (courseIds.length === 0) {
        return new Map();
      }

      // Get all enrolments for these courses
      const enrolments = await this.enrolmentRepository.find({
        where: { courseId: In(courseIds), isDeleted: false },
        select: ['courseId', 'studentId']
      });

      // Get all student IDs
      const studentIds = [...new Set(enrolments.map(e => e.studentId))];
      
      if (studentIds.length === 0) {
        return new Map();
      }

      // Get all students
      const students = await this.studentRepository.find({
        where: { id: In(studentIds), isDeleted: 0 },
        select: ['id', 'customerId']
      });

      // Get all customer IDs
      const customerIds = [...new Set(students.map(s => s.customerId))];
      
      if (customerIds.length === 0) {
        return new Map();
      }

      // Get all customer accounts
      const customerAccounts = await this.customerAccountRepository.find({
        where: { customerId: In(customerIds) },
        select: ['customerId', 'balance']
      });

      // Create map: courseId -> balance
      const courseToBalanceMap = new Map<number, number>();
      
      enrolments.forEach(enrolment => {
        const student = students.find(s => s.id === enrolment.studentId);
        if (student) {
          const account = customerAccounts.find(a => a.customerId === student.customerId);
          if (account) {
            courseToBalanceMap.set(enrolment.courseId, account.balance);
          }
        }
      });

      return courseToBalanceMap;
    } catch (error) {
      console.error('Error loading customer accounts for lessons:', error);
      return new Map();
    }
  }

  /**
   * Calculate isOwing using pre-loaded customer account data
   */
  private calculateIsOwingWithMap(lesson: Lesson, customerAccountsMap: Map<number, number>): boolean {
    try {
      const balance = customerAccountsMap.get(lesson.courseId);
      return balance ? balance > 0 : false;
    } catch (error) {
      console.error('Error calculating isOwing (optimized):', error);
      return false;
    }
  }

  /**
   * Load equipment rental data for all students in lessons
   */
  private async loadEquipmentRentalsForLessons(lessons: Lesson[]): Promise<Map<number, boolean>> {
    try {
      // Get all unique course IDs from lessons
      const courseIds = [...new Set(lessons.map(lesson => lesson.courseId))];
      
      if (courseIds.length === 0) {
        return new Map();
      }

      // Get all enrolments for these courses
      const enrolments = await this.enrolmentRepository.find({
        where: { courseId: In(courseIds), isDeleted: false },
        select: ['courseId', 'studentId']
      });

      // Get all student IDs
      const studentIds = [...new Set(enrolments.map(e => e.studentId))];
      
      if (studentIds.length === 0) {
        return new Map();
      }

      // Get all equipment rentals that are not returned
      const equipmentRentals = await this.equipmentRentalRepository.find({
        where: { 
          studentId: In(studentIds), 
          isDeleted: false, 
          isReturned: false 
        },
        select: ['studentId']
      });

      // Create map: courseId -> hasUnreturnedRentals
      const courseToRentalsMap = new Map<number, boolean>();
      
      enrolments.forEach(enrolment => {
        const hasUnreturnedRentals = equipmentRentals.some(rental => rental.studentId === enrolment.studentId);
        courseToRentalsMap.set(enrolment.courseId, hasUnreturnedRentals);
      });

      return courseToRentalsMap;
    } catch (error) {
      console.error('Error loading equipment rentals for lessons:', error);
      return new Map();
    }
  }

  /**
   * Calculate isOwingRentalAgreement using pre-loaded equipment rental data
   */
  private calculateIsOwingRentalAgreementWithMap(lesson: Lesson, equipmentRentalsMap: Map<number, boolean>): boolean {
    try {
      return equipmentRentalsMap.get(lesson.courseId) || false;
    } catch (error) {
      console.error('Error calculating isOwingRentalAgreement (optimized):', error);
      return false;
    }
  }

  /**
   * Load teacher profile data for all teachers in lessons
   */
  private async loadTeacherProfilesForLessons(lessons: Lesson[]): Promise<Map<number, string>> {
    try {
      // Get all unique teacher IDs from lessons
      const teacherIds = [...new Set(lessons.map(lesson => lesson.teacherId))];
      
      if (teacherIds.length === 0) {
        return new Map();
      }

      // Get all teacher profiles
      const teacherProfiles = await this.userProfileRepository.find({
        where: { userId: In(teacherIds) },
        select: ['userId', 'firstname', 'lastname']
      });

      // Get all teachers (for username fallback)
      const teachers = await this.userRepository.find({
        where: { id: In(teacherIds) },
        select: ['id', 'username']
      });

      // Create map: teacherId -> teacherName
      const teacherProfilesMap = new Map<number, string>();
      
      teacherIds.forEach(teacherId => {
        const profile = teacherProfiles.find(p => p.userId === teacherId);
        const teacher = teachers.find(t => t.id === teacherId);
        
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
   * Generate lesson tooltip using pre-loaded teacher profile data
   */
  private generateLessonDescriptionOptimized(
    lesson: Lesson, 
    program: Program | null, 
    title: string,
    teacherProfilesMap: Map<number, string>,
    enrolmentCountsMap: Map<number, number>
  ): Array<{name: string, value: string}> {
    try {
      const description: Array<{name: string, value: string}> = [];

      // Get teacher name using pre-loaded data
      const teacherName = teacherProfilesMap.get(lesson.teacherId) || 'Unknown Teacher';

      if (program?.type === 2) { // GROUP_PROGRAM
        // Group lesson tooltip
        description.push({ name: 'Teacher', value: teacherName });
        description.push({ name: 'Program', value: program.name || 'Unknown Program' });
        
        // Get enrolment count using pre-loaded data
        const enrolmentCount = enrolmentCountsMap.get(lesson.courseId) || 0;
        description.push({ name: 'Student Count', value: enrolmentCount.toString() });
      } else {
        // Private lesson tooltip
        description.push({ name: 'Student', value: title });
        description.push({ name: 'Teacher', value: teacherName });
        description.push({ name: 'Program', value: program?.name || 'Unknown Program' });
      }

      // Add classroom information if available (for both group and private lessons)
      if (lesson.classroomId && lesson.classroom) {
        description.push({ name: 'Classroom', value: lesson.classroom.name || 'Unknown Classroom' });
      }

      return description;
    } catch (error) {
      console.error('Error generating lesson tooltip (optimized):', error);
      return [];
    }
  }

  /**
   * Load enrolment counts for all courses in lessons
   */
  private async loadEnrolmentCountsForLessons(lessons: Lesson[]): Promise<Map<number, number>> {
    try {
      // Get all unique course IDs from lessons
      const courseIds = [...new Set(lessons.map(lesson => lesson.courseId))];
      
      if (courseIds.length === 0) {
        return new Map();
      }

      // Get enrolment counts for all courses in one query
      const enrolmentCounts = await this.enrolmentRepository
        .createQueryBuilder('enrolment')
        .select(['enrolment.courseId', 'COUNT(enrolment.id) as count'])
        .where('enrolment.courseId IN (:...courseIds)', { courseIds })
        .andWhere('enrolment.isDeleted = false')
        .groupBy('enrolment.courseId')
        .getRawMany();

      // Create map: courseId -> count
      const enrolmentCountsMap = new Map<number, number>();
      
      enrolmentCounts.forEach(result => {
        enrolmentCountsMap.set(result.enrolment_courseId, parseInt(result.count));
      });

      return enrolmentCountsMap;
    } catch (error) {
      console.error('Error loading enrolment counts for lessons:', error);
      return new Map();
    }
  }

  /**
   * Load first lesson dates for all courses in lessons
   */
  private async loadFirstLessonDatesForLessons(lessons: Lesson[]): Promise<Map<number, Date>> {
    try {
      // Get all unique course IDs from lessons
      const courseIds = [...new Set(lessons.map(lesson => lesson.courseId))];
      
      if (courseIds.length === 0) {
        return new Map();
      }

      // Run all course lookups in parallel to reduce response time
      const firstLessonPromises = courseIds.map(async (courseId) => {
        try {
          const firstLesson = await this.lessonRepository.findOne({
            where: {
              courseId: courseId,
              isDeleted: false,
              status: Not(4) // STATUS_CANCELED = 4
            },
            order: {
              date: 'ASC'
            }
          });
          
          return firstLesson ? { courseId, date: firstLesson.date } : null;
        } catch (error) {
          console.error(`Error loading first lesson for course ${courseId}:`, error);
          return null;
        }
      });

      // Wait for all lookups to complete in parallel
      const results = await Promise.all(firstLessonPromises);
      
      // Build map from results
      const firstLessonDatesMap = new Map<number, Date>();
      results.forEach(result => {
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
   * Check if this is the first lesson in an enrolment using pre-loaded data
   */
  private isEnrolmentFirstLessonWithMap(lesson: Lesson, firstLessonDatesMap: Map<number, Date>): boolean {
    try {
      const firstLessonDate = firstLessonDatesMap.get(lesson.courseId);
      
      if (!firstLessonDate) {
        return false;
      }

      // Compare dates as ISO strings to avoid timezone/object comparison issues
      const currentDateStr = new Date(lesson.date).toISOString();
      const firstDateStr = firstLessonDate.toISOString();
      
      return currentDateStr === firstDateStr;
    } catch (error) {
      console.error('Error checking if enrolment first lesson (optimized):', error);
      return false;
    }
  }

  /**
   * Get color code by className (cssClass)
   * Maps className to backgroundColor using calendar_event_color table
   */
  private async getColorCodeByClassName(className: string): Promise<string | null> {
    try {
      if (!className) {
        return null;
      }

      const colorEvent = await this.calendarEventColorRepository.findOne({
        where: { cssClass: className }
      });

      return colorEvent?.code || null;
    } catch (error) {
      console.error('Error getting color code by className:', error);
      return null;
    }
  }

  /**
   * Get student name from pre-loaded relations
   */
  private getStudentNameFromRelations(lesson: Lesson): string | null {
    try {
      const course = (lesson as any).course;
      
      if (!course || !course.enrolments || course.enrolments.length === 0) {
        return null;
      }

      const enrolment = course.enrolments[0]; // Get first enrolment
      
      const student = enrolment.student;
      
      if (!student) {
        return null;
      }

      const fullName = `${student.firstName} ${student.lastName}`.trim();
      return fullName || 'Unknown Student';
    } catch (error) {
      console.error('Error getting student name from relations:', error);
      return null;
    }
  }

  /**
   * Get enrolment ID from pre-loaded relations
   */
  private getEnrolmentIdFromRelations(lesson: Lesson): number | null {
    try {
      const course = (lesson as any).course;
      
      if (!course || !course.enrolments || course.enrolments.length === 0) {
        return null;
      }

      // Get first enrolment ID (for private lessons, typically one enrolment)
      // For group lessons, this will be the first enrolment in the course
      const enrolment = course.enrolments[0];
      
      return enrolment?.id || null;
    } catch (error) {
      console.error('Error getting enrolment ID from relations:', error);
      return null;
    }
  }

  /**
   * Get student name for a lesson
   * Gets student name through: Lesson → Course → Enrolment → Student
   */
  private async getStudentName(lesson: Lesson): Promise<string | null> {
    try {
      // Get enrolment for this course
      const enrolment = await this.enrolmentRepository.findOne({
        where: {
          courseId: lesson.courseId,
          isDeleted: false
        }
      });

      if (!enrolment) {
        return null;
      }

      // Get student directly from student table
      const student = await this.studentRepository.findOne({
        where: {
          id: enrolment.studentId,
          isDeleted: 0 // Only non-deleted students
        }
      });

      if (!student) {
        return null;
      }

      // Return student name from student table
      const fullName = `${student.firstName} ${student.lastName}`.trim();
      return fullName || 'Unknown Student';
    } catch (error) {
      console.error('Error getting student name:', error);
      return null;
    }
  }

  /**
   * Get teacher public identity (equivalent to User.publicIdentity in legacy)
   */
  private async getTeacherPublicIdentity(teacherId: number): Promise<string> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: teacherId }
      });

      if (!user) {
        return 'Unknown Teacher';
      }

      // Try to get from user profile first
      const profile = await this.userProfileRepository.findOne({
        where: { userId: user.id }
      });

      if (profile) {
        const fullName = `${profile.firstname || ''} ${profile.lastname || ''}`.trim();
        if (fullName) {
          return fullName;
        }
      }

      // Fallback to username
      if (user.username) {
        return user.username;
      }

      // Fallback to email
      return 'Unknown Teacher';
    } catch (error) {
      console.error('Error getting teacher public identity:', error);
      return 'Unknown Teacher';
    }
  }

  /**
   * Get enrolments count for a course (equivalent to Course.getEnrolmentsCount in legacy)
   */
  private async getEnrolmentsCount(courseId: number): Promise<number> {
    try {
      return await this.enrolmentRepository.count({
        where: { 
          courseId: courseId,
          isDeleted: false
        }
      });
    } catch (error) {
      console.error('Error getting enrolments count:', error);
      return 0;
    }
  }

  /**
   * Generate lesson tooltip based on lesson type (equivalent to legacy templates)
   * Converts HTML template logic to array format
   */
  private async generateLessonDescription(
    lesson: Lesson, 
    program: Program | null, 
    title: string
  ): Promise<Array<{name: string, value: string}>> {
    try {
      const description: Array<{name: string, value: string}> = [];

      // Get teacher public identity
      const teacherName = await this.getTeacherPublicIdentity(lesson.teacherId);

      if (program?.type === 2) { // GROUP_PROGRAM
        // Group lesson tooltip (equivalent to group-lesson-description.php)
        description.push({ name: 'Teacher', value: teacherName });
        description.push({ name: 'Program', value: program.name || 'Unknown Program' });
        
        // Get enrolments count for group lessons
        const enrolmentsCount = await this.getEnrolmentsCount(lesson.courseId);
        description.push({ name: 'Student Count', value: enrolmentsCount.toString() });
      } else {
        // Private lesson tooltip (equivalent to private-lesson-description.php)
        // For teacher view, show student name
        description.push({ name: 'Student', value: title });
        description.push({ name: 'Teacher', value: teacherName });
        
        // Add classroom if available
        if (lesson.classroomId) {
          const classroom = await this.classroomRepository.findOne({
            where: { 
              id: lesson.classroomId,
              isDeleted: false
            }
          });
          if (classroom) {
            description.push({ name: 'Classroom', value: classroom.name || 'Unknown Classroom' });
          }
        }
        
        description.push({ name: 'Program', value: program?.name || 'Unknown Program' });
      }

      return description;
    } catch (error) {
      console.error('Error generating lesson tooltip:', error);
      return [];
    }
  }

  /**
   * Get classroom resources for schedule view
   * Equivalent to the legacy actionRenderClassroomResources() method
   */
  async getClassroomResources(locationSlug: string): Promise<ClassroomResourcesResponseDto> {
    try {
      // Get location ID from slug
      const locationId = await this.locationService.getLocationId(locationSlug);
      
      // Get all non-deleted classrooms for the location
      const classrooms = await this.classroomRepository.find({
        where: {
          locationId: locationId,
          isDeleted: false,
        },
        order: {
          id: 'ASC', // Order by id for consistent results
        },
      });

      // Convert to resource format
      const resources: ClassroomResourceDto[] = classrooms.map(classroom => ({
        id: classroom.id,
        title: classroom.name,
        description: classroom.description || '',
      }));

      return { resources };
    } catch (error) {
      throw new Error(`Failed to get classroom resources: ${error.message}`);
    }
  }

  /**
   * Render classroom events for a specific date
   * Equivalent to the legacy actionRenderClassroomEvents() method
   */
  async renderClassroomEvents(locationSlug: string, date: string): Promise<ClassroomEventsResponseDto> {
    try {
      // Get location ID from slug
      const locationId = await this.locationService.getLocationId(locationSlug);
      
      // Parse date
      const targetDate = new Date(date);
      const formattedDate = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      const dayOfWeek = targetDate.getDay() === 0 ? 7 : targetDate.getDay(); // Convert Sunday from 0 to 7

      // 1. Get classroom unavailability events (availability)
      const classroomUnavailabilityEvents = await this.getClassroomUnavailabilityEvents(targetDate, locationId);

      // 2. Get lesson events for classrooms (actual events)
      const lessonEvents = await this.getClassroomLessonEvents(targetDate, locationId, locationSlug);

      return {
        events: lessonEvents,
        availability: classroomUnavailabilityEvents,
        totalEvents: lessonEvents.length,
        date: formattedDate,
        locationId,
      };
    } catch (error) {
      throw new Error(`Failed to render classroom events: ${error.message}`);
    }
  }

  /**
   * Get classroom unavailability events for a specific date
   * Equivalent to the legacy classroom unavailability logic
   */
  private async getClassroomUnavailabilityEvents(date: Date, locationId: number): Promise<ClassroomAvailabilityDto[]> {
    try {
      const formattedDate = date.toISOString().split('T')[0];
      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();

      // Get classroom unavailabilities that overlap with the date
      const classroomUnavailabilities = await this.classroomUnavailabilityRepository
        .createQueryBuilder('unavailability')
        .leftJoinAndSelect('unavailability.classroom', 'classroom')
        .where('DATE(unavailability.fromDate) <= :formattedDate', { formattedDate })
        .andWhere('DATE(unavailability.toDate) >= :formattedDate', { formattedDate })
        .andWhere('classroom.locationId = :locationId', { locationId })
        .andWhere('classroom.isDeleted = false')
        .getMany();

      // Get location availability hours for the day
      const locationAvailability = await this.getLocationAvailability(
        locationId,
        dayOfWeek,
        LocationAvailability.TYPE_SCHEDULE_TIME
      );

      const availability: ClassroomAvailabilityDto[] = [];

      for (const unavailability of classroomUnavailabilities) {
        // Create background event for the entire day using location hours
        const start = this.combineDateWithTime(date, locationAvailability.from);
        const end = this.combineDateWithTime(date, locationAvailability.to);

        availability.push({
          resourceId: unavailability.classroomId,
          title: '',
          start: this.formatDateTime(start),
          end: this.formatDateTime(end),
          className: 'classroom-availability',
          rendering: 'background',
        });
      }

      return availability;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get lesson events for classrooms on a specific date
   * Equivalent to the legacy lesson processing for classroom view
   */
  private async getClassroomLessonEvents(date: Date, locationId: number, locationSlug: string): Promise<ClassroomEventDto[]> {
    try {
      const formattedDate = date.toISOString().split('T')[0];

      // Get lessons with proper joins and data population
      const lessons = await this.lessonRepository
        .createQueryBuilder('lesson')
        .leftJoin('course', 'course', 'lesson.courseId = course.id')
        .leftJoin('program', 'program', 'course.programId = program.id')
        .leftJoin('classroom', 'classroom', 'lesson.classroomId = classroom.id')
        .leftJoin('lesson_hierarchy', 'hierarchy', 'hierarchy.childLessonId = lesson.id')
        .leftJoin('lesson', 'rootLesson', 'hierarchy.lessonId = rootLesson.id')
        .leftJoin('bulk_reschedule_lesson', 'bulkRescheduleLesson', 'bulkRescheduleLesson.lessonId = lesson.id')
        .select([
          'lesson.id',
          'lesson.courseId',
          'lesson.teacherId',
          'lesson.classroomId',
          'lesson.colorCode',
          'lesson.date',
          'lesson.duration',
          'lesson.status',
          'lesson.isPresent',
          'lesson.isDeleted',
          'lesson.isConfirmed',
          'lesson.type',
          'lesson.isExploded',
          'lesson.is_online',
          'lesson.createdByUserId',
          'lesson.updatedByUserId',
          'lesson.programRate',
          'lesson.teacherRate',
          'lesson.teacherRateOld',
          'lesson.tax',
          'lesson.createdOn',
          'lesson.updatedOn',
          'lesson.paidStatus',
          'lesson.total',
          'lesson.dueDate',
          'lesson.originalDate',
          'course.id as course_id',
          'course.programId as course_programId',
          'program.id as program_id',
          'program.name as program_name',
          'program.type as program_type',
          'classroom.id as classroom_id',
          'classroom.name as classroom_name',
          'rootLesson.id as rootLesson_id',
          'rootLesson.teacherId as rootLesson_teacherId',
          'bulkRescheduleLesson.id as bulkRescheduleLesson_id'
        ])
        .where('lesson.isDeleted = false')
        .andWhere('lesson.status IN (1, 2)') // SCHEDULED or RESCHEDULED
        .andWhere('lesson.isConfirmed = true')
        .andWhere('lesson.isPresent = true')
        .andWhere('DATE(lesson.date) = :formattedDate', { formattedDate })
        .andWhere('course.isDeleted = false')
        .andWhere('course.locationId = :locationId', { locationId })
        .andWhere('lesson.classroomId IS NOT NULL')
        .andWhere('classroom.isDeleted = false')
        .getRawAndEntities();

      // Extract lessons and raw data
      const lessonEntities = lessons.entities;
      const rawData = lessons.raw;
      
      
      // Populate lessons with joined data
      const populatedLessons = lessonEntities.map((lesson, index) => {
        const raw = rawData[index];
        const populated = {
          ...lesson,
          course: raw.course_id ? {
            id: raw.course_id,
            programId: raw.course_programId
          } : null,
          program: raw.program_id ? {
            id: raw.program_id,
            name: raw.program_name,
            type: raw.program_type
          } : null,
          classroom: raw.classroom_id ? {
            id: raw.classroom_id,
            name: raw.classroom_name
          } : null,
          rootLesson: raw.rootLesson_id ? {
            id: raw.rootLesson_id,
            teacherId: raw.rootLesson_teacherId
          } : null,
          bulkRescheduleLesson: raw.bulkRescheduleLesson_id ? [{
            id: raw.bulkRescheduleLesson_id
          }] : []
        };
        
        
        return populated;
      });

      // Get all course IDs for batch enrolment queries
      const courseIds = populatedLessons.map(lesson => lesson.courseId);
      
      // Get calendar event colors for proper color mapping
      const calendarEventColors = await this.calendarEventColorRepository.find();
      const colorMap = new Map<string, string>();
      calendarEventColors.forEach(color => {
        colorMap.set(color.cssClass, color.code);
      });
      
      
      // Batch fetch enrolments for all courses
      const enrolments = courseIds.length > 0 ? await this.enrolmentRepository.find({
        where: { courseId: In(courseIds), isDeleted: false },
        select: ['courseId', 'studentId']
      }) : [];

      // Group enrolments by courseId
      const enrolmentsByCourse = enrolments.reduce((acc, enrolment) => {
        if (!acc[enrolment.courseId]) {
          acc[enrolment.courseId] = [];
        }
        acc[enrolment.courseId].push(enrolment.studentId);
        return acc;
      }, {} as Record<number, number[]>);

      // Get all student IDs for batch student queries
      const studentIds = [...new Set(enrolments.flatMap(e => e.studentId))];
      
      // Batch fetch students
      const students = studentIds.length > 0 ? await this.studentRepository.find({
        where: { id: In(studentIds), isDeleted: 0 },
        select: ['id', 'customerId', 'firstName', 'lastName']
      }) : [];

      // Group students by ID
      const studentsById = students.reduce((acc, student) => {
        acc[student.id] = student;
        return acc;
      }, {} as Record<number, any>);

      // Get all customer IDs for batch customer account queries
      const customerIds = [...new Set(students.map(s => s.customerId))];
      
      // Batch fetch customer accounts
      const customerAccounts = customerIds.length > 0 ? await this.customerAccountRepository.find({
        where: { customerId: In(customerIds) },
        select: ['customerId', 'balance']
      }) : [];

      // Group customer accounts by customerId
      const accountsByCustomer = customerAccounts.reduce((acc, account) => {
        acc[account.customerId] = account;
        return acc;
      }, {} as Record<number, any>);

      // Get all teacher IDs for batch teacher queries
      const teacherIds = [...new Set(populatedLessons.map(lesson => lesson.teacherId))];
      
      // Batch fetch teacher profiles
      const teacherProfiles = teacherIds.length > 0 ? await this.userProfileRepository.find({
        where: { userId: In(teacherIds) },
        select: ['userId', 'firstname', 'lastname']
      }) : [];

      // Group teacher profiles by userId
      const profilesByTeacher = teacherProfiles.reduce((acc, profile) => {
        acc[profile.userId] = profile;
        return acc;
      }, {} as Record<number, any>);

      // Get all teacher usernames
      const teachers = teacherIds.length > 0 ? await this.userRepository.find({
        where: { id: In(teacherIds) },
        select: ['id', 'username']
      }) : [];

      // Group teachers by ID
      const teachersById = teachers.reduce((acc, teacher) => {
        acc[teacher.id] = teacher;
        return acc;
      }, {} as Record<number, any>);

      // Load first lesson dates for all courses to optimize first lesson detection
      const firstLessonDatesMap = await this.loadFirstLessonDatesForLessons(populatedLessons as unknown as Lesson[]);

      const events: ClassroomEventDto[] = [];

      for (const lesson of populatedLessons) {
        const lessonEvent = await this.processClassroomLessonToEventOptimized(
          lesson as any, 
          locationSlug,
          enrolmentsByCourse,
          studentsById,
          accountsByCustomer,
          profilesByTeacher,
          teachersById,
          colorMap,
          firstLessonDatesMap
        );
        events.push(lessonEvent);
      }

      return events;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Process lesson into classroom event format (optimized version)
   * Uses pre-fetched data to avoid N+1 queries
   */
  private async processClassroomLessonToEventOptimized(
    lesson: Lesson, 
    locationSlug: string,
    enrolmentsByCourse: Record<number, number[]>,
    studentsById: Record<number, any>,
    accountsByCustomer: Record<number, any>,
    profilesByTeacher: Record<number, any>,
    teachersById: Record<number, any>,
    colorMap: Map<string, string>,
    firstLessonDatesMap: Map<number, Date>
  ): Promise<ClassroomEventDto> {
    // Calculate end time by adding duration to start time
    const startTime = new Date(lesson.date);
    const durationParts = lesson.duration.split(':');
    const durationHours = parseInt(durationParts[0]);
    const durationMinutes = parseInt(durationParts[1]);
    
    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + durationHours, startTime.getMinutes() + durationMinutes);

    // Get course and program information from populated data
    const course = (lesson as any).course;
    const program = (lesson as any).program;

    // Get student name for title (using pre-fetched data)
    const studentName = this.getStudentNameOptimized(lesson, enrolmentsByCourse, studentsById);
    
    // Determine lesson title
    let title: string;
    if (studentName) {
      title = studentName;
    } else if (program?.type === 2) { // GROUP_PROGRAM
      title = program.name || 'Group Lesson';
    } else {
      title = 'Private Lesson';
    }

    // Determine CSS class based on lesson properties
    let className = '';
    if (lesson.colorCode) {
      className = ''; // No class if colorCode is set
    } else if (!lesson.isPresent) {
      className = 'absent-lesson';
    } else if (program?.type === 1) { // PRIVATE_PROGRAM
      className = 'private-lesson';
    } else if (program?.type === 2) { // GROUP_PROGRAM
      className = 'group-lesson';
    }

    // Complete lesson status logic
    if (!lesson.colorCode) {
      if (lesson.status === 1) { // STATUS_RESCHEDULED
        className = 'lesson-rescheduled';
      }
      
      const rootLesson = (lesson as any).rootLesson;
      if (rootLesson) {
        if (!lesson.isPresent) {
          className = 'absent-lesson';
        } else if (lesson.status === 1) {
          className = 'lesson-rescheduled';
        } else if (rootLesson.teacherId !== lesson.teacherId && !(lesson as any).bulkRescheduleLesson?.length) {
          className = 'teacher-substituted';
        }
      }
      
      // Check for first lesson in enrolment (applies to private lessons only)
      // Only apply if no status-based class has been set (absent, rescheduled, substituted)
      if ((!className || (className !== 'absent-lesson' && className !== 'lesson-rescheduled' && className !== 'teacher-substituted')) && program?.type === 1 && !this.isExtraLesson(lesson)) {
        const isFirstLesson = this.isEnrolmentFirstLessonOptimized(lesson, enrolmentsByCourse, firstLessonDatesMap);
        if (isFirstLesson) {
          className = 'first-lesson';
        }
      }
    }

    // Calculate isOwing and isOwingRentalAgreement (using pre-fetched data)
    const isOwing = this.calculateIsOwingOptimized(lesson, enrolmentsByCourse, studentsById, accountsByCustomer);
    const isOwingRentalAgreement = this.calculateIsOwingRentalAgreementOptimized(lesson, enrolmentsByCourse, studentsById);

    // Get backgroundColor from colorMap based on className
    let backgroundColor = lesson.colorCode || '#3788d8';
    if (!lesson.colorCode && className) {
      backgroundColor = colorMap.get(className) || '#3788d8';
    }
    

    // Generate tooltip for classroom view (using pre-fetched data)
    const tooltip = this.generateClassroomLessonDescriptionOptimized(
      lesson, 
      program, 
      title,
      enrolmentsByCourse,
      profilesByTeacher,
      teachersById
    );

    const event = {
      id: lesson.id,
      resourceId: lesson.classroomId,
      title,
      start: startTime.toISOString().replace('T', ' ').substring(0, 19),
      end: endTime.toISOString().replace('T', ' ').substring(0, 19),
      url: `/v2/admin/${locationSlug}/private-lessons/${lesson.id}`,
      className,
      backgroundColor,
      tooltip,
    };
    
    return event;
  }

  /**
   * Process lesson into classroom event format
   * Equivalent to the legacy lesson processing for classroom view
   */
  private async processClassroomLessonToEvent(lesson: Lesson, locationSlug: string): Promise<ClassroomEventDto> {
    // Calculate end time by adding duration to start time
    const startTime = new Date(lesson.date);
    const durationParts = lesson.duration.split(':');
    const durationHours = parseInt(durationParts[0]);
    const durationMinutes = parseInt(durationParts[1]);
    
    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + durationHours, startTime.getMinutes() + durationMinutes);

    // Get course and program information
    const course = await this.getCourseById(lesson.courseId);
    const program = course ? await this.getProgramById(course.programId) : null;

    // Get student name for title
    const studentName = await this.getStudentName(lesson);
    
    // Determine lesson title - use student name if available, otherwise fallback to program type
    let title: string;
    if (studentName) {
      title = studentName;
    } else if (program?.type === 2) { // GROUP_PROGRAM
      title = program.name || 'Group Lesson';
    } else {
      title = 'Private Lesson';
    }

    // Determine CSS class based on lesson properties
    let className = '';
    if (lesson.colorCode) {
      className = ''; // No class if colorCode is set
    } else if (!lesson.isPresent) {
      className = 'absent-lesson';
    } else if (program?.type === 1) { // PRIVATE_PROGRAM
      className = 'private-lesson';
    } else if (program?.type === 2) { // GROUP_PROGRAM
      className = 'group-lesson';
    }

    // Complete lesson status logic
    if (!lesson.colorCode) {
      if (lesson.status === 1) { // STATUS_RESCHEDULED
        className = 'lesson-rescheduled';
      }
      
      const rootLesson = await this.getRootLesson(lesson.id);
      if (rootLesson) {
        if (!lesson.isPresent) {
          className = 'absent-lesson';
        } else if (lesson.status === 1) {
          className = 'lesson-rescheduled';
        } else if (rootLesson.teacherId !== lesson.teacherId && !(lesson as any).bulkRescheduleLesson?.length) {
          className = 'teacher-substituted';
        }
      }
      
      // Check for first lesson in enrolment (applies to private lessons only)
      // Only apply if no status-based class has been set (absent, rescheduled, substituted)
      if ((!className || (className !== 'absent-lesson' && className !== 'lesson-rescheduled' && className !== 'teacher-substituted')) && program?.type === 1 && !this.isExtraLesson(lesson)) {
        const isFirstLesson = await this.isEnrolmentFirstLesson(lesson);
        if (isFirstLesson) {
          className = 'first-lesson';
        }
      }
    }

    // Calculate isOwing and isOwingRentalAgreement
    const isOwing = await this.calculateIsOwing(lesson, program);
    const isOwingRentalAgreement = await this.calculateIsOwingRentalAgreement(lesson);

    // Get backgroundColor
    const backgroundColor = await this.getColorCodeByClassName(className);

    // Generate tooltip for classroom view
    const tooltip = await this.generateClassroomLessonDescription(lesson, program, title);

    return {
      id: lesson.id,
      resourceId: lesson.classroomId,
      title,
      start: startTime.toISOString().replace('T', ' ').substring(0, 19),
      end: endTime.toISOString().replace('T', ' ').substring(0, 19),
      url: `/admin/${locationSlug}/lesson/view?id=${lesson.id}`,
      className,
      backgroundColor: backgroundColor || lesson.colorCode || '#3788d8',
      tooltip,
    };
  }

  /**
   * Generate lesson tooltip for classroom view
   * Equivalent to legacy classroom view templates
   * For classroom view, always shows: Teacher, Student Count, Program
   */
  private async generateClassroomLessonDescription(
    lesson: Lesson, 
    program: Program | null, 
    title: string
  ): Promise<Array<{name: string, value: string}>> {
    try {
      const description: Array<{name: string, value: string}> = [];

      // Get teacher public identity
      const teacherName = await this.getTeacherPublicIdentity(lesson.teacherId);

      // For classroom view, always show the same format regardless of program type
      // Teacher: [Teacher Name]
      description.push({ name: 'Teacher', value: teacherName });
      
      // Student Count: [Number of enrolments]
      const enrolmentsCount = await this.getEnrolmentsCount(lesson.courseId);
      description.push({ name: 'Student Count', value: enrolmentsCount.toString() });
      
      // Program: [Program Name]
      description.push({ name: 'Program', value: program?.name || 'Unknown Program' });

      return description;
    } catch (error) {
      console.error('Error generating classroom lesson tooltip:', error);
      return [];
    }
  }

  /**
   * Format datetime to match legacy format (YYYY-MM-DD HH:MM:SS)
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
   * Get student name using pre-fetched data (optimized)
   */
  private getStudentNameOptimized(
    lesson: Lesson, 
    enrolmentsByCourse: Record<number, number[]>, 
    studentsById: Record<number, any>
  ): string | null {
    try {
      const studentIds = enrolmentsByCourse[lesson.courseId];
      if (!studentIds || studentIds.length === 0) {
        return null;
      }

      // Get first student (assuming single student per lesson for classroom view)
      const studentId = studentIds[0];
      const student = studentsById[studentId];
      
      if (!student) {
        return null;
      }

      const fullName = `${student.firstName} ${student.lastName}`.trim();
      return fullName || 'Unknown Student';
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate isOwing using pre-fetched data (optimized)
   */
  private calculateIsOwingOptimized(
    lesson: Lesson,
    enrolmentsByCourse: Record<number, number[]>,
    studentsById: Record<number, any>,
    accountsByCustomer: Record<number, any>
  ): boolean {
    try {
      const studentIds = enrolmentsByCourse[lesson.courseId];
      if (!studentIds || studentIds.length === 0) {
        return false;
      }

      const studentId = studentIds[0];
      const student = studentsById[studentId];
      
      if (!student) {
        return false;
      }

      const customerAccount = accountsByCustomer[student.customerId];
      if (!customerAccount) {
        return false;
      }

      return customerAccount.balance > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate isOwingRentalAgreement using pre-fetched data (optimized)
   * Note: This is simplified - equipment rentals would need separate batch query
   */
  private calculateIsOwingRentalAgreementOptimized(
    lesson: Lesson,
    enrolmentsByCourse: Record<number, number[]>,
    studentsById: Record<number, any>
  ): boolean {
    // Simplified for performance - would need separate batch query for equipment rentals
    return false;
  }

  /**
   * Check if this is the first lesson in an enrolment (optimized)
   */
  private isEnrolmentFirstLessonOptimized(
    lesson: Lesson, 
    enrolmentsByCourse: Record<number, number[]>,
    firstLessonDatesMap: Map<number, Date>
  ): boolean {
    try {
      const firstLessonDate = firstLessonDatesMap.get(lesson.courseId);
      
      if (!firstLessonDate) {
        return false;
      }

      // Compare dates as ISO strings to avoid timezone/object comparison issues
      const currentDateStr = new Date(lesson.date).toISOString();
      const firstDateStr = firstLessonDate.toISOString();
      
      return currentDateStr === firstDateStr;
    } catch (error) {
      console.error('Error checking if enrolment first lesson (optimized):', error);
      return false;
    }
  }

  /**
   * Generate lesson tooltip for classroom view (optimized)
   */
  private generateClassroomLessonDescriptionOptimized(
    lesson: Lesson, 
    program: Program | null, 
    title: string,
    enrolmentsByCourse: Record<number, number[]>,
    profilesByTeacher: Record<number, any>,
    teachersById: Record<number, any>
  ): Array<{name: string, value: string}> {
    try {
      const description: Array<{name: string, value: string}> = [];

      // Get teacher name using pre-fetched data
      const profile = profilesByTeacher[lesson.teacherId];
      const teacher = teachersById[lesson.teacherId];
      
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

      // Teacher: [Teacher Name]
      description.push({ name: 'Teacher', value: teacherName });
      
      // Student Count: [Number of enrolments]
      const studentIds = enrolmentsByCourse[lesson.courseId] || [];
      description.push({ name: 'Student Count', value: studentIds.length.toString() });
      
      // Program: [Program Name]
      const programName = program?.name || 'Unknown Program';
      description.push({ name: 'Program', value: programName });

      return description;
    } catch (error) {
      console.error('Error generating tooltip:', error);
      return [];
    }
  }
}
