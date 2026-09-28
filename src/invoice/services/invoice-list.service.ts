import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InvoiceListRepository } from '../repositories/invoice-list.repository';
import { InvoiceListRequestDto } from '../dto/invoice-list-request.dto';
import { InvoiceListDataDto } from '../dto/invoice-list-response.dto';
import { InvoiceListTransformationService } from './transformations/invoice-list-transformation.service';

/**
 * Service for Invoice listing
 * Handles business logic and delegates transformation to transformation service
 */
@Injectable()
export class InvoiceListService {
  constructor(
    private readonly invoiceListRepository: InvoiceListRepository,
    private readonly transformationService: InvoiceListTransformationService,
  ) {}

  /**
   * Get invoices with filters and pagination
   */
  async getInvoices(
    locationId: number,
    searchDto: InvoiceListRequestDto,
  ): Promise<InvoiceListDataDto> {
    try {
      const { page = 1, limit = 20, showAll = false } = searchDto;

      // Get invoices from repository
      const { invoices, total, rawDataMap } = await this.invoiceListRepository.getInvoices(
        locationId,
        searchDto,
      );

      // When showAll is true, set limit to total for correct pagination info
      const effectiveLimit = showAll ? total : limit;
      const effectivePage = showAll ? 1 : page;

      // Transform results using transformation service (pass rawDataMap for student/phone data)
      return this.transformationService.transformInvoicesData(
        invoices,
        total,
        effectivePage,
        effectiveLimit,
        rawDataMap,
      );
    } catch (error) {
      console.error('Error in getInvoices service:', error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to retrieve invoices: ${error.message}`,
      );
    }
  }
}
