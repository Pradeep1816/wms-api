import { Expose } from 'class-transformer';

export class RentalReportItemDto {
  @Expose()
  id: number;

  @Expose()
  customerId: number;

  @Expose()
  customerName: string;

  @Expose()
  studentId: number;

  @Expose()
  studentName: string;

  @Expose()
  startDate: string;

  @Expose()
  returnDate: string | null;

  @Expose()
  endDate: string | null;

  @Expose()
  rentalTerm: string;

  @Expose()
  isOnGoing: boolean;

  @Expose()
  isReturned: boolean;

  @Expose()
  equipmentReturnedDate: string | null;

  // Removed instrument- and tender-related fields as instruments are no longer returned

  @Expose()
  daysOverdue?: number;

  @Expose()
  daysUntilExpiry?: number;
}