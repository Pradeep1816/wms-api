import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { LocationService } from '../../location/services/location.service';
import { PaymentQueryRepository } from '../repositories/payment.repository';
import { PaymentEditInfoTransformation } from './transformation/payment-edit-info.transformation';
import { PaymentCalculationService } from './calculation/payment-calculation.service';
import { GroupLessonRepository } from '../../lesson/repositories/group-lesson.repository';

@Injectable()
export class PaymentEditInfoGroupLessonsService {
  constructor(
    private readonly paymentQueryRepository: PaymentQueryRepository,
    private readonly locationService: LocationService,
    private readonly paymentEditInfoTransformation: PaymentEditInfoTransformation,
    private readonly paymentCalculationService: PaymentCalculationService,
    private readonly groupLessonRepository: GroupLessonRepository,
  ) {}

  /**
   * Get group lessons for a payment
   */
  async getPaymentEditInfoGroupLessons(
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

      // Get group lessons - pass customerId from payment to ensure customer-specific results
      const { groupLessons, total } = await this.groupLessonRepository.getGroupLessonsByPaymentId(
        paymentId,
        locationId,
        payment.userId, // customerId from payment
        page,
        limit,
      );

      // Transform group lessons
      const transformedGroupLessons = this.paymentEditInfoTransformation.transformGroupLessons(groupLessons);

      // Calculate pagination
      const pagination = this.paymentCalculationService.calculatePagination(total, page, limit);

      return {
        body: transformedGroupLessons,
        pagination,
      };
    } catch (error) {
      console.error('Error in getPaymentEditInfoGroupLessons service:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve payment group lessons: ${error.message}`);
    }
  }
}

