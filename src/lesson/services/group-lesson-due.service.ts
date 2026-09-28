import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { IGroupLessonDueQueryService } from '../interfaces/group-lesson-due-service.interface';
import { GroupLessonDueRequestDto } from '../dto/group-lesson-due-request.dto';
import { GroupLessonDueDataDto } from '../dto/group-lesson-due-response.dto';
import { GroupLessonDueRepository } from '../repositories/group-lesson-due.repository';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { GroupLessonDueTransformationService } from './transformation/group-lesson-due-transformation.service';
import { GroupLessonDueCalculationService } from './calculation/group-lesson-due-calculation.service';
import { formatCurrency } from '../../utils/formatters';


@Injectable()
export class GroupLessonDueService implements IGroupLessonDueQueryService {
  constructor(
    private readonly groupLessonDueRepository: GroupLessonDueRepository,
    private readonly validationService: CustomerValidationService,
    private readonly transformationService: GroupLessonDueTransformationService,
    private readonly calculationService: GroupLessonDueCalculationService,
  ) {}

  async getGroupLessonDuesByCustomerId(
    locationSlug: string,
    customerId: number,
    query: GroupLessonDueRequestDto,
  ): Promise<GroupLessonDueDataDto> {
    try {
      // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Get group lesson dues with pagination
      const { groupLessonDues, total } = await this.groupLessonDueRepository.getGroupLessonDuesByCustomerId(
        customerId,
        locationId,
        query.page || 1,
        query.limit || 10,
      );

      // Transform group lesson dues to DTOs
      const groupLessonDueData = this.transformationService.transformLessonsToDtos(groupLessonDues, locationSlug);

      // Calculate total amount
      const totalAmount = this.calculationService.calculateTotalAmount(groupLessonDues);
      const formatAmount = formatCurrency(totalAmount);


      // Calculate pagination
      const pagination = this.calculationService.calculatePagination(
        total,
        query.page || 1,
        query.limit || 10
      );

      return {
        body: groupLessonDueData,
        footer: [{ totalAmount: formatAmount }],
        pagination,
      };
    } catch (error) {
      console.error('Error in getGroupLessonDuesByCustomerId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve group lesson dues: ${error.message}`);
    }
  }

}
