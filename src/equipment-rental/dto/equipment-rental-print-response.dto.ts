import { Expose, Type } from 'class-transformer';

export class EquipmentRentalPrintLocationDto {
  @Expose()
  name: string;

  @Expose()
  address: string;

  @Expose()
  province: string;

  @Expose()
  phoneNumber: string;
}

export class EquipmentRentalPrintCustomerDto {
  @Expose()
  name: string;

  @Expose()
  address: string;

  @Expose()
  city: string;

  @Expose()
  postalCode: string;

  @Expose()
  homePhone: string;

  @Expose()
  workPhone: string;

  @Expose()
  otherPhone: string;

  @Expose()
  email: string;
}

export class EquipmentRentalPrintStudentDto {
  @Expose()
  firstName: string;

  @Expose()
  lastName: string;
}

export class EquipmentRentalPrintRentalDto {
  @Expose()
  startDate: string;

  @Expose()
  returnDate: string;

  @Expose()
  durationLabel: string;
}

export class EquipmentRentalPrintInstrumentDto {
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
}

export class EquipmentRentalPrintTotalsDto {
  @Expose()
  SubTotal: string;

  @Expose()
  Tax: string;

  @Expose()
  Total: string;
}

export class EquipmentRentalPrintContractDto {
  @Expose()
  agreementText: string;

  @Expose()
  footerLeft: string;

  @Expose()
  footerRight: string;
}

export class EquipmentRentalPrintDetailDto {
  @Expose()
  @Type(() => EquipmentRentalPrintLocationDto)
  location: EquipmentRentalPrintLocationDto;

  @Expose()
  @Type(() => EquipmentRentalPrintCustomerDto)
  customer: EquipmentRentalPrintCustomerDto;

  @Expose()
  @Type(() => EquipmentRentalPrintStudentDto)
  student: EquipmentRentalPrintStudentDto;

  @Expose()
  @Type(() => EquipmentRentalPrintRentalDto)
  rental: EquipmentRentalPrintRentalDto;

  @Expose()
  @Type(() => EquipmentRentalPrintInstrumentDto)
  instruments: EquipmentRentalPrintInstrumentDto[];

  @Expose()
  @Type(() => EquipmentRentalPrintTotalsDto)
  totals: EquipmentRentalPrintTotalsDto;

  @Expose()
  @Type(() => EquipmentRentalPrintContractDto)
  contract: EquipmentRentalPrintContractDto;
}

export class EquipmentRentalPrintDataDto {
  @Expose()
  @Type(() => EquipmentRentalPrintDetailDto)
  body: EquipmentRentalPrintDetailDto;
}

export class EquipmentRentalPrintResponseDto {
  @Expose()
  success: boolean = true;

  @Expose()
  message: string = 'Equipment rental print details retrieved successfully';

  @Expose()
  @Type(() => EquipmentRentalPrintDataDto)
  data: EquipmentRentalPrintDataDto;
}
