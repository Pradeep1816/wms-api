import {
  IsString,
  IsOptional,
  IsDateString,
  IsIn,
  MaxLength,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { StudentGender } from '../enums/student-status.enum';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @Transform(({ value }) => value?.trim())
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @Transform(({ value }) => value?.trim())
  lastName?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  @IsIn([StudentGender.MALE, StudentGender.FEMALE, StudentGender.NOT_SPECIFIED])
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  note?: string;

  @IsOptional()
  @IsBoolean()
  mediaAndOnlineLessonConsent?: boolean;

  /**
   * Convert DTO to update data object (only includes defined fields)
   * Handles date conversion for birthDate
   */
  toUpdateData(): Partial<{
    firstName: string;
    lastName: string;
    birthDate: Date;
    gender: string;
    note: string;
    mediaAndOnlineLessonConsent: boolean;
  }> {
    const updateData: any = {};

    if (this.firstName !== undefined) updateData.firstName = this.firstName;
    if (this.lastName !== undefined) updateData.lastName = this.lastName;
    if (this.birthDate !== undefined) updateData.birthDate = new Date(this.birthDate);
    if (this.gender !== undefined) updateData.gender = this.gender;
    if (this.note !== undefined) updateData.note = this.note;
    if (this.mediaAndOnlineLessonConsent !== undefined) {
      updateData.mediaAndOnlineLessonConsent = this.mediaAndOnlineLessonConsent;
    }

    return updateData;
  }
}
