import {
  Controller,
  Get,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { RecurringPaymentsService } from '../services/recurring-payments.service';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { RecurringPaymentsListRequestDto } from '../dto/recurring-payments-list-request.dto';

@Controller('admin/v2/:location')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class RecurringPaymentController {
  constructor(
    private readonly recurringPaymentsService: RecurringPaymentsService,
  ) {}

  @Get('recurring-payments')
  @Roles(RolesEnum.BACKEND_USER)
  async getRecurringPayments(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: RecurringPaymentsListRequestDto,
  ) {
    try {
      const data = await this.recurringPaymentsService.getRecurringPayments(
        locationId,
        query,
      );
      return ResponseHelper.success(
        data,
        'Recurring payments retrieved successfully',
      );
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(
        error.message || 'Failed to retrieve recurring payments',
      );
    }
  }
}
