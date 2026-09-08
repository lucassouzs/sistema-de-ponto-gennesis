import { parseBudgetToNumber } from '@/lib/pleitoForm';
import { PLEITO_HISTORY_MARKER } from '@/lib/pleitoOsExport';
import type { OsPleitoListItem, OsTab, OsTabCounts } from './osFluxTypes';

export { PLEITO_HISTORY_MARKER };

export const OS_FLUX_DEFAULT_TAB: OsTab = 'orcamento';

export const OS_TAB_LABELS: Record<OsTab, string> = {
  orcamento: 'Orçamento',
  aprovadas: 'Aprovadas',
  execucao: 'Em execução',
  pleito: 'Com pleito',
  faturamento: 'Faturamento',
  concluidas: 'Concluídas',
  standby: 'Stand By'
};

export const EMBEDDED_OS_TAB_META: Record<OsTab, { title: string; subtitle: string }> = {
  orcamento: {
    title: 'Orçamento',
    subtitle: 'OS em elaboração, análise fiscal ou equipe de orçamento'
  },
  aprovadas: {
    title: 'Aprovadas',
    subtitle: 'Orçamento aprovado aguardando execução ou faturamento'
  },
  execucao: {
    title: 'Em execução',
    subtitle: 'Serviços em andamento, pendências ou garantia'
  },
  pleito: {
    title: 'Com pleito',
    subtitle: 'OS com valor pleiteado pendente de faturamento'
  },
  faturamento: {
    title: 'Faturamento',
    subtitle: 'OS com faturamento parcial em andamento'
  },
  concluidas: {
    title: 'Concluídas',
    subtitle: 'OS com faturamento integral do orçamento'
  },
  standby: {
    title: 'Stand By',
    subtitle: 'OS pausadas aguardando definição'
  }
};

const EXECUCAO_ACTIVE = new Set(['EXECUÇÃO', 'PD. EXECUÇÃO', 'PENDÊNCIA', 'GARANTIA']);

/** Cópia de histórico ao gerar pleito — mesma regra da tela do contrato. */
export function isPleitoHistoricoRow(p: OsPleitoListItem): boolean {
  const marker = (p.reportsBilling || '').trim();
  return marker === PLEITO_HISTORY_MARKER || marker.startsWith(PLEITO_HISTORY_MARKER);
}

/**
 * Linha exibível no fluxo global de OS: vinculada a contrato e não é cópia de histórico.
 * Alinhado ao que a aba Ordem de Serviço do contrato lista.
 */
export function isVisibleOsFluxRow(p: OsPleitoListItem): boolean {
  if (isPleitoHistoricoRow(p)) return false;
  const contractId = p.updatedContract?.id ?? p.updatedContractId ?? null;
  if (!contractId) return false;
  const hasOs = Boolean((p.divSe || '').trim());
  const hasDesc = Boolean((p.serviceDescription || '').trim());
  return hasOs || hasDesc;
}

/** @deprecated Use isVisibleOsFluxRow */
export function isMainOsLine(p: OsPleitoListItem): boolean {
  return isVisibleOsFluxRow(p);
}

function osFluxDedupeKey(p: OsPleitoListItem): string {
  const contractId = (p.updatedContract?.id ?? p.updatedContractId ?? '').trim();
  const divSe = (p.divSe || '').trim().toLowerCase();
  if (divSe) return `${contractId}\0${divSe}`;
  return `${contractId}\0id:${p.id}`;
}

/** Mesma OS/SE pode ter vários registros (competências); mantém o mais completo/recente. */
export function dedupeOsFluxRows(pleitos: OsPleitoListItem[]): OsPleitoListItem[] {
  const byKey = new Map<string, OsPleitoListItem>();

  const score = (p: OsPleitoListItem) => {
    let s = 0;
    if ((p.divSe || '').trim()) s += 4;
    if ((p.serviceDescription || '').trim()) s += 2;
    if (parseBudgetToNumber(p.budget) > 0) s += 2;
    if (p.updatedContract?.id || p.updatedContractId) s += 1;
    return s;
  };

  for (const p of pleitos) {
    const key = osFluxDedupeKey(p);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, p);
      continue;
    }
    const prevScore = score(prev);
    const nextScore = score(p);
    if (nextScore > prevScore) {
      byKey.set(key, p);
      continue;
    }
    if (nextScore === prevScore) {
      const prevTs = Date.parse(String(prev.updatedAt || prev.createdAt || ''));
      const nextTs = Date.parse(String(p.updatedAt || p.createdAt || ''));
      if (Number.isFinite(nextTs) && (!Number.isFinite(prevTs) || nextTs > prevTs)) {
        byKey.set(key, p);
      }
    }
  }

  return Array.from(byKey.values());
}

export function prepareOsFluxList(pleitos: OsPleitoListItem[]): OsPleitoListItem[] {
  return dedupeOsFluxRows(pleitos.filter(isVisibleOsFluxRow));
}

