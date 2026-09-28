import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { RoyaltyFreeItemsReportService } from '../services/royalty-free-items-report.service';
import { RoyaltyFreeItemsRequestDto } from '../dto/royalty-free-items/royalty-free-items.request.dto';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { RoyaltyFreeItemsViewDto } from '../dto/royalty-free-items/royalty-free-items.response.dto';
import { ApiResponse } from '../../shared/interceptors/response.interceptor';

@Controller('admin/v2/:location/report')
@UseGuards(AuthGuard, RolesGuard)
export class RoyaltyFreeItemsReportController {
    constructor(private readonly royaltyFreeItemsReportService: RoyaltyFreeItemsReportService) { }

    @Get('royalty-free')
    @Roles(RolesEnum.BACKEND_USER)
    async getRoyaltyFreeItems(
        @Param('location') locationSlug: string,
        @Query(ValidationPipe) query: RoyaltyFreeItemsRequestDto,
    ): Promise<ApiResponse<RoyaltyFreeItemsViewDto> | any> {
        try {
            const data = await this.royaltyFreeItemsReportService.getRoyaltyFreeItems(locationSlug, query);
            return ResponseHelper.success(data, 'Royalty free items report retrieved successfully');
        } catch (error) {
            return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve royalty free items report');
        }
    }
}


