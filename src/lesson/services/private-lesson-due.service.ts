import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { IPrivateLessonDueQueryService } from '../interfaces/private-lesson-due-service.interface';
import { PrivateLessonDueRequestDto } from '../dto/private-lesson-due-request.dto';
import { PrivateLessonDueDataDto } from '../dto/private-lesson-due-response.dto';
import { PrivateLessonDueRepository } from '../repositories/private-lesson-due.repository';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { PrivateLessonDueTransformationService } from './transformation/private-lesson-due-transformation.service';
import { PrivateLessonDueCalculationService } from './calculation/private-lesson-due-calculation.service';
import { formatCurrency } from '../../utils/formatters';

@Injectable()
export class PrivateLessonDueService implements IPrivateLessonDueQueryService {
  constructor(
    private readonly privateLessonDueRepository: PrivateLessonDueRepository,
    private readonly validationService: CustomerValidationService,
    private readonly transformationService: PrivateLessonDueTransformationService,
    private readonly calculationService: PrivateLessonDueCalculationService,
  ) {}

  async getPrivateLessonDuesByCustomerId(
    locationSlug: string,
    customerId: number,
    query: PrivateLessonDueRequestDto,
  ): Promise<PrivateLessonDueDataDto> {
    try {
      // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Get private lesson dues with pagination
      const { privateLessonDues, total } = await this.privateLessonDueRepository.getPrivateLessonDuesByCustomerId(
        customerId,
        locationId,
        query.page || 1,
        query.limit || 20,
      );

      // Transform private lesson dues to DTOs
      const privateLessonDueData = this.transformationService.transformLessonsToDtos(privateLessonDues, locationSlug);

      // Calculate total amount
      const totalAmount = this.calculationService.calculateTotalAmount(privateLessonDues);
      const formattedAmount = formatCurrency(totalAmount);

      // Calculate pagination
      const pagination = this.calculationService.calculatePagination(
        total,
        query.page || 1,
        query.limit || 20
      );

      return {
        body: privateLessonDueData,
        footer: [{ totalAmount: formattedAmount }],
        pagination,
      };
    } catch (error) {
      console.error('Error in getPrivateLessonDuesByCustomerId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve private lesson dues: ${error.message}`);
    }
  }
}
