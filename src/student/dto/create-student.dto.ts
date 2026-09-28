import { IsString, IsInt, IsOptional, IsDateString, IsIn, MinLength, MaxLength, IsBoolean } from 'class-validator';

export class CreateStudentDto {
  @IsString()
  @MinLength(1, { message: 'First name is required' })
  @MaxLength(30, { message: 'First name must not exceed 30 characters' })
  firstName: string;

  @IsString()
  @MinLength(1, { message: 'Last name is required' })
  @MaxLength(30, { message: 'Last name must not exceed 30 characters' })
  lastName: string;

  @IsInt()
  customerId: number;

  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @IsString()
  @IsOptional()
  @IsIn(['male', 'female', 'not-specified'], { message: 'Gender must be male, female, or not-specified' })
  gender?: 'male' | 'female' | 'not-specified';

  @IsBoolean()
  @IsOptional()
  mediaAndOnlineLessonConsent?: boolean
}

