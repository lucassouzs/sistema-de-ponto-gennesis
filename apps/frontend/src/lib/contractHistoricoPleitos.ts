import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { formatOsSePasta } from '@/lib/formatOsSePasta';

export const PLEITO_HISTORY_MARKER = '__PLEITO_HISTORICO__';
export const PLEITO_HISTORY_MARKER_GERADO_100 = '__PLEITO_HISTORICO__GERADO_100__';
/** Antes: «Gerado 100%». Agora: pleito cobrindo 100% do orçamento (uso em OS / andamento). */
export const HISTORICO_ETIQUETA_GERADO_100 = 'Pleiteado 100%';
export const HISTORICO_ETIQUETA_PLEITEADO_PARCIAL = 'Pleiteado parcial';
export const HISTORICO_ETIQUETA_FATURADO_100 = 'Faturado 100%';
export const HISTORICO_ETIQUETA_FATURADO_PARCIAL = 'Faturado parcial';
export const HISTORICO_ETIQUETA_PENDENTE = 'Pendente';

export interface ContractPleitoHistorico {
  id: string;
  divSe: string | null;
  folderNumber: string | null;
  serviceDescription: string;
  budget: string | null;
  budgetStatus: string | null;
  executionStatus: string | null;
  billingStatus: string | null;
  invoiceNumber?: string | null;
  creationMonth: string | null;
  creationYear: number | null;
  billingRequest?: number | null;
  accumulatedBilled?: number | null;
  reportsBilling: string | null;
  createdAt?: string;
}

export interface ContractBillingHistorico {
  id: string;
  pleitoId?: string | null;
  serviceOrder: string;
  grossValue: number;
  netValue?: number | null;
  invoiceNumber?: string | null;
  issueDate?: string | null;
  createdAt?: string | null;
}

const MESES_FILTRO = [
  { value: 0, label: 'Todos os meses' },
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

export const HIST_MONTH_FILTER_OPTIONS = labeledToSelectOptions(
  [{ value: 'all', label: 'Todos' }, ...MESES_FILTRO.filter((m) => m.value > 0).map((m) => ({
    value: String(m.value),
    label: m.label,
  }))]
);

export const HIST_ETIQUETA_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'all', label: 'Todas' },
  { value: 'pendente', label: HISTORICO_ETIQUETA_PENDENTE },
  { value: 'faturado-parcial', label: HISTORICO_ETIQUETA_FATURADO_PARCIAL },
  { value: 'faturado-100', label: HISTORICO_ETIQUETA_FATURADO_100 },
]);

export const BILLING_STATUS_ROW_OPTIONS = labeledToSelectOptions([
  { value: 'nao-pago', label: 'Não pago' },
  { value: 'pago', label: 'Pago' },
]);

