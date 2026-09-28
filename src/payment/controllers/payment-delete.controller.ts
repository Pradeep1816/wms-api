import { BadRequestException, Controller, Delete, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/auth/services/auth.service';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { InvoicePaymentDetailsService } from 'src/invoice/services/invoice-payment-details.service';

@Controller('admin/v2/:location')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class PaymentDeleteController {
  constructor(
    private readonly invoicePaymentDetailsService: InvoicePaymentDetailsService,
  ) {}

  @Delete('payments/:id/delete')
  @Roles(RolesEnum.BACKEND_USER)
  async deleteInvoicePayment(
    @Param('location') locationSlug: string,
    @Param('id') paymentId: number,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    try {
     
       const isAdmin = currentUser.roles?.includes(RolesEnum.ADMINISTRATOR) ?? false;

      const data = await this.invoicePaymentDetailsService.deletePayment(
        paymentId,
        currentUser.id,
        locationSlug,
        isAdmin,
      );
      return ResponseHelper.success(data, 'Payment deleted successfully');
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to delete payment');
    }
  }
}
