import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { LocationService } from '../../location/services/location.service';
import { PaymentQueryRepository } from '../repositories/payment.repository';
import { PaymentEditInfoTransformation } from './transformation/payment-edit-info.transformation';
import { PaymentCalculationService } from './calculation/payment-calculation.service';
import { OutstandingInvoiceRepository } from '../../invoice/repositories/outstanding-invoice.repository';

@Injectable()
export class PaymentEditInfoInvoicesService {
  constructor(
    private readonly paymentQueryRepository: PaymentQueryRepository,
    private readonly locationService: LocationService,
    private readonly paymentEditInfoTransformation: PaymentEditInfoTransformation,
    private readonly paymentCalculationService: PaymentCalculationService,
    private readonly outstandingInvoiceRepository: OutstandingInvoiceRepository,
  ) {}

  /**
   * Get invoices for a payment
   */
  async getPaymentEditInfoInvoices(
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

      // Get  invoices
      const { invoices, total } = await this.outstandingInvoiceRepository.getInvoicesByPaymentId(
        paymentId,
        locationId,
        page,
        limit,
      );

      // Transform invoices
      const transformedInvoices = this.paymentEditInfoTransformation.transformInvoices(invoices);

      // Calculate pagination
      const pagination = this.paymentCalculationService.calculatePagination(total, page, limit);

      return {
        body: transformedInvoices,
        pagination,
      };
    } catch (error) {
      console.error('Error in getPaymentEditInfoInvoices service:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve payment invoices: ${error.message}`);
    }
  }
}

