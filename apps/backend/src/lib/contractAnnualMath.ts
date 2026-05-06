/** Mesma regra do frontend: menor k ≥ 1 tal que (início + k anos) ≥ fim da vigência. */
export function countContractYearsOfVigencia(startDate: Date, endDate: Date): number {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 12, 0, 0, 0);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 12, 0, 0, 0);
  if (end.getTime() <= start.getTime()) return 0;
  const addYears = (d: Date, years: number) =>
    new Date(d.getFullYear() + years, d.getMonth(), d.getDate(), 12, 0, 0, 0);
  let k = 0;
  while (k < 100) {
    k += 1;
    const boundary = addYears(start, k);
    if (boundary.getTime() >= end.getTime()) return k;
  }
  return 0;
}

export function computedBaseAnnualValue(valuePlusAddenda: number, startDate: Date, endDate: Date): number | null {
  const k = countContractYearsOfVigencia(startDate, endDate);
  if (k <= 0) return null;
  return valuePlusAddenda / k;
}
