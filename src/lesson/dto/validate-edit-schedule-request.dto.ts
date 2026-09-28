import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Query DTO for validate-edit-schedule (validate on update).
 * All fields optional; when present they are validated for format.
 * Response keys from validation are: date, teacherId, duration (v2 plain keys).
 */
export class ValidateEditScheduleRequestDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  teacherId?: number | string; // accepted from form/query as number or string


  @IsOptional()
  @IsString()
  @Matches(/^([0-9]{2}):([0-5][0-9])(:([0-5][0-9]))?$/, {
    message: 'Duration must be in HH:MM:SS or HH:MM format.',
  })
  duration?: string;
}
