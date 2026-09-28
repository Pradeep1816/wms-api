import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { DiscountsReportService } from '../services/discounts-report.service';
import { DiscountRequestDto } from '../dto/discount-dto/discount.request.dto';
import { DiscountReportResponseDto } from '../dto/discount-dto/discount.response.dto';
import { ResponseHelper } from '../../shared/helpers/response.helper';

@Controller('admin/v2/:location/report')
@UseGuards(AuthGuard, RolesGuard)
export class DiscountsReportController {
  constructor(private readonly discountsReportService: DiscountsReportService) {}

  @Get('discounts')
  @Roles(RolesEnum.BACKEND_USER)
  async getDiscounts(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: DiscountRequestDto,
  ): Promise<DiscountReportResponseDto | any> {
    try {
      const data = await this.discountsReportService.getDiscountReport(
        locationSlug,
        query.startDate,
        query.endDate,
      );
      return ResponseHelper.success(data, 'Discounts report retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve discounts report data');
    }
  }
}


