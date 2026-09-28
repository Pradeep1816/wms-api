import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { CustomerInvoicePrintService } from '../../invoice/services/customer-invoice-print.service';
import { CustomerInvoicePrintRequestDto } from '../../invoice/dto/customer-invoice-print-request.dto';
import { CustomerInvoicePrintDataDto } from '../../invoice/dto/customer-invoice-print-response.dto';

@Controller('admin/v2/:location/customers')
@UseGuards(AuthGuard, RolesGuard)
export class CustomerInvoicePrintController {
  constructor(private readonly customerInvoicePrintService: CustomerInvoicePrintService) {}

  @Get(':id/invoices/print')
  @Roles(RolesEnum.BACKEND_USER)
  async getInvoicesPrintByCustomerId(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: CustomerInvoicePrintRequestDto,
  ): Promise<CustomerInvoicePrintDataDto | any> {
    try {
      const result = await this.customerInvoicePrintService.getInvoicePrintByCustomerId(
        locationSlug,
        customerId,
        query,
      );
      return ResponseHelper.success(result, 'Customer invoice print data retrieved successfully');
    } catch (error) {
      console.error('Error in getInvoicesPrintByCustomerId controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('Invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve customer invoice print data',
      );
    }
  }
}
