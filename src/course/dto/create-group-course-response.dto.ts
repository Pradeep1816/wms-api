/**
 * Response DTO for created lesson
 */
export interface CreatedLessonDto {
  id: number;
  date: string;
  dueDate: string;
  duration: string;
  status: number;
  teacherId: number;
  isConfirmed: boolean;
  isOnline: boolean;
}

/**
 * Response DTO for created course schedule
 */
export interface CreatedScheduleDto {
  id: number;
  day: number;
  dayName: string;
  fromTime: string;
  duration: string;
  teacherId: number;
  isRecent: boolean;
}

/**
 * Response DTO for successful group course creation
 */
export interface CreateGroupCourseSuccessResponseDto {
  success: true;
  data: {
    courseId: number;
    startDate: string;
    endDate: string;
    weeksCount: number;
    lessonsPerWeekCount: number;
    totalLessons: number;
    programRate: number;
    schedules: CreatedScheduleDto[];
    lessons: CreatedLessonDto[];
    reviewUrl: string;
  };
  message: string;
}

/**
 * Response DTO for failed group course creation
 */
export interface CreateGroupCourseErrorResponseDto {
  success: false;
  errorCode: string;
  message: string;
  errors?: Record<string, string[]>;
}

/**
 * Union type for group course creation response
 */
export type CreateGroupCourseResponseDto = CreateGroupCourseSuccessResponseDto | CreateGroupCourseErrorResponseDto;
