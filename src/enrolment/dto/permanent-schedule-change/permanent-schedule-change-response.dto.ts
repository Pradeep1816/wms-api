/**
 * Response shapes returned by the permanent schedule change API. These DTOs
 * document the stable transport contract without containing business rules.
 */
import { Expose } from 'class-transformer';

/** Teacher option available for the selected program and location. */
export class TeacherOptionDto {
  @Expose()
  id: number;

  @Expose()
  name: string;
}

/** Current course schedule data shown before a permanent change is drafted. */
export class PermanentScheduleChangePreviewDataDto {
  @Expose()
  courseId: number;

  @Expose()
  currentTeacherId: number;

  @Expose()
  currentTeacherName: string;

  @Expose()
  currentDayTime: string; // Format: "dddd hh:mm A"

  @Expose()
  currentDuration: string; // Format: "HH:mm"

  @Expose()
  teachers: TeacherOptionDto[];
}

/** Preview data augmented with the effective dates selected by the client. */
export class PermanentScheduleChangeDetailDataDto extends PermanentScheduleChangePreviewDataDto {
  @Expose()
  dateToChangeSchedule?: string; // Format: "YYYY-MM" (only when startMonth is provided)

  @Expose()
  rescheduleBeginDate?: string; // Format: "MMM D, Y" (set after calendar selection)
}

/** Effective date range and change classification returned after drafting. */
export class RescheduleResponseDataDto {
  @Expose()
  courseId: number;

  @Expose()
  rescheduleBeginDate: string; // Format: "MMM D, Y"

  @Expose()
  rescheduleEndDate: string; // Format: "MMM D, Y"

  @Expose()
  isTeacherOnlyChanged: boolean;
}
