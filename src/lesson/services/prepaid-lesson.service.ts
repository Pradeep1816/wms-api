import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrepaidLessonRepository } from '../repositories/prepaid-lesson.repository';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { PrepaidLessonsDataDto } from '../dto/prepaid-lesson-response.dto';
import { PrepaidLessonRequestDto } from '../dto/prepaid-lesson-request.dto';
import { PrepaidLessonTransformationService } from './transformation/prepaid-lesson-transformation.service';
import { formatCurrency } from 'src/utils/formatters';

@Injectable()
export class PrepaidLessonService {
  constructor(
    private readonly prepaidLessonRepository: PrepaidLessonRepository,
    private readonly validationService: CustomerValidationService,
    private readonly transformationService: PrepaidLessonTransformationService,
  ) {}

  async getPrepaidLessonsByCustomerId(
    locationSlug: string,
    customerId: number,
    query: PrepaidLessonRequestDto,
  ): Promise<PrepaidLessonsDataDto> {
    try {
      // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(
        locationSlug,
        customerId,
      );

      const { page = 1, limit = 20 } = query;

      // Get prepaid lessons from repository with pagination
      const { lessons, paymentMap, totalAmount, total } = await this.prepaidLessonRepository.getPrePaidLessons(
        customerId,
        page,
        limit,
      );

      // Transform lessons to DTOs
      const prepaidLessonData = this.transformationService.transformLessonsToDtos(lessons, paymentMap);

      // Calculate pagination metadata
      const totalPages = Math.ceil(total / limit);

      return {
        body: prepaidLessonData,
        footer: { totalAmount: formatCurrency(totalAmount) },
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      console.error('Error in getPrepaidLessonsByCustomerId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve prepaid lessons: ${error.message}`);
    }
  }
}

