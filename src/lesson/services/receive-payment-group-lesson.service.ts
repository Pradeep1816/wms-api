import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ReceivePaymentGroupLessonRequestDto } from '../dto/receive-payment-group-lesson-request.dto';
import { ReceivePaymentGroupLessonResponseDto } from '../dto/receive-payment-group-lesson-response.dto';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { GroupLessonDueRepository } from '../repositories/group-lesson-due.repository';
import { ReceivePaymentGroupLessonTransformationService } from './transformation/receive-payment-group-lesson-transformation.service';
import { GroupLessonDueCalculationService } from './calculation/group-lesson-due-calculation.service';

@Injectable()
export class ReceivePaymentGroupLessonService {
    constructor(
        private readonly validationService: CustomerValidationService,
        private readonly groupLessonDueRepository: GroupLessonDueRepository,
        private readonly transformationService: ReceivePaymentGroupLessonTransformationService,
        private readonly calculationService: GroupLessonDueCalculationService,
    ) { }

    async receivePaymentForGroupLesson(
        locationSlug: string,
        customerId: number,
        query: ReceivePaymentGroupLessonRequestDto,
    ): Promise<ReceivePaymentGroupLessonResponseDto | any> {

        try {
            // Validate location and customer
            const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

            // Get group lesson dues with pagination and optional date range
            const { groupLessonDues, total } = await this.groupLessonDueRepository.getGroupLessonDuesByCustomerId(
                customerId,
                locationId,
                query.page || 1,
                query.limit || 10,
                query.startDate,
                query.endDate,
                query.studentId,
            );


            // Transform group lessons to DTOs
            const groupLessonData: ReceivePaymentGroupLessonResponseDto[] = this.transformationService.transformLessonsToDtos(groupLessonDues);

            // Calculate pagination
            const pagination = this.calculationService.calculatePagination(
                total,
                query.page || 1,
                query.limit || 10
            );


            return {
                body: groupLessonData,
                pagination,
            };
        } catch (error) {
            console.error('Error in receivePaymentForGroupLesson service:', error);
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException(`Failed to retrieve group lessons: ${error.message}`);
        }
    }
}
