export type FetchRows<TParams extends any[], TRaw> = (...params: TParams) => Promise<TRaw[]>;
export type MapRow<TRaw, TValue> = (row: TRaw) => TValue;

export function sumBy<T>(items: T[], selector: (item: T) => number): number {
  return items.reduce((sum, item) => sum + (selector(item) || 0), 0);
}

export function getMonthName(monthNumber: number): string {
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  return monthNames[monthNumber - 1] || 'Unknown';
}

export async function runReport<TParams extends any[], TRaw, TValue, TResult extends { values: TValue[]; total?: number }>(
  fetchRows: FetchRows<TParams, TRaw>,
  mapRow: MapRow<TRaw, TValue>,
  sumValues?: (values: TValue[]) => number,
  ...params: TParams
): Promise<TResult> {
  const rows = await fetchRows(...params);
  const values = rows.map(mapRow);
  const result: any = { values };
  if (sumValues) {
    result.total = sumValues(values);
  }
  return result as TResult;
}


