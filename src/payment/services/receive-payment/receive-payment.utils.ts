import { RoundingUtils } from '../../../utils/rounding.utils';
import { GroupLessonKey } from './receive-payment.types';

export function roundMoney(value: number): number {
  return RoundingUtils.roundDecimal(Number(value || 0), 2);
}

export function sumValues(values: number[]): number {
  return values.reduce((acc, value) => acc + Number(value || 0), 0);
}

export function uniqueIds(items: Array<{ id: number }>): number[] {
  return [
    ...new Set(
      items
        .map((item) => Number(item.id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
}

export function formatInvoiceReference(invoiceNumber: number): string {
  return `I-${String(invoiceNumber).padStart(5, '0')}`;
}

export function formatLessonReference(lessonId: number): string {
  return `L-${String(lessonId).padStart(6, '0')}`;
}

export function addGroupLessonKey(
  store: Map<string, GroupLessonKey>,
  lessonId: number,
  enrolmentId: number,
): void {
  const key = `${lessonId}:${enrolmentId}`;
  if (!store.has(key)) {
    store.set(key, { lessonId, enrolmentId });
  }
}
