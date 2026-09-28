import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerRecurringPayment } from '../entities/customer-recurring-payment.entity';

@Injectable()
export class RecurringPaymentsRepository {
  constructor(
    @InjectRepository(CustomerRecurringPayment)
    private readonly recurringPaymentRepository: Repository<CustomerRecurringPayment>,
  ) {}

  /**
   * Get all recurring payments by location ID
   */
  async getRecurringPaymentsByLocationId(
    locationId: number,
    options: {
      page?: number;
      limit?: number;
      showActive?: boolean;
      showInactive?: boolean;
      sortBy?: 'customer' | 'expiryDate';
      sortOrder?: 'asc' | 'desc';
    } = {},
  ): Promise<{ recurringPayments: CustomerRecurringPayment[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      showActive = false,
      showInactive = false,
      sortBy = 'expiryDate',
      sortOrder = 'asc',
    } = options;
  
    const qb = this.recurringPaymentRepository
      .createQueryBuilder('recurringPayment')
      .leftJoinAndSelect('recurringPayment.customer', 'customer')
      .leftJoin('customer.userLocation', 'userLocation')
      .leftJoinAndSelect('customer.profile', 'profile')
      .leftJoinAndSelect('recurringPayment.paymentMethod', 'paymentMethod')
      .leftJoinAndSelect('recurringPayment.paymentFrequency', 'paymentFrequency')
      .where('recurringPayment.isDeleted = false')
      .andWhere('userLocation.locationId = :locationId', { locationId });
  
    // Apply active/inactive filters
    if (showActive && !showInactive) {
      qb.andWhere('recurringPayment.isRecurringPaymentEnabled = :enabled', { enabled: true });
    } else if (!showActive && showInactive) {
      qb.andWhere('recurringPayment.isRecurringPaymentEnabled = :enabled', { enabled: false });
    }
  
    // Apply sorting using mapping
    const sortOrderUpper = sortOrder.toUpperCase() as 'ASC' | 'DESC';
    
    const sortFieldMapping: Record<
      'customer' | 'expiryDate',
      { primary: string; secondary: string }
    > = {
      customer: {
        primary: 'profile.firstname',
        secondary: 'profile.lastname',
      },
      expiryDate: {
        primary: 'recurringPayment.expiryDate',
        secondary: 'recurringPayment.nextEntryDay',
      },
    };

    const sortFields = sortFieldMapping[sortBy] || sortFieldMapping.expiryDate;

    qb.orderBy(sortFields.primary, sortOrderUpper).addOrderBy(
      sortFields.secondary,
      sortOrderUpper,
    );
  
    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);
  
    try {
      const [recurringPayments, total] = await qb.getManyAndCount();
      return { recurringPayments, total };
    } catch (error) {
      console.error('Error in getRecurringPaymentsByLocationId repository:', error);
      console.error('Query SQL:', qb.getSql());
      console.error('Query Parameters:', qb.getParameters());
      throw error;
    }
  }
}

