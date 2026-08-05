'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import jsPDF from 'jspdf';
import {
  ArrowLeft,
  FileText,
  FileSpreadsheet,
  Download,
  Plus,
  Receipt,
  X,
  Edit2,
  ClipboardList,
  FileDown,
  ExternalLink,
  BarChart3,
  Trash2,
  CheckCircle2,
  CalendarDays,
  Calculator,
  FileImage,
  Loader2,
  Eye,
  ChevronDown,
  Info,
  Search,
  Filter,
  MoreVertical,
  Clock,
  History,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { TableCheckbox } from '@/components/ui/Checkbox';
import toast from 'react-hot-toast';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import {
  filterNaturezaRowsForPaidModalDisplay,
  isNaturezaIncludedInContractPaidTotal,
  normalizeNaturezaLabel
} from '@/lib/contractPaidNaturezaExclusions';
import { PleitoFormModal } from '@/components/pleito/PleitoFormModal';
import { PleitoOsPurchaseOrdersSection } from '@/components/pleito/PleitoOsPurchaseOrdersSection';
import { ContractCronogramaMensalPanel } from '@/components/contract/ContractCronogramaMensalPanel';
import { ContractHistoricoPleitosPanel } from '@/components/contract/ContractHistoricoPleitosPanel';
import { ContractOsPleitoListPanel } from '@/components/contract/ContractOsPleitoListPanel';
import { RowActionMenuCell, RowActionMenuPortal, cadastroListClasses, rowActionMenuButtonClass } from '@/components/ui/RowActionMenu';
import { listTableRowClasses } from '@/components/ui/listTableUi';
import { CadastroListSummary, getCadastroListRange } from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { ROW_ACTION_MENU_WIDTH_PX, type RowActionMenuState, useRowActionMenu } from '@/hooks/useRowActionMenu';
import {
  isBudgetStatusInValorOrcadoSum,
  type PleitoFormData
} from '@/lib/pleitoForm';
import { useContractTableColumnCustomizer } from '@/components/useContractTableColumnCustomizer';
import { usePermissions } from '@/hooks/usePermissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import {
  formatOsSePasta,
  formatOsSePastaOrDash,
  folderForDivSe,
  enrichDivSeOptionsWithPleitos,
  type DivSeOptionRow
} from '@/lib/formatOsSePasta';
import { loadPdfBrandingLogoDataUrl } from '@/lib/loadPdfBrandingLogo';
import { exportHistoricoOsPdf, exportPleitosOsToXlsx, getOsFaturamentoAcumulado, getOsPleiteadoPct, getOsRestantePleitear, getOsStatus, getOsStatusFaturamento, isOsConcluida, isOsPleiteada100, osStatusBadgeClass, sumOsPleiteadoTotal, type BillingForOsCheck, type PleitoOsExportRow } from '@/lib/pleitoOsExport';
import {
  billingAndamentoBadgeClass,
  buildDisplayIdMap,
  formatDisplayId,
  getOsLinkedPleitos,
  isGeneratedPleito,
} from '@/lib/contractHistoricoPleitos';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  formatAjusteValorInput,
  maskAjusteValorInput,
  parseAjusteValorInput
} from '@/lib/extratoCaixaAjuste';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import {
  aggregateGastosNaturezaMonthlyTotals,
  aggregateGastosNaturezaYearlyTotals,
  filterGastosNaturezaDetailRowsForSystemContract,
  gastosMonthPeriodBounds,
  gastosYearPeriodBounds
} from '@/app/ponto/contratos/controle-geral/controleGeralGastosFluxo';
import type { QueryGastosDetailRow, QueryGastosNaturezaDetailRow } from '@/app/ponto/contratos/controle-geral/buildQueryGastosRows';
import { aggregateGastosNaturezaRows } from '@/app/ponto/contratos/controle-geral/buildQueryGastosRows';
import { normalizeGastosOperacionaisContractName } from '@/app/ponto/contratos/controle-geral/gastosOperacionaisContractOrder';
import {
  buildTetoOrcamentarioLookup,
  resolveMonthlyTetoOrcamentarioForLabels,
  resolveYearlyTetoOrcamentarioForLabels,
  tetoLabelsForSystemContract,
  type ControleGeralTetoOrcamentarioEntry
} from '@/app/ponto/contratos/controle-geral/tetoOrcamentario';
import { resolveGastosPoloFromContractName } from '@/lib/extratoCaixaPolo';
import { ContractGastosResumoModal } from '@/components/contract/ContractGastosResumoModal';

interface ContractBilling {
  id: string;
  contractId: string;
  pleitoId?: string | null;
  issueDate: string;
  invoiceNumber: string;
  serviceOrder: string;
  grossValue: number;
  netValue: number;
  createdAt?: string;
  updatedAt?: string;
}

interface ContractPleito {
  id: string;
  divSe: string | null;
  creationMonth: string | null;
  creationYear: number | null;
  startDate: string | null;
  endDate: string | null;
  budgetStatus: string | null;
  folderNumber: string | null;
  serviceDescription: string;
  executionStatus: string | null;
  budget: string | null;
  billingStatus: string | null;
  invoiceNumber?: string | null;
  lot: string | null;
  location: string | null;
  unit: string | null;
  engineer: string | null;
  supervisor: string | null;
  budgetAmount1: number | null;
  budgetAmount2: number | null;
  budgetAmount3: number | null;
  budgetAmount4: number | null;
  reportsBilling: string | null;
  pv: string | null;
  ipi: string | null;
  billingRequest?: number | null;
  accumulatedBilled?: number | null;
  createdAt?: string;
}

interface Contract {
  id: string;
  name: string;
  number: string;
  startDate: string;
  endDate: string;
  costCenterId: string;
  costCenter?: { id: string; code: string; name: string };
  valuePlusAddenda: number;
}

interface ContractAnnualValueRow {
  id: string;
  contractId: string;
  year: number;
  value: number;
  budgetAdjustmentDelta?: number | null;
  budgetAdjustmentEffectiveDate?: string | null;
  computedBaseAnnual?: number | null;
}

interface ContractAddendumRow {
  id: string;
  contractId: string;
  effectiveDate: string;
  amount: number;
  note?: string | null;
  createdAt?: string;
}

