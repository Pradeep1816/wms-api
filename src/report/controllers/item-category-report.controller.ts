import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ItemCategoryReportService } from '../services/item-category-report.service';
import { ItemCategoryReportRequestDto } from '../dto/item-sold-category-dto/item-category-request.dto';
import { ItemCategoryReportResponseDto } from '../dto/item-sold-category-dto/item-category-response.dto';
import { ResponseHelper } from '../../shared/helpers/response.helper';

@Controller('admin/v2/:location/report')
@UseGuards(AuthGuard, RolesGuard)
export class ItemCategoryReportController {
  constructor(private readonly itemCategoryReportService: ItemCategoryReportService) {}

  @Get('item-category')
  @Roles(RolesEnum.BACKEND_USER)
  async getItemCategoryReport(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: ItemCategoryReportRequestDto,
  ): Promise<ItemCategoryReportResponseDto | any> {
    const { startDate, endDate, categoryId, page = 1, limit = 20, summaryOnly = false } = query;
    try {
      const data = await this.itemCategoryReportService.getItemCategoryReport(
        locationSlug,
        startDate,
        endDate,
        categoryId,
        page,
        limit,
        summaryOnly,
      );
      return ResponseHelper.success(
        data,
        `Item category ${summaryOnly ? 'summary' : 'report'} retrieved successfully`,
      );
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(
        error.message || `Failed to retrieve item category ${summaryOnly ? 'summary' : 'report'} data`,
      );
    }
  }
}


