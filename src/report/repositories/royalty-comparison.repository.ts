import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../../payment/entities/payment.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { RoyaltyTransaction } from '../../payment/entities/royalty-transaction.entity';
import { RoyaltyTransactionEventType } from '../../payment/enums/royalty-transaction.enum';
import { User } from '../../user/entities/user.entity';
import { UserLocation } from '../../user/entities/user-location.entity';
import { UserProfile } from '../../user/entities/user-profile.entity';

export interface UnclassifiedHistoricalCreditItem {
  paymentId: number;
  customerId: number;
  customerName: string;
  paymentDate: string;
  createdOn: string | null;
  paymentMethod: string;
  amount: number;
}

export interface UnclassifiedHistoricalCredits {
  count: number;
  totalAmount: number;
  items: UnclassifiedHistoricalCreditItem[];
  hasMore: boolean;
}

/**
 * Read-only queries used by the temporary royalty comparison screen.
 * Keeping them here prevents comparison concerns from entering the Phase 1
 * RoyaltyReportRepository.
 */
@Injectable()
export class RoyaltyComparisonRepository {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  async getUnclassifiedHistoricalCredits(
    locationId: number,
    startDate: string,
    endDate: string,
    detailLimit = 50,
  ): Promise<UnclassifiedHistoricalCredits> {
    const recognizedEvents = [
      RoyaltyTransactionEventType.PAYMENT_RECEIVED,
      RoyaltyTransactionEventType.OPENING_CREDIT,
    ];
    const excludedMethods = [
      PaymentMethod.TYPE_ACCOUNT_ENTRY,
      PaymentMethod.TYPE_CREDIT_USED,
      PaymentMethod.TYPE_CREDIT_APPLIED,
      PaymentMethod.TYPE_GIFT_CARD,
    ];

    const baseQuery = this.paymentRepository
      .createQueryBuilder('payment')
      .innerJoin(User, 'user', 'user.id = payment.user_id')
      .innerJoin(UserLocation, 'userLocation', 'userLocation.user_id = user.id')
      .innerJoin(
        PaymentMethod,
        'paymentMethod',
        'paymentMethod.id = payment.payment_method_id',
      )
      .leftJoin(UserProfile, 'profile', 'profile.user_id = user.id')
      .leftJoin(
        RoyaltyTransaction,
        'initialRoyalty',
        'initialRoyalty.paymentId = payment.id AND initialRoyalty.eventType IN (:...recognizedEvents)',
        { recognizedEvents },
      )
      .where('payment.isDeleted = false')
      .andWhere('userLocation.location_id = :locationId', { locationId })
      .andWhere('payment.amount > 0')
      .andWhere('payment.balance >= :minimumBalance', { minimumBalance: 0.005 })
      .andWhere('payment.payment_method_id NOT IN (:...excludedMethods)', {
        excludedMethods,
      })
      .andWhere('DATE(payment.date) BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('initialRoyalty.id IS NULL');

    const [summary, rows] = await Promise.all([
      baseQuery
        .clone()
        .select('COUNT(DISTINCT payment.id)', 'count')
        .addSelect('COALESCE(SUM(payment.balance), 0)', 'totalAmount')
        .getRawOne<{ count: string | number; totalAmount: string | number }>(),
      baseQuery
        .clone()
        .select('payment.id', 'paymentId')
        .addSelect('user.id', 'customerId')
        .addSelect(
          `COALESCE(
            NULLIF(TRIM(CONCAT(COALESCE(profile.firstname, ''), ' ', COALESCE(profile.lastname, ''))), ''),
            NULLIF(user.username, ''),
            CONCAT('Customer ', user.id)
          )`,
          'customerName',
        )
        .addSelect("DATE_FORMAT(payment.date, '%Y-%m-%d')", 'paymentDate')
        .addSelect('payment.createdOn', 'createdOn')
        .addSelect('paymentMethod.name', 'paymentMethod')
        .addSelect('payment.balance', 'amount')
        .orderBy('payment.date', 'ASC')
        .addOrderBy('payment.id', 'ASC')
        .limit(detailLimit)
        .getRawMany<{
          paymentId: string | number;
          customerId: string | number;
          customerName: string;
          paymentDate: string;
          createdOn: Date | string | null;
          paymentMethod: string;
          amount: string | number;
        }>(),
    ]);

    const count = Number(summary?.count || 0);
    const items = rows.map((row) => ({
      paymentId: Number(row.paymentId),
      customerId: Number(row.customerId),
      customerName: row.customerName,
      paymentDate: row.paymentDate,
      createdOn: row.createdOn
        ? row.createdOn instanceof Date
          ? row.createdOn.toISOString()
          : String(row.createdOn)
        : null,
      paymentMethod: row.paymentMethod,
      amount: Number(row.amount || 0),
    }));

    return {
      count,
      totalAmount: Number(summary?.totalAmount || 0),
      items,
      hasMore: count > items.length,
    };
  }
}
