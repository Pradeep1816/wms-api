/**
 * Read-only database access for permanent schedule change previews, validation,
 * and review. Query construction is kept out of PSC application services.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CourseSchedule } from '../../../course/entities/course-schedule.entity';
import { Invoice } from '../../../invoice/entities/invoice.entity';
import { Lesson } from '../../../lesson/entities/lesson.entity';
import { LessonStatusEnum } from '../../../lesson/enums/lesson-status';
import { User } from '../../../user/entities/user.entity';
import { Enrolment } from '../../entities/enrolment.entity';
import { PERMANENT_SCHEDULE_REGULAR_LESSON_TYPE } from '../../permanent-schedule-change/domain/permanent-schedule-eligibility.policy';

/** Counts used to decide whether a course month can be permanently changed. */
export interface PermanentScheduleMonthConstraintCounts {
  lessonsToChange: number;
  invoicedLessons: number;
}

/** Provides enrolment, schedule, teacher, and month-constraint PSC queries. */
@Injectable()
export class PermanentScheduleChangeQueryRepository {
  /** Inject the TypeORM repositories used by PSC read operations. */
  constructor(
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  /** Find an active enrolment with only the relations required by its caller. */
  findEnrolment(
    enrolmentId: number,
    relations: string[],
  ): Promise<Enrolment | null> {
    return this.enrolmentRepository.findOne({
      where: { id: enrolmentId, isDeleted: false },
      relations,
    });
  }

  /** Find an active enrolment-course pair for the PSC review endpoint. */
  findEnrolmentForReview(
    enrolmentId: number,
    courseId: number,
  ): Promise<Enrolment | null> {
    return this.enrolmentRepository.findOne({
      where: { id: enrolmentId, courseId, isDeleted: false },
      relations: ['course'],
    });
  }

  /** Return the course schedule currently marked as the most recent. */
  findRecentSchedule(courseId: number): Promise<CourseSchedule | null> {
    return this.courseScheduleRepository.findOne({
      where: { courseId, isRecent: true },
    });
  }

  /** List teachers qualified for the program at the requested location. */
  async findQualifiedTeachers(
    locationId: number,
    programId: number,
  ): Promise<{ id: number; name: string }[]> {
    const teachers = await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoin('user.userLocation', 'userLocation')
      .innerJoin(
        'rbac_auth_assignment',
        'raa',
        'raa.user_id = CAST(user.id AS CHAR)',
      )
      .innerJoin(
        'qualification',
        'q',
        'q.teacher_id = user.id AND q.program_id = :programId AND q.isDeleted = 0',
        { programId },
      )
      .where('user.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('raa.item_name = :role', { role: 'teacher' })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .orderBy('profile.firstname', 'ASC')
      .addOrderBy('profile.lastname', 'ASC')
      .getMany();

    return teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.profile
        ? `${teacher.profile.firstname || ''} ${
            teacher.profile.lastname || ''
          }`.trim() || 'Unknown'
        : 'Unknown',
    }));
  }

  /** Count changeable and invoiced lessons for the selected course month. */
  async getMonthConstraintCounts(
    courseId: number,
    dateToChangeSchedule: Date,
    manager?: EntityManager,
  ): Promise<PermanentScheduleMonthConstraintCounts> {
    const lessonRepository = manager
      ? manager.getRepository(Lesson)
      : this.lessonRepository;
    const monthStart = dateToChangeSchedule.toISOString().split('T')[0];

    const lessonsToChange = await lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.type = :lessonType', {
        lessonType: PERMANENT_SCHEDULE_REGULAR_LESSON_TYPE,
      })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status = :status', {
        status: LessonStatusEnum.SCHEDULED,
      })
      .andWhere('DATE(lesson.date) >= :dateToChangeSchedule', {
        dateToChangeSchedule: monthStart,
      })
      .getCount();

    if (lessonsToChange === 0) {
      return { lessonsToChange, invoicedLessons: 0 };
    }

    const lastDayOfMonth = new Date(
      Date.UTC(
        dateToChangeSchedule.getUTCFullYear(),
        dateToChangeSchedule.getUTCMonth() + 1,
        0,
      ),
    )
      .toISOString()
      .split('T')[0];
    const invoicedLessons = await lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.invoiceItemLessons', 'iil')
      .innerJoin('iil.invoiceLineItem', 'ili')
      .innerJoin('ili.invoice', 'inv')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.type = :lessonType', {
        lessonType: PERMANENT_SCHEDULE_REGULAR_LESSON_TYPE,
      })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status = :status', {
        status: LessonStatusEnum.SCHEDULED,
      })
      .andWhere('DATE(lesson.date) BETWEEN :startDate AND :endDate', {
        startDate: monthStart,
        endDate: lastDayOfMonth,
      })
      .andWhere('ili.isDeleted = :iliIsDeleted', { iliIsDeleted: false })
      .andWhere('inv.isDeleted = :invIsDeleted', { invIsDeleted: false })
      .andWhere('inv.type = :invType', { invType: Invoice.TYPE_INVOICE })
      .getCount();

    return { lessonsToChange, invoicedLessons };
  }
}
