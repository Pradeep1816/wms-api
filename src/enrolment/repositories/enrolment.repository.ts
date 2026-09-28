import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Enrolment } from '../entities/enrolment.entity';
import { Location } from '../../location/entities/location.entity';
import { User } from '../../user/entities/user.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { UserProfile } from '../../user/entities/user-profile.entity';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { CourseType } from '../../course/enums/course-type';
import { Course } from '../../course/entities/course.entity';
import { EnrolmentSearchDto } from '../dto/enrolment-list-request.dto';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';

@Injectable()
export class EnrolmentRepository {
  // Sort mapping for enrolments list
  private static readonly SORT_MAPPING: Record<string, string> = {
    program: 'program.name',
    student: 'student.firstName',
    teacher: 'courseTeacherProfile.firstname',
    startDate: 'course.startDate',
    endDate: 'course.endDate',
  };

  constructor(
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
  ) {}

  async findLocationBySlug(slug: string): Promise<Location | null> {
    return this.locationRepository.findOne({
      where: { slug },
    });
  }

  async findCustomerByIdAndLocation(
    customerId: number,
    locationId: number,
  ): Promise<User | null> {
    return this.userRepository.findOne({
      where: {
        id: customerId,
        userLocation: {
          locationId: locationId,
        },
        isDeleted: false,
      },
      relations: ['userLocation'],
    });
  }

