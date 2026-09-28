import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { Course } from '../../course/entities/course.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { LessonStatusEnum } from '../enums/lesson-status';
import { LessonRepository } from '../repositories/lesson.repository';
import { Holiday } from '../../holiday/entities/holiday.entity';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { Program } from '../../program/entities/program.entity';
import { User } from '../../user/entities/user.entity';
import { UserProfile } from '../../user/entities/user-profile.entity';
import { Student } from '../../student/entities/student.entity';
import { TeacherSubstituteRepository } from '../repositories/teacher-substitute.repository';

export interface LessonReviewItem {
  id: number;
  date: Date | string;
  startTime?: string;
  duration: string;
  conflict?: string;
  isHolidayConflict?: boolean;
  isConflict?: boolean;
  isUnscheduled?: boolean;
}

export interface LessonReviewData {
  courseId: number;
  programId?: number; // Program ID for filtering teachers in edit modal
  programName: string;
  teacherId?: number; // Teacher ID for edit modal (same source as teacherName)
  teacherName: string;
  studentName: string;
  startDate: Date;
  endDate: Date;
  startTime: string;
  lessons: LessonReviewItem[];
  unscheduledLessons?: LessonReviewItem[]; // Old confirmed lessons that became unscheduled
  rescheduledLessons?: LessonReviewItem[]; // Old confirmed lessons that were rescheduled
  summary: {
    holidayConflicted: number;
    conflicted: number;
    unscheduled: number;
    scheduled: number;
    total: number;
  };
}