interface ContractWeeklyProduction {
  id: string;
  contractId: string;
  fillingDate: string;
  divSe: string;
  weeklyProductionValue: number;
  responsiblePerson: string;
  createdAt?: string;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const LIST_DISPLAY_LIMIT = 10;
const LIST_SEARCH_INPUT_CLASS =
  'h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

const OS_TOOLBAR_BTN_ICON = 'h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400';

const OS_TOOLBAR_BTN =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';

const OS_TOOLBAR_BTN_DANGER =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-red-600 transition-colors hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-red-400 dark:hover:border-red-900/50 dark:hover:bg-red-950/25';

const OS_TOOLBAR_BTN_PRIMARY =
  'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/40';

function pleitoMatchesSearchTerm(p: ContractPleito, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  const haystack = [
    p.divSe,
    p.serviceDescription,
    p.folderNumber,
    p.budgetStatus,
    p.executionStatus,
    p.lot,
    p.location,
    p.unit,
    p.engineer,
    p.supervisor,
    p.billingStatus,
    p.creationMonth,
    p.creationYear != null ? String(p.creationYear) : '',
    p.budget,
    p.pv,
    p.ipi,
    p.reportsBilling,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(t);
}

function productionMatchesSearchTerm(p: ContractWeeklyProduction, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  const haystack = [
    p.divSe,
    p.responsiblePerson,
    p.fillingDate,
    formatCurrencyInput(p.weeklyProductionValue),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(t);
}

function billingMatchesSearchTerm(b: ContractBilling, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  const haystack = [
    b.invoiceNumber,
    b.serviceOrder,
    b.issueDate,
    formatCurrencyInput(b.grossValue),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(t);
}

const PLEITO_HISTORY_MARKER = '__PLEITO_HISTORICO__';

type RmPaidLineRow = { valor: number; natureza: string; dataISO: string | null };
type RmNaturezaAggRow = { natureza: string; total: number; count: number };
type RmLinhaComCompetencia = RmPaidLineRow & { competencia?: string };

function aggregateGastosNaturezaFromLines(lines: RmPaidLineRow[]): RmNaturezaAggRow[] {
  const map = new Map<string, RmNaturezaAggRow>();
  for (const line of lines) {
    if (!isNaturezaIncludedInContractPaidTotal(line.natureza)) continue;
    const key = normalizeNaturezaLabel(line.natureza);
    const prev = map.get(key);
    const valor = Number(line.valor) || 0;
    if (prev) {
      prev.total += valor;
      prev.count += 1;
    } else {
      map.set(key, { natureza: line.natureza, total: valor, count: 1 });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function buildGastosLinesMapFromLines(
  lines: RmPaidLineRow[],
  competencia?: string
): Map<string, RmLinhaComCompetencia[]> {
  const map = new Map<string, RmLinhaComCompetencia[]>();
  for (const line of lines) {
    if (!isNaturezaIncludedInContractPaidTotal(line.natureza)) continue;
    const key = normalizeNaturezaLabel(line.natureza);
    const list = map.get(key) ?? [];
    list.push({ ...line, competencia });
    map.set(key, list);
  }
  map.forEach((arr, key) => {
    arr.sort((a, b) => {
      const ta = a.dataISO ? new Date(`${a.dataISO}T12:00:00`).getTime() : 0;
      const tb = b.dataISO ? new Date(`${b.dataISO}T12:00:00`).getTime() : 0;
      return tb - ta;
    });
    map.set(key, arr);
  });
  return map;
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
  { value: 12, label: 'Dezembro' }
];

const MESES_FILTRO_SELECT_OPTIONS = labeledToSelectOptions(
  MESES_FILTRO.map((m) => ({ value: String(m.value), label: m.label }))
);

const FILTER_OS_STATUS_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Todos' },
  { value: 'Pendente', label: 'Pendente' },
  { value: 'Pleiteado parcial', label: 'Pleiteado parcial' },
  { value: 'Pleiteado 100%', label: 'Pleiteado 100%' },
]);

const FILTER_OS_STATUS_FATURAMENTO_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Todos' },
  { value: 'Pendente', label: 'Pendente' },
  { value: 'Faturado parcial', label: 'Faturado parcial' },
  { value: 'Faturado 100%', label: 'Faturado 100%' },
]);

const CONTROLE_GERAL_META_AJUDA =
  'Meta ideal = saldo ÷ meses restantes até o fim da vigência e permanece fixa até aditivo ou ajuste. Aditivos contratuais entram na data e vão até o fim da vigência. Ajuste do valor anual redistribui só o delta (+/−) somado às metas já planejadas do mês da data até dezembro daquele ano (não troca a base pela fatia anual inteira nem altera anos seguintes). Meta real = saldo contratual (base + aditivos − faturamento) ÷ meses restantes da vigência; com ajuste anual, aplica o mesmo pool (metas restantes do ano + delta) só até dezembro, reduzindo com o faturamento.';

/** Oculta gasto total e linha Gastos na UI; dados RM continuam sendo carregados. */
const EXIBIR_GASTOS_CONTRATO_NA_UI = false;

const TIMEZONE_BRASILIA = 'America/Sao_Paulo';
const pk = pathToModuleKey;

/** Apenas calendário (YYYY-MM-DD) sem hora — evita deslocar o dia. */
function parseDateOnlyLocal(dateStr: string): Date | null {
  const m = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  return new Date(y, mo, day, 12, 0, 0, 0);
}

function parseDateSafe(dateStr: string | Date | null | undefined): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) {
    if (Number.isNaN(dateStr.getTime())) return null;
    const y = dateStr.getFullYear();
    const mo = dateStr.getMonth();
    const day = dateStr.getDate();
    return new Date(y, mo, day, 12, 0, 0, 0);
  }
  const raw = String(dateStr).trim();
  const dateOnly = parseDateOnlyLocal(raw);
  if (dateOnly) return dateOnly;
  /** ISO com hora/Z desloca o dia no fuso local — vigência deve usar só o calendário YYYY-MM-DD. */
  const isoPrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoPrefix) {
    return parseDateOnlyLocal(`${isoPrefix[1]}-${isoPrefix[2]}-${isoPrefix[3]}`);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getCalendarPartsBrasilia(d: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE_BRASILIA,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d);
}

function getDateYear(dateStr: string | null | undefined): number | null {
  const d = parseDateSafe(dateStr);
  if (!d) return null;
  const y = getCalendarPartsBrasilia(d).find((p) => p.type === 'year')?.value;
  return y != null ? Number(y) : null;
}

function getDateMonth(dateStr: string | null | undefined): number | null {
  const d = parseDateSafe(dateStr);
  if (!d) return null;
  const m = getCalendarPartsBrasilia(d).find((p) => p.type === 'month')?.value;
  return m != null ? Number(m) : null;
}

function addYearsLocal(date: Date, years: number): Date {
  return new Date(date.getFullYear() + years, date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

/**
 * Quantidade de "anos de contrato": menor k ≥ 1 tal que (início + k anos) ≥ fim da vigência.
 * Ex.: 28/02/2026 a 28/02/2030 → k = 4 (aniversários: +1a, +2a, +3a, +4a atinge o fim).
 */
function countContractYearsOfVigencia(startDate: string, endDate: string): number {
  const start = parseDateSafe(startDate);
  const end = parseDateSafe(endDate);
  if (!start || !end || end.getTime() <= start.getTime()) return 0;
  let k = 0;
  while (k < 100) {
    k += 1;
    const boundary = addYearsLocal(start, k);
    if (boundary.getTime() >= end.getTime()) return k;
  }
  return 0;
}

/**
 * Indica se o mês civil (1–12) no ano calendário cruza a vigência [início, fim):
 * primeiro instante do mês < fim e último dia do mês ≥ início.
 * Assim, meses antes do início ficam em branco e o mês da data final deixa de receber meta quando o fim é o 1º dia daquele mês.
 */
function calendarMonthHasMetaMensalInVigencia(
  calendarYear: number,
  calendarMonth1to12: number,
  contractStart: Date,
  contractEnd: Date
): boolean {
  const ms = new Date(calendarYear, calendarMonth1to12 - 1, 1, 12, 0, 0, 0);
  const me = new Date(calendarYear, calendarMonth1to12, 0, 12, 0, 0, 0);
  return ms.getTime() < contractEnd.getTime() && me.getTime() >= contractStart.getTime();
}

function toYearMonthKey(y: number, m1to12: number): string {
  return `${y}-${String(m1to12).padStart(2, '0')}`;
}

/** Meses civis em [monthStart, monthEnd] que cruzam a vigência (para rateio só no ano civil). */
function countVigenciaMonthsInRange(
  calendarYear: number,
  monthStart: number,
  monthEnd: number,
  contractStart: Date,
  contractEnd: Date
): number {
  let n = 0;
  for (let m = monthStart; m <= monthEnd; m++) {
    if (calendarMonthHasMetaMensalInVigencia(calendarYear, m, contractStart, contractEnd)) {
      n += 1;
    }
  }
  return n;
}

type VigenciaMonth = { y: number; m: number; key: string };

/** Meses da vigência com meta mensal, em ordem cronológica. */
function listVigenciaMonthKeys(contractStart: Date, contractEnd: Date): VigenciaMonth[] {
  const months: VigenciaMonth[] = [];
  const cursor = new Date(contractStart.getFullYear(), contractStart.getMonth(), 1, 12, 0, 0, 0);
  const endCursor = new Date(contractEnd.getFullYear(), contractEnd.getMonth(), 1, 12, 0, 0, 0);
  while (cursor.getTime() <= endCursor.getTime()) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    if (calendarMonthHasMetaMensalInVigencia(y, m, contractStart, contractEnd)) {
      months.push({ y, m, key: toYearMonthKey(y, m) });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function parseContractAddendaForMeta(rows: ContractAddendumRow[]): Array<{ effectiveDate: Date; amount: number }> {
  const out: Array<{ effectiveDate: Date; amount: number }> = [];
  for (const a of rows) {
    const d = parseDateSafe(a.effectiveDate);
    if (!d) continue;
    out.push({ effectiveDate: d, amount: Number(a.amount) || 0 });
  }
  return out;
}

type AnnualBudgetAdjustmentRow = { year: number; effectiveDate: Date; amount: number };

function parseAnnualBudgetAdjustments(rows: ContractAnnualValueRow[] | undefined): AnnualBudgetAdjustmentRow[] {
  if (!rows?.length) return [];
  const out: AnnualBudgetAdjustmentRow[] = [];
  for (const r of rows) {
    if (r.budgetAdjustmentDelta == null || !r.budgetAdjustmentEffectiveDate) continue;
    const eff = parseDateSafe(r.budgetAdjustmentEffectiveDate);
    if (!eff) continue;
    const amount = Number(r.budgetAdjustmentDelta);
    if (!Number.isFinite(amount) || Math.abs(amount) < 1e-9) continue;
    out.push({ year: r.year, effectiveDate: eff, amount });
  }
  out.sort((a, b) => a.effectiveDate.getTime() - b.effectiveDate.getTime());
  return out;
}

/**
 * Mês civil (1–12) em que o ajuste do valor anual passa a valer na linha.
 * `null` quando a data efetiva é posterior ao ano da linha (linha ignorada).
 */
function annualAdjustmentEffectiveCivilMonth(civilYear: number, effectiveDate: Date): number | null {
  const effY = effectiveDate.getFullYear();
  const effM = effectiveDate.getMonth() + 1;
  if (effY > civilYear) return null;
  if (effY === civilYear) return effM;
  return 1;
}

/** Soma das metas contratuais (sem ajuste anual) nos meses civis [monthStart, monthEnd] em vigência. */
function sumGlobalMetaAllocatedInMonthRange(
  globalMap: Map<string, number>,
  civilYear: number,
  monthStart: number,
  monthEnd: number,
  contractStart: Date,
  contractEnd: Date
): number {
  let sum = 0;
  for (let m = monthStart; m <= monthEnd; m++) {
    if (!calendarMonthHasMetaMensalInVigencia(civilYear, m, contractStart, contractEnd)) continue;
    sum += globalMap.get(toYearMonthKey(civilYear, m)) ?? 0;
  }
  return sum;
}

/**
 * Monta a meta mensal por mês da vigência.
 * Regra: no início a meta é saldo ÷ meses restantes; quando chega um aditivo em um mês,
 * soma/subtrai no saldo e recalcula para aquele mês em diante até o fim da vigência.
 */
function buildContractMetaSchedule(
  contractStart: Date,
  contractEnd: Date,
  initialTotal: number,
  addenda: Array<{ effectiveDate: Date; amount: number }>
): Map<string, number> {
  const months = listVigenciaMonthKeys(contractStart, contractEnd);
  const schedule = new Map<string, number>();
  if (!months.length) return schedule;

  const addSumByMonth = new Map<string, number>();
  for (const a of addenda) {
    const y = a.effectiveDate.getFullYear();
    const m = a.effectiveDate.getMonth() + 1;
    const k = toYearMonthKey(y, m);
    addSumByMonth.set(k, (addSumByMonth.get(k) || 0) + a.amount);
  }

  let remaining = initialTotal;
  const firstKey = months[0].key;
  addSumByMonth.forEach((v, k) => {
    if (k < firstKey) remaining += v;
  });

  let i = 0;
  while (i < months.length) {
    const curKey = months[i].key;
    remaining += addSumByMonth.get(curKey) || 0;

    let j = i + 1;
    while (j < months.length) {
      if ((addSumByMonth.get(months[j].key) || 0) !== 0) break;
      j += 1;
    }
    // Meta recalculada pelo saldo dividido por TODOS os meses restantes até o fim da vigência.
    // Ela permanece fixa até aparecer um novo aditivo (quando recalcula novamente).
    const remainingMonthsToEnd = months.length - i;
    const meta = remainingMonthsToEnd > 0 ? remaining / remainingMonthsToEnd : 0;
    for (let k = i; k < j; k++) {
      schedule.set(months[k].key, meta);
      remaining -= meta;
    }
    i = j;
  }
  return schedule;
}

function formatDate(dateStr: string) {
  const d = parseDateSafe(dateStr);
  if (!d) return '-';
  return d.toLocaleDateString('pt-BR', { timeZone: TIMEZONE_BRASILIA });
}

function toInputDate(dateStr: string | Date): string {
  if (typeof dateStr === 'string') {
    const t = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      return t;
    }
  }
  const d = parseDateSafe(dateStr) || new Date();
  const parts = getCalendarPartsBrasilia(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (y && m && day) {
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function signedGastosValueClassName(value: number): string {
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-violet-800 dark:text-violet-300';
}

/** Anos civis com pelo menos um mês de vigência (alinhado à tabela Acumulado Anual). */
function buildContractAvailableYears(startDate: string, endDate: string): number[] {
  const start = parseDateSafe(startDate);
  const end = parseDateSafe(endDate);
  const years = new Set<number>();

  if (start && end) {
    for (const { y } of listVigenciaMonthKeys(start, end)) {
      years.add(y);
    }
  }

  const yStart = getDateYear(startDate);
  const yEnd = getDateYear(endDate);
  if (yStart != null && yEnd != null) {
    for (let y = Math.min(yStart, yEnd); y <= Math.max(yStart, yEnd); y++) {
      years.add(y);
    }
  }

  if (years.size === 0) {
    years.add(yStart ?? yEnd ?? new Date().getFullYear());
  }

  return Array.from(years).sort((a, b) => a - b);
}

function getValorAnualBaseDoAno(
  valuePlusAddenda: number,
  startDate: string,
  endDate: string,
  year: number
): number | null {
  const start = parseDateSafe(startDate);
  const end = parseDateSafe(endDate);
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  const months = listVigenciaMonthKeys(start, end);
  if (!months.length) return null;
  const monthsInYear = months.filter((m) => m.y === year).length;
  if (monthsInYear <= 0) return 0;
  return (valuePlusAddenda / months.length) * monthsInYear;
}

function parseCurrencyInput(value: string): number {
  if (!value || typeof value !== 'string') return 0;
  const cleaned = value.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function isNetValueMissing(b: ContractBilling): boolean {
  const net = Number(b.netValue || 0);
  if (net === 0) return true;
  const gross = Number(b.grossValue || 0);
  if (net !== gross) return false;
  if (!b.createdAt || !b.updatedAt) return true;
  return new Date(b.updatedAt).getTime() === new Date(b.createdAt).getTime();
}

function getPleitoBillableTotal(p: ContractPleito): number {
  const br = p.billingRequest != null ? Number(p.billingRequest) : 0;
  if (Number.isFinite(br) && br > 0) return br;
  return parseBudgetToNumberSafe(p.budget);
}

function getPleitoBilledAmount(p: ContractPleito, billings: ContractBilling[]): number {
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

function getPleitoRemainingBalance(p: ContractPleito, billings: ContractBilling[]): number {
  const total = getPleitoBillableTotal(p);
  if (total <= 0) return 0;
  return Math.max(0, total - getPleitoBilledAmount(p, billings));
}

function isPleitoAptoParaFaturamento(p: ContractPleito, billings: ContractBilling[]): boolean {
  const total = getPleitoBillableTotal(p);
  if (total <= 0) return false;
  return getPleitoRemainingBalance(p, billings) > 0.01;
}

function formatPleitoBillingOptionLabel(p: ContractPleito, billings: ContractBilling[]): string {
  const saldo = getPleitoRemainingBalance(p, billings);
  const desc = (p.serviceDescription || '').trim();
  const shortDesc = desc.length > 40 ? `${desc.slice(0, 40)}…` : desc;
  const pasta = p.folderNumber ? ` · Pasta ${p.folderNumber}` : '';
  return `${formatOsSePasta(p.divSe || '-', p.folderNumber)}${pasta}${shortDesc ? ` — ${shortDesc}` : ''} (saldo ${formatCurrency(saldo)})`;
}

function parseBudgetToNumberSafe(v: string | null | undefined): number {
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

function divSeOptionsToSelectOptions(options: DivSeOptionRow[]) {
  return labeledToSelectOptions(
    options.map((opt) => ({
      value: opt.divSe,
      label: formatOsSePasta(opt.divSe, opt.folderNumber),
    }))
  );
}

function formatCurrencyInput(value: number): string {
  if (value === 0) return '';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type PleitoGerarBuildResult =
  | { ok: true; items: { id: string; billingRequest: number }[] }
  | { ok: false; message: string };

function formatPctFromNumber(pct: number): string {
  if (pct <= 0) return '';
  return pct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getPleitoGerarValorFromDraft(
  id: string,
  pleitos: ContractPleito[],
  pctById: Record<string, string>,
  valorById: Record<string, string>
): number {
  const p = pleitos.find((x) => x.id === id);
  if (!p) return 0;
  const orcamento = p.budget ? Number(p.budget) : 0;
  const valorDirect = parseCurrencyInput(valorById[id] || '');
  if (valorDirect > 0) return valorDirect;
  const pct = parseCurrencyInput(pctById[id] || '');
  if (orcamento > 0 && pct > 0) return (orcamento * pct) / 100;
  return 0;
}

function getBatchPleitoValorSameOs(
  id: string,
  selectedIds: string[],
  pleitos: ContractPleito[],
  pctById: Record<string, string>,
  valorById: Record<string, string>
): number {
  const current = pleitos.find((x) => x.id === id);
  const osKey = (current?.divSe || '').trim().toLowerCase();
  if (!osKey) return 0;
  return selectedIds.reduce((sum, otherId) => {
    if (otherId === id) return sum;
    const p = pleitos.find((x) => x.id === otherId);
    if (!p || (p.divSe || '').trim().toLowerCase() !== osKey) return sum;
    return sum + getPleitoGerarValorFromDraft(otherId, pleitos, pctById, valorById);
  }, 0);
}

function getMaxPleitoValorForOs(
  id: string,
  pleitos: ContractPleito[],
  allPleitos: ContractPleito[],
  selectedIds: string[],
  pctById: Record<string, string>,
  valorById: Record<string, string>
): number {
  const p = pleitos.find((x) => x.id === id);
  if (!p) return 0;
  const orcamento = p.budget ? Number(p.budget) : 0;
  if (orcamento <= 0) return 0;
  const alreadyPleiteado = sumOsPleiteadoTotal(allPleitos, p.divSe);
  const batchOther = getBatchPleitoValorSameOs(id, selectedIds, pleitos, pctById, valorById);
  return Math.max(0, orcamento - alreadyPleiteado - batchOther);
}

function clampPleitoDraftToMax(valor: number, maxValor: number): number {
  if (valor <= 0 || maxValor <= 0) return 0;
  return Math.min(valor, maxValor);
}

function pleitoDraftFromValor(valor: number, orc: number, maxValor: number): { pct: string; valor: string } {
  const clamped = clampPleitoDraftToMax(valor, maxValor);
  const pct = orc > 0 && clamped > 0 ? (clamped / orc) * 100 : 0;
  return {
    pct: formatPctFromNumber(pct),
    valor: clamped > 0 ? formatCurrencyInput(clamped) : '',
  };
}

function pleitoDraftFromPct(pct: number, orc: number, maxValor: number): { pct: string; valor: string } {
  const rawValor = orc > 0 && pct > 0 ? (orc * pct) / 100 : 0;
  return pleitoDraftFromValor(rawValor, orc, maxValor);
}

/** Monta payload para gerar pleito: valor do pleito por OS (via % ou valor em R$). */
function buildPleitoGerarItems(
  ids: string[],
  pleitos: ContractPleito[],
  allPleitos: ContractPleito[],
  getValorForId: (id: string) => number
): PleitoGerarBuildResult {
  const pendingByOs = new Map<string, number>();
  const items: { id: string; billingRequest: number }[] = [];
  for (const id of ids) {
    const p = pleitos.find((x) => x.id === id);
    if (!p) {
      return { ok: false, message: `A OS ${id} não foi encontrada para cálculo do pleito.` };
    }
    const orcamento = p.budget ? Number(p.budget) : 0;
    if (orcamento <= 0) {
      return { ok: false, message: `A OS ${p.divSe || id} está sem orçamento para cálculo do pleito.` };
    }
    const valorCalculado = getValorForId(id);
    if (valorCalculado <= 0) {
      return { ok: false, message: `Informe a % ou o valor do pleito para a OS ${p.divSe || id}` };
    }
    const osKey = (p.divSe || '').trim().toLowerCase();
    const alreadyPleiteado = sumOsPleiteadoTotal(allPleitos, p.divSe);
    const batchPending = pendingByOs.get(osKey) || 0;
    if (alreadyPleiteado + batchPending + valorCalculado > orcamento + 0.01) {
      return { ok: false, message: 'valor faturado acima do permitido' };
    }
    pendingByOs.set(osKey, batchPending + valorCalculado);
    items.push({ id, billingRequest: valorCalculado });
  }
  return { ok: true, items };
}

function isPleitoHistorico(p: ContractPleito): boolean {
  const marker = (p.reportsBilling || '').trim();
  return marker === PLEITO_HISTORY_MARKER || marker.startsWith(PLEITO_HISTORY_MARKER);
}

function totvsQueryTransportErrorMessage(err: unknown): string {
  const ax = err as AxiosError<{ message?: string }>;
  if (ax?.code === 'ECONNABORTED') {
    return 'Tempo esgotado ao consultar o RM. O relatório pode demorar vários minutos — tente de novo ou verifique o backend.';
  }
  const fromBody =
    ax?.response?.data &&
    typeof ax.response.data === 'object' &&
    'message' in ax.response.data &&
    typeof (ax.response.data as { message?: string }).message === 'string'
      ? (ax.response.data as { message: string }).message
      : null;
  return fromBody || ax?.message || 'Falha de rede ou servidor ao consultar o RM.';
}

export default function ContractDetailPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const {
    isAdministrator,
    isElevatedUser,
    can,
    canAction,
    permissions,
    canAccessContract,
    canAccessContractOrcamentoTab,
    canAccessContractRelatoriosTab,
    canAccessContractOrdemServicoTab,
    canAccessContractProducaoSemanalTab
  } = usePermissions();
  const idParam = params?.id;
  const contractId =
    typeof idParam === 'string' ? idParam : Array.isArray(idParam) ? idParam[0] ?? '' : '';
  const canAccessOrcamento = canAccessContractOrcamentoTab(contractId);
  const canAccessRelatorios = canAccessContractRelatoriosTab(contractId);
  const canAccessReunioes = true;
  const canAccessOrdemServicoModulo = canAccessContractOrdemServicoTab(contractId);
  const canAccessProducaoSemanalModulo = canAccessContractProducaoSemanalTab(contractId);
  // Liberado na aba Contratos = pode cadastrar/editar neste contrato (sem exigir coluna Criar da aba Acesso)
  const hasThisContractAccess = isElevatedUser || canAccessContract(contractId);
  const canCreateContrato =
    isElevatedUser || permissions.canCreateContracts || hasThisContractAccess;
  const canEditContrato =
    isElevatedUser || permissions.canEditContracts || hasThisContractAccess;
  const canDeleteContrato = isElevatedUser || permissions.canDeleteContracts;

  const containerRef = useRef<HTMLDivElement | null>(null);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(0); // 0 = todos
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [showPleitoModal, setShowPleitoModal] = useState(false);
  const [showProductionModal, setShowProductionModal] = useState(false);
  const [billingForm, setBillingForm] = useState({
    issueDate: '',
    invoiceNumber: '',
    serviceOrder: '',
    pleitoId: '',
    grossValue: '',
    netValue: ''
  });
  const [selectedBilling, setSelectedBilling] = useState<ContractBilling | null>(null);
  const [editingBilling, setEditingBilling] = useState(false);
  const [filterBillingOsSe, setFilterBillingOsSe] = useState('');
  const [filterBillingInvoice, setFilterBillingInvoice] = useState('');
  const [filterBillingGross, setFilterBillingGross] = useState('');
  const [billingEditForm, setBillingEditForm] = useState({
    issueDate: '',
    invoiceNumber: '',
    serviceOrder: '',
    grossValue: '',
    netValue: ''
  });
  const [selectedPleitoId, setSelectedPleitoId] = useState<string | null>(null);
  const [pleitoToEdit, setPleitoToEdit] = useState<(PleitoFormData & { id: string }) | null>(null);
  const [filterOsStatus, setFilterOsStatus] = useState('');
  const [filterOsStatusFat, setFilterOsStatusFat] = useState('');
  const [searchTermPleitos, setSearchTermPleitos] = useState('');
  const [showPleitosFilterModal, setShowPleitosFilterModal] = useState(false);
  const [showOsExportModal, setShowOsExportModal] = useState(false);
  const [exportingOsPdf, setExportingOsPdf] = useState(false);
  const [searchTermProduction, setSearchTermProduction] = useState('');
  const [showProductionFilterModal, setShowProductionFilterModal] = useState(false);
  const [filterProductionOsSe, setFilterProductionOsSe] = useState('');
  const [filterProductionResponsible, setFilterProductionResponsible] = useState('');
  const [searchTermBillings, setSearchTermBillings] = useState('');
  const [showBillingFilterModal, setShowBillingFilterModal] = useState(false);
  const [pleitosListPage, setPleitosListPage] = useState(1);
  const [productionListPage, setProductionListPage] = useState(1);
  const [billingsListPage, setBillingsListPage] = useState(1);
  const [selectedForPleito, setSelectedForPleito] = useState<Set<string>>(new Set());
  const [selectedForBilling, setSelectedForBilling] = useState<Set<string>>(new Set());
  const [osSelectionMenu, setOsSelectionMenu] = useState<RowActionMenuState>(null);
  const [billingSelectionMenu, setBillingSelectionMenu] = useState<RowActionMenuState>(null);
  const [valorPleiteado, setValorPleiteado] = useState<Record<string, string>>({});
  const [pleitoValorInput, setPleitoValorInput] = useState<Record<string, string>>({});
  const [showPleitoValoresModal, setShowPleitoValoresModal] = useState(false);
  const [showPleitoResumoModal, setShowPleitoResumoModal] = useState(false);
  const [showVisualizarPleitoModal, setShowVisualizarPleitoModal] = useState(false);
  const [showAndamentoTodosModal, setShowAndamentoTodosModal] = useState(false);
  const [showCronogramaMensalModal, setShowCronogramaMensalModal] = useState(false);
  const [showFaturamentoTodosModal, setShowFaturamentoTodosModal] = useState(false);
  const [pleitoGeradoData, setPleitoGeradoData] = useState<Array<{ pleito: ContractPleito; valorPleiteado: number; pctOrcamento: number }>>([]);
  const [productionForm, setProductionForm] = useState({ fillingDate: '', divSe: '', weeklyProductionValue: '', responsiblePerson: '' });
  const [selectedProduction, setSelectedProduction] = useState<ContractWeeklyProduction | null>(null);
  const [editingProduction, setEditingProduction] = useState(false);
  const [productionEditForm, setProductionEditForm] = useState({ fillingDate: '', divSe: '', weeklyProductionValue: '', responsiblePerson: '' });
  const [showValorAnualAdjustModal, setShowValorAnualAdjustModal] = useState(false);
  const [adjFormYear, setAdjFormYear] = useState(currentYear);
  const [adjFormDeltaStr, setAdjFormDeltaStr] = useState('');
  const [adjFormDate, setAdjFormDate] = useState('');
  const [showAddendumModal, setShowAddendumModal] = useState(false);
  const [showPaidNaturezaModal, setShowPaidNaturezaModal] = useState(false);
  const [naturezaModalMesIdx, setNaturezaModalMesIdx] = useState<number | null>(null);
  const [expandedNaturezaKey, setExpandedNaturezaKey] = useState<string | null>(null);
  const [gastosResumoModal, setGastosResumoModal] = useState<
    { kind: 'month'; mesIdx: number } | { kind: 'year'; year: number } | null
  >(null);

  const openPaidNaturezaModal = (mesIdx: number | null) => {
    setNaturezaModalMesIdx(mesIdx);
    setExpandedNaturezaKey(null);
    setShowPaidNaturezaModal(true);
  };
  const [addendumDate, setAddendumDate] = useState('');
  const [addendumAmount, setAddendumAmount] = useState('');
  const [addendumNote, setAddendumNote] = useState('');

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: contractData, isLoading: loadingContract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}`);
      return res.data;
    },
    enabled: !!contractId
  });

  type TotvsRmPaidLineDetail = {
    valor: number;
    natureza: string;
    dataISO: string | null;
  };

  type TotvsTotalPagoApi = {
    success: boolean;
    message?: string;
    data: {
      configured: boolean;
      total: number | null;
      matchedRowCount?: number;
      totalRowCount?: number;
      ccColumn?: string | null;
      valueColumn?: string | null;
      naturezaColumn?: string | null;
      dateColumn?: string | null;
      totalsByNatureza?: { natureza: string; total: number; count: number }[];
      sampleCcValuesMatched?: string[];
      /** Total pago (exclui naturezas operacionais). */
      paidByCalendarMonth?: {
        year: number;
        month: number;
        total: number;
        count: number;
        lines: TotvsRmPaidLineDetail[];
      }[];
      paidUndated?: { total: number; count: number; lines: TotvsRmPaidLineDetail[] } | null;
      /** Linha «Solicitações»: soma por mês (CC + data de pagamento + valor), mesmas exclusões de natureza do Total Pago. */
      solicitacoesByCalendarMonth?: {
        year: number;
        month: number;
        total: number;
        count: number;
        lines: TotvsRmPaidLineDetail[];
      }[];
      solicitacoesUndated?: { total: number; count: number; lines: TotvsRmPaidLineDetail[] } | null;
      solicitacoesMatchedRowCount?: number;
      solicitacoesDateColumn?: string | null;
      solicitacoesValueColumn?: string | null;
      solicitacoesCcColumn?: string | null;
      message?: string;
      costCenterCode?: string;
      costCenterName?: string;
    };
  };

  const {
    data: totvsTotalPagoRes,
    isPending: totvsTotalPagoPending,
    isLoading: totvsTotalPagoLoading,
    isFetching: totvsTotalPagoFetching,
    isError: totvsTotalPagoIsError,
    error: totvsTotalPagoError
  } = useQuery({
    queryKey: ['contract-totvs-total-pago', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/totvs-total-pago`, { timeout: 180000 });
      return res.data as TotvsTotalPagoApi;
    },
    enabled: !!contractId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    retry: false
  });

  type GastosOperacionaisModuleApi = {
    success: boolean;
    message?: string;
    data: {
      configured: boolean;
      detailRows?: QueryGastosDetailRow[];
      naturezaDetailRows?: QueryGastosNaturezaDetailRow[];
      fetchedAt?: string;
      message?: string;
    };
  };

  const {
    data: gastosOperacionaisModuleData,
    isLoading: gastosOperacionaisModuleLoading,
    isFetching: gastosOperacionaisModuleFetching,
    isError: gastosOperacionaisModuleIsError
  } = useQuery({
    queryKey: ['gastos-operacionais-module-totvs-v34-adiantamento-predial'],
    queryFn: async () => {
      const res = await api.get<GastosOperacionaisModuleApi>('/contracts/gastos-operacionais', {
        timeout: 180_000
      });
      const payload = res.data;
      const detailRows = (payload.data?.detailRows ?? []).map((row) => {
        const contractLabel = normalizeGastosOperacionaisContractName(row.contract);
        const polo = resolveGastosPoloFromContractName(contractLabel, row.polo);
        return { ...row, contract: contractLabel, polo };
      });
      const naturezaDetailRows = (payload.data?.naturezaDetailRows ?? []).map((row) => ({
        ...row,
        contract: normalizeGastosOperacionaisContractName(row.contract)
      }));
      return {
        configured: payload.data?.configured ?? false,
        detailRows,
        naturezaDetailRows,
        fetchedAt: payload.data?.fetchedAt ?? new Date().toISOString(),
        message: payload.data?.message ?? payload.message
      };
    },
    enabled: !!contractId,
    staleTime: 5 * 60 * 1000,
    retry: 1
  });

  const gastosOperacionaisCarregando =
    gastosOperacionaisModuleLoading || gastosOperacionaisModuleFetching;

  /** RM ainda sem resposta definitiva (1ª carga ou refetch). */
  const totvsRmCarregando =
    totvsTotalPagoPending ||
    totvsTotalPagoLoading ||
    totvsTotalPagoFetching ||
    (totvsTotalPagoRes === undefined && !totvsTotalPagoIsError);

  const { data: billingsData, isLoading: loadingBillings } = useQuery({
    queryKey: ['contract-billings', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/billings`);
      return res.data;
    },
    enabled: !!contractId
  });

  const { data: pleitosData, isLoading: loadingPleitos } = useQuery({
    queryKey: ['contract-pleitos', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/pleitos`);
      return res.data;
    },
    enabled: !!contractId && canAccessOrdemServicoModulo
  });

  const { data: productionsData, isLoading: loadingProductions } = useQuery({
    queryKey: ['contract-weekly-productions', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/weekly-productions`);
      return res.data;
    },
    enabled: !!contractId && canAccessProducaoSemanalModulo
  });

  const { data: annualValuesResponse } = useQuery({
    queryKey: ['contract-annual-values', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/annual-values`);
      return res.data as {
        success: boolean;
        data: ContractAnnualValueRow[];
        computedBaseAnnualByYear?: Record<number, number>;
      };
    },
    enabled: !!contractId
  });
  const { data: addendaResponse } = useQuery({
    queryKey: ['contract-addenda', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/addenda`);
      return res.data as { success: boolean; data: ContractAddendumRow[] };
    },
    enabled: !!contractId
  });

  const { data: tetoOrcamentarioEntries = [], isLoading: loadingTetoOrcamentario } = useQuery({
    queryKey: ['controle-geral-teto-orcamentario'],
    queryFn: async () => {
      const res = await api.get<{
        success?: boolean;
        data?: ControleGeralTetoOrcamentarioEntry[];
      }>('/controle-geral/teto-orcamentario');
      return (res.data?.data ?? []) as ControleGeralTetoOrcamentarioEntry[];
    },
    enabled: !!contractId
  });

  const { data: pleitoDetailData, isLoading: loadingPleitoDetail } = useQuery({
    queryKey: ['pleito', selectedPleitoId],
    queryFn: async () => {
      const res = await api.get(`/pleitos/${selectedPleitoId}`);
      return res.data;
    },
    enabled: !!selectedPleitoId && canAccessOrdemServicoModulo
  });

  const createBillingMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await api.post(`/contracts/${contractId}/billings`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-billings', contractId] });
      queryClient.invalidateQueries({ queryKey: ['contract-pleitos', contractId] });
      setShowBillingModal(false);
      setBillingForm({ issueDate: '', invoiceNumber: '', serviceOrder: '', pleitoId: '', grossValue: '', netValue: '' });
      toast.success('Faturamento cadastrado com sucesso!');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao cadastrar faturamento');
    }
  });

  const updateBillingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await api.patch(`/contracts/${contractId}/billings/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-billings', contractId] });
      queryClient.invalidateQueries({ queryKey: ['contract-pleitos', contractId] });
      setEditingBilling(false);
      toast.success('Faturamento atualizado com sucesso!');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao atualizar faturamento');
    }
  });

  const deleteBillingMutation = useMutation({
    mutationFn: async (ids: string | string[]) => {
      const list = Array.isArray(ids) ? ids : [ids];
      await Promise.all(
        list.map((id) => api.delete(`/contracts/${contractId}/billings/${id}`))
      );
      return list;
    },
    onSuccess: (_data, ids) => {
      const list = Array.isArray(ids) ? ids : [ids];
      queryClient.invalidateQueries({ queryKey: ['contract-billings', contractId] });
      queryClient.invalidateQueries({ queryKey: ['contract-pleitos', contractId] });
      setSelectedBilling(null);
      setEditingBilling(false);
      setSelectedForBilling(new Set());
      setBillingSelectionMenu(null);
      toast.success(
        list.length === 1
          ? 'Faturamento excluído com sucesso!'
          : `${list.length} faturamentos excluídos com sucesso!`
      );
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao excluir faturamento');
    }
  });

  const createProductionMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await api.post(`/contracts/${contractId}/weekly-productions`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-weekly-productions', contractId] });
      setShowProductionModal(false);
      setProductionForm({ fillingDate: '', divSe: '', weeklyProductionValue: '', responsiblePerson: '' });
      toast.success('Produção semanal cadastrada com sucesso!');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao cadastrar produção');
    }
  });

  const updateProductionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const res = await api.patch(`/contracts/${contractId}/weekly-productions/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-weekly-productions', contractId] });
      setEditingProduction(false);
      toast.success('Produção semanal atualizada com sucesso!');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao atualizar produção');
    }
  });

  const deleteProductionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/contracts/${contractId}/weekly-productions/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-weekly-productions', contractId] });
      setSelectedProduction(null);
      setEditingProduction(false);
      toast.success('Produção semanal excluída com sucesso!');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao excluir produção');
    }
  });

  const saveAnnualAdjustmentMutation = useMutation({
    mutationFn: async (payload: {
      year: number;
      budgetAdjustmentDelta: number;
      budgetAdjustmentEffectiveDate: string;
    }) => {
      const res = await api.put(`/contracts/${contractId}/annual-values/${payload.year}`, {
        budgetAdjustmentDelta: payload.budgetAdjustmentDelta,
        budgetAdjustmentEffectiveDate: payload.budgetAdjustmentEffectiveDate
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-annual-values', contractId] });
      setShowValorAnualAdjustModal(false);
      toast.success('Ajuste de valor anual salvo');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao salvar ajuste');
    }
  });

  const clearAnnualAdjustmentMutation = useMutation({
    mutationFn: async (year: number) => {
      const res = await api.put(`/contracts/${contractId}/annual-values/${year}`, {
        budgetAdjustmentDelta: 0,
        budgetAdjustmentEffectiveDate: null
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-annual-values', contractId] });
      setShowValorAnualAdjustModal(false);
      toast.success('Ajuste removido');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao remover ajuste');
    }
  });
  const createAddendumMutation = useMutation({
    mutationFn: async (payload: { effectiveDate: string; amount: number; note?: string | null }) => {
      const res = await api.post(`/contracts/${contractId}/addenda`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-addenda', contractId] });
      setShowAddendumModal(false);
      setAddendumDate('');
      setAddendumAmount('');
      setAddendumNote('');
      toast.success('Aditivo cadastrado com sucesso');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao cadastrar aditivo');
    }
  });
  const deleteAddendumMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/contracts/${contractId}/addenda/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-addenda', contractId] });
      toast.success('Aditivo removido');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao remover aditivo');
    }
  });

  const contract = contractData?.data as Contract | undefined;

  useDocumentTitle(contract?.name ? `Contratos - ${contract.name}` : null);

  const { data: orcamentosListaData, isLoading: loadingOrcamentosCount } = useQuery({
    queryKey: ['contract-orcamentos-count', contract?.costCenterId],
    queryFn: async () => {
      const res = await api.get(`/orcamento/${contract!.costCenterId}`);
      return res.data as { orcamentos?: { id: string }[] };
    },
    enabled: !!contract?.costCenterId && canAccessOrcamento,
  });

  const { data: relatoriosListaData, isLoading: loadingRelatoriosCount } = useQuery({
    queryKey: ['relatorios-fotograficos', contractId],
    queryFn: async () => (await api.get(`/relatorios-fotograficos/${contractId}`)).data,
    enabled: !!contractId && canAccessRelatorios,
  });

  const { data: reunioesListaData, isLoading: loadingReunioesCount } = useQuery({
    queryKey: ['reunioes', contractId],
    queryFn: async () => (await api.get(`/reunioes/${contractId}`)).data,
    enabled: !!contractId && canAccessReunioes,
  });

  const orcamentosCount = Array.isArray(orcamentosListaData?.orcamentos)
    ? orcamentosListaData.orcamentos.length
    : 0;
  const relatoriosCount = Array.isArray(relatoriosListaData?.data)
    ? relatoriosListaData.data.length
    : 0;
  const reunioesCount = Array.isArray(reunioesListaData?.data)
    ? reunioesListaData.data.length
    : 0;


  const paidDisplay = useMemo(() => {
    const c = contract;
    if (!c) {
      return {
        total: 0,
        loading: true,
        totvsConfigured: false,
        totvsErrorMessage: null as string | null
      };
    }

    if (totvsTotalPagoIsError) {
      return {
        total: 0,
        loading: totvsRmCarregando,
        totvsConfigured: true,
        totvsErrorMessage: totvsQueryTransportErrorMessage(totvsTotalPagoError)
      };
    }

    if (totvsRmCarregando) {
      const t = totvsTotalPagoRes;
      const partialTotal =
        typeof t?.data?.total === 'number' && !Number.isNaN(t.data.total) ? t.data.total : 0;
      return {
        total: partialTotal,
        loading: true,
        totvsConfigured: Boolean(t?.data?.configured),
        totvsErrorMessage: null as string | null
      };
    }

    const t = totvsTotalPagoRes;
    const configured = Boolean(t?.data?.configured);
    const totvsCallFailed = configured && t?.success === false;
    const total =
      Boolean(t?.success) &&
      configured &&
      typeof t?.data?.total === 'number' &&
      !Number.isNaN(t.data.total)
        ? (t!.data!.total as number)
        : 0;

    return {
      total,
      loading: false,
      totvsConfigured: configured,
      totvsErrorMessage: totvsCallFailed ? t?.message || null : null
    };
  }, [contract, totvsTotalPagoRes, totvsRmCarregando, totvsTotalPagoIsError, totvsTotalPagoError]);

  const rmTotalsByNatureza = useMemo((): { natureza: string; total: number; count: number }[] => {
    const raw = totvsTotalPagoRes?.data?.totalsByNatureza;
    if (!Array.isArray(raw)) return [];
    const out: { natureza: string; total: number; count: number }[] = [];
    for (const x of raw) {
      if (!x || typeof x !== 'object') continue;
      const o = x as { natureza?: unknown; total?: unknown; count?: unknown };
      if (typeof o.natureza !== 'string' || typeof o.total !== 'number' || typeof o.count !== 'number') continue;
      out.push({ natureza: o.natureza, total: o.total, count: o.count });
    }
    return out;
  }, [totvsTotalPagoRes]);

  /** Total Pago no cabeçalho: soma apenas naturezas da allowlist (quando há detalhe por natureza). */
  const paidHeaderTotal = useMemo(() => {
    if (rmTotalsByNatureza.length) {
      return rmTotalsByNatureza
        .filter((r) => isNaturezaIncludedInContractPaidTotal(r.natureza))
        .reduce((s, r) => s + r.total, 0);
    }
    return paidDisplay.total;
  }, [paidDisplay.total, rmTotalsByNatureza]);

  const naturezaModalRows = useMemo(
    () =>
      filterNaturezaRowsForPaidModalDisplay(rmTotalsByNatureza).sort((a, b) => b.total - a.total),
    [rmTotalsByNatureza]
  );

  type RmSolicitacaoLinha = TotvsRmPaidLineDetail & { competencia?: string };

  const { solicitacoesLinesByNaturezaKey, rmLinhasDetalheFonte } = useMemo(() => {
    const map = new Map<string, RmSolicitacaoLinha[]>();
    const d = totvsTotalPagoRes?.data;
    if (!d) {
      return { solicitacoesLinesByNaturezaKey: map, rmLinhasDetalheFonte: 'none' as const };
    }

    const push = (line: TotvsRmPaidLineDetail, competencia?: string) => {
      if (!isNaturezaIncludedInContractPaidTotal(line.natureza)) return;
      const key = normalizeNaturezaLabel(line.natureza);
      const list = map.get(key) ?? [];
      list.push({ ...line, competencia });
      map.set(key, list);
    };

    const collectSolicitacoes = () => {
      for (const bm of d.solicitacoesByCalendarMonth ?? []) {
        const competencia = `${String(bm.month).padStart(2, '0')}/${bm.year}`;
        for (const line of bm.lines ?? []) push(line, competencia);
      }
      for (const line of d.solicitacoesUndated?.lines ?? []) push(line, 'Sem data');
    };

    const collectPaid = () => {
      for (const bm of d.paidByCalendarMonth ?? []) {
        const competencia = `${String(bm.month).padStart(2, '0')}/${bm.year}`;
        for (const line of bm.lines ?? []) push(line, competencia);
      }
      for (const line of d.paidUndated?.lines ?? []) push(line, 'Sem data');
    };

    collectSolicitacoes();
    let fonte: 'solicitacoes' | 'paid' | 'none' = 'solicitacoes';
    let totalLinhas = 0;
    map.forEach((arr) => {
      totalLinhas += arr.length;
    });
    if (totalLinhas === 0) {
      map.clear();
      collectPaid();
      fonte = 'paid';
      totalLinhas = 0;
      map.forEach((arr) => {
        totalLinhas += arr.length;
      });
      if (totalLinhas === 0) fonte = 'none';
    }

    map.forEach((lines, key) => {
      lines.sort((a: RmSolicitacaoLinha, b: RmSolicitacaoLinha) => {
        const ta = a.dataISO ? new Date(`${a.dataISO}T12:00:00`).getTime() : 0;
        const tb = b.dataISO ? new Date(`${b.dataISO}T12:00:00`).getTime() : 0;
        return tb - ta;
      });
      map.set(key, lines);
    });

    return { solicitacoesLinesByNaturezaKey: map, rmLinhasDetalheFonte: fonte };
  }, [totvsTotalPagoRes]);

  const addenda = ((addendaResponse?.data || []) as ContractAddendumRow[])
    .slice()
    .sort((a, b) => {
      const da = parseDateSafe(a.effectiveDate)?.getTime() || 0;
      const db = parseDateSafe(b.effectiveDate)?.getTime() || 0;
      return da - db;
    });
  const totalAddenda = useMemo(
    () => addenda.reduce((sum, a) => sum + (Number(a.amount) || 0), 0),
    [addenda]
  );
  const valorMaisAditivosTotal = contract ? contract.valuePlusAddenda + totalAddenda : 0;
  const billings = (billingsData?.data || []) as ContractBilling[];
  const allPleitos = (pleitosData?.data || []) as ContractPleito[];
  const billingsForOs = billings as BillingForOsCheck[];
  const pleitos = useMemo(
    () => allPleitos.filter((p) => !isPleitoHistorico(p) && !isOsConcluida(p, billingsForOs)),
    [allPleitos, billingsForOs]
  );
  const productions = ((Array.isArray(productionsData) ? productionsData : (productionsData as { data?: ContractWeeklyProduction[] })?.data) || []) as ContractWeeklyProduction[];
  /** Somente OS / SE cadastradas neste contrato (não usar lista global de todos os contratos). */
  const divSeOptions = useMemo(
    () => enrichDivSeOptionsWithPleitos([], pleitos),
    [pleitos]
  );

  const divSeSelectOptions = useMemo(
    () => divSeOptionsToSelectOptions(divSeOptions),
    [divSeOptions]
  );

  const defaultProductionResponsiblePerson = useMemo(() => {
    return String(userData?.data?.name ?? '').trim();
  }, [userData]);

  const billablePleitos = useMemo(
    () =>
      allPleitos.filter(
        (p) =>
          (isPleitoHistorico(p) || (p.billingRequest != null && Number(p.billingRequest) > 0)) &&
          isPleitoAptoParaFaturamento(p, billings)
      ),
    [allPleitos, billings]
  );

  const pleitosForBillingForm = useMemo(() => {
    const os = billingForm.serviceOrder.trim();
    if (!os) return billablePleitos;
    return billablePleitos.filter((p) => (p.divSe || '').trim() === os);
  }, [billablePleitos, billingForm.serviceOrder]);

  const pleitosForBillingSelectOptions = useMemo(
    () =>
      labeledToSelectOptions(
        pleitosForBillingForm.map((p) => ({
          value: p.id,
          label: formatPleitoBillingOptionLabel(p, billings),
        }))
      ),
    [pleitosForBillingForm, billings]
  );

  const selectedBillingPleito = useMemo(
    () => billablePleitos.find((p) => p.id === billingForm.pleitoId) ?? allPleitos.find((p) => p.id === billingForm.pleitoId) ?? null,
    [billablePleitos, allPleitos, billingForm.pleitoId]
  );

  const selectedBillingPleitoSaldo = selectedBillingPleito
    ? getPleitoRemainingBalance(selectedBillingPleito, billings)
    : null;

  const availableYears = useMemo(() => {
    if (!contract) return [];
    return buildContractAvailableYears(contract.startDate, contract.endDate);
  }, [contract]);

  useEffect(() => {
    if (!contract || availableYears.length === 0) return;
    setSelectedYear((prev) => {
      if (prev === 0) return 0;
      if (availableYears.includes(prev)) return prev;
      if (availableYears.includes(currentYear)) return currentYear;
      return availableYears[0];
    });
  }, [contract?.id, availableYears, currentYear]);

  const headerYearSelectOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: '0', label: 'Todos' },
        ...availableYears.map((year) => ({ value: String(year), label: String(year) })),
      ]),
    [availableYears]
  );

  const adjYearSelectOptions = useMemo(
    () =>
      labeledToSelectOptions(
        availableYears.map((year) => ({ value: String(year), label: String(year) }))
      ),
    [availableYears]
  );

  /** Anos / meses de vigência (para labels e rateio proporcional). */
  const contractYearsCount = useMemo(
    () => (contract ? countContractYearsOfVigencia(contract.startDate, contract.endDate) : 0),
    [contract]
  );
  const contractVigenciaMonthCount = useMemo(() => {
    if (!contract) return 0;
    const start = parseDateSafe(contract.startDate);
    const end = parseDateSafe(contract.endDate);
    if (!start || !end) return 0;
    return listVigenciaMonthKeys(start, end).length;
  }, [contract]);

  const contractVigenciaDates = useMemo(() => {
    if (!contract) return null;
    const start = parseDateSafe(contract.startDate);
    const end = parseDateSafe(contract.endDate);
    if (!start || !end) return null;
    return { start, end };
  }, [contract]);

  // Ajustar ano selecionado se não estiver na lista (0 = todos os anos)
  const isAllYears = selectedYear === 0;
  const safeSelectedYear = isAllYears
    ? (availableYears[0] ?? currentYear)
    : availableYears.includes(selectedYear)
      ? selectedYear
      : availableYears[0] ?? currentYear;

  const contractMonthsInSelectedYear = useMemo(() => {
    if (!contractVigenciaDates) return 0;
    return countVigenciaMonthsInRange(
      safeSelectedYear,
      1,
      12,
      contractVigenciaDates.start,
      contractVigenciaDates.end
    );
  }, [contractVigenciaDates, safeSelectedYear]);

  /** Valor anual do ano selecionado: (valor + aditivos) ÷ meses totais × meses do ano. */
  const valorAnualBase = useMemo(() => {
    if (!contract) return null;
    return getValorAnualBaseDoAno(
      valorMaisAditivosTotal,
      contract.startDate,
      contract.endDate,
      safeSelectedYear
    );
  }, [contract, valorMaisAditivosTotal, safeSelectedYear]);

  const annualAdjustByYear = useMemo(() => {
    const rows = annualValuesResponse?.data;
    if (!rows?.length) return new Map<number, { delta: number; effectiveDate: Date }>();
    const m = new Map<number, { delta: number; effectiveDate: Date }>();
    for (const r of rows) {
      if (r.budgetAdjustmentDelta == null || r.budgetAdjustmentEffectiveDate == null) continue;
      const d = parseDateSafe(r.budgetAdjustmentEffectiveDate);
      if (!d) continue;
      m.set(r.year, { delta: Number(r.budgetAdjustmentDelta), effectiveDate: d });
    }
    return m;
  }, [annualValuesResponse]);

  const valorAnualAjustado = useMemo(() => {
    if (valorAnualBase === null) return null;
    const adj = annualAdjustByYear.get(safeSelectedYear);
    if (!adj) return valorAnualBase;
    return valorAnualBase + adj.delta;
  }, [valorAnualBase, annualAdjustByYear, safeSelectedYear]);

  // Produção Semanal filtrada por Mês/Ano selecionados
  const filteredProductions = useMemo(() => {
    return productions.filter((p) => {
      if (!p.fillingDate) return isAllYears && selectedMonth === 0;
      const d = parseDateSafe(p.fillingDate);
      if (!d) return isAllYears && selectedMonth === 0;

      if (!isAllYears && d.getFullYear() !== selectedYear) return false;
      if (selectedMonth !== 0 && d.getMonth() + 1 !== selectedMonth) return false;

      const osTerm = filterProductionOsSe.trim().toLowerCase();
      if (osTerm && !(p.divSe || '').toLowerCase().includes(osTerm)) return false;

      const respTerm = filterProductionResponsible.trim().toLowerCase();
      if (respTerm && !(p.responsiblePerson || '').toLowerCase().includes(respTerm)) return false;

      return productionMatchesSearchTerm(p, searchTermProduction);
    });
  }, [
    productions,
    isAllYears,
    selectedYear,
    selectedMonth,
    filterProductionOsSe,
    filterProductionResponsible,
    searchTermProduction,
  ]);

  /**
   * Meta base: Valor + Aditivos (saldo ÷ meses até o fim da vigência).
   * Ajuste Valor Anual: do mês efetivo até dezembro, redistribui
   * (soma das metas já planejadas nesses meses + delta) — não reinicia com valorAnualBase.
   */
  const contractAddendaForMeta = useMemo(() => parseContractAddendaForMeta(addenda), [addenda]);

  const globalMetaSchedule = useMemo(() => {
    if (!contractVigenciaDates || !contract) return new Map<string, number>();
    return buildContractMetaSchedule(
      contractVigenciaDates.start,
      contractVigenciaDates.end,
      contract.valuePlusAddenda,
      contractAddendaForMeta
    );
  }, [contractVigenciaDates, contract, contractAddendaForMeta]);

  const annualBudgetAdjustments = useMemo(
    () => parseAnnualBudgetAdjustments(annualValuesResponse?.data),
    [annualValuesResponse]
  );

  const metaSchedule = useMemo(() => {
    const out = new Map(globalMetaSchedule);
    if (!contractVigenciaDates || !contract) return out;

    const { start, end } = contractVigenciaDates;

    for (const r of annualBudgetAdjustments) {
      const effMonth = annualAdjustmentEffectiveCivilMonth(r.year, r.effectiveDate);
      if (effMonth === null) continue;

      const monthsAfter = countVigenciaMonthsInRange(r.year, effMonth, 12, start, end);
      if (monthsAfter <= 0) continue;

      const plannedRestOfYear = sumGlobalMetaAllocatedInMonthRange(
        globalMetaSchedule,
        r.year,
        effMonth,
        12,
        start,
        end
      );
      const pool = plannedRestOfYear + r.amount;
      const metaY = pool / monthsAfter;
      for (let m = effMonth; m <= 12; m++) {
        if (!calendarMonthHasMetaMensalInVigencia(r.year, m, start, end)) continue;
        out.set(toYearMonthKey(r.year, m), metaY);
      }
    }

    return out;
  }, [globalMetaSchedule, annualBudgetAdjustments, contractVigenciaDates, contract]);

  useEffect(() => {
    if (!showValorAnualAdjustModal) return;
    const rows = annualValuesResponse?.data ?? [];
    const row = rows.find((r) => r.year === adjFormYear);
    if (row?.budgetAdjustmentDelta != null && row.budgetAdjustmentEffectiveDate) {
      setAdjFormDeltaStr(formatAjusteValorInput(Number(row.budgetAdjustmentDelta)));
      setAdjFormDate(toInputDate(row.budgetAdjustmentEffectiveDate));
    } else {
      setAdjFormDeltaStr('');
      setAdjFormDate('');
    }
  }, [showValorAnualAdjustModal, adjFormYear, annualValuesResponse]);

  // Soma do faturamento por mês (valor bruto) no ano selecionado
  const faturamentoPorMes = useMemo(() => {
    const porMes: number[] = new Array(12).fill(0);
    const year = safeSelectedYear;
    billings.forEach((b) => {
      const d = parseDateSafe(b.issueDate);
      if (!d) return;
      if (d.getFullYear() === year) {
        const mes = d.getMonth(); // 0-11
        porMes[mes] += b.grossValue;
      }
    });
    return porMes;
  }, [billings, safeSelectedYear]);

  // Soma da produção semanal por mês no ano selecionado (por fillingDate)
  const producaoPorMes = useMemo(() => {
    const porMes: number[] = new Array(12).fill(0);
    const year = safeSelectedYear;
    productions.forEach((p) => {
      const d = parseDateSafe(p.fillingDate);
      if (!d) return;
      if (d.getFullYear() === year) {
        const mes = d.getMonth(); // 0-11
        porMes[mes] += p.weeklyProductionValue;
      }
    });
    return porMes;
  }, [productions, safeSelectedYear]);

  // Soma dos pleitos (billingRequest) por mês no ano selecionado
  const pleitosPorMes = useMemo(() => {
    const porMes: number[] = new Array(12).fill(0);
    const year = safeSelectedYear;
    allPleitos.forEach((p) => {
      const vp = p.billingRequest ?? 0;
      if (vp <= 0) return;
      const pYear = p.creationYear ?? getDateYear(p.startDate);
      if (pYear !== year) return;
      const monthNum = p.creationMonth ? parseInt(String(p.creationMonth).replace(/\D/g, '') || '0', 10) : null;
      const startMonth = getDateMonth(p.startDate);
      const mesIdx = monthNum != null && monthNum >= 1 && monthNum <= 12 ? monthNum - 1 : (startMonth ? startMonth - 1 : null);
      if (mesIdx != null && mesIdx >= 0 && mesIdx < 12) {
        porMes[mesIdx] += vp;
      }
    });
    return porMes;
  }, [allPleitos, safeSelectedYear]);

  // Soma do valor orçado por mês no ano selecionado
  const valorOrcadoPorMes = useMemo(() => {
    const porMes: number[] = new Array(12).fill(0);
    const year = safeSelectedYear;
    pleitos.forEach((p) => {
      if (!isBudgetStatusInValorOrcadoSum(p.budgetStatus)) return;
      // Regra solicitada: usar somente a coluna "ORÇAMENTO" da OS.
      const valorOrcado = parseBudgetToNumberSafe(p.budget);
      if (valorOrcado <= 0) return;
      const pYear = p.creationYear ?? getDateYear(p.startDate);
      if (pYear !== year) return;
      const monthNum = p.creationMonth ? parseInt(String(p.creationMonth).replace(/\D/g, '') || '0', 10) : null;
      const mesIdx =
        monthNum != null && monthNum >= 1 && monthNum <= 12
          ? monthNum - 1
          : (() => {
              const m = getDateMonth(p.startDate);
              return m ? m - 1 : null;
            })();
      if (mesIdx != null && mesIdx >= 0 && mesIdx < 12) {
        porMes[mesIdx] += valorOrcado;
      }
    });
    return porMes;
  }, [pleitos, safeSelectedYear]);

  // Pendente mensal = valor orçado mensal - faturamento mensal
  const pendenteFaturamentoPorMes = useMemo(
    () => valorOrcadoPorMes.map((v, i) => v - (faturamentoPorMes[i] || 0)),
    [valorOrcadoPorMes, faturamentoPorMes]
  );

  /** Produção − Faturamento (controle mensal). */
  const prodMenosFatPorMes = useMemo(
    () => producaoPorMes.map((prod, i) => prod - (faturamentoPorMes[i] || 0)),
    [producaoPorMes, faturamentoPorMes]
  );

  /** Faturamento (bruto) por mês civil em todo o contrato, chave ano-mês. */
  const faturamentoPorYmKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of billings) {
      const d = parseDateSafe(b.issueDate);
      if (!d) continue;
      const k = toYearMonthKey(d.getFullYear(), d.getMonth() + 1);
      m.set(k, (m.get(k) || 0) + b.grossValue);
    }
    return m;
  }, [billings]);

  const vigenciaMonthList = useMemo(() => {
    if (!contractVigenciaDates) return [] as VigenciaMonth[];
    return listVigenciaMonthKeys(contractVigenciaDates.start, contractVigenciaDates.end);
  }, [contractVigenciaDates]);

  /**
   * Meta real: saldo contratual pendente ÷ meses restantes da vigência (aditivos + faturamento).
   * Ajuste anual: só do mês efetivo até dezembro — pool = metas planejadas restantes do ano + delta
   * (mesmo da Meta Ideal), reduzindo com o faturamento; não reinicia com valorAnualBase.
   */
  const metaRealByScheduleKey = useMemo(() => {
    const out = new Map<string, number>();
    if (!vigenciaMonthList.length || !contract) return out;

    const addSumByMonth = new Map<string, number>();
    for (const a of contractAddendaForMeta) {
      const y = a.effectiveDate.getFullYear();
      const m = a.effectiveDate.getMonth() + 1;
      const k = toYearMonthKey(y, m);
      addSumByMonth.set(k, (addSumByMonth.get(k) || 0) + a.amount);
    }

    const firstKey = vigenciaMonthList[0].key;
    let remaining = Number(contract.valuePlusAddenda) || 0;
    addSumByMonth.forEach((v, k) => {
      if (k < firstKey) remaining += v;
    });

    const n = vigenciaMonthList.length;
    for (let i = 0; i < n; i++) {
      const { key } = vigenciaMonthList[i];
      remaining += addSumByMonth.get(key) || 0;

      const monthsLeft = n - i;
      out.set(key, monthsLeft > 0 ? Math.max(0, remaining) / monthsLeft : 0);

      remaining -= faturamentoPorYmKey.get(key) || 0;
    }

    if (contractVigenciaDates && annualBudgetAdjustments.length > 0) {
      const { start, end } = contractVigenciaDates;
      for (const r of annualBudgetAdjustments) {
        const effMonth = annualAdjustmentEffectiveCivilMonth(r.year, r.effectiveDate);
        if (effMonth === null) continue;

        const monthsAtStart = countVigenciaMonthsInRange(r.year, effMonth, 12, start, end);
        if (monthsAtStart <= 0) continue;

        let annualRemaining =
          sumGlobalMetaAllocatedInMonthRange(
            globalMetaSchedule,
            r.year,
            effMonth,
            12,
            start,
            end
          ) + r.amount;

        for (let m = effMonth; m <= 12; m++) {
          if (!calendarMonthHasMetaMensalInVigencia(r.year, m, start, end)) continue;
          const monthsAfter = countVigenciaMonthsInRange(r.year, m, 12, start, end);
          if (monthsAfter <= 0) continue;
          out.set(toYearMonthKey(r.year, m), Math.max(0, annualRemaining) / monthsAfter);
          annualRemaining -= faturamentoPorYmKey.get(toYearMonthKey(r.year, m)) || 0;
        }
      }
    }

    return out;
  }, [
    vigenciaMonthList,
    contract,
    contractAddendaForMeta,
    annualBudgetAdjustments,
    faturamentoPorYmKey,
    contractVigenciaDates,
    globalMetaSchedule,
  ]);

  const metaRealPorMes = useMemo(() => {
    const year = safeSelectedYear;
    const result: (number | null)[] = new Array(12).fill(null);
    for (let i = 0; i < 12; i++) {
      const key = toYearMonthKey(year, i + 1);
      if ((metaSchedule.get(key) ?? null) === null) continue;
      result[i] = metaRealByScheduleKey.get(key) ?? (metaSchedule.get(key) ?? 0);
    }
    return result;
  }, [safeSelectedYear, metaSchedule, metaRealByScheduleKey]);

  /**
   * Controle Geral — linha Solicitações: TOTVS RM — `solicitacoesByCalendarMonth` (CC + data de pagamento + valor; exclui as mesmas naturezas operacionais que o Total Pago)
   * com fallback ao `paidByCalendarMonth` em APIs antigas.
   */
  const solicitacoesRateioPorMes = useMemo((): (number | null)[] => {
    const valores: (number | null)[] = new Array(12).fill(null);
    const year = safeSelectedYear;

    const emVigencia = (mesIdx: number) =>
      (metaSchedule.get(toYearMonthKey(year, mesIdx + 1)) ?? null) !== null;

    const mesesVigenciaIdx: number[] = [];
    for (let i = 0; i < 12; i++) {
      if (emVigencia(i)) mesesVigenciaIdx.push(i);
    }
    const nVm = mesesVigenciaIdx.length;

    const t = totvsTotalPagoRes;
    const api = t?.data;
    const rmOk = t?.success !== false && Boolean(api?.configured) && nVm > 0;

    if (!rmOk || !api) {
      return valores;
    }

    const useSolicitacoesApi =
      api.solicitacoesCcColumn != null &&
      api.solicitacoesValueColumn != null &&
      api.solicitacoesByCalendarMonth !== undefined;

    const paidByCalendarMonth = useSolicitacoesApi
      ? Array.isArray(api.solicitacoesByCalendarMonth)
        ? api.solicitacoesByCalendarMonth
        : []
      : Array.isArray(api.paidByCalendarMonth)
        ? api.paidByCalendarMonth
        : [];
    const paidUndated = useSolicitacoesApi
      ? api.solicitacoesUndated !== undefined
        ? api.solicitacoesUndated
        : null
      : api.paidUndated;

    const porMes = new Array(12).fill(0);

    for (const bm of paidByCalendarMonth) {
      const yBm = Number(bm.year);
      const moBm = Number(bm.month);
      if (!Number.isFinite(yBm) || !Number.isFinite(moBm) || yBm !== year || moBm < 1 || moBm > 12) {
        continue;
      }
      const mi = moBm - 1;

      const totalIncluidoBm =
        typeof bm.total === 'number' && !Number.isNaN(bm.total)
          ? bm.total
          : (bm.lines ?? []).reduce(
              (s, line) =>
                isNaturezaIncludedInContractPaidTotal(line.natureza)
                  ? s + (Number(line.valor) || 0)
                  : s,
              0
            );

      if (emVigencia(mi)) {
        porMes[mi] += totalIncluidoBm;
      } else if (nVm > 0 && totalIncluidoBm > 0) {
        const slice = totalIncluidoBm / nVm;
        for (const vmi of mesesVigenciaIdx) {
          porMes[vmi] += slice;
        }
      }
    }

    if (paidUndated && nVm > 0) {
      const undatedIncluido =
        typeof paidUndated.total === 'number' && !Number.isNaN(paidUndated.total)
          ? paidUndated.total
          : (paidUndated.lines ?? []).reduce(
              (s, line) =>
                isNaturezaIncludedInContractPaidTotal(line.natureza)
                  ? s + (Number(line.valor) || 0)
                  : s,
              0
            );
      if (undatedIncluido > 0) {
        const sliceTot = undatedIncluido / nVm;
        for (const vmi of mesesVigenciaIdx) {
          porMes[vmi] += sliceTot;
        }
      }
    }

    for (let i = 0; i < 12; i++) {
      if (emVigencia(i)) {
        valores[i] = porMes[i];
      }
    }
    return valores;
  }, [totvsTotalPagoRes, safeSelectedYear, metaSchedule]);

  const contractGastosNaturezaRows = useMemo(() => {
    if (!contract) return [];
    return filterGastosNaturezaDetailRowsForSystemContract(
      gastosOperacionaisModuleData?.naturezaDetailRows ?? [],
      {
        name: contract.name,
        costCenter: contract.costCenter
      }
    );
  }, [contract, gastosOperacionaisModuleData?.naturezaDetailRows]);

  const gastosOperacionaisPorMes = useMemo(
    () => aggregateGastosNaturezaMonthlyTotals(contractGastosNaturezaRows, safeSelectedYear),
    [contractGastosNaturezaRows, safeSelectedYear]
  );

  const gastosOperacionaisPorAno = useMemo(
    () => aggregateGastosNaturezaYearlyTotals(contractGastosNaturezaRows, availableYears),
    [contractGastosNaturezaRows, availableYears]
  );

  const tetoOrcamentarioLookup = useMemo(
    () => buildTetoOrcamentarioLookup(tetoOrcamentarioEntries),
    [tetoOrcamentarioEntries]
  );

  const tetoOrcamentarioLabels = useMemo(
    () => (contract ? tetoLabelsForSystemContract(contract) : []),
    [contract]
  );

  const tetoOrcamentarioPorMes = useMemo(
    () =>
      resolveMonthlyTetoOrcamentarioForLabels(
        tetoOrcamentarioLabels,
        tetoOrcamentarioLookup,
        safeSelectedYear
      ),
    [tetoOrcamentarioLabels, tetoOrcamentarioLookup, safeSelectedYear]
  );

  const tetoOrcamentarioPorAno = useMemo(
    () =>
      resolveYearlyTetoOrcamentarioForLabels(
        tetoOrcamentarioLabels,
        tetoOrcamentarioLookup,
        availableYears
      ),
    [tetoOrcamentarioLabels, tetoOrcamentarioLookup, availableYears]
  );

  const gastosOperacionaisTemDados = contractGastosNaturezaRows.length > 0;

  const gastosResumoModalNaturezaRows = useMemo(() => {
    if (!gastosResumoModal || !contract) return [];
    const period =
      gastosResumoModal.kind === 'month'
        ? gastosMonthPeriodBounds(safeSelectedYear, gastosResumoModal.mesIdx + 1)
        : gastosYearPeriodBounds(gastosResumoModal.year);
    return aggregateGastosNaturezaRows(
      contractGastosNaturezaRows,
      period.periodFrom,
      period.periodTo
    );
  }, [gastosResumoModal, contract, contractGastosNaturezaRows, safeSelectedYear]);

  const gastosResumoModalTitle = useMemo(() => {
    if (!gastosResumoModal || !contract) return 'Gastos';
    if (gastosResumoModal.kind === 'month') {
      const mes = MESES[gastosResumoModal.mesIdx] ?? '';
      return `Gastos — ${mes}/${String(safeSelectedYear).slice(-2)} · ${contract.name}`;
    }
    return `Gastos — ${gastosResumoModal.year} · ${contract.name}`;
  }, [gastosResumoModal, contract, safeSelectedYear]);

  const gastosDetalhePorMes = useMemo(() => {
    const linesPerMonth: RmPaidLineRow[][] = Array.from({ length: 12 }, () => []);
    const competenciaPerMonth: string[] = Array.from({ length: 12 }, () => '');
    const d = totvsTotalPagoRes?.data;
    const year = safeSelectedYear;

    if (d) {
      const useSolicitacoesApi =
        d.solicitacoesCcColumn != null &&
        d.solicitacoesValueColumn != null &&
        d.solicitacoesByCalendarMonth !== undefined;
      const buckets = useSolicitacoesApi
        ? d.solicitacoesByCalendarMonth ?? []
        : d.paidByCalendarMonth ?? [];

      for (const bm of buckets) {
        const yBm = Number(bm.year);
        const moBm = Number(bm.month);
        if (!Number.isFinite(yBm) || !Number.isFinite(moBm) || yBm !== year || moBm < 1 || moBm > 12) {
          continue;
        }
        const mi = moBm - 1;
        competenciaPerMonth[mi] = `${String(moBm).padStart(2, '0')}/${yBm}`;
        const linhas = bm.lines ?? [];
        if (linhas.length) {
          linesPerMonth[mi].push(...linhas);
        }
      }
    }

    const rowsByMonth: RmNaturezaAggRow[][] = [];
    const linesByMonth: Map<string, RmLinhaComCompetencia[]>[] = [];
    for (let mi = 0; mi < 12; mi++) {
      rowsByMonth.push(aggregateGastosNaturezaFromLines(linesPerMonth[mi]));
      linesByMonth.push(
        buildGastosLinesMapFromLines(linesPerMonth[mi], competenciaPerMonth[mi] || undefined)
      );
    }
    return { rowsByMonth, linesByMonth };
  }, [totvsTotalPagoRes, safeSelectedYear]);

  const naturezaModalRowsAtivos = useMemo(() => {
    if (naturezaModalMesIdx === null) return naturezaModalRows;
    return gastosDetalhePorMes.rowsByMonth[naturezaModalMesIdx] ?? [];
  }, [naturezaModalMesIdx, naturezaModalRows, gastosDetalhePorMes]);

  const solicitacoesLinesAtivos = useMemo(() => {
    if (naturezaModalMesIdx === null) return solicitacoesLinesByNaturezaKey;
    return gastosDetalhePorMes.linesByMonth[naturezaModalMesIdx] ?? new Map();
  }, [naturezaModalMesIdx, solicitacoesLinesByNaturezaKey, gastosDetalhePorMes]);

  const naturezaModalTotalAtivo = useMemo(() => {
    if (naturezaModalMesIdx === null) return paidHeaderTotal;
    const v = solicitacoesRateioPorMes[naturezaModalMesIdx];
    return v ?? 0;
  }, [naturezaModalMesIdx, paidHeaderTotal, solicitacoesRateioPorMes]);

  const naturezaModalTitulo = useMemo(() => {
    if (naturezaModalMesIdx === null) return 'Totais por natureza (RM)';
    const mesLabel = MESES_FILTRO[naturezaModalMesIdx + 1]?.label ?? MESES[naturezaModalMesIdx];
    return `Gastos — ${mesLabel} ${safeSelectedYear}`;
  }, [naturezaModalMesIdx, safeSelectedYear]);

  const solicitacoesControleTotvsPronto = useMemo(() => {
    const t = totvsTotalPagoRes;
    const api = t?.data;
    return t?.success !== false && Boolean(api?.configured);
  }, [totvsTotalPagoRes]);

  /** Há linhas RM usadas na linha «Solicitações» (agregação CC+data+valor) ou, em API antiga, matchedRowCount do total pago. */
  const solicitacoesRmTemLancamentosNoRelatorio = useMemo(() => {
    const d = totvsTotalPagoRes?.data;
    if (!d?.configured || totvsTotalPagoRes?.success === false) return false;
    const solMc = Number(d.solicitacoesMatchedRowCount);
    if (Number.isFinite(solMc) && solMc > 0) return true;
    const solUnd = Number(d.solicitacoesUndated?.total) || 0;
    if (solUnd > 0) return true;
    if (d.solicitacoesByCalendarMonth !== undefined) {
      const arr = Array.isArray(d.solicitacoesByCalendarMonth) ? d.solicitacoesByCalendarMonth : [];
      if (arr.some((x) => Number(x?.total) > 0)) return true;
    }
    const mc = Number(d.matchedRowCount) || 0;
    const und = Number(d.paidUndated?.total) || 0;
    return mc > 0 || und > 0;
  }, [totvsTotalPagoRes]);

  // Soma dos pleitos por ano (para Metas Anuais)
  const pleitosPorAno = useMemo(() => {
    const result: Record<number, number> = {};
    availableYears.forEach((year) => {
      result[year] = allPleitos
        .filter((p) => {
          const vp = p.billingRequest ?? 0;
          if (vp <= 0) return false;
          const pYear = p.creationYear ?? getDateYear(p.startDate);
          return pYear === year;
        })
        .reduce((acc, p) => acc + (p.billingRequest ?? 0), 0);
    });
    return result;
  }, [availableYears, allPleitos]);

  // Faturamento total do ano selecionado
  const faturamentoAnual = useMemo(() => {
    return faturamentoPorMes.reduce((acc, v) => acc + v, 0);
  }, [faturamentoPorMes]);

  // Faturamento total de todos os anos do contrato
  const faturamentoTotalTodosAnos = useMemo(() => {
    return billings.reduce((acc, b) => acc + b.grossValue, 0);
  }, [billings]);

  // Pendente contratual = Valor + aditivos − faturamento total (ajuste anual não entra)
  const pendenteParaFaturarTodosAnos = useMemo(() => {
    if (!contract) return null;
    return valorMaisAditivosTotal - faturamentoTotalTodosAnos;
  }, [contract, valorMaisAditivosTotal, faturamentoTotalTodosAnos]);

  // Pendente anual = Valor anual ajustado − faturamento do ano
  const saldoAnual = useMemo(() => {
    if (valorAnualAjustado === null) return null;
    return valorAnualAjustado - faturamentoAnual;
  }, [valorAnualAjustado, faturamentoAnual]);

  const valorAnualPorAno = useMemo(() => {
    if (!contract) return {} as Record<number, number | null>;
    const result: Record<number, number | null> = {};
    availableYears.forEach((year) => {
      const base = getValorAnualBaseDoAno(
        valorMaisAditivosTotal,
        contract.startDate,
        contract.endDate,
        year
      );
      if (base === null) {
        result[year] = null;
        return;
      }
      const adj = annualAdjustByYear.get(year);
      result[year] = adj ? base + adj.delta : base;
    });
    return result;
  }, [contract, availableYears, valorMaisAditivosTotal, annualAdjustByYear]);

  const faturamentoPorAno = useMemo(() => {
    const result: Record<number, number> = {};
    availableYears.forEach((year) => {
      result[year] = billings
        .filter((b) => getDateYear(b.issueDate) === year)
        .reduce((acc, b) => acc + b.grossValue, 0);
    });
    return result;
  }, [availableYears, billings]);

  const producaoPorAno = useMemo(() => {
    const result: Record<number, number> = {};
    availableYears.forEach((year) => {
      result[year] = productions
        .filter((p) => getDateYear(p.fillingDate) === year)
        .reduce((acc, p) => acc + p.weeklyProductionValue, 0);
    });
    return result;
  }, [availableYears, productions]);

  const valorOrcadoPorAno = useMemo(() => {
    const result: Record<number, number> = {};
    availableYears.forEach((year) => {
      result[year] = pleitos
        .filter((p) => {
          if (!isBudgetStatusInValorOrcadoSum(p.budgetStatus)) return false;
          const pYear = p.creationYear ?? getDateYear(p.startDate);
          return pYear === year;
        })
        .reduce((acc, p) => acc + parseBudgetToNumberSafe(p.budget), 0);
    });
    return result;
  }, [availableYears, pleitos]);

  const pendenteFaturamentoPorAno = useMemo(() => {
    const result: Record<number, number> = {};
    availableYears.forEach((year) => {
      result[year] = (valorOrcadoPorAno[year] || 0) - (faturamentoPorAno[year] || 0);
    });
    return result;
  }, [availableYears, valorOrcadoPorAno, faturamentoPorAno]);

  /** Produção − Faturamento (controle anual). */
  const prodMenosFatPorAno = useMemo(() => {
    const result: Record<number, number> = {};
    availableYears.forEach((year) => {
      result[year] = (producaoPorAno[year] || 0) - (faturamentoPorAno[year] || 0);
    });
    return result;
  }, [availableYears, producaoPorAno, faturamentoPorAno]);

  // Faturamento filtrado por ano e mês (para exibição nas tabelas)
  const filteredBillings = useMemo(() => {
    const rows = billings.filter((b) => {
      const d = parseDateSafe(b.issueDate);
      if (!d) return false;
      if (!isAllYears && d.getFullYear() !== selectedYear) return false;
      if (selectedMonth !== 0 && d.getMonth() + 1 !== selectedMonth) return false; // JS month 0-11

      if (!billingMatchesSearchTerm(b, searchTermBillings)) return false;

      const osTerm = filterBillingOsSe.trim().toLowerCase();
      if (osTerm && !(b.serviceOrder || '').toLowerCase().includes(osTerm)) return false;

      const nfTerm = filterBillingInvoice.trim().toLowerCase();
      if (nfTerm && !(b.invoiceNumber || '').toLowerCase().includes(nfTerm)) return false;

      const grossTerm = filterBillingGross.trim();
      if (grossTerm) {
        const grossFormatted = formatCurrencyInput(b.grossValue).toLowerCase();
        const grossNumericTerm = parseCurrencyInput(grossTerm);
        const matchesFormatted = grossFormatted.includes(grossTerm.toLowerCase().replace('r$', '').trim());
        const matchesNumeric = grossNumericTerm > 0 && Math.abs(b.grossValue - grossNumericTerm) < 0.009;
        if (!matchesFormatted && !matchesNumeric) return false;
      }

      return true;
    });

    return [...rows].sort((a, b) => {
      const ta = parseDateSafe(a.issueDate)?.getTime() ?? 0;
      const tb = parseDateSafe(b.issueDate)?.getTime() ?? 0;
      if (tb !== ta) return tb - ta;
      const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (cb !== ca) return cb - ca;
      return b.id.localeCompare(a.id);
    });
  }, [billings, isAllYears, selectedYear, selectedMonth, searchTermBillings, filterBillingOsSe, filterBillingInvoice, filterBillingGross]);

  // OS com faturamento 100% ficam ocultas por padrão; entram na lista quando
  // o filtro pede explicitamente Faturado 100% ou Pleiteado 100%.
  const filteredPleitos = useMemo(() => {
    const includeConcluidas =
      filterOsStatusFat === 'Faturado 100%' || filterOsStatus === 'Pleiteado 100%';

    let result = allPleitos.filter((p) => {
      if (isPleitoHistorico(p)) return false;
      if (!includeConcluidas && isOsConcluida(p, billingsForOs)) return false;

      // Com filtro de status 100%, não restringe por ano/mês (senão a OS some do resultado).
      if (includeConcluidas) return true;

      const monthNum = p.creationMonth ? parseInt(String(p.creationMonth).replace(/\D/g, '') || '0', 10) : null;
      const year = p.creationYear ?? getDateYear(p.startDate);
      if (!isAllYears && (year === null || year !== selectedYear)) return false;
      if (selectedMonth === 0) return true;
      if (monthNum === null && p.startDate) return getDateMonth(p.startDate) === selectedMonth;
      return monthNum === selectedMonth;
    });

    if (filterOsStatus) {
      result = result.filter(
        (p) => getOsStatus(p, billingsForOs, allPleitos) === filterOsStatus
      );
    }
    if (filterOsStatusFat) {
      result = result.filter(
        (p) => getOsStatusFaturamento(p, billingsForOs) === filterOsStatusFat
      );
    }

    if (searchTermPleitos.trim()) {
      result = result.filter((p) => pleitoMatchesSearchTerm(p, searchTermPleitos));
    }

    return result;
  }, [
    allPleitos,
    billingsForOs,
    isAllYears,
    selectedYear,
    selectedMonth,
    filterOsStatus,
    filterOsStatusFat,
    searchTermPleitos,
  ]);

  const hasActivePleitosFilter = Boolean(filterOsStatus || filterOsStatusFat);
  const hasActiveProductionFilter = Boolean(filterProductionOsSe.trim() || filterProductionResponsible.trim());
  const hasActiveBillingFilter = Boolean(
    filterBillingOsSe.trim() || filterBillingInvoice.trim() || filterBillingGross.trim()
  );

  const osResumoTotals = useMemo(() => {
    const osRows = allPleitos.filter((p) => !isPleitoHistorico(p));
    let totalOrcado = 0;
    let totalPleiteado = 0;
    let totalFaturado = 0;
    const seenOs = new Set<string>();

    for (const p of osRows) {
      totalOrcado += parseBudgetToNumberSafe(p.budget);
      const key = (p.divSe || '').trim().toLowerCase() || p.id;
      if (seenOs.has(key)) continue;
      seenOs.add(key);
      totalPleiteado += sumOsPleiteadoTotal(allPleitos, p.divSe);
      totalFaturado += getOsFaturamentoAcumulado(p, billingsForOs);
    }

    return { totalOrcado, totalPleiteado, totalFaturado };
  }, [allPleitos, billingsForOs]);

  const clearPleitosFilters = () => {
    setFilterOsStatus('');
    setFilterOsStatusFat('');
  };

  const clearProductionFilters = () => {
    setFilterProductionOsSe('');
    setFilterProductionResponsible('');
  };

  const clearBillingFilters = () => {
    setFilterBillingOsSe('');
    setFilterBillingInvoice('');
    setFilterBillingGross('');
  };

  useEffect(() => {
    setPleitosListPage(1);
  }, [
    searchTermPleitos,
    filterOsStatus,
    filterOsStatusFat,
    selectedYear,
    selectedMonth,
  ]);

  useEffect(() => {
    setProductionListPage(1);
  }, [
    searchTermProduction,
    filterProductionOsSe,
    filterProductionResponsible,
    selectedYear,
    selectedMonth,
  ]);

  useEffect(() => {
    setBillingsListPage(1);
  }, [
    searchTermBillings,
    filterBillingOsSe,
    filterBillingInvoice,
    filterBillingGross,
    selectedYear,
    selectedMonth,
  ]);

  const displayedPleitos = useMemo(() => {
    const start = (pleitosListPage - 1) * LIST_DISPLAY_LIMIT;
    return filteredPleitos.slice(start, start + LIST_DISPLAY_LIMIT);
  }, [filteredPleitos, pleitosListPage]);

  const pleitosListRange = useMemo(
    () => getCadastroListRange(pleitosListPage, LIST_DISPLAY_LIMIT, filteredPleitos.length),
    [pleitosListPage, filteredPleitos.length]
  );

  const displayedProductions = useMemo(() => {
    const start = (productionListPage - 1) * LIST_DISPLAY_LIMIT;
    return filteredProductions.slice(start, start + LIST_DISPLAY_LIMIT);
  }, [filteredProductions, productionListPage]);

  const productionListRange = useMemo(
    () => getCadastroListRange(productionListPage, LIST_DISPLAY_LIMIT, filteredProductions.length),
    [productionListPage, filteredProductions.length]
  );

  const displayedBillings = useMemo(() => {
    const start = (billingsListPage - 1) * LIST_DISPLAY_LIMIT;
    return filteredBillings.slice(start, start + LIST_DISPLAY_LIMIT);
  }, [filteredBillings, billingsListPage]);

  const billingsListRange = useMemo(
    () => getCadastroListRange(billingsListPage, LIST_DISPLAY_LIMIT, filteredBillings.length),
    [billingsListPage, filteredBillings.length]
  );

  const generatedPleitosForIds = useMemo(
    () => allPleitos.filter((p) => isGeneratedPleito(p)),
    [allPleitos]
  );

  const pleitoDisplayIds = useMemo(
    () => buildDisplayIdMap(generatedPleitosForIds),
    [generatedPleitosForIds]
  );

  const billingDisplayIds = useMemo(() => buildDisplayIdMap(billings), [billings]);
  const {
    rowActionMenu: pleitoRowActionMenu,
    rowForActionMenu: pleitoRowForActionMenu,
    toggleRowActionMenu: togglePleitoRowActionMenu,
    closeRowActionMenu: closePleitoRowActionMenu,
    isRowMenuOpen: isPleitoRowMenuOpen,
  } = useRowActionMenu(displayedPleitos);
  const {
    rowActionMenu: billingRowActionMenu,
    rowForActionMenu: billingRowForActionMenu,
    toggleRowActionMenu: toggleBillingRowActionMenu,
    closeRowActionMenu: closeBillingRowActionMenu,
    isRowMenuOpen: isBillingRowMenuOpen,
  } = useRowActionMenu(displayedBillings);
  const visiblePleitoIds = useMemo(() => displayedPleitos.map((p) => p.id), [displayedPleitos]);
  const allVisibleSelected = visiblePleitoIds.length > 0 && visiblePleitoIds.every((id) => selectedForPleito.has(id));
  const someVisibleSelected = visiblePleitoIds.some((id) => selectedForPleito.has(id));

  const visibleBillingIds = useMemo(() => displayedBillings.map((b) => b.id), [displayedBillings]);
  const allVisibleBillingsSelected =
    visibleBillingIds.length > 0 && visibleBillingIds.every((id) => selectedForBilling.has(id));
  const someVisibleBillingsSelected = visibleBillingIds.some((id) => selectedForBilling.has(id));

  const toggleSelectAllVisibleBillings = (checked: boolean) => {
    if (checked) {
      setSelectedForBilling((prev) => {
        const next = new Set(prev);
        visibleBillingIds.forEach((id) => next.add(id));
        return next;
      });
      return;
    }
    setSelectedForBilling((prev) => {
      const next = new Set(prev);
      visibleBillingIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const toggleBillingSelectionMenu = (button: HTMLButtonElement) => {
    setBillingSelectionMenu((prev) => {
      if (prev) return null;
      const rect = button.getBoundingClientRect();
      let left = rect.right - ROW_ACTION_MENU_WIDTH_PX;
      left = Math.max(8, Math.min(left, window.innerWidth - ROW_ACTION_MENU_WIDTH_PX - 8));
      return { rowId: 'billing-selection-toolbar', top: rect.bottom + 4, left };
    });
  };

  useEffect(() => {
    if (selectedForBilling.size === 0) setBillingSelectionMenu(null);
  }, [selectedForBilling.size]);

  useEffect(() => {
    if (!billingSelectionMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBillingSelectionMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [billingSelectionMenu]);

  const contractTablesRerenderKey = useMemo(
    () => [filteredPleitos, filteredBillings, productions],
    [filteredPleitos, filteredBillings, productions]
  );

  useContractTableColumnCustomizer(containerRef, 'contracts:detail', contractTablesRerenderKey);

  const handleBillingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateContrato) {
      toast.error('Você não tem permissão para criar no módulo Contratos.');
      return;
    }
    const gross = parseCurrencyInput(billingForm.grossValue);
    const net = parseCurrencyInput(billingForm.netValue);
    if (!billingForm.issueDate || !billingForm.invoiceNumber.trim() || !billingForm.serviceOrder.trim()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (!billingForm.pleitoId.trim()) {
      toast.error('Selecione o pleito vinculado ao faturamento');
      return;
    }
    if (gross === 0) {
      toast.error('Valor bruto é obrigatório');
      return;
    }
    if (net === 0) {
      toast.error('Valor líquido é obrigatório');
      return;
    }
    if (selectedBillingPleitoSaldo != null && gross > selectedBillingPleitoSaldo + 0.01) {
      toast.error(`Valor bruto excede o saldo do pleito (${formatCurrency(selectedBillingPleitoSaldo)})`);
      return;
    }
    createBillingMutation.mutate({
      issueDate: billingForm.issueDate,
      invoiceNumber: billingForm.invoiceNumber.trim(),
      serviceOrder: billingForm.serviceOrder.trim(),
      pleitoId: billingForm.pleitoId.trim(),
      grossValue: gross,
      netValue: net
    });
  };

  const handleBillingEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditContrato) {
      toast.error('Você não tem permissão para editar no módulo Contratos.');
      return;
    }
    if (!selectedBilling) return;
    const gross = parseCurrencyInput(billingEditForm.grossValue);
    const net = parseCurrencyInput(billingEditForm.netValue);
    if (!billingEditForm.issueDate || !billingEditForm.invoiceNumber.trim() || !billingEditForm.serviceOrder.trim()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (gross === 0) {
      toast.error('Valor bruto é obrigatório');
      return;
    }
    if (net === 0) {
      toast.error('Valor líquido é obrigatório');
      return;
    }
    updateBillingMutation.mutate({
      id: selectedBilling.id,
      data: {
        issueDate: billingEditForm.issueDate,
        invoiceNumber: billingEditForm.invoiceNumber.trim(),
        serviceOrder: billingEditForm.serviceOrder.trim(),
        grossValue: gross,
        netValue: net
      }
    });
  };

  const handleProductionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateContrato) {
      toast.error('Você não tem permissão para criar no módulo Contratos.');
      return;
    }
    const value = parseCurrencyInput(productionForm.weeklyProductionValue);
    const responsiblePerson =
      productionForm.responsiblePerson.trim() || defaultProductionResponsiblePerson;
    if (!productionForm.divSe.trim() || !responsiblePerson) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (value < 0) {
      toast.error('Valor da produção semanal inválido');
      return;
    }
    const fillingDate = productionForm.fillingDate || toInputDate(new Date());
    createProductionMutation.mutate({
      fillingDate,
      divSe: productionForm.divSe.trim(),
      weeklyProductionValue: value,
      responsiblePerson,
    });
  };

  const handleProductionEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditContrato) {
      toast.error('Você não tem permissão para editar no módulo Contratos.');
      return;
    }
    if (!selectedProduction) return;
    const value = parseCurrencyInput(productionEditForm.weeklyProductionValue);
    if (!productionEditForm.divSe.trim() || !productionEditForm.responsiblePerson.trim()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (value < 0) {
      toast.error('Valor da produção semanal inválido');
      return;
    }
    updateProductionMutation.mutate({
      id: selectedProduction.id,
      data: {
        fillingDate: productionEditForm.fillingDate || toInputDate(selectedProduction.fillingDate),
        divSe: productionEditForm.divSe.trim(),
        weeklyProductionValue: value,
        responsiblePerson: productionEditForm.responsiblePerson.trim()
      }
    });
  };

  const gerarPleitoMutation = useMutation({
    mutationFn: async (items: { id: string; billingRequest: number; generatedByPleitear100?: boolean }[]) => {
      const now = new Date();
      const creationMonth = String(now.getMonth() + 1).padStart(2, '0');
      const creationYear = now.getFullYear();
      await Promise.all(
        items.map(async ({ id, billingRequest }) => {
          const source = pleitos.find((p) => p.id === id);
          if (!source) return;
          await api.post(`/contracts/${contractId}/pleitos`, {
            serviceOrderId: (source as { serviceOrderId?: string }).serviceOrderId,
            creationMonth,
            creationYear,
            startDate: source.startDate,
            endDate: source.endDate,
            budgetStatus: source.budgetStatus,
            folderNumber: source.folderNumber,
            lot: source.lot,
            divSe: source.divSe,
            location: source.location,
            unit: source.unit,
            serviceDescription: source.serviceDescription,
            budget: source.budget,
            executionStatus: source.executionStatus,
            billingStatus: 'nao-pago',
            billingRequest: billingRequest.toFixed(2),
            invoiceNumber: null,
            budgetAmount1: source.budgetAmount1,
            budgetAmount2: source.budgetAmount2,
            budgetAmount3: source.budgetAmount3,
            budgetAmount4: source.budgetAmount4,
            pv: source.pv,
            ipi: source.ipi,
            reportsBilling: PLEITO_HISTORY_MARKER,
            engineer: source.engineer,
            supervisor: source.supervisor
          });
        })
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contract-pleitos', contractId] });
      const dataForResumo = variables.map(({ id, billingRequest }) => {
        const p = pleitos.find((x) => x.id === id)!;
        const orc = p.budget ? Number(p.budget) : 0;
        const pct = orc > 0 ? (billingRequest / orc) * 100 : 0;
        return { pleito: p, valorPleiteado: billingRequest, pctOrcamento: pct };
      });
      setPleitoGeradoData(dataForResumo);
      setShowPleitoValoresModal(false);
      setShowPleitoResumoModal(true);
      setSelectedForPleito(new Set());
      setValorPleiteado({});
      setPleitoValorInput({});
      toast.success('Pleito gerado com sucesso!');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao gerar pleito');
    }
  });

  const deletePleitosSelecionadosMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) =>
          api.delete(`/pleitos/${id}`, { params: { excluirOrdemServico: true } })
        )
      );
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['contract-pleitos', contractId] });
      queryClient.invalidateQueries({ queryKey: ['pleitos'] });
      queryClient.invalidateQueries({ queryKey: ['pleitos-divse-list'] });
      setSelectedForPleito(new Set());
      setSelectedPleitoId((prev) => (prev && ids.includes(prev) ? null : prev));
      toast.success(
        ids.length === 1 ? 'Ordem de serviço excluída.' : `${ids.length} ordens de serviço excluídas.`
      );
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao excluir ordens de serviço');
    }
  });

  const handleExcluirPleitosSelecionados = () => {
    if (!canDeleteContrato) {
      toast.error('Você não tem permissão para excluir no módulo Contratos.');
      return;
    }
    const ids = Array.from(selectedForPleito).filter((id) => pleitos.some((p) => p.id === id));
    if (ids.length === 0) {
      toast.error('Selecione ao menos uma ordem de serviço.');
      return;
    }
    if (
      !window.confirm(
        `Excluir ${ids.length} ordem(ns) de serviço selecionada(s)? Esta ação não pode ser desfeita.`
      )
    ) {
      return;
    }
    deletePleitosSelecionadosMutation.mutate(ids);
  };

  const toggleOsSelectionMenu = (button: HTMLButtonElement) => {
    setOsSelectionMenu((prev) => {
      if (prev) return null;
      const rect = button.getBoundingClientRect();
      let left = rect.right - ROW_ACTION_MENU_WIDTH_PX;
      left = Math.max(8, Math.min(left, window.innerWidth - ROW_ACTION_MENU_WIDTH_PX - 8));
      return { rowId: 'os-selection-toolbar', top: rect.bottom + 4, left };
    });
  };

  useEffect(() => {
    if (selectedForPleito.size === 0) setOsSelectionMenu(null);
  }, [selectedForPleito.size]);

  useEffect(() => {
    if (!osSelectionMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOsSelectionMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [osSelectionMenu]);

  const getSelectedOsPleiteadas100 = (ids: string[]): ContractPleito[] =>
    ids
      .map((id) => pleitos.find((x) => x.id === id))
      .filter((p): p is ContractPleito => !!p && isOsPleiteada100(p, allPleitos));

  const handleGerarPleito = () => {
    if (!canCreateContrato) {
      toast.error('Você não tem permissão para criar no módulo Contratos.');
      return;
    }
    const ids = Array.from(selectedForPleito);
    if (ids.length === 0) {
      toast.error('Selecione ao menos uma ordem de serviço para gerar o pleito.');
      return;
    }
    const jaPleiteadas = getSelectedOsPleiteadas100(ids);
    if (jaPleiteadas.length > 0) {
      const labels = jaPleiteadas.map((p) => p.divSe || p.id).join(', ');
      toast.error(`OS já pleiteada(s) 100%: ${labels}. Desmarque para continuar.`);
      return;
    }
    setShowPleitoValoresModal(true);
  };

  const handleGerarPleitoParaOs = (pleitoId: string) => {
    if (!canCreateContrato) {
      toast.error('Você não tem permissão para criar no módulo Contratos.');
      return;
    }
    if (getSelectedOsPleiteadas100([pleitoId]).length > 0) {
      toast.error('Esta OS já está 100% pleiteada.');
      return;
    }
    setSelectedForPleito(new Set([pleitoId]));
    setShowPleitoValoresModal(true);
  };

  const handleExcluirPleitoOs = (pleito: ContractPleito) => {
    if (!canDeleteContrato) {
      toast.error('Você não tem permissão para excluir no módulo Contratos.');
      return;
    }
    const label = formatOsSePastaOrDash(pleito.divSe, pleito.folderNumber);
    if (
      !window.confirm(
        `Excluir a ordem de serviço ${label}? Esta ação não pode ser desfeita.`
      )
    ) {
      return;
    }
    deletePleitosSelecionadosMutation.mutate([pleito.id]);
  };

  const handleRemoverFaturamento = (billing: ContractBilling) => {
    closeBillingRowActionMenu();
    if (!window.confirm('Excluir este faturamento?')) {
      return;
    }
    deleteBillingMutation.mutate(billing.id);
  };

  const handleRemoverFaturamentosSelecionados = () => {
    const ids = Array.from(selectedForBilling).filter((id) => billings.some((b) => b.id === id));
    if (ids.length === 0) {
      toast.error('Selecione ao menos um faturamento.');
      return;
    }
    if (
      !window.confirm(
        ids.length === 1
          ? 'Excluir o faturamento selecionado?'
          : `Excluir ${ids.length} faturamentos selecionados?`
      )
    ) {
      return;
    }
    setBillingSelectionMenu(null);
    deleteBillingMutation.mutate(ids);
  };

  const handleEditarPleitoOs = (pleito: ContractPleito) => {
    if (!canEditContrato) {
      toast.error('Você não tem permissão para editar no módulo Contratos.');
      return;
    }
    closePleitoRowActionMenu();
    setPleitoToEdit({ ...(pleito as unknown as PleitoFormData), id: pleito.id });
  };

  const handleVisualizarPleito = () => {
    const ids = Array.from(selectedForPleito);
    if (ids.length === 0) {
      toast.error('Selecione ao menos uma ordem de serviço para visualizar o pleito.');
      return;
    }
    setOsSelectionMenu(null);
    setShowVisualizarPleitoModal(true);
  };

  const handleGerarCronogramaMensal = () => {
    const ids = Array.from(selectedForPleito);
    if (ids.length === 0) {
      toast.error('Selecione ao menos uma ordem de serviço para gerar o cronograma.');
      return;
    }
    setOsSelectionMenu(null);
    setShowCronogramaMensalModal(true);
  };

  const handleExportOsExcel = () => {
    if (filteredPleitos.length === 0) {
      toast.error('Não há ordens de serviço para exportar.');
      return;
    }
    try {
      const contractSlug = contract?.number?.replace(/[^\w-]+/g, '_') || contractId.slice(0, 8);
      exportPleitosOsToXlsx(
        filteredPleitos as PleitoOsExportRow[],
        billingsForOs,
        `ordens-servico-${contractSlug}`
      );
      toast.success(`${filteredPleitos.length} ordem(ns) exportada(s) para Excel.`);
      setShowOsExportModal(false);
    } catch {
      toast.error('Erro ao exportar para Excel.');
    }
  };

  const handleExportOsPdf = async () => {
    if (filteredPleitos.length === 0) {
      toast.error('Não há ordens de serviço para exportar.');
      return;
    }
    setExportingOsPdf(true);
    try {
      const contractSlug = contract?.number?.replace(/[^\w-]+/g, '_') || contractId.slice(0, 8);
      await exportHistoricoOsPdf(filteredPleitos as PleitoOsExportRow[], billingsForOs, {
        contractName: contract?.name,
        contractNumber: contract?.number,
        filenamePrefix: `ordens-servico-${contractSlug}`,
      });
      toast.success(`PDF gerado com ${filteredPleitos.length} ordem(ns) de serviço.`);
      setShowOsExportModal(false);
    } catch {
      toast.error('Erro ao gerar PDF.');
    } finally {
      setExportingOsPdf(false);
    }
  };

  const handleConfirmarPleito = () => {
    if (!canCreateContrato) {
      toast.error('Você não tem permissão para criar no módulo Contratos.');
      return;
    }
    const ids = Array.from(selectedForPleito);
    const result = buildPleitoGerarItems(ids, pleitos, allPleitos, (id) =>
      getPleitoGerarValorFromDraft(id, pleitos, valorPleiteado, pleitoValorInput)
    );
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    gerarPleitoMutation.mutate(result.items.map((item) => ({ ...item, generatedByPleitear100: false })));
  };

  const handlePleitar100PorcentoSelecionadas = () => {
    const ids = Array.from(selectedForPleito);
    if (ids.length === 0) {
      toast.error('Selecione ao menos uma ordem de serviço.');
      return;
    }
    const jaPleiteadas = getSelectedOsPleiteadas100(ids);
    if (jaPleiteadas.length > 0) {
      const labels = jaPleiteadas.map((p) => p.divSe || p.id).join(', ');
      toast.error(`OS já pleiteada(s) 100%: ${labels}. Desmarque para continuar.`);
      return;
    }
    if (
      !window.confirm(
        `Gerar pleito a 100% do orçamento para ${ids.length} OS(s) selecionada(s)?`
      )
    ) {
      return;
    }
    const result = buildPleitoGerarItems(ids, pleitos, allPleitos, (id) => {
      const p = pleitos.find((x) => x.id === id);
      if (!p) return 0;
      const orcamento = p.budget ? Number(p.budget) : 0;
      const alreadyPleiteado = sumOsPleiteadoTotal(allPleitos, p.divSe);
      return Math.max(0, orcamento - alreadyPleiteado);
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    gerarPleitoMutation.mutate(result.items.map((item) => ({ ...item, generatedByPleitear100: true })));
  };

  const pleitoModalExcedeState = useMemo(() => {
    const ids = Array.from(selectedForPleito);
    const pendingByOs = new Map<string, number>();
    const byId: Record<string, boolean> = {};
    let anyExceeds = false;
    for (const id of ids) {
      const p = pleitos.find((x) => x.id === id);
      if (!p) {
        byId[id] = false;
        continue;
      }
      const orc = p.budget ? Number(p.budget) : 0;
      const valor = getPleitoGerarValorFromDraft(id, pleitos, valorPleiteado, pleitoValorInput);
      const osKey = (p.divSe || '').trim().toLowerCase();
      const already = sumOsPleiteadoTotal(allPleitos, p.divSe);
      const batchBefore = pendingByOs.get(osKey) || 0;
      const excede = orc > 0 && valor > 0 && already + batchBefore + valor > orc + 0.01;
      byId[id] = excede;
      if (excede) anyExceeds = true;
      if (orc > 0 && valor > 0) {
        pendingByOs.set(osKey, batchBefore + valor);
      }
    }
    return { anyExceeds, byId };
  }, [selectedForPleito, valorPleiteado, pleitoValorInput, pleitos, allPleitos]);

  const toggleSelectAllVisiblePleitos = (checked: boolean) => {
    if (checked) {
      setSelectedForPleito((prev) => {
        const next = new Set(prev);
        visiblePleitoIds.forEach((id) => next.add(id));
        return next;
      });
      return;
    }

    setSelectedForPleito((prev) => {
      const next = new Set(prev);
      visiblePleitoIds.forEach((id) => next.delete(id));
      return next;
    });
    setValorPleiteado((prev) => {
      const next = { ...prev };
      visiblePleitoIds.forEach((id) => delete next[id]);
      return next;
    });
    setPleitoValorInput((prev) => {
      const next = { ...prev };
      visiblePleitoIds.forEach((id) => delete next[id]);
      return next;
    });
  };

  const visualizarPleitos = useMemo(
    () => pleitos.filter((p) => selectedForPleito.has(p.id)),
    [pleitos, selectedForPleito]
  );

  const handleExportPleitoPDF = async () => {
    if (pleitoGeradoData.length === 0) return;
    try {
      const logoBase64 = await loadPdfBrandingLogoDataUrl({
        contextLabels: [
          contract?.name,
          contract?.number,
          contract?.costCenter?.name,
          contract?.costCenter?.code,
        ],
        maxW: 22,
        maxH: 20,
      });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 18;
      const contentWidth = pageWidth - 2 * margin;
      let y = margin;
      const now = new Date();

      pdf.setFillColor(185, 28, 28);
      pdf.rect(0, 0, pageWidth, 36, 'F');
      if (logoBase64) {
        pdf.addImage(logoBase64, 'PNG', margin, 8, 22, 20);
      }
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Documento de Pleito', pageWidth / 2, 18, { align: 'center' });
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, pageWidth / 2, 28, { align: 'center' });
      if (contract) {
        pdf.setFontSize(9);
        pdf.text(`${contract.name} - nº ${contract.number}`, pageWidth / 2, 34, { align: 'center' });
      }
      pdf.setTextColor(0, 0, 0);
      y = 48;

      const colW = [42, 48, 35, 35, 25];
      const headers = ['OS/SE', 'Descrição', 'Orçamento', 'Valor Pleiteado', '%'];
      const totalW = colW.reduce((a, b) => a + b, 0);
      const rowH = 8;
      const cellPad = 3;

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Andamentos incluídos no pleito', margin, y);
      y += 10;

      pdf.setFillColor(55, 65, 81);
      pdf.rect(margin, y, totalW, rowH, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      let x = margin;
      headers.forEach((h, i) => {
        pdf.text(h, x + cellPad, y + 5.5);
        x += colW[i];
      });
      pdf.setTextColor(0, 0, 0);
      y += rowH;

      pleitoGeradoData.forEach(({ pleito, valorPleiteado: vp, pctOrcamento }, idx) => {
        if (y + rowH > pageHeight - margin - 10) {
          pdf.addPage();
          y = margin;
        }
        if (idx % 2 === 1) {
          pdf.setFillColor(249, 250, 251);
          pdf.rect(margin, y, totalW, rowH, 'F');
        }
        pdf.setDrawColor(229, 231, 235);
        pdf.line(margin, y, margin + totalW, y);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        x = margin;
        const orc = pleito.budget ? Number(pleito.budget) : 0;
        const cells = [
          formatOsSePasta(pleito.divSe, pleito.folderNumber).substring(0, 22) || '-',
          (pleito.serviceDescription || '-').substring(0, 38),
          formatCurrency(orc),
          formatCurrency(vp),
          `${pctOrcamento.toFixed(1)}%`
        ];
        cells.forEach((cell, i) => {
          pdf.text(cell, x + cellPad, y + 5.5);
          x += colW[i];
        });
        y += rowH;
      });

      pdf.setFillColor(243, 244, 246);
      pdf.rect(margin, y, totalW, rowH, 'F');
      pdf.setDrawColor(156, 163, 175);
      pdf.line(margin, y, margin + totalW, y);
      pdf.line(margin, y + rowH, margin + totalW, y + rowH);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      const totalValor = pleitoGeradoData.reduce((s, d) => s + d.valorPleiteado, 0);
      x = margin;
      pdf.text('Total', x + cellPad, y + 5.5);
      x += colW[0] + colW[1] + colW[2];
      pdf.text(formatCurrency(totalValor), x + colW[3] - cellPad, y + 5.5, { align: 'right' });
      y += rowH + 8;

      pdf.save(`pleito-${now.toISOString().split('T')[0]}.pdf`);
      toast.success('PDF exportado com sucesso!');
    } catch (err) {
      toast.error('Erro ao exportar PDF');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  if (loadingContract || !contract) {
    return (
      <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <div className="flex items-center justify-center min-h-[400px]">
            {loadingContract ? (
              <Loading message="Carregando contrato..." size="lg" />
            ) : (
              <div className="text-center">
                <p className="text-gray-600 dark:text-gray-400">Contrato não encontrado.</p>
                <Link
                  href="/ponto/contratos"
                  className="mt-4 inline-flex items-center gap-2 text-red-600 dark:text-red-400 hover:underline"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar para contratos
                </Link>
              </div>
            )}
          </div>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div ref={containerRef} className="space-y-6">
          {/* Header */}
          <div className="space-y-4">
            <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
              <Link
                href="/ponto/contratos"
                aria-label="Voltar para contratos"
                className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                Voltar
              </Link>
              <div className="absolute right-0 top-1/2 z-10 -translate-y-1/2">
                {EXIBIR_GASTOS_CONTRATO_NA_UI ? (
                  <div className="text-right">
                    {paidDisplay.loading || totvsRmCarregando ? (
                      <div className="inline-flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        <span className="hidden sm:inline">Carregando…</span>
                      </div>
                    ) : paidDisplay.totvsErrorMessage ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400" title={paidDisplay.totvsErrorMessage}>
                        RM indisponível
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openPaidNaturezaModal(null)}
                        className="rounded-lg px-1 py-0.5 text-base font-bold text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300 sm:text-lg"
                        title="Ver totais por natureza (RM)"
                      >
                        {paidHeaderTotal.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        })}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <StringSingleSelectDropdown
                      value={String(selectedMonth)}
                      onChange={(v) => setSelectedMonth(Number(v))}
                      options={MESES_FILTRO_SELECT_OPTIONS}
                      allowEmpty={false}
                      disableSearch
                      menuAlign="end"
                      matchTriggerWidth
                      className="min-w-[9.5rem] max-w-[10.5rem]"
                    />
                    <StringSingleSelectDropdown
                      value={String(selectedYear)}
                      onChange={(v) => setSelectedYear(Number(v))}
                      options={headerYearSelectOptions}
                      allowEmpty={false}
                      disableSearch
                      menuAlign="end"
                      matchTriggerWidth
                      menuMinWidth={152}
                      className="min-w-[5.25rem]"
                    />
                  </div>
                )}
              </div>
              <div className="w-full max-w-3xl px-24 text-center sm:px-32">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl break-words">
                  {contract.name}
                </h1>
                <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
                  Contrato nº {contract.number}
                </p>
              </div>
            </div>

            {!paidDisplay.loading &&
            !paidDisplay.totvsErrorMessage &&
            totvsTotalPagoRes?.success !== false &&
            totvsTotalPagoRes?.data?.configured === false ? (
              <p className="text-center text-xs text-amber-600 dark:text-amber-400">
                O servidor não está com o RM habilitado (faltam variáveis TOTVS_RM_* no ambiente do backend).
                Reinicie a API após alterar o .env.
              </p>
            ) : null}
            {EXIBIR_GASTOS_CONTRATO_NA_UI &&
            !paidDisplay.loading &&
            !paidDisplay.totvsErrorMessage &&
            totvsTotalPagoRes?.data?.configured === true &&
            paidHeaderTotal === 0 &&
            (totvsTotalPagoRes?.data?.matchedRowCount ?? 0) === 0 ? (
              <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                Nenhuma linha do relatório RM (RELATORIOFIN) encontrada para o centro de custo deste contrato.
              </p>
            ) : null}

          </div>

          <div className="space-y-8">
          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Contrato</p>
          {/* Resumo do contrato */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30 sm:p-3">
                    <CalendarDays className="h-5 w-5 text-indigo-600 dark:text-indigo-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                    <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                      Vigência
                    </p>
                    <div className="group relative mt-1 w-fit max-w-full">
                      <p className="cursor-default text-xl font-bold leading-snug text-gray-900 dark:text-gray-100 sm:text-2xl">
                        {formatDate(contract.startDate)} até {formatDate(contract.endDate)}
                      </p>
                      <div
                        role="tooltip"
                        className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-max max-w-[min(22rem,calc(100vw-2rem))] space-y-1 rounded-lg border border-gray-200 bg-white p-2.5 text-left text-xs leading-relaxed text-gray-600 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      >
                        <p>Início: {formatDate(contract.startDate)}</p>
                        <p>Término: {formatDate(contract.endDate)}</p>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          Duração: {contractYearsCount > 0 ? contractYearsCount : '—'} ano(s) de vigência
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-3">
                  <div className="flex min-w-[120px] flex-1 items-center pr-2">
                    <div className="flex-shrink-0 rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30 sm:p-3">
                      <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400 sm:h-6 sm:w-6" />
                    </div>
                    <div className="ml-3 min-w-0 flex-1 overflow-hidden sm:ml-4">
                      <p className="break-normal text-xs font-medium leading-tight text-gray-600 dark:text-gray-400 sm:text-sm">
                        Valor + Aditivos
                      </p>
                      <div className="group relative mt-1 w-fit max-w-full">
                        <p className="cursor-default text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                          {formatCurrency(valorMaisAditivosTotal)}
                        </p>
                        <div
                          role="tooltip"
                          className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-max max-w-[min(22rem,calc(100vw-2rem))] space-y-1 rounded-lg border border-gray-200 bg-white p-2.5 text-left text-xs leading-relaxed text-gray-600 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                        >
                          <p>Valor contratual: {formatCurrency(contract.valuePlusAddenda)}</p>
                          {totalAddenda !== 0 ? (
                            <p>
                              Aditivos: {totalAddenda >= 0 ? '+' : ''}
                              {formatCurrency(totalAddenda)}
                            </p>
                          ) : (
                            <p className="text-gray-500 dark:text-gray-400">Sem aditivos</p>
                          )}
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            Total: {formatCurrency(valorMaisAditivosTotal)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddendumModal(true)}
                    className="mt-1 flex-shrink-0 rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100 sm:mt-0 sm:p-2.5"
                    title="Cadastrar aditivo"
                    aria-label="Cadastrar aditivo"
                  >
                    <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-3">
                  <div className="flex min-w-[120px] flex-1 items-center pr-2">
                    <div className="flex-shrink-0 rounded-lg bg-sky-100 p-2 dark:bg-sky-900/30 sm:p-3">
                      <FileText className="h-5 w-5 text-sky-600 dark:text-sky-400 sm:h-6 sm:w-6" />
                    </div>
                    <div className="ml-3 min-w-0 flex-1 overflow-hidden sm:ml-4">
                      <p className="break-normal text-xs font-medium leading-tight text-gray-600 dark:text-gray-400 sm:text-sm">
                        Valor anual
                      </p>
                      {isAllYears ? (
                        <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">—</p>
                      ) : (
                        <div className="group relative mt-1 w-fit max-w-full">
                          <p className="cursor-default text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                            {valorAnualAjustado !== null ? formatCurrency(valorAnualAjustado) : '-'}
                          </p>
                          <div
                            role="tooltip"
                            className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-max max-w-[min(22rem,calc(100vw-2rem))] space-y-1 rounded-lg border border-gray-200 bg-white p-2.5 text-left text-xs leading-relaxed text-gray-600 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                          >
                            <p>Valor + aditivos: {formatCurrency(valorMaisAditivosTotal)}</p>
                            <p>
                              ÷ {contractVigenciaMonthCount > 0 ? contractVigenciaMonthCount : '—'} mês(es)
                              {contractVigenciaMonthCount > 0
                                ? ` = ${formatCurrency(valorMaisAditivosTotal / contractVigenciaMonthCount)}/mês`
                                : ''}
                            </p>
                            <p>
                              × {contractMonthsInSelectedYear} mês(es) em {safeSelectedYear}
                              {valorAnualBase !== null ? ` = ${formatCurrency(valorAnualBase)}` : ''}
                            </p>
                            {valorAnualBase !== null &&
                              valorAnualAjustado !== null &&
                              Math.abs(valorAnualAjustado - valorAnualBase) > 0.009 && (
                                <>
                                  <p>
                                    Ajuste orçamentário ({safeSelectedYear}):{' '}
                                    {valorAnualAjustado >= valorAnualBase ? '+' : ''}
                                    {formatCurrency(valorAnualAjustado - valorAnualBase)}
                                  </p>
                                  <p className="font-medium text-gray-900 dark:text-gray-100">
                                    Valor anual: {formatCurrency(valorAnualAjustado)}
                                  </p>
                                </>
                              )}
                            {valorAnualBase !== null &&
                              valorAnualAjustado !== null &&
                              Math.abs(valorAnualAjustado - valorAnualBase) <= 0.009 && (
                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                  Valor anual: {formatCurrency(valorAnualBase)}
                                </p>
                              )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isAllYears}
                    onClick={() => {
                      setAdjFormYear(safeSelectedYear);
                      setShowValorAnualAdjustModal(true);
                    }}
                    className="mt-1 flex-shrink-0 rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100 sm:mt-0 sm:p-2.5"
                    title="Ajustar valor anual"
                    aria-label="Ajustar valor anual"
                  >
                    <Edit2 className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Faturamento</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 rounded-lg bg-green-100 p-2 dark:bg-green-900/30 sm:p-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                    <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                      Saldo anual faturado
                    </p>
                    <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                      {formatCurrency(isAllYears ? faturamentoTotalTodosAnos : faturamentoAnual)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30 sm:p-3">
                    <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                    <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                      Saldo anual pendente
                    </p>
                    <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                      {isAllYears ? '—' : saldoAnual !== null ? formatCurrency(saldoAnual) : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 rounded-lg bg-green-100 p-2 dark:bg-green-900/30 sm:p-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                    <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                      Saldo contratual faturado
                    </p>
                    <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                      {formatCurrency(faturamentoTotalTodosAnos)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30 sm:p-3">
                    <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                    <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                      Saldo contratual pendente
                    </p>
                    <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                      {pendenteParaFaturarTodosAnos !== null
                        ? formatCurrency(pendenteParaFaturarTodosAnos)
                        : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          </div>

          {(canAccessOrcamento || canAccessRelatorios || canAccessReunioes) && (
            <div className="space-y-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Documentos</p>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {canAccessOrcamento ? (
                  <Card>
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-3">
                        <div className="flex min-w-[120px] flex-1 items-center pr-2">
                          <div className="flex-shrink-0 rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30 sm:p-3">
                            <Calculator className="h-5 w-5 text-emerald-600 dark:text-emerald-400 sm:h-6 sm:w-6" />
                          </div>
                          <div className="ml-3 min-w-0 flex-1 overflow-hidden sm:ml-4">
                            <p className="break-normal text-xs font-medium leading-tight text-gray-600 dark:text-gray-400 sm:text-sm">
                              Orçamentos
                            </p>
                            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                              {loadingOrcamentosCount ? '…' : orcamentosCount}
                            </p>
                          </div>
                        </div>
                        <Link
                          href={`/ponto/contratos/${contractId}/orcamento`}
                          className="mt-1 flex-shrink-0 rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100 sm:mt-0 sm:p-2.5"
                          aria-label="Abrir orçamentos"
                          title="Abrir orçamentos"
                        >
                          <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
                {canAccessRelatorios ? (
                  <Card>
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-3">
                        <div className="flex min-w-[120px] flex-1 items-center pr-2">
                          <div className="flex-shrink-0 rounded-lg bg-rose-100 p-2 dark:bg-rose-900/30 sm:p-3">
                            <FileImage className="h-5 w-5 text-rose-600 dark:text-rose-400 sm:h-6 sm:w-6" />
                          </div>
                          <div className="ml-3 min-w-0 flex-1 overflow-hidden sm:ml-4">
                            <p className="break-normal text-xs font-medium leading-tight text-gray-600 dark:text-gray-400 sm:text-sm">
                              Relatórios Fotográficos
                            </p>
                            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                              {loadingRelatoriosCount ? '…' : relatoriosCount}
                            </p>
                          </div>
                        </div>
                        <Link
                          href={`/ponto/contratos/${contractId}/relatorios`}
                          className="mt-1 flex-shrink-0 rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100 sm:mt-0 sm:p-2.5"
                          aria-label="Abrir relatórios fotográficos"
                          title="Abrir relatórios fotográficos"
                        >
                          <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
                {canAccessReunioes ? (
                  <Card>
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-3">
                        <div className="flex min-w-[120px] flex-1 items-center pr-2">
                          <div className="flex-shrink-0 rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30 sm:p-3">
                            <History className="h-5 w-5 text-indigo-600 dark:text-indigo-400 sm:h-6 sm:w-6" />
                          </div>
                          <div className="ml-3 min-w-0 flex-1 overflow-hidden sm:ml-4">
                            <p className="break-normal text-xs font-medium leading-tight text-gray-600 dark:text-gray-400 sm:text-sm">
                              Histórico de Reuniões
                            </p>
                            <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                              {loadingReunioesCount ? '…' : reunioesCount}
                            </p>
                          </div>
                        </div>
                        <Link
                          href={`/ponto/contratos/${contractId}/reunioes`}
                          className="mt-1 flex-shrink-0 rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100 sm:mt-0 sm:p-2.5"
                          aria-label="Abrir histórico de reuniões"
                          title="Abrir histórico de reuniões"
                        >
                          <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            </div>
          )}

          </div>

          {/* Controle Geral - Metas Mensais ou Metas Anuais conforme filtro */}
          <Card>
            <CardHeader className="border-b-0 pb-1">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="p-2 sm:p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg shrink-0">
                    <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {isAllYears ? 'Acumulado Anual' : `Controle Geral - ${safeSelectedYear}`}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {isAllYears ? 'Indicadores anuais por ano' : 'Indicadores mensais do contrato'}
                    </p>
                  </div>
                </div>
                {!isAllYears ? (
                  <div className="relative shrink-0 group">
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
                      aria-label="Como funcionam meta ideal e meta real"
                    >
                      <Info className="h-4 w-4 shrink-0" aria-hidden />
                    </button>
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-gray-200 bg-white p-3 text-left text-xs leading-relaxed text-gray-600 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                    >
                      {CONTROLE_GERAL_META_AJUDA}
                    </div>
                  </div>
                ) : null}
              </div>
              {EXIBIR_GASTOS_CONTRATO_NA_UI &&
              !isAllYears &&
              solicitacoesControleTotvsPronto &&
              !solicitacoesRmTemLancamentosNoRelatorio &&
              !totvsRmCarregando ? (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                  <span className="font-medium">Gastos (RM):</span> não há linhas com o centro de custo deste
                  contrato na consulta de gastos (ou colunas não detectadas). Confira o cadastro do CC,{' '}
                  <span className="font-mono">TOTVS_RM_SOLICITACOES_PATH</span> (se for outra consulta no RM),{' '}
                  <span className="font-mono">TOTVS_RM_SOLICITACOES_CC_COLUMN</span>,{' '}
                  <span className="font-mono">TOTVS_RM_SOLICITACOES_DATE_COLUMN</span>,{' '}
                  <span className="font-mono">TOTVS_RM_SOLICITACOES_VALUE_COLUMN</span> e movimentos no ano{' '}
                  {safeSelectedYear}. O filtro de status da linha Gastos é opcional (
                  <span className="font-mono">TOTVS_RM_SOLICITACOES_USE_STATUS_FILTER</span>).
                </p>
              ) : null}
              {!isAllYears &&
              !gastosOperacionaisCarregando &&
              gastosOperacionaisModuleData?.configured === false ? (
                <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                  <span className="font-medium">Gastos Operacionais:</span> integração TOTVS RM não
                  configurada no servidor (
                  <span className="font-mono">TOTVS_RM_*</span>).
                </p>
              ) : null}
              {!isAllYears &&
              !gastosOperacionaisCarregando &&
              !gastosOperacionaisModuleIsError &&
              gastosOperacionaisModuleData?.configured === true &&
              !gastosOperacionaisTemDados ? (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  Nenhum gasto operacional encontrado no RM para este contrato/centro de custo (
                  {contract.name}
                  {contract.costCenter?.code ? ` · CC ${contract.costCenter.code}` : ''}).
                </p>
              ) : null}
            </CardHeader>
            <CardContent>
              <div className="table-scroll">
                {isAllYears ? (
                  <table className="w-full" data-cc-skip-column-customizer="1">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-36 whitespace-nowrap">
                          Indicador
                        </th>
                        {availableYears.map((year) => (
                          <th
                            key={year}
                            className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap"
                          >
                            {year}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      <tr>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                          Meta Anual
                        </td>
                        {availableYears.map((year) => (
                          <td
                            key={year}
                            className="px-4 py-3 text-center text-sm font-medium text-gray-900 dark:text-gray-100"
                          >
                            {valorAnualPorAno[year] != null ? formatCurrency(valorAnualPorAno[year]!) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-amber-50/50 dark:bg-amber-900/10">
                        <td className="px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-400">
                          Produção
                        </td>
                        {availableYears.map((year) => (
                          <td
                            key={year}
                            className="px-4 py-3 text-center text-sm font-medium text-amber-700 dark:text-amber-400"
                          >
                            {producaoPorAno[year] > 0 ? formatCurrency(producaoPorAno[year]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400">
                          Pleitos
                        </td>
                        {availableYears.map((year) => (
                          <td
                            key={year}
                            className="px-4 py-3 text-center text-sm font-medium text-red-600 dark:text-red-400"
                          >
                            {pleitosPorAno[year] > 0 ? formatCurrency(pleitosPorAno[year]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-green-50/50 dark:bg-green-900/10">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                          Faturamento
                        </td>
                        {availableYears.map((year) => (
                          <td
                            key={year}
                            className="px-4 py-3 text-center text-sm font-medium text-green-700 dark:text-green-400"
                          >
                            {faturamentoPorAno[year] > 0 ? formatCurrency(faturamentoPorAno[year]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-teal-50/50 dark:bg-teal-900/10">
                        <td className="px-4 py-3 text-sm font-medium text-teal-800 dark:text-teal-300">
                          Prod. - Fat.
                        </td>
                        {availableYears.map((year) => (
                          <td
                            key={year}
                            className="px-4 py-3 text-center text-sm font-medium text-teal-700 dark:text-teal-400"
                          >
                            {prodMenosFatPorAno[year] !== 0
                              ? formatCurrency(prodMenosFatPorAno[year])
                              : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-sky-50/50 dark:bg-sky-900/10">
                        <td className="px-4 py-3 text-sm font-medium text-sky-700 dark:text-sky-400">
                          Valor Orçado
                        </td>
                        {availableYears.map((year) => (
                          <td
                            key={year}
                            className="px-4 py-3 text-center text-sm font-medium text-sky-700 dark:text-sky-400"
                          >
                            {valorOrcadoPorAno[year] > 0 ? formatCurrency(valorOrcadoPorAno[year]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-orange-50/50 dark:bg-orange-900/10">
                        <td className="px-4 py-3 text-sm font-medium text-orange-700 dark:text-orange-400">
                          Pendente Faturamento
                        </td>
                        {availableYears.map((year) => (
                          <td
                            key={year}
                            className="px-4 py-3 text-center text-sm font-medium text-orange-700 dark:text-orange-400"
                          >
                            {pendenteFaturamentoPorAno[year] !== 0 ? formatCurrency(pendenteFaturamentoPorAno[year]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-indigo-50/40 dark:bg-indigo-900/15">
                        <td className="px-4 py-3 text-sm font-medium text-indigo-800 dark:text-indigo-300 whitespace-nowrap">
                          Teto de Gastos
                          {loadingTetoOrcamentario ? (
                            <Loader2
                              className="ml-1.5 inline h-3.5 w-3.5 shrink-0 animate-spin align-[-0.125em] text-indigo-600 dark:text-indigo-400"
                              aria-label="Carregando teto de gastos"
                            />
                          ) : null}
                        </td>
                        {availableYears.map((year) => {
                          const valor = tetoOrcamentarioPorAno[year] ?? 0;
                          return (
                            <td
                              key={year}
                              className="px-4 py-3 text-center text-sm font-medium text-indigo-800 dark:text-indigo-300"
                            >
                              {loadingTetoOrcamentario
                                ? '…'
                                : valor > 0
                                  ? formatCurrency(valor)
                                  : '-'}
                            </td>
                          );
                        })}
                      </tr>
                      <tr className="bg-violet-50/40 dark:bg-violet-900/15">
                        <td className="px-4 py-3 text-sm font-medium text-violet-800 dark:text-violet-300">
                          <div className="flex items-center gap-2">
                            <span>Gastos</span>
                            {gastosOperacionaisCarregando ? (
                              <Loader2
                                className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-600 dark:text-violet-400"
                                aria-label="Carregando gastos"
                              />
                            ) : null}
                          </div>
                        </td>
                        {availableYears.map((year) => {
                          const valor = gastosOperacionaisPorAno[year] ?? 0;
                          const celulaClicavel =
                            !gastosOperacionaisCarregando && valor !== 0;
                          return (
                          <td
                            key={year}
                            role={celulaClicavel ? 'button' : undefined}
                            tabIndex={celulaClicavel ? 0 : undefined}
                            onClick={() => {
                              if (celulaClicavel) {
                                setGastosResumoModal({ kind: 'year', year });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (!celulaClicavel) return;
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setGastosResumoModal({ kind: 'year', year });
                              }
                            }}
                            title={celulaClicavel ? 'Ver resumo por categoria' : undefined}
                            className={`px-4 py-3 text-center text-sm font-medium ${signedGastosValueClassName(valor)} ${
                              celulaClicavel
                                ? 'cursor-pointer transition-colors hover:bg-violet-100/70 dark:hover:bg-violet-900/35'
                                : ''
                            }`}
                          >
                            {gastosOperacionaisCarregando
                              ? '…'
                              : valor !== 0
                                ? formatCurrency(Math.abs(valor))
                                : '-'}
                          </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full" data-cc-skip-column-customizer="1">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-36 whitespace-nowrap">
                          Indicador
                        </th>
                        {MESES.map((mes) => (
                          <th
                            key={mes}
                            className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap"
                          >
                            {mes}/{safeSelectedYear.toString().slice(-2)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      <tr>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                          Meta Ideal
                        </td>
                        {MESES.map((mes, i) => {
                          const month = i + 1;
                          const cellMeta = metaSchedule.get(toYearMonthKey(safeSelectedYear, month)) ?? null;
                          return (
                          <td
                            key={mes}
                            className="px-4 py-3 text-center text-sm font-medium text-gray-900 dark:text-gray-100"
                          >
                            {cellMeta !== null ? formatCurrency(cellMeta) : '-'}
                          </td>
                          );
                        })}
                      </tr>
                      <tr className="bg-emerald-50/40 dark:bg-emerald-900/15">
                        <td className="px-4 py-3 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                          Meta Real
                        </td>
                        {MESES.map((mes, i) => {
                          const v = metaRealPorMes[i];
                          return (
                            <td
                              key={mes}
                              className="px-4 py-3 text-center text-sm font-medium text-emerald-800 dark:text-emerald-300"
                            >
                              {v !== null ? formatCurrency(v) : '-'}
                            </td>
                          );
                        })}
                      </tr>
                      <tr className="bg-indigo-50/40 dark:bg-indigo-900/15">
                        <td className="px-4 py-3 text-sm font-medium text-indigo-800 dark:text-indigo-300 whitespace-nowrap">
                          Teto de Gastos
                          {loadingTetoOrcamentario ? (
                            <Loader2
                              className="ml-1.5 inline h-3.5 w-3.5 shrink-0 animate-spin align-[-0.125em] text-indigo-600 dark:text-indigo-400"
                              aria-label="Carregando teto de gastos"
                            />
                          ) : null}
                        </td>
                        {MESES.map((mes, i) => {
                          const v = tetoOrcamentarioPorMes[i];
                          return (
                            <td
                              key={mes}
                              className="px-4 py-3 text-center text-sm font-medium text-indigo-800 dark:text-indigo-300"
                            >
                              {loadingTetoOrcamentario
                                ? '…'
                                : v != null && v > 0
                                  ? formatCurrency(v)
                                  : '-'}
                            </td>
                          );
                        })}
                      </tr>
                      {EXIBIR_GASTOS_CONTRATO_NA_UI ? (
                        <tr className="bg-red-50/40 dark:bg-red-900/15">
                          <td className="px-4 py-3 text-sm font-medium text-red-800 dark:text-red-300">
                            <div className="flex items-center gap-2">
                              <span>
                                {totvsRmCarregando ? 'Gastos (carregando…)' : 'Gastos'}
                              </span>
                              {totvsRmCarregando ? (
                                <Loader2
                                  className="h-3.5 w-3.5 shrink-0 animate-spin text-red-600 dark:text-red-400"
                                  aria-label="Carregando gastos RM"
                                />
                              ) : null}
                            </div>
                          </td>
                          {MESES.map((mes, i) => {
                            const v = solicitacoesRateioPorMes[i];
                            const semDadoRmSomado =
                              solicitacoesControleTotvsPronto &&
                              !solicitacoesRmTemLancamentosNoRelatorio &&
                              !totvsRmCarregando;
                            const mostrarZeroComoTraco =
                              v !== null && semDadoRmSomado && Math.abs(v) < 1e-9;
                            const textoCelula = totvsRmCarregando
                              ? '…'
                              : v === null
                                ? '-'
                                : mostrarZeroComoTraco
                                  ? '-'
                                  : formatCurrency(v);
                            const celulaClicavel =
                              !totvsRmCarregando && v !== null && !mostrarZeroComoTraco;
                            return (
                              <td
                                key={mes}
                                role={celulaClicavel ? 'button' : undefined}
                                tabIndex={celulaClicavel ? 0 : undefined}
                                onClick={() => {
                                  if (celulaClicavel) openPaidNaturezaModal(i);
                                }}
                                onKeyDown={(e) => {
                                  if (!celulaClicavel) return;
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openPaidNaturezaModal(i);
                                  }
                                }}
                                title={celulaClicavel ? 'Ver gastos por natureza' : undefined}
                                className={`px-4 py-3 text-center text-sm font-medium text-red-800 dark:text-red-300 ${
                                  celulaClicavel
                                    ? 'cursor-pointer transition-colors hover:bg-red-100/70 hover:underline dark:hover:bg-red-900/35'
                                    : ''
                                }`}
                              >
                                {textoCelula}
                              </td>
                            );
                          })}
                        </tr>
                      ) : null}
                      <tr className="bg-violet-50/40 dark:bg-violet-900/15">
                        <td className="px-4 py-3 text-sm font-medium text-violet-800 dark:text-violet-300">
                          <div className="flex items-center gap-2">
                            <span>Gastos</span>
                            {gastosOperacionaisCarregando ? (
                              <Loader2
                                className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-600 dark:text-violet-400"
                                aria-label="Carregando gastos"
                              />
                            ) : null}
                          </div>
                        </td>
                        {MESES.map((mes, i) => {
                          const valor = gastosOperacionaisPorMes[i];
                          const celulaClicavel =
                            !gastosOperacionaisCarregando && valor !== 0;
                          return (
                          <td
                            key={mes}
                            role={celulaClicavel ? 'button' : undefined}
                            tabIndex={celulaClicavel ? 0 : undefined}
                            onClick={() => {
                              if (celulaClicavel) {
                                setGastosResumoModal({ kind: 'month', mesIdx: i });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (!celulaClicavel) return;
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setGastosResumoModal({ kind: 'month', mesIdx: i });
                              }
                            }}
                            title={celulaClicavel ? 'Ver resumo por categoria' : undefined}
                            className={`px-4 py-3 text-center text-sm font-medium ${signedGastosValueClassName(valor)} ${
                              celulaClicavel
                                ? 'cursor-pointer transition-colors hover:bg-violet-100/70 dark:hover:bg-violet-900/35'
                                : ''
                            }`}
                          >
                            {gastosOperacionaisCarregando
                              ? '…'
                              : valor !== 0
                                ? formatCurrency(Math.abs(valor))
                                : '-'}
                          </td>
                          );
                        })}
                      </tr>
                      <tr className="bg-amber-50/50 dark:bg-amber-900/10">
                        <td className="px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-400">
                          Produção
                        </td>
                        {MESES.map((mes, i) => (
                          <td
                            key={mes}
                            className="px-4 py-3 text-center text-sm font-medium text-amber-700 dark:text-amber-400"
                          >
                            {producaoPorMes[i] > 0 ? formatCurrency(producaoPorMes[i]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400">
                          Pleitos
                        </td>
                        {MESES.map((mes, i) => (
                          <td
                            key={mes}
                            className="px-4 py-3 text-center text-sm font-medium text-red-600 dark:text-red-400"
                          >
                            {pleitosPorMes[i] > 0 ? formatCurrency(pleitosPorMes[i]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-green-50/50 dark:bg-green-900/10">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                          Faturamento
                        </td>
                        {MESES.map((mes, i) => (
                          <td
                            key={mes}
                            className="px-4 py-3 text-center text-sm font-medium text-green-700 dark:text-green-400"
                          >
                            {faturamentoPorMes[i] > 0 ? formatCurrency(faturamentoPorMes[i]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-teal-50/50 dark:bg-teal-900/10">
                        <td className="px-4 py-3 text-sm font-medium text-teal-800 dark:text-teal-300">
                          Prod. - Fat.
                        </td>
                        {MESES.map((mes, i) => (
                          <td
                            key={mes}
                            className="px-4 py-3 text-center text-sm font-medium text-teal-700 dark:text-teal-400"
                          >
                            {prodMenosFatPorMes[i] !== 0
                              ? formatCurrency(prodMenosFatPorMes[i])
                              : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-sky-50/50 dark:bg-sky-900/10">
                        <td className="px-4 py-3 text-sm font-medium text-sky-700 dark:text-sky-400">
                          Valor Orçado
                        </td>
                        {MESES.map((mes, i) => (
                          <td
                            key={mes}
                            className="px-4 py-3 text-center text-sm font-medium text-sky-700 dark:text-sky-400"
                          >
                            {valorOrcadoPorMes[i] > 0 ? formatCurrency(valorOrcadoPorMes[i]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="bg-orange-50/50 dark:bg-orange-900/10">
                        <td className="px-4 py-3 text-sm font-medium text-orange-700 dark:text-orange-400">
                          Pendente Faturamento
                        </td>
                        {MESES.map((mes, i) => (
                          <td
                            key={mes}
                            className="px-4 py-3 text-center text-sm font-medium text-orange-700 dark:text-orange-400"
                          >
                            {pendenteFaturamentoPorMes[i] !== 0 ? formatCurrency(pendenteFaturamentoPorMes[i]) : '-'}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>

          {canAccessProducaoSemanalModulo ? (
          <>
          {/* Produção Semanal */}
          <Card>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-amber-100 p-2 sm:p-3 dark:bg-amber-900/30">
                    <BarChart3 className="h-5 w-5 text-amber-600 dark:text-amber-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                      Produção Semanal
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {loadingProductions
                        ? 'Carregando...'
                        : filteredProductions.length === 1
                          ? '1 registro'
                          : `${filteredProductions.length} registros`}
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="search"
                      value={searchTermProduction}
                      onChange={(e) => setSearchTermProduction(e.target.value)}
                      placeholder="Buscar OS, responsável, valor..."
                      className={`${LIST_SEARCH_INPUT_CLASS} focus:ring-amber-500`}
                    />
                    {searchTermProduction ? (
                      <button
                        type="button"
                        onClick={() => setSearchTermProduction('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowProductionFilterModal(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      hasActiveProductionFilter
                        ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={hasActiveProductionFilter ? 'Filtro (ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveProductionFilter ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProductionForm({
                        fillingDate: toInputDate(new Date()),
                        divSe: '',
                        weeklyProductionValue: '',
                        responsiblePerson: defaultProductionResponsiblePerson,
                      });
                      setShowProductionModal(true);
                    }}
                    disabled={!canCreateContrato}
                    className="flex h-10 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Nova Produção Semanal</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {loadingProductions ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  Carregando...
                </div>
              ) : filteredProductions.length === 0 ? (
                <div className="p-8 text-center">
                  <BarChart3 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">
                    Nenhuma produção semanal encontrada.
                  </p>
                  {productions.length === 0 && (
                  <button
                    onClick={() => {
                    setProductionForm({
                      fillingDate: toInputDate(new Date()),
                      divSe: '',
                      weeklyProductionValue: '',
                      responsiblePerson: defaultProductionResponsiblePerson,
                    });
                    setShowProductionModal(true);
                  }}
                    className="mt-3 text-amber-600 dark:text-amber-400 hover:underline text-sm font-medium"
                  >
                    Cadastrar produção semanal
                  </button>
                  )}
                </div>
              ) : (
                <>
                  <CadastroListSummary
                    startItem={productionListRange.startItem}
                    endItem={productionListRange.endItem}
                    total={filteredProductions.length}
                    itemLabel="registro"
                    itemLabelPlural="registros"
                    currentPage={productionListPage}
                    totalPages={productionListRange.totalPages}
                  />
                <div className="table-scroll">
                  <table className="w-full" data-cc-skip-column-customizer="1">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Data</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">OS / SE</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Valor da Produção Semanal</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Responsável pelo Preenchimento</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Preenchimento</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-24">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {displayedProductions.map((p) => (
                        <tr
                          key={p.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/30"
                        >
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{p.fillingDate ? formatDate(p.fillingDate) : '-'}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                            {formatOsSePastaOrDash(p.divSe, folderForDivSe(pleitos, p.divSe))}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">{formatCurrency(p.weeklyProductionValue)}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{p.responsiblePerson}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDateTimeBr(p.createdAt || '')}</td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => {
                                  if (!canEditContrato) {
                                    toast.error('Você não tem permissão para editar no módulo Contratos.');
                                    return;
                                  }
                                  setSelectedProduction(p);
                                  setProductionEditForm({
                                    fillingDate: p.fillingDate ? toInputDate(p.fillingDate) : '',
                                    divSe: p.divSe,
                                    weeklyProductionValue: formatCurrencyInput(p.weeklyProductionValue),
                                    responsiblePerson: p.responsiblePerson
                                  });
                                  setEditingProduction(true);
                                }}
                                disabled={!canEditContrato}
                                className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Editar"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (!canDeleteContrato) {
                                    toast.error('Você não tem permissão para excluir no módulo Contratos.');
                                    return;
                                  }
                                  if (confirm('Excluir esta produção semanal?')) {
                                    deleteProductionMutation.mutate(p.id);
                                  }
                                }}
                                disabled={!canDeleteContrato}
                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ListPagination
                  currentPage={productionListPage}
                  totalPages={productionListRange.totalPages}
                  onPageChange={setProductionListPage}
                />
                </>
              )}
            </CardContent>
          </Card>
          </>
          ) : null}

          {canAccessOrdemServicoModulo ? (
          <>
          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Resumo
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30 sm:p-3">
                      <Calculator className="h-5 w-5 text-blue-600 dark:text-blue-400 sm:h-6 sm:w-6" />
                    </div>
                    <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                      <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                        Total Orçado
                      </p>
                      <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                        {formatCurrency(osResumoTotals.totalOrcado)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30 sm:p-3">
                      <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400 sm:h-6 sm:w-6" />
                    </div>
                    <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                      <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                        Total Pleiteado
                      </p>
                      <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                        {formatCurrency(osResumoTotals.totalPleiteado)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-lg bg-green-100 p-2 dark:bg-green-900/30 sm:p-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 sm:h-6 sm:w-6" />
                    </div>
                    <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                      <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                        Total Faturado
                      </p>
                      <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                        {formatCurrency(osResumoTotals.totalFaturado)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Ordem de Serviço - Lista de pleitos do contrato */}
          <Card>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className="flex flex-col gap-4">
                <div className={cadastroListClasses.cardHeaderRow}>
                  <div className={cadastroListClasses.cardHeaderIconRow}>
                    <div className="rounded-lg bg-blue-100 p-2 sm:p-3 dark:bg-blue-900/30">
                      <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400 sm:h-6 sm:w-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                        Ordem de Serviço
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {loadingPleitos
                          ? 'Carregando...'
                          : filteredPleitos.length === 1
                            ? '1 ordem de serviço'
                            : `${filteredPleitos.length} ordens de serviço`}
                      </p>
                    </div>
                  </div>
                  <div className={cadastroListClasses.cardToolbar}>
                    {!loadingPleitos && pleitos.length > 0 && selectedForPleito.size > 0 && (
                      <button
                        type="button"
                        onClick={(e) => toggleOsSelectionMenu(e.currentTarget)}
                        className={`relative ${rowActionMenuButtonClass(osSelectionMenu !== null)}`}
                        aria-label="Ações das OS selecionadas"
                        aria-expanded={osSelectionMenu !== null}
                        aria-haspopup="menu"
                        title={`Ações (${selectedForPleito.size} selecionada${selectedForPleito.size === 1 ? '' : 's'})`}
                      >
                        <MoreVertical className="h-4 w-4" />
                        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold leading-none text-white">
                          {selectedForPleito.size}
                        </span>
                      </button>
                    )}
                    <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        type="search"
                        value={searchTermPleitos}
                        onChange={(e) => setSearchTermPleitos(e.target.value)}
                        placeholder="Buscar OS, descrição, lote..."
                        className={LIST_SEARCH_INPUT_CLASS}
                      />
                      {searchTermPleitos ? (
                        <button
                          type="button"
                          onClick={() => setSearchTermPleitos('')}
                          aria-label="Limpar busca"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPleitosFilterModal(true)}
                      className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                        hasActivePleitosFilter
                          ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/40'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      }`}
                      aria-label="Abrir filtro"
                      title={hasActivePleitosFilter ? 'Filtro (ativo)' : 'Filtro'}
                    >
                      <Filter className="h-4 w-4" />
                      {hasActivePleitosFilter ? (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-900" />
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowOsExportModal(true)}
                      disabled={filteredPleitos.length === 0 || exportingOsPdf}
                      className={OS_TOOLBAR_BTN}
                      title="Exportar"
                      aria-label="Exportar"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      Exportar
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPleitoModal(true)}
                      disabled={!canCreateContrato}
                      className={OS_TOOLBAR_BTN_PRIMARY}
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      Nova Ordem de Serviço
                    </button>
                  </div>
                </div>

              </div>
            </CardHeader>
            {osSelectionMenu ? (
              <RowActionMenuPortal
                menu={osSelectionMenu}
                onClose={() => setOsSelectionMenu(null)}
                onEdit={() => {}}
                onDelete={() => {}}
                hideDefaultActions
                extraItems={[
                  {
                    label: 'Visualizar Pleito',
                    onClick: handleVisualizarPleito,
                    icon: <Eye className={OS_TOOLBAR_BTN_ICON} />,
                  },
                  {
                    label: gerarPleitoMutation.isPending ? 'Gerando...' : 'Gerar Pleito',
                    onClick: handleGerarPleito,
                    disabled: !canCreateContrato || gerarPleitoMutation.isPending,
                    disabledTitle: gerarPleitoMutation.isPending
                      ? 'Gerando...'
                      : 'Sem permissão para gerar pleito',
                    icon: <FileDown className={OS_TOOLBAR_BTN_ICON} />,
                  },
                  {
                    label: gerarPleitoMutation.isPending ? 'Gerando...' : 'Pleitear 100%',
                    onClick: handlePleitar100PorcentoSelecionadas,
                    disabled: gerarPleitoMutation.isPending,
                    disabledTitle: 'Gerando...',
                    icon: <CheckCircle2 className={OS_TOOLBAR_BTN_ICON} />,
                  },
                  {
                    label: 'Gerar cronograma mensal',
                    onClick: handleGerarCronogramaMensal,
                    icon: <CalendarDays className={OS_TOOLBAR_BTN_ICON} />,
                  },
                  {
                    label: deletePleitosSelecionadosMutation.isPending
                      ? 'Excluindo...'
                      : 'Excluir selecionadas',
                    onClick: handleExcluirPleitosSelecionados,
                    disabled: !canDeleteContrato || deletePleitosSelecionadosMutation.isPending,
                    disabledTitle: deletePleitosSelecionadosMutation.isPending
                      ? 'Excluindo...'
                      : 'Sem permissão para excluir',
                    icon: (
                      <Trash2
                        className={`h-4 w-4 shrink-0 ${
                          !canDeleteContrato || deletePleitosSelecionadosMutation.isPending
                            ? 'text-gray-400 dark:text-gray-500'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      />
                    ),
                  },
                ]}
              />
            ) : null}
            <CardContent className={cadastroListClasses.cardContent}>
              {loadingPleitos ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  Carregando ordens de serviço...
                </div>
              ) : filteredPleitos.length === 0 ? (
                <div className="p-8 text-center">
                  <ClipboardList className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">
                    Nenhuma ordem de serviço encontrada.
                  </p>
                  <button
                    onClick={() => setShowPleitoModal(true)}
                    disabled={!canCreateContrato}
                    className="mt-3 text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:no-underline text-sm font-medium"
                  >
                    Criar ordem de serviço
                  </button>
                </div>
              ) : (
                <>
                  <CadastroListSummary
                    startItem={pleitosListRange.startItem}
                    endItem={pleitosListRange.endItem}
                    total={filteredPleitos.length}
                    itemLabel="ordem de serviço"
                    itemLabelPlural="ordens de serviço"
                    currentPage={pleitosListPage}
                    totalPages={pleitosListRange.totalPages}
                  />
                <div className="table-scroll">
                  <table className="w-full text-sm" data-cc-skip-column-customizer="1">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-12 align-middle">
                          <div className="flex justify-center">
                            <TableCheckbox
                              checked={allVisibleSelected}
                              indeterminate={someVisibleSelected && !allVisibleSelected}
                              onChange={toggleSelectAllVisiblePleitos}
                              onClick={(e) => e.stopPropagation()}
                              ariaLabel="Selecionar todas as ordens de serviço visíveis"
                            />
                          </div>
                        </th>
                        <th className={`${cadastroListClasses.th} whitespace-nowrap align-middle`}>ID</th>
                        <th className={`${cadastroListClasses.th} align-middle`}>Descrição</th>
                        <th className={`${cadastroListClasses.thCenter} align-middle whitespace-nowrap`}>% Pleiteado</th>
                        <th className={`${cadastroListClasses.thCenter} align-middle whitespace-nowrap`}>Pleito</th>
                        <th className={`${cadastroListClasses.thNumeric} align-middle whitespace-nowrap`}>Valor pleiteado</th>
                        <th className={`${cadastroListClasses.thNumeric} align-middle whitespace-nowrap`}>Restante a pleitear</th>
                        <th className={`${cadastroListClasses.thNumeric} align-middle`}>Orçamento</th>
                        <th className={`${cadastroListClasses.thCenter} align-middle whitespace-nowrap`}>Status Pleito</th>
                        <th className={`${cadastroListClasses.thCenter} align-middle whitespace-nowrap`}>Status Faturamento</th>
                        <th className={`${listTableRowClasses.actionTh} align-middle`}>Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {displayedPleitos.map((p) => {
                        const osStatus = getOsStatus(p, billingsForOs, allPleitos);
                        const osStatusFat = getOsStatusFaturamento(p, billingsForOs);
                        const pctPleiteado = getOsPleiteadoPct(p, allPleitos);
                        const restantePleitear = getOsRestantePleitear(p, allPleitos);
                        const isSelected = selectedForPleito.has(p.id);
                        const linkedPleitos = getOsLinkedPleitos(allPleitos, p.divSe);
                        return (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedPleitoId(p.id)}
                          className={`group cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/30 ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                        >
                          <td className="px-3 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-center">
                              <TableCheckbox
                                checked={isSelected}
                                onChange={(next) => {
                                  if (next) {
                                    setSelectedForPleito((prev) => {
                                      const nextSet = new Set(prev);
                                      nextSet.add(p.id);
                                      return nextSet;
                                    });
                                  } else {
                                    setSelectedForPleito((prev) => {
                                      const nextSet = new Set(prev);
                                      nextSet.delete(p.id);
                                      return nextSet;
                                    });
                                    setValorPleiteado((prev) => {
                                      const nextVal = { ...prev };
                                      delete nextVal[p.id];
                                      return nextVal;
                                    });
                                    setPleitoValorInput((prev) => {
                                      const nextVal = { ...prev };
                                      delete nextVal[p.id];
                                      return nextVal;
                                    });
                                  }
                                }}
                                ariaLabel={`Selecionar ordem de serviço ${formatOsSePastaOrDash(p.divSe, p.folderNumber)}`}
                              />
                            </div>
                          </td>
                          <td className={`${cadastroListClasses.tdMono} align-middle`}>
                            {formatOsSePastaOrDash(p.divSe, p.folderNumber)}
                          </td>
                          <td className={`${cadastroListClasses.tdTruncate} align-middle`} title={p.serviceDescription}>
                            <span className="block truncate">{p.serviceDescription || '-'}</span>
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} align-middle text-gray-900 dark:text-gray-100`}>
                            {pctPleiteado != null ? `${pctPleiteado.toFixed(1)}%` : '—'}
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} align-middle`}>
                            {linkedPleitos.length === 0 ? (
                              <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                            ) : (
                              <div className="flex flex-col items-center gap-0.5">
                                {linkedPleitos.map((lp) => (
                                  <span
                                    key={lp.id}
                                    className="block font-mono text-xs font-medium text-gray-900 dark:text-gray-100"
                                    title={`Pleito ${formatDisplayId(pleitoDisplayIds, lp.id)}`}
                                  >
                                    {formatDisplayId(pleitoDisplayIds, lp.id)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className={`${cadastroListClasses.tdNumeric} align-middle text-gray-900 dark:text-gray-100`}>
                            {linkedPleitos.length === 0 ? (
                              <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                            ) : (
                              <div className="flex flex-col items-end gap-0.5">
                                {linkedPleitos.map((lp) => {
                                  const valorLp = lp.billingRequest != null ? Number(lp.billingRequest) : 0;
                                  return (
                                    <span
                                      key={lp.id}
                                      className="block whitespace-nowrap text-xs font-medium tabular-nums"
                                      title={`Pleito ${formatDisplayId(pleitoDisplayIds, lp.id)}`}
                                    >
                                      {formatCurrency(Number.isFinite(valorLp) ? valorLp : 0)}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td className={`${cadastroListClasses.tdNumeric} align-middle text-gray-900 dark:text-gray-100`}>
                            {restantePleitear != null ? formatCurrency(restantePleitear) : '—'}
                          </td>
                          <td className={`${cadastroListClasses.tdNumeric} align-middle font-medium text-gray-900 dark:text-gray-100`}>
                            {p.budget ? formatCurrency(Number(p.budget)) : '-'}
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} align-middle whitespace-nowrap`}>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${osStatusBadgeClass(osStatus)}`}
                            >
                              {osStatus}
                            </span>
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} align-middle whitespace-nowrap`}>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${osStatusBadgeClass(osStatusFat)}`}
                            >
                              {osStatusFat}
                            </span>
                          </td>
                          <RowActionMenuCell
                            isOpen={isPleitoRowMenuOpen(p.id)}
                            onToggle={(e) => togglePleitoRowActionMenu(p.id, e.currentTarget)}
                          />
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {pleitoRowActionMenu && pleitoRowForActionMenu ? (
                    <RowActionMenuPortal
                      menu={pleitoRowActionMenu}
                      onClose={closePleitoRowActionMenu}
                      onEdit={() => {}}
                      onDelete={() => {}}
                      hideDefaultActions
                      extraItems={[
                        {
                          label: 'Editar',
                          onClick: () =>
                            handleEditarPleitoOs(pleitoRowForActionMenu as ContractPleito),
                          disabled: !canEditContrato,
                          disabledTitle: 'Sem permissão para editar',
                          icon: (
                            <Edit2 className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                          ),
                        },
                        {
                          label: 'Gerar pleito',
                          onClick: () => handleGerarPleitoParaOs(pleitoRowForActionMenu.id),
                          disabled:
                            !canCreateContrato ||
                            gerarPleitoMutation.isPending ||
                            isOsPleiteada100(pleitoRowForActionMenu, allPleitos),
                          disabledTitle: gerarPleitoMutation.isPending
                            ? 'Gerando...'
                            : isOsPleiteada100(pleitoRowForActionMenu, allPleitos)
                              ? 'OS já pleiteada 100%'
                              : 'Sem permissão para gerar pleito',
                          icon: (
                            <FileDown className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                          ),
                        },
                        {
                          label: 'Excluir',
                          onClick: () =>
                            handleExcluirPleitoOs(pleitoRowForActionMenu as ContractPleito),
                          disabled:
                            !canDeleteContrato || deletePleitosSelecionadosMutation.isPending,
                          disabledTitle: deletePleitosSelecionadosMutation.isPending
                            ? 'Excluindo...'
                            : 'Sem permissão para excluir',
                          icon: (
                            <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                          ),
                        },
                      ]}
                    />
                  ) : null}
                </div>
                <ListPagination
                  currentPage={pleitosListPage}
                  totalPages={pleitosListRange.totalPages}
                  onPageChange={setPleitosListPage}
                />
                {filteredPleitos.length > LIST_DISPLAY_LIMIT && (
                  <div className="mt-4 flex justify-center border-t border-gray-200 pt-4 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => setShowAndamentoTodosModal(true)}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-100 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Ver todos os lançamentos ({filteredPleitos.length})
                    </button>
                  </div>
                )}
                </>
              )}
            </CardContent>
          </Card>

          <ContractHistoricoPleitosPanel contractId={contractId} />
          </>
          ) : null}

          {/* Faturamento - Lista de notas */}
          <Card>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-green-100 p-2 sm:p-3 dark:bg-green-900/30">
                    <Receipt className="h-5 w-5 text-green-600 dark:text-green-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                      Faturamento
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {loadingBillings
                        ? 'Carregando...'
                        : filteredBillings.length === 1
                          ? '1 registro'
                          : `${filteredBillings.length} registros`}
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  {selectedForBilling.size > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => toggleBillingSelectionMenu(e.currentTarget)}
                      className={`relative ${rowActionMenuButtonClass(billingSelectionMenu !== null)}`}
                      aria-label="Ações dos faturamentos selecionados"
                      aria-expanded={billingSelectionMenu !== null}
                      aria-haspopup="menu"
                      title={`Ações (${selectedForBilling.size} selecionado${selectedForBilling.size === 1 ? '' : 's'})`}
                    >
                      <MoreVertical className="h-4 w-4" />
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-green-600 px-1 text-[10px] font-semibold leading-none text-white">
                        {selectedForBilling.size}
                      </span>
                    </button>
                  ) : null}
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="search"
                      value={searchTermBillings}
                      onChange={(e) => setSearchTermBillings(e.target.value)}
                      placeholder="Buscar nota, OS, valor..."
                      className={`${LIST_SEARCH_INPUT_CLASS} focus:ring-green-500`}
                    />
                    {searchTermBillings ? (
                      <button
                        type="button"
                        onClick={() => setSearchTermBillings('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBillingFilterModal(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      hasActiveBillingFilter
                        ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800/60 dark:bg-green-950/30 dark:text-green-300 dark:hover:bg-green-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={hasActiveBillingFilter ? 'Filtro (ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveBillingFilter ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBillingModal(true)}
                    disabled={!canCreateContrato}
                    className="flex h-10 items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 dark:border-green-800/60 dark:bg-green-950/30 dark:text-green-300 dark:hover:bg-green-900/40 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Novo Faturamento</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            {billingSelectionMenu ? (
              <RowActionMenuPortal
                menu={billingSelectionMenu}
                onClose={() => setBillingSelectionMenu(null)}
                onEdit={() => {}}
                onDelete={() => {}}
                hideDefaultActions
                extraItems={[
                  {
                    label: deleteBillingMutation.isPending ? 'Excluindo...' : 'Excluir',
                    disabled: deleteBillingMutation.isPending,
                    disabledTitle: 'Excluindo...',
                    onClick: handleRemoverFaturamentosSelecionados,
                    icon: <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />,
                  },
                ]}
              />
            ) : null}
            <CardContent className={cadastroListClasses.cardContent}>
              {loadingBillings ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  Carregando...
                </div>
              ) : filteredBillings.length === 0 ? (
                <div className="p-8 text-center">
                  <Receipt className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">
                    {billings.length === 0
                      ? 'Nenhum faturamento cadastrado.'
                      : searchTermBillings.trim() || hasActiveBillingFilter
                        ? 'Nenhum faturamento encontrado com os filtros atuais.'
                        : `Nenhum faturamento no período selecionado (${selectedMonth > 0 ? MESES_FILTRO.find((m) => m.value === selectedMonth)?.label + ' ' : ''}${isAllYears ? 'todos os anos' : selectedYear}).`}
                  </p>
                  <button
                    onClick={() => setShowBillingModal(true)}
                    disabled={!canCreateContrato}
                    className="mt-3 text-green-600 dark:text-green-400 hover:underline disabled:opacity-50 disabled:no-underline text-sm font-medium"
                  >
                    Cadastrar primeiro faturamento
                  </button>
                </div>
              ) : (
                <>
                  <CadastroListSummary
                    startItem={billingsListRange.startItem}
                    endItem={billingsListRange.endItem}
                    total={filteredBillings.length}
                    itemLabel="registro"
                    itemLabelPlural="registros"
                    currentPage={billingsListPage}
                    totalPages={billingsListRange.totalPages}
                  />
                <div className="table-scroll">
                  <table className="w-full text-sm" data-cc-skip-column-customizer="1">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="w-12 px-3 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400 align-middle">
                          <div className="flex justify-center">
                            <TableCheckbox
                              checked={allVisibleBillingsSelected}
                              indeterminate={someVisibleBillingsSelected && !allVisibleBillingsSelected}
                              onChange={toggleSelectAllVisibleBillings}
                              onClick={(e) => e.stopPropagation()}
                              ariaLabel="Selecionar faturamentos visíveis"
                            />
                          </div>
                        </th>
                        <th className={`${cadastroListClasses.th} whitespace-nowrap align-middle`}>ID</th>
                        <th className={`${cadastroListClasses.th} whitespace-nowrap align-middle`}>OS / SE</th>
                        <th className={`${cadastroListClasses.thCenter} whitespace-nowrap align-middle`}>Pleito</th>
                        <th className={`${cadastroListClasses.th} whitespace-nowrap align-middle`}>Nº NF</th>
                        <th className={`${cadastroListClasses.thCenter} whitespace-nowrap align-middle`}>Data emissão</th>
                        <th className={`${cadastroListClasses.thNumeric} align-middle whitespace-nowrap`}>Valor bruto</th>
                        <th className={`${cadastroListClasses.thNumeric} align-middle whitespace-nowrap`}>Valor líquido</th>
                        <th className={`${cadastroListClasses.thCenter} whitespace-nowrap align-middle`}>Status</th>
                        <th className={`${listTableRowClasses.actionTh} align-middle`}>Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {displayedBillings.map((b) => {
                        const liquidoMissing = isNetValueMissing(b);
                        const fatStatus = liquidoMissing ? 'Líquido pendente' : 'Faturado';
                        const isSelected = selectedForBilling.has(b.id);
                        return (
                        <tr
                          key={b.id}
                          onClick={() => setSelectedBilling(b)}
                          className={`${listTableRowClasses.trNavigable} ${isSelected ? 'bg-green-50/50 dark:bg-green-900/10' : ''}`}
                        >
                          <td className="px-3 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-center">
                              <TableCheckbox
                                checked={isSelected}
                                onChange={(checked) =>
                                  setSelectedForBilling((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.add(b.id);
                                    else next.delete(b.id);
                                    return next;
                                  })
                                }
                                ariaLabel={`Selecionar faturamento ${formatDisplayId(billingDisplayIds, b.id)}`}
                              />
                            </div>
                          </td>
                          <td className={`${cadastroListClasses.tdMono} align-middle whitespace-nowrap`}>
                            {formatDisplayId(billingDisplayIds, b.id)}
                          </td>
                          <td className={`${cadastroListClasses.tdMono} align-middle whitespace-nowrap`}>
                            {formatOsSePastaOrDash(b.serviceOrder, folderForDivSe(allPleitos, b.serviceOrder))}
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} align-middle whitespace-nowrap`}>
                            {b.pleitoId ? (
                              <span className="font-mono text-xs font-medium text-gray-900 dark:text-gray-100">
                                {formatDisplayId(pleitoDisplayIds, b.pleitoId)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                            )}
                          </td>
                          <td className={`${cadastroListClasses.tdMono} align-middle whitespace-nowrap`}>
                            {(b.invoiceNumber || '').trim() || '—'}
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} align-middle whitespace-nowrap text-gray-900 dark:text-gray-100`}>
                            {formatDate(b.issueDate)}
                          </td>
                          <td className={`${cadastroListClasses.tdNumeric} align-middle font-medium text-gray-900 dark:text-gray-100`}>
                            {formatCurrency(b.grossValue)}
                          </td>
                          <td className={`${cadastroListClasses.tdNumeric} align-middle text-gray-900 dark:text-gray-100`}>
                            {liquidoMissing ? '—' : formatCurrency(b.netValue)}
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} align-middle whitespace-nowrap`}>
                            <span className={billingAndamentoBadgeClass(fatStatus)}>
                              {fatStatus}
                            </span>
                          </td>
                          <RowActionMenuCell
                            isOpen={isBillingRowMenuOpen(b.id)}
                            onToggle={(e) => toggleBillingRowActionMenu(b.id, e.currentTarget)}
                          />
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {billingRowActionMenu && billingRowForActionMenu ? (
                    <RowActionMenuPortal
                      menu={billingRowActionMenu}
                      onClose={closeBillingRowActionMenu}
                      onEdit={() => {}}
                      onDelete={() => {}}
                      hideDefaultActions
                      extraItems={[
                        {
                          label: deleteBillingMutation.isPending ? 'Excluindo...' : 'Excluir',
                          onClick: () => handleRemoverFaturamento(billingRowForActionMenu),
                          disabled: deleteBillingMutation.isPending,
                          disabledTitle: 'Excluindo...',
                          icon: (
                            <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                          ),
                        },
                      ]}
                    />
                  ) : null}
                </div>
                <ListPagination
                  currentPage={billingsListPage}
                  totalPages={billingsListRange.totalPages}
                  onPageChange={setBillingsListPage}
                />
                {filteredBillings.length > LIST_DISPLAY_LIMIT && (
                  <div className="mt-4 flex justify-center border-t border-gray-200 pt-4 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => setShowFaturamentoTodosModal(true)}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-100 px-4 py-2 text-sm font-medium text-green-700 transition-colors hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Ver todos os lançamentos ({filteredBillings.length})
                    </button>
                  </div>
                )}
                </>
              )}
            </CardContent>
          </Card>

          <ContractGastosResumoModal
            isOpen={gastosResumoModal != null}
            onClose={() => setGastosResumoModal(null)}
            title={gastosResumoModalTitle}
            naturezaRows={gastosResumoModalNaturezaRows}
          />

          <Modal
            isOpen={showPaidNaturezaModal}
            onClose={() => {
              setShowPaidNaturezaModal(false);
              setNaturezaModalMesIdx(null);
              setExpandedNaturezaKey(null);
            }}
            title={naturezaModalTitulo}
            size="xl"
          >
            <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
              {naturezaModalMesIdx === null
                ? 'Naturezas que entram no Total Pago deste contrato (centro de custo no relatório RM).'
                : `Gastos do mês com data de pagamento no RM (${safeSelectedYear}).`}
            </p>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-500">
              Clique em uma natureza para expandir os lançamentos
              {rmLinhasDetalheFonte === 'solicitacoes'
                ? ' (data de pagamento no RM).'
                : rmLinhasDetalheFonte === 'paid'
                  ? ' (relatório financeiro RM — detalhe de solicitações indisponível).'
                  : '.'}
            </p>
            {naturezaModalRowsAtivos.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {naturezaModalMesIdx === null
                  ? 'Nenhuma natureza com valor no RM para este contrato.'
                  : 'Nenhuma natureza com lançamento detalhado neste mês.'}
              </p>
            ) : (
              <div className="table-scroll max-h-[70vh]">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Natureza
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Valor
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Lançamentos
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                    {naturezaModalRowsAtivos.map((row) => {
                      const naturezaKey = normalizeNaturezaLabel(row.natureza);
                      const isExpanded = expandedNaturezaKey === naturezaKey;
                      const linhas = solicitacoesLinesAtivos.get(naturezaKey) ?? [];
                      const linhasTotal = linhas.reduce((s, l) => s + l.valor, 0);

                      return (
                        <React.Fragment key={row.natureza}>
                          <tr
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              setExpandedNaturezaKey(isExpanded ? null : naturezaKey)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setExpandedNaturezaKey(isExpanded ? null : naturezaKey);
                              }
                            }}
                            className={`cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                              isExpanded ? 'bg-gray-50 dark:bg-gray-800/60' : ''
                            }`}
                          >
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                              <span className="flex items-start gap-2">
                                <ChevronDown
                                  className={`mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                                <span>{row.natureza}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                              {row.total.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL'
                              })}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-400">
                              {row.count}
                            </td>
                          </tr>
                          {isExpanded ? (
                            <tr className="bg-gray-50/80 dark:bg-gray-800/40">
                              <td colSpan={3} className="px-4 py-3">
                                {linhas.length === 0 ? (
                                  <p className="py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                                    Nenhum lançamento detalhado retornado pelo RM para esta natureza.
                                    Reinicie a API após atualizar o backend se o detalhe ainda não carregar.
                                  </p>
                                ) : (
                                  <div className="table-scroll rounded-lg border border-gray-200 dark:border-gray-700">
                                    <table className="min-w-full text-sm">
                                      <thead className="bg-white dark:bg-gray-900">
                                        <tr>
                                          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Data pagamento
                                          </th>
                                          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Competência
                                          </th>
                                          <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            Valor
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
                                        {linhas.map((linha, idx) => (
                                          <tr key={`${linha.dataISO ?? 'nd'}-${linha.valor}-${idx}`}>
                                            <td className="whitespace-nowrap px-3 py-2 text-gray-800 dark:text-gray-200">
                                              {linha.dataISO
                                                ? formatDate(linha.dataISO)
                                                : '—'}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-400">
                                              {linha.competencia ?? '—'}
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                                              {linha.valor.toLocaleString('pt-BR', {
                                                style: 'currency',
                                                currency: 'BRL'
                                              })}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      <tfoot className="border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                                        <tr>
                                          <td
                                            colSpan={2}
                                            className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400"
                                          >
                                            {linhas.length}{' '}
                                            {linhas.length === 1 ? 'lançamento' : 'lançamentos'}
                                            {linhas.length < row.count
                                              ? ` (amostra; total RM: ${row.count})`
                                              : ''}
                                          </td>
                                          <td className="px-3 py-2 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                                            {linhasTotal.toLocaleString('pt-BR', {
                                              style: 'currency',
                                              currency: 'BRL'
                                            })}
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-800">
                    <tr>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Total
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {naturezaModalTotalAtivo.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        })}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-400">
                        {naturezaModalRowsAtivos.reduce((s, r) => s + r.count, 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Modal>

          {/* Modal filtros — Ordem de Serviço */}
          <Modal
            isOpen={showPleitosFilterModal}
            onClose={() => setShowPleitosFilterModal(false)}
            title="Filtros — Ordem de Serviço"
            size="md"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Status Pleito
                </label>
                <StringSingleSelectDropdown
                  value={filterOsStatus}
                  onChange={setFilterOsStatus}
                  options={FILTER_OS_STATUS_OPTIONS}
                  allowEmpty={false}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Status Faturamento
                </label>
                <StringSingleSelectDropdown
                  value={filterOsStatusFat}
                  onChange={setFilterOsStatusFat}
                  options={FILTER_OS_STATUS_FATURAMENTO_OPTIONS}
                  allowEmpty={false}
                  className="w-full"
                />
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <Button type="button" variant="outline" onClick={clearPleitosFilters}>
                  Limpar filtros
                </Button>
                <Button type="button" onClick={() => setShowPleitosFilterModal(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          </Modal>

          {/* Modal exportar — Ordem de Serviço */}
          <Modal
            isOpen={showOsExportModal}
            onClose={() => !exportingOsPdf && setShowOsExportModal(false)}
            title="Exportar ordens de serviço"
            size="sm"
          >
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Escolha o formato de exportação
                {filteredPleitos.length > 0
                  ? ` (${filteredPleitos.length} ordem${filteredPleitos.length === 1 ? '' : 'ns'}).`
                  : '.'}
              </p>
              <button
                type="button"
                onClick={handleExportOsExcel}
                disabled={filteredPleitos.length === 0 || exportingOsPdf}
                className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700/60"
              >
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Excel</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Arquivo .xlsx</p>
                </div>
              </button>
              <button
                type="button"
                onClick={handleExportOsPdf}
                disabled={filteredPleitos.length === 0 || exportingOsPdf}
                className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700/60"
              >
                <FileDown className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {exportingOsPdf ? 'Gerando PDF…' : 'PDF'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Arquivo .pdf</p>
                </div>
              </button>
              <div className="flex justify-end border-t border-gray-200 pt-3 dark:border-gray-700">
                <Button
                  type="button"
                  variant="outline"
                  disabled={exportingOsPdf}
                  onClick={() => setShowOsExportModal(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </Modal>

          {/* Modal filtros — Produção Semanal */}
          <Modal
            isOpen={showProductionFilterModal}
            onClose={() => setShowProductionFilterModal(false)}
            title="Filtros — Produção Semanal"
            size="md"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  OS / SE
                </label>
                <input
                  type="text"
                  value={filterProductionOsSe}
                  onChange={(e) => setFilterProductionOsSe(e.target.value)}
                  placeholder="Filtrar por OS / SE"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Responsável
                </label>
                <input
                  type="text"
                  value={filterProductionResponsible}
                  onChange={(e) => setFilterProductionResponsible(e.target.value)}
                  placeholder="Filtrar por responsável"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <Button type="button" variant="outline" onClick={clearProductionFilters}>
                  Limpar filtros
                </Button>
                <Button type="button" onClick={() => setShowProductionFilterModal(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          </Modal>

          {/* Modal filtros — Faturamento */}
          <Modal
            isOpen={showBillingFilterModal}
            onClose={() => setShowBillingFilterModal(false)}
            title="Filtros — Faturamento"
            size="md"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  OS / SE
                </label>
                <input
                  type="text"
                  value={filterBillingOsSe}
                  onChange={(e) => setFilterBillingOsSe(e.target.value)}
                  placeholder="Filtrar por OS / SE"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Nº Nota Fiscal
                </label>
                <input
                  type="text"
                  value={filterBillingInvoice}
                  onChange={(e) => setFilterBillingInvoice(e.target.value)}
                  placeholder="Filtrar por nota fiscal"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Valor bruto
                </label>
                <input
                  type="text"
                  value={filterBillingGross}
                  onChange={(e) => setFilterBillingGross(e.target.value)}
                  placeholder="Filtrar por valor"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <Button type="button" variant="outline" onClick={clearBillingFilters}>
                  Limpar filtros
                </Button>
                <Button type="button" onClick={() => setShowBillingFilterModal(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          </Modal>

          {/* Modal de aditivos do contrato */}
          {showAddendumModal && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-2">
              <div className="absolute inset-0" onClick={() => setShowAddendumModal(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    Aditivos do contrato
                  </h3>
                  <button type="button" onClick={() => setShowAddendumModal(false)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Cada aditivo recalcula a meta ideal a partir da data informada até o fim da vigência.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Data *
                      </label>
                      <DatePickerField
                        value={addendumDate}
                        onChange={setAddendumDate}
                        placeholder="dd/mm/aaaa"
                        aria-label="Data do aditivo"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Valor (R$) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                          R$
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={addendumAmount}
                          onChange={(e) => setAddendumAmount(maskAjusteValorInput(e.target.value))}
                          className="h-10 w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </div>
                    <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => {
                        const amount = parseAjusteValorInput(addendumAmount);
                        if (!addendumDate) return toast.error('Informe a data do aditivo');
                        if (Number.isNaN(amount) || Math.abs(amount) < 1e-9) {
                          return toast.error('Informe um valor diferente de zero');
                        }
                        createAddendumMutation.mutate({
                          effectiveDate: addendumDate,
                          amount,
                          note: addendumNote.trim() || null
                        });
                      }}
                      className="h-10 w-full px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                      disabled={createAddendumMutation.isPending}
                    >
                      {createAddendumMutation.isPending ? 'Salvando…' : 'Adicionar'}
                    </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder="Observação (opcional)"
                    value={addendumNote}
                    onChange={(e) => setAddendumNote(e.target.value)}
                    className="h-10 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-900/40">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs text-gray-500">Data</th>
                          <th className="px-3 py-2 text-left text-xs text-gray-500">Valor</th>
                          <th className="px-3 py-2 text-left text-xs text-gray-500">Obs.</th>
                          <th className="px-3 py-2 text-right text-xs text-gray-500">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {addenda.length === 0 ? (
                          <tr>
                            <td className="px-3 py-3 text-sm text-gray-500" colSpan={4}>Nenhum aditivo cadastrado.</td>
                          </tr>
                        ) : addenda.map((a) => (
                          <tr key={a.id} className="border-t border-gray-200 dark:border-gray-700">
                            <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">{formatDate(a.effectiveDate)}</td>
                            <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">{a.amount >= 0 ? '+' : ''}{formatCurrency(a.amount)}</td>
                            <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300">{a.note || '-'}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                onClick={() => deleteAddendumMutation.mutate(a.id)}
                                title="Excluir aditivo"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal ajuste valor anual (orçamento do órgão) */}
          {showValorAnualAdjustModal && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-2">
              <div className="absolute inset-0" onClick={() => setShowValorAnualAdjustModal(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Edit2 className="w-5 h-5" />
                    Ajuste do valor anual
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowValorAnualAdjustModal(false)}
                    className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Informe o <strong>ajuste</strong> (positivo ou negativo) e a <strong>data</strong>. Só o valor do ajuste
                    é redistribuído nas metas do <strong>mês da data até dezembro daquele ano</strong> — a meta mensal
                    não é recalculada pela fatia anual inteira. Anos seguintes e o quadro &quot;Valor + Aditivos&quot; não mudam.
                    Aditivos em &quot;Valor + Aditivos&quot; seguem outra regra e alteram a meta até o fim da vigência.
                  </p>
                  {valorAnualBase !== null && (
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Valor anual base: <span className="font-medium">{formatCurrency(valorAnualBase)}</span>
                    </p>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ano civil</label>
                    <StringSingleSelectDropdown
                      value={String(adjFormYear)}
                      onChange={(v) => setAdjFormYear(Number(v))}
                      options={adjYearSelectOptions}
                      allowEmpty={false}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Ajuste (R$){' '}
                      <span className="font-normal text-gray-500">positivo soma, negativo retira</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">R$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={adjFormDeltaStr}
                        onChange={(e) => setAdjFormDeltaStr(maskAjusteValorInput(e.target.value))}
                        placeholder="0,00"
                        className="w-full h-10 pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Data do aditivo *
                    </label>
                    <DatePickerField
                      value={adjFormDate}
                      onChange={setAdjFormDate}
                      placeholder="dd/mm/aaaa"
                      aria-label="Data do aditivo"
                    />
                  </div>
                  {valorAnualBase !== null && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Referência (base + aditivo no ano):{' '}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {formatCurrency(
                          valorAnualBase + (parseAjusteValorInput(adjFormDeltaStr || '0') || 0)
                        )}
                      </span>
                      <span className="block mt-1 text-xs">
                        A meta ideal pós-aditivo não é esse valor ÷ 12; use a tabela Controle Geral para ver o rateio.
                      </span>
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                    <button
                      type="button"
                      disabled={saveAnnualAdjustmentMutation.isPending || clearAnnualAdjustmentMutation.isPending}
                      onClick={() => {
                        clearAnnualAdjustmentMutation.mutate(adjFormYear);
                      }}
                      className="h-10 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 text-sm font-medium"
                    >
                      {clearAnnualAdjustmentMutation.isPending ? 'Removendo…' : 'Remover ajuste'}
                    </button>
                    <button
                      type="button"
                      disabled={saveAnnualAdjustmentMutation.isPending || clearAnnualAdjustmentMutation.isPending}
                      onClick={() => {
                        const delta = parseAjusteValorInput(adjFormDeltaStr || '0');
                        if (!adjFormDate.trim()) {
                          toast.error('Informe a data do aditivo');
                          return;
                        }
                        if (Number.isNaN(delta) || Math.abs(delta) < 1e-9) {
                          toast.error('Informe um valor de ajuste diferente de zero ou use Remover ajuste');
                          return;
                        }
                        saveAnnualAdjustmentMutation.mutate({
                          year: adjFormYear,
                          budgetAdjustmentDelta: delta,
                          budgetAdjustmentEffectiveDate: adjFormDate
                        });
                      }}
                      className="h-10 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                    >
                      {saveAnnualAdjustmentMutation.isPending ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal Cadastrar Produção Semanal */}
          {showProductionModal && !editingProduction && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black/50">
              <div className="absolute inset-0" onClick={() => setShowProductionModal(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Cadastrar Produção Semanal
                  </h3>
                  <button
                    onClick={() => setShowProductionModal(false)}
                    className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleProductionSubmit} className="p-6 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Data</label>
                    <DatePickerField
                      value={productionForm.fillingDate || toInputDate(new Date())}
                      onChange={(fillingDate) => setProductionForm({ ...productionForm, fillingDate })}
                      placeholder="dd/mm/aaaa"
                      aria-label="Data do preenchimento"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Data em que o preenchimento está sendo realizado
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">OS / SE *</label>
                    <StringSingleSelectDropdown
                      value={productionForm.divSe}
                      onChange={(divSe) => setProductionForm({ ...productionForm, divSe })}
                      options={divSeSelectOptions}
                      allowEmpty={false}
                      placeholder="Selecionar OS / SE"
                      searchPlaceholder="Pesquisar OS / SE..."
                      emptyOptionsMessage="Nenhuma OS cadastrada neste contrato."
                      className="w-full"
                    />
                    {divSeOptions.length === 0 && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Nenhuma OS cadastrada em Ordem de Serviço. Cadastre uma ordem de serviço com o campo OS / SE.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Valor da Produção Semanal *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">R$</span>
                      <input
                        type="text"
                        value={productionForm.weeklyProductionValue}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '');
                          const formatted = v ? (Number(v) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                          setProductionForm({ ...productionForm, weeklyProductionValue: formatted });
                        }}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => setShowProductionModal(false)}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={createProductionMutation.isPending}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                    >
                      {createProductionMutation.isPending ? 'Salvando...' : 'Cadastrar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Editar Produção Semanal */}
          {editingProduction && selectedProduction && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black/50">
              <div className="absolute inset-0" onClick={() => setEditingProduction(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    Editar Produção Semanal
                  </h3>
                  <button
                    onClick={() => setEditingProduction(false)}
                    className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleProductionEditSubmit} className="p-6 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Data</label>
                    <DatePickerField
                      value={
                        productionEditForm.fillingDate ||
                        (selectedProduction?.fillingDate ? toInputDate(selectedProduction.fillingDate) : '')
                      }
                      onChange={(fillingDate) => setProductionEditForm({ ...productionEditForm, fillingDate })}
                      placeholder="dd/mm/aaaa"
                      aria-label="Data do preenchimento"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Data em que o preenchimento foi realizado
                    </p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">OS / SE *</label>
                    <StringSingleSelectDropdown
                      value={productionEditForm.divSe}
                      onChange={(divSe) => setProductionEditForm({ ...productionEditForm, divSe })}
                      options={divSeSelectOptions}
                      allowEmpty={false}
                      placeholder="Selecionar OS / SE"
                      searchPlaceholder="Pesquisar OS / SE..."
                      emptyOptionsMessage="Nenhuma OS cadastrada neste contrato."
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Valor da Produção Semanal *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">R$</span>
                      <input
                        type="text"
                        value={productionEditForm.weeklyProductionValue}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '');
                          const formatted = v ? (Number(v) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                          setProductionEditForm({ ...productionEditForm, weeklyProductionValue: formatted });
                        }}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Responsável pelo Preenchimento *</label>
                    <input
                      type="text"
                      required
                      value={productionEditForm.responsiblePerson}
                      onChange={(e) => setProductionEditForm({ ...productionEditForm, responsiblePerson: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Nome do responsável"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => setEditingProduction(false)}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={updateProductionMutation.isPending}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                    >
                      {updateProductionMutation.isPending ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Cadastrar Faturamento */}
          {showBillingModal && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black/50">
              <div className="absolute inset-0" onClick={() => setShowBillingModal(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Receipt className="w-5 h-5" />
                    Cadastrar Faturamento
                  </h3>
                  <button
                    onClick={() => setShowBillingModal(false)}
                    className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleBillingSubmit} className="p-6 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Data de Emissão *</label>
                    <DatePickerField
                      value={billingForm.issueDate}
                      onChange={(issueDate) => setBillingForm({ ...billingForm, issueDate })}
                      placeholder="dd/mm/aaaa"
                      aria-label="Data de emissão"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Número da Nota Fiscal *</label>
                    <input
                      type="text"
                      required
                      value={billingForm.invoiceNumber}
                      onChange={(e) => setBillingForm({ ...billingForm, invoiceNumber: e.target.value })}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      placeholder="Ex: 000123"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">OS / SE *</label>
                    <StringSingleSelectDropdown
                      value={billingForm.serviceOrder}
                      onChange={(serviceOrder) => {
                        setBillingForm((prev) => {
                          const osTrimmed = serviceOrder.trim();
                          const pleito = allPleitos.find((p) => p.id === prev.pleitoId);
                          const pleitoStillValid =
                            !!pleito && (!osTrimmed || (pleito.divSe || '').trim() === osTrimmed);
                          return {
                            ...prev,
                            serviceOrder,
                            pleitoId: pleitoStillValid ? prev.pleitoId : '',
                          };
                        });
                      }}
                      options={divSeSelectOptions}
                      allowEmpty={false}
                      placeholder="Selecionar OS / SE"
                      searchPlaceholder="Pesquisar OS / SE..."
                      emptyOptionsMessage="Nenhuma OS cadastrada neste contrato."
                      className="w-full"
                    />
                    {divSeOptions.length === 0 && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Nenhuma OS cadastrada em Ordem de Serviço. Cadastre uma ordem de serviço com o campo OS / SE.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Pleito vinculado *</label>
                    <StringSingleSelectDropdown
                      value={billingForm.pleitoId}
                      onChange={(pleitoId) => {
                        const pleito = pleitosForBillingForm.find((p) => p.id === pleitoId);
                        setBillingForm((prev) => ({
                          ...prev,
                          pleitoId,
                          serviceOrder: pleito?.divSe?.trim() || prev.serviceOrder,
                        }));
                      }}
                      options={pleitosForBillingSelectOptions}
                      allowEmpty={false}
                      placeholder="Selecionar pleito"
                      searchPlaceholder="Pesquisar pleito..."
                      emptyOptionsMessage="Nenhum pleito apto para faturamento."
                      className="w-full"
                    />
                    {billingForm.serviceOrder.trim() && pleitosForBillingForm.length === 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Nenhum pleito apto para faturamento nesta OS. Gere o pleito no histórico antes de lançar o faturamento.
                      </p>
                    )}
                    {selectedBillingPleitoSaldo != null && billingForm.pleitoId && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Saldo disponível do pleito: {formatCurrency(selectedBillingPleitoSaldo)}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Valor Bruto *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">R$</span>
                      <input
                        type="text"
                        required
                        value={billingForm.grossValue}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '');
                          const formatted = v ? (Number(v) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                          setBillingForm({ ...billingForm, grossValue: formatted });
                        }}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Valor Líquido *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">R$</span>
                      <input
                        type="text"
                        required
                        value={billingForm.netValue}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '');
                          const formatted = v ? (Number(v) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                          setBillingForm({ ...billingForm, netValue: formatted });
                        }}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => setShowBillingModal(false)}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={createBillingMutation.isPending}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {createBillingMutation.isPending ? 'Salvando...' : 'Cadastrar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Novo Ordem de Serviço */}
          {showPleitoModal && !pleitoToEdit && (
            <PleitoFormModal
              contractId={contractId}
              contractDisplay={contract ? `${contract.name} - nº ${contract.number}` : undefined}
              onClose={() => setShowPleitoModal(false)}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['contract-pleitos', contractId] });
              }}
            />
          )}

          {/* Modal Editar Ordem de Serviço */}
          {pleitoToEdit && (
            <PleitoFormModal
              contractId={contractId}
              contractDisplay={contract ? `${contract.name} - nº ${contract.number}` : undefined}
              pleitoToEdit={pleitoToEdit}
              onClose={() => setPleitoToEdit(null)}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['contract-pleitos', contractId] });
                queryClient.invalidateQueries({ queryKey: ['pleito', pleitoToEdit.id] });
              }}
            />
          )}

          {/* Modal Informar Valores do Pleito */}
          {showPleitoValoresModal && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-2">
              <div className="absolute inset-0" onClick={() => setShowPleitoValoresModal(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Informar valores do pleito</h3>
                  <button onClick={() => setShowPleitoValoresModal(false)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Informe a % do orçamento ou o valor em R$ para cada OS selecionada:
                  </p>
                  {Array.from(selectedForPleito).map((id) => {
                    const p = pleitos.find((x) => x.id === id);
                    if (!p) return null;
                    const orc = p.budget ? Number(p.budget) : 0;
                    const selectedIds = Array.from(selectedForPleito);
                    const alreadyPleiteado = sumOsPleiteadoTotal(allPleitos, p.divSe);
                    const maxValor = getMaxPleitoValorForOs(
                      id,
                      pleitos,
                      allPleitos,
                      selectedIds,
                      valorPleiteado,
                      pleitoValorInput
                    );
                    const restantePleitear = orc > 0 ? maxValor : null;
                    return (
                      <div key={id} className="p-3 border border-gray-200 dark:border-gray-600 rounded-lg space-y-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          OS/SE: {formatOsSePastaOrDash(p.divSe, p.folderNumber)} — {p.serviceDescription?.substring(0, 40) || '-'}
                          {p.serviceDescription && p.serviceDescription.length > 40 ? '...' : ''}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Orçamento: {p.budget ? formatCurrency(Number(p.budget)) : '-'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Restante a pleitear:{' '}
                          {restantePleitear != null ? formatCurrency(restantePleitear) : '—'}
                        </p>
                        <div className="flex gap-4 items-end">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">% Orçamento</label>
                            <div className="relative">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={valorPleiteado[id] || ''}
                                onChange={(e) => {
                                  const digits = e.target.value.replace(/\D/g, '');
                                  const formatted = digits
                                    ? (Number(digits) / 100).toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })
                                    : '';
                                  const pct = parseCurrencyInput(formatted);
                                  const draft = pleitoDraftFromPct(pct, orc, maxValor);
                                  setValorPleiteado((prev) => ({ ...prev, [id]: draft.pct }));
                                  setPleitoValorInput((prev) => ({ ...prev, [id]: draft.valor }));
                                }}
                                placeholder="0,00"
                                className="w-full px-3 py-2 pr-8 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                                %
                              </span>
                            </div>
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Valor pleiteado</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 dark:text-gray-400">
                                R$
                              </span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={pleitoValorInput[id] || ''}
                                onChange={(e) => {
                                  const digits = e.target.value.replace(/\D/g, '');
                                  const formatted = digits
                                    ? (Number(digits) / 100).toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })
                                    : '';
                                  const valor = parseCurrencyInput(formatted);
                                  const draft = pleitoDraftFromValor(valor, orc, maxValor);
                                  setPleitoValorInput((prev) => ({ ...prev, [id]: draft.valor }));
                                  setValorPleiteado((prev) => ({ ...prev, [id]: draft.pct }));
                                }}
                                placeholder="0,00"
                                className="w-full py-2 pl-10 pr-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                  <button onClick={() => setShowPleitoValoresModal(false)} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmarPleito}
                    disabled={gerarPleitoMutation.isPending || pleitoModalExcedeState.anyExceeds}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
                  >
                    {gerarPleitoMutation.isPending ? 'Gerando...' : 'Confirmar e Gerar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Resumo do Pleito */}
          {showPleitoResumoModal && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-2">
              <div className="absolute inset-0" onClick={() => setShowPleitoResumoModal(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Resumo do Pleito</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExportPleitoPDF}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
                    >
                      <FileDown className="w-4 h-4" />
                      Exportar PDF
                    </button>
                    <button onClick={() => setShowPleitoResumoModal(false)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  {contract && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{contract.name} - nº {contract.number}</p>
                  )}
                  <div className="table-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">OS/SE</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Descrição</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">Orçamento</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-400">Valor Pleiteado</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-400">% Orçamento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pleitoGeradoData.map(({ pleito, valorPleiteado: vp, pctOrcamento }) => (
                          <tr key={pleito.id} className="border-b border-gray-100 dark:border-gray-700">
                            <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                              {formatOsSePastaOrDash(pleito.divSe, pleito.folderNumber)}
                            </td>
                            <td className="px-3 py-2 text-gray-900 dark:text-gray-100 max-w-xs truncate" title={pleito.serviceDescription}>{pleito.serviceDescription || '-'}</td>
                            <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{pleito.budget ? formatCurrency(Number(pleito.budget)) : '-'}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">{formatCurrency(vp)}</td>
                            <td className="px-3 py-2 text-center text-gray-900 dark:text-gray-100">{pctOrcamento.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 dark:bg-gray-700/30 font-medium">
                          <td colSpan={3} className="px-3 py-2 text-gray-900 dark:text-gray-100">Total</td>
                          <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{formatCurrency(pleitoGeradoData.reduce((s, d) => s + d.valorPleiteado, 0))}</td>
                          <td className="px-3 py-2" />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal Detalhes do Faturamento */}
          {selectedBilling && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-2">
              <div className="absolute inset-0" onClick={() => { setSelectedBilling(null); setEditingBilling(false); }} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Receipt className="w-5 h-5" />
                    {editingBilling ? 'Editar Faturamento' : 'Detalhes do Faturamento'}
                  </h3>
                  <div className="flex items-center gap-2">
                    {!editingBilling && (
                      <button
                        onClick={() => {
                          setBillingEditForm({
                            issueDate: selectedBilling.issueDate.split('T')[0],
                            invoiceNumber: selectedBilling.invoiceNumber,
                            serviceOrder: selectedBilling.serviceOrder,
                            grossValue: formatCurrencyInput(selectedBilling.grossValue),
                            netValue: isNetValueMissing(selectedBilling) ? '' : formatCurrencyInput(selectedBilling.netValue)
                          });
                          setEditingBilling(true);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4" />
                        Editar
                      </button>
                    )}
                    <button onClick={() => { setSelectedBilling(null); setEditingBilling(false); }} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                {editingBilling ? (
                  <form onSubmit={handleBillingEditSubmit} className="p-6 space-y-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Data de Emissão *</label>
                      <DatePickerField
                        value={billingEditForm.issueDate}
                        onChange={(issueDate) => setBillingEditForm({ ...billingEditForm, issueDate })}
                        placeholder="dd/mm/aaaa"
                        aria-label="Data de emissão"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Número da Nota Fiscal *</label>
                      <input
                        type="text"
                        required
                        value={billingEditForm.invoiceNumber}
                        onChange={(e) => setBillingEditForm({ ...billingEditForm, invoiceNumber: e.target.value })}
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        placeholder="Ex: 000123"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">OS / SE *</label>
                      <StringSingleSelectDropdown
                        value={billingEditForm.serviceOrder}
                        onChange={(serviceOrder) =>
                          setBillingEditForm({ ...billingEditForm, serviceOrder })
                        }
                        options={divSeSelectOptions}
                        allowEmpty={false}
                        placeholder="Selecionar OS / SE"
                        searchPlaceholder="Pesquisar OS / SE..."
                        emptyOptionsMessage="Nenhuma OS cadastrada neste contrato."
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Valor Bruto *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">R$</span>
                        <input
                          type="text"
                          required
                          value={billingEditForm.grossValue}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '');
                            const formatted = v ? (Number(v) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                            setBillingEditForm({ ...billingEditForm, grossValue: formatted });
                          }}
                          className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          placeholder="0,00"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Valor Líquido *</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">R$</span>
                        <input
                          type="text"
                          required
                          value={billingEditForm.netValue}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, '');
                            const formatted = v
                              ? (Number(v) / 100).toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })
                              : '';
                            setBillingEditForm({ ...billingEditForm, netValue: formatted });
                          }}
                          className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          placeholder="0,00"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => setEditingBilling(false)}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={updateBillingMutation.isPending}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {updateBillingMutation.isPending ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="p-6 space-y-4">
                    {contract && (
                      <div className="pb-4 border-b border-gray-200 dark:border-gray-700">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Contrato</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">{contract.name} - nº {contract.number}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Data de Emissão</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{formatDate(selectedBilling.issueDate)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Número da Nota Fiscal</p>
                      <p className="text-sm font-mono text-gray-900 dark:text-gray-100 mt-0.5">{selectedBilling.invoiceNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">OS / SE</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">
                        {formatOsSePastaOrDash(selectedBilling.serviceOrder, folderForDivSe(pleitos, selectedBilling.serviceOrder))}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Valor Bruto</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">{formatCurrency(selectedBilling.grossValue)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Valor Líquido</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">
                        {isNetValueMissing(selectedBilling) ? formatCurrency(0) : formatCurrency(selectedBilling.netValue)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Modal Detalhes do Ordem de Serviço */}
          {selectedPleitoId && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-2">
              <div className="absolute inset-0" onClick={() => setSelectedPleitoId(null)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <ClipboardList className="w-5 h-5" />
                    Detalhes do Ordem de Serviço
                  </h3>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelectedPleitoId(null)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  {loadingPleitoDetail ? (
                    <div className="py-8 text-center text-gray-500 dark:text-gray-400">Carregando...</div>
                  ) : pleitoDetailData?.data ? (() => {
                    const pleito = pleitoDetailData.data;
                    const osSe = pleito.divSe || '';
                    const acumuladoFaturado = billings
                      .filter((b) => (b.serviceOrder || '').trim() === osSe.trim())
                      .reduce((sum, b) => sum + b.grossValue, 0);
                    const orcamento = pleito.budget ? Number(pleito.budget) : 0;
                    const statusFaturamentoPct = orcamento > 0 ? (acumuladoFaturado / orcamento) * 100 : null;
                    const pendenteFaturamento = orcamento - acumuladoFaturado;
                    return (
                    <div className="space-y-4">
                      {contract && (
                        <div className="pb-4 border-b border-gray-200 dark:border-gray-700">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Contrato</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">{contract.name} - nº {contract.number}</p>
                        </div>
                      )}
                      {([
                        ['OS / SE', formatOsSePasta(pleito.divSe, pleito.folderNumber)],
                        ['Descrição do serviço', pleito.serviceDescription],
                        ['Lote', pleito.lot],
                        ['Local', pleito.location],
                        ['Unidade', pleito.unit],
                        ['Status Orçamento', pleito.budgetStatus],
                        ['Status Execução', pleito.executionStatus],
                        ['Orçamento', pleito.budget ? formatCurrency(Number(pleito.budget)) : null],
                        ['Orçamento R01', pleito.budgetAmount1 ? formatCurrency(Number(pleito.budgetAmount1)) : null],
                        ['Orçamento R02', pleito.budgetAmount2 ? formatCurrency(Number(pleito.budgetAmount2)) : null],
                        ['Orçamento R03', pleito.budgetAmount3 ? formatCurrency(Number(pleito.budgetAmount3)) : null],
                        ['Orçamento R04', pleito.budgetAmount4 ? formatCurrency(Number(pleito.budgetAmount4)) : null],
                        ['Acumulado faturado', formatCurrency(acumuladoFaturado)],
                        ['Status Faturamento (%)', statusFaturamentoPct != null ? `${statusFaturamentoPct.toFixed(1)}%` : '-'],
                        ['Pendente faturamento', formatCurrency(pendenteFaturamento)],
                        ['Data início', pleito.startDate ? formatDate(pleito.startDate) : null],
                        ['Data término', pleito.endDate ? formatDate(pleito.endDate) : null],
                        ['Mês/Ano criação', pleito.creationMonth && pleito.creationYear ? `${String(pleito.creationMonth).padStart(2, '0')}/${pleito.creationYear}` : null],
                        ['Engenheiro', pleito.engineer],
                        ['Encarregado', pleito.supervisor],
                        ['RVI', pleito.pv],
                        ['RVF', pleito.ipi],
                        ['Feedback Relatorios', pleito.reportsBilling]
                      ] as [string, string | number | null | undefined][]).map(([label, value]) =>
                        value != null && value !== '' ? (
                          <div key={label}>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{label}</p>
                            <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{String(value)}</p>
                          </div>
                        ) : null
                      )}
                      <PleitoOsPurchaseOrdersSection
                        serviceOrderId={(pleito as { serviceOrderId?: string }).serviceOrderId}
                        serviceOrderText={pleito.divSe}
                      />
                    </div>
                    );
                  })() : (
                    <div className="py-8 text-center text-gray-500 dark:text-gray-400">Andamento não encontrado.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          <Modal
            isOpen={showVisualizarPleitoModal}
            onClose={() => setShowVisualizarPleitoModal(false)}
            title="Visualizar Pleito"
            size="xl"
          >
            <ContractOsPleitoListPanel
              pleitos={visualizarPleitos}
              billings={billingsForOs}
              emptyMessage="Nenhuma ordem selecionada."
            />
          </Modal>

          <Modal
            isOpen={showAndamentoTodosModal}
            onClose={() => setShowAndamentoTodosModal(false)}
            title="Todas as ordens de serviço"
            size="full"
          >
            <ContractOsPleitoListPanel pleitos={filteredPleitos} billings={billingsForOs} />
          </Modal>

          <Modal
            isOpen={showCronogramaMensalModal}
            onClose={() => setShowCronogramaMensalModal(false)}
            title="Cronograma mensal"
            size="full"
          >
            <ContractCronogramaMensalPanel
              contractId={contractId}
              selectedIds={Array.from(selectedForPleito)}
            />
          </Modal>

          <Modal
            isOpen={showFaturamentoTodosModal}
            onClose={() => setShowFaturamentoTodosModal(false)}
            title="Todos os faturamentos"
            size="xl"
          >
            <div className="table-scroll rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm" data-cc-skip-column-customizer="1">
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className={`${cadastroListClasses.th} whitespace-nowrap align-middle`}>ID</th>
                    <th className={`${cadastroListClasses.th} whitespace-nowrap align-middle`}>OS / SE</th>
                    <th className={`${cadastroListClasses.thCenter} whitespace-nowrap align-middle`}>Pleito</th>
                    <th className={`${cadastroListClasses.th} whitespace-nowrap align-middle`}>Nº NF</th>
                    <th className={`${cadastroListClasses.thCenter} whitespace-nowrap align-middle`}>Data emissão</th>
                    <th className={`${cadastroListClasses.thNumeric} align-middle whitespace-nowrap`}>Valor bruto</th>
                    <th className={`${cadastroListClasses.thNumeric} align-middle whitespace-nowrap`}>Valor líquido</th>
                    <th className={`${cadastroListClasses.thCenter} whitespace-nowrap align-middle`}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                  {filteredBillings.map((b) => {
                    const liquidoMissing = isNetValueMissing(b);
                    const fatStatus = liquidoMissing ? 'Líquido pendente' : 'Faturado';
                    return (
                      <tr
                        key={b.id}
                        className={listTableRowClasses.tr}
                        onClick={() => {
                          setShowFaturamentoTodosModal(false);
                          setSelectedBilling(b);
                        }}
                      >
                        <td className={`${cadastroListClasses.tdMono} align-middle whitespace-nowrap`}>
                          {formatDisplayId(billingDisplayIds, b.id)}
                        </td>
                        <td className={`${cadastroListClasses.tdMono} align-middle whitespace-nowrap`}>
                          {formatOsSePastaOrDash(b.serviceOrder, folderForDivSe(allPleitos, b.serviceOrder))}
                        </td>
                        <td className={`${cadastroListClasses.tdCenter} align-middle whitespace-nowrap`}>
                          {b.pleitoId ? (
                            <span className="font-mono text-xs font-medium text-gray-900 dark:text-gray-100">
                              {formatDisplayId(pleitoDisplayIds, b.pleitoId)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                          )}
                        </td>
                        <td className={`${cadastroListClasses.tdMono} align-middle whitespace-nowrap`}>
                          {(b.invoiceNumber || '').trim() || '—'}
                        </td>
                        <td className={`${cadastroListClasses.tdCenter} align-middle whitespace-nowrap`}>
                          {formatDate(b.issueDate)}
                        </td>
                        <td className={`${cadastroListClasses.tdNumeric} align-middle font-medium`}>
                          {formatCurrency(b.grossValue)}
                        </td>
                        <td className={`${cadastroListClasses.tdNumeric} align-middle`}>
                          {liquidoMissing ? '—' : formatCurrency(b.netValue)}
                        </td>
                        <td className={`${cadastroListClasses.tdCenter} align-middle whitespace-nowrap`}>
                          <span className={billingAndamentoBadgeClass(fatStatus)}>
                            {fatStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {filteredBillings.length} registro(s)
              </p>
            </div>
          </Modal>

        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
