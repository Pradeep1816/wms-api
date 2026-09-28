import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ReceivePaymentLessonRequestDto } from '../dto/receive-payment-lesson-request.dto';
import { ReceivePaymentLessonResponseDto } from '../dto/receive-payment-lesson-response.dto';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { PrivateLessonDueRepository } from '../repositories/private-lesson-due.repository';
import { ReceivePaymentLessonTransformationService } from './transformation/receive-payment-lesson-transformation.service';
import { OutstandingInvoiceCalculationService } from '../../invoice/services/calculations/outstanding-invoice-calculation.service';

@Injectable()
export class ReceivePaymentLessonService {
  constructor(
    private readonly validationService: CustomerValidationService,
    private readonly privateLessonDueRepository: PrivateLessonDueRepository,
    private readonly transformationService: ReceivePaymentLessonTransformationService,
    private readonly calculationService: OutstandingInvoiceCalculationService,
  ) {}

  async receivePaymentForLesson(
    locationSlug: string,
    customerId: number,
    query: ReceivePaymentLessonRequestDto,
  ): Promise<ReceivePaymentLessonResponseDto | any> {
    try {
      // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Get private lesson dues with pagination and optional date range
      // - When startDate/endDate are provided, repository will apply a dueDate
      //   range filter (including future lessons).
      // - When they are omitted, behaviour remains unchanged (only past-due lessons).
      const { privateLessonDues, total } = await this.privateLessonDueRepository.getPrivateLessonDuesByCustomerId(
        customerId,
        locationId,
        query.page || 1,
        query.limit || 10,
        query.startDate,
        query.endDate,
        query.studentId,
      );

      // Transform lessons to DTOs with payment map
      const lessonData = this.transformationService.transformLessonsToDtos(privateLessonDues);

      // Calculate pagination
      const pagination = this.calculationService.calculatePagination(
        total,
        query.page || 1,
        query.limit || 10
      );

      return {
        body: lessonData,
        pagination,
      };
    } catch (error) {
      console.error('Error in receivePaymentForLesson service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve lessons: ${error.message}`);
    }
  }
}

