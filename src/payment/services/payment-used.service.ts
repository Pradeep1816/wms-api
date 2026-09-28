import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { LocationService } from '../../location/services/location.service';
import { LocationRepository } from '../../location/repositories/location.repository';
import { PaymentQueryRepository } from '../repositories/payment.repository';
import { PaymentEditInfoTransformation } from './transformation/payment-edit-info.transformation';
import { PaymentEditInfoDataDto } from '../dto/payment-edit-info-response.dto';

@Injectable()
export class PaymentEditInfoUsedService {
  constructor(
    private readonly paymentQueryRepository: PaymentQueryRepository,
    private readonly locationService: LocationService,
    private readonly locationRepository: LocationRepository,
    private readonly paymentEditInfoTransformation: PaymentEditInfoTransformation,
  ) {}

  /**
   * Get payment used information for a payment
   */
  async getPaymentUsed(
    locationSlug: string,
    paymentId: number,
  ): Promise<any> {
    try {
      const locationId = await this.locationService.getLocationId(locationSlug);

      // Verify payment exists and get payment data
      const payment = await this.paymentQueryRepository.getPaymentByPaymentId(paymentId, locationId);
      if (!payment) {
        throw new NotFoundException(`Payment with ID ${paymentId} not found`);
      }

      // Get HST registration number
      const locationDetails = await this.locationRepository.getLocationDetails(locationId);
      const transformedLocationDetails = this.paymentEditInfoTransformation.transformLocationDetails(locationDetails);
      // Transform payment used
      const transformedPaymentUsed = this.paymentEditInfoTransformation.transformPaymentUsed(payment);

      // Generate payment receipt acknowledgment message
      const buyerName = await this.paymentQueryRepository.getInvoiceBuyerName(paymentId);
      const acknowledgmentMessage = this.paymentEditInfoTransformation.generateAcknowledgment(payment, buyerName);

      return {
        body: transformedPaymentUsed,
        locationDetails: transformedLocationDetails,
        acknowledgmentMessage,
        buyerName,
      };
    } catch (error) {
      console.error('Error in getPaymentEditInfoUsed service:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve payment used: ${error.message}`);
    }
  }
}

