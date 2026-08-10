'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  EyeOff,
  Filter,
  Loader2,
  PiggyBank,
  RefreshCw,
  RotateCcw,
  Settings2,
  Wallet,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { exportGastosOperacionaisPdf } from '@/lib/exportGastosOperacionaisPdf';
import { exportControleGeralContratosPdf } from '@/lib/exportControleGeralContratosPdf';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Modal } from '@/components/ui/Modal';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  aggregateGastosDetailRows,
  aggregateGastosNaturezaForContract,
  getGastosNaturezaAggRowKey,
  groupGastosNaturezaModalRows,
  gastosNaturezaTotalContribution,
  deriveEmissaoMonthYearFromPeriod,
  EMPTY_GASTOS_OPERACIONAIS_FILTERS,
  filterGastosDetailRows,
  filterGastosDetailRowsByPolo,
  filterRowsByAllowedContracts,
  formatGastosPeriodFilterLabel,
  getGastosFilterOptions,
  getGastosPoloFilterOptions,
  getSingleCalendarMonthFromPeriod,
  getSingleYearFromPeriod,
  mergeCatalogContractsIntoGastosRows,
  type GastosOperacionaisPoloFilterOptions,
  groupGastosRowsByLocality,
  groupGastosRowsByPolo,
  type GastosOperacionaisFilters,
  type QueryGastosDetailRow,
  type QueryGastosNaturezaDetailRow,
  type GastosNaturezaAggRow
} from './buildQueryGastosRows';
import {
  GastosNaturezaSolicitacoesBreakdown,
  formatGastosNaturezaSolicitacaoDataLabel,
  resolveGastosNaturezaSolicitacaoTitulo,
  type GastosNaturezaSolicitacaoRow
} from './gastosNaturezaSolicitacoesBreakdown';
import {
  getAllCatalogContractKeys,
  getContractLocality,
  getLocalityLabel,
  GASTOS_OPERACIONAIS_CONTRACT_ORDER,
  inferContractLocalityFromHints,
  normalizeContractOrderKey,
  resolveVisibleLocalityItems
} from './gastosOperacionaisContractOrder';
import {
  findNewSpreadsheetContracts,
  loadKnownSpreadsheetContracts,
  markSpreadsheetContractsAsKnown,
  saveKnownSpreadsheetContracts
} from './controleGeralKnownSpreadsheetContracts';
import {
  applyContractLocalityOverride,
  contractMatchesLocalitiesWithOverrides,
  getEffectiveContractLocality,
  loadGastosLocalityOverridesWithCatalogSeed,
  saveGastosLocalityOverrides,
  SEM_LOCALIDADE_KEY,
  SEM_LOCALIDADE_LABEL,
  type EffectiveContractLocality,
  type GastosOperacionaisLocalityOverrideMap
} from './gastosOperacionaisLocalityOverrides';
import {
  loadGastosLocalitiesCatalog,
  type GastosLocalityItem
} from './gastosOperacionaisLocalitiesStore';
import { GastosLocalitiesManageModal } from './GastosLocalitiesManageModal';
import {
  addControleGeralExcludedContracts,
  clearControleGeralExcludedContracts,
  isContractExcludedFromControleGeralView,
  loadControleGeralExcludedContracts,
  removeControleGeralExcludedContract
} from './controleGeralExcludedContracts';
import {
  buildFaturamentoByContractLookup,
  resolveContractContaVinculada,
  resolveContractFaturamento,
  resolveContractLiquido,
  resolveContractNfsTotals,
  resolveContractRecebido,
  type FaturamentoByGastosContractEntry
} from './buildFaturamentoByContractLookup';
import {
  buildGastosContractDetailLookup,
  resolveGastosContractDetailPath,
  type ContractDetailLookupSource
} from './buildGastosContractDetailLookup';
import { ControleGeralFluxoDetalheModal } from './ControleGeralFluxoDetalheModal';
import { filterGastosDetailRowsForContract, filterRecebidoMensalForContract } from './controleGeralGastosFluxo';
import type { RecebidoMensalByGastosContractEntry } from './recebidoMensalTypes';
import {
  ControleGeralTetoOrcamentarioModal,
  type TetoOrcamentarioFormPrefill
} from './ControleGeralTetoOrcamentarioModal';
import { ControleGeralPrevisaoGastosMensalPanel } from './ControleGeralPrevisaoGastosMensalPanel';
import {
  buildTetoOrcamentarioLookup,
  resolveContractTetoOrcamentario,
  type ControleGeralTetoOrcamentarioEntry
} from './tetoOrcamentario';

export type GastosOperacionaisRow = {
  rowKey: string;
  contract: string;
  mesesApuracao: number;
  anoMin: number;
  anoMax: number;
  totalAcumulado: number;
  polo?: string | null;
  faturamentoAcumulado?: number;
  liquidoAcumulado?: number;
  recebidoAcumulado?: number;
  /** null = contrato sem coluna Conta Vinculada na planilha de NF's. */
  contaVinculadaAcumulado?: number | null;
  tetoOrcamentario?: number;
};

const MONTH_OPTIONS = [
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
  { value: 12, label: 'Dezembro' }
];

type ControleGeralGastosOperacionaisPanelProps = {
  detailRows: QueryGastosDetailRow[];
  /** Detalhe por natureza (TOTVS RM) para drill-down ao clicar na linha. */
  naturezaDetailRows?: QueryGastosNaturezaDetailRow[];
  isLoading: boolean;
  fetchedAt?: string;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  /** Quando definido, limita grupos às keys informadas (ainda respeitando o catálogo dinâmico). */
  visibleLocalities?: readonly string[];
  /** Exibe botão de exportação em PDF (módulo Gastos Operacionais). */
  showPdfExport?: boolean;
  /** Permite ocultar linhas da visualização (somente Controle Geral de Contratos). */
  enableRowExclusion?: boolean;
  /** Oculta a coluna de localidade na tabela. */
  hideLocalityColumn?: boolean;
  /** Exibe polo vindo da API (somente leitura) em vez de localidade editável. */
  readOnlyPoloColumn?: boolean;
  panelTitle?: string;
  panelDescription?: string;
  totalColumnLabel?: string;
  /** Exibe faturamento bruto (NF's) por contrato — somente Controle Geral de Contratos. */
  showFaturamentoColumn?: boolean;
  /** Exibe teto orçamentário mensal e formulário de cadastro — Controle Geral. */
  showTetoOrcamentarioColumn?: boolean;
  /** Incrementa para forçar atualização dos dados da planilha e das NF's. */
  dataRefreshNonce?: number;
  /** Permite abrir a página de detalhes do contrato cadastrado. */
  showContractDetails?: boolean;
  contractsForDetailLookup?: readonly ContractDetailLookupSource[];
  /** Oculta "Atualizado em" e botão "Atualizar planilha" no cabeçalho. */
  hideDataRefreshControls?: boolean;
  /** Filtros em linha (padrão histórico OS / contratos), sem caixa cinza. */
  inlineFilters?: boolean;
  /** @deprecated Exportação no cabeçalho usa estilo outline quando inlineFilters está ativo. */
  primaryExportButton?: boolean;
  /** Habilita modal de detalhes/gráficos ao clicar no contrato (Controle Geral). */
  enableContractFluxoModal?: boolean;
  /** Exibe o quadrante Previsão de Gastos Mensal (mesmos CC / filtros / ocultos). */
  showPrevisaoGastosMensal?: boolean;
  /**
   * Quando definido, restringe o painel a esses contratos (allowlist).
   * Usado no módulo de sócios para não expor os demais CCs.
   */
  allowedContracts?: readonly string[];
  /** Contratos adicionais sempre incluídos (ex.: MAPA no Controle Geral). */
  extraContracts?: readonly string[];
  /** Dados da seção "Controle geral" para incluir no PDF completo. */
  overviewForExport?: {
    contracts: Array<{
      name: string;
      number: string;
      costCenter?: { code?: string; name?: string } | null;
      faturamentoAcumulado: number;
      faturamentoAnual: number;
      faturamentoAnualAplica?: boolean;
      totalProducaoSemanal: number;
      valorOrcado: number;
      pendenteFaturamento: number;
    }>;
    filterYear?: number | null;
    searchTerm?: string;
  };
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatGastosNaturezaDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function gastosNaturezaModalValueClassName(value: number): string {
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-600 dark:text-gray-400';
}

function calcGastoFaturamentoPercent(gastos: number, faturamento: number): number | null {
  if (!Number.isFinite(faturamento) || faturamento <= 0) return null;
  return (Math.abs(gastos) / faturamento) * 100;
}

function formatGastoFaturamentoPercent(gastos: number, faturamento: number): string {
  const percent = calcGastoFaturamentoPercent(gastos, faturamento);
  if (percent == null) return '—';
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(percent)}%`;
}

function gastoFaturamentoPercentClassName(gastos: number, faturamento: number): string {
  const percent = calcGastoFaturamentoPercent(gastos, faturamento);
  if (percent == null) return 'text-gray-500 dark:text-gray-400';
  if (percent >= 70) return 'text-red-600 dark:text-red-400';
  return 'text-green-600 dark:text-green-400';
}

function calcGastoRecebidoPercent(gastos: number, recebido: number): number | null {
  if (!Number.isFinite(recebido) || recebido <= 0) return null;
  return (Math.abs(gastos) / recebido) * 100;
}

function formatGastoRecebidoPercent(gastos: number, recebido: number): string {
  const percent = calcGastoRecebidoPercent(gastos, recebido);
  if (percent == null) return '—';
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(percent)}%`;
}

function gastoRecebidoPercentClassName(gastos: number, recebido: number): string {
  const percent = calcGastoRecebidoPercent(gastos, recebido);
  if (percent == null) return 'text-gray-500 dark:text-gray-400';
  if (percent >= 85) return 'text-red-600 dark:text-red-400';
  return 'text-green-600 dark:text-green-400';
}

/** Vermelho se gasto > teto; laranja se ≥ 90%; roxo se < 90%. */
function tetoOrcamentarioClassName(gastos: number, teto: number): string {
  if (!Number.isFinite(teto) || teto <= 0) {
    return 'text-gray-500 dark:text-gray-400';
  }
  const gastoAbs = Math.abs(gastos);
  if (gastoAbs > teto) return 'text-red-600 dark:text-red-400';
  if (gastoAbs >= teto * 0.9) return 'text-orange-500 dark:text-orange-400';
  return 'text-violet-700 dark:text-violet-300';
}

/** Teto − |gasto|; null quando não há teto cadastrado. */
function calcTetoMinusGasto(teto: number, gastos: number): number | null {
  if (!Number.isFinite(teto) || teto <= 0) return null;
  return teto - Math.abs(gastos);
}

function formatTetoMinusGasto(teto: number, gastos: number): string {
  const value = calcTetoMinusGasto(teto, gastos);
  if (value == null) return '—';
  return formatCurrency(value);
}

function tetoMinusGastoClassName(teto: number, gastos: number): string {
  const value = calcTetoMinusGasto(teto, gastos);
  if (value == null) return 'text-gray-500 dark:text-gray-400';
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-600 dark:text-gray-300';
}

