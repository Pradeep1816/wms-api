import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Location } from '../../../location/entities/location.entity';
import { Invoice } from '../../../invoice/entities/invoice.entity';
import { FinancialSummaryResponseDto, FinancialSummaryDataDto } from '../../dto/financial-summary-dto/financial-summary.response.dto';
import { formatLegacyNaiveDateTimeString, formatDuration } from '../../../utils/formatters';

@Injectable()
export class PaidUnscheduledGroupLessonsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  async getPaidUnscheduledGroupLessons(
    locationSlug: string,
    goToDate?: string,
    page = 1,
    limit = 5,
  ): Promise<FinancialSummaryResponseDto> {
    try {
      const location = await this.locationRepo.findOne({ where: { slug: locationSlug } });
      if (!location) {
        throw new Error(`Location not found: ${locationSlug}`);
      }

      const currentDate = goToDate ? new Date(goToDate) : new Date();
      const currentDateStr = currentDate.toISOString().slice(0, 10);

      const queryBuilder = this.dataSource
        .createQueryBuilder()
        .select([
          'gl.id as id',
          'gl.lessonId as lessonId',
          "CONCAT(COALESCE(s.firstName, ''), ' ', COALESCE(s.lastName, '')) as studentName",
          "CONCAT(COALESCE(up.firstname, ''), ' ', COALESCE(up.lastname, '')) as customerName",
          "DATE_FORMAT(l.date, '%Y-%m-%d %H:%i:%s') as date",
          'l.duration as duration',
          'gl.total as amount',
          'gl.balance as balance',
        ])
        .from('group_lesson', 'gl')
        .innerJoin('lesson', 'l', 'l.id = gl.lessonId')
        .innerJoin('enrolment', 'e', 'e.id = gl.enrolmentId')
        .innerJoin('student', 's', 's.id = e.studentId')
        .innerJoin('user', 'u', 'u.id = s.customerId')
        .leftJoin('user_profile', 'up', 'up.user_id = u.id')
        .innerJoin('course', 'c', 'c.id = l.courseId')
        .where('c.locationId = :locationId', { locationId: location.id })
        .andWhere('DATE(l.date) < :currentDate', { currentDate: currentDateStr })
        .andWhere('l.isDeleted = false')
        .andWhere('gl.isDeleted = false')
        .andWhere('e.isDeleted = false')
        .andWhere('s.isDeleted = false')
        .andWhere('u.isDeleted = false')
        .andWhere('gl.total != 0')
        .andWhere('l.status = :unscheduledStatus', { unscheduledStatus: 5 })
        .andWhere('(gl.paidStatus = :paidStatus OR (gl.paidStatus = :owingStatus AND gl.balance != gl.total))', {
          paidStatus: 1,
          owingStatus: 2,
        })
        .andWhere('gl.balance < gl.total')
        .orderBy('l.id', 'ASC');

      const total = await queryBuilder.getCount();
      const rows = await queryBuilder.offset((page - 1) * limit).limit(limit).getRawMany();

      const mapped: FinancialSummaryDataDto[] = rows.map((r: any) => ({
        id: String(r.lessonId),
        studentName: (r.studentName || '').trim(),
        customerName: (r.customerName || '').trim(),
        date: formatLegacyNaiveDateTimeString(String(r.date)),
        duration: formatDuration(r.duration),
        amount: `$${parseFloat(r.amount || 0).toFixed(2)}`,
        paidAmount: `$${(parseFloat(r.amount || 0) - parseFloat(r.balance || 0)).toFixed(2)}`,
        balance: `$${parseFloat(r.balance || 0).toFixed(2)}`,
      }));

      return {
        title: 'Paid Unscheduled Group Lessons',
        body: mapped,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      };
    } catch (error) {
      throw error;
    }
  }
}
