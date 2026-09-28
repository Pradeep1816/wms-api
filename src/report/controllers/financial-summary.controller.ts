import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { FinancialSummaryRequestDto } from '../dto/financial-summary-dto/financial-summary.request.dto';
import { FinancialSummaryResponseDto } from '../dto/financial-summary-dto/financial-summary.response.dto';
import { PrepaidFutureGroupLessonsService } from '../services/financial-summary-service/prepaid-future-group-lessons.service';
import { PaidUnscheduledGroupLessonsService } from '../services/financial-summary-service/paid-unscheduled-group-lessons.service';
import { PrepaidFuturePrivateLessonsService } from '../services/financial-summary-service/prepaid-future-private-lessons.service';
import { PaidUnscheduledPrivateLessonsService } from '../services/financial-summary-service/paid-unscheduled-private-lessons.service';
import { ActiveOutstandingInvoicesService } from '../services/financial-summary-service/active-outstanding-invoices.service';
import { InactiveOutstandingInvoicesService } from '../services/financial-summary-service/inactive-outstanding-invoices.service';
import { ActiveCustomersWithCreditService } from '../services/financial-summary-service/active-customers-with-credit.service';
import { InactiveCustomersWithCreditService } from '../services/financial-summary-service/inactive-customers-with-credit.service';
import { GenerateSummaryService } from '../services/financial-summary-service/generate-summary.service';

@Controller('admin/v2/:location/report/financial-summary')
@UseGuards(AuthGuard, RolesGuard)
export class FinancialSummaryController {
  constructor(
    private readonly prepaidFutureGroupLessonsService: PrepaidFutureGroupLessonsService,
    private readonly paidUnscheduledGroupLessonsService: PaidUnscheduledGroupLessonsService,
    private readonly prepaidFuturePrivateLessonsService: PrepaidFuturePrivateLessonsService,
    private readonly paidUnscheduledPrivateLessonsService: PaidUnscheduledPrivateLessonsService,
    private readonly activeOutstandingInvoicesService: ActiveOutstandingInvoicesService,
    private readonly inactiveOutstandingInvoicesService: InactiveOutstandingInvoicesService,
    private readonly activeCustomersWithCreditService: ActiveCustomersWithCreditService,
    private readonly inactiveCustomersWithCreditService: InactiveCustomersWithCreditService,
    private readonly generateSummaryService: GenerateSummaryService,
  ) {}

  @Get('prepaid-future-group-lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getPrepaidFutureGroupLessons(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: FinancialSummaryRequestDto,
  ): Promise<FinancialSummaryResponseDto | any> {
    try {
      const data = await this.prepaidFutureGroupLessonsService.getPrepaidFutureGroupLessons(
        locationSlug,
        query.goToDate,
        query.page,
        query.limit,
      );
      return ResponseHelper.success(data, 'Prepaid future group lessons retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve prepaid future group lessons');
    }
  }

  @Get('paid-unscheduled-group-lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getPaidUnscheduledGroupLessons(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: FinancialSummaryRequestDto,
  ): Promise<FinancialSummaryResponseDto | any> {
    try {
      const data = await this.paidUnscheduledGroupLessonsService.getPaidUnscheduledGroupLessons(
        locationSlug,
        query.goToDate,
        query.page,
        query.limit,
      );
      return ResponseHelper.success(data, 'Paid unscheduled group lessons retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve paid unscheduled group lessons');
    }
  }

  @Get('prepaid-future-private-lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getPrepaidFuturePrivateLessons(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: FinancialSummaryRequestDto,
  ): Promise<FinancialSummaryResponseDto | any> {
    try {
      const data = await this.prepaidFuturePrivateLessonsService.getPrepaidFuturePrivateLessons(
        locationSlug,
        query.goToDate,
        query.page,
        query.limit,
      );
      return ResponseHelper.success(data, 'Prepaid future private lessons retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve prepaid future private lessons');
    }
  }

  @Get('paid-unscheduled-private-lessons')
  @Roles(RolesEnum.BACKEND_USER)
  async getPaidUnscheduledPrivateLessons(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: FinancialSummaryRequestDto,
  ): Promise<FinancialSummaryResponseDto | any> {
    try {
      const data = await this.paidUnscheduledPrivateLessonsService.getPaidUnscheduledPrivateLessons(
        locationSlug,
        query.goToDate,
        query.page,
        query.limit,
      );
      return ResponseHelper.success(data, 'Paid unscheduled private lessons retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve paid unscheduled private lessons');
    }
  }

  @Get('active-outstanding-invoices')
  @Roles(RolesEnum.BACKEND_USER)
  async getActiveOutstandingInvoices(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: FinancialSummaryRequestDto,
  ): Promise<FinancialSummaryResponseDto | any> {
    try {
      const data = await this.activeOutstandingInvoicesService.getActiveOutstandingInvoices(
        locationSlug,
        query.page,
        query.limit,
      );
      return ResponseHelper.success(data, 'Active outstanding invoices retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve active outstanding invoices');
    }
  }

  @Get('inactive-outstanding-invoices')
  @Roles(RolesEnum.BACKEND_USER)
  async getInactiveOutstandingInvoices(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: FinancialSummaryRequestDto,
  ): Promise<FinancialSummaryResponseDto | any> {
    try {
      const data = await this.inactiveOutstandingInvoicesService.getInactiveOutstandingInvoices(
        locationSlug,
        query.page,
        query.limit,
      );
      return ResponseHelper.success(data, 'Inactive outstanding invoices retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve inactive outstanding invoices');
    }
  }

  @Get('active-customers-with-credit')
  @Roles(RolesEnum.BACKEND_USER)
  async getActiveCustomersWithCredit(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: FinancialSummaryRequestDto,
  ): Promise<FinancialSummaryResponseDto | any> {
    try {
      const data = await this.activeCustomersWithCreditService.getActiveCustomersWithCredit(
        locationSlug,
        query.page,
        query.limit,
      );
      return ResponseHelper.success(data, 'Active customers with credit retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve active customers with credit');
    }
  }

  @Get('inactive-customers-with-credit')
  @Roles(RolesEnum.BACKEND_USER)
  async getInactiveCustomersWithCredit(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: FinancialSummaryRequestDto,
  ): Promise<FinancialSummaryResponseDto | any> {
    try {
      const data = await this.inactiveCustomersWithCreditService.getInactiveCustomersWithCredit(
        locationSlug,
        query.page,
        query.limit,
      );
      return ResponseHelper.success(data, 'Inactive customers with credit retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve inactive customers with credit');
    }
  }

  @Get('summary')
  @Roles(RolesEnum.BACKEND_USER)
  async getFinancialSummary(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: FinancialSummaryRequestDto,
  ): Promise<any> {
    try {
      const data = await this.generateSummaryService.getFinancialSummary(
        locationSlug,
        query.goToDate,
      );
      return ResponseHelper.success(data, 'Financial summary statistics retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve financial summary statistics');
    }
  }
}


