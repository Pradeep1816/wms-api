import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MergeCustomersRepository } from "../repositories/customer-merge.repository";
import { MergeCustomerPreviewRepository } from "../repositories/customer-merge-preview.repository";
import { MergeCustomerListRequestDto } from "../dto/customer-merge-request.dto";
import { MergeCustomerListDataDto } from "../dto/customer-merge-response.dto";
import { MergePreviewDataDto } from "../dto/customer-merge-preview-response.dto";
import { MergeCustomerTransformationService } from "./transformation/customer-merge-transformation.service";
import { CustomerMergePreviewTransformationService } from "./transformation/customer-merge-preview-transformation.service";
import { CustomerValidationService } from "../../shared/services/customer-validation.service";

@Injectable()
export class MergeCustomerService {
    constructor(
        private readonly mergeCustomersRepository: MergeCustomersRepository,
        private readonly transformationService: MergeCustomerTransformationService,
        private readonly validationService: CustomerValidationService,
        private readonly mergePreviewRepository: MergeCustomerPreviewRepository,
        private readonly previewTransformationService: CustomerMergePreviewTransformationService,
    ) { }
    async getMergeCustomerList(locationSlug: string, customerId: number, query: MergeCustomerListRequestDto): Promise<MergeCustomerListDataDto> {

        try {
            const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

            const filterOptions = {
                firstName: query.firstName,
                lastName: query.lastName,
                email: query.email,
                phone: query.phone,
                sort: query.sort,
                order: query.order,
            };

            const customers = await this.mergeCustomersRepository.findAllForMerge(
                locationId,
                customerId,
                filterOptions,
            );
            const customerListData = customers.map(customer => this.transformationService.transformToListItem(customer));

            return { body: customerListData };
        } catch (error) {
            console.error('Error in getCustomers service:', error);
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException(`Failed to retrieve customers: ${error.message}`);
        }
    }


    /**
     * Get merge preview for a customer
     * @param locationSlug - The slug of the location
     * @param id - The id of the primary customer
     * @param customerId - The id of the duplicate customer
     * @returns The merge preview data
     */

    async getMergePreview(locationSlug: string, id: number, customerId: number): Promise<MergePreviewDataDto> {
        try {
            const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, id);

            // Load primary (model) and merge user (candidate) basics in parallel
            const [primary, candidate, enrolments] = await Promise.all([
                this.mergePreviewRepository.findCustomerForMergePreview(id, locationId),
                this.mergePreviewRepository.findCustomerForMergePreview(customerId, locationId),
                this.mergePreviewRepository.getEnrolments(customerId, locationId),
            ]);

            if (!primary || !candidate) {
                throw new NotFoundException('Customer not found');
            }

            const originalCandidate = this.previewTransformationService.transformCustomer(primary);
            const duplicateCandidate = this.previewTransformationService.transformCustomer(candidate);
            const studentData = this.previewTransformationService.transformStudents(candidate?.students);
            const enrolmentData = this.previewTransformationService.transformEnrolments(enrolments);

            return {
                body: {
                    primaryCandidate: originalCandidate,
                    duplicateCandidate: duplicateCandidate,
                    students: studentData,
                    enrolments: enrolmentData,
                },
            };
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException(`Failed to retrieve merge preview: ${error.message}`);
        }
    }

    /**
     * Execute merge of a duplicate customer into the target customer.
     * This operation:
     * 1. Validates that the duplicate customer has no financial history (invoices, payments, payment requests)
     * 2. Transfers all students from duplicate to target customer
     * 3. Transfers all notes from duplicate to target customer
     * 4. Transfers all log history from duplicate to target customer
     * 5. Soft deletes the duplicate customer
     *
     * All operations are wrapped in a transaction to ensure atomicity.
     *
     * @param locationSlug - The slug of the location
     * @param targetCustomerId - The id of the primary/target customer
     * @param duplicateCustomerId - The id of the duplicate customer to be merged
     * @returns The merge execution result
     */
    async mergeCustomer(
        locationSlug: string,
        targetCustomerId: number,
        sourceCustomerId: number,
    ): Promise<any> {
        try {
            const { locationId } = await this.validationService.validateLocationAndCustomer(
                locationSlug,
                targetCustomerId,
            );

            const result = await this.mergeCustomersRepository.merge(
                targetCustomerId,
                sourceCustomerId,
                locationId,
            );

            return result;
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            throw new BadRequestException(`Failed to execute customer merge: ${error.message}`);
        }
    }
}


