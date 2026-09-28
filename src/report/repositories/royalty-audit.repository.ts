import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { RoyaltyTransaction } from '../../payment/entities/royalty-transaction.entity';
import { User } from '../../user/entities/user.entity';
import { UserProfile } from '../../user/entities/user-profile.entity';
import { RoyaltyAuditRequestDto } from '../dto/royalty-audit/royalty-audit.request.dto';

export interface RoyaltyAuditRawRow {
  id: string | number;
  effectiveDate: Date | string;
  eventType: string;
  locationId: string | number;
  customerId: string | number;
  customerUsername: string | null;
  customerFirstname: string | null;
  customerLastname: string | null;
  paymentId: string | number | null;
  originalPaymentId: string | number | null;
  categoryId: string | number;
  categoryName: string;
  rateApplied: string | number;
  paymentAmount: string | number;
  revenueAmount: string | number;
  taxAmount: string | number;
  royaltyAmount: string | number;
  royaltyFree: string | number | boolean;
  sourceType: string;
  sourceId: string | number | null;
  relatedRoyaltyTransactionId: string | number | null;
  eventGroupId: string | null;
  reason: string | null;
  createdByUserId: string | number | null;
  actorUsername: string | null;
  actorFirstname: string | null;
  actorLastname: string | null;
  createdOn: Date | string | null;
}

export interface RoyaltyAuditRawTotals {
  paymentAmount: string | number | null;
  revenueAmount: string | number | null;
  taxAmount: string | number | null;
  royaltyAmount: string | number | null;
}

@Injectable()
export class RoyaltyAuditRepository {
  constructor(
    @InjectRepository(RoyaltyTransaction)
    private readonly royaltyTransactionRepository: Repository<RoyaltyTransaction>,
  ) {}

