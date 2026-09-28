/**
 * Response contract for permanent schedule change lesson review. It is owned
 * by enrolment so PSC does not depend on generic lesson-review implementation
 * types while preserving the existing HTTP response shape.
 */
export interface PermanentScheduleChangeReviewItemDto {
  id: number;
  date: Date | string;
  startTime?: string;
  duration: string;
  conflict?: string;
  isHolidayConflict?: boolean;
  isConflict?: boolean;
  isUnscheduled?: boolean;
}

export interface PermanentScheduleChangeReviewDataDto {
  courseId: number;
  programId?: number;
  programName: string;
  teacherId?: number;
  teacherName: string;
  studentName: string;
  startDate: Date;
  endDate: Date;
  startTime: string;
  lessons: PermanentScheduleChangeReviewItemDto[];
  unscheduledLessons?: PermanentScheduleChangeReviewItemDto[];
  rescheduledLessons?: PermanentScheduleChangeReviewItemDto[];
  summary: {
    holidayConflicted: number;
    conflicted: number;
    unscheduled: number;
    scheduled: number;
    total: number;
  };
}
