/** Menor k ≥ 1 tal que (início + k anos) ≥ fim da vigência. */
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

/**
 * Indica se o mês civil (1–12) no ano calendário cruza a vigência [início, fim):
 * primeiro instante do mês < fim e último dia do mês ≥ início.
 */
function calendarMonthInVigencia(
  calendarYear: number,
  calendarMonth1to12: number,
  contractStart: Date,
  contractEnd: Date
): boolean {
  const ms = new Date(calendarYear, calendarMonth1to12 - 1, 1, 12, 0, 0, 0);
  const me = new Date(calendarYear, calendarMonth1to12, 0, 12, 0, 0, 0);
  return ms.getTime() < contractEnd.getTime() && me.getTime() >= contractStart.getTime();
}

/** Quantidade de meses civis da vigência. */
export function countVigenciaMonths(startDate: Date, endDate: Date): number {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 12, 0, 0, 0);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 12, 0, 0, 0);
  if (end.getTime() <= start.getTime()) return 0;

  let n = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0, 0);
  const endCursor = new Date(end.getFullYear(), end.getMonth(), 1, 12, 0, 0, 0);
  while (cursor.getTime() <= endCursor.getTime()) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    if (calendarMonthInVigencia(y, m, start, end)) n += 1;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return n;
}

/** Meses civis da vigência em um ano calendário. */
export function countVigenciaMonthsInYear(startDate: Date, endDate: Date, year: number): number {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 12, 0, 0, 0);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 12, 0, 0, 0);
  if (end.getTime() <= start.getTime()) return 0;

  let n = 0;
  for (let m = 1; m <= 12; m++) {
    if (calendarMonthInVigencia(year, m, start, end)) n += 1;
  }
  return n;
}

/**
 * Valor anual base de um ano civil: proporcional aos meses da vigência naquele ano.
 * Ex.: R$ 100.000 em 18 meses → ~R$ 5.555,56/mês → 6 meses = R$ 33.333,33; 12 meses = R$ 66.666,67.
 */
export function computedBaseAnnualValueForYear(
  valuePlusAddenda: number,
  startDate: Date,
  endDate: Date,
  year: number
): number | null {
  const totalMonths = countVigenciaMonths(startDate, endDate);
  if (totalMonths <= 0) return null;
  const monthsInYear = countVigenciaMonthsInYear(startDate, endDate, year);
  if (monthsInYear <= 0) return 0;
  return (valuePlusAddenda / totalMonths) * monthsInYear;
}

/**
 * @deprecated Preferir computedBaseAnnualValueForYear — rateio igual por anos.
 * Mantido só para fallback; retorna média por ano de vigência (aniversários).
 */
export function computedBaseAnnualValue(
  valuePlusAddenda: number,
  startDate: Date,
  endDate: Date
): number | null {
  const k = countContractYearsOfVigencia(startDate, endDate);
  if (k <= 0) return null;
  return valuePlusAddenda / k;
}

/** Mapa ano civil → valor anual base proporcional aos meses. */
export function computedBaseAnnualByYear(
  valuePlusAddenda: number,
  startDate: Date,
  endDate: Date
): Record<number, number> {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 12, 0, 0, 0);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 12, 0, 0, 0);
  const result: Record<number, number> = {};
  if (end.getTime() <= start.getTime()) return result;

  const totalMonths = countVigenciaMonths(start, end);
  if (totalMonths <= 0) return result;

  const monthly = valuePlusAddenda / totalMonths;
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
    const months = countVigenciaMonthsInYear(start, end, y);
    if (months > 0) result[y] = monthly * months;
  }
  return result;
}
