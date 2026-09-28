import { IsArray, ArrayNotEmpty, IsInt, IsOptional, ValidateIf } from 'class-validator';

export class EditClassroomRequestDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  lessonIds: number[];

  /** Classroom id to assign, or null to clear classroom from selected lessons. */
  @IsOptional()
  @ValidateIf((_o, v) => v != null)
  @IsInt()
  classroomId: number | null;
}

