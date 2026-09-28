import {
  Controller,
  Post,
  Body,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { InvoiceCreateService } from '../services/invoice-create.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { CreateBlankInvoiceRequestDto } from '../dto/create-blank-invoice-request.dto';
import type { AuthenticatedUser } from '../../auth/services/auth.service';

@Controller('admin/v2/:location/invoices')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class InvoiceCreateController {
  constructor(private readonly invoiceCreateService: InvoiceCreateService) {}

  /**
   * POST /admin/v2/:location/invoices/blank-invoice
   * Create a blank invoice with zero-dollar totals
   * 
   * NOTE: The "+" button sends empty body {} - creates with walk-in customer + type=2
   * 
   * Optional body params (exist in PHP but not used by "+" button):
   *   - customer_id: number (if provided, type must also be provided)
   *   - type: number (1=Pro-Forma, 2=Invoice)
   * 
   * If customer_id not provided, uses location's walk-in customer
   */
  @Post('blank-invoice')
  @Roles(RolesEnum.BACKEND_USER)
  async createBlankInvoice(
    @LocationId() locationId: number,
    @Body(ValidationPipe) requestDto: CreateBlankInvoiceRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.invoiceCreateService.createBlankInvoice(
        locationId,
        requestDto,
        currentUser.id,
      );

      return ResponseHelper.success(result, 'Blank invoice created successfully');
    } catch (error) {
      console.error('Error in createBlankInvoice controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error.message?.includes('required') || error.message?.includes('invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to create blank invoice',
      );
    }
  }
}
