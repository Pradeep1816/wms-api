import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from '../../location/entities/location.entity';
import { RoundingUtils } from '../../utils/rounding.utils';
import { RoyaltyAuditRequestDto } from '../dto/royalty-audit/royalty-audit.request.dto';
import {
  RoyaltyAuditActorDto,
  RoyaltyAuditResponseDto,
  RoyaltyAuditRowDto,
} from '../dto/royalty-audit/royalty-audit.response.dto';
import {
  RoyaltyAuditRawRow,
  RoyaltyAuditRepository,
} from '../repositories/royalty-audit.repository';

@Injectable()
export class RoyaltyAuditService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    private readonly royaltyAuditRepository: RoyaltyAuditRepository,
  ) {}

  async getEntries(
    locationSlug: string,
    query: RoyaltyAuditRequestDto,
  ): Promise<RoyaltyAuditResponseDto> {
    const location = await this.locationRepository.findOne({
      where: { slug: locationSlug, isDeleted: false },
    });
    if (!location) {
      throw new NotFoundException('Location not found');
    }

    const result = await this.royaltyAuditRepository.findEntries(
      location.id,
      query,
    );

    return {
      body: result.rows.map((row) => this.mapRow(row)),
      totals: {
        paymentAmount: this.money(result.totals.paymentAmount, 4),
        revenueAmount: this.money(result.totals.revenueAmount, 4),
        taxAmount: this.money(result.totals.taxAmount, 4),
        royaltyAmount: this.money(result.totals.royaltyAmount, 2),
      },
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
      },
      meta: {
        locationId: location.id,
        locationName: location.name,
        locationSlug: location.slug,
      },
    };
  }

  private mapRow(row: RoyaltyAuditRawRow): RoyaltyAuditRowDto {
    return {
      id: Number(row.id),
      effectiveDate: new Date(row.effectiveDate).toISOString(),
      eventType: row.eventType,
      locationId: Number(row.locationId),
      customerId: Number(row.customerId),
      customerName: this.displayName(
        row.customerFirstname,
        row.customerLastname,
        row.customerUsername,
        `Customer #${row.customerId}`,
      ),
      paymentId: this.nullableNumber(row.paymentId),
      originalPaymentId: this.nullableNumber(row.originalPaymentId),
      categoryId: Number(row.categoryId),
      categoryName: row.categoryName,
      rateApplied: this.money(row.rateApplied, 2),
      paymentAmount: this.money(row.paymentAmount, 4),
      revenueAmount: this.money(row.revenueAmount, 4),
      taxAmount: this.money(row.taxAmount, 4),
      royaltyAmount: this.money(row.royaltyAmount, 2),
      royaltyFree: Boolean(Number(row.royaltyFree)),
      sourceType: row.sourceType,
      sourceId: this.nullableNumber(row.sourceId),
      relatedRoyaltyTransactionId: this.nullableNumber(
        row.relatedRoyaltyTransactionId,
      ),
      eventGroupId: row.eventGroupId || null,
      reason: row.reason || null,
      actor: this.mapActor(row),
      createdOn: row.createdOn
        ? new Date(row.createdOn).toISOString()
        : null,
    };
  }

  private mapActor(row: RoyaltyAuditRawRow): RoyaltyAuditActorDto | null {
    const actorId = this.nullableNumber(row.createdByUserId);
    if (!actorId) return null;

    return {
      id: actorId,
      displayName:
        actorId === 727
          ? 'SMW Bot'
          : this.displayName(
              row.actorFirstname,
              row.actorLastname,
              row.actorUsername,
              `User #${actorId}`,
            ),
      username: row.actorUsername || null,
    };
  }

  private displayName(
    firstName: string | null,
    lastName: string | null,
    username: string | null,
    fallback: string,
  ): string {
    const fullName = [firstName, lastName]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(' ')
      .trim();
    return fullName || username || fallback;
  }

  private nullableNumber(value: string | number | null): number | null {
    if (value === null || value === undefined || value === '') return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private money(value: unknown, precision: number): string {
    return RoundingUtils.roundHalfUp(Number(value || 0), precision).toFixed(
      precision,
    );
  }
}
