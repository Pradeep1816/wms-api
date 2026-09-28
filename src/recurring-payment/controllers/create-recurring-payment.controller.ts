import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
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
import { CreateCustomerRecurringPaymentDto } from '../dto/create-recurring-payment-request.dto';
import { CreateRecurringPaymentService } from '../services/create-recurring-payment.service';

/**
 * Controller for creating recurring payments
 */
@Controller('admin/v2/:location/recurring-payments')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class CreateRecurringPaymentController {
  constructor(
    private readonly createRecurringPaymentService: CreateRecurringPaymentService,
  ) {}

  /**
   * Get create form data with default values
   * 
   * Legacy equivalent: CustomerRecurringPaymentController::actionCreate() GET
   */
  @Get('create/info')
  @Roles(RolesEnum.BACKEND_USER)
  async getCreateData(
    @Param('location') locationSlug: string,
    @Query('customerId', ParseIntPipe) customerId: number,
  ): Promise<any> {
    try {
      const data =
        await this.createRecurringPaymentService.getCreateFormData(
          locationSlug,
          customerId,
        );

      return ResponseHelper.success(
        data,
        'Create form data retrieved successfully',
      );
    } catch (error) {
      console.error('Error in getCreateData:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error.message || 'Failed to retrieve create form data',
      );
    }
  }

  /**
   * Create a new recurring payment
   * 
   */
  @Post('create')
  @Roles(RolesEnum.BACKEND_USER)
  async createRecurringPayment(
    @Param('location') locationSlug: string,
    @Body(ValidationPipe) createDto: CreateCustomerRecurringPaymentDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result =
        await this.createRecurringPaymentService.createRecurringPayment(
          locationSlug,
          createDto,
          userId,
        );

      return ResponseHelper.success(
        result,
        'Recurring payment created successfully',
      );
    } catch (error) {
      console.error('Error in createRecurringPayment:', error);
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to create recurring payment',
      );
    }
  }
}
