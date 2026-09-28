import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { Repository } from 'typeorm';
import { Lesson } from '../../entities/lesson.entity';
import { PrivateLessonDeleteRepository } from '../../repositories/private-lesson-actions/private-lesson-delete.repository';
import { CustomerBalanceRecalculatorService } from '../../../shared/services/customer-balance-recalculator.service';
import { DeletePrivateLessonDto } from '../../dto/private-lesson-action-dto/delete-private-lesson.dto';
import { Program } from '../../../program/entities/program.entity';
import { User } from '../../../user/entities/user.entity';
import { LogObjectType } from '../../../log/enums/log-object-type.enum';
import { AuditLogWriterService } from '../../../log/services/audit-log-writer.service';
import { LogActivityType } from '../../../log/enums/log-activity.enum';
import { getDisplayName } from '../../../shared/helpers/display-name.helper';
import { getCurrentESTDate } from '../../../utils/date-utils';
import { RoyaltyPaymentCorrectionService } from '../../../payment/services/royalty-payment-correction.service';

export interface DeletePrivateLessonResult {
  status: boolean;
  url?: string;
  message?: string;
}

/**
 * Private lesson delete (soft delete).
 * Optimized: batch invoice check, batch credit/payments, one update per course/customer, bulk lesson soft-delete.
 */
