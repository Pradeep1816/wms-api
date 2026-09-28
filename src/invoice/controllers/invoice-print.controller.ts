import { Controller, Get, Param, UseGuards, NotFoundException } from '@nestjs/common';
import { InvoicePrintService } from '../services/invoice-print.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';


@Controller('admin/v2/:location/invoices')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class InvoicePrintController {
  constructor(private readonly invoicePrintService: InvoicePrintService) {}

  @Get(':id/print')
  @Roles(RolesEnum.BACKEND_USER)
  async getInvoicePrintData(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') invoiceId: number,
  ): Promise<any> {
    try {
      const printData = await this.invoicePrintService.getInvoicePrintData(
        locationId,
        locationSlug,
        invoiceId,
      );

      return ResponseHelper.success(
        printData,
        'Invoice print data retrieved successfully',
      );
    } catch (error) {
      console.error('Error in getInvoicePrintData controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve invoice print data',
      );
    }
  }
}
