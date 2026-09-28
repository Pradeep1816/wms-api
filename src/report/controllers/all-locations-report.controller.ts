import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationReportService } from '../services/all-locations-report.service';
import { AllLocationsReportRequestDto } from '../dto/all-locations-dto/all-locations-request.dto';
import { AllLocationsReportResponseDto } from '../dto/all-locations-dto/all-locations-response.dto';

@Controller('admin/v2/:location/report')
@UseGuards(AuthGuard, RolesGuard)
export class LocationReportController {
  constructor(private readonly locationReportService: LocationReportService) {}

  @Get('all-locations')
  @Roles(RolesEnum.BACKEND_USER)
  async getAllLocations(
    @Param('location') location: string,
    @Query(ValidationPipe) query: AllLocationsReportRequestDto,
  ): Promise<AllLocationsReportResponseDto | any> {
    try {
      const report = await this.locationReportService.getAllLocations(query.startDate, query.endDate);
      return ResponseHelper.success(report, 'All locations report retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve all locations report');
    }
  }
}