  async getEnrolmentData(
    customerId: number,
    locationId: number,
    page: number = 1,
    limit: number = 5,
  ): Promise<{ enrolments: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const currentDate = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'

    const [enrolments, count] = await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoinAndSelect('enrolment.student', 'student')
      .innerJoinAndSelect('enrolment.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.courseSchedule', 'courseSchedule', 'courseSchedule.isRecent = true')
      .innerJoinAndSelect('course.lessons', 'lessons')
      .leftJoinAndSelect('lessons.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'profile')
      .where('student.customerId = :customerId', { customerId })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('course.type = :type', { type: CourseType.REGULAR })
      .andWhere('course.isDeleted = false')
      .andWhere('course.isConfirmed = true')
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('lessons.id IS NOT NULL')
      .andWhere('DATE(enrolment.endDateTime) >= :currentDate', { currentDate })
      .groupBy('enrolment.id')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return { enrolments, total: count };
  }

  /**
   * Get enrolments list
   */
  async getEnrolmentsList(
    locationId: number,
    searchDto: EnrolmentSearchDto,
  ): Promise<{ enrolments: Enrolment[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      sort = 'program',
      order = 'ASC',
      showActive = false,
      showInActive = false,
      showAll = false,
      lessonsRemaining,
    } = searchDto;

    const skip = (page - 1) * limit;

    try {
      const query = this.buildEnrolmentBaseQuery(locationId);

      this.applyCourseDateFilter(query, showActive, showInActive, showAll);
      this.applySearchFilters(query, searchDto);
      this.applyAutoRenewalFilter(query, searchDto.isAutoRenewal);
      this.applyLessonDateFilter(query, showInActive, showAll, lessonsRemaining);
      
      query.groupBy('enrolment.id');
      
      this.applyLessonsRemainingHaving(query, lessonsRemaining);
      this.applySorting(query, sort, order);
      this.applyPagination(query, skip, limit);

      const [enrolments, total] = await query.getManyAndCount();

      return { enrolments, total };
    } catch (error) {
      console.error('Error in getEnrolmentsList repository:', error);
      throw new Error(`Failed to fetch enrolments for location ${locationId}: ${error.message}`);
    }
  }

  private buildEnrolmentBaseQuery(locationId: number): SelectQueryBuilder<Enrolment> {
    return this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoinAndSelect('enrolment.student', 'student')
      .innerJoinAndSelect('enrolment.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.teacher', 'courseTeacher')
      .leftJoinAndSelect('courseTeacher.profile', 'courseTeacherProfile')
      .leftJoin('course.lessons', 'lesson')
      .where('course.locationId = :locationId', { locationId })
      .andWhere('enrolment.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('enrolment.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('course.isConfirmed = :courseIsConfirmed', { courseIsConfirmed: true });
  }

  /**
   * Apply course date filter
   * showAll=true / showActive=true → No filter
   * showInactive=true → Only ended courses (endDate < today)
   * Default → Active only (startDate <= lastDay AND endDate >= today)
   */
  private applyCourseDateFilter(
    query: SelectQueryBuilder<Enrolment>,
    showActive: boolean,
    showInactive: boolean,
    showAll: boolean,
  ): void {
    const currentDate = new Date().toISOString().split('T')[0];
    const currentMonthLastDate = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0,
    ).toISOString().split('T')[0];

    if (showAll || showActive) {
      return;
    }

    if (showInactive) {
      query.andWhere('DATE(course.endDate) < :currentDate', { currentDate });
      return;
    }

    query.andWhere('DATE(course.startDate) <= :currentMonthLastDate', { currentMonthLastDate });
    query.andWhere('DATE(course.endDate) >= :currentDate', { currentDate });
  }

  private applySearchFilters(query: SelectQueryBuilder<Enrolment>, searchDto: EnrolmentSearchDto): void {
    const filters = {
      program: searchDto.program?.trim(),
      student: searchDto.student?.trim(),
      teacher: searchDto.teacher?.trim(),
      startFrom: searchDto.startFrom?.trim(),
      startTo: searchDto.startTo?.trim(),
      endFrom: searchDto.endFrom?.trim(),
      endTo: searchDto.endTo?.trim(),
    };

    if (filters.program) {
      query.andWhere('program.name LIKE :program', { program: `%${filters.program}%` });
    }

    if (filters.student) {
      query.andWhere(
        "(student.firstName LIKE :student OR student.lastName LIKE :student OR CONCAT(student.firstName, ' ', student.lastName) LIKE :student)",
        { student: `%${filters.student}%` },
      );
    }

    if (filters.teacher) {
      query.andWhere(
        "(courseTeacherProfile.firstname LIKE :teacher OR courseTeacherProfile.lastname LIKE :teacher OR CONCAT(courseTeacherProfile.firstname, ' ', courseTeacherProfile.lastname) LIKE :teacher)",
        { teacher: `%${filters.teacher}%` },
      );
    }

    if (filters.startFrom && filters.startTo) {
      query.andWhere('DATE(course.startDate) BETWEEN :startFrom AND :startTo', {
        startFrom: filters.startFrom,
        startTo: filters.startTo,
      });
    }

    if (filters.endFrom && filters.endTo) {
      query.andWhere('DATE(course.endDate) BETWEEN :endFrom AND :endTo', {
        endFrom: filters.endFrom,
        endTo: filters.endTo,
      });
    }
  }

  private applyAutoRenewalFilter(
    query: SelectQueryBuilder<Enrolment>,
    isAutoRenewal?: 'enabled' | 'disabled' | 'all',
  ): void {
    if (isAutoRenewal === 'enabled') {
      query.andWhere('enrolment.isAutoRenew = :autoRenewEnabled', { autoRenewEnabled: 1 });
    } else if (isAutoRenewal === 'disabled') {
      query.andWhere('enrolment.isAutoRenew = :autoRenewDisabled', { autoRenewDisabled: 0 });
    }
  }

  /**
   * Apply lesson date filter
   * showAll=true / showInactive=true → No filter
   * showActive=true / Default → Applied
   */
  private applyLessonDateFilter(
    query: SelectQueryBuilder<Enrolment>,
    showInactive: boolean,
    showAll: boolean,
    lessonsRemaining?: string,
  ): void {
    if (showAll) {
      if (lessonsRemaining === '0' || lessonsRemaining === '<=0') {
        query.andWhere('DATE(enrolment.endDateTime) < CURRENT_DATE');
      }
      return;
    }

    const lessonCntPattern = /^[<>]=?\d+$/;
    const hasLessonCountOperator = lessonsRemaining && lessonCntPattern.test(lessonsRemaining);
    const hasPositiveLessonCount = lessonsRemaining && parseInt(lessonsRemaining, 10) > 0;

    if (!showInactive || hasPositiveLessonCount || hasLessonCountOperator) {
      query.andWhere('DATE(lesson.date) >= CURRENT_DATE');
      query.andWhere('DATE(lesson.date) <= DATE(enrolment.endDateTime)');
    }

    if (lessonsRemaining === '0' || lessonsRemaining === '<=0') {
      query.andWhere('DATE(enrolment.endDateTime) < CURRENT_DATE');
    }
  }

  private applyLessonsRemainingHaving(
    query: SelectQueryBuilder<Enrolment>,
    lessonsRemaining?: string,
  ): void {
    if (!lessonsRemaining?.trim()) {
      return;
    }

    const value = lessonsRemaining.trim();
    
    if (value === '0' || value === '<=0') {
      return;
    }

    const operatorPattern = /^([<>]=?)(\d+)$/;
    const operatorMatch = value.match(operatorPattern);

    if (operatorMatch) {
      const operator = operatorMatch[1];
      const count = parseInt(operatorMatch[2], 10);
      query.having(`COUNT(lesson.id) ${operator} :lessonCount`, { lessonCount: count });
    } else {
      const exactCount = parseInt(value, 10);
      if (!isNaN(exactCount) && exactCount > 0) {
        query.having('COUNT(lesson.id) = :lessonCount', { lessonCount: exactCount });
      }
    }
  }

  private applySorting(query: SelectQueryBuilder<Enrolment>, sort: string, order: string): void {
    const sortField =
      EnrolmentRepository.SORT_MAPPING[sort as keyof typeof EnrolmentRepository.SORT_MAPPING] ||
      'program.name';
    query.orderBy(sortField, order.toUpperCase() as 'ASC' | 'DESC');
  }

  private applyPagination(query: SelectQueryBuilder<Enrolment>, skip: number, limit: number): void {
    query.skip(skip).take(limit);
  }

  /**
   * Get future lessons count for multiple enrollments
   */
  async getFutureLessonsCountBatch(enrolmentIds: number[]): Promise<Map<number, number>> {
    if (enrolmentIds.length === 0) {
      return new Map();
    }

    const currentDate = new Date().toISOString().split('T')[0];
    
    const validStatuses = [
      LessonStatusEnum.RESCHEDULED,
      LessonStatusEnum.SCHEDULED,
      LessonStatusEnum.UNSCHEDULED,
    ];
    
    const results = await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .select('enrolment.id', 'enrolmentId')
      .addSelect('COUNT(lesson.id)', 'count')
      .innerJoin('enrolment.course', 'course')
      .innerJoin('course.lessons', 'lesson')
      .where('enrolment.id IN (:...enrolmentIds)', { enrolmentIds })
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status IN (:...validStatuses)', { validStatuses })
      .andWhere('DATE(lesson.date) >= :currentDate', { currentDate })
      .andWhere('DATE(lesson.date) <= DATE(enrolment.endDateTime)')
      .groupBy('enrolment.id')
      .getRawMany();

    const countMap = new Map<number, number>();
    enrolmentIds.forEach(id => countMap.set(id, 0));
    results.forEach(row => {
      countMap.set(parseInt(row.enrolmentId, 10), parseInt(row.count || '0', 10));
    });
    return countMap;
  }
  async getTeachersSchedules(courseIds: number[]): Promise<Map<number, CourseSchedule[]>> {
    if (courseIds.length === 0) {
      return new Map();
    }

    const schedules = await this.courseScheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .where('schedule.courseId IN (:...courseIds)', { courseIds })
      .getMany();

    const scheduleMap = new Map<number, CourseSchedule[]>();
    
    courseIds.forEach(id => scheduleMap.set(id, []));
    
    schedules.forEach(schedule => {
      const existing = scheduleMap.get(schedule.courseId) || [];
      existing.push(schedule);
      scheduleMap.set(schedule.courseId, existing);
    });

    return scheduleMap;
  }
}
