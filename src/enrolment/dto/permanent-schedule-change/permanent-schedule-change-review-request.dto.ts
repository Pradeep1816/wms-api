/**
 * Query contract for reviewing a permanent schedule change draft. Transport
 * normalization is intentionally limited to values accepted by the PSC API.
 */
import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import {
  Expose,
  Type,
  Transform,
  type TransformFnParams,
} from 'class-transformer';

/** Normalize supported query-string booleans before DTO validation. */
function transformBooleanQueryParameter({ value }: TransformFnParams): unknown {
  const input: unknown = value;
  if (input === 'true' || input === '1' || input === true) return true;
  if (input === 'false' || input === '0' || input === false) return false;
  return input;
}

/** Filters accepted by the PSC lesson-review endpoint. */
export class PermanentScheduleChangeReviewRequestDto {
  @IsInt()
  @IsNotEmpty()
  @Type(() => Number)
  @Expose()
  courseId: number;

  @IsString()
  @IsOptional()
  @Expose()
  rescheduleBeginDate?: string; // Format: "MMM D, Y" (e.g., "Feb 1, 2026") or "d-m-Y" (e.g., "01-02-2026")

  @IsString()
  @IsOptional()
  @Expose()
  rescheduleEndDate?: string; // Format: "MMM D, Y" (e.g., "Feb 15, 2026") or "d-m-Y" (e.g., "15-02-2026")

  @IsBoolean()
  @IsOptional()
  @Transform(transformBooleanQueryParameter)
  @Expose()
  isTeacherOnlyChanged?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(transformBooleanQueryParameter)
  @Expose()
  showAllReviewLessons?: boolean;
}
