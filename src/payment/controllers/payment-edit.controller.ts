import { Body, BadRequestException, Controller, NotFoundException, Param, Put, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { UpdateInvoicePaymentRequestDto } from '../../invoice/dto/update-invoice-payment-request.dto';
import { InvoicePaymentEditService } from '../../invoice/services/invoice-payment-edit.service';

@Controller('admin/v2/:location/payments')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class PaymentEditController {
    constructor(
        private readonly invoicePaymentEditService: InvoicePaymentEditService,
    ) {}

    /**
     * PUT /admin/v2/:location/payments/update/:id
     * Edit a payment (payment section on invoice detail page)
     * Matches legacy PaymentController::actionUpdate($id)
     */
    @Put('update/:id')
    @Roles(RolesEnum.BACKEND_USER)
    async updatePayment(
        @Param('id') paymentId: number,
        @CurrentUser() currentUser: AuthenticatedUser,
        @Body(new ValidationPipe({ whitelist: true, transform: true })) requestDto: UpdateInvoicePaymentRequestDto,
    ): Promise<any> {
        try {
            const isAdmin = currentUser.roles?.includes(RolesEnum.ADMINISTRATOR) ?? false;

            const result = await this.invoicePaymentEditService.updatePayment(
                paymentId,
                requestDto,
                currentUser.id,
                isAdmin,
            );

            return ResponseHelper.success(result, 'Payment updated successfully');
        } catch (error) {
            console.error('Error in updateInvoicePayment controller:', error);

            if (error instanceof NotFoundException) {
                return ResponseHelper.error('NOT_FOUND', error.message);
            }

            if (error instanceof BadRequestException) {
                return ResponseHelper.error('BAD_REQUEST', error.message);
            }

            return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to update payment');
        }
    }
}
