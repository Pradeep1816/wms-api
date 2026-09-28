import { Controller, Get, Put, Param, ParseIntPipe, UseGuards, Body, Req, ValidationPipe } from '@nestjs/common';
import { EnrolmentPaymentFrequencyResponseDto } from '../dto/enrolment-payment-frequency-response.dto';
import { EnrolmentPaymentFrequencyService } from '../services/enrolment-payment-frequency.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { ChangePaymentFrequencyRequestDto } from '../dto/change-payment-frequency-request.dto';

@Controller('admin/v2/:location/enrolments')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class EnrolmentPaymentFrequencyController {
  constructor(
    private readonly enrolmentPaymentFrequencyService: EnrolmentPaymentFrequencyService,
  ) {}

  @Get(':id/payment-frequency')
  @Roles(RolesEnum.BACKEND_USER)
  async getPaymentFrequency(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<EnrolmentPaymentFrequencyResponseDto | any> {
    try {
      const result = await this.enrolmentPaymentFrequencyService.getPaymentFrequency(
        locationId,
        id,
      );
      return ResponseHelper.success(result, 'Payment Frequency retrieved successfully');
    } catch (error) {
      console.error('Error in getPaymentFrequency controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve payment frequency');
    }
  }

  @Put(':id/payment-frequency')
  @Roles(RolesEnum.BACKEND_USER)
  async changePaymentFrequency(
    @LocationId() locationId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) body: ChangePaymentFrequencyRequestDto,
    @Req() req: any,
  ): Promise<any> {
    try {
      const loggedUserId = req.user?.id;
      if (!loggedUserId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const result = await this.enrolmentPaymentFrequencyService.changePaymentFrequency(
        locationId,
        id,
        body,
        loggedUserId,
      );


      return ResponseHelper.success(result, 'Payment frequency changed successfully');
    } catch (error) {
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message?.includes('required') || error.message?.includes('Invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', error.message || 'Failed to change payment frequency');
    }
  }
}

