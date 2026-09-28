import { IsArray, IsNumber, IsIn, ArrayMinSize } from 'class-validator';

export class CourseLessonEditOnlineTypeDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one lesson must be selected' })
  @IsNumber({}, { each: true })
  lessonIds: number[];

  @IsIn([0, 1], { message: 'Online must be 0 (In Class) or 1 (Online)' })
  online: number;
}

export class CourseLessonEditOnlineTypeResponseDto {
  status: boolean;
  message?: string;
  error?: string;
  courseId?: number;
  updatedBy?: number;
}
