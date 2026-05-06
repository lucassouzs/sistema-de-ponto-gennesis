export function parseDateInput(value: string | Date): Date {
  if (value instanceof Date) {
    return value;
  }

  const raw = String(value).trim();
  const onlyDateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (onlyDateMatch) {
    // Data sem hora: início do dia no horário oficial de Brasília (UTC−3, sem horário de verão).
    return new Date(`${onlyDateMatch[1]}-${onlyDateMatch[2]}-${onlyDateMatch[3]}T00:00:00-03:00`);
  }

  return new Date(raw);
}
