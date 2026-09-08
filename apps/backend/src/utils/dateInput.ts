const BRASILIA_OFFSET = '-03:00';

function brasiliaDateAtMidnight(year: number, month: number, day: number): Date {
  const y = String(year);
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return new Date(`${y}-${m}-${d}T00:00:00${BRASILIA_OFFSET}`);
}

/**
 * Converte valor de data (API, planilha, ISO) em Date de calendário em Brasília,
 * sem deslocar o dia por fuso horário.
 */
export function parseDateOnlyValue(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return brasiliaDateAtMidnight(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  }

  if (typeof value === 'number') {
    // Excel: serial de dias desde 30/12/1899 (~1990 a ~2100).
    if (value >= 32874 && value <= 73415) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      const parsed = new Date(excelEpoch + Math.floor(value) * 86400000);
      return brasiliaDateAtMidnight(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth() + 1,
        parsed.getUTCDate(),
      );
    }
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return brasiliaDateAtMidnight(
        Number(isoMatch[1]),
        Number(isoMatch[2]),
        Number(isoMatch[3]),
      );
    }

    for (const sep of ['/', '-', '.']) {
      const parts = trimmed.split(sep);
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        if (
          day >= 1 &&
          day <= 31 &&
          month >= 1 &&
          month <= 12 &&
          year >= 1990 &&
          year <= 2100
        ) {
          const parsed = brasiliaDateAtMidnight(year, month, day);
          if (!isNaN(parsed.getTime())) return parsed;
        }
      }
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getUTCFullYear();
      if (year >= 1990 && year <= 2100) {
        return brasiliaDateAtMidnight(year, parsed.getUTCMonth() + 1, parsed.getUTCDate());
      }
    }
  }

  return null;
}

export function parseDateInput(value: string | Date): Date {
  if (value instanceof Date) {
    return parseDateOnlyValue(value) ?? value;
  }

  const raw = String(value).trim();
  const onlyDateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (onlyDateMatch) {
    return brasiliaDateAtMidnight(
      Number(onlyDateMatch[1]),
      Number(onlyDateMatch[2]),
      Number(onlyDateMatch[3]),
    );
  }

  return new Date(raw);
}
