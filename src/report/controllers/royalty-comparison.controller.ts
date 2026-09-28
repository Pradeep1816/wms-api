import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { RoyaltyRequestDto } from '../dto/royalty-report/royalty.request.dto';
import { RoyaltyComparisonService } from '../services/royalty-comparison.service';

/**
 * Temporary administrator-only endpoints used to compare the historical
 * report with Phase 1 and explain unclassified historical credit balances.
 */
@Controller('admin/v2/:location/report/royalty-comparison')
@UseGuards(AuthGuard, RolesGuard)
@Roles(RolesEnum.ADMINISTRATOR)
export class RoyaltyComparisonController {
  constructor(
    private readonly royaltyComparisonService: RoyaltyComparisonService,
  ) {}

  @Get('legacy')
  async getLegacyReport(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: RoyaltyRequestDto,
  ) {
    try {
      const data = await this.royaltyComparisonService.getLegacyReport(
        locationSlug,
        query.startDate,
        query.endDate,
      );
      return ResponseHelper.success(
        data,
        'Legacy royalty report retrieved successfully',
      );
    } catch (error: unknown) {
      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(error, 'Failed to retrieve legacy royalty report'),
      );
    }
  }

  @Get('legacy/all-locations')
  async getLegacyReportForAllLocations(
    @Query(ValidationPipe) query: RoyaltyRequestDto,
  ) {
    try {
      const data =
        await this.royaltyComparisonService.getLegacyReportForAllLocations(
          query.startDate,
          query.endDate,
        );
      return ResponseHelper.success(
        data,
        'Legacy royalty report for all locations retrieved successfully',
      );
    } catch (error: unknown) {
      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(
          error,
          'Failed to retrieve legacy royalty report for all locations',
        ),
      );
    }
  }

  @Get('unclassified-credits')
  async getUnclassifiedHistoricalCredits(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: RoyaltyRequestDto,
  ) {
    try {
      const data =
        await this.royaltyComparisonService.getUnclassifiedHistoricalCredits(
          locationSlug,
          query.startDate,
          query.endDate,
        );
      return ResponseHelper.success(
        data,
        'Unclassified historical credits retrieved successfully',
      );
    } catch (error: unknown) {
      return ResponseHelper.errors.INTERNAL_ERROR(
        this.getErrorMessage(
          error,
          'Failed to retrieve unclassified historical credits',
        ),
      );
    }
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
