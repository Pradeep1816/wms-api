import { Injectable } from '@nestjs/common';
import { IEquipmentRentalTransformationService } from '../interfaces/equipment-rental-service.interface';
import { EquipmentRentalDto } from '../dto/equipment-rental-response.dto';
import { formatDate } from '../../utils/date-utils';

@Injectable()
export class EquipmentRentalTransformationService implements IEquipmentRentalTransformationService {
  transformToDto(rental: any, rentalDurations: Record<number, string>): EquipmentRentalDto {
    const dto = new EquipmentRentalDto();
    dto.id = rental.id || 0;
    dto.studentName = `${rental.student?.firstName || ''} ${rental.student?.lastName || ''}`.trim() || '';
    dto.startDate = rental.startDate ? formatDate(rental.startDate) : '';
    dto.returnDate = rental.returnDate ? formatDate(rental.returnDate) : '';
    dto.rentalTerm = rental.isOnGoing
      ? 'Ongoing'
      : rentalDurations[rental.duration] || `${rental.duration} days`;
    dto.depositAmount =rental.tenderType === 3
        ? 'Preauthorized'
        : Number(rental.depositAmount || 0).toFixed(2),
      dto.equipmentReturned = rental.isReturned ? 'Yes' : 'No';
    dto.equipmentReturnedDate = rental.isReturned
      ? (rental.endDate ? formatDate(rental.endDate) : '')
      : '';
    return dto;
  }

  transformRentalsToDtos(rentals: any[], rentalDurations: Record<number, string>): EquipmentRentalDto[] {
    return rentals.map(rental => this.transformToDto(rental, rentalDurations));
  }
}