@Injectable()
export class PrivateLessonDeleteService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly repo: PrivateLessonDeleteRepository,
    private readonly royaltyPaymentCorrectionService: RoyaltyPaymentCorrectionService,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
    private readonly auditLogWriterService?: AuditLogWriterService,
    @InjectRepository(User)
    private readonly userRepository?: Repository<User>,
  ) {}

  async deleteLessons(
    locationSlug: string,
    locationId: number,
    dto: DeletePrivateLessonDto,
    loggedUserId?: number,
  ): Promise<DeletePrivateLessonResult> {
    const lessonIds = dto.lessonIds ?? [];
    if (lessonIds.length === 0) {
      throw new BadRequestException('Choose any lessons to delete');
    }

    const result = await this.entityManager.transaction(async (manager: EntityManager) => {
      const lessons = await this.repo.findLessonsForDelete(
        locationId,
        lessonIds,
        manager,
      );

      const lessonIdsWithInvoices = await this.repo.findLessonIdsWithInvoices(
        lessons.map((l) => l.id),
        manager,
      );
      for (const lesson of lessons) {
        if (!this.isDeletable(lesson, lessonIdsWithInvoices.has(lesson.id))) {
          throw new BadRequestException("You can't delete this lesson.");
        }
      }

      const privateEntries: { lessonId: number; enrolmentId: number }[] = [];
      const uniqueCourseIds = new Set<number>();
      const uniqueCustomerIds = new Set<number>();
      const customerIdByEnrolmentId = new Map<number, number>();

      for (const lesson of lessons) {
        const enrolment = this.getActiveEnrolment(lesson);
        const enrolmentId = enrolment?.id;
        if (this.isPrivate(lesson) && enrolmentId) {
          privateEntries.push({ lessonId: lesson.id, enrolmentId });
          const course = (lesson as any).course;
          if (course?.id) uniqueCourseIds.add(course.id);
        }
        const customerId = (enrolment?.student as any)?.user?.id;
        if (customerId) {
          uniqueCustomerIds.add(customerId);
          if (enrolmentId) {
            customerIdByEnrolmentId.set(Number(enrolmentId), Number(customerId));
          }
        }
      }

      const creditAmounts = await this.repo.getLessonCreditAmountsBatch(
        privateEntries,
        manager,
      );
      let message = 'Lesson has been deleted successfully!';
      for (const [, total] of creditAmounts) {
        if (total > 0.01) {
          message =
            'Lesson has been deleted successfully! Lesson credits transfered to customer account';
          break;
        }
      }

      const creditAppliedPayments =
        await this.repo.getCreditAppliedLessonPaymentsBatch(
          privateEntries,
          manager,
        );
      if (creditAppliedPayments.length > 0) {
        const lessonPaymentIds = creditAppliedPayments.map((p) => p.id);

        await this.repo.softDeleteLessonPaymentsByIds(
          lessonPaymentIds,
          manager,
        );

        // Recalculate payment balances after detaching lesson credits,
        // so that customer credit (unused payment balance) matches legacy behavior.
        await this.repo.recalculatePaymentBalancesForLessonPayments(
          lessonPaymentIds,
          manager,
        );

        const effectiveDate = getCurrentESTDate();
        for (const lessonPayment of creditAppliedPayments) {
          await this.royaltyPaymentCorrectionService.restoreDeletedLessonCredit(
            manager,
            {
              paymentId: Number(lessonPayment.paymentId),
              lessonPaymentId: Number(lessonPayment.id),
              locationId,
              customerId: Number(
                customerIdByEnrolmentId.get(Number(lessonPayment.enrolmentId)) ??
                  [...uniqueCustomerIds][0],
              ),
              amount: Number(lessonPayment.amount),
              itemCategoryId: lessonPayment.royaltyCategoryId,
              rateApplied: lessonPayment.royaltyRateApplied,
              advertisementRateApplied: lessonPayment.advertisementRateApplied,
              effectiveDate,
              createdByUserId: loggedUserId,
            },
          );
        }
      }

      await this.repo.softDeleteLessonsByIds(
        lessons.map((l) => l.id),
        manager,
      );

      for (const courseId of uniqueCourseIds) {
        await this.repo.updateCourseDates(courseId, manager);
      }

      const url = `/admin/v2/${locationSlug}/private-lessons`;
      return {
        status: true,
        url,
        message,
        affectedCustomerIds: [...uniqueCustomerIds],
        deletedLessons: lessons,
      };
    });

    for (const customerId of result.affectedCustomerIds ?? []) {
      if (Number.isFinite(customerId) && customerId > 0) {
        await this.customerBalanceRecalculatorService.recalculateAndPersist(
          customerId,
          { locationSlug },
        );
      }
    }

    if (loggedUserId && Array.isArray(result.deletedLessons)) {
      await this.createDeleteLogs(
        result.deletedLessons,
        loggedUserId,
        locationSlug,
      );
    }

    return {
      status: result.status,
      url: result.url,
      message: result.message,
    };
  }

  private isDeletable(lesson: Lesson, hasInvoice: boolean): boolean {
    if (lesson.isDeleted) return false;
    if (hasInvoice) return false;
    return this.isPrivate(lesson);
  }

  private isPrivate(lesson: Lesson): boolean {
    const program = (lesson as any).course?.program;
    return program?.type === Program.TYPE_PRIVATE_PROGRAM;
  }

  /**
   * Get active enrolment (isDeleted=false, isConfirmed=1) for the lesson's course.
   * Falls back to first enrolment if none active (edge case).
   */
  private getActiveEnrolment(lesson: Lesson): any | undefined {
    const enrolments = (lesson as any).course?.enrolments ?? [];
    const active = enrolments.find(
      (e: any) => !e.isDeleted && (e.isConfirmed === 1 || e.isConfirmed === true),
    );
    return active ?? enrolments[0];
  }

  private async createDeleteLogs(
    lessons: Lesson[],
    loggedUserId: number,
    locationSlug: string,
  ): Promise<void> {
    try {
      if (!this.auditLogWriterService || !this.userRepository) {
        return;
      }

      const loggedUser = await this.userRepository.findOne({
        where: { id: loggedUserId },
        relations: ['profile'],
      });

      if (!loggedUser) {
        return;
      }

      for (const lesson of lessons) {
        try {
          await this.createDeleteLog(lesson, loggedUser, locationSlug);
        } catch (lessonError) {
          console.error('Error creating private lesson delete log:', lessonError);
        }
      }
    } catch (error) {
      console.error('Error creating private lesson delete logs:', error);
    }
  }

  private async createDeleteLog(
    lesson: Lesson,
    loggedUser: User,
    locationSlug: string,
  ): Promise<void> {
    const enrolment = this.getActiveEnrolment(lesson);
    const student = enrolment?.student;
    const customer = student?.user;

    if (!enrolment || !student || !customer || !lesson.course?.program) {
      return;
    }

    const loggedUserName = getDisplayName(loggedUser);
    const studentName = getDisplayName(student, 'Student');
    const customerName = getDisplayName(customer);
    const studentPath = `/v2/admin/${locationSlug}/students/${student.id}`;
    const customerPath = `/v2/admin/${locationSlug}/customers/${customer.id}`;
    const enrolmentPath = `/v2/admin/${locationSlug}/enrolments/${enrolment.id}`;
    const enrolmentIndex = 'enrolment';

    await this.auditLogWriterService?.writeAuditLog({
      objectType: LogObjectType.LESSON,
      activityType: LogActivityType.TYPE_DELETE,
      message: `${loggedUserName} deleted lesson for {{${studentName}}} ({{${customerName}}}) for this {{${enrolmentIndex}}}`,
      data: this.serializeLesson(lesson),
      locationId: lesson.course.locationId,
      createdUserId: loggedUser.id,
      mainLink: {
        index: studentName,
        path: studentPath,
      },
      mainHistory: {
        instanceId: lesson.id,
        instanceType: LogObjectType.LESSON,
      },
      extraHistories: [
        {
          instanceId: enrolment.id,
          instanceType: LogObjectType.ENROLMENT,
        },
        {
          instanceId: student.id,
          instanceType: LogObjectType.STUDENT,
        },
        {
          instanceId: customer.id,
          instanceType: LogObjectType.USER,
        },
      ],
      extraLinks: [
        {
          index: customerName,
          path: customerPath,
        },
        {
          index: enrolmentIndex,
          path: enrolmentPath,
        },
      ],
    });
  }

  private serializeLesson(lesson: Lesson): Record<string, unknown> {
    return {
      id: lesson.id,
      courseId: lesson.courseId,
      teacherId: lesson.teacherId,
      date: lesson.date,
      duration: lesson.duration,
      status: lesson.status,
      isPresent: lesson.isPresent,
      isDeleted: lesson.isDeleted,
      isConfirmed: lesson.isConfirmed,
      type: lesson.type,
      isExploded: lesson.isExploded,
      isOnline: lesson.isOnline,
      createdByUserId: lesson.createdByUserId,
      updatedByUserId: lesson.updatedByUserId,
      programRate: lesson.programRate,
      teacherRate: lesson.teacherRate,
      teacherRateOld: lesson.teacherRateOld,
      tax: lesson.tax,
      total: lesson.total,
      dueDate: lesson.dueDate,
      originalDate: lesson.originalDate,
    };
  }

}
