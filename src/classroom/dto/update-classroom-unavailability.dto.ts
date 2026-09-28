import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateClassroomUnavailabilityDto {
  @IsInt()
  @Min(1)
  id: number;

  @IsOptional()
  @IsDateString({}, { message: 'fromDate must be a valid date (e.g. YYYY-MM-DD)' })
  fromDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'toDate must be a valid date (e.g. YYYY-MM-DD)' })
  toDate?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
