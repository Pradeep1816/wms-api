import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerRecurringPaymentRepository } from '../repositories/customer-recurring-payment.repository';
import { RecurringPaymentUpdateRepository } from '../repositories/recurring-payment-update.repository';
import { UpdateCustomerRecurringPaymentDto } from '../dto/update-recurring-payment.dto';
import { RecurringPaymentUpdateResponseDto } from '../dto/recurring-payment-update-info-response.dto';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { RecurringPaymentUpdateTransformationService } from './transformations/recurring-payment-update-transformation.service';
import { LogObjectType } from '../../log/enums/log-object-type.enum';
import { User } from '../../user/entities/user.entity';
import { AuditLogWriterService } from '../../log/services/audit-log-writer.service';
import { LogActivityType } from '../../log/enums/log-activity.enum';
import { getDisplayName } from '../../shared/helpers/display-name.helper';
import {
  buildRecurringPaymentAuditDiff,
  serializeRecurringPaymentForAudit,
} from '../helpers/recurring-payment-audit.helper';
import { CustomerRecurringPayment } from '../entities/customer-recurring-payment.entity';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { parseFlexibleDate } from '../../utils/date-utils';
dayjs.extend(customParseFormat);

@Injectable()
export class RecurringPaymentUpdateService {
  constructor(
    private readonly customerRecurringPaymentRepository: CustomerRecurringPaymentRepository,
    private readonly recurringPaymentUpdateRepository: RecurringPaymentUpdateRepository,
    private readonly validationService: CustomerValidationService,
    private readonly transformationService: RecurringPaymentUpdateTransformationService,
    private readonly auditLogWriterService?: AuditLogWriterService,
    @InjectRepository(User)
    private readonly userRepository?: Repository<User>,
  ) {}

  /**
   * Get recurring payment update form data
   * Returns current values and available options (legacy parity)
   * 
   * Legacy equivalent: CustomerRecurringPaymentController::actionUpdate() GET
   * - Legacy URL: customer-recurring-payment/update?id={recurringPaymentId}
   * - Legacy: $id is recurring payment ID, customerId comes from $model->customerId
   */
  async getUpdateFormData(
    locationSlug: string,
    recurringPaymentId: number,
  ): Promise<RecurringPaymentUpdateResponseDto> {
    const recurringPayment =
      await this.customerRecurringPaymentRepository.getRecurringPaymentById(
        recurringPaymentId,
      );

    if (!recurringPayment) {
      throw new NotFoundException(
        `Recurring payment not found: ${recurringPaymentId}`,
      );
    }

    // Derive customerId from the recurring payment record (legacy parity)
    const customerId = recurringPayment.customerId;

    const { locationId } = await this.validationService.validateLocationAndCustomer(
      locationSlug,
      customerId,
    );

    // Get all available options
    const [
      paymentMethods,
      paymentFrequencies,
      eligibleEnrolmentIds,
    ] = await Promise.all([
      this.recurringPaymentUpdateRepository.getActivePaymentMethods(),
      this.recurringPaymentUpdateRepository.getAllPaymentFrequencies(),
      this.recurringPaymentUpdateRepository.getEligibleEnrolmentIds(
        customerId,
        recurringPaymentId,
      ),
    ]);

    // Get selected enrolments
    const selectedEnrolmentIds =
      await this.recurringPaymentUpdateRepository.getSelectedEnrolmentIds(
        recurringPaymentId,
      );

    // Get full enrolment details
    const eligibleEnrolments =
      await this.recurringPaymentUpdateRepository.getEnrolmentDetails(
        eligibleEnrolmentIds,
      );

    // Transform using transformation service
    const paymentDto =
      this.transformationService.transformPaymentToUpdateDto(
        recurringPayment,
        selectedEnrolmentIds,
      );

    const paymentMethodDtos =
      this.transformationService.transformPaymentMethodsToDtos(paymentMethods);

    const paymentFrequencyDtos =
      this.transformationService.transformPaymentFrequenciesToDtos(
        paymentFrequencies,
      );

    const enrolmentDtos =
      this.transformationService.transformEnrolmentsToFormDtos(
        eligibleEnrolments,
        selectedEnrolmentIds,
      );

    const enrolmentWarnings = recurringPayment.isRecurringPaymentEnabled
      ? await this.customerRecurringPaymentRepository.getEnrolmentLinkWarnings(
          recurringPaymentId,
          customerId,
          locationId,
        ).catch((error: unknown) => {
          console.warn(
            `Unable to check enrolment links for recurring payment ${recurringPaymentId}:`,
            error,
          );
          return [];
        })
      : [];

    return this.transformationService.transformFormDataToDto(
      paymentDto,
      paymentMethodDtos,
      paymentFrequencyDtos,
      enrolmentDtos,
      enrolmentWarnings,
    );
  }

