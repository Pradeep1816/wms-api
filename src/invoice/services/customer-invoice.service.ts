import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ICustomerInvoiceQueryService } from '../interfaces/customer-invoice-service.interface';
import { CustomerInvoiceRepository } from '../repositories/customer-invoice.repository';
import { CustomerInvoiceRequestDto } from '../dto/customer-invoice-request.dto';
import { CustomerInvoicesDataDto } from '../dto/customer-invoice-response.dto';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { CustomerInvoiceTransformationService } from './transformations/customer-invoice-transformation.service';
import { CustomerInvoiceCalculationService } from './calculations/customer-invoice-calculation.service';

@Injectable()
export class CustomerInvoiceService implements ICustomerInvoiceQueryService {
  constructor(
    private readonly customerInvoiceRepository: CustomerInvoiceRepository,
    private readonly validationService: CustomerValidationService,
    private readonly transformationService: CustomerInvoiceTransformationService,
    private readonly calculationService: CustomerInvoiceCalculationService,
  ) {}

  async getInvoicesByCustomerId(
    locationSlug: string,
    customerId: number,
    query: CustomerInvoiceRequestDto,
  ): Promise<CustomerInvoicesDataDto> {
    try {
      // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Get invoices with pagination
      const { invoices, total } = await this.customerInvoiceRepository.getInvoicesByCustomerId(
        customerId,
        locationId,
        query.page || 1,
        query.limit || 10,
      );

      // Transform invoices to DTOs
      const invoiceData = this.transformationService.transformInvoicesToDtos(invoices, locationSlug);

      // Calculate pagination
      const pagination = this.calculationService.calculatePagination(
        total,
        query.page || 1,
        query.limit || 10
      );

      return {
        body: invoiceData,
        pagination,
      };
    } catch (error) {
      console.error('Error in getInvoicesByCustomerId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve customer invoices: ${error.message}`);
    }
  }
}
