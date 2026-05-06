'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import jsPDF from 'jspdf';
import { ArrowLeft, AlertCircle, ClipboardList, Edit2, FileDown, Percent, Plus, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { STATUS_ORCAMENTO_OPCOES, STATUS_EXECUCAO_OPCOES, type PleitoFormData } from '@/lib/pleitoForm';
import {
  budgetStatusPillClass,
  executionStatusPillClass,
  pleitoStatusSelectBase
} from '@/lib/pleitoStatusStyles';
import { PleitoFormModal } from '@/components/pleito/PleitoFormModal';
import { useContractTableColumnCustomizer } from '@/components/useContractTableColumnCustomizer';
import { formatOsSePasta, formatOsSePastaOrDash } from '@/lib/formatOsSePasta';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/usePermissions';

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
  billingRequest?: number | null;
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
  pv?: string | null;
  ipi?: string | null;
  createdAt?: string;
}

interface ContractBilling {
  id: string;
  issueDate: string;
  invoiceNumber: string;
  serviceOrder: string;
  grossValue: number;
  netValue: number;
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

const PLEITO_HISTORY_MARKER = '__PLEITO_HISTORICO__';
const PLEITO_HISTORY_MARKER_GERADO_100 = '__PLEITO_HISTORICO__GERADO_100__';
const HISTORICO_ETIQUETA_GERADO_100 = 'Gerado 100%';

function displayReportsBilling(value: string | null | undefined): string {
  const t = (value || '').trim();
  if (!t) return '-';
  if (t === PLEITO_HISTORY_MARKER) return '—';
  if (t === PLEITO_HISTORY_MARKER_GERADO_100) return HISTORICO_ETIQUETA_GERADO_100;
  return value || '-';
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

type FaturamentoCategoria = 'sem-orcamento' | '0' | '1-25' | '26-50' | '51-75' | '76-99' | '100';

function getFaturamentoCategoria(statusPct: number | null, orcamentoPleito: number): FaturamentoCategoria {
  if (orcamentoPleito <= 0 || statusPct == null || Number.isNaN(statusPct)) return 'sem-orcamento';
  if (statusPct < 1) return '0';
  if (statusPct >= 1 && statusPct <= 25) return '1-25';
  if (statusPct >= 26 && statusPct <= 50) return '26-50';
  if (statusPct >= 51 && statusPct <= 75) return '51-75';
  if (statusPct >= 76 && statusPct < 100) return '76-99';
  return '100';
}

function getTargetPctForCategoria(cat: FaturamentoCategoria): number {
  // Alvos aproximados (para refletir faixas do filtro e arredondamento da UI).
  if (cat === '0') return 0.00001; // garante ~0.0% no toFixed(1)
  if (cat === '1-25') return 10;
  if (cat === '26-50') return 40;
  if (cat === '51-75') return 60;
  if (cat === '76-99') return 90;
  if (cat === '100') return 100;
  // sem-orcamento é tratado fora (budget=null)
  return 0;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-';
  const raw = String(dateStr).trim();
  const only = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = only
    ? new Date(Number(only[1]), Number(only[2]) - 1, Number(only[3]), 12, 0, 0, 0)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatDateTime(dateStr: string) {
  if (!dateStr) return '-';
  const raw = String(dateStr).trim();
  const only = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = only
    ? new Date(Number(only[1]), Number(only[2]) - 1, Number(only[3]), 12, 0, 0, 0)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function parseCurrencyInput(value: string): number {
  if (!value || typeof value !== 'string') return 0;
  const cleaned = value.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? 0 : num;
}

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

export default function AndamentoListPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = params?.id;
  const contractId =
    typeof idParam === 'string' ? idParam : Array.isArray(idParam) ? idParam[0] ?? '' : '';

  const { canAccessContractOrdemServicoTab, isLoading: loadingPermissions } = usePermissions();
  const canAccessOsTab = contractId ? canAccessContractOrdemServicoTab(contractId) : false;

  const queryClient = useQueryClient();

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const containerRef = useRef<HTMLDivElement | null>(null);

  const yearParam = searchParams?.get('year') ?? null;
  const monthParam = searchParams?.get('month') ?? null;
  const statusOrcamentoParam = searchParams?.get('statusOrcamento') ?? null;
  const statusExecucaoParam = searchParams?.get('statusExecucao') ?? null;
  const statusFaturamentoParam = searchParams?.get('statusFaturamento') ?? null;
  const selectedIdsParam = searchParams?.get('selectedIds') ?? null;

  const [selectedYear, setSelectedYear] = useState(() => (yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(() => (monthParam ? parseInt(monthParam, 10) : 0));
  const [filterStatusOrcamento, setFilterStatusOrcamento] = useState(statusOrcamentoParam || '');
  const [filterStatusExecucao, setFilterStatusExecucao] = useState(statusExecucaoParam || '');
  const [filterStatusFaturamento, setFilterStatusFaturamento] = useState(statusFaturamentoParam || '');
  const [filterBudgetEmpty, setFilterBudgetEmpty] = useState<'all' | 'empty' | 'filled'>('all');
  const [filterDescricao, setFilterDescricao] = useState('');
  const [filterLote, setFilterLote] = useState('');
  const [filterUnidade, setFilterUnidade] = useState('');
  const [filterEngenheiro, setFilterEngenheiro] = useState('');
  const [savingPleitoId, setSavingPleitoId] = useState<string | null>(null);
  const [selectedPleitoId, setSelectedPleitoId] = useState<string | null>(null);
  const [selectedForPleito, setSelectedForPleito] = useState<Set<string>>(new Set());
  const [valorPleiteado, setValorPleiteado] = useState<Record<string, string>>({});
  const [showPleitoValoresModal, setShowPleitoValoresModal] = useState(false);
  const [showHistoricoPleitosModal, setShowHistoricoPleitosModal] = useState(false);
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
  const [isSavingHistoricoPleitos, setIsSavingHistoricoPleitos] = useState(false);
  const [pleitoGeradoData, setPleitoGeradoData] = useState<Array<{ pleito: ContractPleito; valorPleiteado: number; pctOrcamento: number }>>([]);
  const [showPleitoResumoModal, setShowPleitoResumoModal] = useState(false);
  const [showPleitoModal, setShowPleitoModal] = useState(false);
  const [pleitoToEdit, setPleitoToEdit] = useState<(PleitoFormData & { id: string }) | null>(null);

  const isAllYears = selectedYear === 0;

  const { data: contractData, isLoading: loadingContract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}`);
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
    enabled: !!contractId && canAccessOsTab
  });

  const { data: billingsData } = useQuery({
    queryKey: ['contract-billings', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/billings`);
      return res.data;
    },
    enabled: !!contractId
  });

  const { data: pleitoDetailData, isLoading: loadingPleitoDetail } = useQuery({
    queryKey: ['pleito', selectedPleitoId],
    queryFn: async () => {
      const res = await api.get(`/pleitos/${selectedPleitoId}`);
      return res.data;
    },
    enabled: !!selectedPleitoId && canAccessOsTab
  });

  const allPleitos = (Array.isArray(pleitosData) ? pleitosData : (pleitosData as { data?: ContractPleito[] })?.data) || [];
  const pleitos = allPleitos.filter((p) => !isPleitoHistorico(p));
  const billings = (Array.isArray(billingsData) ? billingsData : (billingsData as { data?: ContractBilling[] })?.data) || [];
  const selectedIdsFilter = useMemo(() => {
    if (!selectedIdsParam) return new Set<string>();
    return new Set(
      selectedIdsParam
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    );
  }, [selectedIdsParam]);

  const filteredPleitos = useMemo(() => {
    let result = pleitos.filter((p) => {
      const year = p.creationYear ?? (p.startDate ? new Date(p.startDate).getFullYear() : null);
      if (!isAllYears && (year === null || year !== selectedYear)) return false;
      if (selectedMonth === 0) return true;
      const monthNum = p.creationMonth ? parseInt(String(p.creationMonth).replace(/\D/g, '') || '0', 10) : null;
      if (monthNum === null && p.startDate) {
        return new Date(p.startDate).getMonth() + 1 === selectedMonth;
      }
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

        if (filterStatusFaturamento === '0') return statusPct !== null && statusPct < 1;
        if (filterStatusFaturamento === '1-25') return statusPct !== null && statusPct >= 1 && statusPct <= 25;
        if (filterStatusFaturamento === '26-50') return statusPct !== null && statusPct >= 26 && statusPct <= 50;
        if (filterStatusFaturamento === '51-75') return statusPct !== null && statusPct >= 51 && statusPct <= 75;
        if (filterStatusFaturamento === '76-99') return statusPct !== null && statusPct >= 76 && statusPct < 100;
        if (filterStatusFaturamento === '100') return statusPct !== null && statusPct >= 100;
        if (filterStatusFaturamento === 'sem-orcamento') return statusPct === null && orcamento === 0;
        return true;
      });
    }

    // Filtros por colunas (Orçamento, Descrição, Lote, Unidade, Engenheiro)
    if (filterBudgetEmpty === 'empty') {
      result = result.filter((p) => p.budget == null || Number(p.budget) === 0);
    } else if (filterBudgetEmpty === 'filled') {
      result = result.filter((p) => p.budget != null && Number(p.budget) > 0);
    }

    const descricaoQuery = filterDescricao.trim().toLowerCase();
    if (descricaoQuery) {
      result = result.filter((p) => (p.serviceDescription || '').toLowerCase().includes(descricaoQuery));
    }

    const loteQuery = filterLote.trim().toLowerCase();
    if (loteQuery) {
      result = result.filter((p) => (p.lot || '').toLowerCase().includes(loteQuery));
    }

    const unidadeQuery = filterUnidade.trim().toLowerCase();
    if (unidadeQuery) {
      result = result.filter((p) => (p.unit || '').toLowerCase().includes(unidadeQuery));
    }

    const engenheiroQuery = filterEngenheiro.trim().toLowerCase();
    if (engenheiroQuery) {
      result = result.filter((p) => (p.engineer || '').toLowerCase().includes(engenheiroQuery));
    }

    if (selectedIdsFilter.size > 0) {
      result = result.filter((p) => selectedIdsFilter.has(p.id));
    }

    return result;
  }, [
    pleitos,
    isAllYears,
    selectedYear,
    selectedMonth,
    filterStatusOrcamento,
    filterStatusExecucao,
    filterStatusFaturamento,
    filterBudgetEmpty,
    filterDescricao,
    filterLote,
    filterUnidade,
    filterEngenheiro,
    billings,
    selectedIdsFilter
  ]);

