import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { CustomerItemPurchasedReportService } from '../services/customer-item-purchased-report.service';
import { CustomerItemPurchasedReportRequestDto } from '../dto/customer-item-purchased-report-request.dto';
import { CustomerItemPurchasedReportDataDto } from '../dto/customer-item-purchased-report-response.dto';

@Controller('admin/v2/:location/customers')
@UseGuards(AuthGuard, RolesGuard)
export class CustomerItemPurchasedReportController {
  constructor(private readonly reportService: CustomerItemPurchasedReportService) {}

  @Get(':id/item-purchased-report')
  @Roles(RolesEnum.BACKEND_USER)
  async getItemReport(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: CustomerItemPurchasedReportRequestDto,
  ): Promise<CustomerItemPurchasedReportDataDto | any> {
    try {
      
      const result = await this.reportService.getItemReport(locationSlug, customerId, query);
      return ResponseHelper.success(result, 'Customer item purchased report retrieved successfully');
    } catch (error) {
      console.error('Error in getItemReport controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', error?.message || 'Failed to retrieve customer item purchased report');
    }
  }
}

