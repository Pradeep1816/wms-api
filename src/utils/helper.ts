import { RoundingUtils } from './rounding.utils';

export function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
    useGrouping: false,
  }).format(value);
}

/**
 * Compatibility wrapper that routes legacy callers through the shared
 * exact-decimal money rounder.
 * @param value - The number to round
 * @param precision - Number of decimal places (default: 2)
 * @returns Rounded number
 */
export function roundHalfUp(value: number, precision: number = 2): number {
  return RoundingUtils.roundDecimal(value, precision);
}

/**
 * Safely convert a balance value to a number, handling null, undefined, and NaN values
 * @param balance - The balance value to convert
 * @returns A safe number value (0 if input is invalid)
 */
export function getSafeBalance(balance: any): number {
  if (balance === null || balance === undefined || isNaN(balance)) {
    return 0;
  }
  return Number(balance);
}

// Lesson status constants
export function lessonStatus(): Record<number, string> {
  return {
    1: 'Rescheduled',
    2: 'Scheduled',
    3: 'Completed',
    4: 'Canceled',
    5: 'Unscheduled',
    10: 'Expired',
  };
}

// Invoice type constants

export const INVOICE_TYPES = {
  PRO_FORMA_INVOICE: 1,
  INVOICE: 2,
} as const;

export const INVOICE_STATUS = {
  OWING: 1,
  PAID: 2,
  CREDIT: 3,
  CANCEL: 4,
  VOID: 5,
} as const;

export function getInvoiceStatus(
  status: number,
  type: number,
  balance: number = 0,
  isVoid: boolean = false
): string {
  if (isVoid || status === INVOICE_STATUS.VOID) return 'Voided';

  switch (status) {
    case INVOICE_STATUS.OWING:
      return balance > 0.09
        ? type === INVOICE_TYPES.INVOICE ? 'Owing' : 'Unpaid'
        : 'Paid';

    case INVOICE_STATUS.CREDIT:
      return balance <= -0.09
        ? type === INVOICE_TYPES.INVOICE ? 'Credit' : 'Paid'
        : 'Paid';

    case INVOICE_STATUS.PAID:
      return 'Paid';

    case INVOICE_STATUS.CANCEL:
      return 'Canceled';

    default:
      return 'Unknown';
  }
}


/**
 * Get invoice status text for display purposes
 * @param status - The invoice status number
 * @returns Human-readable status text
 */
export function getInvoiceStatusText(status: number): string {
  const statusMap = {
    [INVOICE_STATUS.OWING]: 'Owing',
    [INVOICE_STATUS.PAID]: 'Paid',
    [INVOICE_STATUS.CREDIT]: 'Credit',
    [INVOICE_STATUS.CANCEL]: 'Canceled',
    [INVOICE_STATUS.VOID]: 'Void'
  };
  return statusMap[status] || 'Unknown';
}

/**
 * Get CSS class name for lesson based on lesson properties
 * This follows legacy Lesson::getClass() behavior.
 * 
 * @param lesson - Lesson object with properties: colorCode, isPresent, type, status, teacherId, etc.
 * @param rootLesson - Optional root lesson from hierarchy (for teacher substitution checks).
 *                     If an options object is passed as second argument, rootLesson can be provided there.
 * @param options - Optional helper controls for parity-sensitive contexts.
 * @returns CSS class name string
 */
