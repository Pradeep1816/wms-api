import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { LessonHierarchy } from '../entities/lesson-hierarchy.entity';
import { EmailTemplate } from '../../notification/entities/email-template.entity';
import { UserEmail } from '../../user/entities/user-email.entity';

@Injectable()
export class LessonEmailStatementRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(LessonHierarchy)
    private readonly lessonHierarchyRepository: Repository<LessonHierarchy>,
    @InjectRepository(EmailTemplate)
    private readonly emailTemplateRepository: Repository<EmailTemplate>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
  ) {}

  /**
   * Get lesson with all required relations for email statement
   * Extends LessonRepository.findLessonById with customer profile
   */
  async getLessonWithRelations(lessonId: number, locationId: number): Promise<Lesson | null> {
    // Use base method but add customer profile join
    return this.lessonRepository
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.course', 'course')
      .leftJoinAndSelect('course.program', 'program')
      .leftJoinAndSelect('course.enrolments', 'enrolments')
      .leftJoinAndSelect('enrolments.student', 'student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('user.profile', 'userProfile')
      .leftJoinAndSelect('lesson.privateLesson', 'privateLesson')
      .leftJoinAndSelect('lesson.teacher', 'teacher')
      .leftJoinAndSelect('teacher.profile', 'teacherProfile')
      .leftJoinAndSelect('lesson.bulkRescheduleLesson', 'bulkRescheduleLesson')
      .where('lesson.id = :lessonId', { lessonId })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .getOne();
  }

  /**
   * Get the original lesson via lesson_hierarchy where childLessonId = lessonId
   * PHP equivalent: $model->getReschedule() -> hasOne(LessonHierarchy, ['childLessonId' => 'id'])
   */
  async getOriginalLessonFromHierarchy(lessonId: number): Promise<Lesson | null> {
    const hierarchy = await this.lessonHierarchyRepository
      .createQueryBuilder('lh')
      .leftJoinAndSelect('lh.lesson', 'originalLesson')
      .leftJoinAndSelect('originalLesson.teacher', 'originalTeacher')
      .leftJoinAndSelect('originalTeacher.profile', 'originalTeacherProfile')
      .where('lh.childLessonId = :lessonId', { lessonId })
      .getOne();

    return hierarchy?.lesson ?? null;
  }

  /**
   * Get customer email addresses
   */
  async getCustomerEmails(customerId: number): Promise<string[]> {
    const emails = await this.userEmailRepository
      .createQueryBuilder('userEmail')
      .innerJoin('userEmail.userContact', 'userContact')
      .where('userContact.userId = :customerId', { customerId })
      .andWhere('userEmail.isDeleted = false')
      .select('userEmail.email')
      .orderBy('userEmail.email', 'ASC')
      .getMany();

    return emails.map(e => e.email);
  }

  /**
   * Get email template by type
   * emailTypeId = 2 for LESSON
   * Simplified to use findOne instead of query builder
   */
  async getEmailTemplate(emailTypeId: number = 2): Promise<EmailTemplate | null> {
    return this.emailTemplateRepository.findOne({
      where: { emailTypeId },
    });
  }
}
