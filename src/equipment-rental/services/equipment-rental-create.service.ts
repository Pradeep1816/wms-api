import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateEquipmentRentalDto } from '../dto/create-equipment-rental.dto';
import { EquipmentRentalCreateRepository } from '../repositories/equipment-rental-create.repository';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';

@Injectable()
export class EquipmentRentalCreateService {
  constructor(
    private readonly equipmentRentalCreateRepository: EquipmentRentalCreateRepository,
    private readonly validationService: CustomerValidationService,
  ) {}

  /**
   * Create new equipment rental with instruments
   */
  async createEquipmentRental(
    locationSlug: string,
    customerId: number,
    dto: CreateEquipmentRentalDto,
    userId: number,
  ): Promise<{ id: number }> {
    try {
      // Validate location and customer
      await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Validate based on isOnGoing
      let calculatedReturnDate: Date | null = null;
      let finalDuration: number | null = dto.duration ?? null;
      
      if (dto.isOnGoing) {
        // Legacy: Ongoing rentals have no return date and no duration
        calculatedReturnDate = null;
        finalDuration = null;
      } else {
        if (!dto.duration) {
          throw new BadRequestException('Duration is required when rental is not ongoing');
        }
        // Calculate return date if not provided (uses 7-day rule)
        calculatedReturnDate = dto.returnDate ? new Date(dto.returnDate) : new Date(this.calculateReturnDate(dto.startDate, dto.duration));
      }

      // Validate and process security deposit
      let finalTenderType: number | null = dto.tenderType ?? null;
      let finalDepositAmount: number | null = dto.depositAmount ?? null;
      
      if (dto.securityDeposit) {
        if (!dto.tenderType) {
          throw new BadRequestException('Tender type is required when security deposit is required');
        }
        // Preauthorized (tenderType=3) uses credit card on file, no deposit amount needed
        if (dto.tenderType !== 3 && !dto.depositAmount) {
          throw new BadRequestException('Deposit amount is required for Cash or Credit Card');
        }
        // If Preauthorized, explicitly set depositAmount to null
        if (dto.tenderType === 3) {
          finalDepositAmount = null;
        }
      } else {
        // Clear deposit-related fields when no security deposit
        finalTenderType = null;
        finalDepositAmount = null;
      }

      // Validate instruments array
      if (!dto.instruments || dto.instruments.length === 0) {
        throw new BadRequestException('At least one instrument is required');
      }

      // Create rental via repository with processed values
      const result = await this.equipmentRentalCreateRepository.createEquipmentRental(
        customerId,
        {
          ...dto,
          duration: finalDuration ?? null,
          tenderType: finalTenderType ?? null,
          depositAmount: finalDepositAmount ?? null,
        },
        userId,
        calculatedReturnDate,
      );

      return result;
    } catch (error) {
      console.error('Error in createEquipmentRental service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to create equipment rental: ${error.message}`);
    }
  }

  /**
   * Calculate return date based on legacy 7-day proration rule
   */
  private calculateReturnDate(startDateStr: string, duration: number): string {
    const startDate = new Date(startDateStr);
    const dayOfMonth = startDate.getDate();

    // Legacy 7-day rule:
    // - If start <= 7th day: charge full months from current month
    // - If start > 7th day: prorate first month, add full duration
    const monthsToAdd = dayOfMonth <= 7 ? duration - 1 : duration;

    // Calculate target month (add months to current month)
    const targetYear = startDate.getFullYear();
    const targetMonth = startDate.getMonth() + monthsToAdd;
    
    // Get the last day of the target month (day 0 of next month = last day of target month)
    const returnDate = new Date(targetYear, targetMonth + 1, 0);

    // Format as YYYY-MM-DD
    const year = returnDate.getFullYear();
    const month = String(returnDate.getMonth() + 1).padStart(2, '0');
    const day = String(returnDate.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }

  /**
   * Get tender types
   */
  // getTenderTypes(): { id: number; name: string }[] {
  //   return [
  //     { id: 1, name: 'Cash' },
  //     { id: 2, name: 'Credit Card' },
  //     { id: 3, name: 'Preauthorized' },
  //   ];
  // }
}
