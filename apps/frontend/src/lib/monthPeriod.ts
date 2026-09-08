/** Chave do mês (ex.: 2026-08). */
export function getIsoMonthKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function shiftIsoMonthKey(monthKey: string, deltaMonths: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return getIsoMonthKey();

  const date = new Date(Number(match[1]), Number(match[2]) - 1 + deltaMonths, 1);
  return getIsoMonthKey(date);
}

/** Rótulo amigável: "Agosto/2026". */
export function formatMonthLabel(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const name = MONTH_NAMES[month - 1];
  if (!name) return monthKey;
  return `${name}/${year}`;
}

export function entryMonthLabel(entry: {
  monthKey?: string;
  nome?: string;
  createdAt?: string;
}): string {
  if (entry.monthKey) return formatMonthLabel(entry.monthKey);
  if (entry.nome?.trim()) return entry.nome.trim();
  if (entry.createdAt) {
    const d = new Date(entry.createdAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    }
  }
  return 'Mês';
}