  /**
   * Update recurring payment (legacy parity)
   * 
   * Legacy equivalent: CustomerRecurringPaymentController::actionUpdate() POST
   * - Legacy URL: customer-recurring-payment/update?id={recurringPaymentId}
   * - Legacy: $id is recurring payment ID, customerId comes from $model->customerId
   */
  async updateRecurringPayment(
    locationSlug: string,
    recurringPaymentId: number,
    dto: UpdateCustomerRecurringPaymentDto,
    userId: number,
  ): Promise<{ id: number }> {
    const recurringPayment =
      await this.customerRecurringPaymentRepository.getRecurringPaymentById(
        recurringPaymentId,
      );

    if (!recurringPayment) {
      throw new NotFoundException(
        `Recurring payment not found: ${recurringPaymentId}`,
      );
    }

    // Derive customerId from the recurring payment record (legacy parity)
    const customerId = recurringPayment.customerId;

    const { locationId } = await this.validationService.validateLocationAndCustomer(
      locationSlug,
      customerId,
    );

    const parsedStartDate = parseFlexibleDate(dto.startDate);
    if (!parsedStartDate) {
      throw new BadRequestException('Invalid start date format');
    }

    if (
      (dto.expiryMonth && !dto.expiryYear) ||
      (!dto.expiryMonth && dto.expiryYear)
    ) {
      throw new BadRequestException(
        'Expiry month and expiry year must be provided together',
      );
    }

    const paymentFrequency =
      await this.recurringPaymentUpdateRepository.getPaymentFrequencyById(
        dto.paymentFrequencyId,
      );
    if (!paymentFrequency) {
      throw new BadRequestException(
        `Payment frequency not found: ${dto.paymentFrequencyId}`,
      );
    }

    // update always replaces existing enrolment links.
    // If enrolmentIds is omitted, treat it as "no enrolments selected".
    const enrolmentIds = dto.enrolmentIds ?? [];
    if (enrolmentIds.length > 0) {
      const eligibleEnrolmentIds =
        await this.recurringPaymentUpdateRepository.getEligibleEnrolmentIds(
          customerId,
          recurringPaymentId,
        );
      const allowedEnrolmentIds = new Set(eligibleEnrolmentIds);

      const invalidEnrolmentIds = enrolmentIds.filter(
        (enrolmentId) => !allowedEnrolmentIds.has(enrolmentId),
      );
      if (invalidEnrolmentIds.length > 0) {
        throw new BadRequestException(
          `Invalid enrolments for recurring payment: ${invalidEnrolmentIds.join(', ')}`,
        );
      }
    }

    const startDate = dayjs(parsedStartDate).format('YYYY-MM-DD');
    const currentDate = dayjs().format('YYYY-MM-DD');
    const oldStartDate = recurringPayment.startDate
      ? dayjs(recurringPayment.startDate).format('YYYY-MM-DD')
      : null;
    const scheduleChanged = oldStartDate !== startDate;

    let nextEntryDay = recurringPayment.nextEntryDay
      ? dayjs(recurringPayment.nextEntryDay).format('YYYY-MM-DD')
      : startDate;

    if (scheduleChanged) {
      if (startDate >= currentDate) {
        nextEntryDay = startDate;
      } else {
        const frequencyLength = dto.paymentFrequencyId;
        const recentWindowStart = dayjs(currentDate)
          .subtract(Math.max(frequencyLength - 1, 0), 'month')
          .startOf('month')
          .format('YYYY-MM-DD');

        const hasRecentRecordedPayment =
          await this.recurringPaymentUpdateRepository.hasRecordedRecurringPaymentBetween(
            recurringPaymentId,
            recentWindowStart,
            currentDate,
          );

        if (!hasRecentRecordedPayment) {
          const latestRecordedPayment =
            await this.recurringPaymentUpdateRepository.getLatestRecordedRecurringPayment(
              recurringPaymentId,
            );

          if (latestRecordedPayment?.date) {
            nextEntryDay = this.addMonthsNoOverflow(
              latestRecordedPayment.date,
              frequencyLength,
            );
          } else {
            let candidate = this.alignToCurrentMonth(startDate, currentDate);
            while (candidate <= currentDate) {
              candidate = this.addMonthsNoOverflow(candidate, frequencyLength);
            }
            nextEntryDay = candidate;
          }
        }
      }
    }

    const expiryDate =
      dto.expiryMonth && dto.expiryYear
        ? this.buildExpiryDate(dto.expiryYear, dto.expiryMonth)
        : recurringPayment.expiryDate;

    let beforeValues: Record<string, unknown> | null = null;
    let beforeEnrolmentIds: number[] = [];
    try {
      beforeValues = serializeRecurringPaymentForAudit(recurringPayment);
      beforeEnrolmentIds =
        await this.recurringPaymentUpdateRepository.getSelectedEnrolmentIds(
          recurringPaymentId,
        );
    } catch (error) {
      beforeValues = null;
      beforeEnrolmentIds = [];
      console.warn('Unable to capture recurring payment audit snapshot before update:', error);
    }

    await this.recurringPaymentUpdateRepository.updateRecurringPayment(
      recurringPaymentId,
      {
        paymentDay: dto.paymentDay,
        paymentMethodId: dto.paymentMethodId,
        paymentFrequencyId: dto.paymentFrequencyId,
        expiryDate,
        amount: dto.amount,
        isRecurringPaymentEnabled: dto.isEnabled === 1,
        startDate,
        nextEntryDay,
        entryDay: parseInt(startDate.split('-')[2], 10),
      },
      enrolmentIds,
      userId,
    );

    await this.createRecurringPaymentUpdateLog(
      recurringPaymentId,
      locationId,
      locationSlug,
      userId,
      customerId,
      beforeValues,
      beforeEnrolmentIds,
    );

    return { id: recurringPaymentId };
  }

