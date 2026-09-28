import { Injectable, BadRequestException } from '@nestjs/common';
import { OutstandingInvoiceRepository } from '../repositories/outstanding-invoice.repository';
import { AvailableCreditsTransformationService } from './transformations/available-credits-transformation.service';
import { AvailableCreditsRequestDto } from '../dto/available-credits-request.dto';
import { AvailableCreditsDataDto } from '../dto/available-credits-response.dto';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';

@Injectable()
export class AvailableCreditsService {
  constructor(
    private readonly outstandingInvoiceRepository: OutstandingInvoiceRepository,
    private readonly transformationService: AvailableCreditsTransformationService,
    private readonly validationService: CustomerValidationService,
  ) {}

  async getAvailableCredits(
    locationSlug: string,
    customerId: number,
    query: AvailableCreditsRequestDto,
  ): Promise<AvailableCreditsDataDto> {
    try {
      const { page = 1, limit = 20 } = query || {};

      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      const { invoiceCredits, paymentCredits } = await this.outstandingInvoiceRepository.getAvailableCreditsData(
        customerId,
        locationId,
      );

      const { credits, totalCredits } = this.transformationService.transformCreditsToDtos(
        invoiceCredits,
        paymentCredits,
      );

      const total = credits.length;
      const totalPages = Math.ceil(total / limit);
      const start = (page - 1) * limit;
      const pagedCredits = credits.slice(start, start + limit);

      return {
        body: pagedCredits,
        footer: { totalAmount: totalCredits },
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      console.error('Error in getAvailableCredits service:', error);
      throw new BadRequestException(`Failed to retrieve available credits: ${error.message}`);
    }
  }
}