  async findEntries(
    locationId: number,
    query: RoyaltyAuditRequestDto,
  ): Promise<{
    rows: RoyaltyAuditRawRow[];
    totals: RoyaltyAuditRawTotals;
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const filteredQuery = this.buildFilteredQuery(locationId, query);

    const [rows, total, totals] = await Promise.all([
      filteredQuery
        .clone()
        .select('royaltyTransaction.id', 'id')
        .addSelect('royaltyTransaction.effectiveDate', 'effectiveDate')
        .addSelect('royaltyTransaction.eventType', 'eventType')
        .addSelect('royaltyTransaction.locationId', 'locationId')
        .addSelect('royaltyTransaction.customerId', 'customerId')
        .addSelect('customer.username', 'customerUsername')
        .addSelect('customerProfile.firstname', 'customerFirstname')
        .addSelect('customerProfile.lastname', 'customerLastname')
        .addSelect('royaltyTransaction.paymentId', 'paymentId')
        .addSelect('royaltyTransaction.originalPaymentId', 'originalPaymentId')
        .addSelect('royaltyTransaction.itemCategoryId', 'categoryId')
        .addSelect('royaltyTransaction.categoryName', 'categoryName')
        .addSelect('royaltyTransaction.rateApplied', 'rateApplied')
        .addSelect('royaltyTransaction.paymentAmount', 'paymentAmount')
        .addSelect('royaltyTransaction.revenueAmount', 'revenueAmount')
        .addSelect('royaltyTransaction.taxAmount', 'taxAmount')
        .addSelect('royaltyTransaction.royaltyAmount', 'royaltyAmount')
        .addSelect('royaltyTransaction.royaltyFree', 'royaltyFree')
        .addSelect('royaltyTransaction.sourceType', 'sourceType')
        .addSelect('royaltyTransaction.sourceId', 'sourceId')
        .addSelect(
          'royaltyTransaction.relatedRoyaltyTransactionId',
          'relatedRoyaltyTransactionId',
        )
        .addSelect('royaltyTransaction.eventGroupId', 'eventGroupId')
        .addSelect('royaltyTransaction.reason', 'reason')
        .addSelect('royaltyTransaction.createdByUserId', 'createdByUserId')
        .addSelect('actor.username', 'actorUsername')
        .addSelect('actorProfile.firstname', 'actorFirstname')
        .addSelect('actorProfile.lastname', 'actorLastname')
        .addSelect('royaltyTransaction.createdOn', 'createdOn')
        .orderBy('royaltyTransaction.effectiveDate', 'DESC')
        .addOrderBy('royaltyTransaction.id', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getRawMany<RoyaltyAuditRawRow>(),
      filteredQuery.clone().getCount(),
      filteredQuery
        .clone()
        .select(
          'COALESCE(SUM(royaltyTransaction.paymentAmount), 0)',
          'paymentAmount',
        )
        .addSelect(
          'COALESCE(SUM(royaltyTransaction.revenueAmount), 0)',
          'revenueAmount',
        )
        .addSelect(
          'COALESCE(SUM(royaltyTransaction.taxAmount), 0)',
          'taxAmount',
        )
        .addSelect(
          'COALESCE(SUM(royaltyTransaction.royaltyAmount), 0)',
          'royaltyAmount',
        )
        .getRawOne<RoyaltyAuditRawTotals>(),
    ]);

    return {
      rows,
      totals: totals || {
        paymentAmount: 0,
        revenueAmount: 0,
        taxAmount: 0,
        royaltyAmount: 0,
      },
      total,
      page,
      limit,
    };
  }

  private buildFilteredQuery(
    locationId: number,
    query: RoyaltyAuditRequestDto,
  ): SelectQueryBuilder<RoyaltyTransaction> {
    const builder = this.royaltyTransactionRepository
      .createQueryBuilder('royaltyTransaction')
      .leftJoin(User, 'customer', 'customer.id = royaltyTransaction.customerId')
      .leftJoin(
        UserProfile,
        'customerProfile',
        'customerProfile.userId = royaltyTransaction.customerId',
      )
      .leftJoin(User, 'actor', 'actor.id = royaltyTransaction.createdByUserId')
      .leftJoin(
        UserProfile,
        'actorProfile',
        'actorProfile.userId = royaltyTransaction.createdByUserId',
      )
      .where('royaltyTransaction.locationId = :locationId', { locationId });

    if (query.eventType) {
      builder.andWhere('royaltyTransaction.eventType = :eventType', {
        eventType: query.eventType,
      });
    }
    if (query.sourceType) {
      builder.andWhere('royaltyTransaction.sourceType = :sourceType', {
        sourceType: query.sourceType,
      });
    }
    if (query.customerId) {
      builder.andWhere('royaltyTransaction.customerId = :customerId', {
        customerId: query.customerId,
      });
    }
    if (query.paymentId) {
      builder.andWhere(
        `(royaltyTransaction.paymentId = :paymentId
          OR royaltyTransaction.originalPaymentId = :paymentId)`,
        { paymentId: query.paymentId },
      );
    }
    if (query.startDate) {
      builder.andWhere('royaltyTransaction.effectiveDate >= :startDate', {
        startDate: query.startDate,
      });
    }
    if (query.endDate) {
      builder.andWhere('royaltyTransaction.effectiveDate < :endDateExclusive', {
        endDateExclusive: this.nextDate(query.endDate),
      });
    }
    if (query.q) {
      builder.andWhere(
        `(royaltyTransaction.categoryName LIKE :search
          OR royaltyTransaction.reason LIKE :search
          OR royaltyTransaction.eventType LIKE :search
          OR royaltyTransaction.sourceType LIKE :search
          OR customer.username LIKE :search
          OR customerProfile.firstname LIKE :search
          OR customerProfile.lastname LIKE :search
          OR CAST(royaltyTransaction.id AS CHAR) LIKE :search
          OR CAST(royaltyTransaction.customerId AS CHAR) LIKE :search
          OR CAST(royaltyTransaction.paymentId AS CHAR) LIKE :search
          OR CAST(royaltyTransaction.originalPaymentId AS CHAR) LIKE :search)`,
        { search: `%${query.q}%` },
      );
    }

    return builder;
  }

  private nextDate(date: string): string {
    const next = new Date(`${date}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString().slice(0, 10);
  }
}
