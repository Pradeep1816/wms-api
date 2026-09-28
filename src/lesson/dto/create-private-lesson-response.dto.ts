export class CreatePrivateLessonResponseDto {
  success: boolean;
  data?: {
    lessonId: number;
    url?: string;
  };
  errors?: Record<string, string[]>; // Field name -> array of error messages
  message?: string;
}

