import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { PaymentsReportService } from '../services/payments-report.service';
import { PaymentsRequestDto } from '../dto/payments-dto/payments.request.dto';
import { PaymentsResponseDto } from '../dto/payments-dto/payments.response.dto';
import { ResponseHelper } from '../../shared/helpers/response.helper';

@Controller('admin/v2/:location/report')
@UseGuards(AuthGuard, RolesGuard)
export class PaymentsReportController {
  constructor(private readonly paymentsReportService: PaymentsReportService) {}

  @Get('payment')
  @Roles(RolesEnum.BACKEND_USER)
  async getPayments(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: PaymentsRequestDto,
  ): Promise<PaymentsResponseDto | any> {
    try {
      const data = await this.paymentsReportService.getPaymentsReport(
        locationSlug,
        query.startDate,
        query.endDate,
        query.page ?? 1,
        query.limit ?? 20,
        query.summaryOnly ?? false,
      );
      return ResponseHelper.success(data, `Payments ${query.summaryOnly ? 'summary' : 'report'} retrieved successfully`);
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || `Failed to retrieve payments ${query.summaryOnly ? 'summary' : 'report'} data`);
    }
  }
}



