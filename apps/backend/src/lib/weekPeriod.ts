function mondayFromIsoWeekKey(weekKey: string): Date | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!match) return null;

  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday;
}

function sundayFromFortnightKey(weekKey: string): Date | null {
  const monday = mondayFromIsoWeekKey(weekKey);
  if (!monday) return null;
  const end = new Date(monday);
  end.setUTCDate(monday.getUTCDate() + 13);
  return end;
}

/** Chave ISO da semana (ex.: 2026-W35). */
export function getIsoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Chave da quinzena corrente (semana ISO inicial do bloco de 14 dias). */
export function getFortnightKey(date = new Date()): string {
  const currentWeekKey = getIsoWeekKey(date);
  const match = /^(\d{4})-W(\d{2})$/.exec(currentWeekKey);
  if (!match) return currentWeekKey;

  const weekNum = Number(match[2]);
  if (weekNum % 2 === 0) {
    const monday = mondayFromIsoWeekKey(currentWeekKey);
    if (!monday) return currentWeekKey;
    monday.setUTCDate(monday.getUTCDate() - 7);
    return getIsoWeekKey(
      new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()),
    );
  }
  return currentWeekKey;
}

export function shiftFortnightKey(weekKey: string, deltaFortnights: number): string {
  const monday = mondayFromIsoWeekKey(weekKey);
  if (!monday) return getFortnightKey();

  monday.setUTCDate(monday.getUTCDate() + deltaFortnights * 14);
  return getFortnightKey(
    new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()),
  );
}

export function isFortnightBefore(weekKey: string, otherWeekKey: string): boolean {
  const monday = mondayFromIsoWeekKey(weekKey);
  const otherMonday = mondayFromIsoWeekKey(otherWeekKey);
  if (!monday || !otherMonday) return false;
  return monday.getTime() < otherMonday.getTime();
}

export function isFortnightAfter(weekKey: string, otherWeekKey: string): boolean {
  const monday = mondayFromIsoWeekKey(weekKey);
  const otherMonday = mondayFromIsoWeekKey(otherWeekKey);
  if (!monday || !otherMonday) return false;
  return monday.getTime() > otherMonday.getTime();
}

/** Rótulo amigável: "Quinzena 25/08 – 07/09/2026". */
export function formatWeekLabel(weekKey: string): string {
  const monday = mondayFromIsoWeekKey(weekKey);
  const sunday = sundayFromFortnightKey(weekKey);
  if (!monday || !sunday) return weekKey;

  const fmt = (value: Date) =>
    value.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

  return `Quinzena ${fmt(monday)} – ${fmt(sunday)}/${sunday.getUTCFullYear()}`;
}
