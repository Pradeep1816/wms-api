import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { CustomerRecurringPaymentRepository } from '../repositories/customer-recurring-payment.repository';
import { CustomerRecurringPaymentTransformationService } from './customer-recurring-payment-transformation.service';
import { CustomerRecurringPaymentCalculationService } from './customer-recurring-payment-calculation.service';
import { CustomerRecurringPaymentInfoTransformationService } from './customer-recurring-payment-info-transformation.service';
import { CustomerRecurringPaymentRequestDto } from '../dto/customer-recurring-payment-request.dto';
import { CustomerRecurringPaymentInfoRequestDto } from '../dto/customer-recurring-payment-info-request.dto';
import { CustomerRecurringPaymentsDataDto } from '../dto/customer-recurring-payment-response.dto';
import {RecurringPaymentInfoDataDto, RecurringPaymentInfoResponseDto } from '../dto/customer-recurring-payment-info-response.dto';
import { CustomerRecurringPayment } from '../entities/customer-recurring-payment.entity';
import { IRecurringPaymentQueryService } from '../interfaces/customer-recurring-payment-service.interface';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';

@Injectable()
export class CustomerRecurringPaymentService implements IRecurringPaymentQueryService {
  constructor(
    private readonly customerRecurringPaymentRepository: CustomerRecurringPaymentRepository,
    private readonly transformationService: CustomerRecurringPaymentTransformationService,
    private readonly calculationService: CustomerRecurringPaymentCalculationService,
    private readonly infoTransformationService: CustomerRecurringPaymentInfoTransformationService,
    private readonly validationService: CustomerValidationService,
  ) {}

  async getRecurringPaymentsByCustomerId(
    locationSlug: string,
    customerId: number,
    query: CustomerRecurringPaymentRequestDto,
  ): Promise<CustomerRecurringPaymentsDataDto> {
    try {
      // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Get recurring payments with pagination
      const { recurringPayments, total } = await this.customerRecurringPaymentRepository.getRecurringPaymentsByCustomerId(
        customerId,
        query.page || 1,
        query.limit || 10,
      );

      const warningPaymentIds =
        await this.customerRecurringPaymentRepository
          .getRecurringPaymentIdsWithEnrolmentLinkWarnings(
            recurringPayments.map((payment) => payment.id),
            locationId,
          )
          .catch((error: unknown) => {
            console.warn(
              `Unable to check enrolment links for customer ${customerId}:`,
              error,
            );
            return new Set<number>();
          });

      // Transform recurring payments to DTOs using transformation service
      const recurringPaymentData = this.transformationService.transformRecurringPaymentsToDtos(recurringPayments, warningPaymentIds);

      // Calculate pagination using calculation service
      const pagination = this.calculationService.calculatePagination(
        total,
        query.page || 1,
        query.limit || 10
      );

      return {
        body: recurringPaymentData,
        pagination,
      };
    } catch (error) {
      console.error('Error in getRecurringPaymentsByCustomerId service:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve recurring payments: ${error.message}`);
    }
  }

  /**
   * Get recurring payment info for create/update (matching legacy GET request behavior)
   */
  async getRecurringPaymentInfo(
    locationSlug: string,
    customerId: number,
    query: CustomerRecurringPaymentInfoRequestDto,
  ): Promise<RecurringPaymentInfoResponseDto> {
    try {
      // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      let paymentData: CustomerRecurringPayment | null = null;

      if (query.id) {
        // Edit mode: Get existing payment data
        paymentData = await this.customerRecurringPaymentRepository.getRecurringPaymentById(query.id);

        if (!paymentData) {
          throw new NotFoundException(`Recurring payment not found: ${query.id}`);
        }
      }

      // Transform payment data to DTO
      const paymentDto = this.infoTransformationService.transformPaymentToInfoDto(
        paymentData,
        customerId,
      );

      // Get enrolments (repository handles logic: returns empty array if no active/future enrolments,
      // otherwise returns all enrolments except completed past ones)
      const enrolments = await this.customerRecurringPaymentRepository.getRecurringPaymentCreateEnrolments(
        customerId,
        locationId,
        query?.id,
      );

      // Get payment methods
      const paymentMethods = await this.customerRecurringPaymentRepository.getPaymentMethods();

      // Get payment frequencies
      const paymentFrequencies = await this.customerRecurringPaymentRepository.getPaymentFrequencies();

      // Transform all data to DTOs
      const enrolmentDtos = this.infoTransformationService.transformEnrolmentsToFormDtos(
        enrolments || [],
      );
      const paymentMethodDtos = this.infoTransformationService.transformPaymentMethodsToDtos(
        paymentMethods,
      );
      const paymentFrequencyDtos = this.infoTransformationService.transformPaymentFrequenciesToDtos(
        paymentFrequencies,
      );

      const enrolmentWarnings =
        query.id && paymentData?.isRecurringPaymentEnabled
          ? await this.customerRecurringPaymentRepository.getEnrolmentLinkWarnings(
              query.id,
              customerId,
              locationId,
            ).catch((error: unknown) => {
              console.warn(
                `Unable to check enrolment links for recurring payment ${query.id}:`,
                error,
              );
              return [];
            })
          : [];

      const formData = this.infoTransformationService.transformInfoDataToDto(
        paymentDto,
        enrolmentDtos,
        paymentMethodDtos,
        paymentFrequencyDtos,
        enrolmentWarnings,
      );

      return plainToInstance(RecurringPaymentInfoResponseDto, {
        body: formData,
      });
    } catch (error) {
      console.error('Error in getRecurringPaymentInfo service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve recurring payment info: ${error.message}`);
    }
  }
}
