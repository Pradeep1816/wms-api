import { Controller, Get, Param, Query, ParseIntPipe, UseGuards, ValidationPipe } from '@nestjs/common';
import { LessonPaymentService } from '../services/lesson-payment.service';
import { LessonPaymentResponseDto } from '../dto/lesson-payment-response.dto';
import { LessonPaymentRequestDto } from '../dto/lesson-payment-request.dto';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { ResponseHelper } from '../../shared/helpers/response.helper';

@Controller('admin/v2/:location/private-lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class LessonPaymentController {
  constructor(
    private readonly lessonPaymentService: LessonPaymentService,
  ) {}

  //Get lesson payments
  @Get('payment/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async getLessonPayment(
    @Param('id', ParseIntPipe) id: number,
    @Query(ValidationPipe) query: LessonPaymentRequestDto,
  ): Promise<LessonPaymentResponseDto | any> {
    try {
      const result = await this.lessonPaymentService.getLessonPayments(
        id,
        query.sort,
        query.order,
      );
      return ResponseHelper.success(result, 'Lesson payments retrieved successfully');
    } catch (error) {
      console.error('Error in getLessonPayment controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve lesson payments');
    }
  }
}
