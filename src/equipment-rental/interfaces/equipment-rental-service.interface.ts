import { EquipmentRentalRequestDto } from '../dto/equipment-rental-request.dto';
import { EquipmentRentalDataDto, EquipmentRentalDto } from '../dto/equipment-rental-response.dto';

export interface IEquipmentRentalQueryService {
  getEquipmentRentalsByCustomerId(
    locationSlug: string,
    customerId: number,
    query: EquipmentRentalRequestDto,
  ): Promise<EquipmentRentalDataDto>;
}

export interface IEquipmentRentalTransformationService {
  transformToDto(rental: any, rentalDurations: Record<number, string>): EquipmentRentalDto;
  transformRentalsToDtos(rentals: any[], rentalDurations: Record<number, string>): EquipmentRentalDto[];
}

export interface IEquipmentRentalCalculationService {
  calculateRentalAmount(rental: any): number;
  calculateTotalAmount(rentals: any[]): number;
  calculatePagination(total: number, page: number, limit: number): {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
