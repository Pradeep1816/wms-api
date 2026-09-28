import { IsArray, IsOptional, IsNumber, IsString, IsBoolean, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInstrumentDto {
  @IsNumber()
  instrumentId: number;       

  @IsOptional()
  @IsNumber()
  value?: number;         

  @IsOptional()
  @IsString()
  asset?: string;            

  @IsNumber()
  monthlyRate: number;         

  @IsNumber()
  months: number;              

  @IsNumber()
  total: number;               
}

export class CreateEquipmentRentalDto {
  @IsNumber()
  studentId: number;

  @IsDateString()
  startDate: string;           

  @IsOptional()
  @IsDateString()
  returnDate?: string;         

  @IsOptional()
  @IsBoolean()
  isOnGoing?: boolean;         

  @IsOptional()
  @IsNumber()
  duration?: number | null;           

  @IsOptional()
  @IsBoolean()
  securityDeposit?: boolean;

  @IsOptional()
  @IsNumber()
  tenderType?: number | null;         

  @IsOptional()
  @IsNumber()
  depositAmount?: number | null;      

  @IsNumber()
  subTotal: number;            

  @IsNumber()
  hst: number;                 

  @IsNumber()
  total: number;               

  @IsArray()
  @Type(() => CreateInstrumentDto)
  instruments: CreateInstrumentDto[];
}
