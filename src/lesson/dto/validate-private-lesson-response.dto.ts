export class ValidatePrivateLessonResponseDto {
  success: boolean;
  errors?: Record<string, string[]>; // Field name -> array of error messages
  message?: string;
}

