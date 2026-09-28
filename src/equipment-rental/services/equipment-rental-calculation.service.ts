import { Injectable } from '@nestjs/common';
import { IEquipmentRentalCalculationService } from '../interfaces/equipment-rental-service.interface';

@Injectable()
export class EquipmentRentalCalculationService implements IEquipmentRentalCalculationService {
  calculateRentalAmount(rental: any): number {
    return rental.total ? parseFloat(rental.total) : 0;
  }

  calculateTotalAmount(rentals: any[]): number {
    return rentals.reduce((total, rental) => {
      return total + this.calculateRentalAmount(rental);
    }, 0);
  }

  calculatePagination(total: number, page: number, limit: number): {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } {
    const totalPages = Math.ceil(total / limit);
    return {
      page,
      limit,
      total,
      totalPages,
    };
  }
}
