import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Location } from '../../../location/entities/location.entity';
import { Invoice } from '../../../invoice/entities/invoice.entity';
import { FinancialSummaryResponseDto, FinancialSummaryDataDto } from '../../dto/financial-summary-dto/financial-summary.response.dto';
import { User } from '../../../user/entities/user.entity';
import { UserProfile } from '../../../user/entities/user-profile.entity';
import { Payment } from '../../../payment/entities/payment.entity';

@Injectable()
export class ActiveOutstandingInvoicesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  async getActiveOutstandingInvoices(
    locationSlug: string,
    page = 1,
    limit = 5,
  ): Promise<FinancialSummaryResponseDto> {
    try {
      const location = await this.locationRepo.findOne({ where: { slug: locationSlug } });
      if (!location) {
        throw new Error(`Location not found: ${locationSlug}`);
      }

      const countQuery = this.invoiceRepo
        .createQueryBuilder('i')
        .leftJoin(User, 'u', 'u.id = i.userId')
        .where('i.locationId = :locationId', { locationId: location.id })
        .andWhere('i.balance > 0')
        .andWhere('i.isDeleted = false')
        .andWhere('i.isCanceled = false')
        .andWhere('i.isVoid = :isVoid', { isVoid: 0 })
        .andWhere('i.type = :type', { type: 2 })
        .andWhere('i.status = :owingStatus', { owingStatus: 1 })
        .andWhere('u.status = :status', { status: 2 });

      const total = await countQuery.getCount();

      const queryBuilder = this.invoiceRepo
        .createQueryBuilder('i')
        .select([
          'i.id as id',
          "CONCAT(COALESCE(up.firstname, ''), ' ', COALESCE(up.lastname, '')) as customerName",
          'i.date as date',
          'i.total as amount',
          'i.balance as balance',
          'u.username as username',
          'ue.email as email',
          'COALESCE(SUM(p.amount), 0) as paidAmount',
        ])
        .leftJoin(User, 'u', 'u.id = i.userId')
        .leftJoin(UserProfile, 'up', 'up.user_id = u.id')
        .leftJoin('user_email', 'ue', 'ue.userContactId = u.id')
        .leftJoin('invoice_payment', 'ip', 'ip.invoice_id = i.id')
        .leftJoin(Payment, 'p', 'p.id = ip.payment_id AND p.isDeleted = false')
        .where('i.locationId = :locationId', { locationId: location.id })
        .andWhere('i.balance > 0')
        .andWhere('i.isDeleted = false')
        .andWhere('i.isCanceled = false')
        .andWhere('i.isVoid = :isVoid', { isVoid: 0 })
        .andWhere('i.type = :type', { type: 2 })
        .andWhere('i.status = :owingStatus', { owingStatus: 1 })
        .andWhere('u.status = :status', { status: 2 })
        .groupBy('i.id, up.firstname, up.lastname, i.date, i.total, i.balance, u.username, ue.email')
        .orderBy('i.id', 'ASC')
        .offset((page - 1) * limit)
        .limit(limit);

      const rows = await queryBuilder.getRawMany();

      const mapped: FinancialSummaryDataDto[] = rows.map((r: any) => {
        const name = (r.customerName || '').trim() || (r.username || '').trim() || (r.email || '').trim();
        return {
          id: String(r.id),
          customerName: name,
          date: new Date(r.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          amount: `$${parseFloat(r.amount || 0).toFixed(2)}`,
          paidAmount: `$${parseFloat(r.paidAmount || 0).toFixed(2)}`,
          balance: `$${parseFloat(r.balance || 0).toFixed(2)}`,
        };
      });

      return {
        title: 'Active Outstanding Invoices',
        body: mapped,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      };
    } catch (error) {
      throw error;
    }
  }
}
