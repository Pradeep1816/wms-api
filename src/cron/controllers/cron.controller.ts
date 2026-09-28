import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AuthenticatedUser } from '../../auth/services/auth.service';
import { CustomerBalanceCronService } from '../services/customer-balance-cron.service';
import { CustomerStatusCronService } from '../services/customer-status-cron.service';
import { EmailAutoEmailCronService } from '../services/email-auto-email-cron.service';
import { EnrolmentAutoRenewalCronService } from '../services/enrolment-auto-renewal-cron.service';
import { InvoiceAllCompletedLessonsCronService } from '../services/invoice-all-completed-lessons-cron.service';
import { InvoiceAllExpiredLessonsCronService } from '../services/invoice-all-expired-lessons-cron.service';
import { InvoiceEquipmentRentalsCronService } from '../services/invoice-equipment-rentals-cron.service';
import { RecurringPaymentCreateCronService } from '../services/recurring-payment-create-cron.service';
import { RecurringPaymentUpdateCronService } from '../services/recurring-payment-update-cron.service';
import { StudentStatusCronService } from '../services/student-status-cron.service';

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Controller('admin/v2/cron')
@UseGuards(AuthGuard, RolesGuard)
export class CronController {
  constructor(
    private readonly customerBalanceCronService: CustomerBalanceCronService,
    private readonly customerStatusCronService: CustomerStatusCronService,
    private readonly emailAutoEmailCronService: EmailAutoEmailCronService,
    private readonly enrolmentAutoRenewalCronService: EnrolmentAutoRenewalCronService,
    private readonly invoiceAllCompletedLessonsCronService: InvoiceAllCompletedLessonsCronService,
    private readonly invoiceAllExpiredLessonsCronService: InvoiceAllExpiredLessonsCronService,
    private readonly invoiceEquipmentRentalsCronService: InvoiceEquipmentRentalsCronService,
    private readonly recurringPaymentCreateCronService: RecurringPaymentCreateCronService,
    private readonly recurringPaymentUpdateCronService: RecurringPaymentUpdateCronService,
    private readonly studentStatusCronService: StudentStatusCronService,
  ) {}

  @Get('jobs')
  @Roles(RolesEnum.ADMINISTRATOR)
  async getJobs() {
    try {
      return ResponseHelper.success(
        {
          jobs: [
            this.customerBalanceCronService.getJobMetadata(),
            this.customerStatusCronService.getJobMetadata(),
            this.emailAutoEmailCronService.getJobMetadata(),
            this.enrolmentAutoRenewalCronService.getJobMetadata(),
            this.invoiceAllCompletedLessonsCronService.getJobMetadata(),
            this.invoiceAllExpiredLessonsCronService.getJobMetadata(),
            this.invoiceEquipmentRentalsCronService.getJobMetadata(),
            this.recurringPaymentCreateCronService.getJobMetadata(),
            this.recurringPaymentUpdateCronService.getJobMetadata(),
            ...this.studentStatusCronService.getJobMetadata(),
          ],
        },
        'Cron jobs retrieved successfully',
      );
    } catch (error) {
      console.error('Error in getJobs controller:', error);
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve cron jobs');
    }
  }

  @Post('customer-balance/run')
  @Roles(RolesEnum.ADMINISTRATOR)
  async runCustomerBalance(@Req() req: AuthenticatedRequest) {
    try {
      const result = await this.customerBalanceCronService.runManually(req.user.id);
      return ResponseHelper.success(result, 'Customer balance cron executed successfully');
    } catch (error) {
      console.error('Error in runCustomerBalance controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error instanceof Error ? error.message : 'Failed to execute customer balance cron',
      );
    }
  }

  @Post('customer-status/run')
  @Roles(RolesEnum.ADMINISTRATOR)
  async runCustomerStatus(@Req() req: AuthenticatedRequest) {
    try {
      const result = await this.customerStatusCronService.runManually(req.user.id);
      return ResponseHelper.success(result, 'Customer status cron executed successfully');
    } catch (error) {
      console.error('Error in runCustomerStatus controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error instanceof Error ? error.message : 'Failed to execute customer status cron',
      );
    }
  }

  @Post('email-auto-email/run')
  @Roles(RolesEnum.ADMINISTRATOR)
  async runEmailAutoEmail(@Req() req: AuthenticatedRequest) {
    try {
      const result = await this.emailAutoEmailCronService.runManually(req.user.id);
      return ResponseHelper.success(result, 'Email auto email cron executed successfully');
    } catch (error) {
      console.error('Error in runEmailAutoEmail controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error instanceof Error ? error.message : 'Failed to execute email auto email cron',
      );
    }
  }

