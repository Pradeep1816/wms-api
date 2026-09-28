import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { TaxCollectedReportService } from '../services/tax-collected-report.service';
import { TaxCollectedRequestDto } from '../dto/tax-collected/tax-collected.request.dto';
import { TaxCollectedResponseDto } from '../dto/tax-collected/tax-collected.response.dto';
import { ResponseHelper } from '../../shared/helpers/response.helper';

@Controller('admin/v2/:location/report')
@UseGuards(AuthGuard, RolesGuard)
export class TaxCollectedReportController {
  constructor(private readonly taxCollectedReportService: TaxCollectedReportService) {}

  @Get('tax-collected')
  @Roles(RolesEnum.BACKEND_USER)
  async getTaxCollected(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: TaxCollectedRequestDto,
  ): Promise<TaxCollectedResponseDto | any> {
    try {
      const data = await this.taxCollectedReportService.getTaxCollected(locationSlug, query.startDate, query.endDate, query.summarize);
      return ResponseHelper.success(data, 'Tax collected report');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve tax collected report');
    }
  }
}


