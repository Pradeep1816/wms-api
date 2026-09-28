import { Controller, Get, Param, UseGuards, NotFoundException } from '@nestjs/common';
import { InvoicePaymentDetailsService } from '../services/invoice-payment-details.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ResponseHelper } from '../../shared/helpers/response.helper';

@Controller('admin/v2/:location/invoices')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class InvoicePaymentDetailsController {
    constructor(
        private readonly invoicePaymentDetailsService: InvoicePaymentDetailsService,
    ) { }

    /**
     * GET /admin/v2/:location/invoices/payments/:id
     * Retrieve payments for an invoice (payment section on invoice detail page)
     */
    @Get('payments/:id')
    @Roles(RolesEnum.BACKEND_USER)
    async getInvoicePayments(
        @LocationId() locationId: number,
        @Param('location') locationSlug: string,
        @Param('id') invoiceId: number,
    ): Promise<any> {
        try {
            const result = await this.invoicePaymentDetailsService.getInvoicePayments(
                locationId,
                locationSlug,
                invoiceId,
            );

            return ResponseHelper.success(result, 'Invoice payments retrieved successfully');
        } catch (error) {
            console.error('Error in getInvoicePayments controller:', error);

            if (error instanceof NotFoundException) {
                return ResponseHelper.error('NOT_FOUND', error.message);
            }

            return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve invoice payments');
        }
    }

}
