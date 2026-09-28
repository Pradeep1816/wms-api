import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IOutstandingInvoiceQueryService } from '../interfaces/outstanding-invoice-service.interface';
import { OutstandingInvoiceRepository } from '../repositories/outstanding-invoice.repository';
import { OutstandingInvoiceRequestDto } from '../dto/outstanding-invoice-request.dto';
import { OutstandingInvoicesDataDto } from '../dto/outstanding-invoice-response.dto';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { OutstandingInvoiceTransformationService } from './transformations/outstanding-invoice-transformation.service';
import { OutstandingInvoiceCalculationService } from './calculations/outstanding-invoice-calculation.service';
import { formatCurrency } from '../../utils/formatters';

@Injectable()
export class OutstandingInvoiceService implements IOutstandingInvoiceQueryService {
  constructor(
    private readonly outstandingInvoiceRepository: OutstandingInvoiceRepository,
    private readonly validationService: CustomerValidationService,
    private readonly transformationService: OutstandingInvoiceTransformationService,
    private readonly calculationService: OutstandingInvoiceCalculationService,
  ) {}

  /**
   * Get outstanding invoices for a customer
   */
  async getOutstandingInvoicesByCustomerId(
    locationSlug: string,
    customerId: number,
    query: OutstandingInvoiceRequestDto,
  ): Promise<OutstandingInvoicesDataDto> {
    try {
      // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Get outstanding invoices with pagination
      const { invoices, total, totalBalanceDue, paymentMap } = await this.outstandingInvoiceRepository.getOutstandingInvoicesByCustomerId(
        customerId,
        locationId,
        query.page || 1,
        query.limit || 10,
      );

      // Transform invoices to DTOs with payment map
      const invoiceData = this.transformationService.transformInvoicesToDtos(invoices, paymentMap,locationSlug);

      // Calculate total amount
      const formattedAmount = formatCurrency(totalBalanceDue);

      // Calculate pagination
      const pagination = this.calculationService.calculatePagination(
        total,
        query.page || 1,
        query.limit || 10
      );

      return {
        body: invoiceData,
        footer: [{ totalAmount: formattedAmount }],
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
