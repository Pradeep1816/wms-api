import { Expose, Type } from 'class-transformer';

/**
 * DTO for teacher in qualified teachers list (id and name only)
 */
export class QualifiedTeacherDto {
  @Expose()
  id: number;

  @Expose()
  name: string;
}

/**
 * DTO for preview mode - only teachers list with body structure
 */
export class SubstituteTeacherPreviewBodyDto {
  @Expose()
  @Type(() => QualifiedTeacherDto)
  teachers: QualifiedTeacherDto[];
}

/**
 * DTO for lesson data (when teacherId is provided - draft creation mode)
 */
export class SubstituteLessonDto {
  @Expose()
  id: number;

  @Expose()
  courseId: number;

  @Expose()
  teacherId: number;

  @Expose()
  teacherName: string;

  @Expose()
  programName: string;

  @Expose()
  studentName: string;

  @Expose()
  date: string; 

  @Expose()
  duration: string;

  @Expose()
  status: number;

  @Expose()
  isConfirmed: boolean;
}

/**
 * DTO for draft creation mode - full lesson data with conflicts (flat structure)
 */
export class SubstituteTeacherDraftDataDto {
  @Expose()
  status: boolean;

  @Expose()
  hasConflicts: boolean;

  @Expose()
  newLessonIds: number[];

  @Expose()
  conflictedLessonIds: number[];

  @Expose()
  conflicts: Record<number, string[]>;

  @Expose()
  @Type(() => QualifiedTeacherDto)
  teachers: QualifiedTeacherDto[];

  @Expose()
  @Type(() => SubstituteLessonDto)
  lessons: SubstituteLessonDto[];
}

/**
 * Response DTO for teacher substitute lesson API
 * Preview mode: returns only teachers list in body
 * Draft mode: returns full lesson data with conflicts (flat structure)
 */
export class SubstituteTeacherLessonResponseDto {
  // Preview mode: body structure
  @Expose()
  @Type(() => SubstituteTeacherPreviewBodyDto)
  body?: SubstituteTeacherPreviewBodyDto;

  // Draft mode: flat structure (all fields at same level)
  @Expose()
  status?: boolean;

  @Expose()
  message?: string;

  @Expose()
  hasConflicts?: boolean;

  @Expose()
  newLessonIds?: number[];

  @Expose()
  conflictedLessonIds?: number[];

  @Expose()
  conflicts?: Record<number, string[]>;

  @Expose()
  @Type(() => QualifiedTeacherDto)
  teachers?: QualifiedTeacherDto[];

  @Expose()
  @Type(() => SubstituteLessonDto)
  lessons?: SubstituteLessonDto[];
}