export function formatHistoricoCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function parseBudgetToNumberSafe(v: string | null | undefined): number {
  if (!v) return 0;
  const s = String(v).replace(/[R$\s]/g, '').trim();
  if (!s) return 0;
  if (s.includes(',')) {
    const cleaned = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function getDateYear(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

export function getDateMonth(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.getMonth() + 1;
}

export function isPleitoHistorico(p: ContractPleitoHistorico): boolean {
  const marker = (p.reportsBilling || '').trim();
  return marker === PLEITO_HISTORY_MARKER || marker.startsWith(PLEITO_HISTORY_MARKER);
}

export function isGeneratedPleito(p: ContractPleitoHistorico): boolean {
  return (
    isPleitoHistorico(p) ||
    (p.billingRequest != null ? Number(p.billingRequest) : 0) > 0
  );
}

export function isPleitoGerado100(p: ContractPleitoHistorico): boolean {
  const marker = (p.reportsBilling || '').trim();
  if (marker === PLEITO_HISTORY_MARKER_GERADO_100) return true;
  const orc = parseBudgetToNumberSafe(p.budget);
  const br = p.billingRequest != null ? Number(p.billingRequest) : 0;
  return orc > 0 && br >= orc - 0.01;
}

export function getPleitoBillableTotal(p: ContractPleitoHistorico): number {
  const br = p.billingRequest != null ? Number(p.billingRequest) : 0;
  if (Number.isFinite(br) && br > 0) return br;
  return parseBudgetToNumberSafe(p.budget);
}

export function getPleitoBilledAmount(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): number {
  const linked = billings
    .filter((b) => b.pleitoId === p.id)
    .reduce((sum, b) => sum + Number(b.grossValue || 0), 0);
  if (linked > 0) return linked;
  const accumulated = p.accumulatedBilled != null ? Number(p.accumulatedBilled) : 0;
  if (accumulated > 0) return accumulated;
  const os = (p.divSe || '').trim();
  if (!os) return 0;
  return billings
    .filter((b) => !b.pleitoId && (b.serviceOrder || '').trim() === os)
    .reduce((sum, b) => sum + Number(b.grossValue || 0), 0);
}

export function getPleitoRemainingBalance(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): number {
  const total = getPleitoBillableTotal(p);
  if (total <= 0) return 0;
  return Math.max(0, total - getPleitoBilledAmount(p, billings));
}

export function isPleitoFullyBilled(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): boolean {
  return getPleitoRemainingBalance(p, billings) <= 0.01;
}

export function canHistoricoFaturar100(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): boolean {
  const total = getPleitoBillableTotal(p);
  if (total <= 0) return false;
  return getPleitoBilledAmount(p, billings) <= 0.01;
}

export function getHistoricoClientePagoLabel(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): 'Pago' | 'Não pago' {
  return isPleitoFullyBilled(p, billings) ? 'Pago' : 'Não pago';
}

export function historicoClientePagoClass(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): string {
  return isPleitoFullyBilled(p, billings)
    ? 'text-sm font-semibold text-emerald-700 dark:text-emerald-400'
    : 'text-sm font-medium text-gray-600 dark:text-gray-400';
}

export function canHistoricoFaturarRestante(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): boolean {
  const billed = getPleitoBilledAmount(p, billings);
  const remaining = getPleitoRemainingBalance(p, billings);
  return billed > 0.01 && remaining > 0.01;
}

export function canHistoricoFaturar(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): boolean {
  return getPleitoRemainingBalance(p, billings) > 0.01;
}

export function parseHistoricoCurrencyInput(value: string): number {
  if (!value || typeof value !== 'string') return 0;
  const cleaned = value.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

/** Status de faturamento do pleito na lista de histórico. */
export function getHistoricoEtiqueta(
  p: ContractPleitoHistorico,
  billings: ContractBillingHistorico[]
): string {
  if (isPleitoFullyBilled(p, billings)) return HISTORICO_ETIQUETA_FATURADO_100;
  if (getPleitoBilledAmount(p, billings) > 0.01) return HISTORICO_ETIQUETA_FATURADO_PARCIAL;
  return HISTORICO_ETIQUETA_PENDENTE;
}

export function historicoEtiquetaBadgeClass(etiqueta: string): string {
  const GREEN = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
  const BLUE = 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300';
  const YELLOW = 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';

  // Concluídos (faturado 100% / pleiteado 100%) → verde
  if (
    etiqueta === HISTORICO_ETIQUETA_FATURADO_100 ||
    etiqueta === HISTORICO_ETIQUETA_GERADO_100 ||
    etiqueta === 'Faturado' ||
    etiqueta === 'Pleiteado'
  ) {
    return GREEN;
  }
  // Parciais → azul
  if (etiqueta === HISTORICO_ETIQUETA_FATURADO_PARCIAL || etiqueta === HISTORICO_ETIQUETA_PLEITEADO_PARCIAL) {
    return BLUE;
  }
  // Pendente → amarelo
  if (etiqueta === HISTORICO_ETIQUETA_PENDENTE) {
    return YELLOW;
  }
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
}

export function formatPleitoOsLabel(p: ContractPleitoHistorico): string {
  return formatOsSePasta(p.divSe || '-', p.folderNumber);
}

/** IDs sequenciais estáveis (1..N) por ordem de criação / emissão. */
export function buildDisplayIdMap(
  items: ReadonlyArray<{ id: string; createdAt?: string | null; issueDate?: string | null }>
): Map<string, number> {
  const sorted = [...items].sort((a, b) => {
    const ta = a.createdAt
      ? new Date(a.createdAt).getTime()
      : a.issueDate
        ? new Date(a.issueDate).getTime()
        : 0;
    const tb = b.createdAt
      ? new Date(b.createdAt).getTime()
      : b.issueDate
        ? new Date(b.issueDate).getTime()
        : 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
  const map = new Map<string, number>();
  sorted.forEach((item, index) => map.set(item.id, index + 1));
  return map;
}

export function formatDisplayId(map: Map<string, number>, id: string): string {
  const n = map.get(id);
  return n != null ? String(n).padStart(2, '0') : '—';
}

function normalizeOsKey(divSe: string | null | undefined): string {
  return (divSe || '').trim().toLowerCase();
}

/** Pleitos gerados vinculados à mesma OS / SE. */
export function getOsLinkedPleitos<T extends ContractPleitoHistorico>(
  allPleitos: T[],
  divSe: string | null | undefined
): T[] {
  const key = normalizeOsKey(divSe);
  if (!key) return [];
  return allPleitos
    .filter((p) => isGeneratedPleito(p) && normalizeOsKey(p.divSe) === key)
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
}

/** Faturamentos vinculados à OS (por pleitoId ou serviceOrder ≈ divSe). */
export function getOsLinkedBillings<T extends ContractBillingHistorico>(
  billings: T[],
  allPleitos: ContractPleitoHistorico[],
  divSe: string | null | undefined
): T[] {
  const key = (divSe || '').trim();
  if (!key) return [];
  const linkedPleitoIds = new Set(getOsLinkedPleitos(allPleitos, divSe).map((p) => p.id));
  return billings
    .filter((b) => {
      if (b.pleitoId && linkedPleitoIds.has(b.pleitoId)) return true;
      return (b.serviceOrder || '').trim() === key;
    })
    .sort((a, b) => {
      const ta = a.issueDate ? new Date(a.issueDate).getTime() : a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.issueDate ? new Date(b.issueDate).getTime() : b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
}

/** Faturamentos gerados para um pleito específico (mesma regra de soma do valor faturado). */
export function getPleitoLinkedBillings<T extends ContractBillingHistorico>(
  p: ContractPleitoHistorico,
  billings: T[]
): T[] {
  const byPleitoId = billings.filter((b) => b.pleitoId === p.id);
  if (byPleitoId.length > 0) {
    return [...byPleitoId].sort((a, b) => {
      const ta = a.issueDate ? new Date(a.issueDate).getTime() : a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.issueDate ? new Date(b.issueDate).getTime() : b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
  }
  const os = (p.divSe || '').trim();
  if (!os) return [];
  return billings
    .filter((b) => !b.pleitoId && (b.serviceOrder || '').trim() === os)
    .sort((a, b) => {
      const ta = a.issueDate ? new Date(a.issueDate).getTime() : a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.issueDate ? new Date(b.issueDate).getTime() : b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
}

export type BillingAndamentoStatus = 'Faturado' | 'Líquido pendente';

export function getBillingAndamentoStatus(b: {
  netValue?: number | string | null;
}): BillingAndamentoStatus {
  const net = b.netValue != null ? Number(b.netValue) : NaN;
  if (!Number.isFinite(net) || net <= 0) return 'Líquido pendente';
  return 'Faturado';
}

export function billingAndamentoBadgeClass(status: BillingAndamentoStatus): string {
  if (status === 'Líquido pendente') {
    return 'inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  }
  return 'inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
}
