import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, In } from 'typeorm';
import { Lesson } from '../../entities/lesson.entity';
import { PrivateLesson } from '../../entities/private-lesson.entity';
import { LessonDiscount } from '../../entities/lesson-discount.entity';
import { Program } from '../../../program/entities/program.entity';
import { EditPrivateLessonDiscountDto } from '../../dto/private-lesson-action-dto/edit-private-lesson-discount.dto';
import {
  EditDiscountRepository,
  DiscountUpdate,
} from '../../repositories/private-lesson-actions/edit-discount.repository';
import { EditClassroomRepository } from '../../repositories/private-lesson-actions/edit-classroom.repository';
import { LessonDiscountTypeEnum } from '../../enums/lesson-discount-type';
import { GetEditDiscountResponse, GetEditDiscountResponseDto } from '../../dto/private-lesson-action-dto/get-edit-discount-response.dto';
import { CustomerBalanceRecalculatorService } from '../../../shared/services/customer-balance-recalculator.service';
import { RoundingUtils } from '../../../utils/rounding.utils';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class EditDiscountService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly editDiscountRepository: EditDiscountRepository,
    private readonly editClassroomRepository: EditClassroomRepository,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
  ) { }

  async editDiscount(
    dto: EditPrivateLessonDiscountDto,
    locationId: number,
    locationSlug: string,
    currentUserId: number,
  ): Promise<{ status: boolean; message?: string }> {
    const { lessonIds } = dto;

    if (!lessonIds?.length) {
      throw new BadRequestException('Choose any lessons to edit discount');
    }

    const result = await this.entityManager.transaction(async (manager) => {
      if (manager.queryRunner) {
        manager.queryRunner.data = {
          ...(manager.queryRunner.data ?? {}),
          currentUserId,
        };
      }
      const lessonRepo = manager.getRepository(Lesson);

      const [lessons, invoicedLessonIds] = await Promise.all([
        lessonRepo.find({
          where: { id: In(lessonIds) },
          relations: ['course', 'course.program', 'privateLesson'],
        }),
        this.editClassroomRepository.getInvoicedLessonIds(lessonIds),
      ]);

      if (lessons.length !== lessonIds.length) {
        throw new BadRequestException('One or more lessons not found');
      }

      const invoicedSet = new Set(invoicedLessonIds);

      for (const lesson of lessons) {
        const programType = (lesson as any).course?.program?.type;
        if (programType !== Program.TYPE_PRIVATE_PROGRAM) {
          throw new BadRequestException(
            "One of the chosen lessons is not a private lesson. You can't edit discount.",
          );
        }
        if (invoicedSet.has(lesson.id)) {
          throw new BadRequestException(
            "One of the chosen lessons is invoiced. You can't edit discount for these lessons.",
          );
        }
        if (lesson.isDeleted) {
          throw new BadRequestException(
            "One of the chosen lessons is deleted. You can't edit discount.",
          );
        }
      }

      const lessonToEnrolmentRows =
        await this.editDiscountRepository.getPrimaryEnrolmentIdsByLessonIds(
          lessonIds,
          manager,
        );
      const lessonToEnrolment = new Map<number, number>();
      for (const row of lessonToEnrolmentRows) {
        lessonToEnrolment.set(row.lessonId, row.enrolmentId);
      }

      const updates: DiscountUpdate[] = [];
      const lineItemValueType =
        dto.lineItemDiscountValueType ?? LessonDiscountTypeEnum.VALUE_TYPE_DOLLAR;

      for (const lesson of lessons) {
        const lessonId = lesson.id;
        const enrolmentId = lessonToEnrolment.get(lessonId);
        if (!enrolmentId) {
          throw new BadRequestException(
            `Unable to resolve enrolment for lesson ${lessonId}.`,
          );
        }
        if (dto.customerDiscount !== undefined) {
          updates.push({
            lessonId,
            type: LessonDiscount.TYPE_CUSTOMER,
            value: dto.customerDiscount,
            valueType: LessonDiscountTypeEnum.VALUE_TYPE_PERCENTAGE,
            enrolmentId,
          });
        }
        if (dto.paymentFrequencyDiscount !== undefined) {
          updates.push({
            lessonId,
            type: LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY,
            value: dto.paymentFrequencyDiscount,
            valueType: LessonDiscountTypeEnum.VALUE_TYPE_PERCENTAGE,
            enrolmentId,
          });
        }
        if (dto.multiEnrolmentDiscount !== undefined) {
          updates.push({
            lessonId,
            type: LessonDiscount.TYPE_MULTIPLE_ENROLMENT,
            value: dto.multiEnrolmentDiscount,
            valueType: LessonDiscountTypeEnum.VALUE_TYPE_DOLLAR,
            enrolmentId,
          });
        }
        if (dto.lineItemDiscount !== undefined) {
          updates.push({
            lessonId,
            type: LessonDiscount.TYPE_LINE_ITEM,
            value: dto.lineItemDiscount,
            valueType: lineItemValueType,
            enrolmentId,
          });
        }
      }

      if (updates.length === 0) {
        return { status: true, affectedCustomerIds: [] as number[] };
      }

      // Single lesson: use discountLessons (fewer round-trips for one lesson)
      if (lessonIds.length === 1) {
        for (const u of updates) {
          await this.editDiscountRepository.discountLessons(
            u.lessonId,
            u.type,
            u.value,
            u.valueType,
            u.enrolmentId,
            manager,
          );
        }
      } else {
        // Multiple lessons: use bulk (one find + one save)
        await this.editDiscountRepository.discountLessonsBulk(updates, manager);
      }

      // After discount updates, recalc private lesson totals and balances like legacy:
      // - Legacy: LessonDiscount::afterSave() → $this->lesson->privateLesson->save(), $this->lesson->save()
      // - Here: reload lessons with discounts + privateLesson, recompute net price and owing, then save both.
      const lessonsWithDiscounts = await lessonRepo.find({
        where: { id: In(lessonIds) },
        relations: ['discounts', 'privateLesson', 'course', 'course.enrolments'],
      });
      const privateLessonRepo = manager.getRepository(PrivateLesson);

      // balance = round(netPrice,2) - round(getCreditAppliedAmount(enrolmentId),2)
      // where getCreditAppliedAmount excludes credit-used payments.
      const paidRows = await this.editDiscountRepository.getCreditAppliedTotalsByLessonIds(
        lessonIds,
        manager,
      );
      const paidMap = new Map<string, number>();
      for (const row of paidRows) {
        const key = `${row.lessonId}-${row.enrolmentId}`;
        paidMap.set(key, row.totalPaid);
      }

      const allPrivateLessonsToSave: PrivateLesson[] = [];
      const affectedPaymentIds = new Set<number>();

      for (const lesson of lessonsWithDiscounts) {
        // Recalculate net price. If something is wrong with the data and we cannot
        // compute a finite number, skip updating totals to avoid overwriting with 0/NaN.
        const rawNet = Number(lesson.getNetPrice());
        if (!Number.isFinite(rawNet)) {
          continue;
        }
        const netPrice = RoundingUtils.roundDecimal(rawNet, 2);
        const enrolmentId = lessonToEnrolment.get(lesson.id);
        const paidAmount = enrolmentId
          ? paidMap.get(`${lesson.id}-${enrolmentId}`) || 0
          : 0;
        let owingAmount = RoundingUtils.calculateBalance(
          netPrice,
          paidAmount,
          2,
        );

        // Legacy parity: if recalculated balance is negative, unwind excess
        // lesson payments (delete full rows, or reduce the row where remainder fits).
        // This creates credit for the customer when discount is increased.
        if (owingAmount < 0 && enrolmentId) {
          let remainingOverpaid = RoundingUtils.decimal(owingAmount).abs();
          const lessonPayments = await this.editDiscountRepository.getLessonPaymentsForUnwind(
            lesson.id,
            enrolmentId,
            manager,
          );

          for (const lp of lessonPayments) {
            if (remainingOverpaid.lte(0)) break;
            const amount = RoundingUtils.decimal(
              RoundingUtils.roundDecimal(lp.amount, 4),
            );
            
            // Track affected payment for balance recalculation
            affectedPaymentIds.add(lp.paymentId);
            
            if (amount.lte(remainingOverpaid)) {
              // Soft delete full lesson payment row
              await this.editDiscountRepository.softDeleteLessonPayment(lp.id, manager);
              remainingOverpaid = RoundingUtils.decimal(
                RoundingUtils.calculateBalance(
                  remainingOverpaid,
                  amount,
                  4,
                ),
              );
            } else {
              // Reduce the lesson payment amount
              const newAmount = RoundingUtils.calculateBalance(
                amount,
                remainingOverpaid,
                4,
              );
              await this.editDiscountRepository.updateLessonPaymentAmount(lp.id, newAmount, manager);
              remainingOverpaid = RoundingUtils.decimal(0);
            }
          }
          owingAmount = 0;
        }

        // Lesson.privateLesson is modeled as OneToMany (array) in this codebase.
        // Update all associated private lessons (typically there is only one).
        const privateLessons: PrivateLesson[] = ((lesson as any).privateLesson ?? []) as PrivateLesson[];
        for (const pl of privateLessons) {
          pl.total = netPrice;
          pl.balance = owingAmount;
          allPrivateLessonsToSave.push(pl);
        }
      }

      if (allPrivateLessonsToSave.length > 0) {
        await privateLessonRepo.save(allPrivateLessonsToSave);
      }

      if (lessonsWithDiscounts.length > 0) {
        await lessonRepo.save(lessonsWithDiscounts);
      }

      // Recalculate payment balances for affected payments
      // This is critical for credit to appear in customer account
      await this.editDiscountRepository.recalculatePaymentBalances([...affectedPaymentIds], manager);

      // Update customer balance for affected customers (matches legacy Lesson::afterSave)
      // Legacy: $this->customer->updateCustomerBalance() when isPrivate()
      const affectedEnrolmentIds = lessonsWithDiscounts
        .map((lesson) => lessonToEnrolment.get(lesson.id))
        .filter((id): id is number => id !== undefined);

      const uniqueEnrolmentIds = [...new Set(affectedEnrolmentIds)];
      const affectedCustomerIds = await this.editDiscountRepository.getCustomerIdsByEnrolmentIds(
        uniqueEnrolmentIds,
        manager,
      );

      return { status: true, affectedCustomerIds };
    });

    for (const customerId of result.affectedCustomerIds ?? []) {
      if (Number.isFinite(customerId) && customerId > 0) {
        await this.customerBalanceRecalculatorService.recalculateAndPersist(
          customerId,
          { locationSlug },
        );
      }
    }

    return { status: result.status };
  }

  /**
   * Get current discount values for the given lessons (for pre-filling edit form).
   * Returns single value when all lessons share the same value, null + mixed: true when they differ.
   */
  async getEditDiscount(
    lessonIds: number[],
  ): Promise<GetEditDiscountResponse> {
    if (!lessonIds?.length) {
      throw new BadRequestException('Choose any lessons to edit discount');
    }

    const lessonRepo = this.entityManager.getRepository(Lesson);

    const [lessons, invoicedIds] = await Promise.all([
      lessonRepo.find({
        where: { id: In(lessonIds) },
        relations: ['course', 'course.program'],
      }),
      this.editClassroomRepository.getInvoicedLessonIds(lessonIds),
    ]);

    if (lessons.length !== lessonIds.length) {
      throw new BadRequestException('One or more lessons not found');
    }

    for (const lesson of lessons) {
      const programType = (lesson as any).course?.program?.type;
      if (programType !== Program.TYPE_PRIVATE_PROGRAM) {
        throw new BadRequestException(
          "One of the chosen lessons is not a private lesson. You can't edit discount.",
        );
      }
      if (lesson.isDeleted) {
        throw new BadRequestException(
          "One of the chosen lessons is deleted. You can't edit discount.",
        );
      }
    }

    const invoicedSet = new Set(invoicedIds);
    for (const lesson of lessons) {
      if (invoicedSet.has(lesson.id)) {
        throw new BadRequestException(
          "One of the chosen lessons is invoiced. You can't edit discount for these lessons.",
        );
      }
    }

    const discounts =
      await this.editDiscountRepository.findDiscountsByLessonIds(lessonIds);

    const byLessonAndType = new Map<string, LessonDiscount>();
    for (const d of discounts) {
      byLessonAndType.set(`${d.lessonId}-${d.type}`, d);
    }

    const getValues = (type: number) => {
      const values: (number | null)[] = [];
      let valueType: number | null = null;
      for (const lid of lessonIds) {
        const d = byLessonAndType.get(`${lid}-${type}`);
        if (d) {
          values.push(Number(d.value ?? 0));
          if (valueType === null) valueType = d.valueType;
        } else {
          values.push(null);
        }
      }
      return { values, valueType };
    };

    const sameOrMixed = (
      values: (number | null)[],
    ): { value: number | null; mixed: boolean } => {
      if (values.length === 0) return { value: null, mixed: false };
      const hasNull = values.some((v) => v === null);
      const numbers = values.filter((v): v is number => v !== null);
      if (numbers.length === 0) return { value: null, mixed: false };
      if (hasNull) return { value: null, mixed: true };
      const first = numbers[0];
      const mixed = numbers.some((v) => Math.abs(v - first) > 1e-9);
      return { value: mixed ? null : first, mixed };
    };

    const customer = getValues(LessonDiscount.TYPE_CUSTOMER);
    const pf = getValues(LessonDiscount.TYPE_ENROLMENT_PAYMENT_FREQUENCY);
    const multi = getValues(LessonDiscount.TYPE_MULTIPLE_ENROLMENT);
    const lineItem = getValues(LessonDiscount.TYPE_LINE_ITEM);

    const customerResult = sameOrMixed(customer.values);
    const pfResult = sameOrMixed(pf.values);
    const multiResult = sameOrMixed(multi.values);
    const lineItemResult = sameOrMixed(lineItem.values);

    const lineItemDiscountValueType =
      !lineItemResult.mixed && lineItemResult.value !== null && lineItem.valueType !== null
        ? lineItem.valueType
        : null;

    const discountResponse = plainToInstance(GetEditDiscountResponseDto, {
      lessonIds,
      customerDiscount: customerResult.mixed ? null : (customerResult.value ?? 0),
      customerMixed: customerResult.mixed,
      paymentFrequencyDiscount: pfResult.mixed ? null : (pfResult.value ?? 0),
      paymentFrequencyMixed: pfResult.mixed,
      multiEnrolmentDiscount: multiResult.mixed ? null : (multiResult.value ?? 0),
      multiEnrolmentMixed: multiResult.mixed,
      lineItemDiscount: lineItemResult.mixed ? null : (lineItemResult.value ?? 0),
      lineItemDiscountValueType: lineItemDiscountValueType ?? 0,
      lineItemMixed: lineItemResult.mixed,
    });

    return {
      body: discountResponse,
    }
  }
}
