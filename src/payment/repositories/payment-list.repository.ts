import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../entities/payment.entity';
import { PaymentMethodType } from '../enums/payment-method-type.enum';
import { LocationService } from 'src/location/services/location.service';

@Injectable()
export class PaymentListRepository {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly locationService: LocationService,
  ) {}

  /**
   * Get all payments by location slug with optional date range and pagination
   */
  async getPaymentsByLocationSlug(
    locationSlug: string,
    options: {
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
      number?: string;
      customer?: string;
      paymentMethod?: string;
      amount?: number;
      sortBy?: 'number' | 'date' | 'customer' | 'paymentMethod' | 'amount';
      sortOrder?: 'asc' | 'desc';
    } = {},
  ): Promise<{ payments: Payment[]; total: number }> {
    const {
      startDate,
      endDate,
      page = 1,
      limit = 20,
      number,
      customer,
      paymentMethod,
      amount,
      sortBy = 'number',
      sortOrder = 'asc',
    } = options;

    // Get location ID first (like legacy)
    const locationId = await this.locationService.getLocationId(locationSlug);
    if (!locationId) {
      throw new NotFoundException(`Location with slug "${locationSlug}" not found`);
    }
  
    const qb = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.user', 'user')
      .leftJoin('user.userLocation', 'userLocation')
      .leftJoinAndSelect('user.profile', 'userProfile')
      .leftJoinAndSelect('payment.paymentMethod', 'paymentMethod')
      .where('payment.isDeleted = false')
      .andWhere('userLocation.locationId = :locationId', { locationId })
      // Excludes TYPE_CREDIT_USED (2) AND TYPE_CREDIT_APPLIED (3)
      .andWhere('payment.paymentMethodId NOT IN (:...excludedMethods)', {
        excludedMethods: [PaymentMethodType.CREDIT_USED, PaymentMethodType.CREDIT_APPLIED],
      })
      // Select concatenated customer name as a computed column to allow ordering by alias
      .addSelect("CONCAT(userProfile.firstname, ' ', userProfile.lastname)", 'customerFullName');
  
    // Date filtering - use BETWEEN when both dates provided, otherwise >= or <=
    // Dates are guaranteed to be in YYYY-MM-DD format from service
    if (startDate && endDate) {
      qb.andWhere('DATE(payment.date) BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else {
      if (startDate) {
        qb.andWhere('DATE(payment.date) >= DATE(:startDate)', { startDate });
      }
      if (endDate) {
        qb.andWhere('DATE(payment.date) <= DATE(:endDate)', { endDate });
      }
    }
  
    // Apply filters using array pattern (same as customer repository)
    const trimmedNumber = number?.trim();
    const trimmedCustomer = customer?.trim();
    const trimmedPaymentMethod = paymentMethod?.trim();
    
    // Extract payment ID from "P-123" format or use numeric ID directly
    let paymentId: number | null = null;
    if (trimmedNumber) {
      // Check if it's in "P-123" format
      const pFormatMatch = trimmedNumber.match(/^P-(\d+)$/i);
      if (pFormatMatch) {
        paymentId = Number(pFormatMatch[1]);
      } else if (/^\d+$/.test(trimmedNumber)) {
        // Pure numeric ID
        paymentId = Number(trimmedNumber);
      }
    }
    
    const filterPayments = [
      {
        condition: paymentId !== null,
        query: 'payment.id = :pid',
        params: { pid: paymentId! },
      },
      {
        condition: trimmedCustomer,
        query: "CONCAT(userProfile.firstname, ' ', userProfile.lastname) LIKE :cust",
        params: { cust: `%${trimmedCustomer!}%` },
      },
      {
        condition: trimmedPaymentMethod,
        query: 'paymentMethod.name = :pmname',
        params: { pmname: trimmedPaymentMethod! },
      },
      {
        condition: typeof amount === 'number',
        query: 'payment.amount LIKE :amt',
        params: { amt: `%${amount}%` },
      },
    ];

    filterPayments.forEach(({ condition, query: queryString, params }) => {
      if (condition) {
        qb.andWhere(queryString, params);
      }
    });
  
    // Apply sorting using mapping pattern (same as customer repository)
    const sortMapping: Record<string, string> = {
      number: 'payment.id',
      date: 'payment.date',
      // Use the computed select alias for stable ordering
      customer: 'customerFullName',
      paymentMethod: 'paymentMethod.name',
      amount: 'payment.amount',
    };
    
    // Determine the effective sort key, defaulting to 'number'
    const finalSortBy = (sortBy && sortBy in sortMapping) ? sortBy : 'number';
    const sortField = sortMapping[finalSortBy];
    
    // Determine the effective sort order, defaulting to 'ASC'
    const finalSortOrder = (sortOrder?.toUpperCase() === 'DESC') ? 'DESC' : 'ASC';
    
    qb.orderBy(sortField, finalSortOrder);
  
    // Apply pagination
    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);
  
    try {
      const [payments, total] = await qb.getManyAndCount();
      return { payments, total };
    } catch (error) {
      console.error('Error in getPaymentsByLocationSlug repository:', error);
      console.error('Query SQL:', qb.getSql());
      console.error('Query Parameters:', qb.getParameters());
      throw error;
    }
  }
}

