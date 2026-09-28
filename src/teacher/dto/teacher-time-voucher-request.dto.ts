import { IsDateString, IsOptional, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class TeacherTimeVoucherRequestDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  summaryOnly?: boolean;
}

