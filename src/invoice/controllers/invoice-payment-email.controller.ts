import { Controller, Get, Post, Body, Param, ParseIntPipe, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { InvoicePaymentEmailService } from '../services/invoice-payment-email.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { InvoicePaymentEmailResponseDto } from '../dto/invoice-payment-email-response.dto';
import { InvoicePaymentEmailSendRequestDto } from '../dto/invoice-payment-email-send-request.dto';
import type { AuthenticatedUser } from '../../auth/services/auth.service';

@Controller('admin/v2/:location/invoices/payments')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class InvoicePaymentEmailController {
  constructor(
    private readonly invoicePaymentEmailService: InvoicePaymentEmailService,
  ) {}

  @Get(':paymentId/email')
  @Roles(RolesEnum.BACKEND_USER)
  async getPaymentEmail(
    @LocationId() locationId: number,
    @Param('paymentId', ParseIntPipe) paymentId: number,
  ): Promise<InvoicePaymentEmailResponseDto | any> {
    try {
      const result = await this.invoicePaymentEmailService.getPaymentEmail(
        paymentId,
        locationId,
      );

      return ResponseHelper.success(result, 'Payment email retrieved successfully');
    } catch (error) {
      console.error('Error in getPaymentEmail controller:', error);

      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve payment email');
    }
  }

  /**
   * POST /admin/v2/:location/invoices/payments/:paymentId/send-email
   * Send payment email to recipients
   * PHP equivalent: EmailController::actionSend() with objectId = EmailObject::OBJECT_PAYMENT
   */
  @Post(':paymentId/send-email')
  @Roles(RolesEnum.BACKEND_USER)
  async sendPaymentEmail(
    @LocationId() locationId: number,
     @Param('location') locationSlug: string, 
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @Body(ValidationPipe) sendEmailDto: InvoicePaymentEmailSendRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.invoicePaymentEmailService.sendPaymentEmail(
        locationSlug,
        paymentId,
        locationId,
        sendEmailDto,
        currentUser.id,
      );

      return ResponseHelper.success(result, 'Mail has been sent successfully');
    } catch (error) {
      console.error('Error in sendPaymentEmail controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error.message?.includes('required') || error.message?.includes('Invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to send payment email');
    }
  }
}
