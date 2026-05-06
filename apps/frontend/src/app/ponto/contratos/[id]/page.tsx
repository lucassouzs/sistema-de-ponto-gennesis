'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import jsPDF from 'jspdf';
import {
  ArrowLeft,
  FileText,
  Plus,
  Receipt,
  X,
  Edit2,
  ClipboardList,
  FileDown,
  ExternalLink,
  BarChart3,
  Trash2,
  Percent,
  Calculator,
  FileImage,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { PleitoFormModal } from '@/components/pleito/PleitoFormModal';
import {
  STATUS_ORCAMENTO_OPCOES,
  STATUS_EXECUCAO_OPCOES,
  isBudgetStatusInValorOrcadoSum,
  type PleitoFormData
} from '@/lib/pleitoForm';
import { pleitoStatusReadOnlySpanClass } from '@/lib/pleitoStatusStyles';
import { useContractTableColumnCustomizer } from '@/components/useContractTableColumnCustomizer';
import { usePermissions } from '@/hooks/usePermissions';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import {
  formatOsSePasta,
  formatOsSePastaOrDash,
  folderForDivSe,
  enrichDivSeOptionsWithPleitos,
  type DivSeOptionRow
} from '@/lib/formatOsSePasta';

interface ContractBilling {
  id: string;
  contractId: string;
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
const PLEITO_HISTORY_MARKER = '__PLEITO_HISTORICO__';
const PLEITO_HISTORY_MARKER_GERADO_100 = '__PLEITO_HISTORICO__GERADO_100__';
const HISTORICO_ETIQUETA_GERADO_100 = 'Gerado 100%';

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

function sumGlobalMetaAllocatedBeforeEffMonth(
  globalMap: Map<string, number>,
  civilYear: number,
  effMonth: number,
  contractStart: Date,
  contractEnd: Date
): number {
  let sum = 0;
  for (let m = 1; m < effMonth; m++) {
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

function formatDateTime(dateStr: string) {
  const d = parseDateSafe(dateStr);
  if (!d) return '-';
  return d.toLocaleString('pt-BR', {
    timeZone: TIMEZONE_BRASILIA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

function getYearsBetween(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = parseDateSafe(startDate);
  const end = parseDateSafe(endDate);
  if (!start || !end) return 0;
  if (end <= start) return 0;
  // Conta anos completos de vigência (ex: 01/03/2026 a 01/03/2028 = 2 anos)
  const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return Math.max(1, Math.floor(diffMonths / 12));
}

function getValorMaisAditivosAnual(valuePlusAddenda: number, startDate: string, endDate: string): number | null {
  const years = getYearsBetween(startDate, endDate);
  if (years <= 0) return null;
  return valuePlusAddenda / years;
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

function filterDivSeOptions(options: DivSeOptionRow[], query: string): DivSeOptionRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => {
    const label = formatOsSePasta(o.divSe, o.folderNumber).toLowerCase();
    return (
      label.includes(q) ||
      o.divSe.toLowerCase().includes(q) ||
      (o.folderNumber || '').toLowerCase().includes(q)
    );
  });
}

function formatCurrencyInput(value: number): string {
  if (value === 0) return '';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Soma valores já pleiteados (billingRequest) para o mesmo OS/SE no contrato. */
function sumBillingRequestSameOs(
  allPleitos: ContractPleito[],
  divSe: string | null | undefined
): number {
  const key = (divSe || '').trim().toLowerCase();
  if (!key) return 0;
  return allPleitos.reduce((sum, p) => {
    if ((p.divSe || '').trim().toLowerCase() !== key) return sum;
    const br = p.billingRequest != null ? Number(p.billingRequest) : 0;
    return sum + (Number.isFinite(br) && br > 0 ? br : 0);
  }, 0);
}

type PleitoGerarBuildResult =
  | { ok: true; items: { id: string; billingRequest: number }[] }
  | { ok: false; message: string };

/** Monta payload para gerar pleito: % do orçamento por OS (mesmas regras do modal). */
function buildPleitoGerarItems(
  ids: string[],
  pleitos: ContractPleito[],
  allPleitos: ContractPleito[],
  getPctForId: (id: string) => number
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
    const pct = getPctForId(id);
    if (pct <= 0) {
      return { ok: false, message: `Informe a % do orçamento para a OS ${p.divSe || id}` };
    }
    const valorCalculado = (orcamento * pct) / 100;
    const osKey = (p.divSe || '').trim().toLowerCase();
    const alreadyPleiteado = sumBillingRequestSameOs(allPleitos, p.divSe);
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
  return marker === PLEITO_HISTORY_MARKER || marker === PLEITO_HISTORY_MARKER_GERADO_100;
}

function getHistoricoEtiqueta(p: ContractPleito): string | null {
  const marker = (p.reportsBilling || '').trim();
  if (marker === PLEITO_HISTORY_MARKER_GERADO_100) return HISTORICO_ETIQUETA_GERADO_100;
  return null;
}

export default function ContractDetailPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const {
    isAdministrator,
    can,
    canAction,
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
  const canAccessOrdemServicoModulo = canAccessContractOrdemServicoTab(contractId);
  const canAccessProducaoSemanalModulo = canAccessContractProducaoSemanalTab(contractId);
  const canCreateContrato = isAdministrator || canAction(pk('/ponto/contratos'), 'criar');
  const canEditContrato = isAdministrator || canAction(pk('/ponto/contratos'), 'editar');
  const canDeleteContrato = isAdministrator || canAction(pk('/ponto/contratos'), 'excluir');

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
    grossValue: ''
  });
  const [osSeDropdownOpen, setOsSeDropdownOpen] = useState(false);
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
  const [osSeEditDropdownOpen, setOsSeEditDropdownOpen] = useState(false);
  const [selectedPleitoId, setSelectedPleitoId] = useState<string | null>(null);
  const [pleitoToEdit, setPleitoToEdit] = useState<(PleitoFormData & { id: string }) | null>(null);
  const [filterStatusOrcamento, setFilterStatusOrcamento] = useState('');
  const [filterStatusExecucao, setFilterStatusExecucao] = useState('');
  const [filterStatusFaturamento, setFilterStatusFaturamento] = useState('');
  const [selectedForPleito, setSelectedForPleito] = useState<Set<string>>(new Set());
  const [valorPleiteado, setValorPleiteado] = useState<Record<string, string>>({});
  const [showPleitoValoresModal, setShowPleitoValoresModal] = useState(false);
  const [showPleitoResumoModal, setShowPleitoResumoModal] = useState(false);
  const [showHistoricoPleitosModal, setShowHistoricoPleitosModal] = useState(false);
  const [showHistoricoOsModal, setShowHistoricoOsModal] = useState(false);
  const [histYearFilter, setHistYearFilter] = useState('all');
  const [histMonthFilter, setHistMonthFilter] = useState('all');
  const [histOsFilter, setHistOsFilter] = useState('');
  const [histPastaFilter, setHistPastaFilter] = useState('');
  const [histDescricaoFilter, setHistDescricaoFilter] = useState('');
  const [histEtiquetaFilter, setHistEtiquetaFilter] = useState('all');
  const [historicoDrafts, setHistoricoDrafts] = useState<Record<string, { billingStatus: 'pago' | 'nao-pago'; invoiceNumber: string }>>({});
  const [selectedHistoricoPleitos, setSelectedHistoricoPleitos] = useState<Set<string>>(new Set());
  const [showHistoricoBatchNfModal, setShowHistoricoBatchNfModal] = useState(false);
  const [historicoBatchInvoiceModalValue, setHistoricoBatchInvoiceModalValue] = useState('');
  const [pleitoGeradoData, setPleitoGeradoData] = useState<Array<{ pleito: ContractPleito; valorPleiteado: number; pctOrcamento: number }>>([]);
  const [productionForm, setProductionForm] = useState({ fillingDate: '', divSe: '', weeklyProductionValue: '', responsiblePerson: '' });
  const [productionOsSeDropdownOpen, setProductionOsSeDropdownOpen] = useState(false);
  const [selectedProduction, setSelectedProduction] = useState<ContractWeeklyProduction | null>(null);
  const [editingProduction, setEditingProduction] = useState(false);
  const [productionEditForm, setProductionEditForm] = useState({ fillingDate: '', divSe: '', weeklyProductionValue: '', responsiblePerson: '' });
  const [productionOsSeEditDropdownOpen, setProductionOsSeEditDropdownOpen] = useState(false);
  const [showValorAnualAdjustModal, setShowValorAnualAdjustModal] = useState(false);
  const [adjFormYear, setAdjFormYear] = useState(currentYear);
  const [adjFormDeltaStr, setAdjFormDeltaStr] = useState('');
  const [adjFormDate, setAdjFormDate] = useState('');
  const [showAddendumModal, setShowAddendumModal] = useState(false);
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
        computedBaseAnnual: number | null;
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
      setShowBillingModal(false);
      setBillingForm({ issueDate: '', invoiceNumber: '', serviceOrder: '', grossValue: '' });
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
      setEditingBilling(false);
      toast.success('Faturamento atualizado com sucesso!');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao atualizar faturamento');
    }
  });

  const deleteBillingMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/contracts/${contractId}/billings/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-billings', contractId] });
      setSelectedBilling(null);
      setEditingBilling(false);
      toast.success('Faturamento excluído com sucesso!');
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
  const pleitos = allPleitos.filter((p) => !isPleitoHistorico(p));
  const productions = ((Array.isArray(productionsData) ? productionsData : (productionsData as { data?: ContractWeeklyProduction[] })?.data) || []) as ContractWeeklyProduction[];
  /** Somente OS / SE cadastradas neste contrato (não usar lista global de todos os contratos). */
  const divSeOptions = useMemo(
    () => enrichDivSeOptionsWithPleitos([], pleitos),
    [pleitos]
  );

  const osSeFiltered = useMemo(
    () => filterDivSeOptions(divSeOptions, billingForm.serviceOrder),
    [divSeOptions, billingForm.serviceOrder]
  );

  const osSeEditFiltered = useMemo(
    () => filterDivSeOptions(divSeOptions, billingEditForm.serviceOrder),
    [divSeOptions, billingEditForm.serviceOrder]
  );

  const productionOsSeFiltered = useMemo(
    () => filterDivSeOptions(divSeOptions, productionForm.divSe),
    [divSeOptions, productionForm.divSe]
  );

  const productionOsSeEditFiltered = useMemo(
    () => filterDivSeOptions(divSeOptions, productionEditForm.divSe),
    [divSeOptions, productionEditForm.divSe]
  );

  const availableYears = useMemo(() => {
    if (!contract) return [];
    const start = getDateYear(contract.startDate) ?? new Date().getFullYear();
    const end = getDateYear(contract.endDate) ?? start;
    const years: number[] = [];
    for (let y = start; y <= end; y++) {
      years.push(y);
    }
    return years.length > 0 ? years : [start];
  }, [contract]);

  /** Valor de cada ano de vigência: (valor + aditivos) ÷ anos da vigência (aniversários a partir da data inicial até o fim). */
  const contractYearsCount = useMemo(
    () => (contract ? countContractYearsOfVigencia(contract.startDate, contract.endDate) : 0),
    [contract]
  );
  const valorAnualBase = useMemo(() => {
    if (!contract || contractYearsCount <= 0) return null;
    return valorMaisAditivosTotal / contractYearsCount;
  }, [contract, contractYearsCount, valorMaisAditivosTotal]);

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
      if (selectedMonth === 0) return true;
      return d.getMonth() + 1 === selectedMonth;
    });
  }, [productions, isAllYears, selectedYear, selectedMonth]);

  /**
   * Meta base: Valor + Aditivos (saldo ÷ meses até o fim da vigência).
   * Ajuste Valor Anual: sobrescreve do mês efetivo até dezembro; saldo antes do ajuste =
   * valorAnualBase − soma das metas globais nos meses civis anteriores (evita rateio linear 1/12 ignorando aditivos).
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
    if (!contractVigenciaDates || !contract || valorAnualBase === null || valorAnualBase <= 0) return out;

    const { start, end } = contractVigenciaDates;

    for (const r of annualBudgetAdjustments) {
      const effMonth = annualAdjustmentEffectiveCivilMonth(r.year, r.effectiveDate);
      if (effMonth === null) continue;

      const allocatedBefore = sumGlobalMetaAllocatedBeforeEffMonth(
        globalMetaSchedule,
        r.year,
        effMonth,
        start,
        end
      );
      const pool = valorAnualBase - allocatedBefore + r.amount;
      const monthsAfter = countVigenciaMonthsInRange(r.year, effMonth, 12, start, end);
      if (monthsAfter <= 0) continue;

      const metaY = pool / monthsAfter;
      for (let m = effMonth; m <= 12; m++) {
        if (!calendarMonthHasMetaMensalInVigencia(r.year, m, start, end)) continue;
        out.set(toYearMonthKey(r.year, m), metaY);
      }
    }

    return out;
  }, [globalMetaSchedule, annualBudgetAdjustments, contractVigenciaDates, contract, valorAnualBase]);

  const metaMensalCardInfo = useMemo(() => {
    const meses = Array.from({ length: 12 }, (_, i) => i + 1)
      .map((m) => ({ m, key: toYearMonthKey(safeSelectedYear, m), v: metaSchedule.get(toYearMonthKey(safeSelectedYear, m)) ?? null }))
      .filter((x) => x.v !== null);
    if (!meses.length) return { kind: 'empty' as const };
    const firstVal = meses[0].v as number;
    const change = meses.find((x) => Math.abs((x.v as number) - firstVal) > 0.009);
    if (!change) return { kind: 'single' as const, value: firstVal };
    return {
      kind: 'split' as const,
      baseMeta: firstVal,
      metaAfter: change.v as number,
      ateMesLabel: MESES[Math.max(0, change.m - 2)],
      deMesLabel: MESES[change.m - 1],
    };
  }, [metaSchedule, safeSelectedYear]);

  useEffect(() => {
    if (!showValorAnualAdjustModal) return;
    const rows = annualValuesResponse?.data ?? [];
    const row = rows.find((r) => r.year === adjFormYear);
    if (row?.budgetAdjustmentDelta != null && row.budgetAdjustmentEffectiveDate) {
      setAdjFormDeltaStr(formatCurrencyInput(Number(row.budgetAdjustmentDelta)));
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

  // Valor total pendente para faturar (todos os anos)
  const pendenteParaFaturarTodosAnos = useMemo(() => {
    if (!contract) return null;
    return valorMaisAditivosTotal - faturamentoTotalTodosAnos;
  }, [contract, valorMaisAditivosTotal, faturamentoTotalTodosAnos]);

  // Saldo anual = Valor anual (com ajuste de orçamento, se houver) − Faturamento cadastrado
  const saldoAnual = useMemo(() => {
    if (valorAnualAjustado === null) return null;
    return valorAnualAjustado - faturamentoAnual;
  }, [valorAnualAjustado, faturamentoAnual]);

  const valorAnualPorAno = useMemo(() => {
    if (!contract) return {} as Record<number, number | null>;
    const result: Record<number, number | null> = {};
    availableYears.forEach((year) => {
      if (valorAnualBase === null) {
        result[year] = null;
        return;
      }
      const adj = annualAdjustByYear.get(year);
      result[year] = adj ? valorAnualBase + adj.delta : valorAnualBase;
    });
    return result;
  }, [contract, availableYears, valorAnualBase, annualAdjustByYear]);

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
    return billings.filter((b) => {
      const d = parseDateSafe(b.issueDate);
      if (!d) return false;
      if (!isAllYears && d.getFullYear() !== selectedYear) return false;
      if (selectedMonth !== 0 && d.getMonth() + 1 !== selectedMonth) return false; // JS month 0-11

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
  }, [billings, isAllYears, selectedYear, selectedMonth, filterBillingOsSe, filterBillingInvoice, filterBillingGross]);

  // Pleitos filtrados por ano, mês e filtros de status
  const filteredPleitos = useMemo(() => {
    let result = pleitos.filter((p) => {
      const monthNum = p.creationMonth ? parseInt(String(p.creationMonth).replace(/\D/g, '') || '0', 10) : null;
      const baseDate = monthNum && p.creationYear
        ? new Date(p.creationYear, monthNum - 1, 1, 12, 0, 0, 0)
        : parseDateSafe(p.startDate || p.createdAt || null);
      const year = p.creationYear ?? getDateYear(p.startDate);
      if (!isAllYears && (year === null || year !== selectedYear)) return false;
      if (selectedMonth === 0) return true;
      if (monthNum === null && p.startDate) return getDateMonth(p.startDate) === selectedMonth;
      return monthNum === selectedMonth;
    });

    if (filterStatusOrcamento) {
      result = result.filter((p) => {
        if (filterStatusOrcamento === '—') return !p.budgetStatus || p.budgetStatus.trim() === '';
        return (p.budgetStatus || '') === filterStatusOrcamento;
      });
    }
    if (filterStatusExecucao) {
      result = result.filter((p) => {
        if (filterStatusExecucao === '—') return !p.executionStatus || p.executionStatus.trim() === '';
        return (p.executionStatus || '') === filterStatusExecucao;
      });
    }
    if (filterStatusFaturamento) {
      result = result.filter((p) => {
        const osSe = (p.divSe || '').trim();
        const acumulado = billings
          .filter((b) => (b.serviceOrder || '').trim() === osSe)
          .reduce((sum, b) => sum + b.grossValue, 0);
        const orcamento = p.budget ? Number(p.budget) : 0;
        const statusPct = orcamento > 0 ? (acumulado / orcamento) * 100 : null;

        if (filterStatusFaturamento === '0') return statusPct !== null && statusPct === 0;
        if (filterStatusFaturamento === '1-25') return statusPct !== null && statusPct >= 1 && statusPct <= 25;
        if (filterStatusFaturamento === '26-50') return statusPct !== null && statusPct >= 26 && statusPct <= 50;
        if (filterStatusFaturamento === '51-75') return statusPct !== null && statusPct >= 51 && statusPct <= 75;
        if (filterStatusFaturamento === '76-99') return statusPct !== null && statusPct >= 76 && statusPct < 100;
        if (filterStatusFaturamento === '100') return statusPct !== null && statusPct >= 100;
        if (filterStatusFaturamento === 'sem-orcamento') return statusPct === null && orcamento === 0;
        return true;
      });
    }
    return result;
  }, [pleitos, isAllYears, selectedYear, selectedMonth, filterStatusOrcamento, filterStatusExecucao, filterStatusFaturamento, billings]);

  const displayedPleitos = useMemo(() => filteredPleitos.slice(0, LIST_DISPLAY_LIMIT), [filteredPleitos]);
  const displayedBillings = useMemo(() => filteredBillings.slice(0, LIST_DISPLAY_LIMIT), [filteredBillings]);
  const visiblePleitoIds = useMemo(() => displayedPleitos.map((p) => p.id), [displayedPleitos]);
  const allVisibleSelected = visiblePleitoIds.length > 0 && visiblePleitoIds.every((id) => selectedForPleito.has(id));
  const someVisibleSelected = visiblePleitoIds.some((id) => selectedForPleito.has(id));

  const contractTablesRerenderKey = useMemo(
    () => [filteredPleitos, filteredBillings, productions],
    [filteredPleitos, filteredBillings, productions]
  );

  useContractTableColumnCustomizer(containerRef, 'contracts:detail', contractTablesRerenderKey);

  const andamentoLinkParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set('year', String(selectedYear));
    if (selectedMonth > 0) p.set('month', String(selectedMonth));
    if (filterStatusOrcamento) p.set('statusOrcamento', filterStatusOrcamento);
    if (filterStatusExecucao) p.set('statusExecucao', filterStatusExecucao);
    if (filterStatusFaturamento) p.set('statusFaturamento', filterStatusFaturamento);
    return p.toString();
  }, [isAllYears, selectedYear, selectedMonth, filterStatusOrcamento, filterStatusExecucao, filterStatusFaturamento]);

  const faturamentoLinkParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set('year', String(selectedYear));
    if (selectedMonth > 0) p.set('month', String(selectedMonth));
    return p.toString();
  }, [isAllYears, selectedYear, selectedMonth]);

  const handleBillingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreateContrato) {
      toast.error('Você não tem permissão para criar no módulo Contratos.');
      return;
    }
    const gross = parseCurrencyInput(billingForm.grossValue);
    if (!billingForm.issueDate || !billingForm.invoiceNumber.trim() || !billingForm.serviceOrder.trim()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (gross === 0) {
      toast.error('Valor bruto é obrigatório');
      return;
    }
    createBillingMutation.mutate({
      issueDate: billingForm.issueDate,
      invoiceNumber: billingForm.invoiceNumber.trim(),
      serviceOrder: billingForm.serviceOrder.trim(),
      grossValue: gross
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
    const netRaw = (billingEditForm.netValue || '').trim();
    const netParsed = netRaw ? parseCurrencyInput(netRaw) : null;
    if (!billingEditForm.issueDate || !billingEditForm.invoiceNumber.trim() || !billingEditForm.serviceOrder.trim()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (gross === 0) {
      toast.error('Valor bruto é obrigatório');
      return;
    }
    if (netParsed !== null && netParsed < 0) {
      toast.error('Valor líquido inválido');
      return;
    }
    updateBillingMutation.mutate({
      id: selectedBilling.id,
      data: {
        issueDate: billingEditForm.issueDate,
        invoiceNumber: billingEditForm.invoiceNumber.trim(),
        serviceOrder: billingEditForm.serviceOrder.trim(),
        grossValue: gross,
        ...(netParsed !== null ? { netValue: netParsed } : {})
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
    if (!productionForm.divSe.trim() || !productionForm.responsiblePerson.trim()) {
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
      responsiblePerson: productionForm.responsiblePerson.trim()
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
        items.map(async ({ id, billingRequest, generatedByPleitear100 }) => {
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
            reportsBilling: generatedByPleitear100 ? PLEITO_HISTORY_MARKER_GERADO_100 : PLEITO_HISTORY_MARKER,
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
    setShowPleitoValoresModal(true);
  };

  const handleVisualizarPleito = () => {
    const ids = Array.from(selectedForPleito);
    if (ids.length === 0) {
      toast.error('Selecione ao menos uma ordem de serviço para visualizar o pleito.');
      return;
    }
    const p = new URLSearchParams();
    p.set('year', String(selectedYear));
    if (selectedMonth > 0) p.set('month', String(selectedMonth));
    if (filterStatusOrcamento) p.set('statusOrcamento', filterStatusOrcamento);
    if (filterStatusExecucao) p.set('statusExecucao', filterStatusExecucao);
    if (filterStatusFaturamento) p.set('statusFaturamento', filterStatusFaturamento);
    p.set('selectedIds', ids.join(','));
    router.push(`/ponto/contratos/${contractId}/andamento?${p.toString()}`);
  };

  const handleGerarCronogramaMensal = () => {
    const ids = Array.from(selectedForPleito);
    if (ids.length === 0) {
      toast.error('Selecione ao menos uma ordem de serviço para gerar o cronograma.');
      return;
    }
    const p = new URLSearchParams();
    p.set('year', String(selectedYear));
    if (selectedMonth > 0) p.set('month', String(selectedMonth));
    if (filterStatusOrcamento) p.set('statusOrcamento', filterStatusOrcamento);
    if (filterStatusExecucao) p.set('statusExecucao', filterStatusExecucao);
    if (filterStatusFaturamento) p.set('statusFaturamento', filterStatusFaturamento);
    p.set('selectedIds', ids.join(','));
    window.open(`/ponto/contratos/${contractId}/cronograma-mensal?${p.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const handleConfirmarPleito = () => {
    if (!canCreateContrato) {
      toast.error('Você não tem permissão para criar no módulo Contratos.');
      return;
    }
    const ids = Array.from(selectedForPleito);
    const result = buildPleitoGerarItems(ids, pleitos, allPleitos, (id) =>
      parseCurrencyInput(valorPleiteado[id] || '')
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
    if (
      !window.confirm(
        `Gerar pleito a 100% do orçamento para ${ids.length} OS(s) selecionada(s)?`
      )
    ) {
      return;
    }
    const result = buildPleitoGerarItems(ids, pleitos, allPleitos, () => 100);
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
      const pct = parseCurrencyInput(valorPleiteado[id] || '');
      const valor = orc > 0 && pct > 0 ? (orc * pct) / 100 : 0;
      const osKey = (p.divSe || '').trim().toLowerCase();
      const already = sumBillingRequestSameOs(allPleitos, p.divSe);
      const batchBefore = pendingByOs.get(osKey) || 0;
      const excede = orc > 0 && pct > 0 && already + batchBefore + valor > orc + 0.01;
      byId[id] = excede;
      if (excede) anyExceeds = true;
      if (orc > 0 && pct > 0) {
        pendingByOs.set(osKey, batchBefore + valor);
      }
    }
    return { anyExceeds, byId };
  }, [selectedForPleito, valorPleiteado, pleitos, allPleitos]);

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
  };

  const generatedPleitos = useMemo(
    () =>
      allPleitos.filter((p) =>
        isPleitoHistorico(p) ||
        ((p.billingRequest != null ? Number(p.billingRequest) : 0) > 0)
      ),
    [allPleitos]
  );
  const historicoOsList = useMemo(
    () => allPleitos.filter((p) => isPleitoHistorico(p)),
    [allPleitos]
  );
  const historicoYears = useMemo(() => {
    const years = new Set<number>();
    generatedPleitos.forEach((p) => {
      const y = p.creationYear ?? getDateYear(p.createdAt as unknown as string);
      if (y) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [generatedPleitos]);
  const filteredHistoricoPleitos = useMemo(() => {
    const osQuery = histOsFilter.trim().toLowerCase();
    const pastaQuery = histPastaFilter.trim().toLowerCase();
    const descricaoQuery = histDescricaoFilter.trim().toLowerCase();
    return generatedPleitos.filter((p) => {
      const year = p.creationYear ?? getDateYear(p.createdAt as unknown as string);
      const monthRaw = p.creationMonth ? parseInt(String(p.creationMonth).replace(/\D/g, '') || '0', 10) : null;
      const month = monthRaw && monthRaw > 0 ? monthRaw : getDateMonth(p.createdAt as unknown as string);

      if (histYearFilter !== 'all' && year !== Number(histYearFilter)) return false;
      if (histMonthFilter !== 'all' && month !== Number(histMonthFilter)) return false;
      if (osQuery && !(p.divSe || '').toLowerCase().includes(osQuery)) return false;
      if (pastaQuery && !(p.folderNumber || '').toLowerCase().includes(pastaQuery)) return false;
      if (descricaoQuery && !(p.serviceDescription || '').toLowerCase().includes(descricaoQuery)) return false;
      if (histEtiquetaFilter === 'gerado-100' && getHistoricoEtiqueta(p) !== HISTORICO_ETIQUETA_GERADO_100) return false;
      return true;
    });
  }, [generatedPleitos, histYearFilter, histMonthFilter, histOsFilter, histPastaFilter, histDescricaoFilter, histEtiquetaFilter]);

  const [isSavingHistoricoPleitos, setIsSavingHistoricoPleitos] = useState(false);
  useEffect(() => {
    if (!showHistoricoPleitosModal) return;
    const nextDrafts: Record<string, { billingStatus: 'pago' | 'nao-pago'; invoiceNumber: string }> = {};
    generatedPleitos.forEach((p) => {
      nextDrafts[p.id] = {
        billingStatus: (p.billingStatus || '').toLowerCase() === 'pago' ? 'pago' : 'nao-pago',
        invoiceNumber: p.invoiceNumber || ''
      };
    });
    setHistoricoDrafts(nextDrafts);
    setSelectedHistoricoPleitos(new Set());
    setShowHistoricoBatchNfModal(false);
    setHistoricoBatchInvoiceModalValue('');
  }, [showHistoricoPleitosModal, generatedPleitos]);

  const changedHistoricoPleitoIds = useMemo(() => {
    return generatedPleitos
      .filter((p) => {
        const draft = historicoDrafts[p.id];
        if (!draft) return false;
        const currentBillingStatus = (p.billingStatus || '').toLowerCase() === 'pago' ? 'pago' : 'nao-pago';
        const currentInvoiceNumber = (p.invoiceNumber || '').trim();
        return currentBillingStatus !== draft.billingStatus || currentInvoiceNumber !== draft.invoiceNumber.trim();
      })
      .map((p) => p.id);
  }, [generatedPleitos, historicoDrafts]);

  const handleSaveAllHistoricoPleitos = async () => {
    if (changedHistoricoPleitoIds.length === 0) return;
    setIsSavingHistoricoPleitos(true);
    try {
      await Promise.all(
        changedHistoricoPleitoIds.map(async (pleitoId) => {
          const draft = historicoDrafts[pleitoId];
          if (!draft) return;
          await api.patch(`/pleitos/${pleitoId}`, {
            billingStatus: draft.billingStatus,
            invoiceNumber: draft.invoiceNumber.trim() || null
          });
        })
      );
      await queryClient.invalidateQueries({ queryKey: ['contract-pleitos', contractId] });
      toast.success('Histórico de pleitos salvo com sucesso.');
    } catch {
      toast.error('Não foi possível salvar as informações do histórico de pleitos.');
    } finally {
      setIsSavingHistoricoPleitos(false);
    }
  };

  const filteredHistoricoPleitoIds = useMemo(
    () => filteredHistoricoPleitos.map((p) => p.id),
    [filteredHistoricoPleitos]
  );
  const allFilteredHistoricoSelected = filteredHistoricoPleitoIds.length > 0 &&
    filteredHistoricoPleitoIds.every((id) => selectedHistoricoPleitos.has(id));
  const someFilteredHistoricoSelected = filteredHistoricoPleitoIds.some((id) => selectedHistoricoPleitos.has(id));

  const toggleSelectAllFilteredHistoricoPleitos = (checked: boolean) => {
    setSelectedHistoricoPleitos((prev) => {
      const next = new Set(prev);
      if (checked) {
        filteredHistoricoPleitoIds.forEach((id) => next.add(id));
      } else {
        filteredHistoricoPleitoIds.forEach((id) => next.delete(id));
      }
      return next;
    });
  };

  const handleOpenHistoricoFaturar100Modal = () => {
    const idsSelecionados = Array.from(selectedHistoricoPleitos).filter((id) =>
      filteredHistoricoPleitoIds.includes(id)
    );
    if (idsSelecionados.length === 0) {
      toast.error('Selecione ao menos uma OS no histórico de pleitos.');
      return;
    }
    setHistoricoBatchInvoiceModalValue('');
    setShowHistoricoBatchNfModal(true);
  };

  const handleConfirmHistoricoFaturar100Selecionadas = () => {
    const idsSelecionados = Array.from(selectedHistoricoPleitos).filter((id) =>
      filteredHistoricoPleitoIds.includes(id)
    );
    if (idsSelecionados.length === 0) {
      toast.error('Selecione ao menos uma OS no histórico de pleitos.');
      return;
    }
    const invoice = historicoBatchInvoiceModalValue.trim();
    if (!invoice) {
      toast.error('Informe o número da nota fiscal para faturar as OSs selecionadas.');
      return;
    }
    setHistoricoDrafts((prev) => {
      const next = { ...prev };
      idsSelecionados.forEach((id) => {
        const current = next[id] || { billingStatus: 'nao-pago' as const, invoiceNumber: '' };
        next[id] = {
          ...current,
          billingStatus: 'pago',
          invoiceNumber: invoice
        };
      });
      return next;
    });
    setShowHistoricoBatchNfModal(false);
    setHistoricoBatchInvoiceModalValue('');
    toast.success(`${idsSelecionados.length} OS(s) marcada(s) como faturada(s) com a NF ${invoice}.`);
  };

  const loadLogoBase64 = (): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        try {
          resolve(c.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = '/logobranca.png';
    });
  };

  const handleExportPleitoPDF = async () => {
    if (pleitoGeradoData.length === 0) return;
    try {
      const logoBase64 = await loadLogoBase64();
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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <Link
                  href="/ponto/contratos"
                  className="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors shrink-0"
                  title="Voltar"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 break-words">
                    <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0" />
                    {contract.name}
                  </h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                    Contrato nº {contract.number} • {contract.costCenter?.name || contract.costCenter?.code || '-'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400 shrink-0">Mês</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="h-9 sm:h-10 min-w-[8rem] sm:min-w-[10rem] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {MESES_FILTRO.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400 shrink-0">Ano</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="h-9 sm:h-10 min-w-[5rem] sm:min-w-[6rem] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value={0}>Todos os anos</option>
                    {availableYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Barra de ações */}
            <div className="flex flex-wrap items-center gap-3 p-4 sm:p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
              {canAccessOrdemServicoModulo ? (
                <button
                  onClick={() => setShowPleitoModal(true)}
                  disabled={!canCreateContrato}
                  className="h-10 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium shrink-0"
                >
                  <ClipboardList className="w-4 h-4 shrink-0" />
                  Ordem de Serviço
                </button>
              ) : null}
              {canAccessProducaoSemanalModulo ? (
                <button
                  onClick={() => {
                    setProductionForm({ fillingDate: toInputDate(new Date()), divSe: '', weeklyProductionValue: '', responsiblePerson: '' });
                    setShowProductionModal(true);
                  }}
                  disabled={!canCreateContrato}
                  className="h-10 px-4 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium shrink-0"
                >
                  <BarChart3 className="w-4 h-4 shrink-0" />
                  Produção Semanal
                </button>
              ) : null}
              {canAccessOrcamento ? (
                <Link
                  href={`/ponto/contratos/${contractId}/orcamento`}
                  className="h-10 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium shrink-0"
                >
                  <Calculator className="w-4 h-4 shrink-0" />
                  Orçamento
                </Link>
              ) : null}
              {canAccessRelatorios ? (
                <Link
                  href={`/ponto/contratos/${contractId}/relatorios`}
                  className="h-10 px-4 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium shrink-0"
                >
                  <FileImage className="w-4 h-4 shrink-0" />
                  Relatórios
                </Link>
              ) : null}
            </div>
          </div>

          {/* Card com resumo do contrato */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Vigência</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {formatDate(contract.startDate)} até {formatDate(contract.endDate)}
                  </p>
                </div>
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-gray-500 dark:text-gray-400">Valor + Aditivos</p>
                    <button
                      type="button"
                      onClick={() => setShowAddendumModal(true)}
                      className="shrink-0 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                      title="Cadastrar aditivo"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(valorMaisAditivosTotal)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Base: {formatCurrency(contract.valuePlusAddenda)} {totalAddenda !== 0 ? `• Aditivos: ${totalAddenda >= 0 ? '+' : ''}${formatCurrency(totalAddenda)}` : ''}
                  </p>
                </div>
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-gray-500 dark:text-gray-400">Valor Anual ({safeSelectedYear})</p>
                    <button
                      type="button"
                      onClick={() => {
                        setAdjFormYear(safeSelectedYear);
                        setShowValorAnualAdjustModal(true);
                      }}
                      className="shrink-0 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                      title="Ajustar valor anual (orçamento do órgão)"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {valorAnualAjustado !== null ? formatCurrency(valorAnualAjustado) : '-'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Base: (Valor + aditivos) ÷ {contractYearsCount > 0 ? contractYearsCount : '—'} ano(s)
                    {valorAnualBase !== null &&
                      valorAnualAjustado !== null &&
                      Math.abs(valorAnualAjustado - valorAnualBase) > 0.009 && (
                        <span className="block mt-0.5">
                          Ajuste orçamentário: {valorAnualAjustado >= valorAnualBase ? '+' : ''}
                          {formatCurrency(valorAnualAjustado - valorAnualBase)}
                        </span>
                      )}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Saldo Anual ({safeSelectedYear})</p>
                  <p className={`font-medium ${saldoAnual !== null && saldoAnual >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {saldoAnual !== null ? formatCurrency(saldoAnual) : '-'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Valor anual − Faturamento
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Meta Mensal ({safeSelectedYear})</p>
                  {metaMensalCardInfo.kind === 'empty' && (
                    <p className="font-medium text-green-600 dark:text-green-400">-</p>
                  )}
                  {metaMensalCardInfo.kind === 'single' && (
                    <p className="font-medium text-green-600 dark:text-green-400">
                      {formatCurrency(metaMensalCardInfo.value)}
                    </p>
                  )}
                  {metaMensalCardInfo.kind === 'split' && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-green-600 dark:text-green-400">
                        Até {metaMensalCardInfo.ateMesLabel}: {formatCurrency(metaMensalCardInfo.baseMeta)}/mês
                      </p>
                      <p className="text-xs font-medium text-emerald-500 dark:text-emerald-400">
                        De {metaMensalCardInfo.deMesLabel}: {formatCurrency(metaMensalCardInfo.metaAfter)}/mês
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Meta = saldo ÷ meses restantes até o fim da vigência. Aditivos em &quot;Valor + Aditivos&quot; recalculam a
                    partir da data até o fim do contrato. Ajuste no &quot;Valor Anual&quot; (lápis) só altera a meta do mês da
                    data até dezembro daquele ano civil.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quadros de faturamento total */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Valor Total Faturado do Ano</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">
                  {formatCurrency(faturamentoAnual)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Ano {safeSelectedYear}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Valor Total Faturado do Contrato</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">
                  {formatCurrency(faturamentoTotalTodosAnos)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Soma de todos os anos
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Valor Total Pendente para Faturar
                </p>
                <p
                  className={`text-xl font-bold mt-1 ${
                    pendenteParaFaturarTodosAnos !== null && pendenteParaFaturarTodosAnos >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {pendenteParaFaturarTodosAnos !== null ? formatCurrency(pendenteParaFaturarTodosAnos) : '-'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Valor + aditivos − faturado total
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Controle Geral - Metas Mensais ou Metas Anuais conforme filtro */}
          <Card>
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              {isAllYears ? (
                <>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Acumulado Anual
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Indicadores anuais por ano
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Controle Geral - {safeSelectedYear}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Meta base = saldo ÷ meses restantes até o fim da vigência. Aditivos em &quot;Valor + Aditivos&quot;
                    recalculam da data do evento até o fim do contrato; ajuste do valor anual recalcula só entre o mês da data
                    e dezembro do mesmo ano civil. Apenas meses cobertos pela vigência.
                  </p>
                </>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                {isAllYears ? (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">
                          Indicador
                        </th>
                        {availableYears.map((year) => (
                          <th
                            key={year}
                            className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[100px]"
                          >
                            {year}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="divide-x divide-gray-200 dark:divide-gray-700">
                        <td className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800/50">
                          Meta Anual
                        </td>
                        {availableYears.map((year) => (
                          <td
                            key={year}
                            className="px-3 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100"
                          >
                            {valorAnualPorAno[year] != null ? formatCurrency(valorAnualPorAno[year]!) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="divide-x divide-gray-200 dark:divide-gray-700 bg-amber-50/50 dark:bg-amber-900/10">
                        <td className="px-4 py-4 text-sm font-medium text-amber-700 dark:text-amber-400 bg-gray-50 dark:bg-gray-800/50">
                          Produção
                        </td>
                        {availableYears.map((year) => (
                          <td
                            key={year}
                            className="px-3 py-4 text-center text-sm font-medium text-amber-700 dark:text-amber-400"
                          >
                            {producaoPorAno[year] > 0 ? formatCurrency(producaoPorAno[year]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="divide-x divide-gray-200 dark:divide-gray-700">
                        <td className="px-4 py-4 text-sm font-medium text-red-600 dark:text-red-400 bg-gray-50 dark:bg-gray-800/50">
                          Pleitos
                        </td>
                        {availableYears.map((year) => (
                          <td
                            key={year}
                            className="px-3 py-4 text-center text-sm font-medium text-red-600 dark:text-red-400"
                          >
                            {pleitosPorAno[year] > 0 ? formatCurrency(pleitosPorAno[year]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="divide-x divide-gray-200 dark:divide-gray-700 bg-green-50/50 dark:bg-green-900/10">
                        <td className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800/50">
                          Faturamento
                        </td>
                        {availableYears.map((year) => (
                          <td
                            key={year}
                            className="px-3 py-4 text-center text-sm font-medium text-green-700 dark:text-green-400"
                          >
                            {faturamentoPorAno[year] > 0 ? formatCurrency(faturamentoPorAno[year]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="divide-x divide-gray-200 dark:divide-gray-700 bg-teal-50/50 dark:bg-teal-900/10">
                        <td className="px-4 py-4 text-sm font-medium text-teal-800 dark:text-teal-300 bg-gray-50 dark:bg-gray-800/50">
                          Prod. - Fat.
                        </td>
                        {availableYears.map((year) => (
                          <td
                            key={year}
                            className="px-3 py-4 text-center text-sm font-medium text-teal-700 dark:text-teal-400"
                          >
                            {prodMenosFatPorAno[year] !== 0
                              ? formatCurrency(prodMenosFatPorAno[year])
                              : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="divide-x divide-gray-200 dark:divide-gray-700 bg-sky-50/50 dark:bg-sky-900/10">
                        <td className="px-4 py-4 text-sm font-medium text-sky-700 dark:text-sky-400 bg-gray-50 dark:bg-gray-800/50">
                          Valor Orçado
                        </td>
                        {availableYears.map((year) => (
                          <td
                            key={year}
                            className="px-3 py-4 text-center text-sm font-medium text-sky-700 dark:text-sky-400"
                          >
                            {valorOrcadoPorAno[year] > 0 ? formatCurrency(valorOrcadoPorAno[year]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="divide-x divide-gray-200 dark:divide-gray-700 bg-orange-50/50 dark:bg-orange-900/10">
                        <td className="px-4 py-4 text-sm font-medium text-orange-700 dark:text-orange-400 bg-gray-50 dark:bg-gray-800/50">
                          Pendente Faturamento
                        </td>
                        {availableYears.map((year) => (
                          <td
                            key={year}
                            className="px-3 py-4 text-center text-sm font-medium text-orange-700 dark:text-orange-400"
                          >
                            {pendenteFaturamentoPorAno[year] !== 0 ? formatCurrency(pendenteFaturamentoPorAno[year]) : '-'}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">
                          Mês
                        </th>
                        {MESES.map((mes) => (
                          <th
                            key={mes}
                            className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[100px]"
                          >
                            {mes}/{safeSelectedYear.toString().slice(-2)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="divide-x divide-gray-200 dark:divide-gray-700">
                        <td className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800/50">
                          Meta Mensal
                        </td>
                        {MESES.map((mes, i) => {
                          const month = i + 1;
                          const cellMeta = metaSchedule.get(toYearMonthKey(safeSelectedYear, month)) ?? null;
                          return (
                          <td
                            key={mes}
                            className="px-3 py-4 text-center text-sm font-medium text-gray-900 dark:text-gray-100"
                          >
                            {cellMeta !== null ? formatCurrency(cellMeta) : '-'}
                          </td>
                          );
                        })}
                      </tr>
                      <tr className="divide-x divide-gray-200 dark:divide-gray-700 bg-amber-50/50 dark:bg-amber-900/10">
                        <td className="px-4 py-4 text-sm font-medium text-amber-700 dark:text-amber-400 bg-gray-50 dark:bg-gray-800/50">
                          Produção
                        </td>
                        {MESES.map((mes, i) => (
                          <td
                            key={mes}
                            className="px-3 py-4 text-center text-sm font-medium text-amber-700 dark:text-amber-400"
                          >
                            {producaoPorMes[i] > 0 ? formatCurrency(producaoPorMes[i]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="divide-x divide-gray-200 dark:divide-gray-700">
                        <td className="px-4 py-4 text-sm font-medium text-red-600 dark:text-red-400 bg-gray-50 dark:bg-gray-800/50">
                          Pleitos
                        </td>
                        {MESES.map((mes, i) => (
                          <td
                            key={mes}
                            className="px-3 py-4 text-center text-sm font-medium text-red-600 dark:text-red-400"
                          >
                            {pleitosPorMes[i] > 0 ? formatCurrency(pleitosPorMes[i]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="divide-x divide-gray-200 dark:divide-gray-700 bg-green-50/50 dark:bg-green-900/10">
                        <td className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800/50">
                          Faturamento
                        </td>
                        {MESES.map((mes, i) => (
                          <td
                            key={mes}
                            className="px-3 py-4 text-center text-sm font-medium text-green-700 dark:text-green-400"
                          >
                            {faturamentoPorMes[i] > 0 ? formatCurrency(faturamentoPorMes[i]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="divide-x divide-gray-200 dark:divide-gray-700 bg-teal-50/50 dark:bg-teal-900/10">
                        <td className="px-4 py-4 text-sm font-medium text-teal-800 dark:text-teal-300 bg-gray-50 dark:bg-gray-800/50">
                          Prod. - Fat.
                        </td>
                        {MESES.map((mes, i) => (
                          <td
                            key={mes}
                            className="px-3 py-4 text-center text-sm font-medium text-teal-700 dark:text-teal-400"
                          >
                            {prodMenosFatPorMes[i] !== 0
                              ? formatCurrency(prodMenosFatPorMes[i])
                              : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="divide-x divide-gray-200 dark:divide-gray-700 bg-sky-50/50 dark:bg-sky-900/10">
                        <td className="px-4 py-4 text-sm font-medium text-sky-700 dark:text-sky-400 bg-gray-50 dark:bg-gray-800/50">
                          Valor Orçado
                        </td>
                        {MESES.map((mes, i) => (
                          <td
                            key={mes}
                            className="px-3 py-4 text-center text-sm font-medium text-sky-700 dark:text-sky-400"
                          >
                            {valorOrcadoPorMes[i] > 0 ? formatCurrency(valorOrcadoPorMes[i]) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="divide-x divide-gray-200 dark:divide-gray-700 bg-orange-50/50 dark:bg-orange-900/10">
                        <td className="px-4 py-4 text-sm font-medium text-orange-700 dark:text-orange-400 bg-gray-50 dark:bg-gray-800/50">
                          Pendente Faturamento
                        </td>
                        {MESES.map((mes, i) => (
                          <td
                            key={mes}
                            className="px-3 py-4 text-center text-sm font-medium text-orange-700 dark:text-orange-400"
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

          {canAccessOrdemServicoModulo ? (
          <>
          {/* Ordem de Serviço - Lista de pleitos do contrato */}
          <Card>
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3 w-full flex-wrap">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Ordem de Serviço
                      </h3>
                      <button
                        onClick={() => setShowPleitoModal(true)}
                        disabled={!canCreateContrato}
                        className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                        title="Nova ordem de serviço"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      {!loadingPleitos && pleitos.length > 0 && (
                        <>
                          <button
                            onClick={handleVisualizarPleito}
                            className="px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-sm font-medium transition-colors"
                          >
                            Visualizar Pleito
                          </button>
                          <button
                            onClick={handleGerarPleito}
                            disabled={!canCreateContrato || gerarPleitoMutation.isPending}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                          >
                            {gerarPleitoMutation.isPending ? 'Gerando...' : 'Gerar Pleito'}
                          </button>
                          <button
                            type="button"
                            onClick={handlePleitar100PorcentoSelecionadas}
                            disabled={gerarPleitoMutation.isPending || selectedForPleito.size === 0}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                            title="Gera pleito com 100% do orçamento em cada OS marcada (sem abrir o modal de %)"
                          >
                            <Percent className="w-4 h-4 shrink-0" />
                            {gerarPleitoMutation.isPending ? 'Gerando...' : 'Pleitear 100%'}
                          </button>
                          <button
                            type="button"
                            onClick={handleGerarCronogramaMensal}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
                          >
                            Gerar cronograma mensal
                          </button>
                          <button
                            type="button"
                            onClick={handleExcluirPleitosSelecionados}
                            disabled={!canDeleteContrato || deletePleitosSelecionadosMutation.isPending || selectedForPleito.size === 0}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                            title="Excluir as ordens de serviço marcadas na tabela"
                          >
                            <Trash2 className="w-4 h-4 shrink-0" />
                            {deletePleitosSelecionadosMutation.isPending ? 'Excluindo...' : 'Excluir selecionadas'}
                          </button>
                        </>
                      )}
                    </div>
                    {!loadingPleitos && allPleitos.length > 0 && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setShowHistoricoOsModal(true)}
                          className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium transition-colors"
                        >
                          Histórico de OS
                        </button>
                        <button
                          onClick={() => setShowHistoricoPleitosModal(true)}
                          className="px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium transition-colors"
                        >
                          Histórico de Pleitos
                        </button>
                      </div>
                    )}
                  </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {filteredPleitos.length} {filteredPleitos.length === 1 ? 'ordem de serviço' : 'ordens de serviço'}
                {selectedMonth > 0 ? ` em ${MESES_FILTRO.find((m) => m.value === selectedMonth)?.label}` : ''}
                {isAllYears ? ' (todos os anos)' : ` (${selectedYear})`}
              </p>
              {!loadingPleitos && pleitos.length > 0 && (
                <div className="flex flex-nowrap items-center gap-4 mt-3 overflow-x-auto pb-1">
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Status Orçamento:</label>
                    <select
                      value={filterStatusOrcamento}
                      onChange={(e) => setFilterStatusOrcamento(e.target.value)}
                      className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-[160px]"
                    >
                      <option value="">Todos</option>
                      {STATUS_ORCAMENTO_OPCOES.map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                      <option value="—">— (vazio)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Status Execução:</label>
                    <select
                      value={filterStatusExecucao}
                      onChange={(e) => setFilterStatusExecucao(e.target.value)}
                      className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-w-[160px]"
                    >
                      <option value="">Todos</option>
                      {STATUS_EXECUCAO_OPCOES.map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                      <option value="—">— (vazio)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Status Faturamento (%):</label>
                    <select
                      value={filterStatusFaturamento}
                      onChange={(e) => setFilterStatusFaturamento(e.target.value)}
                      className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-[160px]"
                    >
                      <option value="">Todos</option>
                      <option value="0">0% (não faturado)</option>
                      <option value="1-25">1% a 25%</option>
                      <option value="26-50">26% a 50%</option>
                      <option value="51-75">51% a 75%</option>
                      <option value="76-99">76% a 99%</option>
                      <option value="100">100% ou mais</option>
                      <option value="sem-orcamento">Sem orçamento</option>
                    </select>
                  </div>
                </div>
              )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingPleitos ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  Carregando ordens de serviço...
                </div>
              ) : filteredPleitos.length === 0 ? (
                <div className="p-8 text-center">
                  <ClipboardList className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">
                    {pleitos.length === 0
                      ? 'Nenhuma ordem de serviço cadastrada para este contrato.'
                      : `Nenhuma ordem de serviço no período selecionado (${selectedMonth > 0 ? MESES_FILTRO.find((m) => m.value === selectedMonth)?.label + ' ' : ''}${isAllYears ? 'todos os anos' : selectedYear}).`}
                  </p>
                  <button
                    onClick={() => setShowPleitoModal(true)}
                    disabled={!canCreateContrato}
                    className="mt-3 text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:no-underline text-sm font-medium"
                  >
                    Cadastrar primeira ordem de serviço
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th data-col-key="select" data-col-lock-first="1" className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-12">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                            }}
                            onChange={(e) => toggleSelectAllVisiblePleitos(e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label="Selecionar todas as ordens de serviço visíveis"
                            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">OS / SE</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Descrição</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Mês/Ano criação</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Data início</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Data término</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status Orçamento</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status Execução</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Orçamento</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Orçamento R01</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Orçamento R02</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Orçamento R03</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Orçamento R04</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status Faturamento (%)</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Período</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Lote</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Local</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Unidade</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">RVI</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">RVF</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Feedback Relatorios</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Engenheiro</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Encarregado</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Preenchimento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:border-gray-700">
                      {displayedPleitos.map((p) => {
                        const osSe = (p.divSe || '').trim();
                        const acumulado = billings
                          .filter((b) => (b.serviceOrder || '').trim() === osSe)
                          .reduce((sum, b) => sum + b.grossValue, 0);
                        const orcamentoPleito = p.budget ? Number(p.budget) : 0;
                        const statusFaturamentoPct = orcamentoPleito > 0 ? (acumulado / orcamentoPleito) * 100 : null;
                        const mesAnoCriacao =
                          p.creationMonth && p.creationYear
                            ? `${String(p.creationMonth).padStart(2, '0')}/${p.creationYear}`
                            : '-';
                        const isSelected = selectedForPleito.has(p.id);
                        return (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedPleitoId(p.id)}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                        >
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedForPleito((prev) => {
                                    const next = new Set(prev);
                                    next.add(p.id);
                                    return next;
                                  });
                                } else {
                                  setSelectedForPleito((prev) => {
                                    const next = new Set(prev);
                                    next.delete(p.id);
                                    return next;
                                  });
                                  setValorPleiteado((prev) => {
                                    const next = { ...prev };
                                    delete next[p.id];
                                    return next;
                                  });
                                }
                              }}
                              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                            {formatOsSePastaOrDash(p.divSe, p.folderNumber)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={p.serviceDescription}>{p.serviceDescription || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{mesAnoCriacao}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.startDate ? formatDate(p.startDate) : '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.endDate ? formatDate(p.endDate) : '-'}</td>
                          <td className="px-4 py-3 text-sm align-middle">
                            <span
                              className={pleitoStatusReadOnlySpanClass('budget', p.budgetStatus)}
                              title={p.budgetStatus || ''}
                            >
                              {p.budgetStatus || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm align-middle">
                            <span
                              className={pleitoStatusReadOnlySpanClass('execution', p.executionStatus)}
                              title={p.executionStatus || ''}
                            >
                              {p.executionStatus || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">{p.budget ? formatCurrency(Number(p.budget)) : '-'}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.budgetAmount1 != null && Number(p.budgetAmount1) > 0 ? formatCurrency(Number(p.budgetAmount1)) : '-'}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.budgetAmount2 != null && Number(p.budgetAmount2) > 0 ? formatCurrency(Number(p.budgetAmount2)) : '-'}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.budgetAmount3 != null && Number(p.budgetAmount3) > 0 ? formatCurrency(Number(p.budgetAmount3)) : '-'}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.budgetAmount4 != null && Number(p.budgetAmount4) > 0 ? formatCurrency(Number(p.budgetAmount4)) : '-'}</td>
                          <td className="px-4 py-3 text-sm text-center text-gray-900 dark:text-gray-100">
                            {statusFaturamentoPct != null ? `${statusFaturamentoPct.toFixed(1)}%` : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {p.startDate && p.endDate
                              ? `${formatDate(p.startDate)} – ${formatDate(p.endDate)}`
                              : p.creationMonth && p.creationYear
                                ? `${String(p.creationMonth).padStart(2, '0')}/${p.creationYear}`
                                : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.lot || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={p.location ?? undefined}>{p.location || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.unit || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.pv || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.ipi || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={p.reportsBilling ?? undefined}>{p.reportsBilling || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.engineer || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.supervisor || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDateTime(p.createdAt || '')}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {!loadingPleitos && filteredPleitos.length > LIST_DISPLAY_LIMIT && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-center">
                  <Link
                    href={`/ponto/contratos/${contractId}/andamento${andamentoLinkParams ? `?${andamentoLinkParams}` : ''}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-sm font-medium transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Ver todos os lançamentos ({filteredPleitos.length})
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
          </>
          ) : null}

          {canAccessProducaoSemanalModulo ? (
          <>
          {/* Produção Semanal */}
          <Card>
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Produção Semanal
                </h3>
                <button
                  onClick={() => {
                    setProductionForm({ fillingDate: toInputDate(new Date()), divSe: '', weeklyProductionValue: '', responsiblePerson: '' });
                    setShowProductionModal(true);
                  }}
                  className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                  title="Nova produção semanal"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {filteredProductions.length} {filteredProductions.length === 1 ? 'registro' : 'registros'}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {loadingProductions ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  Carregando...
                </div>
              ) : filteredProductions.length === 0 ? (
                <div className="p-8 text-center">
                  <BarChart3 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">
                    Nenhuma produção semanal cadastrada.
                  </p>
                  <button
                    onClick={() => {
                    setProductionForm({ fillingDate: toInputDate(new Date()), divSe: '', weeklyProductionValue: '', responsiblePerson: '' });
                    setShowProductionModal(true);
                  }}
                    className="mt-3 text-amber-600 dark:text-amber-400 hover:underline text-sm font-medium"
                  >
                    Cadastrar primeira produção semanal
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
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
                      {filteredProductions.map((p) => (
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
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDateTime(p.createdAt || '')}</td>
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
              )}
            </CardContent>
          </Card>
          </>
          ) : null}

          {/* Faturamento - Lista de notas */}
          <Card>
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Faturamento
                </h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {filteredBillings.length} {filteredBillings.length === 1 ? 'registro' : 'registros'}
                {selectedMonth > 0 ? ` em ${MESES_FILTRO.find((m) => m.value === selectedMonth)?.label}` : ''}
                {isAllYears ? ' (todos os anos)' : ` (${selectedYear})`}
              </p>
              {!loadingBillings && billings.length > 0 && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={filterBillingOsSe}
                    onChange={(e) => setFilterBillingOsSe(e.target.value)}
                    placeholder="Filtrar OS / SE"
                    className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    value={filterBillingInvoice}
                    onChange={(e) => setFilterBillingInvoice(e.target.value)}
                    placeholder="Filtrar Nº nota fiscal"
                    className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    value={filterBillingGross}
                    onChange={(e) => setFilterBillingGross(e.target.value)}
                    placeholder="Filtrar valor bruto"
                    className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
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
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Data Emissão</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nº Nota Fiscal</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">OS / SE</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Valor Bruto</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Preenchimento</th>
                        {canDeleteContrato && (
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-24">Ações</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {displayedBillings.map((b) => (
                        <tr
                          key={b.id}
                          onClick={() => setSelectedBilling(b)}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                        >
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{formatDate(b.issueDate)}</td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100">{b.invoiceNumber}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {formatOsSePastaOrDash(b.serviceOrder, folderForDivSe(pleitos, b.serviceOrder))}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                            <div className="flex flex-col items-end gap-1">
                              <span>{formatCurrency(b.grossValue)}</span>
                              {isNetValueMissing(b) && (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                  FAT. LIQUIDO NAO PREENCHIDO
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDateTime(b.createdAt || '')}</td>
                          {canDeleteContrato && (
                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => {
                                  if (!canDeleteContrato) {
                                    toast.error('Você não tem permissão para excluir no módulo Contratos.');
                                    return;
                                  }
                                  if (confirm('Excluir este faturamento?')) {
                                    deleteBillingMutation.mutate(b.id);
                                  }
                                }}
                                disabled={!canDeleteContrato || deleteBillingMutation.isPending}
                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!loadingBillings && filteredBillings.length > LIST_DISPLAY_LIMIT && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-center">
                  <Link
                    href={`/ponto/contratos/${contractId}/faturamento${faturamentoLinkParams ? `?${faturamentoLinkParams}` : ''}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 text-sm font-medium transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Ver todos os lançamentos ({filteredBillings.length})
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Modal de aditivos do contrato */}
          {showAddendumModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
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
                    Cada aditivo recalcula a meta mensal a partir da data informada até o fim da vigência.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      type="date"
                      value={addendumDate}
                      onChange={(e) => setAddendumDate(e.target.value)}
                      className="h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                    <input
                      type="text"
                      placeholder="Valor (R$)"
                      value={addendumAmount}
                      onChange={(e) => setAddendumAmount(e.target.value)}
                      className="h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const amount = parseCurrencyInput(addendumAmount);
                        if (!addendumDate) return toast.error('Informe a data do aditivo');
                        if (Math.abs(amount) < 1e-9) return toast.error('Informe um valor diferente de zero');
                        createAddendumMutation.mutate({
                          effectiveDate: addendumDate,
                          amount,
                          note: addendumNote.trim() || null
                        });
                      }}
                      className="h-10 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                      disabled={createAddendumMutation.isPending}
                    >
                      {createAddendumMutation.isPending ? 'Salvando…' : 'Adicionar'}
                    </button>
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
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
                    Informe o <strong>valor</strong> (positivo ou negativo) e a <strong>data</strong>. Esse ajuste altera a meta
                    mensal apenas do <strong>mês da data até dezembro do ano civil</strong> selecionado (não altera anos
                    seguintes). Os aditivos cadastrados em &quot;Valor + Aditivos&quot; seguem outra regra e alteram a meta até o
                    fim da vigência. O quadro &quot;Valor + Aditivos&quot; não é alterado por aqui.
                  </p>
                  {valorAnualBase !== null && (
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Valor anual base: <span className="font-medium">{formatCurrency(valorAnualBase)}</span>
                    </p>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ano civil</label>
                    <select
                      value={adjFormYear}
                      onChange={(e) => setAdjFormYear(Number(e.target.value))}
                      className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    >
                      {availableYears.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Ajuste (R$){' '}
                      <span className="font-normal text-gray-500">positivo soma, negativo retira</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">R$</span>
                      <input
                        type="text"
                        value={adjFormDeltaStr}
                        onChange={(e) => setAdjFormDeltaStr(e.target.value)}
                        placeholder="0,00"
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Data do aditivo *
                    </label>
                    <input
                      type="date"
                      value={adjFormDate}
                      onChange={(e) => setAdjFormDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  {valorAnualBase !== null && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Referência (base + aditivo no ano):{' '}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {formatCurrency(valorAnualBase + parseCurrencyInput(adjFormDeltaStr || '0'))}
                      </span>
                      <span className="block mt-1 text-xs">
                        A meta mensal pós-aditivo não é esse valor ÷ 12; use a tabela Controle Geral para ver o rateio.
                      </span>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      disabled={saveAnnualAdjustmentMutation.isPending || clearAnnualAdjustmentMutation.isPending}
                      onClick={() => {
                        const delta = parseCurrencyInput(adjFormDeltaStr || '0');
                        if (!adjFormDate.trim()) {
                          toast.error('Informe a data do aditivo');
                          return;
                        }
                        if (Math.abs(delta) < 1e-9) {
                          toast.error('Informe um valor de ajuste diferente de zero ou use Remover ajuste');
                          return;
                        }
                        saveAnnualAdjustmentMutation.mutate({
                          year: adjFormYear,
                          budgetAdjustmentDelta: delta,
                          budgetAdjustmentEffectiveDate: adjFormDate
                        });
                      }}
                      className="flex-1 min-w-[8rem] h-10 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                    >
                      {saveAnnualAdjustmentMutation.isPending ? 'Salvando…' : 'Salvar'}
                    </button>
                    <button
                      type="button"
                      disabled={saveAnnualAdjustmentMutation.isPending || clearAnnualAdjustmentMutation.isPending}
                      onClick={() => {
                        clearAnnualAdjustmentMutation.mutate(adjFormYear);
                      }}
                      className="flex-1 min-w-[8rem] h-10 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 text-sm font-medium"
                    >
                      {clearAnnualAdjustmentMutation.isPending ? 'Removendo…' : 'Remover ajuste'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowValorAnualAdjustModal(false)}
                      className="flex-1 min-w-[8rem] h-10 px-4 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal Cadastrar Produção Semanal */}
          {showProductionModal && !editingProduction && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Data</label>
                    <input
                      type="date"
                      value={productionForm.fillingDate || toInputDate(new Date())}
                      onChange={(e) => setProductionForm({ ...productionForm, fillingDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Data em que o preenchimento está sendo realizado</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contrato</label>
                    <div className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100">
                      {contract ? `${contract.number} – ${contract.name}` : '-'}
                    </div>
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">OS / SE *</label>
                    <input
                      type="text"
                      required
                      value={productionForm.divSe}
                      onChange={(e) => {
                        setProductionForm({ ...productionForm, divSe: e.target.value });
                        setProductionOsSeDropdownOpen(true);
                      }}
                      onFocus={() => setProductionOsSeDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setProductionOsSeDropdownOpen(false), 150)}
                      placeholder="Digite para buscar ou selecionar"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                    {productionOsSeDropdownOpen && (
                      <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg">
                        {productionOsSeFiltered.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Nenhuma OS encontrada</div>
                        ) : (
                          productionOsSeFiltered.map((opt) => (
                            <button
                              key={`${opt.divSe}-${opt.folderNumber ?? ''}`}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setProductionForm({ ...productionForm, divSe: opt.divSe });
                                setProductionOsSeDropdownOpen(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg"
                            >
                              {formatOsSePasta(opt.divSe, opt.folderNumber)}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                    {divSeOptions.length === 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Responsável pelo Preenchimento *</label>
                    <input
                      type="text"
                      required
                      value={productionForm.responsiblePerson}
                      onChange={(e) => setProductionForm({ ...productionForm, responsiblePerson: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Nome do responsável"
                    />
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Data</label>
                    <input
                      type="date"
                      value={productionEditForm.fillingDate || (selectedProduction?.fillingDate ? toInputDate(selectedProduction.fillingDate) : '')}
                      onChange={(e) => setProductionEditForm({ ...productionEditForm, fillingDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Data em que o preenchimento foi realizado</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contrato</label>
                    <div className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-gray-100">
                      {contract ? `${contract.number} – ${contract.name}` : '-'}
                    </div>
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">OS / SE *</label>
                    <input
                      type="text"
                      required
                      value={productionEditForm.divSe}
                      onChange={(e) => {
                        setProductionEditForm({ ...productionEditForm, divSe: e.target.value });
                        setProductionOsSeEditDropdownOpen(true);
                      }}
                      onFocus={() => setProductionOsSeEditDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setProductionOsSeEditDropdownOpen(false), 150)}
                      placeholder="Digite para buscar ou selecionar"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                    {productionOsSeEditDropdownOpen && (
                      <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg">
                        {productionOsSeEditFiltered.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Nenhuma OS encontrada</div>
                        ) : (
                          productionOsSeEditFiltered.map((opt) => (
                            <button
                              key={`${opt.divSe}-${opt.folderNumber ?? ''}`}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setProductionEditForm({ ...productionEditForm, divSe: opt.divSe });
                                setProductionOsSeEditDropdownOpen(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg"
                            >
                              {formatOsSePasta(opt.divSe, opt.folderNumber)}
                            </button>
                          ))
                        )}
                      </div>
                    )}
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Data de Emissão *</label>
                    <input
                      type="date"
                      required
                      value={billingForm.issueDate}
                      onChange={(e) => setBillingForm({ ...billingForm, issueDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Número da Nota Fiscal *</label>
                    <input
                      type="text"
                      required
                      value={billingForm.invoiceNumber}
                      onChange={(e) => setBillingForm({ ...billingForm, invoiceNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      placeholder="Ex: 000123"
                    />
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">OS / SE *</label>
                    <input
                      type="text"
                      required
                      value={billingForm.serviceOrder}
                      onChange={(e) => {
                        setBillingForm({ ...billingForm, serviceOrder: e.target.value });
                        setOsSeDropdownOpen(true);
                      }}
                      onFocus={() => setOsSeDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setOsSeDropdownOpen(false), 150)}
                      placeholder="Digite para buscar ou selecionar"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                    {osSeDropdownOpen && (
                      <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg">
                        {osSeFiltered.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                            Nenhuma OS encontrada
                          </div>
                        ) : (
                          osSeFiltered.map((opt) => (
                            <button
                              key={`${opt.divSe}-${opt.folderNumber ?? ''}`}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setBillingForm({ ...billingForm, serviceOrder: opt.divSe });
                                setOsSeDropdownOpen(false);
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg"
                            >
                              {formatOsSePasta(opt.divSe, opt.folderNumber)}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                    {divSeOptions.length === 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Nenhuma OS cadastrada em Ordem de Serviço. Cadastre uma ordem de serviço com o campo OS / SE.
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
              <div className="absolute inset-0" onClick={() => setShowPleitoValoresModal(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Informar valores do pleito</h3>
                  <button onClick={() => setShowPleitoValoresModal(false)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Informe a % do orçamento para cada OS selecionada:</p>
                  {Array.from(selectedForPleito).map((id) => {
                    const p = pleitos.find((x) => x.id === id);
                    if (!p) return null;
                    const orc = p.budget ? Number(p.budget) : 0;
                    const pctNum = parseCurrencyInput(valorPleiteado[id] || '');
                    const valorCalculado = orc > 0 && pctNum > 0 ? (orc * pctNum) / 100 : null;
                    const alreadyPleiteado = sumBillingRequestSameOs(allPleitos, p.divSe);
                    const restanteParaFaturar = orc > 0 ? Math.max(0, orc - alreadyPleiteado) : null;
                    const excedeOrcamento = pleitoModalExcedeState.byId[id] === true;
                    return (
                      <div key={id} className="p-3 border border-gray-200 dark:border-gray-600 rounded-lg space-y-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          OS/SE: {formatOsSePastaOrDash(p.divSe, p.folderNumber)} — {p.serviceDescription?.substring(0, 40) || '-'}
                          {p.serviceDescription && p.serviceDescription.length > 40 ? '...' : ''}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Orçamento: {p.budget ? formatCurrency(Number(p.budget)) : '-'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Restante para faturar:{' '}
                          {restanteParaFaturar != null ? formatCurrency(restanteParaFaturar) : '—'}
                        </p>
                        {excedeOrcamento && (
                          <p className="text-xs font-medium text-red-600 dark:text-red-400">valor faturado acima do permitido</p>
                        )}
                        <div className="flex gap-4 items-end">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">% Orçamento</label>
                            <input
                              type="text"
                              value={valorPleiteado[id] || ''}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, '');
                                const formatted = v ? (Number(v) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
                                setValorPleiteado((prev) => ({ ...prev, [id]: formatted }));
                              }}
                              placeholder="0,00"
                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                          <div className="w-40">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Valor pleiteado</label>
                            <div className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300">
                              {valorCalculado != null ? formatCurrency(valorCalculado) : '—'}
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

          {showHistoricoPleitosModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
              <div className="absolute inset-0" onClick={() => setShowHistoricoPleitosModal(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-[95vw] w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Histórico de Pleitos</h3>
                  <button onClick={() => setShowHistoricoPleitosModal(false)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6">
                  {generatedPleitos.length === 0 ? (
                    <div className="py-8 text-center text-gray-500 dark:text-gray-400">Nenhum pleito gerado até o momento.</div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                        <select
                          value={histMonthFilter}
                          onChange={(e) => setHistMonthFilter(e.target.value)}
                          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        >
                          <option value="all">Mês: Todos</option>
                          {MESES_FILTRO.filter((m) => m.value > 0).map((m) => (
                            <option key={m.value} value={String(m.value)}>{m.label}</option>
                          ))}
                        </select>
                        <select
                          value={histYearFilter}
                          onChange={(e) => setHistYearFilter(e.target.value)}
                          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        >
                          <option value="all">Ano: Todos</option>
                          {historicoYears.map((y) => (
                            <option key={y} value={String(y)}>{y}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={histOsFilter}
                          onChange={(e) => setHistOsFilter(e.target.value)}
                          placeholder="OS / SE"
                          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                        <input
                          type="text"
                          value={histPastaFilter}
                          onChange={(e) => setHistPastaFilter(e.target.value)}
                          placeholder="Nº Pasta"
                          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                        <input
                          type="text"
                          value={histDescricaoFilter}
                          onChange={(e) => setHistDescricaoFilter(e.target.value)}
                          placeholder="Descrição"
                          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                        <select
                          value={histEtiquetaFilter}
                          onChange={(e) => setHistEtiquetaFilter(e.target.value)}
                          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        >
                          <option value="all">Etiqueta: Todas</option>
                          <option value="gerado-100">{HISTORICO_ETIQUETA_GERADO_100}</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <button
                            type="button"
                            onClick={handleOpenHistoricoFaturar100Modal}
                            disabled={isSavingHistoricoPleitos || selectedHistoricoPleitos.size === 0}
                            className="px-4 py-2 text-sm font-medium rounded-lg bg-rose-700 text-white hover:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            Faturar 100% selecionadas
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveAllHistoricoPleitos}
                          disabled={isSavingHistoricoPleitos || changedHistoricoPleitoIds.length === 0}
                          className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSavingHistoricoPleitos
                            ? 'Salvando...'
                            : `Salvar alterações${changedHistoricoPleitoIds.length > 0 ? ` (${changedHistoricoPleitoIds.length})` : ''}`}
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                      <table className="w-full min-w-[1500px]">
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-12">
                              <input
                                type="checkbox"
                                checked={allFilteredHistoricoSelected}
                                ref={(el) => {
                                  if (el) el.indeterminate = someFilteredHistoricoSelected && !allFilteredHistoricoSelected;
                                }}
                                onChange={(e) => toggleSelectAllFilteredHistoricoPleitos(e.target.checked)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label="Selecionar OSs filtradas no histórico de pleitos"
                                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500"
                              />
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Pago pelo cliente</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Nº NF</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Etiqueta</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">OS / SE</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Descrição</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Orçamento</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Valor pleiteado</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">% Orçamento</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Preenchimento</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:border-gray-700">
                          {filteredHistoricoPleitos.map((p) => {
                            const orc = p.budget ? Number(p.budget) : 0;
                            const valorPleito = p.billingRequest ? Number(p.billingRequest) : 0;
                            const pct = orc > 0 ? (valorPleito / orc) * 100 : null;
                            const rowDraft = historicoDrafts[p.id] || {
                              billingStatus: ((p.billingStatus || '').toLowerCase() === 'pago' ? 'pago' : 'nao-pago') as 'pago' | 'nao-pago',
                              invoiceNumber: p.invoiceNumber || ''
                            };
                            const etiqueta = getHistoricoEtiqueta(p);
                            const isSelectedHistorico = selectedHistoricoPleitos.has(p.id);
                            return (
                              <tr
                                key={p.id}
                                onClick={() => setSelectedPleitoId(p.id)}
                                className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer ${isSelectedHistorico ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                              >
                                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isSelectedHistorico}
                                    onChange={(e) =>
                                      setSelectedHistoricoPleitos((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) {
                                          next.add(p.id);
                                        } else {
                                          next.delete(p.id);
                                        }
                                        return next;
                                      })
                                    }
                                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500"
                                  />
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100" onClick={(e) => e.stopPropagation()}>
                                  <select
                                    value={rowDraft.billingStatus}
                                    disabled={isSavingHistoricoPleitos}
                                    onChange={(e) =>
                                      setHistoricoDrafts((prev) => ({
                                        ...prev,
                                        [p.id]: {
                                          ...rowDraft,
                                          billingStatus: e.target.value === 'pago' ? 'pago' : 'nao-pago'
                                        }
                                      }))
                                    }
                                    className="w-full bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm text-gray-900 dark:text-gray-100 disabled:opacity-60"
                                  >
                                    <option value="nao-pago">Não pago</option>
                                    <option value="pago">Pago</option>
                                  </select>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    value={rowDraft.invoiceNumber}
                                    placeholder="Informar Nº NF"
                                    disabled={isSavingHistoricoPleitos}
                                    onChange={(e) =>
                                      setHistoricoDrafts((prev) => ({
                                        ...prev,
                                        [p.id]: {
                                          ...rowDraft,
                                          invoiceNumber: e.target.value
                                        }
                                      }))
                                    }
                                    className="w-full min-w-[140px] bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder:text-gray-400 disabled:opacity-60"
                                  />
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                  {etiqueta ? (
                                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 text-xs font-medium">
                                      {etiqueta}
                                    </span>
                                  ) : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {formatOsSePastaOrDash(p.divSe, p.folderNumber)}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={p.serviceDescription}>{p.serviceDescription || '-'}</td>
                                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">{p.budget ? formatCurrency(Number(p.budget)) : '-'}</td>
                                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">{formatCurrency(valorPleito)}</td>
                                <td className="px-4 py-3 text-sm text-center text-gray-900 dark:text-gray-100">{pct != null ? `${pct.toFixed(1)}%` : '-'}</td>
                                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDateTime(p.createdAt || '')}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {showHistoricoOsModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
              <div className="absolute inset-0" onClick={() => setShowHistoricoOsModal(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-[95vw] w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Histórico de OS</h3>
                  <button onClick={() => setShowHistoricoOsModal(false)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6">
                  {historicoOsList.length === 0 ? (
                    <div className="py-8 text-center text-gray-500 dark:text-gray-400">Nenhuma OS movida para histórico até o momento.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px]">
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Etiqueta</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">OS / SE</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Descrição</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Orçamento</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Valor pleiteado</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">Preenchimento</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:border-gray-700">
                          {historicoOsList.map((p) => {
                            const etiqueta = getHistoricoEtiqueta(p);
                            const valorPleito = p.billingRequest ? Number(p.billingRequest) : 0;
                            return (
                              <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                  {etiqueta ? (
                                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 text-xs font-medium">
                                      {etiqueta}
                                    </span>
                                  ) : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {formatOsSePastaOrDash(p.divSe, p.folderNumber)}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={p.serviceDescription}>
                                  {p.serviceDescription || '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                                  {p.budget ? formatCurrency(Number(p.budget)) : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                                  {formatCurrency(valorPleito)}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                  {formatDateTime(p.createdAt || '')}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {showHistoricoBatchNfModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2">
              <div className="absolute inset-0" onClick={() => setShowHistoricoBatchNfModal(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Faturar 100% das OSs selecionadas</h3>
                  <button
                    onClick={() => setShowHistoricoBatchNfModal(false)}
                    className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Informe o número da nota fiscal uma única vez para aplicar em todas as OSs selecionadas.
                  </p>
                  <input
                    type="text"
                    value={historicoBatchInvoiceModalValue}
                    onChange={(e) => setHistoricoBatchInvoiceModalValue(e.target.value)}
                    placeholder="Número da Nota Fiscal"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    autoFocus
                  />
                </div>
                <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowHistoricoBatchNfModal(false)}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmHistoricoFaturar100Selecionadas}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-rose-700 text-white hover:bg-rose-800"
                  >
                    Aplicar nas selecionadas
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Resumo do Pleito */}
          {showPleitoResumoModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
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
                  <div className="overflow-x-auto">
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Data de Emissão *</label>
                      <input
                        type="date"
                        required
                        value={billingEditForm.issueDate}
                        onChange={(e) => setBillingEditForm({ ...billingEditForm, issueDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Número da Nota Fiscal *</label>
                      <input
                        type="text"
                        required
                        value={billingEditForm.invoiceNumber}
                        onChange={(e) => setBillingEditForm({ ...billingEditForm, invoiceNumber: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        placeholder="Ex: 000123"
                      />
                    </div>
                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">OS / SE *</label>
                      <input
                        type="text"
                        required
                        value={billingEditForm.serviceOrder}
                        onChange={(e) => {
                          setBillingEditForm({ ...billingEditForm, serviceOrder: e.target.value });
                          setOsSeEditDropdownOpen(true);
                        }}
                        onFocus={() => setOsSeEditDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setOsSeEditDropdownOpen(false), 150)}
                        placeholder="Digite para buscar ou selecionar"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                      {osSeEditDropdownOpen && (
                        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg">
                          {osSeEditFiltered.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Nenhuma OS encontrada</div>
                          ) : (
                            osSeEditFiltered.map((opt) => (
                              <button
                                key={`${opt.divSe}-${opt.folderNumber ?? ''}`}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setBillingEditForm({ ...billingEditForm, serviceOrder: opt.divSe });
                                  setOsSeEditDropdownOpen(false);
                                }}
                                className="w-full px-3 py-2 text-left text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg"
                              >
                                {formatOsSePasta(opt.divSe, opt.folderNumber)}
                              </button>
                            ))
                          )}
                        </div>
                      )}
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Valor Líquido</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">R$</span>
                        <input
                          type="text"
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
                          placeholder="Se vazio, será 0,00"
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
              <div className="absolute inset-0" onClick={() => setSelectedPleitoId(null)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <ClipboardList className="w-5 h-5" />
                    Detalhes do Ordem de Serviço
                  </h3>
                  <div className="flex items-center gap-2">
                    {pleitoDetailData?.data && (
                      <button
                        onClick={() => {
                          setPleitoToEdit({
                            ...(pleitoDetailData.data as PleitoFormData),
                            id: pleitoDetailData.data.id
                          });
                          setSelectedPleitoId(null);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4" />
                        Editar
                      </button>
                    )}
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
                    </div>
                    );
                  })() : (
                    <div className="py-8 text-center text-gray-500 dark:text-gray-400">Andamento não encontrado.</div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
