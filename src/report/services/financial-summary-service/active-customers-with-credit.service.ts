import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Location } from '../../../location/entities/location.entity';
import { Invoice } from '../../../invoice/entities/invoice.entity';
import { FinancialSummaryResponseDto, FinancialSummaryDataDto } from '../../dto/financial-summary-dto/financial-summary.response.dto';
import { User } from '../../../user/entities/user.entity';
import { UserProfile } from '../../../user/entities/user-profile.entity';

@Injectable()
export class ActiveCustomersWithCreditService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  async getActiveCustomersWithCredit(
    locationSlug: string,
    page = 1,
    limit = 5,
  ): Promise<FinancialSummaryResponseDto> {
    try {
      const location = await this.locationRepo.findOne({ where: { slug: locationSlug } });
      if (!location) {
        throw new Error(`Location not found: ${locationSlug}`);
      }

      const queryBuilder = this.dataSource
        .createQueryBuilder()
        .select([
          'ca.customerId as customerId',
          "CONCAT(COALESCE(up.firstname, ''), ' ', COALESCE(up.lastname, '')) as customerName",
          'ca.balance as balance',
        ])
        .from('customer_account', 'ca')
        .innerJoin(User, 'u', 'u.id = ca.customerId')
        .leftJoin(UserProfile, 'up', 'up.user_id = u.id')
        .innerJoin('user_location', 'ul', 'ul.user_id = ca.customerId')
        .where('ul.location_id = :locationId', { locationId: location.id })
        .andWhere('ca.balance < 0')
        .andWhere('u.status = :status', { status: 2 })
        .groupBy('ca.customerId')
        .orderBy('ca.customerId', 'ASC');

      const total = await queryBuilder.getCount();
      const rows = await queryBuilder.offset((page - 1) * limit).limit(limit).getRawMany();

      const mapped: FinancialSummaryDataDto[] = rows.map((r: any) => ({
        customerId: String(r.customerId),
        customerName: (r.customerName || '').trim(),
        balance: `$${parseFloat(r.balance || 0).toFixed(2)}`,
      }));

      return {
        title: 'Active Customers With Credit',
        body: mapped,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      };
    } catch (error) {
      throw error;
    }
  }
}
