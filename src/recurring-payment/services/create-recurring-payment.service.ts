import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateRecurringPaymentRepository } from '../repositories/create-recurring-payment.repository';
import { CustomerRecurringPaymentRepository } from '../repositories/customer-recurring-payment.repository';
import { CreateCustomerRecurringPaymentDto } from '../dto/create-recurring-payment-request.dto';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { RecurringPaymentUpdateTransformationService } from './transformations/recurring-payment-update-transformation.service';
import { LogObjectType } from '../../log/enums/log-object-type.enum';
import { User } from '../../user/entities/user.entity';
import { AuditLogWriterService } from '../../log/services/audit-log-writer.service';
import { LogActivityType } from '../../log/enums/log-activity.enum';

import dayjs from 'dayjs';
import { CustomerRecurringPayment } from '../entities/customer-recurring-payment.entity';

import {
  parseFlexibleDate,
  buildExpiryDate,
  addMonthsNoOverflow,
} from '../../utils/date-utils';
import { getDisplayName } from '../../shared/helpers/display-name.helper';
import { serializeRecurringPaymentForAudit } from '../helpers/recurring-payment-audit.helper';

@Injectable()
export class CreateRecurringPaymentService {
  constructor(
    private readonly createRecurringPaymentRepository: CreateRecurringPaymentRepository,
    private readonly validationService: CustomerValidationService,
    private readonly transformationService: RecurringPaymentUpdateTransformationService,
    private readonly customerRecurringPaymentRepository?: CustomerRecurringPaymentRepository,
    private readonly auditLogWriterService?: AuditLogWriterService,
    @InjectRepository(User)
    private readonly userRepository?: Repository<User>,
  ) {}

  /**
   * Get create form data with default values
   * 
   * Legacy equivalent: CustomerRecurringPaymentController::actionCreate() GET
   */
  async getCreateFormData(
    locationSlug: string,
    customerId: number,
  ): Promise<any> {
    // Validate location and customer
    const { locationId } = await this.validationService.validateLocationAndCustomer(
      locationSlug,
      customerId,
    );

    // Get all available options and eligible enrolments
    const [
      paymentMethods,
      paymentFrequencies,
      eligibleEnrolmentIds,
    ] = await Promise.all([
      this.createRecurringPaymentRepository.getActivePaymentMethods(),
      this.createRecurringPaymentRepository.getAllPaymentFrequencies(),
      this.createRecurringPaymentRepository.getEligibleEnrolmentIds(
        customerId,
        locationId,
      ),
    ]);

    // Get full enrolment details
    const eligibleEnrolments =
      await this.createRecurringPaymentRepository.getEnrolmentDetails(
        eligibleEnrolmentIds,
      );

    // Build default payment data (legacy defaults)
    const today = dayjs();
    const formattedStartDate = today.format('MMM D, YYYY');
    const currentMonth = String(today.month() + 1);
    const currentYear = today.year();

    // Build default payment data (legacy defaults)
    const defaultPaymentData = {
      customerId,
      startDate: formattedStartDate,
      paymentDay: CustomerRecurringPayment.DEFAULT_PAYMENT_DAY,
      paymentMethodId: CustomerRecurringPayment.DEFAULT_PAYMENT_METHOD_ID,
      paymentFrequencyId: CustomerRecurringPayment.DEFAULT_PAYMENT_FREQUENCY_ID,
      expiryMonth: currentMonth,
      expiryYear: currentYear,
      amount: CustomerRecurringPayment.DEFAULT_RATE,
      isEnabled: true,
      selectedEnrolmentIds: [],
    };

    const paymentMethodDtos = paymentMethods.map((pm) => ({
      id: pm.id,
      name: pm.name,
    }));

    const paymentFrequencyDtos = paymentFrequencies.map((pf) => ({
      id: pf.id,
      name: pf.name,
    }));

    const enrolmentDtos = eligibleEnrolments.map((enrolment) => ({
      id: enrolment.id,
      studentName: enrolment.studentName,
      programName: enrolment.programName,
      paymentFrequency: enrolment.paymentFrequency,
      teacherName: enrolment.teacherName,
      dueAmount: enrolment.dueAmount,
      isSelected: false,
    }));

    // Reuse helper methods from transformation service
    const days = this.transformationService.buildDaysList();
    const months = this.transformationService.buildMonthsList();
    const years = this.transformationService.buildYearsList();

    // Return form data structure
    return {
      body: {
        recurringPayment: defaultPaymentData,
        paymentMethods: paymentMethodDtos,
        paymentFrequencies: paymentFrequencyDtos,
        days,
        months,
        years,
        enrolments: enrolmentDtos,
      },
    };
  }

