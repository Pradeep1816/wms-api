/**
 * Request contracts for permanent schedule change preview and draft creation.
 * Validation decorators preserve the existing PSC API formats at its boundary.
 */
import { IsString, IsNotEmpty, IsInt, Matches } from 'class-validator';
import { Expose, Type } from 'class-transformer';

/** Optional month selection accepted by the PSC preview endpoint. */
export class PermanentScheduleChangeRequestDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'startMonth must be in YYYY-MM format (e.g., 2026-02)',
  })
  @Expose()
  startMonth?: string; // Format: YYYY-MM (e.g., "2026-02") - optional for preview, required for detail
}

/** New teacher, slot, duration, and effective date for a PSC draft. */
export class RescheduleRequestDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'dateToChangeSchedule must be in YYYY-MM format',
  })
  @Expose()
  dateToChangeSchedule: string; // Format: YYYY-MM (e.g., "2026-02")

  @IsInt()
  @IsNotEmpty()
  @Type(() => Number)
  @Expose()
  teacherId: number;

  @IsString()
  @IsNotEmpty()
  @Matches(
    /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+(0?[1-9]|1[0-2]):[0-5]\d\s+(AM|PM)$/i,
    { message: 'dayTime must be in "dddd hh:mm A" format' },
  )
  @Expose()
  dayTime: string; // Format: "dddd hh:mm A" (e.g., "Monday 04:00 PM")

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{2}:\d{2}$/, {
    message: 'duration must be in HH:mm format',
  })
  @Expose()
  duration: string; // Format: "HH:mm" (e.g., "01:00")

  @IsString()
  @IsNotEmpty()
  @Expose()
  rescheduleBeginDate: string; // Format: "MMM D, Y" (e.g., "Feb 1, 2026")
}

/** Date range required to confirm an existing PSC draft. */
export class PermanentScheduleChangeConfirmRequestDto {
  @IsString()
  @IsNotEmpty()
  @Expose()
  rescheduleBeginDate: string;

  @IsString()
  @IsNotEmpty()
  @Expose()
  rescheduleEndDate: string;
}