/** (|gasto| / teto) × 100; null sem teto cadastrado. */
function calcGastoSobreTetoPercent(teto: number, gastos: number): number | null {
  if (!Number.isFinite(teto) || teto <= 0) return null;
  return (Math.abs(gastos) / teto) * 100;
}

function formatGastoSobreTetoPercent(teto: number, gastos: number): string {
  const percent = calcGastoSobreTetoPercent(teto, gastos);
  if (percent == null) return '—';
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(percent)}%`;
}

/** Mesma lógica do teto: vermelho se gasto > teto; laranja ≥ 90%; roxo < 90%. */
function gastoSobreTetoPercentClassName(teto: number, gastos: number): string {
  if (calcGastoSobreTetoPercent(teto, gastos) == null) {
    return 'text-gray-500 dark:text-gray-400';
  }
  return tetoOrcamentarioClassName(gastos, teto);
}

function calcLucroLiquido(recebido: number, gastos: number): number {
  return recebido - Math.abs(gastos);
}

function HiddenContractsPanel({
  contracts,
  minimized,
  onToggleMinimized,
  onRestoreAll,
  onRestoreOne
}: {
  contracts: string[];
  minimized: boolean;
  onToggleMinimized: () => void;
  onRestoreAll: () => void;
  onRestoreOne: (contract: string) => void;
}) {
  if (contracts.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
      <div
        className={`flex flex-wrap items-center justify-between gap-2 ${minimized ? '' : 'mb-2'}`}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
          {contracts.length}{' '}
          {contracts.length === 1 ? 'contrato oculto' : 'contratos ocultos'}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={onToggleMinimized}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
            aria-expanded={!minimized}
          >
            {minimized ? (
              <>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                Expandir
              </>
            ) : (
              <>
                <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                Minimizar
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onRestoreAll}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/40"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Restaurar todos
          </button>
        </div>
      </div>
      {!minimized ? (
        <div className="flex flex-wrap gap-2">
          {contracts.map((contract) => (
            <button
              key={contract}
              type="button"
              onClick={() => onRestoreOne(contract)}
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
              title="Restaurar na visualização"
            >
              {contract}
              <RotateCcw className="h-3 w-3 shrink-0" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function lucroLiquidoClassName(value: number): string {
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-600 dark:text-gray-300';
}

type GastosPanelFinancialSummary = {
  faturamento: number;
  liquido: number;
  recebido: number;
  contaVinculada: number | null;
  gastos: number;
  tetoOrcamentario: number;
  lucroLiquido: number;
};

function summarizeGastosPanelRows(rows: readonly GastosOperacionaisRow[]): GastosPanelFinancialSummary {
  const faturamento = rows.reduce((sum, row) => sum + (row.faturamentoAcumulado ?? 0), 0);
  const liquido = rows.reduce((sum, row) => sum + (row.liquidoAcumulado ?? 0), 0);
  const recebido = rows.reduce((sum, row) => sum + (row.recebidoAcumulado ?? 0), 0);
  const gastos = Math.abs(rows.reduce((sum, row) => sum + row.totalAcumulado, 0));
  const tetoOrcamentario = rows.reduce((sum, row) => sum + (row.tetoOrcamentario ?? 0), 0);

  let contaVinculadaSum = 0;
  let hasContaVinculada = false;
  for (const row of rows) {
    if (row.contaVinculadaAcumulado == null) continue;
    hasContaVinculada = true;
    contaVinculadaSum += row.contaVinculadaAcumulado;
  }

  return {
    faturamento,
    liquido,
    recebido,
    contaVinculada: hasContaVinculada ? contaVinculadaSum : null,
    gastos,
    tetoOrcamentario,
    lucroLiquido: calcLucroLiquido(recebido, gastos)
  };
}

/** Evita quebra do sinal negativo em valores monetários longos (ex.: -R$ 1.554.904,49). */
const amountCurrencyCellClassName =
  'px-3 py-3 text-center tabular-nums whitespace-nowrap min-w-[9.25rem] font-medium';
const amountCurrencyTotalCellClassName =
  'px-3 py-2.5 text-center tabular-nums whitespace-nowrap min-w-[9.25rem] font-semibold';
const amountGrandTotalCellClassName =
  'px-3 py-3 text-center tabular-nums whitespace-nowrap min-w-[9.25rem] font-semibold';
const amountPercentCellClassName =
  'px-3 py-3 text-center tabular-nums whitespace-nowrap min-w-[4.75rem] font-medium';
const amountPercentTotalCellClassName =
  'px-3 py-2.5 text-center tabular-nums whitespace-nowrap min-w-[4.75rem] font-semibold';
const amountCurrencyThClassName =
  'px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap min-w-[9.25rem]';
const amountPercentThClassName =
  'px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap min-w-[4.75rem]';
const dataCenterThClassName =
  'px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap';
const dataCenterCellClassName =
  'px-3 py-3 text-center tabular-nums text-gray-600 dark:text-gray-300 whitespace-nowrap';
const contractThClassName =
  'px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400';
const contractCellClassName =
  'px-3 py-3 text-left font-medium text-gray-900 dark:text-gray-100';

function FinancialTotalsTableRow({
  title,
  contractCount,
  summary,
  showNfsMetrics,
  showTetoOrcamentario,
  tableLabelColSpan,
  variant = 'locality'
}: {
  title: string;
  contractCount: number;
  summary: GastosPanelFinancialSummary;
  showNfsMetrics: boolean;
  showTetoOrcamentario: boolean;
  tableLabelColSpan: number;
  variant?: 'locality' | 'grand';
}) {
  const isGrand = variant === 'grand';
  const rowClassName = isGrand
    ? 'border-t-2 border-amber-300 bg-amber-50/80 font-semibold dark:border-amber-700 dark:bg-amber-950/30'
    : 'border-t border-gray-200 bg-gray-50/90 font-semibold dark:border-gray-600 dark:bg-gray-800/70';
  const labelClassName = isGrand
    ? 'px-3 py-3 text-amber-900 dark:text-amber-200'
    : 'px-3 py-2.5 text-gray-700 dark:text-gray-300';
  const currencyCellClassName = isGrand ? amountGrandTotalCellClassName : amountCurrencyTotalCellClassName;
  const percentCellClassName = amountPercentTotalCellClassName;

  return (
    <tr className={rowClassName}>
      <td colSpan={tableLabelColSpan} className={labelClassName}>
        {title}
        <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
          ({contractCount} {contractCount === 1 ? 'contrato' : 'contratos'})
        </span>
      </td>
      {showNfsMetrics ? (
        <td className={`${currencyCellClassName} text-green-600 dark:text-green-400`}>
          {formatCurrency(summary.faturamento)}
        </td>
      ) : null}
      {showNfsMetrics ? (
        <td className={`${currencyCellClassName} text-blue-600 dark:text-blue-400`}>
          {formatCurrency(summary.liquido)}
        </td>
      ) : null}
      {showNfsMetrics ? (
        <td className={`${currencyCellClassName} text-sky-600 dark:text-sky-400`}>
          {formatCurrency(summary.recebido)}
        </td>
      ) : null}
      {showTetoOrcamentario ? (
        <td
          className={`${currencyCellClassName} ${tetoOrcamentarioClassName(
            summary.gastos,
            summary.tetoOrcamentario
          )}`}
        >
          {summary.tetoOrcamentario > 0 ? formatCurrency(summary.tetoOrcamentario) : '—'}
        </td>
      ) : null}
      <td className={`${currencyCellClassName} text-red-600 dark:text-red-400`}>
        {formatCurrency(summary.gastos)}
      </td>
      {showTetoOrcamentario ? (
        <td
          className={`${currencyCellClassName} ${tetoMinusGastoClassName(
            summary.tetoOrcamentario,
            summary.gastos
          )}`}
        >
          {formatTetoMinusGasto(summary.tetoOrcamentario, summary.gastos)}
        </td>
      ) : null}
      {showNfsMetrics ? (
        <td className={`${currencyCellClassName} ${lucroLiquidoClassName(summary.lucroLiquido)}`}>
          {formatCurrency(summary.lucroLiquido)}
        </td>
      ) : null}
      {showTetoOrcamentario ? (
        <td
          className={`${percentCellClassName} ${gastoSobreTetoPercentClassName(
            summary.tetoOrcamentario,
            summary.gastos
          )}`}
        >
          {formatGastoSobreTetoPercent(summary.tetoOrcamentario, summary.gastos)}
        </td>
      ) : null}
      {showNfsMetrics ? (
        <td
          className={`${percentCellClassName} ${gastoFaturamentoPercentClassName(
            summary.gastos,
            summary.faturamento
          )}`}
        >
          {formatGastoFaturamentoPercent(summary.gastos, summary.faturamento)}
        </td>
      ) : null}
      {showNfsMetrics ? (
        <td
          className={`${percentCellClassName} ${gastoRecebidoPercentClassName(
            summary.gastos,
            summary.recebido
          )}`}
        >
          {formatGastoRecebidoPercent(summary.gastos, summary.recebido)}
        </td>
      ) : null}
      {showNfsMetrics ? (
        <td className={`${currencyCellClassName} text-indigo-600 dark:text-indigo-400`}>
          {summary.contaVinculada == null ? '—' : formatCurrency(summary.contaVinculada)}
        </td>
      ) : null}
    </tr>
  );
}

function formatAnoApuracao(anoMin: number, anoMax: number) {
  if (!anoMin && !anoMax) return '—';
  if (anoMin === anoMax) return String(anoMin);
  return `${anoMin}–${anoMax}`;
}

const filterLabelClassName =
  'mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400';

const filterFieldLabelClassName =
  'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';

const localitySelectWrapperClassName = 'mx-auto flex w-full min-w-[9.5rem] max-w-[12rem] justify-center';

const localitySelectTriggerClassName =
  'flex w-full items-center justify-center gap-1.5 rounded-lg border-0 bg-transparent px-1.5 py-1 text-center text-sm font-medium text-gray-800 outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100 focus:ring-0 dark:text-gray-100 dark:hover:bg-gray-700/60 dark:focus:bg-gray-700/60';

const FILTER_DROPDOWN_LIST_MAX_HEIGHT = 320;

const rowCheckboxClassName =
  'h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-800 dark:focus:ring-amber-400';

function RowSelectCheckbox({
  checked,
  indeterminate = false,
  onChange,
  ariaLabel
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      className={rowCheckboxClassName}
    />
  );
}

// Referência estável para o valor padrão: evitar `= []` inline, que cria um novo array
// a cada render e faz memos/efeitos derivados dispararem re-render em loop.
const EMPTY_NATUREZA_DETAIL_ROWS: QueryGastosNaturezaDetailRow[] = [];

export function ControleGeralGastosOperacionaisPanel({
  detailRows,
  naturezaDetailRows = EMPTY_NATUREZA_DETAIL_ROWS,
  isLoading,
  fetchedAt,
  isError = false,
  errorMessage,
  onRetry,
  visibleLocalities,
  showPdfExport = false,
  enableRowExclusion = false,
  hideLocalityColumn = false,
  readOnlyPoloColumn = false,
  panelTitle = 'Gastos operacionais por contrato',
  panelDescription = 'QUERY BASE DE GASTOS — mês, ano, contrato e total (somatório por contrato)',
  totalColumnLabel = 'Total',
  showFaturamentoColumn = false,
  showTetoOrcamentarioColumn = false,
  dataRefreshNonce = 0,
  showContractDetails = false,
  contractsForDetailLookup = [],
  hideDataRefreshControls = false,
  inlineFilters = false,
  primaryExportButton = false,
  enableContractFluxoModal = false,
  showPrevisaoGastosMensal = false,
  allowedContracts,
  extraContracts,
  overviewForExport
}: ControleGeralGastosOperacionaisPanelProps) {
  const nfsMetricColumnCount = showFaturamentoColumn ? 4 : 0;
  const lucroLiquidoColumnCount = showFaturamentoColumn ? 1 : 0;
  const gastoRatioColumnCount = showFaturamentoColumn ? 2 : 0;
  /** Teto orçamentário + Saldo a gastar + GASTO / TETO (%). */
  const tetoOrcamentarioColumnCount = showTetoOrcamentarioColumn ? 3 : 0;
  const tableColumnCount =
    4 +
    nfsMetricColumnCount +
    lucroLiquidoColumnCount +
    gastoRatioColumnCount +
    tetoOrcamentarioColumnCount +
    (hideLocalityColumn ? 0 : 1) +
    (enableRowExclusion ? 1 : 0);
  const tableAmountColumnCount =
    1 +
    nfsMetricColumnCount +
    lucroLiquidoColumnCount +
    gastoRatioColumnCount +
    tetoOrcamentarioColumnCount;
  const tableLabelColSpan = tableColumnCount - tableAmountColumnCount;
  const [filters, setFilters] = useState<GastosOperacionaisFilters>(
    EMPTY_GASTOS_OPERACIONAIS_FILTERS
  );
  const [exportingPdf, setExportingPdf] = useState(false);
  const [localityOverrides, setLocalityOverrides] = useState<GastosOperacionaisLocalityOverrideMap>(
    () => loadGastosLocalityOverridesWithCatalogSeed()
  );
  const [localitiesCatalog, setLocalitiesCatalog] = useState<GastosLocalityItem[]>(() =>
    loadGastosLocalitiesCatalog()
  );
  const [localitiesModalOpen, setLocalitiesModalOpen] = useState(false);

  const refreshLocalitiesCatalog = useCallback(() => {
    const nextCatalog = loadGastosLocalitiesCatalog();
    setLocalitiesCatalog(nextCatalog);
    setLocalityOverrides(loadGastosLocalityOverridesWithCatalogSeed());
    setFilters((prev) => {
      const validKeys = new Set([
        ...nextCatalog.map((item) => item.key),
        SEM_LOCALIDADE_KEY
      ]);
      const localities = prev.localities.filter((key) => validKeys.has(key));
      if (localities.length === prev.localities.length) return prev;
      return { ...prev, localities };
    });
  }, []);

  useEffect(() => {
    setLocalitiesCatalog(loadGastosLocalitiesCatalog());
  }, []);
  const inferredLocalityOverrides = useMemo(() => {
    const merged: GastosOperacionaisLocalityOverrideMap = { ...localityOverrides };
    const sources = [
      ...contractsForDetailLookup.map((contract) => ({
        name: contract.name,
        costCenter: contract.costCenter
      })),
      ...detailRows.map((row) => ({ name: row.contract, costCenter: null }))
    ];

    for (const source of sources) {
      const name = source.name?.trim();
      if (!name) continue;
      const key = normalizeContractOrderKey(name);
      if (Object.prototype.hasOwnProperty.call(merged, key)) continue;
      if (getContractLocality(name)) continue;
      const inferred = inferContractLocalityFromHints(name, source.costCenter ?? undefined);
      if (inferred) merged[key] = inferred;
    }
    return merged;
  }, [contractsForDetailLookup, detailRows, localityOverrides]);
  const [excludedContracts, setExcludedContracts] = useState<Set<string>>(() =>
    enableRowExclusion ? loadControleGeralExcludedContracts() : new Set()
  );

  const allSpreadsheetContracts = useMemo(
    () => Array.from(new Set(detailRows.map((row) => row.contract.trim()).filter(Boolean))),
    [detailRows]
  );

  const catalogContractKeys = useMemo(() => getAllCatalogContractKeys(), []);

  useEffect(() => {
    if (!enableRowExclusion || allSpreadsheetContracts.length === 0) return;

    const known = loadKnownSpreadsheetContracts();
    const newcomers = findNewSpreadsheetContracts(allSpreadsheetContracts, known).filter(
      (contract) => !catalogContractKeys.has(normalizeContractOrderKey(contract))
    );

    if (newcomers.length > 0) {
      const nextKnown = markSpreadsheetContractsAsKnown(allSpreadsheetContracts, known);
      saveKnownSpreadsheetContracts(nextKnown);
      setExcludedContracts((prev) => addControleGeralExcludedContracts(newcomers, prev));
    }
  }, [allSpreadsheetContracts, catalogContractKeys, enableRowExclusion]);

  useEffect(() => {
    if (!enableRowExclusion || allSpreadsheetContracts.length === 0) return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('controle-geral-pb-hidden-seeded-v1')) return;

    const pbKeys = new Set(
      ['JP - ADM LOCAL', 'SEECT PB GENNESIS - ITEM 1', 'SEECT PB GENNESIS - ITEM 3'].map((name) =>
        normalizeContractOrderKey(name)
      )
    );
    const toHide = allSpreadsheetContracts.filter((contract) =>
      pbKeys.has(normalizeContractOrderKey(contract))
    );

    if (toHide.length > 0) {
      setExcludedContracts((prev) => addControleGeralExcludedContracts(toHide, prev));
    }
    window.localStorage.setItem('controle-geral-pb-hidden-seeded-v1', '1');
  }, [allSpreadsheetContracts, enableRowExclusion]);

  // Restaura contratos recém-incluídos no catálogo que tinham sido auto-ocultados.
  useEffect(() => {
    if (!enableRowExclusion) return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('controle-geral-mapa-jequie-restored-v1')) return;

    setExcludedContracts((prev) =>
      removeControleGeralExcludedContract('MAPA - UMIPI DE JEQUIE', prev)
    );
    window.localStorage.setItem('controle-geral-mapa-jequie-restored-v1', '1');
  }, [enableRowExclusion]);

  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [hiddenContractsListMinimized, setHiddenContractsListMinimized] = useState(false);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [tetoModalOpen, setTetoModalOpen] = useState(false);
  const [tetoModalPrefill, setTetoModalPrefill] = useState<TetoOrcamentarioFormPrefill | null>(null);
  const [naturezaModalContract, setNaturezaModalContract] = useState<GastosOperacionaisRow | null>(
    null
  );
  const [collapsedNaturezaSections, setCollapsedNaturezaSections] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedNaturezaBreakdownKey, setExpandedNaturezaBreakdownKey] = useState<string | null>(
    null
  );
  const [selectedNaturezaSolicitacao, setSelectedNaturezaSolicitacao] =
    useState<GastosNaturezaSolicitacaoRow | null>(null);
  const lastInitializedNaturezaContractRef = useRef<string | null>(null);
  const [fluxoModalContract, setFluxoModalContract] = useState<string | null>(null);

  const toggleNaturezaBreakdown = useCallback((rowKey: string) => {
    setExpandedNaturezaBreakdownKey((prev) => (prev === rowKey ? null : rowKey));
  }, []);

  const toggleNaturezaSection = useCallback((sectionKey: string) => {
    setCollapsedNaturezaSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  }, []);

  const areDfcBranchLeafGroupsVisible = useCallback(
    (rootKey: string, branchKey: string) => {
      if (collapsedNaturezaSections.has(`dfc:root:${rootKey}`)) return false;
      if (collapsedNaturezaSections.has(`dfc:branch:${rootKey}:${branchKey}`)) return false;
      return true;
    },
    [collapsedNaturezaSections]
  );

  const areDfcLeafRowsVisible = useCallback(
    (rootKey: string, branchKey: string, leafBlockId: string) => {
      if (!areDfcBranchLeafGroupsVisible(rootKey, branchKey)) return false;
      if (collapsedNaturezaSections.has(`dfc:leaf:${leafBlockId}`)) return false;
      return true;
    },
    [areDfcBranchLeafGroupsVisible, collapsedNaturezaSections]
  );

  const emissaoFilter = useMemo(
    () => deriveEmissaoMonthYearFromPeriod(filters.periodFrom, filters.periodTo),
    [filters.periodFrom, filters.periodTo]
  );
  const emissaoFilterMonths = emissaoFilter.months;
  const emissaoFilterYears = emissaoFilter.years;

  const {
    data: faturamentoQueryData,
    isFetching: fetchingFaturamento,
    isLoading: loadingFaturamento
  } = useQuery({
    enabled: showFaturamentoColumn,
    queryKey: [
      'controle-geral-faturamento-by-contract-v26-mapa-umipi',
      emissaoFilterMonths,
      emissaoFilterYears,
      dataRefreshNonce
    ],
    queryFn: async () => {
      const params: Record<string, string | number> = { refresh: 1 };
      if (emissaoFilterMonths.length > 0) {
        params.months = emissaoFilterMonths.join(',');
      }
      if (emissaoFilterYears.length > 0) {
        params.years = emissaoFilterYears.join(',');
      }

      const res = await api.get<{
        success: boolean;
        data?: {
          entries?: FaturamentoByGastosContractEntry[];
          recebidoMensalEntries?: RecebidoMensalByGastosContractEntry[];
        };
      }>('/controle-nfs/summary/faturamento-by-gastos-contract', {
        params,
        timeout: 120_000
      });

      return {
        entries: res.data?.data?.entries ?? [],
        recebidoMensal: res.data?.data?.recebidoMensalEntries ?? []
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    placeholderData: (previousData) => previousData
  });

  const { data: tetoOrcamentarioEntries = [] } = useQuery({
    enabled: showTetoOrcamentarioColumn,
    queryKey: ['controle-geral-teto-orcamentario', dataRefreshNonce],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data?: ControleGeralTetoOrcamentarioEntry[];
      }>('/controle-geral/teto-orcamentario');
      return (res.data?.data ?? []) as ControleGeralTetoOrcamentarioEntry[];
    },
    staleTime: 60_000
  });

  const tetoOrcamentarioLookup = useMemo(
    () => buildTetoOrcamentarioLookup(tetoOrcamentarioEntries),
    [tetoOrcamentarioEntries]
  );

  const faturamentoByContract = faturamentoQueryData?.entries ?? [];
  const recebidoMensalByContract = faturamentoQueryData?.recebidoMensal ?? [];

  const isPanelLoading = isLoading;

  const visibleLocalityItems = useMemo(
    () => resolveVisibleLocalityItems(visibleLocalities, localitiesCatalog),
    [visibleLocalities, localitiesCatalog]
  );

  const scopedDetailRows = useMemo(
    () => filterRowsByAllowedContracts(detailRows, allowedContracts),
    [detailRows, allowedContracts]
  );

  const scopedNaturezaDetailRows = useMemo(
    () => filterRowsByAllowedContracts(naturezaDetailRows, allowedContracts),
    [naturezaDetailRows, allowedContracts]
  );

  const enableNaturezaBreakdown = scopedNaturezaDetailRows.length > 0;

  const filterOptions = useMemo(
    () =>
      readOnlyPoloColumn
        ? getGastosPoloFilterOptions(scopedDetailRows, { polos: filters.polos })
        : getGastosFilterOptions(
            scopedDetailRows,
            { localities: filters.localities },
            inferredLocalityOverrides,
            visibleLocalities
          ),
    [
      scopedDetailRows,
      filters.localities,
      filters.polos,
      inferredLocalityOverrides,
      readOnlyPoloColumn,
      visibleLocalities
    ]
  );

  const localityFilterOptions = useMemo(
    () => [
      ...visibleLocalityItems.map((locality) => ({
        value: locality.key,
        label: locality.label
      })),
      { value: SEM_LOCALIDADE_KEY, label: SEM_LOCALIDADE_LABEL }
    ],
    [visibleLocalityItems]
  );

  const localityTableSelectOptions = useMemo(
    () => labeledToSelectOptions(localityFilterOptions),
    [localityFilterOptions]
  );

  const poloFilterOptions = useMemo(
    () =>
      (readOnlyPoloColumn
        ? (filterOptions as GastosOperacionaisPoloFilterOptions).polos
        : []
      ).map((polo) => ({
        value: polo,
        label: polo === '—' ? 'Sem polo' : polo
      })),
    [filterOptions, readOnlyPoloColumn]
  );

  const contractFilterOptions = useMemo(() => {
    const source =
      allowedContracts?.length
        ? Array.from(
            new Set([
              ...allowedContracts.map((name) => name.trim()).filter(Boolean),
              ...filterOptions.contracts
            ])
          ).sort((a, b) => a.localeCompare(b, 'pt-BR'))
        : filterOptions.contracts;
    return source.map((contract) => ({
      value: contract,
      label: contract,
      searchText: contract
    }));
  }, [allowedContracts, filterOptions.contracts]);

  const hasActiveFilters =
    (readOnlyPoloColumn ? filters.polos.length > 0 : filters.localities.length > 0) ||
    Boolean(filters.periodFrom || filters.periodTo) ||
    filters.contracts.length > 0;

  const contractLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of detailRows) {
      const name = row.contract?.trim();
      if (!name) continue;
      map.set(normalizeContractOrderKey(name), name);
    }
    for (const name of GASTOS_OPERACIONAIS_CONTRACT_ORDER) {
      map.set(normalizeContractOrderKey(name), name);
    }
    for (const entry of faturamentoByContract) {
      map.set(normalizeContractOrderKey(entry.contract), entry.contract);
    }
    for (const contract of contractsForDetailLookup) {
      const name = contract.name?.trim();
      if (!name) continue;
      map.set(normalizeContractOrderKey(name), name);
      const costCenterName = contract.costCenter?.name?.trim();
      if (costCenterName) {
        map.set(normalizeContractOrderKey(costCenterName), name);
      }
      const costCenterCode = contract.costCenter?.code?.trim();
      if (costCenterCode) {
        map.set(normalizeContractOrderKey(costCenterCode), name);
      }
    }
    return map;
  }, [detailRows, faturamentoByContract, contractsForDetailLookup]);

  const displayRows = useMemo(() => {
    const filtered = readOnlyPoloColumn
      ? filterGastosDetailRowsByPolo(scopedDetailRows, filters)
      : filterGastosDetailRows(
          scopedDetailRows,
          filters,
          inferredLocalityOverrides,
          visibleLocalities,
          allowedContracts?.length ? undefined : extraContracts
        );
    const aggregated = aggregateGastosDetailRows(filtered);
    return mergeCatalogContractsIntoGastosRows(aggregated, visibleLocalities, {
      databaseContracts: contractsForDetailLookup,
      spreadsheetContracts: allSpreadsheetContracts,
      excludedContractKeys: enableRowExclusion ? Array.from(excludedContracts) : [],
      resolveExcludedLabel: (key) =>
        contractLabelByKey.get(key) ?? contractLabelByKey.get(normalizeContractOrderKey(key)) ?? key,
      localityOverrides: inferredLocalityOverrides,
      localitiesCatalog,
      allowedContracts,
      extraContracts: allowedContracts?.length ? undefined : extraContracts
    });
  }, [
    scopedDetailRows,
    filters,
    inferredLocalityOverrides,
    readOnlyPoloColumn,
    visibleLocalities,
    contractsForDetailLookup,
    allSpreadsheetContracts,
    enableRowExclusion,
    excludedContracts,
    contractLabelByKey,
    localitiesCatalog,
    allowedContracts,
    extraContracts
  ]);

  const visibleRows = useMemo(() => {
    if (!enableRowExclusion) return displayRows;
    return displayRows.filter(
      (row) => !isContractExcludedFromControleGeralView(row.contract, excludedContracts)
    );
  }, [displayRows, excludedContracts, enableRowExclusion]);

  const faturamentoLookup = useMemo(
    () => buildFaturamentoByContractLookup(faturamentoByContract),
    [faturamentoByContract]
  );

  const contractDetailLookup = useMemo(
    () => buildGastosContractDetailLookup(contractsForDetailLookup),
    [contractsForDetailLookup]
  );

  const resolveContractDetailPath = useCallback(
    (contract: string) => {
      if (!showContractDetails) return null;
      return resolveGastosContractDetailPath(contract, contractDetailLookup, contractsForDetailLookup);
    },
    [showContractDetails, contractDetailLookup, contractsForDetailLookup]
  );

  const visibleRowsWithFaturamento = useMemo(
    () =>
      visibleRows.map((row) => ({
        ...row,
        faturamentoAcumulado: showFaturamentoColumn
          ? resolveContractFaturamento(row.contract, faturamentoLookup)
          : undefined,
        liquidoAcumulado: showFaturamentoColumn
          ? resolveContractLiquido(row.contract, faturamentoLookup)
          : undefined,
        recebidoAcumulado: showFaturamentoColumn
          ? resolveContractRecebido(row.contract, faturamentoLookup)
          : undefined,
        contaVinculadaAcumulado: showFaturamentoColumn
          ? resolveContractContaVinculada(row.contract, faturamentoLookup)
          : undefined,
        tetoOrcamentario: showTetoOrcamentarioColumn
          ? resolveContractTetoOrcamentario(
              row.contract,
              tetoOrcamentarioLookup,
              filters.periodFrom,
              filters.periodTo
            )
          : undefined
      })),
    [
      visibleRows,
      faturamentoLookup,
      showFaturamentoColumn,
      showTetoOrcamentarioColumn,
      tetoOrcamentarioLookup,
      filters.periodFrom,
      filters.periodTo
    ]
  );

  const tetoContractOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of visibleRows) {
      if (row.contract.trim()) names.add(row.contract.trim());
    }
    for (const entry of tetoOrcamentarioEntries) {
      if (entry.contractName.trim()) names.add(entry.contractName.trim());
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [visibleRows, tetoOrcamentarioEntries]);

  const fluxoModalGastosRows = useMemo(() => {
    if (!fluxoModalContract) return [];
    const filtered = readOnlyPoloColumn
      ? filterGastosDetailRowsByPolo(scopedDetailRows, filters)
      : filterGastosDetailRows(
          scopedDetailRows,
          filters,
          inferredLocalityOverrides,
          visibleLocalities,
          allowedContracts?.length ? undefined : extraContracts
        );
    return filterGastosDetailRowsForContract(filtered, fluxoModalContract);
  }, [
    scopedDetailRows,
    filters,
    fluxoModalContract,
    inferredLocalityOverrides,
    readOnlyPoloColumn,
    visibleLocalities,
    allowedContracts,
    extraContracts
  ]);

  const fluxoModalNfsTotals = useMemo(() => {
    if (!fluxoModalContract) return undefined;
    return resolveContractNfsTotals(fluxoModalContract, faturamentoLookup);
  }, [fluxoModalContract, faturamentoLookup]);

  const fluxoModalRecebidoMensal = useMemo(() => {
    if (!fluxoModalContract) return [];
    return filterRecebidoMensalForContract(recebidoMensalByContract, fluxoModalContract);
  }, [recebidoMensalByContract, fluxoModalContract]);

  const excludedContractLabels = useMemo(() => {
    if (!enableRowExclusion || excludedContracts.size === 0) return [];
    return Array.from(excludedContracts)
      .map(
        (key) =>
          contractLabelByKey.get(key) ??
          contractLabelByKey.get(normalizeContractOrderKey(key)) ??
          key
      )
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [contractLabelByKey, excludedContracts, enableRowExclusion]);

  const localityGroups = useMemo(() => {
    if (readOnlyPoloColumn) {
      return groupGastosRowsByPolo(visibleRowsWithFaturamento).map((group) => ({
        localityKey: group.poloKey,
        localityLabel: group.poloLabel,
        rows: group.rows,
        subtotal: group.subtotal
      }));
    }
    return groupGastosRowsByLocality(
      visibleRowsWithFaturamento,
      inferredLocalityOverrides,
      visibleLocalities,
      localitiesCatalog
    );
  }, [
    visibleRowsWithFaturamento,
    inferredLocalityOverrides,
    readOnlyPoloColumn,
    visibleLocalities,
    localitiesCatalog
  ]);

  const grandSummary = useMemo(
    () => summarizeGastosPanelRows(visibleRowsWithFaturamento),
    [visibleRowsWithFaturamento]
  );

  const naturezaModalRows = useMemo(() => {
    if (!naturezaModalContract) return [];
    return aggregateGastosNaturezaForContract(
      scopedNaturezaDetailRows,
      naturezaModalContract.contract,
      filters.periodFrom,
      filters.periodTo
    );
  }, [
    scopedNaturezaDetailRows,
    naturezaModalContract,
    filters.periodFrom,
    filters.periodTo
  ]);

  const naturezaModalTotal = useMemo(
    () => naturezaModalRows.reduce((sum, row) => sum + row.total, 0),
    [naturezaModalRows]
  );

  const naturezaModalGrouped = useMemo(
    () => groupGastosNaturezaModalRows(naturezaModalRows),
    [naturezaModalRows]
  );

  const allNaturezaSectionKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const tree of naturezaModalGrouped.dfcTrees) {
      keys.add(`dfc:root:${tree.rootKey}`);
      for (const branch of tree.branches) {
        keys.add(`dfc:branch:${tree.rootKey}:${branch.branchKey}`);
        for (const group of branch.leafGroups) {
          keys.add(`dfc:leaf:${group.leafBlockId}`);
        }
      }
    }
    if (naturezaModalGrouped.ungrouped.length > 0) {
      keys.add('dfc:ungrouped');
    }
    return keys;
  }, [naturezaModalGrouped]);

  useEffect(() => {
    if (!naturezaModalContract) {
      lastInitializedNaturezaContractRef.current = null;
      // Idempotente: só troca o estado se realmente houver algo a limpar. Sem isso,
      // criar um `new Set()` a cada execução dispara re-render em loop.
      setCollapsedNaturezaSections((prev) => (prev.size === 0 ? prev : new Set()));
      setExpandedNaturezaBreakdownKey((prev) => (prev === null ? prev : null));
      setSelectedNaturezaSolicitacao((prev) => (prev === null ? prev : null));
      return;
    }
    if (allNaturezaSectionKeys.size === 0) return;
    const contractKey = naturezaModalContract.contract;
    if (lastInitializedNaturezaContractRef.current === contractKey) return;
    lastInitializedNaturezaContractRef.current = contractKey;
    setCollapsedNaturezaSections(new Set(allNaturezaSectionKeys));
    setExpandedNaturezaBreakdownKey(null);
    setSelectedNaturezaSolicitacao(null);
  }, [naturezaModalContract, allNaturezaSectionKeys]);

  const renderNaturezaModalRow = useCallback(
    (row: GastosNaturezaAggRow, paddingLeft: number) => {
      const rowKey = getGastosNaturezaAggRowKey(row);
      const isExpanded = expandedNaturezaBreakdownKey === rowKey;

      return (
        <React.Fragment key={rowKey}>
          <tr className="hover:bg-gray-50/80 dark:hover:bg-gray-800/30">
            <td
              className="px-4 py-2 text-sm text-gray-800 dark:text-gray-200"
              style={{ paddingLeft }}
            >
              <button
                type="button"
                onClick={() => toggleNaturezaBreakdown(rowKey)}
                className="inline-flex w-full items-center gap-1.5 text-left hover:opacity-80"
                aria-expanded={isExpanded}
              >
                {isExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                )}
                <span>{row.natureza}</span>
              </button>
            </td>
            <td
              className={`px-4 py-2 text-right text-sm tabular-nums font-medium whitespace-nowrap ${gastosNaturezaModalValueClassName(row.total)}`}
            >
              {formatCurrency(row.total)}
            </td>
          </tr>
          {isExpanded && naturezaModalContract ? (
            <GastosNaturezaSolicitacoesBreakdown
              row={row}
              contract={naturezaModalContract.contract}
              periodFrom={filters.periodFrom}
              periodTo={filters.periodTo}
              paddingLeft={paddingLeft}
              valueClassName={gastosNaturezaModalValueClassName(row.total)}
              formatCurrency={formatCurrency}
              formatDate={formatGastosNaturezaDate}
              onOpenSolicitacao={setSelectedNaturezaSolicitacao}
            />
          ) : null}
        </React.Fragment>
      );
    },
    [
      expandedNaturezaBreakdownKey,
      naturezaModalContract,
      filters.periodFrom,
      filters.periodTo,
      toggleNaturezaBreakdown
    ]
  );

  const totalGastos = grandSummary.gastos;

  const selectedRows = useMemo(
    () => visibleRowsWithFaturamento.filter((row) => selectedRowKeys.has(row.rowKey)),
    [visibleRowsWithFaturamento, selectedRowKeys]
  );

  const allVisibleSelected =
    visibleRowsWithFaturamento.length > 0 &&
    visibleRowsWithFaturamento.every((row) => selectedRowKeys.has(row.rowKey));
  const someVisibleSelected = visibleRowsWithFaturamento.some((row) =>
    selectedRowKeys.has(row.rowKey)
  );

  useEffect(() => {
    setSelectedRowKeys((prev) => {
      const visibleKeys = new Set(visibleRowsWithFaturamento.map((row) => row.rowKey));
      const next = new Set(Array.from(prev).filter((key) => visibleKeys.has(key)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleRowsWithFaturamento]);

  const clearFilters = () => {
    setFilters(EMPTY_GASTOS_OPERACIONAIS_FILTERS);
  };

  const toggleRowSelection = (rowKey: string) => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const row of visibleRowsWithFaturamento) next.delete(row.rowKey);
      } else {
        for (const row of visibleRowsWithFaturamento) next.add(row.rowKey);
      }
      return next;
    });
  };

  const clearRowSelection = () => {
    setSelectedRowKeys(new Set());
  };

  const handleExcludeSelected = () => {
    if (!selectedRows.length) return;

    const contracts = selectedRows.map((row) => row.contract);
    setExcludedContracts((prev) => addControleGeralExcludedContracts(contracts, prev));
    setSelectedRowKeys(new Set());

    toast.success(
      contracts.length === 1
        ? `"${contracts[0]}" ocultado da visualização.`
        : `${contracts.length} contratos ocultados da visualização.`
    );
  };

  const handleRestoreExcluded = (contract: string) => {
    setExcludedContracts((prev) => removeControleGeralExcludedContract(contract, prev));
    toast.success(`"${contract}" restaurado na visualização.`);
  };

  const handleRestoreAllExcluded = () => {
    setExcludedContracts(clearControleGeralExcludedContracts());
    toast.success('Contratos ocultos restaurados.');
  };

  const handleLocalitiesChange = (selected: string[]) => {
    const localities = selected;
    setFilters((prev) => ({
      ...prev,
      localities,
      contracts:
        localities.length > 0
          ? prev.contracts.filter((contract) =>
              contractMatchesLocalitiesWithOverrides(contract, localities, localityOverrides)
            )
          : prev.contracts
    }));
  };

  const handlePolosChange = (selected: string[]) => {
    const polos = selected;
    const poloByContract = new Map<string, string>();
    for (const row of detailRows) {
      if (!poloByContract.has(row.contract)) {
        poloByContract.set(row.contract, (row.polo ?? '').trim() || '—');
      }
    }
    setFilters((prev) => ({
      ...prev,
      polos,
      contracts:
        polos.length > 0
          ? prev.contracts.filter((contract) => polos.includes(poloByContract.get(contract) ?? '—'))
          : prev.contracts
    }));
  };

  const handleContractLocalityChange = (contract: string, value: string) => {
    const locality = (value || 'OUTROS') as EffectiveContractLocality;
    setLocalityOverrides((prev) => {
      const next = applyContractLocalityOverride(contract, locality, prev);
      saveGastosLocalityOverrides(next);
      return next;
    });
  };

  const handlePeriodFromChange = (value: string) => {
    setFilters((prev) => {
      const periodFrom = value;
      let periodTo = prev.periodTo;
      if (periodFrom && periodTo && periodFrom > periodTo) {
        periodTo = periodFrom;
      }
      return { ...prev, periodFrom, periodTo };
    });
  };

  const handlePeriodToChange = (value: string) => {
    setFilters((prev) => {
      let periodFrom = prev.periodFrom;
      const periodTo = value;
      if (periodFrom && periodTo && periodFrom > periodTo) {
        periodFrom = periodTo;
      }
      return { ...prev, periodFrom, periodTo };
    });
  };

  const gastosFiltersFields = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <span className={filterLabelClassName}>Contrato</span>
        <MultiSelectSearchDropdown
          options={contractFilterOptions}
          selected={filters.contracts}
          onChange={(contracts) => setFilters((prev) => ({ ...prev, contracts }))}
          placeholder="Todos os contratos"
          searchPlaceholder="Pesquisar contrato..."
          emptyOptionsMessage="Nenhum contrato disponível."
          emptySearchMessage="Nenhum contrato encontrado."
          listMaxHeight={FILTER_DROPDOWN_LIST_MAX_HEIGHT}
          menuOverlapContent
          noFocusRing
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className={`${filterLabelClassName} !mb-0`}>
            {readOnlyPoloColumn ? 'Polo' : 'Localidade'}
          </span>
          {!readOnlyPoloColumn ? (
            <button
              type="button"
              onClick={() => setLocalitiesModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
              title="Gerenciar localidades"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Gerenciar
            </button>
          ) : null}
        </div>
        <MultiSelectSearchDropdown
          options={readOnlyPoloColumn ? poloFilterOptions : localityFilterOptions}
          selected={readOnlyPoloColumn ? filters.polos : filters.localities}
          onChange={readOnlyPoloColumn ? handlePolosChange : handleLocalitiesChange}
          placeholder={readOnlyPoloColumn ? 'Todos os polos' : 'Todas as localidades'}
          searchPlaceholder={
            readOnlyPoloColumn ? 'Pesquisar polo...' : 'Pesquisar localidade...'
          }
          emptyOptionsMessage={
            readOnlyPoloColumn ? 'Nenhum polo disponível.' : 'Nenhuma localidade disponível.'
          }
          emptySearchMessage={
            readOnlyPoloColumn ? 'Nenhum polo encontrado.' : 'Nenhuma localidade encontrada.'
          }
          listMaxHeight={FILTER_DROPDOWN_LIST_MAX_HEIGHT}
          menuOverlapContent
          noFocusRing
        />
      </div>

      <div>
        <label className={filterFieldLabelClassName}>Data inicial</label>
        <DatePickerField
          value={filters.periodFrom}
          onChange={handlePeriodFromChange}
          placeholder="dd/mm/aaaa"
          noFocusRing
          aria-label="Data inicial"
        />
      </div>

      <div>
        <label className={filterFieldLabelClassName}>Data final</label>
        <DatePickerField
          value={filters.periodTo}
          onChange={handlePeriodToChange}
          placeholder="dd/mm/aaaa"
          noFocusRing
          aria-label="Data final"
        />
      </div>
    </div>
  );

  const buildMesesLabel = useCallback(
    (row: GastosOperacionaisRow) => {
      const singleMonth = getSingleCalendarMonthFromPeriod(filters.periodFrom, filters.periodTo);
      if (singleMonth) {
        return (
          MONTH_OPTIONS.find((month) => month.value === singleMonth.month)?.label ??
          String(singleMonth.month)
        );
      }
      return `${row.mesesApuracao} ${row.mesesApuracao === 1 ? 'mês' : 'meses'}`;
    },
    [filters.periodFrom, filters.periodTo]
  );

  const buildAnoLabel = useCallback(
    (row: GastosOperacionaisRow) => {
      const singleYear = getSingleYearFromPeriod(filters.periodFrom, filters.periodTo);
      if (singleYear != null) {
        return String(singleYear);
      }
      return formatAnoApuracao(row.anoMin, row.anoMax);
    },
    [filters.periodFrom, filters.periodTo]
  );

  const buildPdfFilterLines = useCallback((): string[] => {
    const lines: string[] = [];

    if (readOnlyPoloColumn) {
      if (filters.polos.length) {
        lines.push(`Polos: ${filters.polos.join(', ')}`);
      }
    } else if (filters.localities.length) {
      lines.push(
        `Localidades: ${filters.localities
          .map((key) => getLocalityLabel(key, localitiesCatalog))
          .join(', ')}`
      );
    }
    const periodLabel = formatGastosPeriodFilterLabel(filters.periodFrom, filters.periodTo);
    if (periodLabel) {
      lines.push(`Período: ${periodLabel}`);
    }
    if (filters.contracts.length) {
      lines.push(`Contratos: ${filters.contracts.join(', ')}`);
    }
    if (hasActiveFilters) {
      lines.push(`Total filtrado: ${formatCurrency(totalGastos)}`);
    }

    return lines;
  }, [filters, hasActiveFilters, totalGastos, readOnlyPoloColumn]);

  const canExportPdf =
    visibleRows.length > 0 || (overviewForExport?.contracts.length ?? 0) > 0;

  const handleExportPdf = useCallback(async () => {
    const hasGastosData = visibleRows.length > 0;
    const hasOverviewData = (overviewForExport?.contracts.length ?? 0) > 0;

    if (!hasGastosData && !hasOverviewData) {
      toast.error('Nenhum dado para exportar com os filtros atuais.');
      return;
    }

    setExportingPdf(true);
    try {
      const sheetUpdatedAt = fetchedAt
        ? new Date(fetchedAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : undefined;

      const buildOverviewSection = () => {
        if (!overviewForExport?.contracts.length) return undefined;

        const rows = overviewForExport.contracts.map((contract) => ({
          name: contract.name,
          number: contract.number,
          costCenter: contract.costCenter?.name || contract.costCenter?.code || '—',
          faturamentoAcumulado: contract.faturamentoAcumulado,
          faturamentoAnual:
            contract.faturamentoAnualAplica === false ? null : contract.faturamentoAnual,
          totalProducaoSemanal: contract.totalProducaoSemanal,
          valorOrcado: contract.valorOrcado,
          pendenteFaturamento: contract.pendenteFaturamento
        }));

        const totals = rows.reduce(
          (acc, row) => ({
            faturamentoAcumulado: acc.faturamentoAcumulado + row.faturamentoAcumulado,
            faturamentoAnual:
              row.faturamentoAnual == null
                ? acc.faturamentoAnual
                : acc.faturamentoAnual + row.faturamentoAnual,
            totalProducaoSemanal: acc.totalProducaoSemanal + row.totalProducaoSemanal,
            valorOrcado: acc.valorOrcado + row.valorOrcado,
            pendenteFaturamento: acc.pendenteFaturamento + row.pendenteFaturamento
          }),
          {
            faturamentoAcumulado: 0,
            faturamentoAnual: 0,
            totalProducaoSemanal: 0,
            valorOrcado: 0,
            pendenteFaturamento: 0
          }
        );

        const hasAnnualFilter = overviewForExport.filterYear != null;

        return {
          searchTerm: overviewForExport.searchTerm,
          filterYear: overviewForExport.filterYear,
          rows,
          totals: {
            contractCount: rows.length,
            faturamentoAcumulado: totals.faturamentoAcumulado,
            faturamentoAnual: hasAnnualFilter ? totals.faturamentoAnual : null,
            totalProducaoSemanal: totals.totalProducaoSemanal,
            valorOrcado: totals.valorOrcado,
            pendenteFaturamento: totals.pendenteFaturamento
          }
        };
      };

      if (showFaturamentoColumn) {
        const buildPdfSummary = (rows: readonly GastosOperacionaisRow[]) => {
          const summary = summarizeGastosPanelRows(rows);
          return {
            ...summary,
            tetoMinusGasto: calcTetoMinusGasto(summary.tetoOrcamentario, summary.gastos),
            gastoTetoPercent: formatGastoSobreTetoPercent(summary.tetoOrcamentario, summary.gastos),
            gastoFatPercent: formatGastoFaturamentoPercent(summary.gastos, summary.faturamento),
            gastoRecPercent: formatGastoRecebidoPercent(summary.gastos, summary.recebido)
          };
        };

        await exportControleGeralContratosPdf({
          filterLines: buildPdfFilterLines(),
          contractCount: visibleRowsWithFaturamento.length,
          sheetUpdatedAt,
          overviewSection: buildOverviewSection(),
          groups: localityGroups.map((group) => ({
            localityLabel: group.localityLabel,
            contractCount: group.rows.length,
            summary: buildPdfSummary(group.rows),
            rows: group.rows.map((row) => {
              const gastos = Math.abs(row.totalAcumulado);
              const faturamento = row.faturamentoAcumulado ?? 0;
              const recebido = row.recebidoAcumulado ?? 0;
              const tetoOrcamentario = row.tetoOrcamentario ?? 0;
              return {
                contract: row.contract,
                mesesLabel: buildMesesLabel(row),
                anoLabel: buildAnoLabel(row),
                faturamento,
                liquido: row.liquidoAcumulado ?? 0,
                recebido,
                contaVinculada: row.contaVinculadaAcumulado ?? null,
                tetoOrcamentario,
                gastos,
                tetoMinusGasto: calcTetoMinusGasto(tetoOrcamentario, gastos),
                gastoTetoPercent: formatGastoSobreTetoPercent(tetoOrcamentario, gastos),
                lucroLiquido: calcLucroLiquido(recebido, row.totalAcumulado),
                gastoFatPercent: formatGastoFaturamentoPercent(row.totalAcumulado, faturamento),
                gastoRecPercent: formatGastoRecebidoPercent(row.totalAcumulado, recebido)
              };
            })
          })),
          grandSummary: buildPdfSummary(visibleRowsWithFaturamento)
        });
      } else {
        await exportGastosOperacionaisPdf({
          filterLines: buildPdfFilterLines(),
          totalGastos,
          contractCount: visibleRows.length,
          localityCount: localityGroups.length,
          groups: localityGroups.map((group) => ({
            localityLabel: group.localityLabel,
            contractCount: group.rows.length,
            subtotal: group.subtotal,
            rows: group.rows.map((row) => ({
              contract: row.contract,
              mesesLabel: buildMesesLabel(row),
              anoLabel: buildAnoLabel(row),
              total: row.totalAcumulado
            }))
          })),
          sheetUpdatedAt
        });
      }

      toast.success('PDF exportado com sucesso.');
    } catch {
      toast.error('Erro ao gerar o PDF. Tente novamente.');
    } finally {
      setExportingPdf(false);
    }
  }, [
    buildAnoLabel,
    buildMesesLabel,
    buildPdfFilterLines,
    fetchedAt,
    localityGroups,
    overviewForExport,
    showFaturamentoColumn,
    totalGastos,
    visibleRows.length,
    visibleRowsWithFaturamento
  ]);

  return (
    <>
    <Card>
      <CardHeader className="border-b-0 pb-1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-100 p-2 sm:p-3 dark:bg-amber-900/30">
              <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400 sm:h-6 sm:w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {panelTitle}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {panelDescription}
              </p>
            </div>
          </div>
          {(inlineFilters && (showPdfExport || showFaturamentoColumn)) ? (
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(true)}
                className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  hasActiveFilters
                    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="Abrir filtro"
                title={hasActiveFilters ? 'Filtro (ativo)' : 'Filtro'}
              >
                <Filter className="h-4 w-4" />
                {hasActiveFilters ? (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => void handleExportPdf()}
                disabled={isPanelLoading || exportingPdf || !canExportPdf}
                className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                {exportingPdf ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-4 w-4 shrink-0" aria-hidden />
                )}
                <span>{exportingPdf ? 'Gerando PDF…' : 'Exportar PDF completo'}</span>
              </button>
            </div>
          ) : (showPdfExport || showFaturamentoColumn) && !hideDataRefreshControls ? (
            <div className="flex flex-col items-end gap-2">
              {fetchedAt ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Atualizado em{' '}
                  {new Date(fetchedAt).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {showTetoOrcamentarioColumn ? (
                  <button
                    type="button"
                    onClick={() => {
                      const singleMonth = getSingleCalendarMonthFromPeriod(
                        filters.periodFrom,
                        filters.periodTo
                      );
                      setTetoModalPrefill({
                        year: singleMonth?.year,
                        month: singleMonth?.month
                      });
                      setTetoModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-950/60"
                  >
                    <PiggyBank className="h-3.5 w-3.5" aria-hidden />
                    Cadastrar teto
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleExportPdf()}
                  disabled={isPanelLoading || exportingPdf || !canExportPdf}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  {exportingPdf ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Download className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {exportingPdf ? 'Gerando PDF…' : 'Exportar PDF completo'}
                </button>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    disabled={isPanelLoading || fetchingFaturamento}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isPanelLoading || fetchingFaturamento ? 'animate-spin' : ''}`}
                      aria-hidden
                    />
                    Atualizar planilha
                  </button>
                ) : null}
              </div>
            </div>
          ) : (showPdfExport || showFaturamentoColumn) && primaryExportButton ? (
            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={isPanelLoading || exportingPdf || !canExportPdf}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Download className="h-4 w-4" aria-hidden />
              )}
              {exportingPdf ? 'Gerando PDF…' : 'Exportar PDF completo'}
            </button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent>
        {isPanelLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-500 dark:text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            <span>Carregando dados do controle...</span>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="h-10 w-10 text-red-500" aria-hidden />
            <p className="max-w-md text-sm text-red-700 dark:text-red-300">
              {errorMessage ?? 'Erro ao carregar dados da planilha.'}
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : scopedDetailRows.length === 0 && !(allowedContracts?.length) ? (
          <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhum gasto operacional encontrado.
          </div>
        ) : (
          <>
            {!inlineFilters ? (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/40">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Filter className="h-4 w-4" aria-hidden />
                  Filtros
                </div>
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Limpar filtros
                  </button>
                ) : null}
              </div>

              {gastosFiltersFields}
            </div>
            ) : null}

            {enableRowExclusion ? (
              <HiddenContractsPanel
                contracts={excludedContractLabels}
                minimized={hiddenContractsListMinimized}
                onToggleMinimized={() => setHiddenContractsListMinimized((prev) => !prev)}
                onRestoreAll={handleRestoreAllExcluded}
                onRestoreOne={handleRestoreExcluded}
              />
            ) : null}

            {displayRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhum gasto encontrado para os filtros selecionados.
              </div>
            ) : enableRowExclusion && visibleRows.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                <p>Todos os contratos visíveis foram ocultados.</p>
                <button
                  type="button"
                  onClick={handleRestoreAllExcluded}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Restaurar todos
                </button>
              </div>
            ) : (
              <>
                {enableRowExclusion && selectedRows.length > 0 ? (
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/80 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/20">
                    <p className="text-sm text-blue-900 dark:text-blue-200">
                      {selectedRows.length}{' '}
                      {selectedRows.length === 1 ? 'contrato selecionado' : 'contratos selecionados'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={clearRowSelection}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                        Desmarcar todos
                      </button>
                      <button
                        type="button"
                        onClick={handleExcludeSelected}
                        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                      >
                        <EyeOff className="h-3.5 w-3.5" aria-hidden />
                        Excluir da visualização
                      </button>
                    </div>
                  </div>
                ) : enableRowExclusion ? (
                  <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                    Marque os contratos com o checkbox e use &quot;Excluir da visualização&quot; para
                    ocultá-los.
                  </p>
                ) : null}

                <div className="table-scroll">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        {enableRowExclusion ? (
                          <th className="w-10 px-3 py-3 text-center">
                            <RowSelectCheckbox
                              checked={allVisibleSelected}
                              indeterminate={someVisibleSelected && !allVisibleSelected}
                              onChange={toggleSelectAllVisible}
                              ariaLabel="Selecionar todos os contratos visíveis"
                            />
                          </th>
                        ) : null}
                        <th className={contractThClassName}>Contrato</th>
                        <th className={dataCenterThClassName}>Mês de apuração</th>
                        <th className={dataCenterThClassName}>Ano de apuração</th>
                        {!hideLocalityColumn ? (
                          <th className={dataCenterThClassName}>
                            {readOnlyPoloColumn ? 'Polo' : 'Localidade'}
                          </th>
                        ) : null}
                        {showFaturamentoColumn ? (
                          <th className={amountCurrencyThClassName}>Faturamento</th>
                        ) : null}
                        {showFaturamentoColumn ? (
                          <th className={amountCurrencyThClassName}>Líquido</th>
                        ) : null}
                        {showFaturamentoColumn ? (
                          <th className={amountCurrencyThClassName}>Recebido</th>
                        ) : null}
                        {showTetoOrcamentarioColumn ? (
                          <th className={amountCurrencyThClassName}>Teto orçamentário</th>
                        ) : null}
                        <th className={amountCurrencyThClassName}>{totalColumnLabel}</th>
                        {showTetoOrcamentarioColumn ? (
                          <th className={amountCurrencyThClassName}>Saldo a gastar</th>
                        ) : null}
                        {showFaturamentoColumn ? (
                          <th className={amountCurrencyThClassName}>Lucro líquido</th>
                        ) : null}
                        {showTetoOrcamentarioColumn ? (
                          <th className={amountPercentThClassName}>GASTO / TETO (%)</th>
                        ) : null}
                        {showFaturamentoColumn ? (
                          <th className={amountPercentThClassName}>GASTO / FAT (%)</th>
                        ) : null}
                        {showFaturamentoColumn ? (
                          <th className={amountPercentThClassName}>GASTO / REC (%)</th>
                        ) : null}
                        {showFaturamentoColumn ? (
                          <th className={amountCurrencyThClassName}>SALDO TOTAL - CV</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {localityGroups.map((group) => {
                        const groupSummary = summarizeGastosPanelRows(group.rows);

                        return (
                        <React.Fragment key={group.localityKey}>
                          <tr className="bg-amber-50 dark:bg-amber-950/30">
                            <td
                              colSpan={tableColumnCount}
                              className="px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300"
                            >
                              {group.localityLabel}
                            </td>
                          </tr>
                          {group.rows.map((row) => (
                            <tr
                              key={row.rowKey}
                              className={`transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                                enableRowExclusion && selectedRowKeys.has(row.rowKey)
                                  ? 'bg-blue-50/70 dark:bg-blue-950/20'
                                  : ''
                              }`}
                            >
                              {enableRowExclusion ? (
                                <td className="px-3 py-3 text-center">
                                  <div
                                    onClick={(event) => event.stopPropagation()}
                                    onKeyDown={(event) => event.stopPropagation()}
                                  >
                                    <RowSelectCheckbox
                                      checked={selectedRowKeys.has(row.rowKey)}
                                      onChange={() => toggleRowSelection(row.rowKey)}
                                      ariaLabel={`Selecionar ${row.contract}`}
                                    />
                                  </div>
                                </td>
                              ) : null}
                              <td className={contractCellClassName}>
                                <div className="flex items-center gap-2">
                                  {enableContractFluxoModal ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setFluxoModalContract(row.contract);
                                      }}
                                      className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 text-left font-medium text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                                      title="Ver detalhes e evolução financeira"
                                    >
                                      <span className="truncate">{row.contract}</span>
                                    </button>
                                  ) : (
                                    (() => {
                                      const detailPath = resolveContractDetailPath(row.contract);
                                      if (!detailPath) return row.contract;

                                      return (
                                        <Link
                                          href={detailPath}
                                          onClick={(event) => event.stopPropagation()}
                                          className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                                        >
                                          <span>{row.contract}</span>
                                          <ExternalLink
                                            className="h-3.5 w-3.5 shrink-0 opacity-70"
                                            aria-hidden
                                          />
                                        </Link>
                                      );
                                    })()
                                  )}
                                  {enableContractFluxoModal && resolveContractDetailPath(row.contract) ? (
                                    <Link
                                      href={resolveContractDetailPath(row.contract)!}
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex shrink-0 rounded p-0.5 text-blue-600 opacity-70 hover:bg-blue-50 hover:opacity-100 dark:text-blue-400 dark:hover:bg-blue-950/40"
                                      title="Abrir cadastro do contrato"
                                      aria-label={`Abrir cadastro de ${row.contract}`}
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                    </Link>
                                  ) : null}
                                </div>
                              </td>
                              <td className={dataCenterCellClassName}>
                                {buildMesesLabel(row)}
                              </td>
                              <td className={dataCenterCellClassName}>
                                {buildAnoLabel(row)}
                              </td>
                              {!hideLocalityColumn ? (
                                <td className={`${dataCenterCellClassName} text-gray-700 dark:text-gray-300`}>
                                  {readOnlyPoloColumn ? (
                                    row.polo?.trim() || '—'
                                  ) : (
                                    <StringSingleSelectDropdown
                                      value={getEffectiveContractLocality(row.contract, inferredLocalityOverrides)}
                                      onChange={(value) =>
                                        handleContractLocalityChange(row.contract, value)
                                      }
                                      options={localityTableSelectOptions}
                                      allowEmpty={false}
                                      disableSearch
                                      hideChevron
                                      className={localitySelectWrapperClassName}
                                      triggerClassName={localitySelectTriggerClassName}
                                    />
                                  )}
                                </td>
                              ) : null}
                              {showFaturamentoColumn ? (
                                <td className={`${amountCurrencyCellClassName} text-green-600 dark:text-green-400`}>
                                  {formatCurrency(row.faturamentoAcumulado ?? 0)}
                                </td>
                              ) : null}
                              {showFaturamentoColumn ? (
                                <td className={`${amountCurrencyCellClassName} text-blue-600 dark:text-blue-400`}>
                                  {formatCurrency(row.liquidoAcumulado ?? 0)}
                                </td>
                              ) : null}
                              {showFaturamentoColumn ? (
                                <td className={`${amountCurrencyCellClassName} text-sky-600 dark:text-sky-400`}>
                                  {formatCurrency(row.recebidoAcumulado ?? 0)}
                                </td>
                              ) : null}
                              {showTetoOrcamentarioColumn ? (
                                <td
                                  className={`${amountCurrencyCellClassName} ${tetoOrcamentarioClassName(
                                    row.totalAcumulado,
                                    row.tetoOrcamentario ?? 0
                                  )}`}
                                >
                                  <button
                                    type="button"
                                    title="Cadastrar / editar teto orçamentário"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      const singleMonth = getSingleCalendarMonthFromPeriod(
                                        filters.periodFrom,
                                        filters.periodTo
                                      );
                                      setTetoModalPrefill({
                                        contractName: row.contract,
                                        year: singleMonth?.year,
                                        month: singleMonth?.month
                                      });
                                      setTetoModalOpen(true);
                                    }}
                                    className="mx-auto block rounded-md px-1.5 py-0.5 tabular-nums transition-colors hover:bg-gray-100 hover:underline dark:hover:bg-gray-800"
                                  >
                                    {(row.tetoOrcamentario ?? 0) > 0
                                      ? formatCurrency(row.tetoOrcamentario ?? 0)
                                      : '—'}
                                  </button>
                                </td>
                              ) : null}
                              <td
                                className={`${amountCurrencyCellClassName} ${gastosNaturezaModalValueClassName(row.totalAcumulado)} ${
                                  enableNaturezaBreakdown
                                    ? 'cursor-pointer rounded-md hover:bg-blue-50/70 hover:underline dark:hover:bg-blue-950/30'
                                    : ''
                                }`}
                                role={enableNaturezaBreakdown ? 'button' : undefined}
                                tabIndex={enableNaturezaBreakdown ? 0 : undefined}
                                title={
                                  enableNaturezaBreakdown
                                    ? 'Clique para ver naturezas e valores'
                                    : undefined
                                }
                                onClick={
                                  enableNaturezaBreakdown
                                    ? (event) => {
                                        event.stopPropagation();
                                        setNaturezaModalContract(row);
                                      }
                                    : undefined
                                }
                                onKeyDown={
                                  enableNaturezaBreakdown
                                    ? (event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          setNaturezaModalContract(row);
                                        }
                                      }
                                    : undefined
                                }
                              >
                                {formatCurrency(row.totalAcumulado)}
                              </td>
                              {showTetoOrcamentarioColumn ? (
                                <td
                                  className={`${amountCurrencyCellClassName} ${tetoMinusGastoClassName(
                                    row.tetoOrcamentario ?? 0,
                                    row.totalAcumulado
                                  )}`}
                                >
                                  {formatTetoMinusGasto(row.tetoOrcamentario ?? 0, row.totalAcumulado)}
                                </td>
                              ) : null}
                              {showFaturamentoColumn ? (
                                <td
                                  className={`${amountCurrencyCellClassName} ${lucroLiquidoClassName(
                                    calcLucroLiquido(
                                      row.recebidoAcumulado ?? 0,
                                      row.totalAcumulado
                                    )
                                  )}`}
                                >
                                  {formatCurrency(
                                    calcLucroLiquido(
                                      row.recebidoAcumulado ?? 0,
                                      row.totalAcumulado
                                    )
                                  )}
                                </td>
                              ) : null}
                              {showTetoOrcamentarioColumn ? (
                                <td
                                  className={`${amountPercentCellClassName} ${gastoSobreTetoPercentClassName(
                                    row.tetoOrcamentario ?? 0,
                                    row.totalAcumulado
                                  )}`}
                                >
                                  {formatGastoSobreTetoPercent(
                                    row.tetoOrcamentario ?? 0,
                                    row.totalAcumulado
                                  )}
                                </td>
                              ) : null}
                              {showFaturamentoColumn ? (
                                <td
                                  className={`${amountPercentCellClassName} ${gastoFaturamentoPercentClassName(
                                    row.totalAcumulado,
                                    row.faturamentoAcumulado ?? 0
                                  )}`}
                                >
                                  {formatGastoFaturamentoPercent(
                                    row.totalAcumulado,
                                    row.faturamentoAcumulado ?? 0
                                  )}
                                </td>
                              ) : null}
                              {showFaturamentoColumn ? (
                                <td
                                  className={`${amountPercentCellClassName} ${gastoRecebidoPercentClassName(
                                    row.totalAcumulado,
                                    row.recebidoAcumulado ?? 0
                                  )}`}
                                >
                                  {formatGastoRecebidoPercent(
                                    row.totalAcumulado,
                                    row.recebidoAcumulado ?? 0
                                  )}
                                </td>
                              ) : null}
                              {showFaturamentoColumn ? (
                                <td
                                  className={`${amountCurrencyCellClassName} text-indigo-600 dark:text-indigo-400`}
                                  onClick={(event) => event.stopPropagation()}
                                  onKeyDown={(event) => event.stopPropagation()}
                                  title="Soma da coluna Conta Vinculada na planilha de NF's"
                                >
                                  {row.contaVinculadaAcumulado == null
                                    ? '—'
                                    : formatCurrency(row.contaVinculadaAcumulado)}
                                </td>
                              ) : null}
                            </tr>
                          ))}
                          <FinancialTotalsTableRow
                            title={`Total — ${group.localityLabel}`}
                            contractCount={group.rows.length}
                            summary={groupSummary}
                            showNfsMetrics={showFaturamentoColumn}
                            showTetoOrcamentario={showTetoOrcamentarioColumn}
                            tableLabelColSpan={tableLabelColSpan}
                          />
                        </React.Fragment>
                        );
                      })}
                      {localityGroups.length > 0 ? (
                        <FinancialTotalsTableRow
                          title={
                            readOnlyPoloColumn
                              ? 'Total geral — todos os polos'
                              : 'Total geral — todas as localidades'
                          }
                          contractCount={visibleRowsWithFaturamento.length}
                          summary={grandSummary}
                          showNfsMetrics={showFaturamentoColumn}
                          showTetoOrcamentario={showTetoOrcamentarioColumn}
                          tableLabelColSpan={tableLabelColSpan}
                          variant="grand"
                        />
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>

      {inlineFilters && isFiltersModalOpen ? (
        <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsFiltersModalOpen(false)}
          />
          <div className="relative mx-4 w-full max-w-3xl rounded-xl bg-white shadow-2xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(false)}
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                aria-label="Fechar filtros"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{gastosFiltersFields}</div>
            <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                <RotateCcw className="h-4 w-4" />
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(false)}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}


      <Modal
        isOpen={naturezaModalContract != null}
        onClose={() => setNaturezaModalContract(null)}
        title={
          naturezaModalContract
            ? `Naturezas — ${naturezaModalContract.contract}`
            : 'Naturezas'
        }
        size="lg"
        scrollContent={false}
      >
        {naturezaModalContract ? (
          naturezaModalRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhuma natureza encontrada para este contrato no período selecionado.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
              <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Natureza
                    </th>
                    <th className="min-w-[10.5rem] shrink-0 px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                    {naturezaModalGrouped.dfcTrees.map((dfcTree) => {
                      const rootSectionKey = `dfc:root:${dfcTree.rootKey}`;

                      return (
                        <React.Fragment key={dfcTree.rootKey}>
                          <tr className="bg-gray-50 font-medium dark:bg-gray-800/50">
                            <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100">
                              <button
                                type="button"
                                onClick={() => toggleNaturezaSection(rootSectionKey)}
                                className="inline-flex w-full items-center gap-1.5 text-left hover:opacity-80"
                                aria-expanded={!collapsedNaturezaSections.has(rootSectionKey)}
                              >
                                {collapsedNaturezaSections.has(rootSectionKey) ? (
                                  <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                                ) : (
                                  <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
                                )}
                                <span>{dfcTree.rootLabel}</span>
                              </button>
                            </td>
                            <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-semibold whitespace-nowrap ${gastosNaturezaModalValueClassName(dfcTree.rootSubtotal)}`}>
                              {formatCurrency(dfcTree.rootSubtotal)}
                            </td>
                          </tr>
                          {!collapsedNaturezaSections.has(rootSectionKey)
                            ? dfcTree.branches.map((branch) => {
                                const branchSectionKey = `dfc:branch:${dfcTree.rootKey}:${branch.branchKey}`;
                                const isBranchCollapsed =
                                  collapsedNaturezaSections.has(branchSectionKey);

                                return (
                                  <React.Fragment key={`${dfcTree.rootKey}:${branch.branchKey}`}>
                                    <tr className="bg-gray-50 font-medium dark:bg-gray-800/50">
                                      <td
                                        className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100"
                                        style={{ paddingLeft: 32 }}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => toggleNaturezaSection(branchSectionKey)}
                                          className="inline-flex w-full items-center gap-1.5 text-left hover:opacity-80"
                                          aria-expanded={!isBranchCollapsed}
                                        >
                                          {isBranchCollapsed ? (
                                            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                                          ) : (
                                            <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
                                          )}
                                          <span>{branch.label}</span>
                                        </button>
                                      </td>
                                      <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-semibold whitespace-nowrap ${gastosNaturezaModalValueClassName(branch.subtotal)}`}>
                                        {formatCurrency(branch.subtotal)}
                                      </td>
                                    </tr>
                                    {areDfcBranchLeafGroupsVisible(dfcTree.rootKey, branch.branchKey)
                                      ? branch.leafGroups.map((group) => {
                                          const leafKey = `dfc:leaf:${group.leafBlockId}`;
                                          const isLeafCollapsed =
                                            collapsedNaturezaSections.has(leafKey);

                                          return (
                                            <React.Fragment key={group.leafBlockId}>
                                              <tr className="bg-gray-100 font-semibold dark:bg-gray-800/80">
                                                <td
                                                  className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100"
                                                  style={{ paddingLeft: 48 }}
                                                >
                                                  <button
                                                    type="button"
                                                    onClick={() => toggleNaturezaSection(leafKey)}
                                                    className="inline-flex w-full items-center gap-1.5 text-left hover:opacity-80"
                                                    aria-expanded={!isLeafCollapsed}
                                                  >
                                                    {isLeafCollapsed ? (
                                                      <ChevronDown
                                                        className="h-4 w-4 shrink-0"
                                                        aria-hidden
                                                      />
                                                    ) : (
                                                      <ChevronUp
                                                        className="h-4 w-4 shrink-0"
                                                        aria-hidden
                                                      />
                                                    )}
                                                    <span>{group.leafLabel}</span>
                                                  </button>
                                                </td>
                                                <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-semibold whitespace-nowrap ${gastosNaturezaModalValueClassName(group.subtotal)}`}>
                                                  {formatCurrency(group.subtotal)}
                                                </td>
                                              </tr>
                                              {areDfcLeafRowsVisible(
                                                dfcTree.rootKey,
                                                branch.branchKey,
                                                group.leafBlockId
                                              )
                                                ? group.rows.map((row) => renderNaturezaModalRow(row, 64))
                                                : null}
                                            </React.Fragment>
                                          );
                                        })
                                      : null}
                                  </React.Fragment>
                                );
                              })
                            : null}
                        </React.Fragment>
                      );
                    })}
                    {naturezaModalGrouped.ungrouped.length > 0 ? (
                      <>
                        <tr className="bg-gray-50 font-semibold dark:bg-gray-800/60">
                          <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100">
                            <button
                              type="button"
                              onClick={() => toggleNaturezaSection('dfc:ungrouped')}
                              className="inline-flex w-full items-center gap-1.5 text-left hover:opacity-80"
                              aria-expanded={!collapsedNaturezaSections.has('dfc:ungrouped')}
                            >
                              {collapsedNaturezaSections.has('dfc:ungrouped') ? (
                                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                              ) : (
                                <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
                              )}
                              <span>Outras naturezas</span>
                            </button>
                          </td>
                          <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-semibold whitespace-nowrap ${gastosNaturezaModalValueClassName(
                            naturezaModalGrouped.ungrouped.reduce((sum, row) => sum + row.total, 0)
                          )}`}>
                            {formatCurrency(
                              naturezaModalGrouped.ungrouped.reduce((sum, row) => sum + row.total, 0)
                            )}
                          </td>
                        </tr>
                        {!collapsedNaturezaSections.has('dfc:ungrouped')
                          ? naturezaModalGrouped.ungrouped.map((row) => renderNaturezaModalRow(row, 32))
                          : null}
                      </>
                    ) : null}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50 font-semibold dark:border-gray-700 dark:bg-gray-800/80">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">Total</td>
                      <td className={`px-4 py-3 text-right text-sm tabular-nums whitespace-nowrap ${gastosNaturezaModalValueClassName(naturezaModalTotal)}`}>
                        {formatCurrency(naturezaModalTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
          )
        ) : null}
      </Modal>

      <Modal
        isOpen={selectedNaturezaSolicitacao != null}
        onClose={() => setSelectedNaturezaSolicitacao(null)}
        title="Detalhe da solicitação"
        size="lg"
      >
        {selectedNaturezaSolicitacao ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {resolveGastosNaturezaSolicitacaoTitulo(selectedNaturezaSolicitacao)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {formatGastosNaturezaSolicitacaoDataLabel(
                  selectedNaturezaSolicitacao,
                  formatGastosNaturezaDate
                )}{' '}
                · {selectedNaturezaSolicitacao.natureza}
              </p>
            </div>
            <p
              className={`text-lg font-semibold tabular-nums ${gastosNaturezaModalValueClassName(
                gastosNaturezaTotalContribution(
                  selectedNaturezaSolicitacao.natureza,
                  selectedNaturezaSolicitacao.valor
                )
              )}`}
            >
              {formatCurrency(
                gastosNaturezaTotalContribution(
                  selectedNaturezaSolicitacao.natureza,
                  selectedNaturezaSolicitacao.valor
                )
              )}
            </p>
            {selectedNaturezaSolicitacao.lancamentosAgrupados &&
            selectedNaturezaSolicitacao.lancamentosAgrupados.length > 1 ? (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700">
                <p className="border-b border-gray-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Lançamentos que compõem o total
                </p>
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {selectedNaturezaSolicitacao.lancamentosAgrupados.map((lancamento) => {
                    const signedValor = gastosNaturezaTotalContribution(
                      selectedNaturezaSolicitacao.natureza,
                      lancamento.valor
                    );
                    return (
                    <li
                      key={lancamento.linhaId}
                      className="flex items-start justify-between gap-4 px-4 py-3 text-sm"
                    >
                      <span className="text-gray-700 dark:text-gray-300">
                        {lancamento.dataISO ? formatGastosNaturezaDate(lancamento.dataISO) : '—'}
                      </span>
                      <span
                        className={`shrink-0 tabular-nums font-medium ${gastosNaturezaModalValueClassName(signedValor)}`}
                      >
                        {formatCurrency(signedValor)}
                      </span>
                    </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            <dl className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
              {Object.entries(selectedNaturezaSolicitacao.detalhes).map(([key, value]) => (
                <div
                  key={key}
                  className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-3 sm:gap-4"
                >
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {key}
                  </dt>
                  <dd className="whitespace-pre-wrap break-words text-sm text-gray-900 dark:text-gray-100 sm:col-span-2">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </Modal>

      {enableContractFluxoModal ? (
        <ControleGeralFluxoDetalheModal
          isOpen={fluxoModalContract !== null}
          onClose={() => setFluxoModalContract(null)}
          title={fluxoModalContract ? `Contrato: ${fluxoModalContract}` : 'Detalhes do contrato'}
          contractName={fluxoModalContract}
          rows={fluxoModalGastosRows}
          recebidoMensal={fluxoModalRecebidoMensal}
          nfsTotals={fluxoModalNfsTotals}
          titleSuffix={fluxoModalContract ?? undefined}
          loadingRecebido={loadingFaturamento && recebidoMensalByContract.length === 0}
        />
      ) : null}

      {showTetoOrcamentarioColumn ? (
        <ControleGeralTetoOrcamentarioModal
          isOpen={tetoModalOpen}
          onClose={() => {
            setTetoModalOpen(false);
            setTetoModalPrefill(null);
          }}
          contractOptions={tetoContractOptions}
          entries={tetoOrcamentarioEntries}
          prefill={tetoModalPrefill}
        />
      ) : null}

      {!readOnlyPoloColumn ? (
        <GastosLocalitiesManageModal
          isOpen={localitiesModalOpen}
          onClose={() => setLocalitiesModalOpen(false)}
          onCatalogChanged={refreshLocalitiesCatalog}
        />
      ) : null}
    </Card>

    {showPrevisaoGastosMensal ? (
      <ControleGeralPrevisaoGastosMensalPanel
        isLoading={isPanelLoading}
        isError={isError}
        errorMessage={errorMessage}
        onRetry={onRetry}
        localityGroups={localityGroups}
        year={
          getSingleYearFromPeriod(filters.periodFrom, filters.periodTo) ??
          new Date().getFullYear()
        }
      />
    ) : null}
    </>
  );
}
