import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../../payment/entities/payment.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { User } from '../../user/entities/user.entity';
import { UserLocation } from '../../user/entities/user-location.entity';

@Injectable()
export class PaymentsReportRepository {
  constructor(
    @InjectRepository(Payment) private readonly paymentRepository: Repository<Payment>,
  ) {}

  async getPaymentsRows(
    locationId: number,
    startDateIso: string,
    endDateIso: string,
    page: number,
    limit: number,
    summaryOnly: boolean,
  ): Promise<{ total: number; rows: any[] }> {
    const baseQuery = this.paymentRepository
      .createQueryBuilder('payment')
      .select([
        'payment.id as paymentId',
        'payment.date as paymentDate',
        'payment.amount as amount',
        'payment.paymentMethodId as paymentMethodId',
        'paymentMethod.name as paymentMethodName',
        'payment.reference as paymentReference',
        'user.id as userId',
        'user.username as publicIdentity',
        `(SELECT up.firstname FROM user_profile up WHERE up.user_id = user.id) AS firstName`,
        `(SELECT up.lastname FROM user_profile up WHERE up.user_id = user.id) AS lastName`,
        `(SELECT GROUP_CONCAT(CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, '')) SEPARATOR ', ')
           FROM student s
          WHERE s.customer_id = user.id AND s.isDeleted = 0) AS studentNames`,
      ])
      .innerJoin(User, 'user', 'user.id = payment.user_id')
      .innerJoin(UserLocation, 'userLocation', 'userLocation.user_id = user.id')
      .leftJoin(PaymentMethod, 'paymentMethod', 'paymentMethod.id = payment.paymentMethodId')
      .where('payment.isDeleted = false')
      .andWhere('userLocation.location_id = :locationId', { locationId })
      .andWhere('payment.paymentMethodId NOT IN (:...excludedMethods)', {
        excludedMethods: [
          PaymentMethod.TYPE_CREDIT_USED,
          PaymentMethod.TYPE_CREDIT_APPLIED,
          PaymentMethod.TYPE_GIFT_CARD,
        ],
      })
      .andWhere('payment.date >= :start AND payment.date <= :end', { start: startDateIso, end: endDateIso })
      .orderBy('payment.date', 'ASC')
      .addOrderBy('payment.paymentMethodId', 'ASC')
      .addOrderBy('payment.id', 'ASC');

    const total = await baseQuery.clone().select('payment.id').getCount();
    const rows = summaryOnly
      ? []
      : await baseQuery
          .offset((page - 1) * limit)
          .limit(limit)
          .getRawMany();

    return { total, rows };
  }

  async getGrandTotal(
    locationId: number,
    startDateIso: string,
    endDateIso: string,
  ): Promise<number> {
    const totalsRow = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'sum')
      .innerJoin(User, 'user', 'user.id = payment.user_id')
      .innerJoin(UserLocation, 'userLocation', 'userLocation.user_id = user.id')
      .where('payment.isDeleted = false')
      .andWhere('userLocation.location_id = :locationId', { locationId })
      .andWhere('payment.paymentMethodId NOT IN (:...excludedMethods)', {
        excludedMethods: [
          PaymentMethod.TYPE_CREDIT_USED,
          PaymentMethod.TYPE_CREDIT_APPLIED,
          PaymentMethod.TYPE_GIFT_CARD,
        ],
      })
      .andWhere('payment.date >= :start AND payment.date <= :end', { start: startDateIso, end: endDateIso })
      .getRawOne();

    return parseFloat(totalsRow?.sum || 0);
  }

  async getSummaryRows(
    locationId: number,
    startDateIso: string,
    endDateIso: string,
  ): Promise<any[]> {
    // summary by date and payment method
    const qb = this.paymentRepository
      .createQueryBuilder('payment')
      .select([
        "DATE_FORMAT(payment.date, '%W, %M %D, %Y') AS paymentDateLabel",
        'paymentMethod.name AS paymentMethodName',
        'COALESCE(SUM(payment.amount), 0) AS amount',
      ])
      .innerJoin(User, 'user', 'user.id = payment.user_id')
      .innerJoin(UserLocation, 'userLocation', 'userLocation.user_id = user.id')
      .leftJoin(PaymentMethod, 'paymentMethod', 'paymentMethod.id = payment.paymentMethodId')
      .where('payment.isDeleted = false')
      .andWhere('userLocation.location_id = :locationId', { locationId })
      .andWhere('payment.paymentMethodId NOT IN (:...excludedMethods)', {
        excludedMethods: [
          PaymentMethod.TYPE_CREDIT_USED,
          PaymentMethod.TYPE_CREDIT_APPLIED,
          PaymentMethod.TYPE_GIFT_CARD,
        ],
      })
      .andWhere('payment.date >= :start AND payment.date <= :end', { start: startDateIso, end: endDateIso })
      .groupBy('paymentDateLabel')
      .addGroupBy('paymentMethod.name')
      .orderBy('MIN(payment.date)', 'ASC')
      .addOrderBy('paymentMethod.name', 'ASC');

    return qb.getRawMany();
  }
}