  @Post('enrolment-auto-renewal/run')
  @Roles(RolesEnum.ADMINISTRATOR)
  async runEnrolmentAutoRenewal(@Req() req: AuthenticatedRequest) {
    try {
      const result = await this.enrolmentAutoRenewalCronService.runManually(req.user.id);
      return ResponseHelper.success(result, 'Enrolment auto renewal cron executed successfully');
    } catch (error) {
      console.error('Error in runEnrolmentAutoRenewal controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error instanceof Error
          ? error.message
          : 'Failed to execute enrolment auto renewal cron',
      );
    }
  }

  @Post('invoice-all-completed-lessons/run')
  @Roles(RolesEnum.ADMINISTRATOR)
  async runInvoiceAllCompletedLessons(@Req() req: AuthenticatedRequest) {
    try {
      const result = await this.invoiceAllCompletedLessonsCronService.runManually(
        req.user.id,
      );
      return ResponseHelper.success(
        result,
        'Invoice all completed lessons cron executed successfully',
      );
    } catch (error) {
      console.error('Error in runInvoiceAllCompletedLessons controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error instanceof Error
          ? error.message
          : 'Failed to execute invoice all completed lessons cron',
      );
    }
  }

  @Post('invoice-all-expired-lessons/run')
  @Roles(RolesEnum.ADMINISTRATOR)
  async runInvoiceAllExpiredLessons(@Req() req: AuthenticatedRequest) {
    try {
      const result = await this.invoiceAllExpiredLessonsCronService.runManually(
        req.user.id,
      );
      return ResponseHelper.success(
        result,
        'Invoice all expired lessons cron executed successfully',
      );
    } catch (error) {
      console.error('Error in runInvoiceAllExpiredLessons controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error instanceof Error
          ? error.message
          : 'Failed to execute invoice all expired lessons cron',
      );
    }
  }

  @Post('invoice-equipment-rentals/run')
  @Roles(RolesEnum.ADMINISTRATOR)
  async runInvoiceEquipmentRentals(@Req() req: AuthenticatedRequest) {
    try {
      const result = await this.invoiceEquipmentRentalsCronService.runManually(
        req.user.id,
      );
      return ResponseHelper.success(
        result,
        'Invoice equipment rentals cron executed successfully',
      );
    } catch (error) {
      console.error('Error in runInvoiceEquipmentRentals controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error instanceof Error
          ? error.message
          : 'Failed to execute invoice equipment rentals cron',
      );
    }
  }

  @Post('recurring-payment-create/run')
  @Roles(RolesEnum.ADMINISTRATOR)
  async runRecurringPaymentCreate(@Req() req: AuthenticatedRequest) {
    try {
      const result = await this.recurringPaymentCreateCronService.runManually(
        req.user.id,
      );
      return ResponseHelper.success(
        result,
        'Recurring payment create cron executed successfully',
      );
    } catch (error) {
      console.error('Error in runRecurringPaymentCreate controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error instanceof Error
          ? error.message
          : 'Failed to execute recurring payment create cron',
      );
    }
  }

  @Post('recurring-payment-update-recurring-payments/run')
  @Roles(RolesEnum.ADMINISTRATOR)
  async runRecurringPaymentUpdate(@Req() req: AuthenticatedRequest) {
    try {
      const result = await this.recurringPaymentUpdateCronService.runManually(
        req.user.id,
      );
      return ResponseHelper.success(
        result,
        'Recurring payment update cron executed successfully',
      );
    } catch (error) {
      console.error('Error in runRecurringPaymentUpdate controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error instanceof Error
          ? error.message
          : 'Failed to execute recurring payment update cron',
      );
    }
  }

  @Post('student-status-production/run')
  @Roles(RolesEnum.ADMINISTRATOR)
  async runStudentStatusProduction(@Req() req: AuthenticatedRequest) {
    try {
      const result = await this.studentStatusCronService.runProductionManually(req.user.id);
      return ResponseHelper.success(result, 'Student status production cron executed successfully');
    } catch (error) {
      console.error('Error in runStudentStatusProduction controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error instanceof Error ? error.message : 'Failed to execute student status production cron',
      );
    }
  }

  @Post('student-status-non-production/run')
  @Roles(RolesEnum.ADMINISTRATOR)
  async runStudentStatusNonProduction(@Req() req: AuthenticatedRequest) {
    try {
      const result = await this.studentStatusCronService.runNonProductionManually(req.user.id);
      return ResponseHelper.success(result, 'Student status non-production cron executed successfully');
    } catch (error) {
      console.error('Error in runStudentStatusNonProduction controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error instanceof Error ? error.message : 'Failed to execute student status non-production cron',
      );
    }
  }
}
