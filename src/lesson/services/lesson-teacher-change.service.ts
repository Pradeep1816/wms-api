import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Program } from '../../program/entities/program.entity';
import { Lesson } from '../entities/lesson.entity';
import { LessonDiscount } from '../entities/lesson-discount.entity';
import { LessonTeacherChangeRepository } from '../repositories/lesson-teacher-change.repository';
import { RoundingUtils } from '../../utils/rounding.utils';

@Injectable()
export class LessonTeacherChangeService {
  /**
   * Injects the repository layer that performs all teacher-change database operations.
   */
  constructor(
    private readonly repository: LessonTeacherChangeRepository,
  ) {}

  /**
   * Formats a date as a UTC YYYY-MM-DD key for stable lesson comparisons.
   */
  private formatDateKey(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  /**
   * Parses the request's changesFrom date into both Date and string forms used throughout the confirmation flow.
   */
  private parseChangesFrom(changesFrom: string): { year: number; month: number; day: number; date: Date; dateKey: string } {
    const [year, month, day] = changesFrom.split('-').map(Number);
    const date = new Date(year, month - 1, day, 0, 0, 0, 0);
    return {
      year,
      month,
      day,
      date,
      dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    };
  }

  /**
   * Filters out draft lessons that fall before the teacher-change window or before the course start date.
   */
  private filterNewLessonsForCourseStart(
    lessons: Lesson[],
    changesFromDateKey: string,
    courseStartDateKey: string | null,
  ): Lesson[] {
    return lessons.filter((lesson) => {
      const lessonDateKey = this.formatDateKey(new Date(lesson.date));

      if (lessonDateKey < changesFromDateKey) {
        return false;
      }

      if (courseStartDateKey && lessonDateKey < courseStartDateKey) {
        return false;
      }

      return true;
    });
  }

  /**
   * Recalculates totals, balances, and date fields for a private lesson after teacher change.
   */
  private calculatePrivateLessonFinancials(
    lesson: Lesson,
    discounts: LessonDiscount[],
    paidAmount: number,
  ): {
    total: number;
    balance: number;
    expiryDate: Date;
    dueDate: Date;
  } {
    const pricingLesson = Object.assign(new Lesson(), {
      programRate: lesson.programRate,
      duration: lesson.duration || '00:30:00',
      tax: lesson.tax,
      discounts: discounts.map((discount) => Object.assign(new LessonDiscount(), discount)),
    });
    const total = pricingLesson.getNetPrice();
    const balance = Math.max(0, RoundingUtils.roundDecimal(total - paidAmount, 2));

    const dayjs = require('dayjs');
    const utc = require('dayjs/plugin/utc');
    dayjs.extend(utc);

    const lessonDate = new Date(lesson.date);

    return {
      total,
      balance,
      expiryDate: dayjs.utc(lessonDate).add(90, 'day').toDate(),
      dueDate: dayjs.utc(lessonDate).startOf('day').toDate(),
    };
  }

  /**
   * Confirms teacher change for a batch of enrolments inside a single transaction.
   */
  async confirmTeacherChangeForEnrolments(
    enrolmentIds: number[],
    teacherId: number,
    changesFrom: string,
    locationId: number,
    userId?: number,
  ): Promise<void> {
    if (enrolmentIds.length === 0) {
      return;
    }

    await this.repository.runInTransaction(async (manager) => {
      for (const enrolmentId of enrolmentIds) {
        await this.confirmEnrolmentTeacherChange(
          enrolmentId,
          teacherId,
          changesFrom,
          locationId,
          userId,
          manager,
        );
      }
    });
  }

  /**
   * Confirms a single enrolment's teacher change by pairing old lessons with new draft lessons and updating related records.
   */
  async confirmEnrolmentTeacherChange(
    enrolmentId: number,
    teacherId: number,
    changesFrom: string,
    locationId: number,
    userId?: number,
    manager?: EntityManager,
  ): Promise<void> {
    const changes = this.parseChangesFrom(changesFrom);

    const enrolment = await this.repository.findEnrolmentWithCourse(enrolmentId, manager);
    if (!enrolment || !enrolment.courseId) {
      throw new NotFoundException(`Enrolment with ID ${enrolmentId} not found or has no course`);
    }

    const oldLessons = await this.repository.findConfirmedLessonsForEnrolment(
      enrolmentId,
      changes.dateKey,
      manager,
    );
    const newLessonsRaw = await this.repository.findDraftLessonsForEnrolment(
      enrolmentId,
      teacherId,
      changes.dateKey,
      manager,
    );

    const courseStartDateKey = enrolment.course?.startDate
      ? this.formatDateKey(new Date(enrolment.course.startDate))
      : null;
    const newLessons = this.filterNewLessonsForCourseStart(
      newLessonsRaw,
      changes.dateKey,
      courseStartDateKey,
    );

    if (oldLessons.length !== newLessons.length) {
      throw new BadRequestException(
        `Mismatch between old lessons (${oldLessons.length}) and new lessons (${newLessons.length}) for enrolment ${enrolmentId}. This may be due to lessons created before the course start date.`,
      );
    }

    const courseId = enrolment.courseId;

    for (let i = 0; i < newLessons.length; i++) {
      const newLesson = newLessons[i];
      const oldLesson = oldLessons[i];

      await this.repository.cancelLesson(oldLesson.id, manager);

      const paidAmount = await this.repository.getLessonPaymentsTotal(oldLesson.id, manager);
      if (paidAmount > 0) {
        await this.repository.moveLessonPayments(oldLesson.id, newLesson.id, manager);
      }

      const existingNewLessonDiscounts = await this.repository.findLessonDiscounts(newLesson.id, manager);
      if (existingNewLessonDiscounts.length === 0 && (oldLesson.discounts?.length || 0) > 0) {
        await this.repository.copyLessonDiscounts(oldLesson.id, newLesson.id, manager);
      }

      await this.repository.createRescheduleHierarchy(oldLesson.id, newLesson.id, manager);

      const updatedLesson = await this.repository.findLessonWithCourseProgram(newLesson.id, manager);
      if (!updatedLesson) {
        throw new NotFoundException(`Lesson with ID ${newLesson.id} not found after updating discounts`);
      }

      const isPrivateProgram = updatedLesson.course?.program?.type === Program.TYPE_PRIVATE_PROGRAM;
      if (isPrivateProgram) {
        const lessonDiscounts = await this.repository.findLessonDiscounts(updatedLesson.id, manager);
        const financials = this.calculatePrivateLessonFinancials(updatedLesson, lessonDiscounts, paidAmount);
        await this.repository.upsertPrivateLesson(
          updatedLesson.id,
          financials.expiryDate,
          financials.total,
          financials.balance,
          financials.dueDate,
          manager,
        );
      }

      await this.repository.updatePaymentCycleLessons(oldLesson.id, updatedLesson.id, manager);

      if (updatedLesson.course?.programId) {
        const programRate = updatedLesson.course.program?.rate || 0;
        const qualification = await this.repository.findQualificationByTeacherAndProgram(
          teacherId,
          updatedLesson.course.programId,
          manager,
        );
        const calculatedTeacherRate = qualification?.rate || programRate / 2;
        await this.repository.updateLessonTeacherRate(
          updatedLesson.id,
          calculatedTeacherRate,
          manager,
        );
      }

      await this.repository.saveBulkRescheduleIfMissing(newLesson.id, userId, manager);
      await this.repository.updateCourseTeacherIfChanged(courseId, teacherId, manager);
      await this.repository.confirmLesson(newLesson.id, manager);
      if (isPrivateProgram) {
        await this.repository.ensurePrivateLessonEmailStatuses(newLesson.id, manager);
      }
    }

    if (newLessons.length > 0) {
      const lastLesson = newLessons[newLessons.length - 1];
      const course = await this.repository.findCourseById(courseId, manager);
      if (course?.endDate) {
        const startDate = new Date(changes.date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(course.endDate);
        endDate.setHours(23, 59, 59, 999);
        await this.repository.updateCourseScheduleForReschedule(lastLesson, startDate, endDate, manager);
      }
    }

    // locationId is accepted to keep the legacy request shape and future logging parity.
    void locationId;
  }
}
