import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { PrivateLesson } from '../entities/private-lesson.entity';
import { Program } from '../../program/entities/program.entity';
import { EditTaxRequestDto } from '../dto/edit-tax-request.dto';
import { EditTaxResponseDto, EditTaxResponse } from '../dto/edit-tax-response.dto';
import { EditTaxRepository } from '../repositories/edit-tax.repository';
import { EditDiscountRepository } from '../repositories/private-lesson-actions/edit-discount.repository';
import { plainToInstance } from 'class-transformer';
import { formatCurrency } from '../../utils/formatters';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { TeacherEligibilityValidator } from '../validators/teacher-eligibility.validator';
import { RoundingUtils } from '../../utils/rounding.utils';

@Injectable()
export class EditTaxService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly editTaxRepository: EditTaxRepository,
    private readonly editDiscountRepository: EditDiscountRepository,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
    private readonly teacherEligibilityValidator: TeacherEligibilityValidator,
  ) {}

  /**
   * Get current tax value for a single lesson (matches legacy)
   */
  async getEditTax(lessonId: number): Promise<EditTaxResponse> {
    const lessonRepo = this.entityManager.getRepository(Lesson);

    // Fetch lesson and check if invoiced in parallel (optimization)
    const [lesson, invoicedIds] = await Promise.all([
      lessonRepo.findOne({
        where: { id: lessonId },
        relations: ['course', 'course.program'],
      }),
      this.editTaxRepository.getInvoicedLessonIds([lessonId]),
    ]);

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    // Validate: must be private lesson
    const programType = (lesson as any).course?.program?.type;
    if (programType !== Program.TYPE_PRIVATE_PROGRAM) {
      throw new BadRequestException(
        "This lesson is not a private lesson. You can't edit tax.",
      );
    }

    if (lesson.isDeleted) {
      throw new BadRequestException(
        "This lesson is deleted. You can't edit tax.",
      );
    }

    // Validate: not invoiced
    if (invoicedIds.length > 0) {
      throw new BadRequestException(
        "This lesson is invoiced. You can't edit tax.",
      );
    }

    const responseDto = plainToInstance(EditTaxResponseDto, {
      tax: formatCurrency(Number(Number(lesson.tax ?? 0).toFixed(2))),
    });

    return {
      body: responseDto,
    };
  }

  /**
   * Update tax for a single lesson (matches legacy)
   */
  async editTax(
    dto: EditTaxRequestDto,
    locationSlug: string,
  ): Promise<{ tax: string }> {
    const { id, tax } = dto;

    const transactionResult = await this.entityManager.transaction(async (manager) => {
      const lessonRepo = manager.getRepository(Lesson);

      // Fetch lesson and check if invoiced in parallel (optimization)
      const [lesson, invoicedIds] = await Promise.all([
        lessonRepo.findOne({
          where: { id },
          relations: [
            'course',
            'course.program',
            'discounts',
            'privateLesson',
            'course.enrolments',
            'course.enrolments.student',
            'course.enrolments.student.user',
          ],
        }),
        this.editTaxRepository.getInvoicedLessonIds([id]),
      ]);

      if (!lesson) {
        throw new NotFoundException('Lesson not found');
      }

      // Validate: must be private lesson
      const programType = (lesson as any).course?.program?.type;
      if (programType !== Program.TYPE_PRIVATE_PROGRAM) {
        throw new BadRequestException(
          "This lesson is not a private lesson. You can't edit tax.",
        );
      }

      if (lesson.isDeleted) {
        throw new BadRequestException(
          "This lesson is deleted. You can't edit tax.",
        );
      }

      const lessonLocationId = Number((lesson as any).course?.locationId ?? 0) || 0;
      await this.teacherEligibilityValidator.validateTeacherEligibility(
        Number((lesson as any).teacherId ?? 0),
        lesson.id,
        lessonLocationId,
      );

      // Validate: not invoiced
      if (invoicedIds.length > 0) {
        throw new BadRequestException(
          "This lesson is invoiced. You can't edit tax.",
        );
      }

      // Update tax with proper type conversion
      lesson.tax = RoundingUtils.roundDecimal(tax, 2);
      const savedLesson = await lessonRepo.save(lesson);
      const locationId = Number((savedLesson as any).course?.locationId ?? 0) || 0;

      // Recalculate net price with new tax (use saved lesson, no reload needed)
      const rawNet = Number(savedLesson.getNetPrice());
      if (!Number.isFinite(rawNet)) {
        return { customerId: null as number | null, locationId };
      }

      const netPrice = RoundingUtils.roundDecimal(rawNet, 2);

      // Get enrolment/customer IDs for payment lookup and balance refresh
      const enrolments = ((savedLesson as any).course?.enrolments ?? []) as any[];
      const enrolment = enrolments.find((item: any) => !item?.isDeleted) ?? enrolments[0];
      const enrolmentId = enrolment?.id;
      const customerId =
        enrolment?.student?.user?.id ?? enrolment?.student?.customerId ?? null;

      // Calculate total payments already made for this lesson, excluding credit-used payments.
      // This matches legacy getCreditAppliedAmount() semantics.
      const lessonPayments = enrolmentId
        ? await this.editDiscountRepository.getLessonPaymentsForUnwind(
            savedLesson.id,
            enrolmentId,
            manager,
          )
        : [];
      const totalPaid = lessonPayments.reduce(
        (sum: number, lp: any) => sum + Number(lp.amount ?? 0),
        0,
      );

      // Calculate owing amount without clamping so overpaid lessons can be unwound.
      let owingAmount = RoundingUtils.roundDecimal(netPrice - totalPaid, 2);
      const affectedPaymentIds = new Set<number>();

      if (owingAmount < 0 && enrolmentId) {
        let remainingOverpaid = Math.abs(owingAmount);

        for (const lp of lessonPayments) {
          if (remainingOverpaid <= 0) break;

          const amount = RoundingUtils.roundDecimal(Number(lp.amount ?? 0), 4);
          affectedPaymentIds.add(Number(lp.paymentId));

          if (amount <= remainingOverpaid) {
            await this.editDiscountRepository.softDeleteLessonPayment(lp.id, manager);
            remainingOverpaid = RoundingUtils.roundDecimal(
              remainingOverpaid - amount,
              4,
            );
          } else {
            const newAmount = RoundingUtils.roundDecimal(
              amount - remainingOverpaid,
              4,
            );
            await this.editDiscountRepository.updateLessonPaymentAmount(
              lp.id,
              newAmount,
              manager,
            );
            remainingOverpaid = 0;
          }
        }

        owingAmount = 0;
      }

      // Update private lesson totals
      const privateLessonRepo = manager.getRepository(PrivateLesson);
      const pls: PrivateLesson[] = ((savedLesson as any).privateLesson ?? []) as PrivateLesson[];

      for (const pl of pls) {
        pl.total = netPrice;
        pl.balance = owingAmount;
      }

      if (pls.length > 0) {
        await privateLessonRepo.save(pls);
      }

      await this.editDiscountRepository.recalculatePaymentBalances(
        [...affectedPaymentIds],
        manager,
      );

      return { customerId, locationId };
    });

    if (
      typeof transactionResult.customerId === 'number' &&
      Number.isFinite(transactionResult.customerId) &&
      transactionResult.customerId > 0 &&
      Number.isFinite(transactionResult.locationId) &&
      transactionResult.locationId > 0
    ) {
      await this.customerBalanceRecalculatorService.recalculateAndPersist(
        transactionResult.customerId,
        { locationSlug },
      );
    }

    return { tax: formatCurrency(Number(Number(tax).toFixed(2))) };
  }
}
