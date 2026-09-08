/** @deprecated Use FORM_FIELD_NO_FOCUS_CLS de `@/lib/formFieldUi`. */
export { FORM_FIELD_NO_FOCUS_CLS as DP_SOLICITACOES_NO_FOCUS_CLS } from '@/lib/formFieldUi';

/** Data ISO → DD/MM/AAAA (ex.: 24/10/2002). */
export function formatIsoDateToBr(iso?: string | null): string {
  if (!iso) return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

/** Intervalo de datas → DD/MM/AAAA ou DD/MM/AAAA a DD/MM/AAAA (se forem diferentes). */
export function formatIsoDateRangeToBr(start?: string | null, end?: string | null): string {
  const a = formatIsoDateToBr(start);
  const b = formatIsoDateToBr(end);
  if (a === '—' && b === '—') return '—';
  if (a === '—') return b;
  if (b === '—') return a;
  if (a === b) return a;
  return `${a} a ${b}`;
}
