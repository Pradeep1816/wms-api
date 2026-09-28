import { Expose } from 'class-transformer';
import { IsInt, IsString } from 'class-validator';

export const COMPLETED_ENROLMENT_LINK_WARNING =
  'COMPLETED_ENROLMENT_LINK_WITH_UNLINKED_CURRENT_ENROLMENT';

export class RecurringPaymentEnrolmentWarningDto {
  @Expose()
  @IsString()
  code: string;

  @Expose()
  @IsString()
  message: string;

  @Expose()
  @IsInt()
  studentId: number;

  @Expose()
  @IsString()
  studentName: string;

  @Expose()
  @IsString()
  programName: string;

  @Expose()
  @IsInt()
  completedEnrolmentId: number;

  @Expose()
  @IsInt()
  currentEnrolmentId: number;
}
