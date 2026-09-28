import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Location } from '../../../location/entities/location.entity';
import { Invoice } from '../../../invoice/entities/invoice.entity';
import { FinancialSummaryResponseDto, FinancialSummaryDataDto } from '../../dto/financial-summary-dto/financial-summary.response.dto';
import { FinancialSummarySummaryResponseDto, FinancialSummarySummaryItemDto } from '../../dto/financial-summary-dto/financial-summary-summary.dto';
import { formatLegacyNaiveDateTimeString, formatDuration } from '../../../utils/formatters';

@Injectable()
export class PrepaidFuturePrivateLessonsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  async getPrepaidFuturePrivateLessons(
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
          // Match legacy system logic: use user_profile if available, otherwise username, otherwise email
          "COALESCE(CONCAT(COALESCE(user_profile.firstname, ''), ' ', COALESCE(user_profile.lastname, '')), user.username, user_email.email) as customerName",
          "DATE_FORMAT(lesson.date, '%Y-%m-%d %H:%i:%s') as date",
          'lesson.duration as duration',
          'MAX(private_lesson.total) as amount', // Use MAX to get the value when grouping
          'MAX(private_lesson.balance) as balance', // Use MAX to get the value when grouping
          'SUM(COALESCE(lesson_payment.amount, 0)) as paidAmount', // Sum all payments for this lesson
        ])
        .from('lesson', 'lesson')
        // Use leftJoin to match legacy system behavior
        // Legacy system uses hasOne relationship which gets ANY matching enrolment (first one found)
        // Add a subquery to get just ONE enrolment per course (the one with lowest ID)
        .leftJoin(
          'enrolment', 
          'enrolment', 
          'enrolment.courseId = lesson.courseId AND enrolment.id = (SELECT MIN(e2.id) FROM enrolment e2 WHERE e2.courseId = lesson.courseId AND e2.isDeleted = 0)'
        )
        .leftJoin('student', 'student', 'student.id = enrolment.studentId')
        .leftJoin('user', 'user', 'user.id = student.customerId')
        .leftJoin('user_profile', 'user_profile', 'user_profile.user_id = user.id') 
        .leftJoin('user_email', 'user_email', 'user_email.id = user.id AND user_email.isDeleted = 0')
        .leftJoin('private_lesson', 'private_lesson', 'private_lesson.lessonId = lesson.id')
        .leftJoin('lesson_payment', 'lesson_payment', 'lesson_payment.lessonId = lesson.id AND lesson_payment.isDeleted = 0')
        .leftJoin('payment', 'payment', 'payment.id = lesson_payment.paymentId AND payment.isDeleted = 0') 
        .innerJoin('course', 'course', 'course.id = lesson.courseId')
        .innerJoin('program', 'program', 'program.id = course.programId')
        .where('course.locationId = :locationId', { locationId: location.id })
        .andWhere('lesson.date > :currentDate', { currentDate: currentDateStr })
        .andWhere('lesson.isDeleted = 0')
        .andWhere('program.type = :privateProgram', { privateProgram: 1 })
        .andWhere('course.isDeleted = 0')
        .andWhere('lesson.isConfirmed = 1')
        .andWhere('lesson.status != :canceledStatus', { canceledStatus: 4 })
        .andWhere('lesson.status != :expiredStatus', { expiredStatus: 10 })
        .andWhere('lesson_payment.lessonId IS NOT NULL') // Must have payments
        .groupBy('lesson.id') // Group by lesson to match legacy system behavior
        .orderBy('lesson.id', 'ASC');

      const total = await queryBuilder.getCount();
      const rows = await queryBuilder.offset((page - 1) * limit).limit(limit).getRawMany();

      const mapped: FinancialSummaryDataDto[] = rows.map((r: any) => ({
        id: String(r.id),
        studentName: (r.studentName || '').trim(),
        customerName: (r.customerName || '').trim(),
        date: formatLegacyNaiveDateTimeString(String(r.date)),
        duration: formatDuration(r.duration),
        amount: `$${parseFloat(r.amount || 0).toFixed(2)}`,
        paidAmount: `$${parseFloat(r.paidAmount || 0).toFixed(2)}`,
        balance: `$${parseFloat(r.balance || 0).toFixed(2)}`,
      }));

      return {
        title: 'Prepaid Future Private Lessons',
        body: mapped,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      };
    } catch (error) {
      throw error;
    }
  }
}
