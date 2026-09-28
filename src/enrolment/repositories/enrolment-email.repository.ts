import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Enrolment } from '../entities/enrolment.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { CourseSchedule } from '../../course/entities/course-schedule.entity';
import { UserEmail } from '../../user/entities/user-email.entity';
import { EmailTemplate } from '../../notification/entities/email-template.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { EmailObjectTypeEnum } from '../../notification/enums/email-object-type.enum';
import { Program } from '../../program/entities/program.entity';

// Unified lesson interface for both private and group types
export interface LessonEmailDetail {
  id: number;
  date: Date;
  status: number;
  isPresent: boolean;
  isExploded: number;
  teacherName: string;
  duration?: string; // For private lessons
  dueDate?: Date; // For group lessons
  balance?: number; // For group lessons
}

export interface EnrolmentEmailData {
  enrolment: Enrolment | null;
  isGroupEnrolment: boolean;
  emails: string[];
  emailTemplate: EmailTemplate | null;
  lessons: LessonEmailDetail[];
  schedules: CourseSchedule[];
  totalLessons: number;
  remainingLessons: number;
}

@Injectable()
export class EnrolmentEmailRepository {
  constructor(
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(GroupLesson)
    private readonly groupLessonRepository: Repository<GroupLesson>,
    @InjectRepository(CourseSchedule)
    private readonly courseScheduleRepository: Repository<CourseSchedule>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
    @InjectRepository(EmailTemplate)
    private readonly emailTemplateRepository: Repository<EmailTemplate>,
  ) {}

  /**
   * Get enrolment details for email modal
   * Works for BOTH private and group enrolments
   * @param locationId - The location ID to filter by
   * @param enrolmentId - The enrolment ID
   */
  async getEnrolmentEmailDetail(
    locationId: number,
    enrolmentId: number,
  ): Promise<EnrolmentEmailData> {
    // Fetch enrollment with relations, filtered by location
    const enrolment = await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .leftJoinAndSelect('enrolment.student', 'student')
      .leftJoinAndSelect('student.user', 'customer')
      .leftJoinAndSelect('customer.profile', 'customerProfile')
      .leftJoinAndSelect('enrolment.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .where('enrolment.id = :enrolmentId', { enrolmentId })
      .andWhere('enrolment.isDeleted = false')
      .andWhere('course.locationId = :locationId', { locationId })
      .getOne();

    if (!enrolment) {
      return this.emptyResponse();
    }

    // Check if this is a group program enrolment
    const isGroupEnrolment =
      enrolment.course?.program?.type === Program.TYPE_GROUP_PROGRAM;

    const customerId = enrolment.student?.customerId;

    // Fetch customer emails (SAME for both types)
    const emails = await this.fetchCustomerEmails(customerId);

    // Fetch email template (DIFFERENT based on type)
    const templateType = isGroupEnrolment
      ? EmailObjectTypeEnum.CUSTOMER_STATEMENT
      : EmailObjectTypeEnum.COURSE;

    const emailTemplate = await this.emailTemplateRepository.findOne({
      where: { emailTypeId: templateType },
    });

    // Fetch course schedules (SAME for both types)
    const schedules = await this.courseScheduleRepository.find({
      where: { courseId: enrolment.courseId },
    });

    // Fetch lessons (DIFFERENT query based on type)
    const lessons = isGroupEnrolment
      ? await this.fetchGroupLessons(enrolment.courseId, enrolmentId)
      : await this.fetchPrivateLessons(enrolment.courseId);

    // Count lessons
    const { totalLessons, remainingLessons } = await this.countLessons(
      enrolment.courseId,
      isGroupEnrolment,
    );

    return {
      enrolment,
      isGroupEnrolment,
      emails,
      emailTemplate,
      lessons,
      schedules,
      totalLessons,
      remainingLessons,
    };
  }

  /**
   * Fetch lessons for PRIVATE enrolment
   * All confirmed lessons (not filtered by date)
   */
  private async fetchPrivateLessons(
    courseId: number,
  ): Promise<LessonEmailDetail[]> {
    const lessons = await this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('lesson.isConfirmed = true')
      .orderBy('lesson.date', 'ASC')
      .getMany();

    return lessons.map((lesson) => ({
      id: lesson.id,
      date: lesson.date,
      status: lesson.status,
      isPresent: lesson.isPresent,
      isExploded: lesson.isExploded,
      teacherName: this.getTeacherName(lesson.teacher),
      duration: lesson.duration,
    }));
  }

  /**
   * Fetch lessons for GROUP enrolment
   * Joins group_lesson table, filters by enrolmentId, only future lessons
   */
  private async fetchGroupLessons(
    courseId: number,
    enrolmentId: number,
  ): Promise<LessonEmailDetail[]> {
    const groupLessons = await this.groupLessonRepository
      .createQueryBuilder('groupLesson')
      .leftJoinAndSelect('groupLesson.lesson', 'lesson')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .where('groupLesson.enrolmentId = :enrolmentId', { enrolmentId })
      .andWhere('groupLesson.isDeleted = false')
      .andWhere('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.date >= :now', { now: new Date() })
      .orderBy('groupLesson.dueDate', 'ASC')
      .addOrderBy('lesson.date', 'ASC')
      .getMany();

    return groupLessons.map((gl) => ({
      id: gl.lesson.id,
      date: gl.lesson.date,
      status: gl.lesson.status,
      isPresent: gl.lesson.isPresent,
      isExploded: gl.lesson.isExploded,
      teacherName: this.getTeacherName(gl.lesson.teacher),
      dueDate: gl.dueDate,
      balance: Number(gl.balance),
    }));
  }

  /**
   * Count total and remaining lessons
   */
  private async countLessons(
    courseId: number,
    isGroup: boolean,
  ): Promise<{ totalLessons: number; remainingLessons: number }> {
    const baseQuery = this.lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId })
      .andWhere('lesson.isDeleted = false')
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      });

    let totalQuery = baseQuery.clone();
    if (isGroup) {
      totalQuery = totalQuery.andWhere('lesson.date >= :now', {
        now: new Date(),
      });
    }
    const totalLessons = await totalQuery.getCount();

    const remainingLessons = await baseQuery
      .clone()
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.date > :now', { now: new Date() })
      .getCount();

    return { totalLessons, remainingLessons };
  }

  /**
   * Fetch all email addresses for a customer
   */
  private async fetchCustomerEmails(customerId: number): Promise<string[]> {
    if (!customerId) return [];

    const userEmails = await this.userEmailRepository
      .createQueryBuilder('userEmail')
      .innerJoin('userEmail.userContact', 'userContact')
      .where('userContact.userId = :customerId', { customerId })
      .andWhere('userEmail.isDeleted = false')
      .andWhere('userContact.isDeleted = false')
      .orderBy('userEmail.email', 'ASC')
      .getMany();

    return userEmails.map((e) => e.email);
  }

  /**
   * Get teacher full name from user entity
   */
  private getTeacherName(teacher: any): string {
    if (!teacher) return '';
    if (teacher.profile) {
      const firstName = teacher.profile.firstName || teacher.profile.firstname || '';
      const lastName = teacher.profile.lastName || teacher.profile.lastname || '';
      return `${firstName} ${lastName}`.trim();
    }
    return teacher.username || '';
  }

  /**
   * Return empty response when enrolment not found
   */
  private emptyResponse(): EnrolmentEmailData {
    return {
      enrolment: null,
      isGroupEnrolment: false,
      emails: [],
      emailTemplate: null,
      lessons: [],
      schedules: [],
      totalLessons: 0,
      remainingLessons: 0,
    };
  }
}
