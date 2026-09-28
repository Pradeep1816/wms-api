import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Put,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { UpdateCustomerRecurringPaymentDto } from '../dto/update-recurring-payment.dto';
import { RecurringPaymentUpdateService } from '../services/recurring-payment-update.service';

@Controller('admin/v2/:location/recurring-payments')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class RecurringPaymentUpdateController {
  constructor(
    private readonly recurringPaymentUpdateService: RecurringPaymentUpdateService,
  ) {}

  @Get(':id/info')
  @Roles(RolesEnum.BACKEND_USER)
  async getRecurringPaymentUpdateInfo(
    @Param('location') locationSlug: string,
    @Param('id', ParseIntPipe) recurringPaymentId: number,
  ): Promise<any> {
    try {
      const data =
        await this.recurringPaymentUpdateService.getUpdateFormData(
          locationSlug,
          recurringPaymentId,
        );

      return ResponseHelper.success(
        data,
        'Recurring payment info retrieved successfully',
      );
    } catch (error) {
      console.error('Error in getRecurringPaymentUpdateInfo:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error.message || 'Failed to retrieve recurring payment update info',
      );
    }
  }

  @Put(':id/update')
  @Roles(RolesEnum.BACKEND_USER)
  async updateRecurringPayment(
    @Param('location') locationSlug: string,
    @Param('id', ParseIntPipe) recurringPaymentId: number,
    @Body(ValidationPipe) updateDto: UpdateCustomerRecurringPaymentDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result =
        await this.recurringPaymentUpdateService.updateRecurringPayment(
          locationSlug,
          recurringPaymentId,
          updateDto,
          userId,
        );

      return ResponseHelper.success(
        result,
        'Recurring payment updated successfully',
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to update recurring payment',
      );
    }
  }
}
