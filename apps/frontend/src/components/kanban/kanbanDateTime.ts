/** Utilitários de data/hora do Kanban (card e checklist). */

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function splitDateTime(value: string | null | undefined): { date: string; time: string } {
  if (!value) return { date: '', time: '09:00' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value, time: '09:00' };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return { date: value.slice(0, 10), time: '09:00' };
  }
  return {
    date: toYmd(d),
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

export function combineDateTime(date: string, time: string): string {
  if (!date) return '';
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : '09:00';
  return `${date}T${t}:00`;
}

export function formatKanbanDateTimeLabel(value: string): string {
  const { date, time } = splitDateTime(value);
  if (!date) return '';
  const d = new Date(date + 'T12:00:00');
  const datePart = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
  const hasExplicitTime = value.includes('T');
  if (!hasExplicitTime) return datePart;
  return `${datePart} ${time}`;
}

export function formatKanbanDateRange(start: string, end: string): string {
  if (start && end) {
    const s = formatKanbanDateTimeLabel(start);
    const e = formatKanbanDateTimeLabel(end);
    if (s === e) return s;
    return `${s} – ${e}`;
  }
  if (start) return formatKanbanDateTimeLabel(start);
  if (end) return formatKanbanDateTimeLabel(end);
  return 'Definir data';
}

/** Data curta para o card no quadro (sem hora). */
export function formatKanbanCardDate(value: string | null | undefined): string {
  if (!value) return '';
  const { date } = splitDateTime(value);
  if (!date) return '';
  const d = new Date(date + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

/** Intervalo de datas no card do quadro (sem hora). */
export function formatKanbanCardDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const s = start ? formatKanbanCardDate(start) : '';
  const e = end ? formatKanbanCardDate(end) : '';
  if (s && e) {
    if (s === e) return s;
    return `${s} – ${e}`;
  }
  if (s) return `Início ${s}`;
  if (e) return `Término ${e}`;
  return '';
}

/** Data(s) na faixa de meta do card — sem prefixos Início/Término. */
export function formatKanbanCardDateMeta(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const s = start ? formatKanbanCardDate(start) : '';
  const e = end ? formatKanbanCardDate(end) : '';
  if (s && e) return s === e ? s : `${s} – ${e}`;
  return s || e || '';
}

/** Data de término no card — ex.: Mai 14, 2026 */
export function formatKanbanCardEndDate(end: string | null | undefined): string {
  if (!end) return '';
  const { date } = splitDateTime(end);
  if (!date) return '';
  const d = new Date(date + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';

  const monthSlug = d
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace(/\./g, '')
    .trim();
  const month = monthSlug.charAt(0).toUpperCase() + monthSlug.slice(1);

  return `${month} ${d.getDate()}, ${d.getFullYear()}`;
}
