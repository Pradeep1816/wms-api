import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateClassroomUnavailabilityDto {
  @IsDateString({}, { message: 'fromDate must be a valid date (e.g. YYYY-MM-DD)' })
  @IsNotEmpty({ message: 'fromDate is required' })
  fromDate: string;

  @IsDateString({}, { message: 'toDate must be a valid date (e.g. YYYY-MM-DD)' })
  @IsNotEmpty({ message: 'toDate is required' })
  toDate: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
