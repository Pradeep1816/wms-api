import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ReceivePaymentInvoiceRequestDto } from '../dto/receive-payment-invoice-request.dto';
import { ReceivePaymentInvoiceResponseDto } from '../dto/receive-payment-invoice-response.dto';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { OutstandingInvoiceRepository } from '../repositories/outstanding-invoice.repository';
import { ReceivePaymentInvoiceTransformationService } from './transformations/receive-payment-invoice-transformation.service';
import { OutstandingInvoiceCalculationService } from './calculations/outstanding-invoice-calculation.service';

@Injectable()
export class ReceivePaymentInvoiceService {
  constructor(
    private readonly validationService: CustomerValidationService,
    private readonly outstandingInvoiceRepository: OutstandingInvoiceRepository,
    private readonly transformationService: ReceivePaymentInvoiceTransformationService,
    private readonly calculationService: OutstandingInvoiceCalculationService,
  ) {}

  async receivePaymentForInvoice(
    locationSlug: string,
    customerId: number,
    query: ReceivePaymentInvoiceRequestDto,
  ): Promise<ReceivePaymentInvoiceResponseDto | any> {

    try {
      // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Get outstanding invoices with pagination
       // Get outstanding invoices with pagination
       const { invoices, total, totalBalanceDue, paymentMap } = await this.outstandingInvoiceRepository.getOutstandingInvoicesByCustomerId(
        customerId,
        locationId,
        query.page || 1,
        query.limit || 10,
      );

      // Transform invoices to DTOs with payment map
      const invoiceData = this.transformationService.transformInvoicesToDtos(invoices, paymentMap);

      // Calculate total amount
      // const formattedAmount = formatCurrency(totalBalanceDue);

      // Calculate pagination
      const pagination = this.calculationService.calculatePagination(
        total,
        query.page || 1,
        query.limit || 10
      );

      return {
        body: invoiceData,
        // footer: [{ totalAmount: formattedAmount }],
        pagination,
      };
    } catch (error) {
      console.error('Error in getOutstandingInvoicesByCustomerId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve outstanding invoices: ${error.message}`);
    }
  }
}
