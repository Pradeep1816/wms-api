import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { CustomerInvoicePrintRequestDto } from '../dto/customer-invoice-print-request.dto';
import { CustomerInvoicePrintDataDto } from '../dto/customer-invoice-print-response.dto';
import { InvoiceStatus } from '../enums/invoice-status.enum';
import { CustomerInvoiceRepository } from '../repositories/customer-invoice.repository';
import { CustomerInvoiceTransformationService } from './transformations/customer-invoice-transformation.service';

@Injectable()
export class CustomerInvoicePrintService {
  constructor(
    private readonly customerInvoiceRepository: CustomerInvoiceRepository,
    private readonly validationService: CustomerValidationService,
    private readonly transformationService: CustomerInvoiceTransformationService,
  ) {}

  async getInvoicePrintByCustomerId(
    locationSlug: string,
    customerId: number,
    query: CustomerInvoicePrintRequestDto,
  ): Promise<CustomerInvoicePrintDataDto> {
    try {
      const { locationId } = await this.validationService.validateLocationAndCustomer(
        locationSlug,
        customerId,
      );

      const hstRegistrationNo =
        await this.customerInvoiceRepository.getLocationHstRegistrationNo(locationId);

      const { invoices, rentalStudentMap } =
        await this.customerInvoiceRepository.getInvoicesForPrint(customerId, locationId,query);

      const body = this.transformationService.transformInvoicesToPrintDtos(
        invoices,
        rentalStudentMap,
      );

      return {
        body,
        hstRegistrationNo,
      };
    } catch (error) {
      console.error('Error in getInvoicePrintByCustomerId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to retrieve customer invoice print data: ${error.message}`,
      );
    }
  }
}
