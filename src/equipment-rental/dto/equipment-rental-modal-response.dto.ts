import { Expose } from 'class-transformer';

export class InstrumentRentalDto {
  @Expose()
  id: number;

  @Expose()
  code: string;

  @Expose()
  description: string;

  @Expose()
  price: number;

  @Expose()
  taxRate: number;
}

export class RentedInstrumentDto {
  @Expose()
  instrumentId: number;

  @Expose()
  instrumentCode: string;

  @Expose()
  instrument: string;

  @Expose()
  retailValue: string;

  @Expose()
  assetTag: string;

  @Expose()
  monthlyRate: string;

  @Expose()
  numberOfMonths: string;

  @Expose()
  total: string;

  @Expose()
  taxRate: number;
}

export class StudentDto {
  @Expose()
  id: number;

  @Expose()
  fullName: string;
}

export class CustomerInfoDto {
  @Expose()
  Customer: string;

  @Expose()
  Address: string;

  @Expose()
  City: string;

  @Expose()
  'P.C': string;

  @Expose()
  'Home Phone': string;

  @Expose()
  'Work Phone': string;

  @Expose()
  'Other Phone': string;

  @Expose()
  Email: string;
}

export class RentalDetailsDto {
  @Expose()
  startDate?: string;

  @Expose()
  returnDate?: string;

  @Expose()
  endDate?: string;

  @Expose()
  duration?: number;

  @Expose()
  isOnGoing?: boolean;

  @Expose()
  securityDeposit?: boolean;

  @Expose()
  tenderType?: number;

  @Expose()
  depositAmount?: string;

  @Expose()
  studentId?: number;

  @Expose()
  createdOn?: string;
}

export class EquipmentRentalModalDataDto {
  @Expose()
  body: {
    instrumentRentals: InstrumentRentalDto[];
    students: StudentDto[];
    customerInfo: CustomerInfoDto;
    rentedInstruments?: RentedInstrumentDto[];
    rentalDetails?: RentalDetailsDto;
  };
}

export class EquipmentRentalModalResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Equipment rentals modal data retrieved successfully';

  @Expose()
  data: EquipmentRentalModalDataDto;
}