  private async createRecurringPaymentUpdateLog(
    recurringPaymentId: number,
    locationId: number,
    locationSlug: string,
    loggedUserId: number,
    customerId: number,
    beforeValues: Record<string, unknown> | null,
    beforeEnrolmentIds: number[],
  ): Promise<void> {
    try {
      if (
        !this.auditLogWriterService ||
        !this.userRepository
      ) {
        return;
      }

      const [recurringPayment, loggedUser] = await Promise.all([
        this.customerRecurringPaymentRepository.getRecurringPaymentById(
          recurringPaymentId,
        ),
        this.userRepository.findOne({
          where: { id: loggedUserId },
          relations: ['profile'],
        }),
      ]);

      if (!recurringPayment?.customer || !loggedUser) {
        return;
      }

      const afterValues = serializeRecurringPaymentForAudit(
        recurringPayment as CustomerRecurringPayment,
      );
      const afterEnrolmentIds =
        await this.recurringPaymentUpdateRepository.getSelectedEnrolmentIds(
          recurringPaymentId,
        );
      const customerName = getDisplayName(recurringPayment.customer);
      const loggedUserName = getDisplayName(loggedUser);
      const auditData: Record<string, unknown> = beforeValues
        ? buildRecurringPaymentAuditDiff(
            beforeValues,
            afterValues,
            beforeEnrolmentIds,
            afterEnrolmentIds,
          )
        : {
            before: null,
            after: {
              recurringPayment: afterValues,
              enrolmentIds: afterEnrolmentIds,
            },
            changes: {},
          };

      await this.auditLogWriterService.writeAuditLog({
        objectType: LogObjectType.USER,
        activityType: LogActivityType.TYPE_UPDATE,
        message: `${loggedUserName} changed the customer recurring payment details for {{${customerName}}}`,
        data: auditData,
        locationId,
        createdUserId: loggedUserId,
        mainLink: {
          index: customerName,
          path: `/v2/admin/${locationSlug}/customers/${customerId}`,
        },
        mainHistory: {
          instanceId: recurringPayment.customerId,
          instanceType: LogObjectType.USER,
        },
      });
    } catch (error) {
      console.error('Error creating recurring payment update log:', error);
    }
  }

  /**
   * Build expiry date from year and month
   * Returns last day of the month in YYYY-MM-DD format
   */
  private buildExpiryDate(year: number, month: string): string {
    const monthNumber = Number(month);
    if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      throw new BadRequestException('Invalid expiry month');
    }

    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    return `${year}-${String(monthNumber).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  /**
   * Align start date to current month while preserving the day
   * Handles overflow (e.g., Jan 31 -> Feb 28)
   */
  private alignToCurrentMonth(
    startDate: string,
    currentDate: string,
  ): string {
    const start = new Date(`${startDate}T00:00:00Z`);
    const current = new Date(`${currentDate}T00:00:00Z`);
    const lastDayOfCurrentMonth = new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const safeDay = Math.min(start.getUTCDate(), lastDayOfCurrentMonth);

    return new Date(
      Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), safeDay),
    )
      .toISOString()
      .slice(0, 10);
  }

  /**
   * Add months to date without overflowing to next month
   * E.g., Jan 31 + 1 month = Feb 28 (not Mar 3)
   */
  private addMonthsNoOverflow(date: string, monthsToAdd: number): string {
    const sourceDate = new Date(`${date}T00:00:00Z`);
    const targetMonthIndex = sourceDate.getUTCMonth() + monthsToAdd;
    const targetYear =
      sourceDate.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
    const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
    const lastDayOfTargetMonth = new Date(
      Date.UTC(targetYear, targetMonth + 1, 0),
    ).getUTCDate();
    const safeDay = Math.min(sourceDate.getUTCDate(), lastDayOfTargetMonth);

    return new Date(Date.UTC(targetYear, targetMonth, safeDay))
      .toISOString()
      .slice(0, 10);
  }
}