export function getLessonClassName(
  lesson: any,
  rootLessonOrOptions?: any,
  options?: {
    rootLesson?: any;
    programType?: number;
    firstLessonIdByCourseId?: Map<number, number>;
    extraLessonType?: number;
  },
): string {
  const resolvedOptions =
    rootLessonOrOptions &&
    typeof rootLessonOrOptions === 'object' &&
    !Array.isArray(rootLessonOrOptions) &&
    ('programType' in rootLessonOrOptions ||
      'firstLessonIdByCourseId' in rootLessonOrOptions ||
      'extraLessonType' in rootLessonOrOptions ||
      'rootLesson' in rootLessonOrOptions)
      ? {
          ...(rootLessonOrOptions as {
            rootLesson?: any;
            programType?: number;
            firstLessonIdByCourseId?: Map<number, number>;
            extraLessonType?: number;
          }),
          ...(options || {}),
        }
      : {
          ...(options || {}),
          rootLesson: rootLessonOrOptions,
        };

  const rootLesson = resolvedOptions.rootLesson;
  const programType = resolvedOptions.programType ?? lesson.course?.program?.type;
  const extraLessonType = resolvedOptions.extraLessonType ?? 2; // Legacy TYPE_EXTRA
  const firstLessonIdByCourseId = resolvedOptions.firstLessonIdByCourseId;

  const hasBulkReschedule = Array.isArray(lesson.bulkRescheduleLesson)
    ? lesson.bulkRescheduleLesson.length > 0
    : !!lesson.bulkRescheduleLesson;

  const isFirstLesson = (() => {
    const courseId = Number(lesson.courseId);
    if (firstLessonIdByCourseId && courseId > 0) {
      const firstLessonId = firstLessonIdByCourseId.get(courseId);
      return !!firstLessonId && firstLessonId === lesson.id;
    }

    const enrolment = lesson.enrolment || lesson.course?.enrolments?.[0];
    const lessons = enrolment?.lessons || lesson.course?.lessons || [];
    if (!Array.isArray(lessons) || lessons.length === 0) {
      return false;
    }

    // Legacy parity fallback (used when firstLessonIdByCourseId map is not provided):
    // Lesson::find()->notDeleted()->notCanceled()->orderBy(date ASC)->one()
    const eligibleLessons = lessons.filter((candidate: any) => {
      if (!candidate?.date) {
        return false;
      }

      const isDeleted = Number(candidate.isDeleted ?? 0) === 1;
      const isCanceled = Number(candidate.status) === 4;
      return !isDeleted && !isCanceled;
    });

    if (eligibleLessons.length === 0 || !lesson?.date) {
      return false;
    }

    const firstLesson = eligibleLessons.sort((left: any, right: any) => {
      const leftTime = new Date(left.date).getTime();
      const rightTime = new Date(right.date).getTime();

      if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return 0;
      if (!Number.isFinite(leftTime)) return 1;
      if (!Number.isFinite(rightTime)) return -1;

      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      return Number(left.id || 0) - Number(right.id || 0);
    })[0];

    if (!firstLesson?.date) {
      return false;
    }

    // Legacy compares date field equality for first-lesson classification.
    if (firstLesson.date === lesson.date) {
      return true;
    }

    const firstTime = new Date(firstLesson.date).getTime();
    const lessonTime = new Date(lesson.date).getTime();
    return Number.isFinite(firstTime) && Number.isFinite(lessonTime) && firstTime === lessonTime;
  })();

  return (() => {
    // colorCode bypasses CSS class mapping.
    if (lesson.colorCode) return '';

    let className = '';

    const isExtra = Number(lesson.type) === Number(extraLessonType);

    // Base class selection
    if (!lesson.isPresent) {
      className = 'absent-lesson';
    } else if (!isExtra && isFirstLesson) {
      className = 'first-lesson';
    } else if (Number(programType) === 1) {
      className = 'private-lesson';
    } else if (Number(programType) === 2) {
      className = 'group-lesson';
    }

    // Root lesson overrides
    if (rootLesson) {
      if (!lesson.isPresent) {
        className = 'absent-lesson';
      } else if (lesson.status === 1) {
        className = 'lesson-rescheduled';
      } else if (
        rootLesson.teacherId !== lesson.teacherId &&
        !hasBulkReschedule
      ) {
        className = 'teacher-substituted';
      }
    }

    return className;
  })();
}

/**
 * Default schedule wrapper.
 * Uses shared class derivation with generic defaults.
 */
export function getScheduleLessonClassName(lesson: any, rootLesson?: any): string {
  return getLessonClassName(lesson, rootLesson);
}

/**
 * Daily schedule wrapper.
 * Allows feature-specific context while still delegating to the common helper.
 */
export function getDailyScheduleLessonClassName(
  lesson: any,
  rootLesson: any,
  options: {
    programType?: number;
    firstLessonIdByCourseId: Map<number, number>;
    extraLessonType?: number;
  },
): string {
  return getLessonClassName(lesson, rootLesson, {
    programType: options.programType,
    firstLessonIdByCourseId: options.firstLessonIdByCourseId,
    extraLessonType: options.extraLessonType ?? 2,
  });
}
