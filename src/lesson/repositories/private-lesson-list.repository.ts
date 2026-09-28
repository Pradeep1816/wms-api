import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, SelectQueryBuilder } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { PrivateLessonListRequestDto } from '../dto/private-lesson-list-request.dto';
import { LessonStatusEnum, OwingStatusEnum } from '../enums/lesson-status';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import { getCurrentESTDate } from 'src/utils/date-utils';
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);
export interface PrivateLessonListResult {
  lessons: Lesson[];
  total: number;
  customerEmailByLessonId: Record<number, string | null>;
  customerEmailsByLessonId: Record<number, string | null>;
}

@Injectable()
export class PrivateLessonListRepository {
  // Sort mapping matching legacy LessonSearch.php dataProvider->setSort
  private static readonly SORT_MAPPING: Record<string, string> = {
    student: 'student.firstName',
    teacher: 'teacherProfile.firstname',
    program: 'program.name',
    date: 'lesson.date',
    dueDate: 'lesson.dueDate',
  };

  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  /**
   * Get private lessons with filters and pagination
   */
  async getPrivateLessons(
    locationId: number,
    searchDto: PrivateLessonListRequestDto,
  ): Promise<PrivateLessonListResult> {
    const {
      page = 1,
      limit = 20,
      sort,
      order = 'ASC',
      showAll = false,
    } = searchDto;

    const skip = (page - 1) * limit;

    try {
      const query = this.buildBaseQuery(locationId);
      // Apply filters
      this.applyActiveStatusFilter(query, showAll);
      this.applySearchFilters(query, searchDto);
      this.applyLessonStatusFilter(query, searchDto.lessonStatus);
      this.applyOwingStatusFilter(query, searchDto.owingStatus);
      this.applyOnlineFilter(query, searchDto.isOnline);
      this.applyDateRangeFilter(query, searchDto.fromDate, searchDto.toDate);

      // Apply sorting
      this.applySorting(query, sort, order);

      // Get total count before pagination
      const total = await query.getCount();

      // Apply pagination
      query.skip(skip).take(limit);

      // Select one email per lesson via correlated subquery to avoid row multiplication.
      query.addSelect((subQuery) => {
        return subQuery
          .select('userEmail.email')
          .from('user_contact', 'userContact')
          .innerJoin(
            'user_email',
            'userEmail',
            'userEmail.userContactId = userContact.id AND userEmail.isDeleted = :emailNotDeleted',
            { emailNotDeleted: 0 },
          )
          .where('userContact.userId = student.customer_id')
          .andWhere('userContact.isDeleted = :contactNotDeleted', {
            contactNotDeleted: 0,
          })
          .orderBy('userContact.isPrimary', 'DESC')
          .addOrderBy('userEmail.id', 'ASC')
          .limit(1);
      }, 'customerEmail');
      query.addSelect((subQuery) => {
        return subQuery
          .select(
            "GROUP_CONCAT(userEmail.email ORDER BY userContact.isPrimary DESC, userEmail.id ASC SEPARATOR ', ')",
          )
          .from('user_contact', 'userContact')
          .innerJoin(
            'user_email',
            'userEmail',
            'userEmail.userContactId = userContact.id AND userEmail.isDeleted = :emailNotDeleted',
            { emailNotDeleted: 0 },
          )
          .where('userContact.userId = student.customer_id')
          .andWhere('userContact.isDeleted = :contactNotDeleted', {
            contactNotDeleted: 0,
          });
      }, 'customerEmails');

      // Execute query
      const { entities: lessons, raw } = await query.getRawAndEntities();
      const customerEmailByLessonId: Record<number, string | null> = {};
      const customerEmailsByLessonId: Record<number, string | null> = {};
      raw.forEach(
        (row: {
          lesson_id?: number;
          customerEmail?: string | null;
          customerEmails?: string | null;
        }) => {
          const lessonId = row.lesson_id;
          if (typeof lessonId === 'number') {
            customerEmailByLessonId[lessonId] = row.customerEmail ?? null;
            customerEmailsByLessonId[lessonId] = row.customerEmails ?? null;
          }
        },
      );

      return { lessons, total, customerEmailByLessonId, customerEmailsByLessonId };
    } catch (error) {
      console.error('Error in getPrivateLessons repository:', error);
      throw new Error(
        `Failed to fetch private lessons for location ${locationId}: ${error.message}`,
      );
    }
  }

