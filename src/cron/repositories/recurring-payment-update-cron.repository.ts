import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Location } from '../../location/entities/location.entity';
import { CustomerRecurringPayment } from '../../recurring-payment/entities/customer-recurring-payment.entity';
import { RecurringPayment } from '../../recurring-payment/entities/recurring-payment.entity';
import { addMonthsNoOverflow, getCurrentESTDate } from '../../utils/date-utils';

export interface RecurringPaymentUpdateCronLocation {
  id: number;
  name: string;
  slug: string;
}

export interface RecurringPaymentUpdateCandidate {
  id: number;
  customerId: number;
  amount: number;
  paymentFrequencyId: number;
  expiryDate: string;
  startDate: string | null;
  nextEntryDay: string;
}

export interface RecurringPaymentUpdateProcessResult {
  updated: boolean;
  previousRecordedPaymentDate: string | null;
  previousNextEntryDay: string;
  nextEntryDay: string | null;
  skippedReason: 'invalid-payment-frequency' | null;
}

@Injectable()
export class RecurringPaymentUpdateCronRepository {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(CustomerRecurringPayment)
    private readonly customerRecurringPaymentRepository: Repository<CustomerRecurringPayment>,
  ) {}

  async getCronEnabledLocations(): Promise<RecurringPaymentUpdateCronLocation[]> {
    const rows = await this.locationRepository
      .createQueryBuilder('location')
      .select([
        'location.id AS id',
        'location.name AS name',
        'location.slug AS slug',
      ])
      .where('location.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('location.isEnabledCron = :isEnabledCron', { isEnabledCron: true })
      .orderBy('location.id', 'ASC')
      .getRawMany<RecurringPaymentUpdateCronLocation>();

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      slug: row.slug,
    }));
  }

  async getOutdatedRecurringPayments(
    locationId: number,
    currentDate: string,
  ): Promise<RecurringPaymentUpdateCandidate[]> {
    const rows = await this.customerRecurringPaymentRepository
      .createQueryBuilder('customerRecurringPayment')
      .innerJoin(
        'customerRecurringPayment.customer',
        'customer',
        'customer.isDeleted = :customerIsDeleted',
        { customerIsDeleted: false },
      )
      .innerJoin(
        'customer.userLocation',
        'userLocation',
        'userLocation.locationId = :locationId',
        { locationId },
      )
      .select([
        'customerRecurringPayment.id AS id',
        'customerRecurringPayment.customerId AS customerId',
        'customerRecurringPayment.amount AS amount',
        'customerRecurringPayment.paymentFrequencyId AS paymentFrequencyId',
        'customerRecurringPayment.expiryDate AS expiryDate',
        'customerRecurringPayment.startDate AS startDate',
        'customerRecurringPayment.nextEntryDay AS nextEntryDay',
      ])
      .where('customerRecurringPayment.isDeleted = :isDeleted', {
        isDeleted: false,
      })
      .andWhere('DATE(customerRecurringPayment.nextEntryDay) < :currentDate', {
        currentDate,
      })
      .andWhere('DATE(customerRecurringPayment.expiryDate) >= :currentDate', {
        currentDate,
      })
      .andWhere(
        'customerRecurringPayment.isRecurringPaymentEnabled = :isRecurringPaymentEnabled',
        { isRecurringPaymentEnabled: true },
      )
      .andWhere('customerRecurringPayment.amount > :minimumAmount', {
        minimumAmount: 0,
      })
      .orderBy('customerRecurringPayment.id', 'ASC')
      .getRawMany<{
        id: string | number;
        customerId: string | number;
        amount: string | number;
        paymentFrequencyId: string | number;
        expiryDate: string | Date;
        startDate: string | Date | null;
        nextEntryDay: string | Date;
      }>();

    return rows
      .map((row) => ({
        id: Number(row.id),
        customerId: Number(row.customerId),
        amount: Number(row.amount),
        paymentFrequencyId: Number(row.paymentFrequencyId),
        expiryDate: this.toDateKey(row.expiryDate),
        startDate: row.startDate ? this.toDateKey(row.startDate) : null,
        nextEntryDay: this.toDateKey(row.nextEntryDay),
      }))
      .filter((row) => Number.isFinite(row.id) && Number.isFinite(row.customerId));
  }

  async processRecurringPaymentUpdate(
    recurringPayment: RecurringPaymentUpdateCandidate,
    currentDate: string,
    userId: number,
    manager: EntityManager,
  ): Promise<RecurringPaymentUpdateProcessResult> {
    if (
      !Number.isFinite(recurringPayment.paymentFrequencyId) ||
      recurringPayment.paymentFrequencyId < 1
    ) {
      return {
        updated: false,
        previousRecordedPaymentDate: null,
        previousNextEntryDay: recurringPayment.nextEntryDay,
        nextEntryDay: null,
        skippedReason: 'invalid-payment-frequency',
      };
    }

    const previousRecordedPayment = await manager
      .createQueryBuilder(RecurringPayment, 'recurringPayment')
      .select('recurringPayment.date', 'date')
      .where(
        'recurringPayment.customerRecurringPaymentId = :customerRecurringPaymentId',
        { customerRecurringPaymentId: recurringPayment.id },
      )
      .orderBy('recurringPayment.date', 'DESC')
      .getRawOne<{ date: string | Date }>();

    let nextEntryDay = previousRecordedPayment
      ? addMonthsNoOverflow(
          this.toDateKey(previousRecordedPayment.date),
          recurringPayment.paymentFrequencyId,
        )
      : this.buildCurrentMonthDate(
          recurringPayment.startDate,
          currentDate,
        );

    while (nextEntryDay <= currentDate) {
      nextEntryDay = addMonthsNoOverflow(
        nextEntryDay,
        recurringPayment.paymentFrequencyId,
      );
    }

    const now = getCurrentESTDate();
    const recurringPaymentEntity = await manager.getRepository(CustomerRecurringPayment).findOne({
      where: { id: recurringPayment.id },
    });
    if (!recurringPaymentEntity) {
      throw new Error(`Customer recurring payment ${recurringPayment.id} not found`);
    }

    recurringPaymentEntity.nextEntryDay = nextEntryDay;
    recurringPaymentEntity.updatedOn = now;
    recurringPaymentEntity.updatedByUserId = userId;
    await manager.save(CustomerRecurringPayment, recurringPaymentEntity);

    return {
      updated: true,
      previousRecordedPaymentDate: previousRecordedPayment
        ? this.toDateKey(previousRecordedPayment.date)
        : null,
      previousNextEntryDay: recurringPayment.nextEntryDay,
      nextEntryDay,
      skippedReason: null,
    };
  }

  private buildCurrentMonthDate(
    startDate: string | null,
    currentDate: string,
  ): string {
    const current = new Date(`${currentDate}T00:00:00Z`);
    const source = new Date(`${startDate || currentDate}T00:00:00Z`);
    const year = current.getUTCFullYear();
    const month = current.getUTCMonth();
    const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const safeDay = Math.min(source.getUTCDate(), lastDayOfMonth);

    return new Date(Date.UTC(year, month, safeDay)).toISOString().slice(0, 10);
  }

  private toDateKey(value: string | Date): string {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    return String(value).slice(0, 10);
  }
}
