export const TIMEZONE_BRASILIA = 'America/Sao_Paulo';

/** Apenas calendário YYYY-MM-DD — evita deslocar o dia em campos sem hora. */
export function parseDateOnlyLocal(dateStr: string): Date | null {
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

/**
 * Campos só com data (vigência, emissão etc.) — ignora hora em ISO para não mudar o dia.
 */
export function parseDateSafe(dateStr: string | Date | null | undefined): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    if (Number.isNaN(dateStr.getTime())) return null;
    return new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate(), 12, 0, 0, 0);
  }
  const raw = String(dateStr).trim();
  const dateOnly = parseDateOnlyLocal(raw);
  if (dateOnly) return dateOnly;
  const isoPrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoPrefix) {
    return parseDateOnlyLocal(`${isoPrefix[1]}-${isoPrefix[2]}-${isoPrefix[3]}`);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** createdAt / updatedAt — preserva o instante completo (data + hora). */
export function parseDateTimeSafe(dateStr: string | Date | null | undefined): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    return Number.isNaN(dateStr.getTime()) ? null : dateStr;
  }
  const raw = String(dateStr).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return parseDateOnlyLocal(raw);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateBr(
  dateStr: string | Date | null | undefined,
  fallback = '-'
): string {
  const d = parseDateSafe(dateStr);
  if (!d) return fallback;
  return d.toLocaleDateString('pt-BR', { timeZone: TIMEZONE_BRASILIA });
}

export function formatDateTimeBr(
  dateStr: string | Date | null | undefined,
  fallback = '-'
): string {
  const d = parseDateTimeSafe(dateStr);
  if (!d) return fallback;
  return d.toLocaleString('pt-BR', {
    timeZone: TIMEZONE_BRASILIA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
