import {
  BadRequestException,
  Body,
  Get,
  ParseIntPipe,
  Controller,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { ReceivePaymentRequestDto } from '../dto/receive-payment-request.dto';
import { ReceivePaymentResponseDto } from '../dto/receive-payment-response.dto';
import { InvoiceReceivePaymentService } from '../services/receive-payment.service';

@Controller('admin/v2/:location/payments')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class InvoiceReceivePaymentController {
  constructor(private readonly invoiceReceivePaymentService: InvoiceReceivePaymentService) {}

  @Get('receive-policy/:customerId')
  @Roles(RolesEnum.BACKEND_USER)
  async receivePolicy(@Param('location') slug: string, @Param('customerId', ParseIntPipe) customerId: number) {
    return ResponseHelper.success(await this.invoiceReceivePaymentService.getCheckoutPolicy(slug, customerId));
  }

  @Post('receive')
  @Roles(RolesEnum.BACKEND_USER)
  async saveReceivePayment(
    @Param('location') locationSlug: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    requestDto: ReceivePaymentRequestDto,
  ): Promise<ReceivePaymentResponseDto | any> {
    try {
      const isAdmin = currentUser.roles?.includes(RolesEnum.ADMINISTRATOR) ?? false;
      const result = await this.invoiceReceivePaymentService.saveReceivePayment(
        locationSlug,
        requestDto,
        currentUser.id,
        isAdmin,
      );

      return ResponseHelper.success(result, 'Receive payment saved successfully');
    } catch (error) {
      if (error instanceof NotFoundException || error?.status === 404 || error?.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error instanceof BadRequestException || error?.status === 400) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error('INTERNAL_SERVER_ERROR', error.message || 'Failed to save receive payment');
    }
  }
}
