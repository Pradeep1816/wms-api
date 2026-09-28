import { IsArray, IsInt, ArrayMinSize } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * DTO for exploding (splitting) a private lesson into 15-minute segments
 * Legacy: PrivateLessonController::actionSplit, PrivateLesson::split()
 */
export class LessonExplodeRequestDto {
 @Transform(({ value, obj }) => {
    const source = value ?? obj?.lessonId;
    if (Array.isArray(source)) return source.map((v) => Number(v));
    if (typeof source === 'number') return [Number(source)];
    if (typeof source === 'string') return source.split(',').map((v) => Number(v.trim()));
    return value;
  })
  
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one lesson must be selected' })
  @IsInt({ each: true })
  lessonIds: number[];
}

/**
 * Response DTO for explode operation
 */
export class ExplodedLessonDto {
  id: number;
  courseId: number;
  teacherId: number;
  date: Date;
  duration: string;
  status: number;
  isExploded: number;
  programRate: number;
}

/**
 * Response DTO for successful explode operation
 */
export class LessonExplodeResponseDto {
  originalLessonId: number;
  explodedLessons: ExplodedLessonDto[];
  totalSegments: number;
  redirectUrl?: string;  // Legacy: Redirect to student detail page
  studentId?: number;    // Student ID for redirect
}

/**
 * DTO for checking if a lesson can be exploded
 */
export class CanExplodeResponseDto {
  canExplode: boolean;
  reason?: string;
  lessonId: number;
  checks: {
    isPrivate: boolean;
    isUnscheduled: boolean;
    notExploded: boolean;
    notExpired: boolean;
    notInvoiced: boolean;
  };
}
