import { IsArray, IsNotEmpty, ArrayMinSize, IsNumber, IsString, IsDateString } from 'class-validator';

/**
 * Request DTO for changing teacher for enrolments
 * Matches legacy: TeacherSubstituteController::actionEnrolment() (POST request)
 */
export class ChangeTeacherRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  @IsNotEmpty()
  enrolmentIds: number[];

  @IsNumber()
  @IsNotEmpty()
  teacherId: number;

  @IsString()
  @IsDateString()
  @IsNotEmpty()
  changesFrom: string; // Format: YYYY-MM-DD
}
