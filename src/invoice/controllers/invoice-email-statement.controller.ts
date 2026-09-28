import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards, ValidationPipe } from '@nestjs/common';
import { InvoiceEmailStatementService } from '../services/invoice-email-statement.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { InvoiceEmailStatementResponseDto } from '../dto/invoice-email-statement-response.dto';
import { SendInvoiceEmailRequestDto } from '../dto/send-invoice-email-request.dto';
import type { AuthenticatedUser } from '../../auth/services/auth.service';

@Controller('admin/v2/:location/invoices')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class InvoiceEmailStatementController {
  constructor(
    private readonly invoiceEmailStatementService: InvoiceEmailStatementService,
  ) {}

  /**
   * GET /admin/v2/:location/invoices/:id/email-statement
   * Fetch invoice email preview data (existing)
   */
  @Get(':id/email-statement')
  @Roles(RolesEnum.BACKEND_USER)
  async getInvoiceEmailStatement(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) invoiceId: number,
  ): Promise<InvoiceEmailStatementResponseDto | any> {
    try {
      const result = await this.invoiceEmailStatementService.getInvoiceEmailStatement(
        locationId,
        invoiceId,
      );

      return ResponseHelper.success(result, 'Invoice email statement retrieved successfully');
    } catch (error) {
      console.error('Error in getInvoiceEmailStatement controller:', error);

      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve invoice email statement');
    }
  }

  /**
   * POST /admin/v2/:location/invoices/:id/send-email
   * Send invoice email to recipients
   *
   * PHP equivalent: EmailController::actionSend()
   */
  @Post(':id/send-email')
  @Roles(RolesEnum.BACKEND_USER)
  async sendInvoiceEmail(
    @LocationId() locationId: number,
    @Param('location') locationSlug: string,
    @Param('id', ParseIntPipe) invoiceId: number,
    @Body(ValidationPipe) sendEmailDto: SendInvoiceEmailRequestDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.invoiceEmailStatementService.sendInvoiceEmail(
        locationSlug,
        locationId,
        invoiceId,
        sendEmailDto,
        currentUser.id,
      );

      return ResponseHelper.success(result, 'Mail has been sent successfully');
    } catch (error) {
      console.error('Error in sendInvoiceEmail controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error.message?.includes('required') || error.message?.includes('Invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to send invoice email');
    }
  }
}

