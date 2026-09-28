import { CustomerRecurringPaymentRequestDto } from '../dto/customer-recurring-payment-request.dto';
import { CustomerRecurringPaymentsDataDto } from '../dto/customer-recurring-payment-response.dto';

export interface IRecurringPaymentQueryService {
  getRecurringPaymentsByCustomerId(
    locationSlug: string,
    customerId: number,
    query: CustomerRecurringPaymentRequestDto,
  ): Promise<CustomerRecurringPaymentsDataDto>;
}

export interface IRecurringPaymentTransformationService {
  transformToDto(recurringPayment: any, hasEnrolmentWarning?: boolean): any;
  transformRecurringPaymentsToDtos(
    recurringPayments: any[],
    warningPaymentIds?: Set<number>,
  ): any[];
}

export interface IRecurringPaymentCalculationService {
  calculateNextPaymentDate(paymentDay: number, nextEntryDay: Date): string;
  calculatePagination(total: number, page: number, limit: number): {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
