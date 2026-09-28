import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { RentalReportService } from '../services/rental-report.service';
import { ReportRentalReportsRequestDto } from '../dto/rental-dto/rental-reports.request.dto';
import { ResponseHelper } from '../../shared/helpers/response.helper';

@Controller('admin/v2/:location/report')
@UseGuards(AuthGuard, RolesGuard)
export class RentalReportController {
  constructor(private readonly rentalReportService: RentalReportService) {}

  @Get('rental')
  @Roles(RolesEnum.BACKEND_USER)
  async getRentalReports(
    @Param('location') location: string,
    @Query(ValidationPipe) dto: ReportRentalReportsRequestDto,
  ) {
    try {
      const data = await this.rentalReportService.getRentalReports(location, dto);
      return ResponseHelper.success(data, 'Rental reports retrieved successfully');
    } catch (error) {
      if (error.message.includes('not found')) return ResponseHelper.error('NOT_FOUND', error.message);
      if (error.message.includes('validation')) return ResponseHelper.error('VALIDATION_ERROR', error.message);
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve rental reports data');
    }
  }
}


