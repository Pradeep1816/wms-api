import { IsDateString } from 'class-validator';

export class UpdateEquipmentRentalDto {
  @IsDateString()
  returnDate: string;
}
