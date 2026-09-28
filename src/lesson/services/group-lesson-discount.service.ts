import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { ProgramTypeEnum } from 'src/program/enums/program-type';
import { GroupLesson } from '../entities/group-lesson.entity';
import { Lesson } from '../entities/lesson.entity';
import { GroupLessonDiscountRepository } from '../repositories/group-lesson-discount.repository';
import { LessonConfirmationService } from './lesson-confirmation.service';
import { getCurrentESTDate } from '../../utils/date-utils';
import { RoundingUtils } from '../../utils/rounding.utils';

@Injectable()
export class GroupLessonDiscountService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly repository: GroupLessonDiscountRepository,
    private readonly lessonConfirmationService: LessonConfirmationService,
  ) {}

  // Get discount details for a group lesson enrolment
  async getDiscount(
    locationId: number,
    lessonId: number,
    enrolmentId: number,
  ): Promise<{ body: { lessonId: number; enrolmentId: number; value: number; valueType: number } }> {
    const lesson = await this.repository.findLessonInLocation(lessonId, locationId);
    if (!lesson) {
      throw new NotFoundException(`Lesson with id ${lessonId} not found`);
    }
    if (lesson.course?.program?.type !== ProgramTypeEnum.GROUP_PROGRAM) {
      throw new BadRequestException('Only applicable for group lessons');
    }

    const isValidEnrolment = await this.repository.enrolmentExistsForLessonCourse(lessonId, enrolmentId);
    if (!isValidEnrolment) {
      throw new NotFoundException(`Enrolment with id ${enrolmentId} not found for lesson ${lessonId}`);
    }

    const groupLesson = await this.repository.findGroupLessonByLessonAndEnrolment(lessonId, enrolmentId);
    if (!groupLesson) {
      throw new NotFoundException(`Group lesson row not found for lesson ${lessonId} and enrolment ${enrolmentId}`);
    }

    const discount = await this.repository.findGroupDiscount(lessonId, enrolmentId);
    return {
      body: {
        lessonId,
        enrolmentId,
        value: Number(discount?.value ?? 0),
        valueType: Number(discount?.valueType ?? 0),
      },
    };
  }

  // Edit or apply discount for a group lesson enrolment
  async applyDiscount(
    locationId: number,
    lessonId: number,
    enrolmentId: number,
    value: number,
    valueType: number,
    userId: number,
  ): Promise<{ status: boolean; message: string }> {
    const lesson = await this.repository.findLessonInLocation(lessonId, locationId);
    if (!lesson) {
      throw new NotFoundException(`Lesson with id ${lessonId} not found`);
    }
    if (lesson.course?.program?.type !== ProgramTypeEnum.GROUP_PROGRAM) {
      throw new BadRequestException('Only applicable for group lessons');
    }

    const isValidEnrolment = await this.repository.enrolmentExistsForLessonCourse(lessonId, enrolmentId);
    if (!isValidEnrolment) {
      throw new NotFoundException(`Enrolment with id ${enrolmentId} not found for lesson ${lessonId}`);
    }

    const hasInvoice = await this.repository.hasInvoiceForLessonEnrolment(lessonId, enrolmentId);
    if (hasInvoice) {
      throw new BadRequestException("Lesson is invoiced. You can't edit discount for this lesson");
    }

    await this.entityManager.transaction(async (manager) => {
      const now = getCurrentESTDate();
      const groupLesson = await this.repository.findGroupLessonByLessonAndEnrolment(
        lessonId,
        enrolmentId,
        manager,
      );
      if (!groupLesson) {
        throw new NotFoundException(`Group lesson row not found for lesson ${lessonId} and enrolment ${enrolmentId}`);
      }

      await this.repository.saveGroupDiscount(lessonId, enrolmentId, value, valueType, manager);

      // Group lessons are billed and paid in cents. Normalize the billable total
      // before persistence so sub-cent percentage discounts cannot accumulate.
      const grossPrice = RoundingUtils.decimal(
        RoundingUtils.roundDecimal(Number(lesson.programRate ?? 0), 2),
      );
      let discount = RoundingUtils.decimal(0);
      if (valueType === 1) {
        discount = RoundingUtils.decimal(value)
          .dividedBy(100)
          .multipliedBy(grossPrice);
      } else {
        discount = grossPrice.isNegative()
          ? RoundingUtils.decimal(0)
          : RoundingUtils.decimal(value);
      }
      const roundedNetPrice = RoundingUtils.roundDecimal(
        grossPrice.minus(discount).plus(lesson.tax ?? 0),
        2,
      );
      const paidAmount = await this.repository.getCreditAppliedAmount(lessonId, enrolmentId, manager);
      const roundedBalance = RoundingUtils.roundDecimal(
        RoundingUtils.decimal(roundedNetPrice).minus(paidAmount),
        2,
      );

      groupLesson.total = roundedNetPrice as any;
      groupLesson.balance = roundedBalance as any;
      groupLesson.paidStatus = this.getPaidStatus(roundedBalance);
      groupLesson.updatedByUserId = userId;
      groupLesson.updatedOn = now;
      await manager.getRepository(GroupLesson).save(groupLesson);

      await manager.getRepository(Lesson).update(lessonId, {
        updatedByUserId: userId,
        updatedOn: now,
      });
    });

    const customerId = await this.repository.getCustomerIdByEnrolment(enrolmentId);
    if (customerId) {
      await this.lessonConfirmationService.updateCustomerBalance(customerId);
    }

    return {
      status: true,
      message: 'Group lesson discount updated successfully',
    };
  }

  private getPaidStatus(balance: number): number {
    if (balance === 0) return 2; // PAID
    if (balance > 0) return 1; // OWING
    return 3; // CREDIT
  }
}
