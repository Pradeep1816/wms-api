import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { LocationService } from '../../location/services/location.service';
import { PaymentQueryRepository } from '../repositories/payment.repository';
import { PaymentEditInfoTransformation } from './transformation/payment-edit-info.transformation';
import { PaymentCalculationService } from './calculation/payment-calculation.service';
import { PrivateLessonRepository } from '../../lesson/repositories/private-lesson.repository';

@Injectable()
export class PaymentEditInfoLessonsService {
  constructor(
    private readonly paymentQueryRepository: PaymentQueryRepository,
    private readonly locationService: LocationService,
    private readonly paymentEditInfoTransformation: PaymentEditInfoTransformation,
    private readonly paymentCalculationService: PaymentCalculationService,
    private readonly privateLessonRepository: PrivateLessonRepository,
  ) {}

  /**
   * Get private lessons for a payment
   */
  async getPaymentEditInfoLessons(
    locationSlug: string,
    paymentId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<any> {
    try {
      const locationId = await this.locationService.getLocationId(locationSlug);

      // Verify payment exists
      const payment = await this.paymentQueryRepository.getPaymentByPaymentId(paymentId, locationId);
      if (!payment) {
        throw new NotFoundException(`Payment with ID ${paymentId} not found`);
      }

      // Get lessons
      const { lessons, total } = await this.privateLessonRepository.getLessonsByPaymentId(
        paymentId,
        locationId,
        page,
        limit,
      );

      // Transform lessons
      const transformedLessons = this.paymentEditInfoTransformation.transformLessons(lessons);

      // Calculate pagination
      const pagination = this.paymentCalculationService.calculatePagination(total, page, limit);

      return {
        body: transformedLessons,
        pagination,
      };
    } catch (error) {
      console.error('Error in getPaymentEditInfoLessons service:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve payment lessons: ${error.message}`);
    }
  }
}

