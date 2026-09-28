import { ArrayMinSize, IsArray, IsEmail, IsInt, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Query DTO for GET email-multi-customer.
 * Accepts ?lessonIds=4369820 | ?lessonIds=4369820,4369821 | ?lessonIds=4369820&lessonIds=4369821
 */
export class PrivateLessonEmailSelectedRequestDto {
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map((v) => Number(v));
    if (typeof value === 'string') return value.split(',').map((v) => Number(v.trim()));
    return value;
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one lesson must be selected' })
  @IsInt({ each: true })
  lessonIds: number[];
}


export class PrivateLessonEmailSelectedSendRequestDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one lesson must be selected' })
  @IsInt({ each: true })
  lessonIds: number[];

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one recipient email is required' })
  @IsEmail({}, { each: true, message: 'Each recipient must be a valid email address' })
  @IsString({ each: true })
  to: string[];

  @IsString()
  subject: string;

  @IsString()
  content: string;
}
