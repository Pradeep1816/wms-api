import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from "@nestjs/common";
import { Roles } from "src/auth/decorators/roles.decorator";
import { RolesEnum } from "src/auth/enums/roles.enum";
import { AuthGuard } from "src/auth/guards/auth.guard";
import { RolesGuard } from "src/auth/guards/roles.guard";
import { LocationResolveGuard } from "../../shared/guards/location.guard";
import { PaymentMethodService } from "../services/payment-method.service";
import { PaymentFrequencyService } from "../services/payment-frequency.service";
import { PaymentService } from "../services/payment.service";
import { PaymentEditInfoLessonsService } from "../services/payment-edit-info-lessons.service";
import { PaymentEditInfoGroupLessonsService } from "../services/payment-edit-info-group-lessons.service";
import { PaymentEditInfoInvoicesService } from "../services/payment-edit-info-invoices.service";
import { PaymentEditInfoUsedService } from "../services/payment-used.service";
import { ResponseHelper } from "../../shared/helpers/response.helper";
import { PaymentsListRequestDto } from "../dto/payments-list-request.dto";
import { PaymentEditInfoRequestDto } from "../dto/payment-edit-info-request.dto";


@Controller('admin/v2/:location')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class PaymentController {
  constructor(
    private readonly paymentMethodService: PaymentMethodService,
    private readonly paymentFrequencyService: PaymentFrequencyService,
    private readonly paymentService: PaymentService,
    private readonly paymentEditInfoLessonsService: PaymentEditInfoLessonsService,
    private readonly paymentEditInfoGroupLessonsService: PaymentEditInfoGroupLessonsService,
    private readonly paymentEditInfoInvoicesService: PaymentEditInfoInvoicesService,
    private readonly paymentEditInfoUsedService: PaymentEditInfoUsedService,
  ) {}

  @Get('payment-methods')
  @Roles(RolesEnum.BACKEND_USER)
  async getPaymentMethods(@Param('location') locationSlug: string) {
    try {
      const data = await this.paymentMethodService.getPaymentMethods(locationSlug);
      return ResponseHelper.success(data, 'Payment methods retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve payment methods');
    }
  }

  @Get('payment-frequencies')
  @Roles(RolesEnum.BACKEND_USER)
  async getPaymentFrequencies(@Param('location') locationSlug: string) {
    try {
      const data = await this.paymentFrequencyService.getPaymentFrequencies(locationSlug);
      return ResponseHelper.success(data, 'Payment frequencies retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve payment frequencies');
    }
  }

  // Get all payments
  @Get('payments')
  @Roles(RolesEnum.BACKEND_USER)
  async getPayments(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: PaymentsListRequestDto,
  ) {
    try {
      const data = await this.paymentService.getPayments(locationSlug, query);
      return ResponseHelper.success(data, 'Payments fetched successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to fetch payments');
    }
  }

  @Get('payment/:id/info/lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getPaymentEditInfoLessons(
    @Param('location') locationSlug: string,
    @Param('id') paymentId: number,
    @Query(ValidationPipe) query: PaymentEditInfoRequestDto,
  ) {
    try {
      const data = await this.paymentEditInfoLessonsService.getPaymentEditInfoLessons(
        locationSlug,
        paymentId,
        query.page,
        query.limit,
      );
      return ResponseHelper.success(data, 'Payment lessons retrieved successfully');
    } catch (error) {
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve payment lessons');
    }
  }

  @Get('payment/:id/info/group-lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getPaymentEditInfoGroupLessons(
    @Param('location') locationSlug: string,
    @Param('id') paymentId: number,
    @Query(ValidationPipe) query: PaymentEditInfoRequestDto,
  ) {
    try {
      const data = await this.paymentEditInfoGroupLessonsService.getPaymentEditInfoGroupLessons(
        locationSlug,
        paymentId,
        query.page,
        query.limit,
      );
      return ResponseHelper.success(data, 'Payment group lessons retrieved successfully');
    } catch (error) {
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve payment group lessons');
    }
  }

  @Get('payment/:id/info/invoices')
  @Roles(RolesEnum.BACKEND_USER)
  async getPaymentEditInfoInvoices(
    @Param('location') locationSlug: string,
    @Param('id') paymentId: number,
    @Query(ValidationPipe) query: PaymentEditInfoRequestDto,
  ) {
    try {
      const data = await this.paymentEditInfoInvoicesService.getPaymentEditInfoInvoices(
        locationSlug,
        paymentId,
        query.page,
        query.limit,
      );
      return ResponseHelper.success(data, 'Payment invoices retrieved successfully');
    } catch (error) {
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve payment invoices');
    }
  }

  // Get payment used information
  @Get('payment/:id/info/payment-used')
  @Roles(RolesEnum.BACKEND_USER)
  async getPaymentEditInfoUsed(
    @Param('location') locationSlug: string,
    @Param('id') paymentId: number,
  ) {
    try {
      const data = await this.paymentEditInfoUsedService.getPaymentUsed(
        locationSlug,
        paymentId,
      );
      return ResponseHelper.success(data, 'Payment used retrieved successfully');
    } catch (error) {
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve payment used');
    }
  }

  
}