  const contract = contractData as { name?: string; number?: string } | undefined;

  useContractTableColumnCustomizer(containerRef, 'contracts:andamento', filteredPleitos);

  const updatePleitoInline = async (pleitoId: string, data: Record<string, unknown>) => {
    setSavingPleitoId(pleitoId);
    try {
      await api.patch(`/pleitos/${pleitoId}`, data);
      await queryClient.invalidateQueries({ queryKey: ['contract-pleitos', contractId] });
    } catch (err) {
      console.error('Erro ao atualizar OS inline:', err);
    } finally {
      setSavingPleitoId(null);
    }
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

  const handleGerarPleito = () => {
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
    window.open(`/ponto/contratos/${contractId}/andamento?${p.toString()}`, '_blank', 'noopener,noreferrer');
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
    const ids = Array.from(selectedForPleito);
    const pendingByOs = new Map<string, number>();
    const items: { id: string; billingRequest: number }[] = [];
    for (const id of ids) {
      const pctStr = valorPleiteado[id] || '';
      const pct = parseCurrencyInput(pctStr);
      const p = pleitos.find((x) => x.id === id);
      const orcamento = p?.budget ? Number(p.budget) : 0;

      if (orcamento <= 0) {
        toast.error(`A OS ${p?.divSe || id} está sem orçamento para cálculo do pleito.`);
        return;
      }
      if (pct <= 0) {
        toast.error(`Informe a % do orçamento para a OS ${p?.divSe || id}`);
        return;
      }
      const valorCalculado = (orcamento * pct) / 100;
      const osKey = (p.divSe || '').trim().toLowerCase();
      const alreadyPleiteado = sumBillingRequestSameOs(allPleitos, p.divSe);
      const batchPending = pendingByOs.get(osKey) || 0;
      if (alreadyPleiteado + batchPending + valorCalculado > orcamento + 0.01) {
        toast.error('valor faturado acima do permitido');
        return;
      }
      pendingByOs.set(osKey, batchPending + valorCalculado);
      items.push({ id, billingRequest: valorCalculado });
    }
    gerarPleitoMutation.mutate(items.map((item) => ({ ...item, generatedByPleitear100: false })));
  };

  const handlePleitar100PorcentoSelecionadas = () => {
    const ids = Array.from(selectedForPleito);
    if (ids.length === 0) {
      toast.error('Selecione ao menos uma ordem de serviço.');
      return;
    }
    if (!window.confirm(`Gerar pleito a 100% do orçamento para ${ids.length} OS(s) selecionada(s)?`)) {
      return;
    }
    const pendingByOs = new Map<string, number>();
    const items: { id: string; billingRequest: number }[] = [];
    for (const id of ids) {
      const p = pleitos.find((x) => x.id === id);
      const orcamento = p?.budget ? Number(p.budget) : 0;
      if (orcamento <= 0) {
        toast.error(`A OS ${p?.divSe || id} está sem orçamento para cálculo do pleito.`);
        return;
      }
      const valorCalculado = orcamento;
      const osKey = (p?.divSe || '').trim().toLowerCase();
      const alreadyPleiteado = sumBillingRequestSameOs(allPleitos, p?.divSe);
      const batchPending = pendingByOs.get(osKey) || 0;
      if (alreadyPleiteado + batchPending + valorCalculado > orcamento + 0.01) {
        toast.error('valor faturado acima do permitido');
        return;
      }
      pendingByOs.set(osKey, batchPending + valorCalculado);
      items.push({ id, billingRequest: valorCalculado });
    }
    gerarPleitoMutation.mutate(items.map((item) => ({ ...item, generatedByPleitear100: true })));
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

  const generatedPleitos = useMemo(
    () =>
      allPleitos.filter((p) =>
        isPleitoHistorico(p) ||
        ((p.billingRequest != null ? Number(p.billingRequest) : 0) > 0)
      ),
    [allPleitos]
  );
  const historicoYears = useMemo(() => {
    const years = new Set<number>();
    generatedPleitos.forEach((p) => {
      const y = p.creationYear ?? (p.createdAt ? new Date(p.createdAt).getFullYear() : null);
      if (y) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [generatedPleitos]);
  const filteredHistoricoPleitos = useMemo(() => {
    const osQuery = histOsFilter.trim().toLowerCase();
    const pastaQuery = histPastaFilter.trim().toLowerCase();
    const descricaoQuery = histDescricaoFilter.trim().toLowerCase();
    return generatedPleitos.filter((p) => {
      const year = p.creationYear ?? (p.createdAt ? new Date(p.createdAt).getFullYear() : null);
      const monthRaw = p.creationMonth ? parseInt(String(p.creationMonth).replace(/\D/g, '') || '0', 10) : null;
      const month = monthRaw && monthRaw > 0 ? monthRaw : (p.createdAt ? new Date(p.createdAt).getMonth() + 1 : null);

      if (histYearFilter !== 'all' && year !== Number(histYearFilter)) return false;
      if (histMonthFilter !== 'all' && month !== Number(histMonthFilter)) return false;
      if (osQuery && !(p.divSe || '').toLowerCase().includes(osQuery)) return false;
      if (pastaQuery && !(p.folderNumber || '').toLowerCase().includes(pastaQuery)) return false;
      if (descricaoQuery && !(p.serviceDescription || '').toLowerCase().includes(descricaoQuery)) return false;
      if (histEtiquetaFilter === 'gerado-100' && getHistoricoEtiqueta(p) !== HISTORICO_ETIQUETA_GERADO_100) return false;
      return true;
    });
  }, [generatedPleitos, histYearFilter, histMonthFilter, histOsFilter, histPastaFilter, histDescricaoFilter, histEtiquetaFilter]);

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
        next[id] = { ...current, billingStatus: 'pago', invoiceNumber: invoice };
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
    } catch {
      toast.error('Erro ao exportar PDF');
    }
  };

  const visiblePleitoIds = useMemo(() => filteredPleitos.map((p) => p.id), [filteredPleitos]);
  const allVisibleSelected = visiblePleitoIds.length > 0 && visiblePleitoIds.every((id) => selectedForPleito.has(id));
  const someVisibleSelected = visiblePleitoIds.some((id) => selectedForPleito.has(id));

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

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  if (!contractId || loadingContract || loadingPermissions) {
    return (
      <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  if (!canAccessOsTab) {
    return (
      <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <div className="w-full max-w-lg mx-auto px-4 sm:px-6 py-8">
            <Card className="border-red-200 dark:border-red-800">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0 mt-1" />
                  <div>
                    <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">Acesso negado</h3>
                    <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                      Você não tem permissão para Ordem de Serviço neste contrato. Peça ao administrador para marcar a permissão nas configurações do usuário.
                    </p>
                    <Link
                      href={`/ponto/contratos/${contractId}`}
                      className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Voltar ao contrato
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </MainLayout>
      </ProtectedRoute>
    );
  }
    return (
    <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div ref={containerRef} className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href={`/ponto/contratos/${contractId}`}
            className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-6 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao contrato
          </Link>

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Ordem de Serviço
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {contract?.number} – {contract?.name}
            </p>
          </div>

          <Card>
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-col gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3 w-full flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ClipboardList className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Todas as ordens de serviço
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowPleitoModal(true)}
                      className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                      title="Nova ordem de serviço"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    {!loadingPleitos && pleitos.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={handleVisualizarPleito}
                          className="px-3 py-1.5 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-gray-900 text-sm font-medium transition-colors"
                        >
                          Visualizar Pleito
                        </button>
                        <button
                          type="button"
                          onClick={handleGerarPleito}
                          disabled={gerarPleitoMutation.isPending}
                          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                        >
                          {gerarPleitoMutation.isPending ? 'Gerando...' : 'Gerar Pleito'}
                        </button>
                        <button
                          type="button"
                          onClick={handlePleitar100PorcentoSelecionadas}
                          disabled={gerarPleitoMutation.isPending || selectedForPleito.size === 0}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                          title="Gera pleito com 100% do orçamento em cada OS marcada"
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
                      </>
                    )}
                  </div>
                  {!loadingPleitos && pleitos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHistoricoPleitosModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium transition-colors shrink-0"
                    >
                      Histórico de Pleitos
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {filteredPleitos.length} {filteredPleitos.length === 1 ? 'ordem de serviço' : 'ordens de serviço'}
                  {selectedMonth > 0 ? ` em ${MESES_FILTRO.find((m) => m.value === selectedMonth)?.label}` : ''}
                  {isAllYears ? ' (todos os anos)' : ` (${selectedYear})`}
                </p>
              </div>

              <div className="w-full">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Ano:</label>
                    <select
                      value={selectedYear || ''}
                      onChange={(e) => setSelectedYear(e.target.value ? parseInt(e.target.value, 10) : 0)}
                      className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full"
                    >
                      <option value="0">Todos</option>
                      {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Mês:</label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                      className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full"
                    >
                      {MESES_FILTRO.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Status Orçamento:</label>
                    <select
                      value={filterStatusOrcamento}
                      onChange={(e) => setFilterStatusOrcamento(e.target.value)}
                      className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full"
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
                      className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full"
                    >
                      <option value="">Todos</option>
                      {STATUS_EXECUCAO_OPCOES.map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                      <option value="—">— (vazio)</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Status Faturamento (%):</label>
                    <select
                      value={filterStatusFaturamento}
                      onChange={(e) => setFilterStatusFaturamento(e.target.value)}
                      className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full"
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

                {/* Nova fileira de filtros por colunas */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Orçamento:</label>
                      <select
                        value={filterBudgetEmpty}
                        onChange={(e) => setFilterBudgetEmpty(e.target.value as 'all' | 'empty' | 'filled')}
                        className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full"
                      >
                        <option value="all">Todos</option>
                        <option value="empty">Sem orçamento (vazio)</option>
                        <option value="filled">Com orçamento</option>
                      </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Descrição:</label>
                    <input
                      value={filterDescricao}
                      onChange={(e) => setFilterDescricao(e.target.value)}
                      placeholder="Buscar"
                      className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Lote:</label>
                    <input
                      value={filterLote}
                      onChange={(e) => setFilterLote(e.target.value)}
                      placeholder="Buscar"
                      className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Unidade:</label>
                    <input
                      value={filterUnidade}
                      onChange={(e) => setFilterUnidade(e.target.value)}
                      placeholder="Buscar"
                      className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Engenheiro:</label>
                    <input
                      value={filterEngenheiro}
                      onChange={(e) => setFilterEngenheiro(e.target.value)}
                      placeholder="Buscar"
                      className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full"
                    />
                  </div>
                </div>
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
                    Nenhuma ordem de serviço no período selecionado.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1500px]">
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
                      {filteredPleitos.map((p) => {
                        const osSe = (p.divSe || '').trim();
                        const acumulado = billings
                          .filter((b) => (b.serviceOrder || '').trim() === osSe)
                          .reduce((sum, b) => sum + b.grossValue, 0);
                        const orcamentoPleito = p.budget ? Number(p.budget) : 0;
                        const statusFaturamentoPct = orcamentoPleito > 0 ? (acumulado / orcamentoPleito) * 100 : null;
                        const faturamentoCategoria = getFaturamentoCategoria(statusFaturamentoPct, orcamentoPleito);
                        const mesAnoCriacao =
                          p.creationMonth && p.creationYear
                            ? `${String(p.creationMonth).padStart(2, '0')}/${p.creationYear}`
                            : '-';

                        const budgetStatusCurrent = p.budgetStatus || '';
                        const executionStatusCurrent = p.executionStatus || '';
                        const budgetStatusOptions = budgetStatusCurrent && !STATUS_ORCAMENTO_OPCOES.includes(budgetStatusCurrent)
                          ? [budgetStatusCurrent, ...STATUS_ORCAMENTO_OPCOES]
                          : STATUS_ORCAMENTO_OPCOES;
                        const executionStatusOptions = executionStatusCurrent && !STATUS_EXECUCAO_OPCOES.includes(executionStatusCurrent)
                          ? [executionStatusCurrent, ...STATUS_EXECUCAO_OPCOES]
                          : STATUS_EXECUCAO_OPCOES;

                        return (
                          <tr
                            key={p.id}
                            onClick={() => setSelectedPleitoId(p.id)}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                          >
                            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedForPleito.has(p.id)}
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
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={budgetStatusCurrent}
                                disabled={savingPleitoId === p.id}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updatePleitoInline(p.id, { budgetStatus: v ? v : null });
                                }}
                                className={`${pleitoStatusSelectBase} ${budgetStatusPillClass(budgetStatusCurrent || null)}`}
                              >
                                <option value="">— (vazio)</option>
                                {budgetStatusOptions.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={executionStatusCurrent}
                                disabled={savingPleitoId === p.id}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  updatePleitoInline(p.id, { executionStatus: v ? v : null });
                                }}
                                className={`${pleitoStatusSelectBase} ${executionStatusPillClass(executionStatusCurrent || null)}`}
                              >
                                <option value="">— (vazio)</option>
                                {executionStatusOptions.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">{p.budget ? formatCurrency(Number(p.budget)) : '-'}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.budgetAmount1 != null && Number(p.budgetAmount1) > 0 ? formatCurrency(Number(p.budgetAmount1)) : '-'}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.budgetAmount2 != null && Number(p.budgetAmount2) > 0 ? formatCurrency(Number(p.budgetAmount2)) : '-'}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.budgetAmount3 != null && Number(p.budgetAmount3) > 0 ? formatCurrency(Number(p.budgetAmount3)) : '-'}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.budgetAmount4 != null && Number(p.budgetAmount4) > 0 ? formatCurrency(Number(p.budgetAmount4)) : '-'}</td>
                            <td className="px-4 py-3 text-sm text-center text-gray-900 dark:text-gray-100" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={faturamentoCategoria}
                                disabled={savingPleitoId === p.id}
                                onChange={(e) => {
                                  const nextCat = e.target.value as FaturamentoCategoria;
                                  if (nextCat === 'sem-orcamento') {
                                    updatePleitoInline(p.id, { budget: null });
                                    return;
                                  }

                                  const targetPct = getTargetPctForCategoria(nextCat);
                                  const nextBudget = acumulado > 0
                                    ? (acumulado * 100) / targetPct
                                    : 1;
                                  updatePleitoInline(p.id, { budget: nextBudget.toFixed(2) });
                                }}
                                className="w-full bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm text-gray-900 dark:text-gray-100 disabled:opacity-60"
                              >
                                <option value="sem-orcamento">Sem orçamento</option>
                                <option value="0">0% (não faturado)</option>
                                <option value="1-25">1% a 25%</option>
                                <option value="26-50">26% a 50%</option>
                                <option value="51-75">51% a 75%</option>
                                <option value="76-99">76% a 99%</option>
                                <option value="100">100% ou mais</option>
                              </select>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                              {p.startDate && p.endDate
                                ? `${formatDate(p.startDate)} – ${formatDate(p.endDate)}`
                                : p.creationMonth && p.creationYear
                                  ? `${String(p.creationMonth).padStart(2, '0')}/${p.creationYear}`
                                  : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.lot || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={p.location}>{p.location || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.unit || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.pv || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">{p.ipi || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={displayReportsBilling(p.reportsBilling)}>{displayReportsBilling(p.reportsBilling)}</td>
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
            </CardContent>
          </Card>

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

          {showPleitoValoresModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
              <div className="absolute inset-0" onClick={() => setShowPleitoValoresModal(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Informar valores do pleito
                  </h3>
                  <button onClick={() => setShowPleitoValoresModal(false)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Informe a % do orçamento para cada OS selecionada:
                  </p>
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
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Orçamento: {p.budget ? formatCurrency(Number(p.budget)) : '-'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Restante para faturar:{' '}
                          {restanteParaFaturar != null ? formatCurrency(restanteParaFaturar) : '—'}
                        </p>
                        {excedeOrcamento && (
                          <p className="text-xs font-medium text-red-600 dark:text-red-400">valor faturado acima do permitido</p>
                        )}
                        <div className="flex gap-4 items-end">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              % Orçamento
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                value={valorPleiteado[id] || ''}
                                onChange={(e) => {
                                  const v = e.target.value.replace(/\D/g, '');
                                  const formatted = v
                                    ? (Number(v) / 100).toLocaleString('pt-BR', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2
                                    })
                                    : '';
                                  setValorPleiteado((prev) => ({ ...prev, [id]: formatted }));
                                }}
                                placeholder="0,00"
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                              />
                            </div>
                          </div>
                          <div className="w-40">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                              Valor pleiteado
                            </label>
                            <div className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300">
                              {valorCalculado != null ? formatCurrency(valorCalculado) : '—'}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="px-0 py-0 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 pt-4">
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
            </div>
          )}

          {showHistoricoPleitosModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
              <div className="absolute inset-0" onClick={() => setShowHistoricoPleitosModal(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-[95vw] w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Histórico de Pleitos
                  </h3>
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
                                        if (e.target.checked) next.add(p.id);
                                        else next.delete(p.id);
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
                                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{p.divSe || '-'}</td>
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{p.folderNumber || '-'}</td>
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

          {showPleitoResumoModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
              <div className="absolute inset-0" onClick={() => setShowPleitoResumoModal(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Resumo do Pleito</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExportPleitoPDF}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
                    >
                      <FileDown className="w-4 h-4" />
                      Exportar PDF
                    </button>
                    <button type="button" onClick={() => setShowPleitoResumoModal(false)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
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
                        type="button"
                        onClick={() => {
                          setPleitoToEdit({
                            ...(pleitoDetailData.data as PleitoFormData),
                            id: (pleitoDetailData.data as { id: string }).id
                          });
                          setSelectedPleitoId(null);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                      >
                        <Edit2 className="w-4 h-4" />
                        Editar
                      </button>
                    )}
                    <button type="button" onClick={() => setSelectedPleitoId(null)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  {loadingPleitoDetail ? (
                    <div className="py-8 text-center text-gray-500 dark:text-gray-400">Carregando...</div>
                  ) : pleitoDetailData?.data ? (() => {
                    const pleito = pleitoDetailData.data as ContractPleito;
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
                          ['Feedback Relatorios', displayReportsBilling(pleito.reportsBilling)],
                          ['Preenchimento', pleito.createdAt ? formatDateTime(pleito.createdAt) : null]
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
