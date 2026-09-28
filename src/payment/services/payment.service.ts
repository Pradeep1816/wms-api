import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { PaymentTransformationService } from './transformation/payment-transformation.service';
import { PaymentCalculationService } from './calculation/payment-calculation.service';
import { PaymentListTransformation } from './transformation/payment-list.transformation';
import { PaymentQueryRepository } from '../repositories/payment.repository';
import { PaymentListRepository } from '../repositories/payment-list.repository';
import { CustomerPaymentsRequestDto } from '../dto/payment-request.dto';
import { CustomerPaymentsDataDto, CustomerPaymentResponseDto } from '../dto/payment-response.dto';
import { formatCurrency } from '../../utils/formatters';
import { plainToClass } from 'class-transformer';
import { PaymentsListRequestDto } from '../dto/payments-list-request.dto';
import { PaymentListItemDto, PaymentsListResponseDto } from '../dto/payments-list-response.dto';
@Injectable()
export class PaymentService {
  constructor(
    private readonly paymentRepository: PaymentQueryRepository,
    private readonly paymentListRepository: PaymentListRepository,
    private readonly validationService: CustomerValidationService,
    private readonly transformationService: PaymentTransformationService,
    private readonly calculationService: PaymentCalculationService,
    private readonly paymentListTransformation: PaymentListTransformation,
  ) {}

  async getPayments(
    locationSlug: string,
    query: PaymentsListRequestDto
  ): Promise<PaymentsListResponseDto> {
    try {
      // Default to today's date if not provided
      const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
       
    // Transform query parameters to match repository expectations (same pattern as customer service)
      const repositoryOptions = {
        startDate: query.startDate || today,
        endDate: query.endDate || today,
        page: query.page,
        limit: query.limit,
        number: query.number,
        customer: query.customer,
        paymentMethod: query.paymentMethod,
        amount: query.amount,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder?.toLowerCase() as 'asc' | 'desc' | undefined,
      };

      const { payments, total } = await this.paymentListRepository.getPaymentsByLocationSlug(
        locationSlug,
        repositoryOptions,
      );

      // Transform payments to DTOs
      const transformedPayments = this.paymentListTransformation.transformPaymentList(payments);

      const pagination = this.calculationService.calculatePagination(total, query.page, query.limit);

      return {
        body: transformedPayments,
        pagination,
      };
    } catch (error) {
      console.error('Error in getPayments service:', error);
      throw new BadRequestException(`Failed to retrieve payments: ${error.message}`);
    }
  }

  async getCustomerPayments(
    customerId: number, 
    locationSlug: string, 
    query?: CustomerPaymentsRequestDto
  ): Promise<CustomerPaymentsDataDto> {
    try {
       // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Get payments with optional order/sort (default: date DESC to preserve existing behavior)
      const orderBy = query?.orderBy ?? 'date';
      const order = query?.order ?? 'DESC';
      const payments = await this.paymentRepository.getCustomerPayments(customerId, locationId, orderBy, order);
      
      // Transform payments to DTOs
      const paymentDtos = this.transformationService.transformPaymentsToDtos(payments);

      // Calculate total remaining amount
      const totalRemaining = this.calculationService.calculateTotalRemaining(paymentDtos);
      const formattedRemaining = formatCurrency(totalRemaining);

      // Calculate pagination
      const page = query?.page || 1;
      const limit = query?.limit || 10;
      const pagination = this.calculationService.calculatePagination(paymentDtos.length, page, limit);
      const paginatedPayments = this.calculationService.applyPagination(paymentDtos, page, limit);

      //  apply @Transform decorators
      const paymentsData = paginatedPayments.map(payment => 
        plainToClass(CustomerPaymentResponseDto, payment, { excludeExtraneousValues: true })
      );

      // Return response
      return {
        body: paymentsData,
        footer: [{ totalRemaining: formattedRemaining }],
        pagination,
      };
    } catch (error) {
      console.error('Error in getCustomerPayments service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve customer payments: ${error.message}`);
    }
  }

}
