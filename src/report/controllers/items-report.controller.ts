import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ItemsReportService } from '../services/items-report.service';
import { ItemReportRequestDto } from '../dto/items-dto/item-report.request.dto';
import { ItemReportResponseDto } from '../dto/items-dto/item-report.response.dto';
import { ResponseHelper } from '../../shared/helpers/response.helper';

@Controller('admin/v2/:location/report')
@UseGuards(AuthGuard, RolesGuard)
export class ItemsReportController {
  constructor(private readonly itemsReportService: ItemsReportService) {}

  @Get('items')
  @Roles(RolesEnum.BACKEND_USER)
  async getItemsReport(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: ItemReportRequestDto,
  ): Promise<ItemReportResponseDto | any> {
   
     try {
        const data = await this.itemsReportService.getItemsReport(locationSlug, query);
        return ResponseHelper.success(data, 'Items report retrieved successfully');
    } catch (error) {
        return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve items report data');
    }
  }
}


