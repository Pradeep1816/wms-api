import {
  Controller,
  Post,
  Param,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Body, ValidationPipe, ParseIntPipe,
} from '@nestjs/common';
import { InvoiceReturnService } from '../services/invoice-return.service';
import { InvoicePosReturnsService } from '../services/invoice-pos-returns.service';
import { ReturnPosItemsDto } from '../dto/return-pos-items.dto';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import type { AuthenticatedUser } from '../../auth/services/auth.service';

/**
 * Controller for the Return (Revert) Invoice feature.
 * 
 * Endpoint: POST /admin/v2/:location/invoices/:id/return
 * 
 * Matches legacy: InvoiceController::actionRevertInvoice($id)
 * Route: revert-invoice/$id (PHP) → invoices/:id/return (NestJS)
 */
@Controller('admin/v2/:location/invoices')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class InvoiceReturnController {
  constructor(
    private readonly invoiceReturnService: InvoiceReturnService,
    private readonly posReturns: InvoicePosReturnsService,
  ) {}

  @Post(':id/return-pos-items')
  @Roles(RolesEnum.BACKEND_USER)
  async returnPosItems(
    @LocationId() locationId: number,
    @Param('location') slug: string,
    @Param('id', ParseIntPipe) invoiceId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: ReturnPosItemsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return ResponseHelper.success(await this.posReturns.returnItems(locationId, slug, invoiceId, dto, user.id), 'POS items returned as invoice credit.');
  }

  /**
   * Return (revert) an invoice.
   * Creates a credit invoice with negated line items and marks the original as canceled.
   * If the original was owing, auto-creates a credit-applied/credit-used payment pair.
   */
  @Post(':id/return')
  @Roles(RolesEnum.BACKEND_USER)
  async returnInvoice(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id') invoiceId: number,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.invoiceReturnService.returnInvoice(
        locationId,
        locationSlug,
        invoiceId,
        currentUser.id,
      );

      return ResponseHelper.success(result, 'Invoice returned successfully');
    } catch (error) {
      console.error('Error in returnInvoice controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      if (error instanceof ForbiddenException) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to return invoice');
    }
  }
}
