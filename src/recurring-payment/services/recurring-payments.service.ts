import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { RecurringPaymentsRepository } from '../repositories/recurring-payments.repository';
import { RecurringPaymentsListTransformationService } from './recurring-payments-list-transformation.service';
import { CustomerRecurringPaymentCalculationService } from './customer-recurring-payment-calculation.service';
import { RecurringPaymentsListRequestDto } from '../dto/recurring-payments-list-request.dto';
import { RecurringPaymentsListResponseDto } from '../dto/recurring-payments-list-response.dto';
import { CustomerRecurringPaymentRepository } from '../repositories/customer-recurring-payment.repository';

@Injectable()
export class RecurringPaymentsService {
  constructor(
    private readonly recurringPaymentsRepository: RecurringPaymentsRepository,
    private readonly listTransformationService: RecurringPaymentsListTransformationService,
    private readonly calculationService: CustomerRecurringPaymentCalculationService,
    private readonly customerRecurringPaymentRepository: CustomerRecurringPaymentRepository,
  ) {}

  /**
   * Get all recurring payments by location with pagination and sorting
   */
  async getRecurringPayments(
    locationId: number,
    query: RecurringPaymentsListRequestDto,
  ): Promise<RecurringPaymentsListResponseDto> {
    try {
      // Transform query parameters to match repository expectations
      const repositoryOptions = {
        page: query.page,
        limit: query.limit,
        showActive: query.showActive,
        showInactive: query.showInactive,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder?.toLowerCase() as 'asc' | 'desc' | undefined,
      };

      const { recurringPayments, total } =
        await this.recurringPaymentsRepository.getRecurringPaymentsByLocationId(
          locationId,
          repositoryOptions,
        );

      const warningPaymentIds =
        await this.customerRecurringPaymentRepository
          .getRecurringPaymentIdsWithEnrolmentLinkWarnings(
            recurringPayments.map((payment) => payment.id),
            locationId,
          )
          .catch((error: unknown) => {
            console.warn(
              `Unable to check enrolment links for recurring-payment list at location ${locationId}:`,
              error,
            );
            return new Set<number>();
          });

      // Transform recurring payments to DTOs
      const transformedRecurringPayments =
        this.listTransformationService.transformRecurringPaymentsList(
          recurringPayments,
          warningPaymentIds,
        );

      const pagination = this.calculationService.calculatePagination(
        total,
        query.page,
        query.limit,
      );

      return {
        body: transformedRecurringPayments,
        pagination,
      };
    } catch (error) {
      console.error('Error in getRecurringPayments service:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to retrieve recurring payments: ${error.message}`,
      );
    }
  }
}
