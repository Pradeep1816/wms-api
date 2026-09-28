import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { Lesson } from '../entities/lesson.entity';
import { PrivateLesson } from '../entities/private-lesson.entity';
import { Program } from '../../program/entities/program.entity';
import { EditPriceRequestDto } from '../dto/edit-price-request.dto';
import { EditPriceResponseDto, EditPriceResponse } from '../dto/edit-price-response.dto';
import { EditPriceRepository } from '../repositories/edit-price.repository';
import { plainToInstance } from 'class-transformer';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { RoundingUtils } from '../../utils/rounding.utils';

@Injectable()
export class EditPriceService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly editPriceRepository: EditPriceRepository,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
  ) {}

  /**
   * Get current program rate for a single lesson (matches legacy)
   * Note: Unlike Edit Tax, no invoiced validation on GET
   */
  async getEditPrice(lessonId: number): Promise<EditPriceResponse> {
    const lessonRepo = this.entityManager.getRepository(Lesson);

    const lesson = await lessonRepo.findOne({
      where: { id: lessonId },
      relations: ['course', 'course.program'],
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    // Validate: must be private lesson
    const programType = (lesson as any).course?.program?.type;
    if (programType !== Program.TYPE_PRIVATE_PROGRAM) {
      throw new BadRequestException(
        "This lesson is not a private lesson. You can't edit price.",
      );
    }

    if (lesson.isDeleted) {
      throw new BadRequestException(
        "This lesson is deleted. You can't edit price.",
      );
    }

    const responseDto = plainToInstance(EditPriceResponseDto, {
      programRate: Number(Number(lesson.programRate ?? 0).toFixed(4)),
    });

    return {
      body: responseDto,
    };
  }

  /**
   * Update program rate for a single lesson (matches legacy)
   * Admin-only access enforced at controller level
   */
  async editPrice(
    dto: EditPriceRequestDto,
    locationSlug: string,
  ): Promise<EditPriceResponse> {
    const { id, programRate } = dto;

    const transactionResult = await this.entityManager.transaction(async (manager) => {
      const lessonRepo = manager.getRepository(Lesson);
      const privateLessonRepo = manager.getRepository(PrivateLesson);

      // Fetch lesson and check if invoiced in parallel (optimization)
      const [lesson, invoicedIds] = await Promise.all([
        lessonRepo.findOne({
          where: { id },
          relations: [
            'course',
            'course.program',
            'privateLesson',
            'discounts',
            'course.enrolments',
            'course.enrolments.student',
            'course.enrolments.student.user',
          ],
        }),
        this.editPriceRepository.getInvoicedLessonIds([id]),
      ]);

      if (!lesson) {
        throw new NotFoundException('Lesson not found');
      }

      // Validate: must be private lesson
      const programType = (lesson as any).course?.program?.type;
      if (programType !== Program.TYPE_PRIVATE_PROGRAM) {
        throw new BadRequestException(
          "This lesson is not a private lesson. You can't edit price.",
        );
      }

      if (lesson.isDeleted) {
        throw new BadRequestException(
          "This lesson is deleted. You can't edit price.",
        );
      }

      // Validate: not invoiced
      if (invoicedIds.length > 0) {
        throw new BadRequestException(
          "This lesson is invoiced. You can't edit price.",
        );
      }

      // Update program rate
      lesson.programRate = programRate;
      await lessonRepo.save(lesson);
      const locationId = Number((lesson as any).course?.locationId ?? 0) || 0;

      // Recalculate net price with new program rate (full cascade)
      // No need to reload - we already have all relations loaded
      const rawNet = Number(lesson.getNetPrice());
      if (!Number.isFinite(rawNet)) {
        const responseDto = plainToInstance(EditPriceResponseDto, {
          programRate: Number(Number(programRate).toFixed(4)),
        });
        return { response: { body: responseDto }, customerId: null as number | null, locationId };
      }

      const netPrice = RoundingUtils.roundDecimal(rawNet, 2);

      // Get enrolment/customer IDs for payment lookup and balance refresh
      const enrolments = ((lesson as any).course?.enrolments ?? []) as any[];
      const enrolment = enrolments.find((item: any) => !item?.isDeleted) ?? enrolments[0];
      const enrolmentId = enrolment?.id;
      const customerId =
        enrolment?.student?.user?.id ?? enrolment?.student?.customerId ?? null;

      // Calculate total payments already made for this lesson
      // Legacy: PrivateLesson::beforeSave() uses getOwingAmount() which subtracts payments
      const lessonPaymentRepo = manager.getRepository('LessonPayment');
      const lessonPaymentWhere: Record<string, number> = {
        lessonId: lesson.id,
        isDeleted: 0,
      };
      if (enrolmentId) {
        lessonPaymentWhere.enrolmentId = enrolmentId;
      }
      const lessonPayments = await lessonPaymentRepo.find({
        where: lessonPaymentWhere,
        relations: ['payment'],
      });
      const totalPaid = lessonPayments.reduce(
        (sum: number, lp: any) => sum + Number(lp.amount ?? 0),
        0,
      );

      // Calculate owing amount: netPrice - paymentsAlreadyMade
      const owingAmount = Math.max(0, RoundingUtils.roundDecimal(netPrice - totalPaid, 2));

      // Update private lesson totals and balance
      const pls: PrivateLesson[] = ((lesson as any).privateLesson ?? []) as PrivateLesson[];
      for (const pl of pls) {
        pl.total = netPrice;
        pl.balance = owingAmount;
      }

      if (pls.length > 0) {
        await privateLessonRepo.save(pls);
      }

      const responseDto = plainToInstance(EditPriceResponseDto, {
        programRate: Number(Number(programRate).toFixed(4)),
      });

      return {
        response: { body: responseDto },
        customerId,
        locationId,
      };
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

    return transactionResult.response;
  }
}
