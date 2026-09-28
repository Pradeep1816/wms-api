import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import {
  RoyaltyReportPresentation,
  RoyaltyReportService,
} from '../services/royalty-report.service';
import { RoyaltyRequestDto } from '../dto/royalty-report/royalty.request.dto';
import {
  RoyaltyAllLocationsResponseDto,
  RoyaltyResponseDto,
} from '../dto/royalty-report/royalty.response.dto';
import { ResponseHelper } from '../../shared/helpers/response.helper';

@Controller('admin/v2/:location/report')
@UseGuards(AuthGuard, RolesGuard)
export class RoyaltyReportController {
  constructor(private readonly royaltyReportService: RoyaltyReportService) {}

  @Get('royalty')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async getRoyalty(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: RoyaltyRequestDto,
    @Req() req: any,
  ): Promise<RoyaltyResponseDto | any> {
    try {
      // Client-approved access model: Owners receive the established Legacy
      // presentation; Administrators can use the enhanced New Report.
      const presentation = req.user?.roles?.includes(RolesEnum.ADMINISTRATOR)
        ? RoyaltyReportPresentation.ENHANCED
        : RoyaltyReportPresentation.STANDARD;
      const data = await this.royaltyReportService.getRoyalty(
        locationSlug,
        query.startDate,
        query.endDate,
        presentation,
      );
      return ResponseHelper.success(
        data,
        'Royalty report retrieved successfully',
      );
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(
        error.message || 'Failed to retrieve royalty report',
      );
    }
  }

  @Get('royalty/all-locations')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async getRoyaltyForAllLocations(
    @Query(ValidationPipe) query: RoyaltyRequestDto,
    @Req() req: any,
  ): Promise<RoyaltyAllLocationsResponseDto | any> {
    try {
      // Keep all-location printing on the same client-approved role contract.
      const presentation = req.user?.roles?.includes(RolesEnum.ADMINISTRATOR)
        ? RoyaltyReportPresentation.ENHANCED
        : RoyaltyReportPresentation.STANDARD;
      const data = await this.royaltyReportService.getRoyaltyForAllLocations(
        query.startDate,
        query.endDate,
        presentation,
      );
      return ResponseHelper.success(
        data,
        'Royalty report for all locations retrieved successfully',
      );
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(
        error.message || 'Failed to retrieve royalty report for all locations',
      );
    }
  }
}
