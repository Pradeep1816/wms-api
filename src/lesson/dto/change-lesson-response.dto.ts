export class ChangeLessonResponseDto {
  success: boolean;
  message?: string;
  data?: any;
  errors?: Record<string, string[]>;
  errorCode?: string;
}

