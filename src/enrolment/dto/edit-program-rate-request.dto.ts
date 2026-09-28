import { IsNotEmpty, IsNumber, IsBoolean, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CourseProgramRateDto {
  @IsNotEmpty()
  @IsNumber()
  programRate: number;
}

export class EditProgramRateRequestDto {
  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsBoolean()
  isAutoRenew?: boolean;

  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CourseProgramRateDto)
  courseProgramRates?: CourseProgramRateDto[];
}

