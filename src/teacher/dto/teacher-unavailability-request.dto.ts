import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TeacherUnavailabilityRequestDto {
  @IsNotEmpty({ message: 'From Date Time is required' })
  @IsString({ message: 'From Date Time must be a string' })
  fromDateTime: string;

  @IsNotEmpty({ message: 'To Date Time is required' })
  @IsString({ message: 'To Date Time must be a string' })
  toDateTime: string;

  @IsOptional()
  @IsString({ message: 'Reason must be a string' })
  reason?: string;
}
