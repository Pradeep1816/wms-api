import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { GroupCourseCreateRepository } from '../repositories/group-course-create.repository';
import { CreateGroupCourseRequestDto, CourseScheduleDto } from '../dto/create-group-course-request.dto';
import {
  CreateGroupCourseResponseDto,
  CreatedLessonDto,
  CreatedScheduleDto,
} from '../dto/create-group-course-response.dto';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import { getWeekdayName } from '../../utils/date-utils';
import { formatTime } from '../../utils/formatters';
import { Course } from '../entities/course.entity';
import { CourseSchedule } from '../entities/course-schedule.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { Repository } from 'typeorm';
import { LogObjectType } from '../../log/enums/log-object-type.enum';
import { User } from '../../user/entities/user.entity';
import { AuditLogWriterService } from '../../log/services/audit-log-writer.service';
import { LogActivityType } from '../../log/enums/log-activity.enum';
import { getDisplayName } from '../../shared/helpers/display-name.helper';
import { RoundingUtils } from '../../utils/rounding.utils';

/**
 * Service for creating group courses
 * Implements the complete legacy PHP logic for group course creation
 */
@Injectable()
export class GroupCourseCreateService {
  private readonly WEEKDAYS_MAP: Record<string, number> = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 7,
  };

  constructor(
    private readonly repository: GroupCourseCreateRepository,
    @InjectRepository(Course)
    private readonly courseEntityRepository?: Repository<Course>,
    @InjectRepository(User)
    private readonly userRepository?: Repository<User>,
    private readonly auditLogWriterService?: AuditLogWriterService,
  ) {}

  /**
   * Create a group course with all related records and lessons
   * Matches legacy: CourseController::actionCreate() for group courses
   */
  async createGroupCourse(
    locationId: number,
    locationSlug: string,
    data: CreateGroupCourseRequestDto,
    loggedUserId: number,
  ): Promise<CreateGroupCourseResponseDto> {
    // Step 1: Validate program (before transaction)
    const program = await this.repository.getProgram(data.programId);
    if (!program) {
      throw new NotFoundException(`Program with ID ${data.programId} not found`);
    }

    // Validate program is group type
    if (program.type !== ProgramTypeEnum.GROUP_PROGRAM) {
      throw new BadRequestException('Program must be a group program type');
    }

    // Step 2: Validate teacher qualification
    const isQualified = await this.repository.isTeacherQualified(
      data.teacherId,
      data.programId,
    );
    if (!isQualified) {
      throw new BadRequestException('Teacher is not qualified for this program');
    }

    // Step 3: Validate schedules
    if (!data.schedules || data.schedules.length === 0) {
      throw new BadRequestException('At least one schedule is required');
    }

    // Step 4: Calculate startDate
    const startDate = data.startDate
      ? this.parseStartDate(data.startDate, data.schedules)
      : this.calculateStartDate(data.schedules);

    // Step 5: Calculate endDate
    const endDate = this.calculateEndDate(startDate, data.weeksCount);

    // Step 6: Get program rate (always use program's default rate)
    const programRate = program.rate ?? 0;

    // Step 7: Get teacher rate from qualification
    const qualification = await this.repository.getTeacherQualification(
      data.teacherId,
      data.programId,
    );
    const teacherRate = qualification?.rate ?? 0;

    // Normalize duration to HH:mm:ss format
    const duration = this.normalizeDuration(data.duration);

    const lessonsPerWeekCount = data.schedules.length;
    const totalLessons = data.weeksCount * lessonsPerWeekCount;

    // Run all database writes in a transaction
    // TypeORM handles commit on success, rollback on error automatically
    const result = await this.repository.runInTransaction(async (manager) => {
      // Step 8: Create course record
      const course = await this.repository.createCourse({
        programId: data.programId,
        teacherId: data.teacherId,
        locationId,
        startDate,
        endDate,
        isOnline: data.isOnline ?? 0,
        lessonsCount: totalLessons,
        createdByUserId: loggedUserId,
        updatedByUserId: loggedUserId,
      }, manager);

      // Step 9: Create course program rate
      await this.repository.createCourseProgramRate({
        courseId: course.id,
        startDate,
        endDate,
        programRate,
      }, manager);

      // Step 10: Create course group
      await this.repository.createCourseGroup({
        courseId: course.id,
        weeksCount: data.weeksCount,
        lessonsPerWeekCount,
      }, manager);

      // Step 11: Create course schedules
      const createdSchedules: CourseSchedule[] = [];
      for (let i = 0; i < data.schedules.length; i++) {
        const schedule = data.schedules[i];
        const dayNumber = this.getDayNumber(schedule.day);
        const normalizedFromTime = this.normalizeTime(schedule.fromTime);

        const courseSchedule = await this.repository.createCourseSchedule({
          courseId: course.id,
          day: dayNumber,
          fromTime: normalizedFromTime,
          duration,
          teacherId: data.teacherId,
          startDate,
          endDate,
          isRecent: i === 0,
        }, manager);

        createdSchedules.push(courseSchedule);
      }

      // Step 12: Create lessons
      const createdLessons = await this.createLessons(
        course,
        createdSchedules,
        data.weeksCount,
        duration,
        teacherRate,
        data.isOnline ?? 0,
        loggedUserId,
        manager,
        programRate,
      );


      // Step 12.5: Update course dates to match first/last lesson (LEGACY: updateDates())
      let updatedStartDate = startDate;
      let updatedEndDate = endDate;
      if (createdLessons.length > 0) {
        const firstLessonDate = createdLessons[0].date;
        const lastLessonDate = createdLessons[createdLessons.length - 1].date;

        await this.repository.updateCourseDates(
          course.id,
          firstLessonDate,
          lastLessonDate,
          manager,
        );

        // Update for response
        updatedStartDate = firstLessonDate;
        updatedEndDate = lastLessonDate;
        course.startDate = firstLessonDate;
        course.endDate = lastLessonDate;
      }

      // Step 13: Update last lesson price for rounding adjustment
      await this.updateLastLessonPrice(
        course.id,
        programRate,
        totalLessons,
        manager,
      );

      return { course, createdSchedules, createdLessons, updatedStartDate, updatedEndDate };
    });

    await this.createCourseCreationLog(result.course.id, locationSlug, loggedUserId);

    // Build response (outside transaction)
    const scheduleDtos: CreatedScheduleDto[] = result.createdSchedules.map((s) => ({
      id: s.id,
      day: s.day,
      dayName: getWeekdayName(s.day),
      fromTime: s.fromTime,
      duration: s.duration,
      teacherId: s.teacherId,
      isRecent: s.isRecent,
    }));

    const lessonDtos: CreatedLessonDto[] = result.createdLessons.map((l) => ({
      id: l.id,
      date: l.date.toISOString(),
      dueDate: l.dueDate.toISOString().split('T')[0],
      duration: l.duration,
      status: l.status,
      teacherId: l.teacherId,
      isConfirmed: l.isConfirmed,
      isOnline: l.isOnline,
    }));

    return {
      success: true,
      data: {
        courseId: result.course.id,
        startDate: result.updatedStartDate.toISOString(),
        endDate: result.updatedEndDate.toISOString(),
        weeksCount: data.weeksCount,
        lessonsPerWeekCount,
        totalLessons: result.createdLessons.length,
        programRate,
        schedules: scheduleDtos,
        lessons: lessonDtos,
        reviewUrl: `/admin/v2/${locationSlug}/lesson/review?courseId=${result.course.id}`,
      },
      message: 'Group course created successfully',
    };
  }

  private async createCourseCreationLog(
    courseId: number,
    locationSlug: string,
    loggedUserId: number,
  ): Promise<void> {
    try {
      if (
        !this.courseEntityRepository ||
        !this.userRepository ||
        !this.auditLogWriterService
      ) {
        return;
      }

      const [course, loggedUser] = await Promise.all([
        this.courseEntityRepository.findOne({
          where: { id: courseId },
          relations: ['program', 'teacher', 'teacher.profile'],
        }),
        this.userRepository.findOne({
          where: { id: loggedUserId },
          relations: ['profile'],
        }),
      ]);

      if (!course?.program || !course.teacher || !loggedUser) {
        return;
      }

      const loggedUserName = getDisplayName(loggedUser);
      const teacherName = getDisplayName(course.teacher);
      const programName = course.program.name?.trim() || 'Unknown';

      await this.auditLogWriterService.writeAuditLog({
        objectType: LogObjectType.COURSE,
        activityType: LogActivityType.TYPE_CREATE,
        message: `${loggedUserName} created new {{${programName}}} classes with {{${teacherName}}} at ${formatTime(course.startDate) || 'Unknown'}`,
        data: this.serializeCourse(course),
        locationId: course.locationId,
        createdUserId: loggedUserId,
        mainHistory: {
          instanceId: course.id,
          instanceType: LogObjectType.COURSE,
        },
      });
    } catch (error) {
      console.error('Error creating course creation log:', error);
    }
  }

  private serializeCourse(course: Course): Record<string, unknown> {
    return {
      id: course.id,
      programId: course.programId,
      teacherId: course.teacherId,
      locationId: course.locationId,
      type: course.type,
      startDate: course.startDate,
      endDate: course.endDate,
      isConfirmed: course.isConfirmed,
      lessonsCount: course.lessonsCount,
      isOnline: course.isOnline,
      createdOn: course.createdOn,
      updatedOn: course.updatedOn,
      createdByUserId: course.createdByUserId,
      updatedByUserId: course.updatedByUserId,
      isDeleted: course.isDeleted,
    };
  }

  /**
   * Parse explicit start date and apply earliest schedule time
   * When user provides a specific start date, we use it as the base
   * and apply the earliest schedule time to it
   */
  private parseStartDate(startDateStr: string, schedules: CourseScheduleDto[]): Date {
    const [year, month, day] = startDateStr.split('-').map(Number);

    // Find the earliest time from schedules
    let earliestTime = '23:59:59';
    for (const schedule of schedules) {
      const normalizedTime = this.normalizeTime(schedule.fromTime);
      if (normalizedTime < earliestTime) {
        earliestTime = normalizedTime;
      }
    }

    // Treat the selected date and schedule time as literal wall-clock components.
    // Date.UTC encodes them as-is for the UTC-configured database connection.
    const [hours, minutes, seconds] = earliestTime.split(':').map(Number);
    return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds || 0));
  }

  /**
   * Calculate start date from schedules
   * Matches legacy: getCourseDate() - sorts schedules and gets earliest time
   * 
   * The start date is the first occurrence of any scheduled day/time
   * starting from today
   */
  private calculateStartDate(schedules: CourseScheduleDto[]): Date {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    let earliestDate: Date | null = null;

    for (const schedule of schedules) {
      const dayNumber = this.getDayNumber(schedule.day);
      const [hours, minutes, seconds = 0] = schedule.fromTime.split(':').map(Number);

      // Find the next occurrence of this weekday
      const nextOccurrence = this.getNextWeekdayOccurrence(today, dayNumber);
      const scheduledOccurrence = new Date(Date.UTC(
        nextOccurrence.getUTCFullYear(),
        nextOccurrence.getUTCMonth(),
        nextOccurrence.getUTCDate(),
        hours,
        minutes,
        seconds,
      ));

      // If the time has already passed today and it's the same day, move to next week
      if (scheduledOccurrence <= now) {
        scheduledOccurrence.setUTCDate(scheduledOccurrence.getUTCDate() + 7);
      }

      if (!earliestDate || scheduledOccurrence < earliestDate) {
        earliestDate = scheduledOccurrence;
      }
    }

    return earliestDate || today;
  }

  /**
   * Get the next occurrence of a specific weekday
   */
  private getNextWeekdayOccurrence(fromDate: Date, targetDay: number): Date {
    const result = new Date(fromDate);
    const currentDay = result.getUTCDay() === 0 ? 7 : result.getUTCDay(); // Convert Sunday from 0 to 7

    let daysToAdd = targetDay - currentDay;
    if (daysToAdd < 0) {
      daysToAdd += 7;
    }

    result.setUTCDate(result.getUTCDate() + daysToAdd);
    return result;
  }

  /**
   * Calculate end date
   * Matches legacy: beforeSave() - endDate = startDate + weeksCount weeks
   */
  private calculateEndDate(startDate: Date, weeksCount: number): Date {
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + weeksCount * 7);
    return endDate;
  }

  /**
   * Convert day name or number to ISO weekday number (1=Monday, 7=Sunday)
   */
  private getDayNumber(day: string): number {
    // If it's already a number
    const parsed = parseInt(day, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 7) {
      return parsed;
    }

    // Convert day name to lowercase and look up
    const dayLower = day.toLowerCase();
    const dayNumber = this.WEEKDAYS_MAP[dayLower];

    if (!dayNumber) {
      throw new BadRequestException(`Invalid day: ${day}. Use day names (Monday-Sunday) or numbers (1-7)`);
    }

    return dayNumber;
  }

  /**
   * Normalize time to HH:mm:ss format
   */
  private normalizeTime(time: string): string {
    const parts = time.split(':');
    if (parts.length === 2) {
      return `${parts[0]}:${parts[1]}:00`;
    }
    return time;
  }

  /**
   * Normalize duration to HH:mm:ss format
   */
  private normalizeDuration(duration: string): string {
    const parts = duration.split(':');
    if (parts.length === 2) {
      return `${parts[0]}:${parts[1]}:00`;
    }
    return duration;
  }

  /**
   * Create lessons for the course
   * Matches legacy: Course::createLessons()
   * 
   * Algorithm:
   * 1. For each schedule entry (day/time combination)
   * 2. Iterate through every day from startDate to endDate
   * 3. If the day matches the schedule day AND lesson count < weeksCount
   * 4. Create a lesson for that date/time
   */
  private async createLessons(
    course: Course,
    schedules: CourseSchedule[],
    weeksCount: number,
    duration: string,
    teacherRate: number,
    isOnline: number,
    loggedUserId: number,
    manager: EntityManager,
    programRate: number,
  ): Promise<Lesson[]> {
    const startDate = new Date(course.startDate);
    const endDate = new Date(course.endDate);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    // --- Calculate per-lesson price ---
    const courseRate = programRate;
    let totalLessonsCount = 0;
    for (const schedule of schedules) {
      const lessonDay = schedule.day;
      const [hours, minutes, seconds] = schedule.fromTime.split(':').map(Number);
      let lessonCount = 0;
      const currentDate = new Date(Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate(),
        hours,
        minutes,
        seconds || 0,
      ));
      while (currentDate < endDate && lessonCount < weeksCount) {
        const currentDayOfWeek = currentDate.getUTCDay() === 0 ? 7 : currentDate.getUTCDay();
        if (currentDayOfWeek === lessonDay) {
          totalLessonsCount++;
          lessonCount++;
        }
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }
    }
    const pricePerLesson = RoundingUtils.roundDecimal(
      courseRate / totalLessonsCount,
      2,
    );
    const lessonsArr: Lesson[] = [];
    for (const schedule of schedules) {
      const lessonDay = schedule.day;
      const [hours, minutes, seconds] = schedule.fromTime.split(':').map(Number);
      let lessonCount = 0;
      const currentDate = new Date(Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate(),
        hours,
        minutes,
        seconds || 0,
      ));
      while (currentDate < endDate && lessonCount < weeksCount) {
        const currentDayOfWeek = currentDate.getUTCDay() === 0 ? 7 : currentDate.getUTCDay();
        if (currentDayOfWeek === lessonDay) {
          const lesson = await this.repository.createLesson({
            courseId: course.id,
            teacherId: schedule.teacherId,
            date: currentDate,
            duration,
            isOnline: isOnline === 1,
            isConfirmed: false,
            programRate: pricePerLesson,
            teacherRate,
            createdByUserId: loggedUserId,
            updatedByUserId: loggedUserId,
          }, manager);
          lessonsArr.push(lesson);
          lessonCount++;
        }
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }
    }
    // Sort lessons by date
    lessonsArr.sort((a, b) => a.date.getTime() - b.date.getTime());
    return lessonsArr;
  }

  /**
   * Update last lesson price for rounding adjustment
   * Matches legacy: CourseController::actionCreate() - last lesson price update
   * 
   * When dividing a course rate across multiple lessons, rounding can cause discrepancies.
   * The last lesson gets the adjusted price to ensure the total matches exactly.
   * 
   * Formula: lastLessonPrice = courseRate - (round(courseRate / count, 2) × (count - 1))
   */
  private async updateLastLessonPrice(
    courseId: number,
    courseRate: number,
    totalLessons: number,
    manager: EntityManager,
  ): Promise<void> {
    if (totalLessons === 0 || courseRate === 0) {
      return;
    }

    // Calculate per-lesson rate (rounded to 2 decimal places)
    const perLessonRate = RoundingUtils.roundDecimal(
      courseRate / totalLessons,
      2,
    );

    // Calculate last lesson price to handle rounding
    const lastLessonPrice = courseRate - (perLessonRate * (totalLessons - 1));

    // Get the last unconfirmed lesson using transaction manager
    const lastLesson = await this.repository.getLastUnconfirmedLesson(courseId, manager);

    if (lastLesson) {
      // Round to 2 decimal places
      const roundedLastLessonPrice = RoundingUtils.roundDecimal(lastLessonPrice, 2);
      await this.repository.updateLessonProgramRate(lastLesson.id, roundedLastLessonPrice, manager);
    }
  }
}