  /**
   * Create recurring payment
   * 
   */
  async createRecurringPayment(
    locationSlug: string,
    dto: CreateCustomerRecurringPaymentDto,
    userId: number,
  ): Promise<{ id: number }> {
    // Validate location and customer
    const { locationId } = await this.validationService.validateLocationAndCustomer(
      locationSlug,
      dto.customerId,
    );

    // Parse and validate start date using shared utility
    const parsedDate = parseFlexibleDate(dto.startDate);
    if (!parsedDate) {
      throw new BadRequestException('Invalid start date format');
    }
    const parsedStartDate = dayjs(parsedDate).format('YYYY-MM-DD');

    // Validate expiry month/year (both or none)
    if (
      (dto.expiryMonth && !dto.expiryYear) ||
      (!dto.expiryMonth && dto.expiryYear)
    ) {
      throw new BadRequestException(
        'Expiry month and expiry year must be provided together',
      );
    }

    // Validate payment frequency
    const paymentFrequency =
      await this.createRecurringPaymentRepository.getPaymentFrequencyById(
        dto.paymentFrequencyId,
      );
    if (!paymentFrequency) {
      throw new BadRequestException(
        `Payment frequency not found: ${dto.paymentFrequencyId}`,
      );
    }

    // Validate enrolments if provided
    // Note: Location filter added for security (not in legacy but recommended)
    const enrolmentIds = dto.enrolmentIds ?? [];
    if (enrolmentIds.length > 0) {
      const eligibleEnrolmentIds =
        await this.createRecurringPaymentRepository.getEligibleEnrolmentIds(
          dto.customerId,
          locationId,
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

    // Calculate dates
    const startDate = dayjs(parsedStartDate).format('YYYY-MM-DD');
    const currentDate = dayjs().format('YYYY-MM-DD');
    const entryDay = parseInt(startDate.split('-')[2], 10);

    // Calculate nextEntryDay (simpler than update - no recorded payment check)
    let nextEntryDay: string;
    if (startDate >= currentDate) {
      nextEntryDay = startDate;
    } else {
      nextEntryDay = addMonthsNoOverflow(startDate, dto.paymentFrequencyId);
    }

    // Calculate expiry date using shared utility
    const expiryDate =
      dto.expiryMonth && dto.expiryYear
        ? buildExpiryDate(dto.expiryYear, dto.expiryMonth)
        : undefined;

    // Create recurring payment
    const result = await this.createRecurringPaymentRepository.createRecurringPayment(
      {
        customerId: dto.customerId,
        paymentDay: dto.paymentDay,
        paymentMethodId: dto.paymentMethodId,
        paymentFrequencyId: dto.paymentFrequencyId,
        expiryDate,
        amount: dto.amount,
        isRecurringPaymentEnabled: dto.isEnabled === 1,
        startDate,
        nextEntryDay,
        entryDay,
      },
      enrolmentIds,
      userId,
    );

    await this.createRecurringPaymentLog(
      result.id,
      locationId,
      dto.customerId,
      userId,
      locationSlug,
      expiryDate,
    );

    return result;
  }

  private async createRecurringPaymentLog(
    recurringPaymentId: number,
    locationId: number,
    customerId: number,
    loggedUserId: number,
    locationSlug: string,
    expiryDate?: string,
  ): Promise<void> {
    try {
      if (
        !this.customerRecurringPaymentRepository ||
        !this.auditLogWriterService ||
        !this.userRepository
      ) {
        return;
      }

      const [recurringPayment, loggedUser] = await Promise.all([
        this.customerRecurringPaymentRepository.getRecurringPaymentById(recurringPaymentId),
        this.userRepository.findOne({
          where: { id: loggedUserId },
          relations: ['profile'],
        }),
      ]);

      if (!recurringPayment?.customer || !loggedUser) {
        return;
      }

      const customerName = getDisplayName(recurringPayment.customer);
      const loggedUserName = getDisplayName(loggedUser);
      const message = `${loggedUserName} created the customer recurring payment for {{${customerName}}}${expiryDate ? ` expires on ${dayjs(expiryDate).format('MMM D, YYYY')}` : ''}`;

      await this.auditLogWriterService.writeAuditLog({
        objectType: LogObjectType.USER,
        activityType: LogActivityType.TYPE_CREATE,
        message,
        data: serializeRecurringPaymentForAudit(recurringPayment),
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
      // Log creation is non-critical and should not block recurring payment setup.
      console.error('Error creating recurring payment log:', error);
    }
  }
}
