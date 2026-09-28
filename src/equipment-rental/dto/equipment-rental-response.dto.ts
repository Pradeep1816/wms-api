import { Expose, Transform } from 'class-transformer';
import { formatCurrency } from '../../utils/formatters';

export class EquipmentRentalDto {
  @Expose()
  id: number;

  @Expose()
  studentName: string;

  @Expose()
  startDate: string;

  @Expose()
  returnDate: string;

  @Expose()
  rentalTerm: string;

  @Expose()
  depositAmount: string;

  @Expose()
  equipmentReturned: string;

  @Expose()
  equipmentReturnedDate: string;
}

export class EquipmentRentalDataDto {
  @Expose()
  body: EquipmentRentalDto[];

  @Expose()
  pagination: { 
    page: number; 
    limit: number; 
    total: number; 
    totalPages: number;
  };
}

export class EquipmentRentalRepositoryResponseDto {
  @Expose()
  equipmentRentals: any[];

  @Expose()
  total: number;

  @Expose()
  rentalDurations: Record<number, string>;
}

export class EquipmentRentalResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Equipment rentals retrieved successfully';

  @Expose()
  data: EquipmentRentalDataDto;
}
