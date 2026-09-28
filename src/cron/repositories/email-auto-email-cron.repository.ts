import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Course } from '../../course/entities/course.entity';
import { CustomerEmailNotification } from '../../customer/entities/customer-email-notification.entity';
import { Enrolment } from '../../enrolment/entities/enrolment.entity';
import { GroupLesson } from '../../lesson/entities/group-lesson.entity';
import { GroupLessonEmailStatus } from '../../lesson/entities/group-lesson-email-status.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { PrivateLesson } from '../../lesson/entities/private-lesson.entity';
import { PrivateLessonEmailStatus } from '../../lesson/entities/private-lesson-email-status.entity';
import { LessonStatusEnum } from '../../lesson/enums/lesson-status';
import { Location } from '../../location/entities/location.entity';
import { EmailTemplate } from '../../notification/entities/email-template.entity';
import { Program } from '../../program/entities/program.entity';
import { Student } from '../../student/entities/student.entity';
import { UserContact } from '../../user/entities/user-contact.entity';
import { UserEmail } from '../../user/entities/user-email.entity';
import { publicProgramName } from '../../pricing/utils/program-public-name';

export interface AutoEmailLocationRow {
  id: number;
  email: string | null;
  name: string;
}

export interface AutoEmailTemplateRow {
  id: number;
  subject: string;
  header: string | null;
  footer: string | null;
}

export interface AutoEmailLessonRow {
  lessonId: number;
  courseId: number;
  lessonDate: Date;
  dueDate: Date | null;
  courseName: string | null;
  teacherName: string | null;
  studentName: string | null;
  privateTotal: number | null;
  privateBalance: number | null;
}

export interface AutoEmailGroupStudentRow {
  studentId: number;
  studentName: string | null;
}

export interface AutoEmailGroupOverdueRow {
  lessonId: number;
  enrolmentId: number;
  studentId: number;
  lessonDate: Date;
  courseName: string | null;
  teacherName: string | null;
  studentName: string | null;
  total: number | null;
  balance: number | null;
}

