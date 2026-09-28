import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Location } from '../../../location/entities/location.entity';
import { Invoice } from '../../../invoice/entities/invoice.entity';
import { FinancialSummaryResponseDto, FinancialSummaryDataDto } from '../../dto/financial-summary-dto/financial-summary.response.dto';
import { formatLegacyNaiveDateTimeString, formatDuration, getEasternDayBounds } from '../../../utils/formatters';
import { RoundingUtils } from '../../../utils/rounding.utils';

@Injectable()
export class PaidUnscheduledPrivateLessonsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  async getPaidUnscheduledPrivateLessons(
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
        'lesson.id as id',
        "CONCAT(COALESCE(student.firstName, ''), ' ', COALESCE(student.lastName, '')) as studentName",
        "CONCAT(COALESCE(user_profile.firstname, ''), ' ', COALESCE(user_profile.lastname, '')) as customerName",
        "DATE_FORMAT(lesson.date, '%Y-%m-%d %H:%i:%s') as date",
        'lesson.duration as duration',
        'private_lesson.total as amount',
        'private_lesson.balance as balance',
        'COALESCE(SUM(lesson_payment.amount), 0) as paidAmount',
      ])
      .from('lesson', 'lesson')
      .leftJoin('private_lesson', 'private_lesson', 'private_lesson.lessonId = lesson.id')
      .leftJoin('lesson_payment', 'lesson_payment', 'lesson_payment.lessonId = lesson.id')
      .innerJoin('course', 'course', 'course.id = lesson.courseId')
      .innerJoin('program', 'program', 'program.id = course.programId')
      .leftJoin('enrolment', 'enrolment', 'enrolment.courseId = lesson.courseId')
      .leftJoin('student', 'student', 'student.id = enrolment.studentId')
      .leftJoin('user', 'user', 'user.id = student.customerId')
      .leftJoin('user_profile', 'user_profile', 'user_profile.user_id = user.id')
      .where('course.locationId = :locationId', { locationId: location.id })
      .andWhere('lesson.date < :currentDate', { currentDate: currentDateStr })
      .andWhere('lesson.isDeleted = false')
      .andWhere('course.isDeleted = false')
      .andWhere('program.type = :type', { type: 1 })
      .andWhere('lesson.isConfirmed = true')
      .andWhere('lesson.status != :canceledStatus', { canceledStatus: 4 })
      .andWhere('lesson.status = :unscheduledStatus', { unscheduledStatus: 5 })
      .andWhere('lesson.status != :expiredStatus', { expiredStatus: 10 })
      .andWhere('lesson_payment.lessonId IS NOT NULL')
      .andWhere('DATE(private_lesson.expiryDate) > :currentDate', { currentDate: currentDateStr })
      .groupBy('lesson.id')
      .orderBy('lesson.id', 'ASC');

      const total = await queryBuilder.getCount();


      const rows = await queryBuilder.offset((page - 1) * limit).limit(limit).getRawMany();

      const mapped: FinancialSummaryDataDto[] =rows.map((r: any) => {
        const balance = parseFloat(r.balance || 0);
        const finalBalance = RoundingUtils.applyBalanceTolerance(balance);

        return {
          id: String(r.id),
          studentName: (r.studentName || '').trim(),
          customerName: (r.customerName || '').trim(),
          date: formatLegacyNaiveDateTimeString(String(r.date)),
          duration: formatDuration(r.duration),
          amount: RoundingUtils.formatCurrencyNoTolerance(parseFloat(r.amount || 0)),
          paidAmount: RoundingUtils.formatCurrencyNoTolerance(parseFloat(r.paidAmount || 0)),
          balance: RoundingUtils.formatCurrency(finalBalance),
        };
      });

      return {
        title: 'Paid Unscheduled Private Lessons',
        body: mapped,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      };
    } catch (error) {
      throw error;
    }
  }
}