  private buildBaseQuery(locationId: number): SelectQueryBuilder<Lesson> {
    return this.lessonRepository
      .createQueryBuilder('lesson')
      // Legacy private lesson listing always starts with dueDate ascending.
      .orderBy('lesson.dueDate', 'ASC')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .leftJoinAndSelect('lesson.invoiceItemLessons', 'invoiceItemLessons')
      .leftJoinAndSelect('invoiceItemLessons.invoiceLineItem', 'invoiceLineItem')
      .leftJoinAndSelect('invoiceLineItem.invoice', 'invoice')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.enrolments', 'enrolment')
      .leftJoinAndSelect('enrolment.student', 'student')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .leftJoinAndSelect('lesson.discounts', 'discounts')
      .where('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status != :canceledStatus', {
        canceledStatus: LessonStatusEnum.CANCELED,
      })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = :courseDeleted', { courseDeleted: false })
      .andWhere('program.type = :programType', {
        programType: ProgramTypeEnum.PRIVATE_PROGRAM,
      });
  }

  /**
   * Apply active status filter based on showAll flag
   * - When !showAll: ALSO apply date > today to ALL results
   * - When showAll: No date filter applied
   */
  private applyActiveStatusFilter(
    query: SelectQueryBuilder<Lesson>,
    showAll: boolean,
  ): void {
    const todayStr = dayjs().tz('America/New_York').format('YYYY-MM-DD');

    query.andWhere(
      new Brackets((qb) => {
        qb.where('lesson.status IN (:...activeStatuses)', {
          activeStatuses: [
            LessonStatusEnum.SCHEDULED,
            LessonStatusEnum.RESCHEDULED,
          ],
        }).orWhere(
          new Brackets((innerQb) => {
            innerQb
              .where('lesson.status = :unscheduledStatus', {
                unscheduledStatus: LessonStatusEnum.UNSCHEDULED,
              })
              .andWhere('privateLesson.expiryDate > :today', {
                today: todayStr,
              });
          }),
        );
      }),
    );

    // When showAll is false, also filter to show only future lessons (date > today)
    if (!showAll) {
      query.andWhere('lesson.date > :todayDate', { todayDate: todayStr });
    }
  }

  /**
   * Apply search filters (student, program, teacher)
   */
  private applySearchFilters(
    query: SelectQueryBuilder<Lesson>,
    searchDto: PrivateLessonListRequestDto,
  ): void {
    if (searchDto.student?.trim()) {
      query.andWhere(
        "CONCAT(student.firstName, ' ', student.lastName) LIKE :studentName",
        { studentName: `%${searchDto.student.trim()}%` },
      );
    }

    if (searchDto.program?.trim()) {
      query.andWhere('program.name LIKE :programName', {
        programName: `%${searchDto.program.trim()}%`,
      });
    }

    const teacherSearch = searchDto.teacher?.trim();
    if (teacherSearch) {
      query.andWhere(
        new Brackets((qb) => {
          qb.where('teacherProfile.firstname LIKE :teacherName', {
            teacherName: `%${teacherSearch}%`,
          }).orWhere('teacherProfile.lastname LIKE :teacherName', {
            teacherName: `%${teacherSearch}%`,
          });
        }),
      );
    }
  }

