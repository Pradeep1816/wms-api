import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { LessonPaymentRepository } from '../repositories/lesson-payment.repository';
import { LessonPaymentResponseDto } from '../dto/lesson-payment-response.dto';

@Injectable()
export class LessonPaymentService {
  constructor(
    private readonly lessonPaymentRepository: LessonPaymentRepository,
  ) {}

  /**
   * Get lesson payments
   */
  async getLessonPayments(
    lessonId: number,
    sortField?: string,
    sortOrder?: 'ASC' | 'DESC',
    enrolmentId?: number,
  ): Promise<LessonPaymentResponseDto> {
    try {
      const payments = await this.lessonPaymentRepository.getPayments(
        lessonId,
        sortField,
        sortOrder,
        enrolmentId,
      );

      return {
        body: payments,
      } as LessonPaymentResponseDto;
    } catch (error) {
      console.error('Error in getLessonPayments service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve lesson payments: ${error.message}`);
    }
  }
}
