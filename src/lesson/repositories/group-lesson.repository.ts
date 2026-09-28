import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GroupLesson } from '../entities/group-lesson.entity';
import { Lesson } from '../entities/lesson.entity';
import { Location } from '../../location/entities/location.entity';
import { User } from '../../user/entities/user.entity';
import { ProgramTypeEnum } from '../../program/enums/program-type';
import { LessonStatusEnum } from '../enums/lesson-status';

@Injectable()
export class GroupLessonRepository {
  constructor(
    @InjectRepository(GroupLesson)
    private readonly groupLessonRepository: Repository<GroupLesson>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Find location by slug
   */
  async findLocationBySlug(locationSlug: string): Promise<Location | null> {
    return this.locationRepository.findOne({ 
      where: { slug: locationSlug } 
    });
  }

  /**
   * Find customer by ID and location ID
   */
  async findCustomerByIdAndLocation(customerId: number, locationId: number): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.userLocation', 'userLocation')
      .where('user.id = :customerId', { customerId })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('user.isDeleted = :isDeleted', { isDeleted: 0 })
      .getOne();
  }

  /**
   * Get group lessons by customer ID with pagination
   */
  async getGroupLessonsByCustomerId(
    customerId: number,
    locationId: number,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ groupLessons: any[]; total: number }> {
    const offset = (page - 1) * limit;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const [groupLessons, total] = await this.groupLessonRepository
      .createQueryBuilder('groupLesson')
      .leftJoinAndSelect('groupLesson.lesson', 'lesson')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('groupLesson.enrolment', 'enrolment')
      .leftJoinAndSelect('enrolment.student', 'student')
      .where('course.locationId = :locationId', { locationId })
      .andWhere('lesson.isConfirmed = true')
        .andWhere('lesson.status <> :status', { status: LessonStatusEnum.CANCELED })
        .andWhere('lesson.isDeleted = false')
        .andWhere('DATE(lesson.date) >= :today', { today })
        .andWhere('enrolment.isDeleted = false')
        .andWhere('enrolment.isConfirmed = true')
        .andWhere('student.customerId = :customerId', { customerId })
        .andWhere('groupLesson.isDeleted = false')
        .orderBy('lesson.date', 'ASC')
      .addOrderBy('groupLesson.dueDate', 'ASC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();
    // Get total count
    return { groupLessons, total };
  }

  /**
   * Get group lessons paid by a specific payment ID
   * Reusable query for payment view
   * Matches legacy behavior: filters by both lesson's lessonPayments AND enrolment's lessonPayments
   * to ensure customer-specific results
   */
  async getGroupLessonsByPaymentId(
    paymentId: number,
    locationId: number,
    customerId?: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ groupLessons: any[]; total: number }> {
    const offset = (page - 1) * limit;
    
    const baseQuery = () => {
      let query = this.lessonRepository
        .createQueryBuilder('lesson')
        .innerJoin('group_lesson', 'gl', 'gl.lessonId = lesson.id AND gl.isDeleted = 0')
        .innerJoin('enrolment', 'e', 'e.id = gl.enrolmentId')
        // Legacy edits by group_lesson.id and the allocation for the same
        // lesson/enrolment pair. Both keys are required for group students.
        .innerJoin(
          'lesson_payment',
          'lp',
          'lp.lessonId = lesson.id AND lp.enrolmentId = e.id AND lp.paymentId = :paymentId AND lp.isDeleted = 0',
          { paymentId },
        )
        .innerJoin('student', 's', 's.id = e.studentId')
        .innerJoin('lesson.course', 'course')
        .innerJoin('course.program', 'program')
        .leftJoin('invoice_item_enrolment', 'iie', 'iie.enrolmentId = e.id')
        .leftJoin('invoice_line_item', 'ili', 'ili.id = iie.invoiceLineItemId AND ili.isDeleted = 0')
        .where('lesson.isDeleted = false')
        .andWhere('course.locationId = :locationId', { locationId });

      // Add customer filter if provided (from payment.userId)
      if (customerId) {
        query = query.andWhere('s.customerId = :customerId', { customerId });
      }

      return query;
    };

    const [groupLessons, totalResult] = await Promise.all([
      baseQuery()
        .distinct(true)
        .select('gl.id', 'id')
        .addSelect('lesson.date', 'date')
        .addSelect('lp.amount', 'paymentAmount')
        .addSelect('gl.total', 'amount')
        .addSelect('gl.balance', 'balance')
        .addSelect("CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, ''))", 'studentName')
        .addSelect('program.name', 'programName')
        .addSelect("CASE WHEN ili.id IS NOT NULL THEN 'Yes' ELSE 'No' END", 'invoiced')
        .orderBy('lesson.date', 'ASC')
        .skip(offset)
        .take(limit)
        .getRawMany(),
      baseQuery()
        .select('COUNT(DISTINCT gl.id)', 'count')
        .getRawOne(),
    ]);

    const total = totalResult?.count ? parseInt(totalResult.count, 10) : 0;

    return { groupLessons, total };
  }

  /**
   * Get group lessons by student ID with pagination
   */
  async getGroupLessonsByStudentId(
    studentId: number,
    locationId: number,
    page: number = 1,
    limit: number = 2,
  ): Promise<{ lessons: any[]; total: number }> {
    const now = new Date().toISOString();
    const offset = (page - 1) * limit;

    const baseQuery = () => this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('course', 'course', 'lesson.courseId = course.id')
      .innerJoin('program', 'program', 'course.programId = program.id')
      .innerJoin('enrolment', 'enrolment', 'enrolment.courseId = course.id')
      // Subquery to get the FIRST (oldest by id) group_lesson per lesson - matches legacy hasOne behavior
      .innerJoin(
        subQuery => subQuery
          .select('MIN(gl.id)', 'minId')
          .addSelect('gl.lessonId', 'lessonId')
          .from('group_lesson', 'gl')
          .where('gl.isDeleted = false')
          .groupBy('gl.lessonId'),
        'firstGroupLesson',
        'firstGroupLesson.lessonId = lesson.id'
      )
      // Then join to get the actual group_lesson record for dueDate
      .innerJoin('group_lesson', 'groupLessonFirst', 'groupLessonFirst.id = firstGroupLesson.minId')
      // Join STUDENT's specific group_lesson for price/owing
      .innerJoin('group_lesson', 'studentGroupLesson', 'studentGroupLesson.lessonId = lesson.id AND studentGroupLesson.enrolmentId = enrolment.id AND studentGroupLesson.isDeleted = false')
      .where('enrolment.studentId = :studentId', { studentId })
      .andWhere('enrolment.isConfirmed = true')
      .andWhere('enrolment.isDeleted = false')
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = false')
      .andWhere('lesson.status IN (:...statuses)', { 
        statuses: [LessonStatusEnum.RESCHEDULED, LessonStatusEnum.SCHEDULED] 
      })
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.isDeleted = false')
      .andWhere('program.type = :programType', { programType: ProgramTypeEnum.GROUP_PROGRAM })
      .andWhere('lesson.date >= :now', { now });

    const [lessons, total] = await Promise.all([
      baseQuery()
        .addSelect('program.name', 'programName')
        .addSelect('groupLessonFirst.dueDate', 'dueDate')
        .addSelect('studentGroupLesson.total', 'total')
        .addSelect('studentGroupLesson.balance', 'balance')
        .orderBy('lesson.date', 'ASC')
        .offset(offset)
        .limit(limit)
        .getRawMany(),
      baseQuery().getCount(),
    ]);

    return { lessons, total };
  }
}
