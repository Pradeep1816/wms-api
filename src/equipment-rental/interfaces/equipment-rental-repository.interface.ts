import { EquipmentRentalRepositoryResponseDto } from '../dto/equipment-rental-response.dto';

export interface IEquipmentRentalQueryRepository {
  getEquipmentRentalsByCustomerId(
    customerId: number,
    page: number,
    limit: number,
    showAll: boolean,
  ): Promise<EquipmentRentalRepositoryResponseDto>;
}
