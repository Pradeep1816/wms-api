import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EquipmentRentalRepository } from '../repositories/equipment-rental.repository';
import { EquipmentRentalReturnRepository } from '../repositories/equipment-rental-return.repository';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';

@Injectable()
export class EquipmentRentalReturnService {
  constructor(
    private readonly equipmentRentalRepository: EquipmentRentalRepository,
    private readonly equipmentRentalReturnRepository: EquipmentRentalReturnRepository,
    private readonly validationService: CustomerValidationService,
  ) {}

  /**
   * Process equipment return (Legacy-identical)
   * 
   * Business Logic:
   * 1. Only create invoice if returnDate < currentDate
   * 2. Create prorated invoice for remaining days
   * 3. Calculate tax (13% HST or 5% GST based on item taxStatusId)
   * 4. Add $5 late fee
   * 5. Mark rental as returned
   */
  async processReturn(
    locationSlug: string,
    customerId: number,
    rentalId: number,
    userId: number,
  ): Promise<any> {
    try {
      // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Get the rental
      const rental = await this.equipmentRentalRepository.getEquipmentRentalById(rentalId);
      if (!rental) {
        throw new NotFoundException('Equipment rental not found');
      }

      // Verify rental belongs to customer
      if (rental.customerId !== customerId) {
        throw new BadRequestException('Equipment rental does not belong to this customer');
      }

      // Check if already returned
      if (rental.isReturned) {
        throw new BadRequestException('Equipment rental is already returned');
      }

      // Check if already deleted
      if (rental.isDeleted) {
        throw new BadRequestException('Equipment rental is deleted');
      }

      // Get returnDate from rental (or use current date if not set)
      const returnDate = rental.returnDate ? new Date(rental.returnDate) : new Date();
      const currentDate = new Date();

      // Check if invoice should be created (returnDate < currentDate)
      const isCreateInvoice = returnDate < currentDate;

      // Process return
      const result = await this.equipmentRentalReturnRepository.processReturn(
        rentalId,
        returnDate,
        currentDate,
        locationId,
        customerId,
        userId,
        isCreateInvoice,
      );

      return result;
    } catch (error) {
      console.error('Error in processReturn service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to process equipment return: ${error.message}`);
    }
  }
}
