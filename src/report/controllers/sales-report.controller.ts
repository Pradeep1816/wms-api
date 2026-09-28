import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { SalesReportService } from '../services/sales-report.service';
import { SalesPaymentsRequestDto, SalesRequestDto } from '../dto/sales-dto/sales.request.dto';
import { SalesPaymentsResponseDto, SalesResponseDto } from '../dto/sales-dto/sales.response.dto';
import { ResponseHelper } from '../../shared/helpers/response.helper';

@Controller('admin/v2/:location/report')
@UseGuards(AuthGuard, RolesGuard)
export class SalesReportController {
  constructor(
    private readonly salesReportService: SalesReportService,
  ) {}

  @Get('sales')
  @Roles(RolesEnum.BACKEND_USER)
  async getSales(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: SalesRequestDto,
  ){
    try {
      const data = await this.salesReportService.getSales(locationSlug, query.startDate, query.endDate);
      return ResponseHelper.success(data, 'Sales summary retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve sales summary data');
    }
  }

  @Get('sales-payments')
  @Roles(RolesEnum.BACKEND_USER)
  async getPayments(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: SalesPaymentsRequestDto,
  ){
    try {
      const data = await this.salesReportService.getPayments(locationSlug, query.startDate, query.endDate);
      return ResponseHelper.success(data, 'Payments summary retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve payments summary data');
    }
  }
}