  /**
   * Apply lesson status filter
   */
  private applyLessonStatusFilter(
    query: SelectQueryBuilder<Lesson>,
    lessonStatus: string | undefined,
  ): void {
    if (!lessonStatus) return;

    const now = getCurrentESTDate(); // get current date in EST timezone

    const statusFilters: Record<string | number, () => void> = {
      No: () =>
        query.andWhere('lesson.isPresent = :isPresent', { isPresent: false }),

      [LessonStatusEnum.COMPLETED]: () => {
        query
          .andWhere('lesson.status IN (:...statuses)', {
            statuses: [
              LessonStatusEnum.SCHEDULED,
              LessonStatusEnum.RESCHEDULED,
            ],
          })
          .andWhere('lesson.date <= :now', { now })
          .andWhere('lesson.isPresent = :isPresent', { isPresent: true });
      },

      [LessonStatusEnum.SCHEDULED]: () => {
        query
          .andWhere('lesson.status = :status', {
            status: LessonStatusEnum.SCHEDULED,
          })
          .andWhere('lesson.date > :now', { now })
          .andWhere('lesson.isPresent = :isPresent', { isPresent: true });
      },

      [LessonStatusEnum.RESCHEDULED]: () => {
        query
          .andWhere('lesson.status = :status', {
            status: LessonStatusEnum.RESCHEDULED,
          })
          .andWhere('lesson.date >= :now', { now });
      },

      [LessonStatusEnum.UNSCHEDULED]: () => {
        query.andWhere('lesson.status = :status', {
          status: LessonStatusEnum.UNSCHEDULED,
        });
      },
    };

    const handler =
      statusFilters[lessonStatus] ?? statusFilters[parseInt(lessonStatus, 10)];
    handler?.();
  }

  /**
   * Apply owing status filter
   */
  private applyOwingStatusFilter(
    query: SelectQueryBuilder<Lesson>,
    owingStatus: number | undefined,
  ): void {
    if (owingStatus === undefined || owingStatus === null) {
      return;
    }

    if (owingStatus === OwingStatusEnum.OWING) {
      query.andWhere(
        'CASE WHEN invoice.id IS NOT NULL THEN COALESCE(invoice.balance, 0) ELSE COALESCE(privateLesson.balance, 0) END > :owingThreshold',
        {
          owingThreshold: 0.09,
        },
      );
    } else if (owingStatus === OwingStatusEnum.PAID) {
      query.andWhere(
        'CASE WHEN invoice.id IS NOT NULL THEN COALESCE(invoice.balance, 0) ELSE COALESCE(privateLesson.balance, 0) END >= :minBalance',
        { minBalance: 0 },
      );
      query.andWhere(
        'CASE WHEN invoice.id IS NOT NULL THEN COALESCE(invoice.balance, 0) ELSE COALESCE(privateLesson.balance, 0) END <= :maxBalance',
        {
        maxBalance: 0.09,
        },
      );
    }
  }

  /**
   * Apply online/in-class filter
   */

  private applyOnlineFilter(
    query: SelectQueryBuilder<Lesson>,
    isOnline: boolean | undefined,
  ): void {
    if (isOnline === undefined || isOnline === null) {
      return;
    }

    if (isOnline === false) {
      query.andWhere('lesson.isOnline = :isOnline', { isOnline: false });
    } else if (isOnline === true) {
      query.andWhere('lesson.isOnline = :isOnline', { isOnline: true });
    }
  }

  /**
   * Apply date range filter
   * Only applies when the client sends a complete range.
   */
  private applyDateRangeFilter(
    query: SelectQueryBuilder<Lesson>,
    fromDate: string | undefined,
    toDate: string | undefined,
  ): void {
    if (!fromDate || !toDate) {
      return;
    }

    query.andWhere('DATE(lesson.date) BETWEEN :fromDate AND :toDate', {
      fromDate,
      toDate,
    });
  }

  /**
   * Apply sorting
   */
  private applySorting(
    query: SelectQueryBuilder<Lesson>,
    sort: string | undefined,
    order: string,
  ): void {
    const sortOrder: 'ASC' | 'DESC' =
      order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const effectiveSort = sort === 'dueDate' ? undefined : sort;

    if (!effectiveSort) {
      query.addOrderBy('lesson.date', 'ASC');
      return;
    }

    const sortField = PrivateLessonListRepository.SORT_MAPPING[effectiveSort];
    if (sortField) {
      query.addOrderBy(sortField, sortOrder);
      return;
    }

    query.addOrderBy('lesson.date', 'ASC');
  }
}
