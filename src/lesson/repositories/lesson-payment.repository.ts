import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LessonPayment } from '../entities/lesson-payment.entity';
import { LessonPaymentItemDto } from '../dto/lesson-payment-response.dto';
import { LessonPaymentTransformationService } from '../services/transformation/lesson-payment-transformation.service';

@Injectable()
export class LessonPaymentRepository {
  constructor(
    @InjectRepository(LessonPayment)
    private readonly lessonPaymentRepository: Repository<LessonPayment>,
    private readonly transformationService: LessonPaymentTransformationService,
  ) {}

  //Get payments for a lesson
  //Matches legacy: lessonId only, no enrolmentId filter
  //Supports optional sorting by allowed fields

  async getPayments(
    lessonId: number,
    sortField?: string,
    sortOrder?: 'ASC' | 'DESC',
    enrolmentId?: number,
  ): Promise<LessonPaymentItemDto[]> {
    const qb = this.lessonPaymentRepository
      .createQueryBuilder('lp')
      .select([
        'p.id as id',
        'p.date as date',
        'pm.name as paymentMethod',
        'p.reference as number',
        'lp.amount as amount',
      ])
      .innerJoin('lp.payment', 'p', 'p.isDeleted = 0')
      .leftJoin('payment_method', 'pm', 'pm.id = p.payment_method_id')
      .where('lp.lessonId = :lessonId', { lessonId })
      .andWhere('lp.isDeleted = 0');

    if (enrolmentId) {
      qb.andWhere('lp.enrolmentId = :enrolmentId', { enrolmentId });
    }

    // Map of allowed sort fields to their database column names
    const sortFieldMap: Record<string, string> = {
      amount: 'lp.amount',
    };

    // Apply sorting if valid field is provided
    if (sortField && sortOrder && sortFieldMap[sortField]) {
      qb.orderBy(sortFieldMap[sortField], sortOrder);
    }

    const lessonPayments = await qb.getRawMany();

    return this.transformationService.transformRawPaymentsToDtos(lessonPayments);
  }
}
