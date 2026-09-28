import { Expose, Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class PaymentMethodDto {
  @Expose()
  @IsInt()
  id: number;

  @Expose()
  @IsString()
  name: string;
}

export class CustomerDto {
  @Expose()
  @IsInt()
  id: number;

  @Expose()
  @IsString()
  name: string;

  @Expose()
  @IsOptional()
  @IsString()
  email?: string;
}

export class LessonDto {
  @Expose()
  @IsInt()
  id: number;

  @Expose()
  @IsString()
  originalDate: string;

  @Expose()
  @IsString()
  date: string;

  @Expose()
  @IsString()
  student: string;

  @Expose()
  @IsString()
  program: string;

  @Expose()
  @IsString()
  teacher: string;

  @Expose()
  @IsString()
  amount: string;

  @Expose()
  @IsString()
  payment: string;

  @Expose()
  @IsString()
  balance: string;
}

export class GroupLessonDto {
  @Expose()
  @IsInt()
  id: number;

  @Expose()
  @IsString()
  date: string;

  @Expose()
  @IsString()
  student: string;

  @Expose()
  @IsString()
  program: string;

  @Expose()
  @IsString()
  invoiced: string;

  @Expose()
  @IsString()
  amount: string;

  @Expose()
  @IsString()
  payment: string;

  @Expose()
  @IsString()
  balance: string;
}

export class InvoiceDto {
  @Expose()
  @IsInt()
  id: number;

  @Expose()
  @IsString()
  date: string;

  @Expose()
  @IsString()
  number: string;

  @Expose()
  @IsString()
  amount: string;

  @Expose()
  @IsString()
  payment: string;

  @Expose()
  @IsString()
  balance: string;
}

export class PaymentUsedDto {
  @Expose()
  @IsInt()
  userId: number;

  @Expose()
  @IsString()
  reference: string;

  @Expose()
  @IsString()
  date: string;

  @Expose()
  @IsString()
  paymentMethod: string;

  @Expose()
  @IsNumber()
  amount: number;
}

export class LocationDetailsDto {
  @Expose()
  @IsString()
  name: string;

  @Expose()
  @IsString()
  address: string;

  @Expose()
  @IsString()
  city: string;

  @Expose()
  @IsString()
  province: string;

  @Expose()
  @IsString()
  country: string;

  @Expose()
  @IsString()
  postalCode: string;

  @Expose()
  @IsString()
  phoneNumber: string;

  @Expose()
  @IsString()
  email: string;

  @Expose()
  @IsString()
  hstRegistrationNo: string;
}
export class PaymentEditInfoDataDto {
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LessonDto)
  lessons: LessonDto[];

  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GroupLessonDto)
  groupLessons: GroupLessonDto[];

  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceDto)
  invoices: InvoiceDto[];

  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentUsedDto)
  paymentsUsed: PaymentUsedDto[];

  @Expose()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => LocationDetailsDto)
  locationDetails?: LocationDetailsDto;
}