export function isOsConcluida(p: OsPleitoListItem): boolean {
  const orc = parseBudgetToNumber(p.budget);
  const acc = Number(p.accumulatedBilled || 0);
  return orc > 0 && acc >= orc - 0.01;
}

export function isOsStandBy(p: OsPleitoListItem): boolean {
  return p.budgetStatus === 'Stand By' || p.executionStatus === 'STANDBY';
}

export function classifyOsPleitoTab(p: OsPleitoListItem): OsTab {
  if (isOsConcluida(p)) return 'concluidas';
  if (isOsStandBy(p)) return 'standby';
  const br = Number(p.billingRequest || 0);
  if (br > 0) return 'pleito';
  const acc = Number(p.accumulatedBilled || 0);
  if (acc > 0) return 'faturamento';
  const exec = (p.executionStatus || '').trim();
  if (EXECUCAO_ACTIVE.has(exec)) return 'execucao';
  if (p.budgetStatus === 'Aprovado' || p.budgetStatus === 'Faturado') return 'aprovadas';
  return 'orcamento';
}

export function filterPleitosByTab(pleitos: OsPleitoListItem[], tab: OsTab): OsPleitoListItem[] {
  return pleitos.filter((p) => classifyOsPleitoTab(p) === tab);
}

export function computeOsTabCounts(pleitos: OsPleitoListItem[]): OsTabCounts {
  const counts: OsTabCounts = {
    orcamento: 0,
    aprovadas: 0,
    execucao: 0,
    pleito: 0,
    faturamento: 0,
    concluidas: 0,
    standby: 0
  };
  for (const p of pleitos) {
    counts[classifyOsPleitoTab(p)]++;
  }
  return counts;
}

export const normalizeOsSearch = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export function matchesOsGlobalSearch(p: OsPleitoListItem, normalizedSearchTerm: string): boolean {
  if (!normalizedSearchTerm) return true;
  const parts = [
    p.divSe,
    p.serviceDescription,
    p.folderNumber,
    p.lot,
    p.location,
    p.engineer,
    p.supervisor,
    p.budgetStatus,
    p.executionStatus,
    p.updatedContract?.name,
    p.updatedContract?.number
  ];
  return parts.some((part) => normalizeOsSearch(String(part ?? '')).includes(normalizedSearchTerm));
}

export function filterPleitosBySearch(pleitos: OsPleitoListItem[], searchTerm: string): OsPleitoListItem[] {
  const q = normalizeOsSearch(searchTerm);
  if (!q) return pleitos;
  return pleitos.filter((p) => matchesOsGlobalSearch(p, q));
}

export type OsGlobalSearchHit = {
  id: string;
  tab: OsTab;
  title: string;
  subtitle: string;
};

export function buildOsGlobalSearchHits(
  pleitos: OsPleitoListItem[],
  searchTerm: string
): OsGlobalSearchHit[] {
  const normalizedSearchTerm = normalizeOsSearch(searchTerm);
  if (!normalizedSearchTerm) return [];

  const hits: OsGlobalSearchHit[] = [];
  const seen = new Set<string>();

  for (const p of pleitos) {
    if (!isVisibleOsFluxRow(p)) continue;
    if (!matchesOsGlobalSearch(p, normalizedSearchTerm)) continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);

    const tab = classifyOsPleitoTab(p);
    const osLabel = p.divSe ? `OS ${p.divSe}` : `Registro ${p.id.slice(0, 8)}`;
    const contractLabel = p.updatedContract
      ? p.updatedContract.number || p.updatedContract.name
      : 'Sem contrato';

    hits.push({
      id: p.id,
      tab,
      title: osLabel,
      subtitle: `${OS_TAB_LABELS[tab]} · ${contractLabel}`
    });
  }

  return hits.slice(0, 12);
}

export function getOsEtiquetaFromPleito(p: OsPleitoListItem): 'Aberta' | 'Concluída' {
  return isOsConcluida(p) ? 'Concluída' : 'Aberta';
}

export function getOsFaturamentoPct(p: OsPleitoListItem): number | null {
  const orc = parseBudgetToNumber(p.budget);
  if (orc <= 0) return null;
  const acc = Number(p.accumulatedBilled || 0);
  return (acc / orc) * 100;
}

export function formatOsId(divSe: string | null | undefined): string {
  const v = (divSe || '').trim();
  return v ? `OS ${v}` : '—';
}

export function formatDateBr(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function formatMoneyBr(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function formatBudgetCurrency(budget: string | null | undefined): string {
  const n = parseBudgetToNumber(budget ?? null);
  return n === 0 ? '—' : formatMoneyBr(n);
}

export function osEtiquetaBadgeClass(etiqueta: 'Aberta' | 'Concluída'): string {
  if (etiqueta === 'Concluída') {
    return 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100';
  }
  return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
}