@Injectable()
export class EmailAutoEmailCronRepository {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(CustomerEmailNotification)
    private readonly customerEmailNotificationRepository: Repository<CustomerEmailNotification>,
    @InjectRepository(EmailTemplate)
    private readonly emailTemplateRepository: Repository<EmailTemplate>,
    @InjectRepository(Enrolment)
    private readonly enrolmentRepository: Repository<Enrolment>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(GroupLesson)
    private readonly groupLessonRepository: Repository<GroupLesson>,
    @InjectRepository(PrivateLessonEmailStatus)
    private readonly privateLessonEmailStatusRepository: Repository<PrivateLessonEmailStatus>,
    @InjectRepository(GroupLessonEmailStatus)
    private readonly groupLessonEmailStatusRepository: Repository<GroupLessonEmailStatus>,
  ) {}

  async getActiveLocations(): Promise<AutoEmailLocationRow[]> {
    return this.locationRepository.find({
      where: { isDeleted: false },
      order: { id: 'ASC' },
      select: ['id', 'email', 'name'],
    });
  }

  async getCheckedCustomerIds(): Promise<number[]> {
    const rows = await this.customerEmailNotificationRepository
      .createQueryBuilder('notification')
      .select('notification.userId', 'userId')
      .where('notification.isChecked = :isChecked', { isChecked: 1 })
      .groupBy('notification.userId')
      .orderBy('notification.userId', 'ASC')
      .getRawMany<{ userId: string }>();

    return rows.map((row) => Number(row.userId));
  }

  async getCheckedNotificationTypesForCustomer(customerId: number): Promise<number[]> {
    const rows = await this.customerEmailNotificationRepository.find({
      where: {
        userId: customerId,
        isChecked: 1,
      },
      order: {
        emailNotificationTypeId: 'ASC',
      },
      select: ['emailNotificationTypeId'],
    });

    return rows.map((row) => Number(row.emailNotificationTypeId));
  }

  async getEmailTemplateByType(emailTypeId: number): Promise<AutoEmailTemplateRow | null> {
    const template = await this.emailTemplateRepository.findOne({
      where: { emailTypeId },
      select: ['id', 'subject', 'header', 'footer'],
    });

    if (!template) {
      return null;
    }

    return {
      id: template.id,
      subject: template.subject,
      header: template.header ?? null,
      footer: template.footer ?? null,
    };
  }

  async getRecipientEmails(customerId: number): Promise<string[]> {
    const rows = await this.userEmailRepository
      .createQueryBuilder('userEmail')
      .innerJoin(UserContact, 'userContact', 'userContact.id = userEmail.userContactId')
      .select('userEmail.email', 'email')
      .where('userEmail.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('userContact.userId = :customerId', { customerId })
      .orderBy('userEmail.email', 'ASC')
      .getRawMany<{ email: string }>();

    return Array.from(
      new Set(
        rows
          .map((row) => row.email?.trim())
          .filter((email): email is string => Boolean(email)),
      ),
    );
  }

  async getPrivateFirstLessonIds(
    customerId: number,
    locationId: number,
    currentDate: Date,
  ): Promise<number[]> {
    const courseIds = await this.getCandidateCourseIdsByProgramType(
      customerId,
      locationId,
      currentDate,
      Program.TYPE_PRIVATE_PROGRAM,
    );

    return this.getFirstFutureLessonIdsForCourses(courseIds, currentDate);
  }

  async getGroupFirstLessonIds(
    customerId: number,
    locationId: number,
    currentDate: Date,
  ): Promise<number[]> {
    const courseIds = await this.getCandidateCourseIdsByProgramType(
      customerId,
      locationId,
      currentDate,
      Program.TYPE_GROUP_PROGRAM,
    );

    return this.getFirstFutureLessonIdsForCourses(courseIds, currentDate);
  }

  async getPrivateLessonsForNotification(
    customerId: number,
    locationId: number,
    currentDate: Date,
    lessonDateTime: Date,
    notificationType: number,
    firstLessonIds: number[],
  ): Promise<AutoEmailLessonRow[]> {
    const qb = this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.program', 'program')
      .innerJoin('course.enrolments', 'enrolment')
      .innerJoin('enrolment.student', 'student')
      .leftJoin('lesson.teacher', 'teacher')
      .leftJoin('teacher.profile', 'teacherProfile')
      .leftJoin(PrivateLesson, 'privateLesson', 'privateLesson.lessonId = lesson.id')
      .innerJoin(
        'private_lesson_email_status',
        'privateEmailStatus',
        'privateEmailStatus.lessonId = lesson.id AND privateEmailStatus.status = :pendingStatus AND privateEmailStatus.notificationType = :notificationType',
        {
          pendingStatus: 0,
          notificationType,
        },
      )
      .where('lesson.date BETWEEN :currentDate AND :lessonDateTime', {
        currentDate,
        lessonDateTime,
      })
      .andWhere('lesson.status != :canceledStatus', { canceledStatus: LessonStatusEnum.CANCELED })
      .andWhere('lesson.status IN (:...upcomingStatuses)', {
        upcomingStatuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('lesson.date >= :currentDate2', { currentDate2: currentDate })
      .andWhere('lesson.isDeleted = :lessonIsDeleted', { lessonIsDeleted: false })
      .andWhere('lesson.isConfirmed = :lessonIsConfirmed', { lessonIsConfirmed: true })
      .andWhere('lesson.type = :lessonType', { lessonType: Course.TYPE_REGULAR })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('course.isConfirmed = :courseIsConfirmed', { courseIsConfirmed: true })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('program.type = :programType', { programType: Program.TYPE_PRIVATE_PROGRAM })
      .andWhere('student.customerId = :customerId', { customerId })
      .andWhere('enrolment.isDeleted = :enrolmentIsDeleted', { enrolmentIsDeleted: false })
      .andWhere('enrolment.isConfirmed = :enrolmentIsConfirmed', { enrolmentIsConfirmed: true })
      .select([
        'lesson.id AS lessonId',
        'lesson.courseId AS courseId',
        'lesson.date AS lessonDate',
        'lesson.dueDate AS dueDate',
        'program.name AS courseName',
        'program.publicName AS coursePublicName',
        "TRIM(CONCAT(COALESCE(teacherProfile.firstname, ''), ' ', COALESCE(teacherProfile.lastname, ''))) AS teacherName",
        "TRIM(CONCAT(COALESCE(student.firstName, ''), ' ', COALESCE(student.lastName, ''))) AS studentName",
        'privateLesson.total AS privateTotal',
        'privateLesson.balance AS privateBalance',
      ])
      .distinct(true)
      .orderBy('lesson.id', 'ASC');

    if (notificationType === 1) {
      qb.andWhere('lesson.status = :rescheduledStatus', {
        rescheduledStatus: LessonStatusEnum.RESCHEDULED,
      });
    } else if (notificationType === 2) {
      if (firstLessonIds.length === 0) {
        return [];
      }
      qb.andWhere('lesson.status = :scheduledStatus', { scheduledStatus: LessonStatusEnum.SCHEDULED });
      qb.andWhere('lesson.id IN (:...firstLessonIds)', { firstLessonIds });
    } else if (notificationType === 3) {
      qb.andWhere('lesson.status IN (:...overdueStatuses)', {
        overdueStatuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      });
      qb.andWhere('privateLesson.balance > :positiveBalance', { positiveBalance: 0 });
      qb.orderBy('lesson.dueDate', 'ASC');
    } else if (notificationType === 4) {
      qb.andWhere('lesson.status = :scheduledStatus2', { scheduledStatus2: LessonStatusEnum.SCHEDULED });
      if (firstLessonIds.length > 0) {
        qb.andWhere('lesson.id NOT IN (:...firstLessonIds)', { firstLessonIds });
      }
    } else {
      return [];
    }

    const rows = await qb.getRawMany<{
      lessonId: string;
      courseId: string;
      lessonDate: Date;
      dueDate: Date | null;
      courseName: string | null;
      coursePublicName: string | null;
      teacherName: string | null;
      studentName: string | null;
      privateTotal: string | null;
      privateBalance: string | null;
    }>();

    return rows.map((row) => ({
      lessonId: Number(row.lessonId),
      courseId: Number(row.courseId),
      lessonDate: new Date(row.lessonDate),
      dueDate: row.dueDate ? new Date(row.dueDate) : null,
      courseName: publicProgramName(
        { name: row.courseName, publicName: row.coursePublicName },
        locationId,
      ),
      teacherName: this.normalizeLabel(row.teacherName),
      studentName: this.normalizeLabel(row.studentName),
      privateTotal: row.privateTotal === null ? null : Number(row.privateTotal),
      privateBalance: row.privateBalance === null ? null : Number(row.privateBalance),
    }));
  }

  async getGroupLessonsForNotification(
    customerId: number,
    locationId: number,
    currentDate: Date,
    lessonDateTime: Date,
    notificationType: number,
    firstLessonIds: number[],
  ): Promise<AutoEmailLessonRow[]> {
    const studentIdsByCourseId = await this.getEligibleGroupStudentIdsByCourse(
      customerId,
      locationId,
      currentDate,
    );

    const courseIds = Array.from(studentIdsByCourseId.keys());
    if (courseIds.length === 0) {
      return [];
    }

    const qb = this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.program', 'program')
      .leftJoin('lesson.teacher', 'teacher')
      .leftJoin('teacher.profile', 'teacherProfile')
      .innerJoin(
        'group_lesson_email_status',
        'groupEmailStatus',
        'groupEmailStatus.lessonId = lesson.id AND groupEmailStatus.status = :pendingStatus AND groupEmailStatus.notificationType = :notificationType',
        {
          pendingStatus: 0,
          notificationType,
        },
      )
      .where('lesson.date BETWEEN :currentDate AND :lessonDateTime', {
        currentDate,
        lessonDateTime,
      })
      .andWhere('lesson.status != :canceledStatus', { canceledStatus: LessonStatusEnum.CANCELED })
      .andWhere('lesson.status IN (:...upcomingStatuses)', {
        upcomingStatuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('lesson.date >= :currentDate2', { currentDate2: currentDate })
      .andWhere('lesson.isDeleted = :lessonIsDeleted', { lessonIsDeleted: false })
      .andWhere('lesson.isConfirmed = :lessonIsConfirmed', { lessonIsConfirmed: true })
      .andWhere('lesson.type = :lessonType', { lessonType: Course.TYPE_REGULAR })
      .andWhere('course.id IN (:...courseIds)', { courseIds })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('course.isConfirmed = :courseIsConfirmed', { courseIsConfirmed: true })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('program.type = :programType', { programType: Program.TYPE_GROUP_PROGRAM })
      .select([
        'lesson.id AS lessonId',
        'lesson.courseId AS courseId',
        'lesson.date AS lessonDate',
        'lesson.dueDate AS dueDate',
        'program.name AS courseName',
        'program.publicName AS coursePublicName',
        "TRIM(CONCAT(COALESCE(teacherProfile.firstname, ''), ' ', COALESCE(teacherProfile.lastname, ''))) AS teacherName",
      ])
      .distinct(true)
      .orderBy('lesson.id', 'ASC');

    if (notificationType === 1) {
      qb.andWhere('lesson.status = :rescheduledStatus', {
        rescheduledStatus: LessonStatusEnum.RESCHEDULED,
      });
    } else if (notificationType === 2) {
      if (firstLessonIds.length === 0) {
        return [];
      }
      qb.andWhere('lesson.status = :scheduledStatus', { scheduledStatus: LessonStatusEnum.SCHEDULED });
      qb.andWhere('lesson.id IN (:...firstLessonIds)', { firstLessonIds });
    } else if (notificationType === 4) {
      qb.andWhere('lesson.status = :scheduledStatus2', { scheduledStatus2: LessonStatusEnum.SCHEDULED });
      if (firstLessonIds.length > 0) {
        qb.andWhere('lesson.id NOT IN (:...firstLessonIds)', { firstLessonIds });
      }
    } else {
      return [];
    }

    const rows = await qb.getRawMany<{
      lessonId: string;
      courseId: string;
      lessonDate: Date;
      dueDate: Date | null;
      courseName: string | null;
      coursePublicName: string | null;
      teacherName: string | null;
    }>();

    return rows
      .filter((row) => {
        const studentIds = studentIdsByCourseId.get(Number(row.courseId)) ?? [];
        return studentIds.length > 0;
      })
      .map((row) => ({
        lessonId: Number(row.lessonId),
        courseId: Number(row.courseId),
        lessonDate: new Date(row.lessonDate),
        dueDate: row.dueDate ? new Date(row.dueDate) : null,
        courseName: publicProgramName(
          { name: row.courseName, publicName: row.coursePublicName },
          locationId,
        ),
        teacherName: this.normalizeLabel(row.teacherName),
        studentName: null,
        privateTotal: null,
        privateBalance: null,
      }));
  }

  async getUpcomingGroupLessonsBase(
    customerId: number,
    locationId: number,
    currentDate: Date,
    lessonDateTime: Date,
  ): Promise<AutoEmailLessonRow[]> {
    const studentIdsByCourseId = await this.getEligibleGroupStudentIdsByCourse(
      customerId,
      locationId,
      currentDate,
    );

    const courseIds = Array.from(studentIdsByCourseId.keys());
    if (courseIds.length === 0) {
      return [];
    }

    const rows = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.program', 'program')
      .leftJoin('lesson.teacher', 'teacher')
      .leftJoin('teacher.profile', 'teacherProfile')
      .select([
        'lesson.id AS lessonId',
        'lesson.courseId AS courseId',
        'lesson.date AS lessonDate',
        'lesson.dueDate AS dueDate',
        'program.name AS courseName',
        'program.publicName AS coursePublicName',
        "TRIM(CONCAT(COALESCE(teacherProfile.firstname, ''), ' ', COALESCE(teacherProfile.lastname, ''))) AS teacherName",
      ])
      .where('lesson.date BETWEEN :currentDate AND :lessonDateTime', {
        currentDate,
        lessonDateTime,
      })
      .andWhere('lesson.status != :canceledStatus', { canceledStatus: LessonStatusEnum.CANCELED })
      .andWhere('lesson.status IN (:...upcomingStatuses)', {
        upcomingStatuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('lesson.date >= :currentDate2', { currentDate2: currentDate })
      .andWhere('lesson.isDeleted = :lessonIsDeleted', { lessonIsDeleted: false })
      .andWhere('lesson.isConfirmed = :lessonIsConfirmed', { lessonIsConfirmed: true })
      .andWhere('lesson.type = :lessonType', { lessonType: Course.TYPE_REGULAR })
      .andWhere('course.id IN (:...courseIds)', { courseIds })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('course.isConfirmed = :courseIsConfirmed', { courseIsConfirmed: true })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('program.type = :programType', { programType: Program.TYPE_GROUP_PROGRAM })
      .distinct(true)
      .orderBy('lesson.id', 'ASC')
      .getRawMany<{
        lessonId: string;
        courseId: string;
        lessonDate: Date;
        dueDate: Date | null;
        courseName: string | null;
      coursePublicName: string | null;
        teacherName: string | null;
      }>();

    return rows.map((row) => ({
      lessonId: Number(row.lessonId),
      courseId: Number(row.courseId),
      lessonDate: new Date(row.lessonDate),
      dueDate: row.dueDate ? new Date(row.dueDate) : null,
      courseName: publicProgramName(
        { name: row.courseName, publicName: row.coursePublicName },
        locationId,
      ),
      teacherName: this.normalizeLabel(row.teacherName),
      studentName: null,
      privateTotal: null,
      privateBalance: null,
    }));
  }

  async getPendingGroupStudentsForLesson(
    customerId: number,
    courseId: number,
    lessonId: number,
    notificationType: number,
    currentDate: Date,
  ): Promise<AutoEmailGroupStudentRow[]> {
    const currentDateKey = currentDate.toISOString().slice(0, 10);

    const rows = await this.studentRepository
      .createQueryBuilder('student')
      .innerJoin('student.enrolments', 'enrolment')
      .innerJoin('enrolment.course', 'course')
      .innerJoin(
        GroupLessonEmailStatus,
        'groupEmailStatus',
        'groupEmailStatus.studentId = student.id AND groupEmailStatus.lessonId = :lessonId AND groupEmailStatus.notificationType = :notificationType AND groupEmailStatus.status = :pendingStatus',
        { lessonId, notificationType, pendingStatus: 0 },
      )
      .select([
        'student.id AS studentId',
        "TRIM(CONCAT(COALESCE(student.firstName, ''), ' ', COALESCE(student.lastName, ''))) AS studentName",
      ])
      .where('student.customerId = :customerId', { customerId })
      .andWhere('student.isDeleted = :studentIsDeleted', { studentIsDeleted: false })
      .andWhere('course.id = :courseId', { courseId })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('course.isConfirmed = :courseIsConfirmed', { courseIsConfirmed: true })
      .andWhere('enrolment.isDeleted = :enrolmentIsDeleted', { enrolmentIsDeleted: false })
      .andWhere('enrolment.isConfirmed = :enrolmentIsConfirmed', { enrolmentIsConfirmed: true })
      .andWhere('DATE(enrolment.endDateTime) >= :currentDateKey', { currentDateKey })
      .distinct(true)
      .orderBy('student.id', 'ASC')
      .getRawMany<{ studentId: string; studentName: string | null }>();

    return rows.map((row) => ({
      studentId: Number(row.studentId),
      studentName: this.normalizeLabel(row.studentName),
    }));
  }

  async getGroupOverdueRowsForLesson(
    lessonId: number,
    customerId: number,
  ): Promise<AutoEmailGroupOverdueRow[]> {
    const rows = await this.groupLessonRepository
      .createQueryBuilder('groupLesson')
      .innerJoin('groupLesson.lesson', 'lesson')
      .innerJoin('groupLesson.enrolment', 'enrolment')
      .innerJoin('enrolment.student', 'student')
      .innerJoin('lesson.course', 'course')
      .innerJoin('course.program', 'program')
      .leftJoin('lesson.teacher', 'teacher')
      .leftJoin('teacher.profile', 'teacherProfile')
      .innerJoin(
        GroupLessonEmailStatus,
        'groupEmailStatus',
        'groupEmailStatus.lessonId = lesson.id AND groupEmailStatus.studentId = enrolment.studentId AND groupEmailStatus.notificationType = :notificationType AND groupEmailStatus.status = :pendingStatus',
        {
          notificationType: 3,
          pendingStatus: 0,
        },
      )
      .select([
        'lesson.id AS lessonId',
        'enrolment.id AS enrolmentId',
        'student.id AS studentId',
        'lesson.date AS lessonDate',
        'program.name AS courseName',
        'program.publicName AS coursePublicName',
        "TRIM(CONCAT(COALESCE(teacherProfile.firstname, ''), ' ', COALESCE(teacherProfile.lastname, ''))) AS teacherName",
        "TRIM(CONCAT(COALESCE(student.firstName, ''), ' ', COALESCE(student.lastName, ''))) AS studentName",
        'groupLesson.total AS total',
        'groupLesson.balance AS balance',
        // Selected only so the program name can be gated by location; this
        // method is keyed on a lesson, not on a location like its siblings.
        'course.locationId AS locationId',
      ])
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('student.customerId = :customerId', { customerId })
      .andWhere('student.isDeleted = :studentIsDeleted', { studentIsDeleted: false })
      .andWhere('enrolment.isDeleted = :enrolmentIsDeleted', { enrolmentIsDeleted: false })
      .andWhere('enrolment.isConfirmed = :enrolmentIsConfirmed', { enrolmentIsConfirmed: true })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('course.isConfirmed = :courseIsConfirmed', { courseIsConfirmed: true })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('program.type = :programType', { programType: Program.TYPE_GROUP_PROGRAM })
      .andWhere('lesson.status IN (:...statuses)', {
        statuses: [LessonStatusEnum.SCHEDULED, LessonStatusEnum.RESCHEDULED],
      })
      .andWhere('groupLesson.balance > :positiveBalance', { positiveBalance: 0 })
      .orderBy('enrolment.id', 'ASC')
      .getRawMany<{
        lessonId: string;
        enrolmentId: string;
        studentId: string;
        lessonDate: Date;
        courseName: string | null;
        coursePublicName: string | null;
        locationId: number | string | null;
        teacherName: string | null;
        studentName: string | null;
        total: string | null;
        balance: string | null;
      }>();

    return rows.map((row) => ({
      lessonId: Number(row.lessonId),
      enrolmentId: Number(row.enrolmentId),
      studentId: Number(row.studentId),
      lessonDate: new Date(row.lessonDate),
      courseName: publicProgramName(
        { name: row.courseName, publicName: row.coursePublicName },
        row.locationId === null ? null : Number(row.locationId),
      ),
      teacherName: this.normalizeLabel(row.teacherName),
      studentName: this.normalizeLabel(row.studentName),
      total: row.total === null ? null : Number(row.total),
      balance: row.balance === null ? null : Number(row.balance),
    }));
  }

  async markPrivateStatusesSent(lessonIds: number[], notificationType: number): Promise<number> {
    if (lessonIds.length === 0) {
      return 0;
    }

    const result = await this.privateLessonEmailStatusRepository.update(
      {
        lessonId: In(lessonIds),
        notificationType,
        status: 0,
      },
      {
        status: 1,
      },
    );

    return result.affected ?? 0;
  }

  async markGroupStatusSent(
    lessonId: number,
    studentId: number,
    notificationType: number,
  ): Promise<number> {
    const result = await this.groupLessonEmailStatusRepository.update(
      {
        lessonId,
        studentId,
        notificationType,
        status: 0,
      },
      {
        status: 1,
      },
    );

    return result.affected ?? 0;
  }

  private async getCandidateCourseIdsByProgramType(
    customerId: number,
    locationId: number,
    currentDate: Date,
    programType: number,
  ): Promise<number[]> {
    const currentDateKey = currentDate.toISOString().slice(0, 10);

    const rows = await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoin('enrolment.student', 'student')
      .innerJoin('enrolment.course', 'course')
      .innerJoin('course.program', 'program')
      .innerJoin('course.lessons', 'lesson')
      .select('course.id', 'courseId')
      .where('student.customerId = :customerId', { customerId })
      .andWhere('enrolment.isDeleted = :enrolmentIsDeleted', { enrolmentIsDeleted: false })
      .andWhere('enrolment.isConfirmed = :enrolmentIsConfirmed', { enrolmentIsConfirmed: true })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('course.isConfirmed = :courseIsConfirmed', { courseIsConfirmed: true })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('program.type = :programType', { programType })
      .andWhere('lesson.id IS NOT NULL')
      .andWhere(
        `(
          DATE(course.startDate) = :currentDateKey
          OR DATE(course.endDate) = :currentDateKey
          OR (DATE(course.startDate) < :currentDateKey AND DATE(course.endDate) > :currentDateKey)
          OR DATE(course.startDate) > :currentDateKey
        )`,
        { currentDateKey },
      )
      .groupBy('course.id')
      .orderBy('course.id', 'ASC')
      .getRawMany<{ courseId: string }>();

    return rows.map((row) => Number(row.courseId));
  }

  private async getFirstFutureLessonIdsForCourses(
    courseIds: number[],
    currentDate: Date,
  ): Promise<number[]> {
    if (courseIds.length === 0) {
      return [];
    }

    const rows = await this.lessonRepository
      .createQueryBuilder('lesson')
      .select(['lesson.id AS lessonId', 'lesson.courseId AS courseId', 'lesson.date AS lessonDate'])
      .where('lesson.courseId IN (:...courseIds)', { courseIds })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('lesson.isConfirmed = :isConfirmed', { isConfirmed: true })
      .andWhere('lesson.status != :canceledStatus', { canceledStatus: LessonStatusEnum.CANCELED })
      .orderBy('lesson.courseId', 'ASC')
      .addOrderBy('lesson.date', 'ASC')
      .addOrderBy('lesson.id', 'ASC')
      .getRawMany<{ lessonId: string; courseId: string; lessonDate: Date }>();

    const firstIdsByCourse = new Map<number, number>();
    const firstDatesByCourse = new Map<number, Date>();

    for (const row of rows) {
      const courseId = Number(row.courseId);
      if (firstIdsByCourse.has(courseId)) {
        continue;
      }
      firstIdsByCourse.set(courseId, Number(row.lessonId));
      firstDatesByCourse.set(courseId, new Date(row.lessonDate));
    }

    return Array.from(firstIdsByCourse.entries())
      .filter(([courseId]) => {
        const firstDate = firstDatesByCourse.get(courseId);
        return Boolean(firstDate && firstDate > currentDate);
      })
      .map(([, lessonId]) => lessonId);
  }

  private async getEligibleGroupStudentIdsByCourse(
    customerId: number,
    locationId: number,
    currentDate: Date,
  ): Promise<Map<number, number[]>> {
    const currentDateKey = currentDate.toISOString().slice(0, 10);

    const rows = await this.enrolmentRepository
      .createQueryBuilder('enrolment')
      .innerJoin('enrolment.student', 'student')
      .innerJoin('enrolment.course', 'course')
      .innerJoin('course.program', 'program')
      .select(['course.id AS courseId', 'student.id AS studentId'])
      .where('student.customerId = :customerId', { customerId })
      .andWhere('student.isDeleted = :studentIsDeleted', { studentIsDeleted: false })
      .andWhere('enrolment.isDeleted = :enrolmentIsDeleted', { enrolmentIsDeleted: false })
      .andWhere('enrolment.isConfirmed = :enrolmentIsConfirmed', { enrolmentIsConfirmed: true })
      .andWhere('DATE(enrolment.endDateTime) >= :currentDateKey', { currentDateKey })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere('course.isDeleted = :courseIsDeleted', { courseIsDeleted: false })
      .andWhere('course.isConfirmed = :courseIsConfirmed', { courseIsConfirmed: true })
      .andWhere('course.type = :courseType', { courseType: Course.TYPE_REGULAR })
      .andWhere('program.type = :programType', { programType: Program.TYPE_GROUP_PROGRAM })
      .orderBy('course.id', 'ASC')
      .addOrderBy('student.id', 'ASC')
      .getRawMany<{ courseId: string; studentId: string }>();

    const map = new Map<number, number[]>();
    for (const row of rows) {
      const courseId = Number(row.courseId);
      const studentId = Number(row.studentId);
      const existing = map.get(courseId) ?? [];
      if (!existing.includes(studentId)) {
        existing.push(studentId);
      }
      map.set(courseId, existing);
    }
    return map;
  }

  private normalizeLabel(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

}