@Injectable()
export class LessonReviewService {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
    @InjectRepository(Holiday)
    private readonly holidayRepository: Repository<Holiday>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    private readonly lessonRepo: LessonRepository,
    private readonly teacherSubstituteRepository: TeacherSubstituteRepository,
  ) {}

  /**
   * Get lesson review data for a course
   * Matches legacy: actionReview() in LessonController
   */
  async getLessonReview(
    courseId: number,
    locationId: number,
    showAllReviewLessons: boolean = false,
  ): Promise<LessonReviewData> {
    // Get course with relations (Student has firstName/lastName directly, no need for user.profile)
    const course = await this.courseRepository.findOne({
      where: { id: courseId, isDeleted: false },
      relations: [
        'program',
        'teacher',
        'teacher.profile',
        'enrolments',
        'enrolments.student',
      ],
    });

    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    // Get enrolment (Student has firstName/lastName directly, no need for user.profile)
    const enrolment = await this.enrolmentRepository.findOne({
      where: { courseId },
      relations: ['student'],
    });

    if (!enrolment) {
      throw new NotFoundException(`Enrolment for course ${courseId} not found`);
    }

    // Get lessons for the course (status=2 SCHEDULED, isConfirmed=false)
    // Matching legacy query 6: optional review boundaries are applied in SQL.
    // IMPORTANT: Include teacher relation to get teacher name from new lessons (for teacher change scenario)
    const queryBuilder = this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: false })
      .andWhere('lesson.status = :status', {
        status: LessonStatusEnum.SCHEDULED,
      })
      .orderBy('lesson.date', 'ASC');

    // Apply date filter at database level (matching legacy behavior)
    if (!showAllReviewLessons) {
      // Filter by course startDate (matching legacy: DATE(lesson.date) >= startDate)
      const startDate = course.startDate;
      const startDateStr = startDate.toISOString().split('T')[0]; // YYYY-MM-DD
      queryBuilder.andWhere('DATE(lesson.date) >= :startDate', {
        startDate: startDateStr,
      });
    }

    const lessons = await queryBuilder.getMany();

    const reviewDateKeys = Array.from(
      new Set(
        lessons.map(
          (lesson) => new Date(lesson.date).toISOString().split('T')[0],
        ),
      ),
    );
    const holidays =
      reviewDateKeys.length > 0
        ? await this.holidayRepository
            .createQueryBuilder('holiday')
            .where('DATE(holiday.date) IN (:...reviewDates)', {
              reviewDates: reviewDateKeys,
            })
            .andWhere('holiday.isDeleted = :isDeleted', { isDeleted: false })
            .getMany()
        : [];
    const holidayByDate = new Map<string, Holiday>();
    for (const holiday of holidays) {
      const dateKey = new Date(holiday.date).toISOString().split('T')[0];
      if (!holidayByDate.has(dateKey)) {
        holidayByDate.set(dateKey, holiday);
      }
    }

    // This set was previously fetched once per lesson even though it is
    // identical for every iteration of the review.
    const courseConflicts =
      lessons.length > 0
        ? await this.lessonRepository.find({
            where: {
              courseId,
              isConfirmed: false,
              isDeleted: false,
            },
          })
        : [];
    // Check conflicts for each lesson
    const reviewLessons: LessonReviewItem[] = [];
    const conflicts: Record<number, string[]> = {};

    for (const lesson of lessons) {
      const lessonDate = new Date(lesson.date);
      const conflictMessages: string[] = [];

      // Check holiday conflict
      // Note: Holiday entity doesn't have locationId, so we check by date only
      const holidayDateStr = lessonDate.toISOString().split('T')[0];
      const holiday = holidayByDate.get(holidayDateStr);

      if (holiday) {
        conflictMessages.push(`Holiday: ${holiday.description || 'Holiday'}`);
      }

      // Generic enrolment review uses its established per-lesson conflict
      // queries. PSC-specific exclusions stay in the dedicated PSC review flow.

      const dateStr = lessonDate.toISOString().split('T')[0];
      const hours = String(lessonDate.getUTCHours()).padStart(2, '0');
      const minutes = String(lessonDate.getUTCMinutes()).padStart(2, '0');
      const seconds = String(lessonDate.getUTCSeconds()).padStart(2, '0');
      const dateTimeStr = `${dateStr} ${hours}:${minutes}:${seconds}`;
      const studentConflict = await this.lessonRepository
        .createQueryBuilder('lesson')
        .leftJoin('lesson.course', 'course', 'course.isDeleted = FALSE')
        .leftJoin('course.enrolments', 'enrolment')
        .where('lesson.status IN (:...statuses)', {
          statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
        })
        .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
        .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
        .andWhere('DATE(lesson.date) = :dateStr', { dateStr })
        .andWhere('course.locationId = :locationId', { locationId })
        .andWhere('course.isDeleted = :courseIsDeleted', {
          courseIsDeleted: false,
        })
        .andWhere('enrolment.studentId = :studentId', {
          studentId: enrolment.studentId,
        })
        .andWhere('enrolment.isConfirmed = :enrolmentIsConfirmed', {
          enrolmentIsConfirmed: true,
        })
        .andWhere('enrolment.isDeleted = :enrolmentIsDeleted', {
          enrolmentIsDeleted: false,
        })
        .andWhere(
          `lesson.date < ADDTIME(:dateTime, :duration) AND :dateTime < ADDTIME(lesson.date, lesson.duration)`,
          { dateTime: dateTimeStr, duration: lesson.duration },
        )
        .andWhere('lesson.id != :excludeLessonId', {
          excludeLessonId: lesson.id,
        })
        .getOne();

      if (studentConflict) {
        conflictMessages.push(
          "Lesson time conflicts with student's another lesson",
        );
      }

      // Check course conflict (overlapping lessons in the same course, excluding current lesson)
      // This checks if there are other unconfirmed lessons in the same course at the same time
      const courseConflict = courseConflicts.find(
        (conflict) =>
          conflict.id !== lesson.id &&
          new Date(conflict.date).toDateString() ===
            lessonDate.toDateString() &&
          this.isTimeOverlapping(
            lessonDate,
            lesson.duration,
            new Date(conflict.date),
            conflict.duration,
          ),
      );

      if (courseConflict) {
        conflictMessages.push(
          'Lesson time conflicts with same enrolment lesson',
        );
      }

      const teacherIdToCheck = lesson.teacherId || course.teacherId;
      const teacherConflict = await this.checkTeacherConflict(
        teacherIdToCheck,
        lessonDate,
        lesson.duration,
        locationId,
        lesson.id,
      );

      if (teacherConflict) {
        conflictMessages.push(
          "Lesson time conflicts with teacher's another lesson",
        );
      }

      const hasConflict = conflictMessages.length > 0;
      const isHolidayConflict = !!holiday;

      reviewLessons.push({
        id: lesson.id,
        date: lessonDate,
        duration: lesson.duration,
        conflict: hasConflict ? conflictMessages.join('; ') : undefined,
        isHolidayConflict,
        isConflict: hasConflict && !isHolidayConflict,
        isUnscheduled: false, // Lessons are scheduled (status=2)
      });

      if (hasConflict) {
        conflicts[lesson.id] = conflictMessages;
      }
    }

    // Calculate summary
    const holidayConflicted = reviewLessons.filter(
      (l) => l.isHolidayConflict,
    ).length;
    const conflicted = reviewLessons.filter(
      (l) => l.isConflict && !l.isHolidayConflict,
    ).length;
    const unscheduled = reviewLessons.filter(
      (l) => l.isUnscheduled && !l.isHolidayConflict && !l.isConflict,
    ).length;
    const scheduled =
      reviewLessons.length - (holidayConflicted + conflicted + unscheduled);

    // Generic reviews use the current course teacher.
    const teacherName = course.teacher?.profile
      ? `${course.teacher.profile.firstname || ''} ${course.teacher.profile.lastname || ''}`.trim()
      : '';
    const teacherId = course.teacherId ?? undefined;
    console.log('[REVIEW] Using teacher from course:', {
      teacherId: course.teacherId,
      teacherName,
    });

    // Get student name (Student entity has firstName and lastName directly, not through user profile)
    const studentName = enrolment.student
      ? `${enrolment.student.firstName || ''} ${enrolment.student.lastName || ''}`.trim()
      : '';

    const startDate = course.startDate;
    const endDate = course.endDate;
    const courseSchedule = await this.courseScheduleRepository.findOne({
      where: { courseId, isRecent: true },
    });
    const startTime = courseSchedule?.fromTime || '';

    return {
      courseId: course.id,
      programId: course.programId ?? course.program?.id ?? undefined,
      programName: course.program?.name || '',
      teacherId,
      teacherName,
      studentName,
      startDate,
      endDate,
      startTime,
      lessons: reviewLessons,
      unscheduledLessons: [],
      rescheduledLessons: [],
      summary: {
        holidayConflicted,
        conflicted,
        unscheduled,
        scheduled,
        total: reviewLessons.length,
      },
    };
  }

  /**
   * Check if two time ranges overlap
   */
  private isTimeOverlapping(
    date1: Date,
    duration1: string,
    date2: Date,
    duration2: string,
  ): boolean {
    const time1 = date1.getTime();
    const [h1, m1, s1] = duration1.split(':').map(Number);
    const end1 = time1 + (h1 * 3600 + m1 * 60 + s1) * 1000;

    const time2 = date2.getTime();
    const [h2, m2, s2] = duration2.split(':').map(Number);
    const end2 = time2 + (h2 * 3600 + m2 * 60 + s2) * 1000;

    return time1 < end2 && time2 < end1;
  }

  /** Check for a confirmed, present lesson overlapping this teacher's draft. */
  private async checkTeacherConflict(
    teacherId: number,
    date: Date,
    duration: string,
    locationId: number,
    excludeLessonId?: number,
  ): Promise<Lesson | null> {
    const dateStr = date.toISOString().split('T')[0];
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const dateTimeStr = `${dateStr} ${hours}:${minutes}:${seconds}`;

    const query = this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoin('lesson.course', 'course', 'course.isDeleted = FALSE')
      .where('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('lesson.teacherId = :teacherId', { teacherId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.isPresent = :isPresent', { isPresent: true })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('DATE(lesson.date) = :dateStr', { dateStr })
      .andWhere(
        `lesson.date < ADDTIME(:dateTime, :duration) AND :dateTime < ADDTIME(lesson.date, lesson.duration)`,
        { dateTime: dateTimeStr, duration },
      );

    if (excludeLessonId) {
      query.andWhere('lesson.id != :excludeLessonId', { excludeLessonId });
    }

    return query.getOne();
  }

  /**
   * Get lesson review data for enrolments (bulk teacher change scenario)
   * Matches legacy: LessonController::actionReview() when enrolmentIds is provided
   */
  async getLessonReviewForEnrolments(
    locationId: number,
    enrolmentIds: number[],
    teacherId?: number,
    changesFrom?: string,
    isBulkTeacherChange: boolean = false,
  ): Promise<{
    lessons: LessonReviewItem[];
    details: {
      oldTeacherName?: string;
      newTeacherName?: string;
      studentNames?: string;
      changesFrom?: string;
      isBulkTeacherChange: boolean;
    };
    summary: {
      holidayConflicted: number;
      conflicted: number;
      unscheduled: number;
      scheduled: number;
      total: number;
    };
  }> {
    if (!changesFrom) {
      throw new NotFoundException(
        'changesFrom date is required for bulk teacher change',
      );
    }

    // Parse changesFrom date (format: YYYY-MM-DD)
    // Parse as local date to avoid timezone conversion issues
    const [year, month, day] = changesFrom.split('-').map(Number);
    const changesFromDate = new Date(year, month - 1, day, 0, 0, 0, 0); // Local time, not UTC
    const changesFromDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; // YYYY-MM-DD

    console.log('[REVIEW] getLessonReviewForEnrolments called with:', {
      enrolmentIds,
      teacherId,
      changesFrom,
      changesFromDateStr,
      isBulkTeacherChange,
      locationId,
    });

    // Step 1: Get enrolments with courses
    const enrolments = await this.enrolmentRepository.find({
      where: {
        id: In(enrolmentIds),
        isDeleted: false,
      },
      relations: [
        'course',
        'course.program',
        'course.teacher',
        'course.teacher.profile',
        'student',
      ],
    });

    if (enrolments.length === 0) {
      throw new NotFoundException('No enrolments found for the provided IDs');
    }

    // Step 2: Get old confirmed lessons from changesFrom date (matching legacy lines 552-559)
    // Legacy query 1: Joins lesson -> course -> enrolment, filters by enrolment.id IN (enrolmentIds)
    // SELECT `lesson`.* FROM `lesson` LEFT JOIN `course` ON ... LEFT JOIN `enrolment` ON ...
    // WHERE ... AND (`enrolment`.`id` IN ('31520', '31520'))
    // IMPORTANT: Use DISTINCT to avoid duplicate lessons when multiple enrolments share the same course
    const oldLessons = await this.lessonRepository
      .createQueryBuilder('lesson')
      .distinct(true)
      .leftJoin('lesson.course', 'course', 'course.isDeleted = false')
      .leftJoin(
        'course.enrolments',
        'enrolment',
        'enrolment.id IN (:...enrolmentIds)',
        { enrolmentIds },
      )
      .where('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('DATE(lesson.date) >= :changesFrom', {
        changesFrom: changesFromDateStr,
      })
      .andWhere('lesson.status != :canceled', {
        canceled: LessonStatusEnum.CANCELED,
      })
      .andWhere('course.isDeleted = false')
      .andWhere('enrolment.id IN (:...enrolmentIds)', { enrolmentIds })
      .orderBy('lesson.date', 'ASC')
      .getMany();

    const oldLessonIds = oldLessons.map((l) => l.id);

    console.log(
      '[REVIEW] Old lesson IDs (to be excluded from conflicts):',
      oldLessonIds,
    );

    // Step 3: Get new unconfirmed draft lessons from changesFrom date (matching legacy lines 560-567)
    // Legacy query 4: Joins lesson -> course -> enrolment, filters by enrolment.id IN (enrolmentIds)
    // SELECT `lesson`.* FROM `lesson` LEFT JOIN `course` ON ... LEFT JOIN `enrolment` ON ...
    // WHERE ... AND (`enrolment`.`id` IN ('31520', '31520'))
    // IMPORTANT: Use DISTINCT to avoid duplicate lessons when multiple enrolments share the same course
    // IMPORTANT: Filter by teacherId to only get lessons for the new teacher
    const newLessonsQuery = this.lessonRepository
      .createQueryBuilder('lesson')
      .distinct(true)
      .leftJoin('lesson.course', 'course', 'course.isDeleted = false')
      .leftJoin(
        'course.enrolments',
        'enrolment',
        'enrolment.id IN (:...enrolmentIds)',
        { enrolmentIds },
      )
      .where('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: false })
      .andWhere('DATE(lesson.date) >= :changesFrom', {
        changesFrom: changesFromDateStr,
      })
      .andWhere('lesson.status != :canceled', {
        canceled: LessonStatusEnum.CANCELED,
      })
      .andWhere('course.isDeleted = false')
      .andWhere('enrolment.id IN (:...enrolmentIds)', { enrolmentIds });

    // Filter by teacherId if provided (for teacher change)
    if (teacherId) {
      newLessonsQuery.andWhere('lesson.teacherId = :teacherId', { teacherId });
    }

    const newLessons = await newLessonsQuery
      .orderBy('lesson.date', 'ASC')
      .getMany();

    // Get course start date to filter out lessons created before course starts
    // This handles cases where lessons were created before the fix that respects course start date
    // For bulk teacher change, all enrolments typically share the same course
    // Get unique courses and their start dates
    const coursesByStartDate = new Map<number, string | null>();
    for (const enrolment of enrolments) {
      if (enrolment.courseId && !coursesByStartDate.has(enrolment.courseId)) {
        const course = enrolment.course;
        if (course?.startDate) {
          const courseStartDate = new Date(course.startDate);
          const courseStartDateStr = `${courseStartDate.getUTCFullYear()}-${String(courseStartDate.getUTCMonth() + 1).padStart(2, '0')}-${String(courseStartDate.getUTCDate()).padStart(2, '0')}`;
          coursesByStartDate.set(enrolment.courseId, courseStartDateStr);
        } else {
          coursesByStartDate.set(enrolment.courseId, null);
        }
      }
    }

    console.log('[REVIEW] Course start date filter:', {
      coursesByStartDate: Array.from(coursesByStartDate.entries()).map(
        ([courseId, startDate]) => ({ courseId, startDate }),
      ),
      changesFromDateStr,
    });

    // Additional filter: Remove any lessons that are:
    // 1. Before changesFrom (safety check)
    // 2. Before course start date (if course has a start date) - prevents showing lessons created before course starts
    const filteredNewLessons = newLessons.filter((lesson) => {
      const lessonDate = new Date(lesson.date);
      const lessonDateStr = `${lessonDate.getUTCFullYear()}-${String(lessonDate.getUTCMonth() + 1).padStart(2, '0')}-${String(lessonDate.getUTCDate()).padStart(2, '0')}`;

      // Must be >= changesFrom
      if (lessonDateStr < changesFromDateStr) {
        console.log('[REVIEW] Filtering out lesson before changesFrom:', {
          lessonId: lesson.id,
          lessonDateStr,
          changesFromDateStr,
        });
        return false;
      }

      // Must be >= course start date (if course has a start date)
      const courseStartDateStr = lesson.courseId
        ? coursesByStartDate.get(lesson.courseId)
        : null;
      if (courseStartDateStr && lessonDateStr < courseStartDateStr) {
        console.log('[REVIEW] Filtering out lesson before course start date:', {
          lessonId: lesson.id,
          courseId: lesson.courseId,
          lessonDateStr,
          courseStartDateStr,
        });
        return false;
      }

      return true;
    });

    console.log('[REVIEW] New lessons after filtering:', {
      beforeFilter: newLessons.length,
      afterFilter: filteredNewLessons.length,
      filteredOut: newLessons.length - filteredNewLessons.length,
      changesFromDateStr,
    });

    // Step 4: Get teacher names (old and new)
    // IMPORTANT: Get old teacher from old lessons (not from current course) because course teacher might have been changed
    // Get old teacher ID from the first old lesson's course teacher
    let oldTeacherId: number | undefined;
    if (oldLessons.length > 0 && oldLessons[0].courseId) {
      const oldCourse = await this.courseRepository.findOne({
        where: { id: oldLessons[0].courseId },
      });
      oldTeacherId = oldCourse?.teacherId;
    }

    // Fallback: if no old lessons, get from first enrolment's course
    if (!oldTeacherId) {
      const firstEnrolment = enrolments[0];
      oldTeacherId = firstEnrolment.course?.teacherId;
    }

    let oldTeacherName: string | undefined;
    let newTeacherName: string | undefined;

    console.log('[REVIEW] Teacher IDs:', {
      oldTeacherId,
      newTeacherId: teacherId,
    });

    if (oldTeacherId) {
      const oldTeacher = await this.userRepository.findOne({
        where: { id: oldTeacherId },
        relations: ['profile'],
      });
      if (oldTeacher?.profile) {
        oldTeacherName =
          `${oldTeacher.profile.firstname || ''} ${oldTeacher.profile.lastname || ''}`.trim();
      }
      console.log('[REVIEW] Old teacher:', { oldTeacherId, oldTeacherName });
    }

    if (teacherId) {
      const newTeacher = await this.userRepository.findOne({
        where: { id: teacherId },
        relations: ['profile'],
      });
      if (newTeacher?.profile) {
        newTeacherName =
          `${newTeacher.profile.firstname || ''} ${newTeacher.profile.lastname || ''}`.trim();
      }
      console.log('[REVIEW] New teacher:', { teacherId, newTeacherName });
    }

    // Step 5: Get student names
    const studentNames = enrolments
      .map((e) => {
        if (e.student) {
          return `${e.student.firstName || ''} ${e.student.lastName || ''}`.trim();
        }
        return null;
      })
      .filter((name): name is string => name !== null && name !== '');

    console.log('[REVIEW] Found lessons:', {
      oldLessonsCount: oldLessons.length,
      newLessonsCount: filteredNewLessons.length,
      newLessons: filteredNewLessons.map((l) => ({
        id: l.id,
        date: new Date(l.date).toISOString(),
        courseId: l.courseId,
        teacherId: l.teacherId,
      })),
    });

    // Step 6: Check conflicts for each new lesson
    const reviewLessons: LessonReviewItem[] = [];
    const allStudentIds = new Set(
      enrolments
        .map((e) => e.studentId)
        .filter((id): id is number => id !== undefined),
    );

    // Get all new lesson IDs to exclude from conflict checks
    const newLessonIds = filteredNewLessons.map((l) => l.id);
    const exclusionIds = [...newLessonIds, ...oldLessonIds];

    console.log('[REVIEW] Processing new lessons for conflicts:', {
      studentIds: Array.from(allStudentIds),
      newLessonIds,
      teacherId,
      locationId,
    });

    for (const lesson of filteredNewLessons) {
      // IMPORTANT: Lesson dates are stored as UTC but represent local time (created with parseLocalDateTime)
      // Use UTC methods to extract the time correctly
      const lessonDate = new Date(lesson.date);

      console.log('[REVIEW] Processing lesson:', {
        lessonId: lesson.id,
        lessonDateUTC: lessonDate.toISOString(),
        lessonDateLocal: lessonDate.toString(),
      });

      const conflictMessages: string[] = [];

      // Check holiday conflict - use UTC date string for query
      const holidayDateStr = `${lessonDate.getUTCFullYear()}-${String(lessonDate.getUTCMonth() + 1).padStart(2, '0')}-${String(lessonDate.getUTCDate()).padStart(2, '0')}`;
      const holiday = await this.holidayRepository
        .createQueryBuilder('holiday')
        .where('DATE(holiday.date) = :date', { date: holidayDateStr })
        .andWhere('holiday.isDeleted = :isDeleted', { isDeleted: false })
        .getOne();

      if (holiday) {
        conflictMessages.push(`Holiday: ${holiday.description || 'Holiday'}`);
        console.log('[REVIEW] Holiday conflict found:', {
          lessonId: lesson.id,
          holiday: holiday.description,
        });
      }

      // Legacy teacher-change review order:
      // 1) qualification, 2) teacher overlap, 3) student overlap, 4) same-enrolment overlap.
      const teacherIdToCheck = teacherId ?? lesson.teacherId;
      const sourceEnrolment = enrolments.find(
        (enrolment) => enrolment.courseId === lesson.courseId,
      );
      const programId = sourceEnrolment?.course?.programId;
      const programName = sourceEnrolment?.course?.program?.name || '';

      if (teacherIdToCheck) {
        const qualificationFailed =
          programId === undefined ||
          (await this.teacherSubstituteRepository.checkTeacherQualification(
            teacherIdToCheck,
            programId,
            locationId,
          ));

        if (qualificationFailed) {
          conflictMessages.push(
            `Please choose an eligible teacher who is qualified to teach ${programName}!`,
          );
        }

        const teacherConflict =
          await this.teacherSubstituteRepository.checkTeacherConflict(
            teacherIdToCheck,
            lesson.date,
            lesson.duration,
            locationId,
            exclusionIds.length > 0 ? exclusionIds : [0],
          );
        if (teacherConflict) {
          conflictMessages.push('Teacher occupied with another lesson');
        }
      }

      // Check student conflict only for private programs, matching legacy StudentValidator.
      const isPrivateProgram =
        sourceEnrolment?.course?.program?.type === Program.TYPE_PRIVATE_PROGRAM;
      if (isPrivateProgram) {
        // IMPORTANT: Exclude all new lessons and the old lessons that will be cancelled.
        for (const studentId of allStudentIds) {
          const dateStr = `${lessonDate.getUTCFullYear()}-${String(lessonDate.getUTCMonth() + 1).padStart(2, '0')}-${String(lessonDate.getUTCDate()).padStart(2, '0')}`;
          const hours = String(lessonDate.getUTCHours()).padStart(2, '0');
          const minutes = String(lessonDate.getUTCMinutes()).padStart(2, '0');
          const seconds = String(lessonDate.getUTCSeconds()).padStart(2, '0');
          const dateTimeStr = `${dateStr} ${hours}:${minutes}:${seconds}`;

          const conflictingLesson = await this.lessonRepository
            .createQueryBuilder('lesson')
            .leftJoin('lesson.course', 'course', 'course.isDeleted = FALSE')
            .leftJoin('course.enrolments', 'enrolment')
            .where('lesson.status IN (:...statuses)', { statuses: [1, 2] }) // 1=RESCHEDULED, 2=SCHEDULED
            .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
            .andWhere('lesson.isConfirmed = :isConfirmed', {
              isConfirmed: true,
            })
            .andWhere('DATE(lesson.date) = :dateStr', { dateStr })
            .andWhere('course.locationId = :locationId', { locationId })
            .andWhere('course.isDeleted = :courseIsDeleted', {
              courseIsDeleted: false,
            })
            .andWhere('enrolment.studentId = :studentId', { studentId })
            .andWhere('enrolment.isConfirmed = :enrolmentIsConfirmed', {
              enrolmentIsConfirmed: true,
            })
            .andWhere('enrolment.isDeleted = :enrolmentIsDeleted', {
              enrolmentIsDeleted: false,
            })
            // IMPORTANT: Exclude both new lesson IDs and old lesson IDs (old lessons will be cancelled)
            .andWhere('lesson.id NOT IN (:...excludeLessonIds)', {
              excludeLessonIds: exclusionIds.length > 0 ? exclusionIds : [0],
            })
            .andWhere(
              `lesson.date < ADDTIME(:dateTime, :duration) AND :dateTime < ADDTIME(lesson.date, lesson.duration)`,
              {
                dateTime: dateTimeStr,
                duration: lesson.duration,
              },
            )
            .getOne();

          if (conflictingLesson) {
            conflictMessages.push(
              "Lesson time conflicts with student's another lesson",
            );
            console.log('[REVIEW] Student conflict found:', {
              lessonId: lesson.id,
              studentId,
              conflictingLessonId: conflictingLesson.id,
            });
            break;
          }
        }
      }
      const hasBlockingConflict = conflictMessages.length > 0;
      const isHolidayConflict = !!holiday;

      // IMPORTANT: Extract time using UTC methods since lesson dates are stored as UTC but represent local time
      // This matches how we created them with parseLocalDateTime
      // The date is stored as UTC but represents local time, so we extract UTC components
      const hours = String(lessonDate.getUTCHours()).padStart(2, '0');
      const minutes = String(lessonDate.getUTCMinutes()).padStart(2, '0');
      const seconds = String(lessonDate.getUTCSeconds()).padStart(2, '0');
      const startTime = `${hours}:${minutes}:${seconds}`;

      // IMPORTANT: Format date to prevent timezone conversion issues
      // Since lesson dates are stored as UTC but represent local time (created with parseLocalDateTime),
      // we extract UTC components which represent the local time we want to display
      // Return date as YYYY-MM-DD format (date only) to avoid timezone issues
      // The frontend will use startTime separately for the time display
      const year = lessonDate.getUTCFullYear();
      const month = String(lessonDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(lessonDate.getUTCDate()).padStart(2, '0');
      // Return date as YYYY-MM-DD format (date only) - frontend will combine with startTime
      // This avoids timezone conversion issues when frontend does new Date()
      const dateStr = `${year}-${month}-${day}`;

      console.log('[REVIEW] Date formatting:', {
        lessonId: lesson.id,
        storedUTC: lessonDate.toISOString(),
        extractedUTC: { year, month, day, hours, minutes, seconds },
        dateStr,
        startTime,
      });

      console.log('[REVIEW] Lesson processed:', {
        lessonId: lesson.id,
        dateStr,
        startTime,
        hasBlockingConflict,
        isHolidayConflict,
        conflictMessages,
      });

      reviewLessons.push({
        id: lesson.id,
        date: dateStr, // UTC date-time string representing local time
        duration: lesson.duration,
        startTime,
        conflict: conflictMessages[0],
        isHolidayConflict,
        isConflict: hasBlockingConflict && !isHolidayConflict,
        isUnscheduled: false, // Draft lessons are scheduled (status=2)
      });
    }

    // Step 7: Get unscheduled lessons from old lessons (matching legacy lines 602-610)
    let unscheduledLessons: any[] = [];
    if (oldLessonIds.length > 0) {
      unscheduledLessons =
        (await this.lessonRepository
          .createQueryBuilder('lesson')
          .select([
            'lesson.id',
            'lesson.type',
            'lesson.date',
            'lesson.duration',
          ])
          .where('lesson.id IN (:...ids)', { ids: oldLessonIds })
          .andWhere('lesson.status = :status', {
            status: LessonStatusEnum.UNSCHEDULED,
          })
          .orderBy('lesson.date', 'ASC')
          .getMany()) ?? [];
    }

    // Step 8: Get rescheduled lessons from old lessons (matching legacy lines 612-621)
    let rescheduledLessons: any[] = [];
    if (oldLessonIds.length > 0) {
      rescheduledLessons =
        (await this.lessonRepository
          .createQueryBuilder('lesson')
          .select([
            'lesson.id',
            'lesson.type',
            'lesson.date',
            'lesson.duration',
          ])
          .where('lesson.id IN (:...ids)', { ids: oldLessonIds })
          .andWhere('lesson.status = :status', {
            status: LessonStatusEnum.RESCHEDULED,
          })
          .orderBy('lesson.date', 'ASC')
          .getMany()) ?? [];
    }

    // Step 9: Calculate summary
    const holidayConflicted = reviewLessons.filter(
      (l) => l.isHolidayConflict,
    ).length;
    const conflicted = reviewLessons.filter(
      (l) => l.isConflict && !l.isHolidayConflict,
    ).length;
    const unscheduled = unscheduledLessons.length;
    const scheduled = reviewLessons.length - (holidayConflicted + conflicted);

    // Format changesFrom date as "MMM DD, YYYY" (e.g., "Feb 01, 2026")
    // Use dayjs to format date
    const dayjs = require('dayjs');
    const changesFromFormatted = dayjs(changesFromDate).format('MMM D, YYYY');

    console.log('[REVIEW] Final response:', {
      lessonsCount: reviewLessons.length,
      oldTeacherName,
      newTeacherName,
      changesFromFormatted,
      summary: {
        holidayConflicted,
        conflicted,
        unscheduled,
        scheduled,
        total: reviewLessons.length,
      },
    });

    return {
      lessons: reviewLessons,
      details: {
        oldTeacherName,
        newTeacherName,
        studentNames:
          studentNames.length > 0 ? studentNames.join(', ') : undefined,
        changesFrom: changesFromFormatted, // Format as "MMM DD, YYYY" (e.g., "Feb 01, 2026")
        isBulkTeacherChange: true,
      },
      summary: {
        holidayConflicted,
        conflicted,
        unscheduled,
        scheduled,
        total: reviewLessons.length,
      },
    };
  }
}
