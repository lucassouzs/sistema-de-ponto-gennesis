import { CONTROLE_NFS_TABS } from './controleNfsTabs';
import type { ControleNfsCardsDateFilter, ControleNfsCardsFilterState } from './controleNfsTypes';

export function createDefaultControleNfsCardsFilter(): ControleNfsCardsFilterState {
  return {
    tabKeys: CONTROLE_NFS_TABS.map((tab) => tab.key),
    emissaoDateFrom: '',
    emissaoDateTo: '',
    recebimentoDateFrom: '',
    recebimentoDateTo: ''
  };
}

function hasPeriodFilter(from: string, to: string): boolean {
  return Boolean(from.trim()) || Boolean(to.trim());
}

export function hasActiveControleNfsCardsFilter(
  filter: ControleNfsCardsFilterState,
  allTabKeys: readonly string[] = CONTROLE_NFS_TABS.map((tab) => tab.key)
): boolean {
  const allTabsSelected =
    filter.tabKeys.length === allTabKeys.length &&
    allTabKeys.every((key) => filter.tabKeys.includes(key));

  const hasDateFilter =
    hasPeriodFilter(filter.emissaoDateFrom, filter.emissaoDateTo) ||
    hasPeriodFilter(filter.recebimentoDateFrom, filter.recebimentoDateTo);

  return !allTabsSelected || hasDateFilter;
}

export function buildControleNfsTotalsQueryParams(
  filter: ControleNfsCardsFilterState,
  refresh = false
): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (refresh) params.refresh = 1;

  const allTabKeys = CONTROLE_NFS_TABS.map((tab) => tab.key);
  const allTabsSelected =
    filter.tabKeys.length === allTabKeys.length &&
    allTabKeys.every((key) => filter.tabKeys.includes(key));

  if (!allTabsSelected && filter.tabKeys.length > 0) {
    params.tabKeys = filter.tabKeys.join(',');
  }

  if (filter.emissaoDateFrom.trim()) params.emissaoDateFrom = filter.emissaoDateFrom.trim();
  if (filter.emissaoDateTo.trim()) params.emissaoDateTo = filter.emissaoDateTo.trim();
  if (filter.recebimentoDateFrom.trim()) {
    params.recebimentoDateFrom = filter.recebimentoDateFrom.trim();
  }
  if (filter.recebimentoDateTo.trim()) params.recebimentoDateTo = filter.recebimentoDateTo.trim();

  return params;
}

export function cardsFilterToDateFilter(
  filter: ControleNfsCardsFilterState
): ControleNfsCardsDateFilter {
  return {
    emissaoDateFrom: filter.emissaoDateFrom.trim() || undefined,
    emissaoDateTo: filter.emissaoDateTo.trim() || undefined,
    recebimentoDateFrom: filter.recebimentoDateFrom.trim() || undefined,
    recebimentoDateTo: filter.recebimentoDateTo.trim() || undefined
  };
}

export function cardsFilterSummaryLabel(filter: ControleNfsCardsFilterState): string {
  const parts: string[] = [];
  const allTabKeys = CONTROLE_NFS_TABS.map((tab) => tab.key);
  const allTabsSelected =
    filter.tabKeys.length === allTabKeys.length &&
    allTabKeys.every((key) => filter.tabKeys.includes(key));

  if (allTabsSelected) {
    parts.push('Todos os contratos');
  } else if (filter.tabKeys.length === 0) {
    parts.push('Nenhum contrato');
  } else {
    parts.push(`${filter.tabKeys.length} contrato(s)`);
  }

  if (hasPeriodFilter(filter.emissaoDateFrom, filter.emissaoDateTo)) {
    parts.push(
      `Emissão: ${formatPeriodLabel(filter.emissaoDateFrom, filter.emissaoDateTo)}`
    );
  }
  if (hasPeriodFilter(filter.recebimentoDateFrom, filter.recebimentoDateTo)) {
    parts.push(
      `Recebimento: ${formatPeriodLabel(filter.recebimentoDateFrom, filter.recebimentoDateTo)}`
    );
  }

  return parts.join(' · ');
}

function formatPeriodLabel(from: string, to: string): string {
  const fromLabel = from ? formatDateLabel(from) : '...';
  const toLabel = to ? formatDateLabel(to) : '...';
  return `${fromLabel} a ${toLabel}`;
}

function formatDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}
