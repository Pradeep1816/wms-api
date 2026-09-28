/**
 * Enrolment behavior: payment-cycle membership
 *
 * Verified legacy anchors:
 * - SMW-Legacy@af5c810b common/models/Enrolment.php:840 setPaymentCycle()
 * - SMW-Legacy@af5c810b common/models/PaymentCycle.php:311 afterSave()
 * - SMW-Legacy@af5c810b common/models/PaymentCycleLesson.php:110 afterSave()
 *
 * Modern anchor:
 * - API@6a3ab485 src/lesson/services/lesson-confirmation.service.ts:637 createPaymentCycleLessons()
 *
 * Rule: a confirmed active lesson inside a payment-cycle date range must have
 * exactly one active payment_cycle_lesson row for that cycle. Inactive,
 * deleted, canceled, or out-of-range lessons must not gain active links.
 */

export type CycleLessonStatus =
  | 'scheduled'
  | 'rescheduled'
  | 'completed'
  | 'absent'
  | 'canceled'
  | 'unscheduled';

export interface CycleLesson {
  readonly id: number;
  readonly date: string;
  readonly status: CycleLessonStatus;
  readonly isConfirmed: boolean;
  readonly isDeleted: boolean;
}

export interface PaymentCycleWindow {
  readonly id: number;
  readonly startDate: string;
  readonly endDate: string;
}

export interface PaymentCycleLessonLink {
  readonly id: number;
  readonly paymentCycleId: number;
  readonly lessonId: number;
  readonly isDeleted: boolean;
}

export type PaymentCycleMembershipViolation =
  | {
      readonly kind: 'missing-active-link';
      readonly paymentCycleId: number;
      readonly lessonId: number;
    }
  | {
      readonly kind: 'duplicate-active-link';
      readonly paymentCycleId: number;
      readonly lessonId: number;
      readonly linkIds: readonly number[];
    }
  | {
      readonly kind: 'ineligible-active-link';
      readonly paymentCycleId: number;
      readonly lessonId: number;
      readonly linkId: number;
      readonly reason:
        | 'not-found'
        | 'out-of-range'
        | 'not-confirmed'
        | 'deleted'
        | 'canceled';
    };

type IneligibleReason = Extract<
  PaymentCycleMembershipViolation,
  { readonly kind: 'ineligible-active-link' }
>['reason'];

export function eligibleCycleLessons(
  cycle: PaymentCycleWindow,
  lessons: readonly CycleLesson[],
): readonly CycleLesson[] {
  return lessons.filter((lesson) => {
    if (!lesson.isConfirmed) return false;
    if (lesson.isDeleted) return false;
    if (lesson.status === 'canceled') return false;
    return lesson.date >= cycle.startDate && lesson.date <= cycle.endDate;
  });
}

export function evaluatePaymentCycleMembership(input: {
  readonly cycle: PaymentCycleWindow;
  readonly lessons: readonly CycleLesson[];
  readonly links: readonly PaymentCycleLessonLink[];
}): readonly PaymentCycleMembershipViolation[] {
  const eligibleLessonIds = new Set(
    eligibleCycleLessons(input.cycle, input.lessons).map((lesson) => lesson.id),
  );
  const lessonsById = new Map(
    input.lessons.map((lesson) => [lesson.id, lesson] as const),
  );
  const activeLinksForCycle = input.links.filter(
    (link) => link.paymentCycleId === input.cycle.id && !link.isDeleted,
  );
  const activeLinkIdsByLessonId = new Map<number, number[]>();
  const violations: PaymentCycleMembershipViolation[] = [];

  for (const link of activeLinksForCycle) {
    const linkIds = activeLinkIdsByLessonId.get(link.lessonId) ?? [];
    linkIds.push(link.id);
    activeLinkIdsByLessonId.set(link.lessonId, linkIds);

    const lesson = lessonsById.get(link.lessonId);
    const reason = ineligibleReason(input.cycle, lesson);
    if (reason) {
      violations.push({
        kind: 'ineligible-active-link',
        paymentCycleId: input.cycle.id,
        lessonId: link.lessonId,
        linkId: link.id,
        reason,
      });
    }
  }

  for (const lessonId of eligibleLessonIds) {
    const linkIds = activeLinkIdsByLessonId.get(lessonId) ?? [];
    if (linkIds.length === 0) {
      violations.push({
        kind: 'missing-active-link',
        paymentCycleId: input.cycle.id,
        lessonId,
      });
    }
    if (linkIds.length > 1) {
      violations.push({
        kind: 'duplicate-active-link',
        paymentCycleId: input.cycle.id,
        lessonId,
        linkIds,
      });
    }
  }

  return violations;
}

function ineligibleReason(
  cycle: PaymentCycleWindow,
  lesson: CycleLesson | undefined,
): IneligibleReason | null {
  if (!lesson) return 'not-found';
  if (lesson.date < cycle.startDate || lesson.date > cycle.endDate)
    return 'out-of-range';
  if (!lesson.isConfirmed) return 'not-confirmed';
  if (lesson.isDeleted) return 'deleted';
  if (lesson.status === 'canceled') return 'canceled';
  return null;
}
