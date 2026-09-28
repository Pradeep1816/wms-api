import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EquipmentRentalRepository } from '../repositories/equipment-rental.repository';
import { EquipmentRentalDeleteRepository } from '../repositories/equipment-rental-delete.repository';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';

@Injectable()
export class EquipmentRentalDeleteService {
  constructor(
    private readonly equipmentRentalRepository: EquipmentRentalRepository,
    private readonly equipmentRentalDeleteRepository: EquipmentRentalDeleteRepository,
    private readonly validationService: CustomerValidationService,
  ) {}

  /**
   * Delete equipment rental
   * Rules:
   * 1. Must have invoices to delete
   * 2. Cascade soft delete: rental → rental_invoices → line_items → invoices
   * 3. Ongoing: delete ALL invoices; Fixed: single invoice
   */
  async deleteEquipmentRental(
    locationSlug: string,
    customerId: number,
    rentalId: number,
    userId: number,
  ): Promise<{ id: number }> {
    try {
      // Validate location and customer
      await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Get the rental
      const rental = await this.equipmentRentalRepository.getEquipmentRentalById(rentalId);
      if (!rental) {
        throw new NotFoundException('Equipment rental not found');
      }

      // Verify rental belongs to customer
      if (rental.customerId !== customerId) {
        throw new BadRequestException('Equipment rental does not belong to this customer');
      }

      // Check if already deleted
      if (rental.isDeleted) {
        throw new BadRequestException('Equipment rental is already deleted');
      }

      // Delete rental and invoices
      const result = await this.equipmentRentalDeleteRepository.delete(
        rentalId,
        rental.isOnGoing,
        userId,
      );

      // No invoices means cannot delete
      if (!result.status) {
        throw new BadRequestException('Cannot delete rental without invoices');
      }

      return { id: rentalId };
    } catch (error) {
      console.error('Error in deleteEquipmentRental service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to delete equipment rental: ${error.message}`);
    }
  }
}
