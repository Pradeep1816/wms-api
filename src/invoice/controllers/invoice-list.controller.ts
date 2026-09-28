import {
  Controller,
  Get,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { InvoiceListService } from '../services/invoice-list.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { InvoiceListRequestDto } from '../dto/invoice-list-request.dto';
import { InvoiceListDataDto } from '../dto/invoice-list-response.dto';

@Controller('admin/v2/:location/invoices')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class InvoiceListController {
  constructor(private readonly invoiceListService: InvoiceListService) {}


  @Get('list')
  @Roles(RolesEnum.BACKEND_USER)
  async getInvoices(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: InvoiceListRequestDto,
  ): Promise<InvoiceListDataDto | any> {
    try {
      const result = await this.invoiceListService.getInvoices(locationId, query);

      return ResponseHelper.success(result, 'Invoices retrieved successfully');
    } catch (error) {
      console.error('Error in getInvoices controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve invoices',
      );
    }
  }
}
