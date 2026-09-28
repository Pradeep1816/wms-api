import { getCurrentESTDate } from "src/utils/date-utils";

export enum LessonStatusEnum {
  RESCHEDULED = 1,
  SCHEDULED = 2,
  COMPLETED = 3,
  CANCELED = 4,
  UNSCHEDULED = 5,
  EXPIRED = 10,
}

export enum OwingStatusEnum {
  PAID = 1,
  OWING = 3,
}

/**
 * Check if lesson is completed (date has passed)
 */
function isCompleted(lessonDate: Date): boolean {
  const currentDate = getCurrentESTDate();
  return new Date(lessonDate) <= currentDate;
}

/**
 * Check if lesson is expired
 * Based on legacy: isExpired()
 */
function isExpired(lesson: any): boolean {
  if (lesson.status !== LessonStatusEnum.UNSCHEDULED) {
    return false;
  }
  
  const privateLesson = lesson.privateLesson?.[0];
  if (!privateLesson?.expiryDate) {
    return false;
  }
  
  const currentDate = getCurrentESTDate();
  return new Date(privateLesson.expiryDate) < currentDate;
}

/**
 * Get status text with full logic (matching legacy getStatus())
 * Uses EST timezone for date comparisons
 */
export function getStatus(lesson: any): string {
  // Check expired first
  if (isExpired(lesson)) {
    return 'Expired';
  }

  switch (lesson.status) {
    case LessonStatusEnum.SCHEDULED:
      if (!isCompleted(lesson.date) && lesson.isPresent) {
        return 'Scheduled';
      } else if (!lesson.isPresent) {
        return 'Absent';
      } else {
        return 'Completed';
      }

    case LessonStatusEnum.CANCELED:
      return 'Canceled';

    case LessonStatusEnum.RESCHEDULED:
      if (!isCompleted(lesson.date)) {
        return 'Rescheduled';
      } else if (!lesson.isPresent) {
        return 'Absent';
      } else {
        return 'Completed';
      }

    case LessonStatusEnum.UNSCHEDULED:
      let status = 'Unscheduled';
      if (lesson.isExploded) {
        status += ' (Exploded)';
      }
      return status;

    default:
      return 'Unknown';
  }
}