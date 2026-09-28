import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { InvoiceVoidService } from '../services/invoice-void.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { VoidInvoiceRequestDto } from '../dto/void-invoice.dto';
import type { AuthenticatedUser } from '../../auth/services/auth.service';

@Controller('admin/v2/:location/invoices')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class InvoiceVoidController {
  constructor(
    private readonly invoiceVoidService: InvoiceVoidService,
  ) {}

  /**
   * POST /admin/v2/:location/invoices/:id/void
   * Void an invoice, soft-delete all line items, and optionally unschedule lessons.
   *
   * Body:
   *   - canBeUnscheduled: boolean (optional, defaults to true)
   */
  @Post(':id/void')
  @Roles(RolesEnum.BACKEND_USER)
  async voidInvoice(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') invoiceId: number,
    @Body(ValidationPipe) requestDto: VoidInvoiceRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.invoiceVoidService.voidInvoice(
        locationId,
        locationSlug,
        invoiceId,
        requestDto,
        currentUser.id,
      );

      return ResponseHelper.success(result, 'Invoice voided successfully');
    } catch (error) {
      console.error('Error in voidInvoice controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to void invoice',
      );
    }
  }
}
