import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Course } from '../entities/course.entity';
import { CourseGroup } from '../entities/course-group.entity';
import { CourseProgramRate } from '../entities/course-program-rate.entity';
import { CourseSchedule } from '../entities/course-schedule.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { Program } from '../../program/entities/program.entity';
import { Qualification } from '../../qualification/entities/qualification.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { CourseType } from '../enums/course-type';
import { getCurrentESTDate } from 'src/utils/date-utils';

/**
 * Repository for group course creation operations
 * Handles all database operations for creating group courses
 */
@Injectable()
export class GroupCourseCreateRepository {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(CourseGroup)
    private readonly courseGroupRepository: Repository<CourseGroup>,
    @InjectRepository(CourseProgramRate)
    private readonly courseProgramRateRepository: Repository<CourseProgramRate>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
    @InjectRepository(Qualification)
    private readonly qualificationRepository: Repository<Qualification>,
  ) {}

  /**
   * Get program by ID
   */
  async getProgram(programId: number): Promise<Program | null> {
    return await this.programRepository.findOne({
      where: { id: programId, isDeleted: false },
    });
  }

  /**
   * Check if teacher is qualified for the program at the location
   */
  async isTeacherQualified(
    teacherId: number,
    programId: number,
  ): Promise<boolean> {
    const qualification = await this.qualificationRepository.findOne({
      where: {
        teacherId,
        programId,
        isDeleted: false,
      },
    });
    return !!qualification;
  }

  /**
   * Get teacher qualification for rate
   */
  async getTeacherQualification(
    teacherId: number,
    programId: number,
  ): Promise<Qualification | null> {
    return await this.qualificationRepository.findOne({
      where: {
        teacherId,
        programId,
        isDeleted: false,
      },
    });
  }

  /**
   * Create course record
   * Matches legacy: Course::beforeSave() and save()
   */
  async createCourse(
    data: {
      programId: number;
      teacherId: number;
      locationId: number;
      startDate: Date;
      endDate: Date;
      isOnline: number;
      lessonsCount: number;
      createdByUserId: number;
      updatedByUserId: number;
    },
    manager?: EntityManager,
  ): Promise<Course> {
    const repo = manager ? manager.getRepository(Course) : this.courseRepository;
    const now = getCurrentESTDate();
    
    const course = repo.create({
      programId: data.programId,
      teacherId: data.teacherId,
      locationId: data.locationId,
      startDate: data.startDate,
      endDate: data.endDate,
      type: CourseType.REGULAR,
      isConfirmed: 0, // Not confirmed initially (matches legacy: isConfirmed = false)
      isDeleted: false,
      lessonsCount: data.lessonsCount,
      isOnline: data.isOnline,
      createdOn: now,
      updatedOn: now,
      createdByUserId: data.createdByUserId,
      updatedByUserId: data.updatedByUserId,
    });

    return await repo.save(course);
  }

  /**
   * Create course program rate record
   * Matches legacy: Course::afterSave() - CourseProgramRate creation
   */
  async createCourseProgramRate(
    data: {
      courseId: number;
      startDate: Date;
      endDate: Date;
      programRate: number;
    },
    manager?: EntityManager,
  ): Promise<CourseProgramRate> {
    const repo = manager ? manager.getRepository(CourseProgramRate) : this.courseProgramRateRepository;
    
    const courseProgramRate = repo.create({
      courseId: data.courseId,
      startDate: new Date(data.startDate.toISOString().split('T')[0]),
      endDate: new Date(data.endDate.toISOString().split('T')[0]),
      programRate: data.programRate,
      applyFullDiscount: false,
    });

    return await repo.save(courseProgramRate);
  }

  /**
   * Create course group record
   * Matches legacy: Course::afterSave() - CourseGroup creation
   */
  async createCourseGroup(
    data: {
      courseId: number;
      weeksCount: number;
      lessonsPerWeekCount: number;
    },
    manager?: EntityManager,
  ): Promise<CourseGroup> {
    const repo = manager ? manager.getRepository(CourseGroup) : this.courseGroupRepository;
    
    const courseGroup = repo.create({
      courseId: data.courseId,
      weeksCount: data.weeksCount,
      lessonsPerWeekCount: data.lessonsPerWeekCount,
    });

    return await repo.save(courseGroup);
  }

  /**
   * Create course schedule record
   * Matches legacy: CourseController::actionCreate() - CourseSchedule save
   */
  async createCourseSchedule(
    data: {
      courseId: number;
      day: number;
      fromTime: string;
      duration: string;
      teacherId: number;
      startDate: Date;
      endDate: Date;
      isRecent: boolean;
    },
    manager?: EntityManager,
  ): Promise<CourseSchedule> {
    const repo = manager ? manager.getRepository(CourseSchedule) : this.courseScheduleRepository;
    
    const courseSchedule = repo.create({
      courseId: data.courseId,
      day: data.day,
      fromTime: data.fromTime,
      duration: data.duration,
      teacherId: data.teacherId,
      startDate: data.startDate,
      endDate: data.endDate,
      isRecent: data.isRecent,
    });

    return await repo.save(courseSchedule);
  }

  /**
   * Create lesson record
   * Matches legacy: Course::createLesson()
   */
  async createLesson(
    data: {
      courseId: number;
      teacherId: number;
      date: Date;
      duration: string;
      isOnline: boolean;
      isConfirmed: boolean;
      programRate: number;
      teacherRate: number;
      createdByUserId: number;
      updatedByUserId: number;
    },
    manager?: EntityManager,
  ): Promise<Lesson> {
    const repo = manager ? manager.getRepository(Lesson) : this.lessonRepository;
    const now = getCurrentESTDate();
    
    // Format dueDate as date only
    const dueDate = new Date(data.date);
    dueDate.setHours(0, 0, 0, 0);

    const lesson = repo.create({
      courseId: data.courseId,
      teacherId: data.teacherId,
      date: data.date,
      duration: data.duration,
      status: LessonStatusEnum.SCHEDULED, 
      isPresent: true,
      isDeleted: false,
      isConfirmed: data.isConfirmed,
      type: 1, // TYPE_REGULAR
      isExploded: 0,
      isOnline: data.isOnline,
      createdOn: now,
      updatedOn: now,
      createdByUserId: data.createdByUserId,
      updatedByUserId: data.updatedByUserId,
      programRate: data.programRate, // Use the provided programRate
      teacherRate: data.teacherRate,
      teacherRateOld: 0,
      tax: 0,
      total: 0,
      dueDate,
      paidStatus: 0,
      originalDate: data.date, 
    });

    return await repo.save(lesson);
  }

  /**
   * Update lesson program rate
   * Used for last lesson price adjustment (rounding)
   */
  async updateLessonProgramRate(
    lessonId: number,
    programRate: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(Lesson) : this.lessonRepository;
    await repo.update(
      { id: lessonId },
      { programRate },
    );
  }

  /**
   * Get the last unconfirmed lesson for a course
   * Matches legacy: Course::getLastLessonUnconfirmed()
   */
  async getLastUnconfirmedLesson(
    courseId: number,
    manager?: EntityManager,
  ): Promise<Lesson | null> {
    const repo = manager ? manager.getRepository(Lesson) : this.lessonRepository;
    return await repo
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [
          LessonStatusEnum.RESCHEDULED,
          LessonStatusEnum.SCHEDULED,
          LessonStatusEnum.UNSCHEDULED,
        ],
      })
      .orderBy('lesson.date', 'DESC')
      .getOne();
  }

  /**
   * Count lessons for a specific day/time in a course
   * Matches legacy: createLessons() - lesson count check
   */
  async countLessonsForDayTime(
    courseId: number,
    dayNumber: number,
    time: string,
  ): Promise<number> {
    // Get weekday name from day number
    const weekdaysList: Record<number, string> = {
      1: 'Monday',
      2: 'Tuesday',
      3: 'Wednesday',
      4: 'Thursday',
      5: 'Friday',
      6: 'Saturday',
      7: 'Sunday',
    };
    const dayName = weekdaysList[dayNumber];

    const result = await this.lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('DAYNAME(lesson.date) = :dayName', { dayName })
      .andWhere('TIME(lesson.date) = :time', { time })
      .getCount();

    return result;
  }

  /**
   * Update course start and end dates
   * Matches legacy: Course::updateDates()
   */
  async updateCourseDates(
    courseId: number,
    startDate: Date,
    endDate: Date,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(Course) : this.courseRepository;
    await repo.update(
      { id: courseId },
      { startDate, endDate },
    );
  }

  /**
   * Run operations within a transaction using repository's entity manager
   */
  async runInTransaction<T>(
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return await this.courseRepository.manager.transaction(operation);
  }
}
