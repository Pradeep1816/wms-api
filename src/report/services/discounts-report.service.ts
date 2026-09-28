import { Injectable } from '@nestjs/common';
import { LocationService } from '../../location/services/location.service';
import { DiscountsReportRepository } from '../repositories/discounts-report.repository';
import { DiscountsReportTransformationService } from './transformations/discounts-report-transformation.service';
import { formatCurrency } from 'src/utils/formatters';
import { DiscountReportResponseDto } from '../dto/discount-dto/discount.response.dto';

@Injectable()
export class DiscountsReportService {
  constructor(
    private readonly locationService: LocationService,
    private readonly repository: DiscountsReportRepository,
    private readonly transformationService: DiscountsReportTransformationService,
  ) {}

  async getDiscountReport(
    locationSlug: string,
    startDate?: string,
    endDate?: string,
  ): Promise<DiscountReportResponseDto> {
    const locationId = await this.locationService.getLocationId(locationSlug);

    const today = new Date().toISOString().split('T')[0];
    const fromDateIso = startDate ? new Date(startDate).toISOString().split('T')[0] : today;
    const toDateIso = endDate ? new Date(endDate).toISOString().split('T')[0] : today;

    const rows = await this.repository.getDiscountReportData(locationId, fromDateIso, toDateIso);

    const totalNetDiscount = rows.reduce((sum, r) => sum + parseFloat(r.netDiscount || 0), 0);

    const data = this.transformationService.transformRowsToReportData(rows);

    return {
      body: data,
      footer: {
        totalDiscount: formatCurrency(totalNetDiscount),
      },
    };
  }
}