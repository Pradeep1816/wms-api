import { RoundingUtils } from '../../utils/rounding.utils';

/** Allocate the invoice's actual tax cents once, in stable line order. Partial
 * returns and payment recognition must use the same per-line cent remainder. */
export function allocatePosInvoiceTax(
  lines: { id: number; net: number; tax: number }[],
  invoiceTax: number,
): Map<number, number> {
  const sorted = [...lines].sort((a, b) => a.id - b.id);
  const totalTax = sorted.reduce((sum, line) => sum + line.tax, 0);
  const totalNet = sorted.reduce((sum, line) => sum + line.net, 0);
  const target = RoundingUtils.roundHalfUp(invoiceTax, 2);
  const result = new Map<number, number>();
  let weight = 0;
  let allocated = 0;
  for (const line of sorted) {
    weight += totalTax
      ? line.tax / totalTax
      : totalNet
        ? line.net / totalNet
        : 0;
    const cumulative = RoundingUtils.roundHalfUp(target * weight, 2);
    result.set(line.id, RoundingUtils.roundHalfUp(cumulative - allocated, 2));
    allocated = cumulative;
  }
  return result;
}
