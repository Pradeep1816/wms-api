import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { UpdateEquipmentRentalDto } from '../dto/update-equipment-rental.dto';
import { EquipmentRentalRepository } from '../repositories/equipment-rental.repository';
import { EquipmentRentalUpdateRepository } from '../repositories/equipment-rental-update.repository';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';

@Injectable()
export class EquipmentRentalUpdateService {
  constructor(
    private readonly equipmentRentalRepository: EquipmentRentalRepository,
    private readonly equipmentRentalUpdateRepository: EquipmentRentalUpdateRepository,
    private readonly validationService: CustomerValidationService,
  ) {}

  /**
   * Update equipment rental - only return date can be updated
   * Rules:
   * 1. Only ongoing rentals can be updated (isOnGoing = true AND returnDate = null)
   * 2. Fixed-term rentals cannot be updated
   * 3. New return date must be at least 30 days after start date
   * 4. Return date is required
   * 5. Void future invoices after the new return date
   */
  async updateEquipmentRental(
    locationSlug: string,
    customerId: number,
    rentalId: number,
    dto: UpdateEquipmentRentalDto,
    userId: number,
  ): Promise<{ id: number }> {
    try {
      // Validate location and customer
      await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Get the rental using existing repository
      const rental = await this.equipmentRentalRepository.getEquipmentRentalById(rentalId);
      if (!rental) {
        throw new NotFoundException('Equipment rental not found');
      }

      // Verify rental belongs to customer
      if (rental.customerId !== customerId) {
        throw new BadRequestException('Equipment rental does not belong to this customer');
      }

      // Only ongoing rentals can be updated
      if (!rental.isOnGoing || rental.returnDate !== null) {
        throw new BadRequestException('Only ongoing rentals can be updated. Fixed-term rentals cannot be modified.');
      }

      // Parse the new return date
      const newReturnDate = new Date(dto.returnDate);
      if (isNaN(newReturnDate.getTime())) {
        throw new BadRequestException('Invalid return date format');
      }

      //Minimum 30 days from start date
      const startDate = new Date(rental.startDate);
      const minReturnDate = new Date(startDate);
      minReturnDate.setDate(minReturnDate.getDate() + 30);

      if (newReturnDate < minReturnDate) {
        throw new BadRequestException(
          `Return date must be at least 30 days after start date.`
        );
      }

      // Update rental and void future invoices
      await this.equipmentRentalUpdateRepository.update(rentalId,newReturnDate, userId);

      return { id: rentalId };
    } catch (error) {
      console.error('Error in updateEquipmentRental service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to update equipment rental: ${error.message}`);
    }
  }
}
