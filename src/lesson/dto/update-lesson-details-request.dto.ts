import { IsOptional, IsInt, IsString, Matches, IsBoolean } from 'class-validator';

export class UpdateLessonDetailsRequestDto {
  @IsOptional()
  @IsInt()
  classroomId?: number | null;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color code must be in hex format (#RRGGBB)' })
  colorCode?: string | null;

  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;
}
