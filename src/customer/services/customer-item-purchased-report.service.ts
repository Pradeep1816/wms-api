import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from '../../location/entities/location.entity';
import { CustomerItemPurchasedReportRepository } from '../repositories/customer-item-purchased-report.repository';
import { CustomerItemPurchasedReportDataDto } from '../dto/customer-item-purchased-report-response.dto';
import { CustomerItemPurchasedReportTransformationService } from './transformation/customer-item-purchased-report-transformation.service';
import { CustomerItemPurchasedReportRequestDto } from '../dto/customer-item-purchased-report-request.dto';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';

@Injectable()
export class CustomerItemPurchasedReportService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    private readonly itemReportRepo: CustomerItemPurchasedReportRepository,
    private readonly transformationService: CustomerItemPurchasedReportTransformationService,
    private readonly validationService: CustomerValidationService,
  ) {}

  private normalizeDateOnly(date?: string): string {
    const d = date ? new Date(date) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async getItemReport(
    locationSlug: string,
    customerId: number,
    query: CustomerItemPurchasedReportRequestDto,
  ): Promise<CustomerItemPurchasedReportDataDto> {

    // Validate location and customer
    const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

    // Get query parameters
    const { page = 1, limit = 20, startDate, endDate } = query;

    // Normalize dates
    const fromDate = this.normalizeDateOnly(startDate);
    const toDate = this.normalizeDateOnly(endDate);

     const { itemReportData, total } = await this.itemReportRepo.getCustomerItemPurchasedReport(
      customerId,
      locationId,
      fromDate,
      toDate,
      page,
      limit,
    );

    const {transformedRows, totalAmount } = this.transformationService.transformRows(itemReportData);
    const totalPages = Math.ceil(total / limit);

    return {
      body: transformedRows,
      footer: {totalAmount},
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }
}

