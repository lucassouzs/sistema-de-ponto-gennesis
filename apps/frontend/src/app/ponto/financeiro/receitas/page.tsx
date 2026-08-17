'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  CircleDollarSign,
  Download,
  FileText,
  Filter,
  List,
  Plus,
  RotateCcw,
  Search,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
} from '@/components/ui/RowActionMenu';
import { getListTableRowClassName } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { Modal } from '@/components/ui/Modal';
import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { ListPagination } from '@/components/ui/ListPagination';
import { CheckboxIndicator } from '@/components/ui/Checkbox';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { formatDateBr } from '@/lib/dateTimeBr';
import {
  formatCurrencyInputBrFromNumber,
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr,
} from '@/lib/maskCurrencyBr';
import {
  dateSortValue,
  mesSortValue,
  normalizeMesStorage,
  parseMesAno,
  parseReceitasFromWorkbook,
  parseRepassesFromWorkbook,
  readWorkbookFromFile,
  type ConsorcioKey,
  type ReceitaRow,
  type ReceitaStatus,
  type RepasseRow,
} from './receitasImport';
import {
  exportReceitasExcel,
  exportReceitasPdf,
  RECEITAS_EXPORT_SECTIONS,
  type ReceitasExportFormat,
  type ReceitasExportSectionKey,
} from './receitasExport';

type TopTabKey = ConsorcioKey | 'resumo';
type TipoKey = 'receitas' | 'repasses';

type ResumoMesRow = {
  key: string;
  mesLabel: string;
  ano: number;
  mes: string;
  recebimentoBsb: number | null;
  recebimentoHub: number | null;
  status: ReceitaStatus;
};

const TOP_TABS: Array<{ key: TopTabKey; label: string }> = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'bsb', label: 'Consórcio BSB' },
  { key: 'hub', label: 'Consórcio HUB' },
];

const TIPO_TABS: Array<{ key: TipoKey; label: string }> = [
  { key: 'receitas', label: 'Receitas' },
  { key: 'repasses', label: 'Repasses' },
];

const STATUS_FILTER_OPTIONS: Array<{ value: '' | ReceitaStatus; label: string }> = [
  { value: '', label: 'Todos os status' },
  { value: 'RECEBIDO', label: 'Recebido' },
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'PENDENTE PARCIAL', label: 'Pendente parcial' },
  { value: 'CANCELADA', label: 'Cancelada' },
  { value: 'MOBILIZAÇÃO', label: 'Mobilização' },
];

const STATUS_PRIORITY: Record<ReceitaStatus, number> = {
  RECEBIDO: 0,
  MOBILIZAÇÃO: 1,
  'PENDENTE PARCIAL': 2,
  PENDENTE: 3,
  CANCELADA: 4,
};

function formatCurrencyBR(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function receitaStatusLabel(row: Pick<ReceitaRow, 'status' | 'statusData'>): string {
  if (row.status === 'RECEBIDO' && row.statusData) {
    return `RECEBIDO - ${row.statusData}`;
  }
  return row.status;
}

function receitaStatusClass(status: ReceitaStatus): string {
  if (status === 'CANCELADA') {
    return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300';
  }
  if (status === 'PENDENTE' || status === 'PENDENTE PARCIAL') {
    return 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200';
  }
  if (status === 'RECEBIDO') {
    return 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200';
  }
  if (status === 'MOBILIZAÇÃO') {
    return 'bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200';
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

function getApiErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const data = (err as { response?: { data?: { message?: string; error?: string } } })
      .response?.data;
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

type ReceitaFormState = {
  mesNumero: string;
  ano: string;
  nf: string;
  faturamento: string;
  recebimentoLiquido: string;
  status: ReceitaStatus;
  statusData: string;
};

type RepasseFormState = {
  fornecedor: string;
  parcela: string;
  dataEmissao: string;
  boleto: string;
  data: string;
  valorOriginal: string;
  oc: string;
  valorFinal: string;
  pagamento: string;
};

const EMPTY_RECEITA_FORM: ReceitaFormState = {
  mesNumero: '',
  ano: String(new Date().getFullYear()),
  nf: '',
  faturamento: '',
  recebimentoLiquido: '',
  status: 'RECEBIDO',
  statusData: '',
};

const EMPTY_REPASSE_FORM: RepasseFormState = {
  fornecedor: '',
  parcela: 'REPASSE',
  dataEmissao: '',
  boleto: 'NÃO',
  data: '',
  valorOriginal: '',
  oc: '0',
  valorFinal: '',
  pagamento: '',
};

const inputClassName =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

const labelClassName =
  'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';

const MES_OPTIONS = [
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

const CURRENT_YEAR = new Date().getFullYear();
const ANO_OPTIONS = Array.from({ length: 11 }, (_, i) => {
  const year = CURRENT_YEAR - 5 + i;
  return { value: String(year), label: String(year) };
}).reverse();

const STATUS_FORM_OPTIONS = STATUS_FILTER_OPTIONS.filter(
  (opt): opt is { value: ReceitaStatus; label: string } => Boolean(opt.value)
);

const BOLETO_FILTER_OPTIONS = [
  { value: 'SIM', label: 'SIM' },
  { value: 'NÃO', label: 'NÃO' },
];

/** Converte dd/mm/aaaa (ou ISO) para YYYY-MM-DD do DatePickerField. */
function toDatePickerValue(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!br) return '';
  let year = Number(br[3]);
  if (year < 100) year += 2000;
  return `${year}-${String(Number(br[2])).padStart(2, '0')}-${String(Number(br[1])).padStart(2, '0')}`;
}

/** Converte YYYY-MM-DD do DatePickerField para dd/mm/aaaa (persistência/exibição). */
function fromDatePickerValue(ymd: string): string {
  if (!ymd?.trim()) return '';
  return formatDateBr(ymd, '');
}

function formatTableDate(raw: string): string {
  if (!raw?.trim()) return '—';
  const ymd = toDatePickerValue(raw);
  if (ymd) return formatDateBr(ymd, '—');
  return raw;
}

function isBoletoSim(value: string): boolean {
  const n = value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  return n === 'SIM' || n === 'S' || n === 'YES' || n === 'TRUE' || n === '1';
}

function buildResumoReceitas(rows: ReceitaRow[]): ResumoMesRow[] {
  const byKey = new Map<
    string,
    {
      mes: string;
      mesLabel: string;
      ano: number;
      bsb: number;
      hub: number;
      status: ReceitaStatus;
      hasBsb: boolean;
      hasHub: boolean;
    }
  >();

  for (const row of rows) {
    const parts = parseMesAno(row.mes);
    const key = parts?.key ?? row.mes;
    const current = byKey.get(key) ?? {
      mes: parts?.storage ?? row.mes,
      mesLabel: parts?.mesLabel ?? row.mes,
      ano: parts?.ano ?? 0,
      bsb: 0,
      hub: 0,
      status: 'RECEBIDO' as ReceitaStatus,
      hasBsb: false,
      hasHub: false,
    };
    const valor = row.recebimentoLiquido ?? 0;
    if (row.consorcio === 'bsb') {
      current.bsb += valor;
      current.hasBsb = true;
    } else {
      current.hub += valor;
      current.hasHub = true;
    }
    if (STATUS_PRIORITY[row.status] >= STATUS_PRIORITY[current.status]) {
      current.status = row.status;
    }
    byKey.set(key, current);
  }

  return Array.from(byKey.entries())
    .map(([key, data]) => ({
      key,
      mes: data.mes,
      mesLabel: data.mesLabel,
      ano: data.ano,
      recebimentoBsb: data.hasBsb ? data.bsb : null,
      recebimentoHub: data.hasHub ? data.hub : null,
      status: data.status,
    }))
    .sort((a, b) => mesSortValue(b.mes) - mesSortValue(a.mes));
}

/** Dados em memória até API — preenchidos via importação. */

function TabNav<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  centered = false,
}: {
  tabs: Array<{ key: T; label: string }>;
  active: T;
  onChange: (key: T) => void;
  ariaLabel: string;
  centered?: boolean;
  /** @deprecated Ignorado — abas de conteúdo usam underline. */
  variant?: 'tabs' | 'segment';
}) {
  return (
    <AppUnderlineTabList aria-label={ariaLabel} centered={centered}>
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <AppUnderlineTabButton
            key={tab.key}
            active={isActive}
            onClick={() => onChange(tab.key)}
            className="whitespace-nowrap px-2 py-2.5 text-xs sm:px-3 sm:text-sm"
          >
            {tab.label}
          </AppUnderlineTabButton>
        );
      })}
    </AppUnderlineTabList>
  );
}

export default function ReceitasPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [topTab, setTopTab] = useState<TopTabKey>('resumo');
  const [tipo, setTipo] = useState<TipoKey>('receitas');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | ReceitaStatus>('');
  const [mesFilter, setMesFilter] = useState('');
  const [boletoFilter, setBoletoFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [receitaForm, setReceitaForm] = useState<ReceitaFormState>(EMPTY_RECEITA_FORM);
  const [repasseForm, setRepasseForm] = useState<RepasseFormState>(EMPTY_REPASSE_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ReceitasExportFormat>('excel');
  const [exportSections, setExportSections] = useState<ReceitasExportSectionKey[]>([
    'receitas-bsb',
    'receitas-hub',
    'repasses-bsb',
    'repasses-hub',
  ]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const isResumo = topTab === 'resumo';
  const consorcio: ConsorcioKey | null = isResumo ? null : topTab;

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const {
    data: receitas = [],
    isLoading: loadingReceitas,
  } = useQuery({
    queryKey: ['financeiro-receitas', 'receitas'],
    queryFn: async () => {
      const res = await api.get('/financeiro-receitas/receitas');
      return (res.data?.data ?? []) as ReceitaRow[];
    },
  });

  const {
    data: repasses = [],
    isLoading: loadingRepasses,
  } = useQuery({
    queryKey: ['financeiro-receitas', 'repasses'],
    queryFn: async () => {
      const res = await api.get('/financeiro-receitas/repasses');
      return (res.data?.data ?? []) as RepasseRow[];
    },
  });

  useEffect(() => {
    setSearchTerm('');
    setStatusFilter('');
    setMesFilter('');
    setBoletoFilter('');
    setCurrentPage(1);
  }, [topTab, tipo]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const receitasFiltradas = useMemo(() => {
    if (!consorcio) return [];
    const q = searchTerm.trim().toLowerCase();
    return receitas
      .filter((row) => {
        if (row.consorcio !== consorcio) return false;
        if (statusFilter && row.status !== statusFilter) return false;
        if (mesFilter) {
          const key = parseMesAno(row.mes)?.key ?? row.mes;
          if (key !== mesFilter) return false;
        }
        if (!q) return true;
        const parts = parseMesAno(row.mes);
        const mesTxt = parts
          ? `${parts.mesLabel} ${parts.ano}`
          : row.mes;
        const hay = `${mesTxt} ${row.nf} ${receitaStatusLabel(row)}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => mesSortValue(b.mes) - mesSortValue(a.mes));
  }, [consorcio, mesFilter, receitas, searchTerm, statusFilter]);

  const repassesFiltrados = useMemo(() => {
    if (!consorcio) return [];
    const q = searchTerm.trim().toLowerCase();
    return repasses
      .filter((row) => {
        if (row.consorcio !== consorcio) return false;
        if (boletoFilter && row.boleto !== boletoFilter) return false;
        if (!q) return true;
        const hay = `${row.fornecedor} ${row.parcela} ${row.dataEmissao} ${row.pagamento}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const byDate =
          dateSortValue(b.dataEmissao || b.data) - dateSortValue(a.dataEmissao || a.data);
        if (byDate !== 0) return byDate;
        return dateSortValue(b.data || b.pagamento) - dateSortValue(a.data || a.pagamento);
      });
  }, [boletoFilter, consorcio, repasses, searchTerm]);

  const resumoFiltrado = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return buildResumoReceitas(receitas).filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (mesFilter && row.key !== mesFilter) return false;
      if (!q) return true;
      return `${row.mesLabel} ${row.ano} ${row.status}`.toLowerCase().includes(q);
    });
  }, [mesFilter, receitas, searchTerm, statusFilter]);

  const resumoTotais = useMemo(() => {
    let totalBsb = 0;
    let totalHub = 0;
    for (const row of resumoFiltrado) {
      totalBsb += row.recebimentoBsb ?? 0;
      totalHub += row.recebimentoHub ?? 0;
    }
    return { totalBsb, totalHub, geral: totalBsb + totalHub };
  }, [resumoFiltrado]);

  const receitaTotais = useMemo(() => {
    let bruto = 0;
    let liquido = 0;
    const nfs = new Set<string>();
    for (const row of receitasFiltradas) {
      bruto += row.faturamento ?? 0;
      liquido += row.recebimentoLiquido ?? 0;
      const nf = row.nf.trim();
      if (nf && nf !== '—') nfs.add(nf);
    }
    return {
      linhas: receitasFiltradas.length,
      notasFiscais: nfs.size,
      bruto,
      liquido,
    };
  }, [receitasFiltradas]);

  const mesOptions = useMemo(() => {
    const source = isResumo
      ? buildResumoReceitas(receitas)
      : receitas
          .filter((r) => r.consorcio === consorcio)
          .map((r) => {
            const parts = parseMesAno(r.mes);
            return {
              key: parts?.key ?? r.mes,
              mes: parts?.storage ?? r.mes,
              mesLabel: parts?.mesLabel ?? r.mes,
              ano: parts?.ano ?? 0,
            };
          });

    const unique = new Map<string, { key: string; label: string; sort: number }>();
    for (const row of source) {
      const key = 'key' in row ? row.key : String(row);
      const mesLabel = 'mesLabel' in row ? row.mesLabel : String(row);
      const ano = 'ano' in row ? row.ano : 0;
      const mes = 'mes' in row ? row.mes : String(row);
      if (unique.has(key)) continue;
      unique.set(key, {
        key,
        label: ano ? `${mesLabel}/${ano}` : mesLabel,
        sort: mesSortValue(mes),
      });
    }
    return Array.from(unique.values()).sort((a, b) => b.sort - a.sort);
  }, [consorcio, isResumo, receitas]);

  const rowsTotal = isResumo
    ? resumoFiltrado.length
    : tipo === 'receitas'
      ? receitasFiltradas.length
      : repassesFiltrados.length;
  const { startItem, endItem, totalPages } = getCadastroListRange(
    currentPage,
    itemsPerPage,
    rowsTotal
  );
  const pageReceitas = receitasFiltradas.slice(startItem - 1, endItem || 0);
  const pageRepasses = repassesFiltrados.slice(startItem - 1, endItem || 0);
  const pageResumo = resumoFiltrado.slice(startItem - 1, endItem || 0);

  const actionRows: Array<ReceitaRow | RepasseRow> =
    tipo === 'receitas' ? pageReceitas : pageRepasses;
  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(actionRows);

  const openCreateForm = () => {
    setEditingId(null);
    setReceitaForm(EMPTY_RECEITA_FORM);
    setRepasseForm(EMPTY_REPASSE_FORM);
    setShowForm(true);
  };

  const openEditReceita = (row: ReceitaRow) => {
    const parts = parseMesAno(row.mes);
    setEditingId(row.id);
    setReceitaForm({
      mesNumero: parts ? String(parts.mesNumero) : '',
      ano: parts ? String(parts.ano) : '',
      nf: row.nf === '—' ? '' : row.nf,
      faturamento: formatCurrencyInputBrFromNumber(row.faturamento),
      recebimentoLiquido: formatCurrencyInputBrFromNumber(row.recebimentoLiquido),
      status: row.status,
      statusData: toDatePickerValue(row.statusData ?? ''),
    });
    setShowForm(true);
  };

  const openEditRepasse = (row: RepasseRow) => {
    setEditingId(row.id);
    setRepasseForm({
      fornecedor: row.fornecedor === '—' ? '' : row.fornecedor,
      parcela: row.parcela,
      dataEmissao: toDatePickerValue(row.dataEmissao),
      boleto: isBoletoSim(row.boleto) ? 'SIM' : 'NÃO',
      data: toDatePickerValue(row.data),
      valorOriginal: formatCurrencyInputBrFromNumber(row.valorOriginal),
      oc: row.oc,
      valorFinal: formatCurrencyInputBrFromNumber(row.valorFinal),
      pagamento: toDatePickerValue(row.pagamento),
    });
    setShowForm(true);
  };

  const closeForm = () => {
    if (isSaving) return;
    setShowForm(false);
    setEditingId(null);
  };

  const handleSaveForm = async () => {
    if (!consorcio) return;
    setIsSaving(true);
    try {
      if (tipo === 'receitas') {
        if (!receitaForm.mesNumero.trim() || !receitaForm.ano.trim()) {
          toast.error('Informe o mês e o ano.');
          return;
        }
        const mesNumero = Number(receitaForm.mesNumero);
        const ano = Number(receitaForm.ano);
        if (!Number.isFinite(mesNumero) || mesNumero < 1 || mesNumero > 12) {
          toast.error('Mês inválido.');
          return;
        }
        if (!Number.isFinite(ano) || ano < 1900) {
          toast.error('Ano inválido.');
          return;
        }
        const payload = {
          consorcio,
          mes: normalizeMesStorage(`${mesNumero}/${ano}`),
          nf: receitaForm.nf.trim() || '—',
          faturamento: parseCurrencyInputBr(receitaForm.faturamento),
          recebimentoLiquido: parseCurrencyInputBr(receitaForm.recebimentoLiquido),
          status: receitaForm.status,
          statusData: fromDatePickerValue(receitaForm.statusData) || null,
        };
        if (editingId) {
          await api.patch(`/financeiro-receitas/receitas/${editingId}`, payload);
          toast.success('Receita atualizada.');
        } else {
          await api.post('/financeiro-receitas/receitas', payload);
          toast.success('Receita criada.');
        }
        await queryClient.invalidateQueries({
          queryKey: ['financeiro-receitas', 'receitas'],
        });
      } else {
        if (!repasseForm.fornecedor.trim()) {
          toast.error('Informe o fornecedor.');
          return;
        }
        const payload = {
          consorcio,
          fornecedor: repasseForm.fornecedor.trim(),
          parcela: repasseForm.parcela.trim() || 'REPASSE',
          dataEmissao: fromDatePickerValue(repasseForm.dataEmissao) || null,
          boleto: repasseForm.boleto.trim() || 'NÃO',
          data: fromDatePickerValue(repasseForm.data) || null,
          valorOriginal: parseCurrencyInputBr(repasseForm.valorOriginal) ?? 0,
          oc: repasseForm.oc.trim() || '0',
          valorFinal: parseCurrencyInputBr(repasseForm.valorFinal) ?? 0,
          pagamento: fromDatePickerValue(repasseForm.pagamento) || null,
        };
        if (editingId) {
          await api.patch(`/financeiro-receitas/repasses/${editingId}`, payload);
          toast.success('Repasse atualizado.');
        } else {
          await api.post('/financeiro-receitas/repasses', payload);
          toast.success('Repasse criado.');
        }
        await queryClient.invalidateQueries({
          queryKey: ['financeiro-receitas', 'repasses'],
        });
      }
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRow = async (row: ReceitaRow | RepasseRow) => {
    const label = tipo === 'receitas' ? 'esta receita' : 'este repasse';
    if (!window.confirm(`Excluir ${label}? Esta ação não pode ser desfeita.`)) return;
    try {
      if (tipo === 'receitas') {
        await api.delete(`/financeiro-receitas/receitas/${row.id}`);
        await queryClient.invalidateQueries({
          queryKey: ['financeiro-receitas', 'receitas'],
        });
        toast.success('Receita excluída.');
      } else {
        await api.delete(`/financeiro-receitas/repasses/${row.id}`);
        await queryClient.invalidateQueries({
          queryKey: ['financeiro-receitas', 'repasses'],
        });
        toast.success('Repasse excluído.');
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Não foi possível excluir.'));
    }
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file || !consorcio) return;
    setIsImporting(true);
    try {
      const workbook = await readWorkbookFromFile(file);
      if (tipo === 'receitas') {
        const imported = parseReceitasFromWorkbook(workbook, consorcio);
        const res = await api.post('/financeiro-receitas/receitas/import', {
          consorcio,
          registros: imported,
        });
        await queryClient.invalidateQueries({
          queryKey: ['financeiro-receitas', 'receitas'],
        });
        const count = Array.isArray(res.data?.data) ? res.data.data.length : imported.length;
        toast.success(
          res.data?.message ||
            `${count} receita(s) salva(s) da aba ${
              consorcio === 'bsb' ? 'CONSORCIO BSB' : 'CONSORCIO HUB'
            }.`
        );
      } else {
        const imported = parseRepassesFromWorkbook(workbook, consorcio);
        const res = await api.post('/financeiro-receitas/repasses/import', {
          consorcio,
          registros: imported,
        });
        await queryClient.invalidateQueries({
          queryKey: ['financeiro-receitas', 'repasses'],
        });
        const count = Array.isArray(res.data?.data) ? res.data.data.length : imported.length;
        toast.success(
          res.data?.message ||
            `${count} repasse(s) salvo(s) da seção ${
              consorcio === 'bsb' ? 'BSB' : 'HUB'
            } em REPASSES GENNESIS.`
        );
      }
      setShowImport(false);
      setCurrentPage(1);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Falha ao importar a planilha.'));
    } finally {
      setIsImporting(false);
    }
  };

  const hasActiveFilters = isResumo
    ? Boolean(statusFilter || mesFilter)
    : tipo === 'receitas'
      ? Boolean(statusFilter || mesFilter)
      : Boolean(boletoFilter);

  const clearFilters = () => {
    setStatusFilter('');
    setMesFilter('');
    setBoletoFilter('');
  };

  const toggleExportSection = (key: ReceitasExportSectionKey) => {
    setExportSections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const allExportSelected =
    exportSections.length === RECEITAS_EXPORT_SECTIONS.length;

  const toggleAllExportSections = () => {
    setExportSections(
      allExportSelected ? [] : RECEITAS_EXPORT_SECTIONS.map((s) => s.key)
    );
  };

  const handleExport = async () => {
    if (exportSections.length === 0) {
      toast.error('Selecione ao menos um item para exportar.');
      return;
    }
    setIsExporting(true);
    try {
      const payload = {
        sections: exportSections,
        receitas,
        repasses,
      };
      if (exportFormat === 'excel') {
        exportReceitasExcel(payload);
        toast.success('Excel gerado com sucesso.');
      } else {
        await exportReceitasPdf(payload);
        toast.success('PDF gerado com sucesso.');
      }
      setShowExport(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Falha ao exportar.'));
    } finally {
      setIsExporting(false);
    }
  };

  if (loadingUser || loadingReceitas || loadingRepasses) {
    return <Loading message="Carregando receitas..." fullScreen size="lg" />;
  }

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const listTitle = isResumo ? 'Resumo das receitas' : tipo === 'receitas' ? 'Receitas' : 'Repasses';
  const listSubtitle = isResumo
    ? `${rowsTotal} ${rowsTotal === 1 ? 'mês' : 'meses'}`
    : tipo === 'receitas'
      ? `${rowsTotal} ${rowsTotal === 1 ? 'lançamento' : 'lançamentos'}`
      : `${rowsTotal} ${rowsTotal === 1 ? 'repasse' : 'repasses'}`;

  return (
    <ProtectedRoute route="/ponto/financeiro/receitas">
      <MainLayout
        userRole={user.role || 'EMPLOYEE'}
        userName={user.name}
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Receitas
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Faturamento, recebimentos e repasses por consórcio.
            </p>
          </div>

          <TabNav
            tabs={TOP_TABS}
            active={topTab}
            onChange={setTopTab}
            ariaLabel="Consórcios"
            centered
          />

          {!isResumo ? (
            <TabNav
              tabs={TIPO_TABS}
              active={tipo}
              onChange={setTipo}
              ariaLabel="Tipo de lançamento"
              variant="segment"
              centered
            />
          ) : null}

          {isResumo ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-lg bg-sky-100 p-2 sm:p-3 dark:bg-sky-900/30">
                      <CircleDollarSign
                        className="h-5 w-5 text-sky-600 dark:text-sky-400 sm:h-6 sm:w-6"
                        aria-hidden
                      />
                    </div>
                    <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                        Total BSB
                      </p>
                      <p className="mt-1 truncate text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-2xl">
                        {formatCurrencyBR(resumoTotais.totalBsb)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-lg bg-amber-100 p-2 sm:p-3 dark:bg-amber-900/30">
                      <Wallet
                        className="h-5 w-5 text-amber-600 dark:text-amber-400 sm:h-6 sm:w-6"
                        aria-hidden
                      />
                    </div>
                    <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                        Total HUB
                      </p>
                      <p className="mt-1 truncate text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-2xl">
                        {formatCurrencyBR(resumoTotais.totalHub)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                      <CircleDollarSign
                        className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6"
                        aria-hidden
                      />
                    </div>
                    <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                        Total Geral
                      </p>
                      <p className="mt-1 truncate text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-2xl">
                        {formatCurrencyBR(resumoTotais.geral)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {!isResumo && tipo === 'receitas' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 sm:gap-6">
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-lg bg-slate-100 p-2 sm:p-3 dark:bg-slate-800/60">
                      <List
                        className="h-5 w-5 text-slate-600 dark:text-slate-300 sm:h-6 sm:w-6"
                        aria-hidden
                      />
                    </div>
                    <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                        Total de linhas
                      </p>
                      <p className="mt-1 truncate text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-2xl">
                        {receitaTotais.linhas}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-lg bg-violet-100 p-2 sm:p-3 dark:bg-violet-900/30">
                      <FileText
                        className="h-5 w-5 text-violet-600 dark:text-violet-400 sm:h-6 sm:w-6"
                        aria-hidden
                      />
                    </div>
                    <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                        Notas fiscais
                      </p>
                      <p className="mt-1 truncate text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-2xl">
                        {receitaTotais.notasFiscais}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-lg bg-sky-100 p-2 sm:p-3 dark:bg-sky-900/30">
                      <CircleDollarSign
                        className="h-5 w-5 text-sky-600 dark:text-sky-400 sm:h-6 sm:w-6"
                        aria-hidden
                      />
                    </div>
                    <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                        Valor total bruto
                      </p>
                      <p className="mt-1 truncate text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-2xl">
                        {formatCurrencyBR(receitaTotais.bruto)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 rounded-lg bg-emerald-100 p-2 sm:p-3 dark:bg-emerald-900/30">
                      <Wallet
                        className="h-5 w-5 text-emerald-600 dark:text-emerald-400 sm:h-6 sm:w-6"
                        aria-hidden
                      />
                    </div>
                    <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                        Valor líquido
                      </p>
                      <p className="mt-1 truncate text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-2xl">
                        {formatCurrencyBR(receitaTotais.liquido)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                    {isResumo || tipo === 'receitas' ? (
                      <CircleDollarSign
                        className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6"
                        aria-hidden
                      />
                    ) : (
                      <Wallet
                        className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6"
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {listTitle}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {listSubtitle}
                      {hasActiveFilters || searchTerm.trim() ? ' (filtrados)' : ''}
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className="relative min-w-[200px] flex-1 sm:w-[260px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder={
                        isResumo
                          ? 'Buscar mês ou status…'
                          : tipo === 'receitas'
                            ? 'Buscar mês, NF ou status…'
                            : 'Buscar fornecedor, parcela…'
                      }
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFilters(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      hasActiveFilters
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={hasActiveFilters ? 'Filtro ativo' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveFilters ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                  {isResumo ? (
                    <button
                      type="button"
                      onClick={() => setShowExport(true)}
                      disabled={receitas.length === 0 && repasses.length === 0}
                      aria-label="Exportar"
                      title="Exportar"
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowImport(true)}
                        aria-label="Importar"
                        title="Importar"
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                      >
                        <Upload className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={openCreateForm}
                        className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        <Plus className="h-4 w-4 shrink-0" />
                        <span>{tipo === 'receitas' ? 'Nova Receita' : 'Novo Repasse'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className={cadastroListClasses.cardContent}>
              {rowsTotal === 0 ? (
                <CadastroListEmpty
                  icon={isResumo || tipo === 'receitas' ? CircleDollarSign : Wallet}
                  title={
                    searchTerm.trim() || hasActiveFilters
                      ? 'Nenhum resultado encontrado'
                      : isResumo
                        ? 'Nenhum resumo disponível'
                        : `Nenhum lançamento de ${tipo}`
                  }
                  hint={
                    searchTerm.trim() || hasActiveFilters
                      ? 'Ajuste a busca ou os filtros e tente novamente.'
                      : isResumo
                        ? 'O resumo aparece quando houver lançamentos em BSB e HUB.'
                        : 'Use Criar novo ou Importar para adicionar os primeiros registros.'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={startItem}
                    endItem={endItem}
                    total={rowsTotal}
                    itemLabel={isResumo ? 'mês' : 'lançamento'}
                    itemLabelPlural={isResumo ? 'meses' : 'lançamentos'}
                    currentPage={currentPage}
                    totalPages={totalPages}
                  />

                  <div className="table-scroll">
                    {isResumo ? (
                      <table className={cadastroListClasses.table}>
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className={cadastroListClasses.thCenter}>Mês</th>
                            <th className={cadastroListClasses.thCenter}>Ano</th>
                            <th className={cadastroListClasses.thNumeric}>
                              Recebimento líquido BSB
                            </th>
                            <th className={cadastroListClasses.thNumeric}>
                              Recebimento líquido HUB
                            </th>
                            <th className={cadastroListClasses.thCenter}>Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                          {pageResumo.map((row) => (
                            <tr key={row.key} className={getListTableRowClassName(false)}>
                              <td className={cadastroListClasses.tdCenter}>{row.mesLabel}</td>
                              <td className={cadastroListClasses.tdCenter}>
                                {row.ano || '—'}
                              </td>
                              <td className={cadastroListClasses.tdNumeric}>
                                {formatCurrencyBR(row.recebimentoBsb)}
                              </td>
                              <td className={cadastroListClasses.tdNumeric}>
                                {formatCurrencyBR(row.recebimentoHub)}
                              </td>
                              <td className={cadastroListClasses.tdCenter}>
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${receitaStatusClass(row.status)}`}
                                >
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 font-semibold dark:bg-gray-900/50">
                            <td className={cadastroListClasses.tdCenter} colSpan={2}>
                              TOTAL
                            </td>
                            <td className={cadastroListClasses.tdNumeric}>
                              {formatCurrencyBR(resumoTotais.totalBsb)}
                            </td>
                            <td className={cadastroListClasses.tdNumeric}>
                              {formatCurrencyBR(resumoTotais.totalHub)}
                            </td>
                            <td className={cadastroListClasses.tdCenter} />
                          </tr>
                          <tr className="bg-gray-50 font-semibold dark:bg-gray-900/50">
                            <td className={cadastroListClasses.tdCenter} colSpan={2}>
                              GERAL
                            </td>
                            <td
                              className={`${cadastroListClasses.tdNumeric} text-gray-900 dark:text-gray-100`}
                              colSpan={2}
                            >
                              {formatCurrencyBR(resumoTotais.geral)}
                            </td>
                            <td className={cadastroListClasses.tdCenter} />
                          </tr>
                        </tbody>
                      </table>
                    ) : tipo === 'receitas' ? (
                      <table className={cadastroListClasses.table}>
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className={cadastroListClasses.thCenter}>Mês</th>
                            <th className={cadastroListClasses.thCenter}>Ano</th>
                            <th className={cadastroListClasses.thCenter}>NF</th>
                            <th className={cadastroListClasses.thNumeric}>Faturamento do mês</th>
                            <th className={cadastroListClasses.thNumeric}>Recebimento líquido</th>
                            <th className={cadastroListClasses.thCenter}>Status</th>
                            <th className={cadastroListClasses.thRight}>Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                          {pageReceitas.map((row) => {
                            const parts = parseMesAno(row.mes);
                            return (
                              <tr key={row.id} className={getListTableRowClassName(false)}>
                                <td className={cadastroListClasses.tdCenter}>
                                  {parts?.mesLabel ?? '—'}
                                </td>
                                <td className={cadastroListClasses.tdCenter}>
                                  {parts?.ano ?? '—'}
                                </td>
                                <td className={cadastroListClasses.tdCenter}>{row.nf}</td>
                                <td className={cadastroListClasses.tdNumeric}>
                                  {formatCurrencyBR(row.faturamento)}
                                </td>
                                <td className={cadastroListClasses.tdNumeric}>
                                  {formatCurrencyBR(row.recebimentoLiquido)}
                                </td>
                                <td className={cadastroListClasses.tdCenter}>
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${receitaStatusClass(row.status)}`}
                                  >
                                    {receitaStatusLabel(row)}
                                  </span>
                                </td>
                                <RowActionMenuCell
                                  isOpen={isRowMenuOpen(row.id)}
                                  onToggle={(e) =>
                                    toggleRowActionMenu(
                                      row.id,
                                      e.currentTarget as HTMLButtonElement
                                    )
                                  }
                                />
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <table className={cadastroListClasses.table}>
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className={cadastroListClasses.th}>Fornecedor</th>
                            <th className={cadastroListClasses.th}>Parcela</th>
                            <th className={cadastroListClasses.thCenter}>Emissão</th>
                            <th className={cadastroListClasses.thCenter}>Boleto</th>
                            <th className={cadastroListClasses.thCenter}>Data</th>
                            <th className={cadastroListClasses.thNumeric}>Valor original</th>
                            <th className={cadastroListClasses.thCenter}>O.C.</th>
                            <th className={cadastroListClasses.thNumeric}>Valor final</th>
                            <th className={cadastroListClasses.thCenter}>Pagamentos</th>
                            <th className={cadastroListClasses.thRight}>Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                          {pageRepasses.map((row) => (
                            <tr key={row.id} className={getListTableRowClassName(false)}>
                              <td className={cadastroListClasses.tdTruncate}>
                                <span className="block truncate" title={row.fornecedor}>
                                  {row.fornecedor}
                                </span>
                              </td>
                              <td className={cadastroListClasses.td}>{row.parcela}</td>
                              <td className={cadastroListClasses.tdCenter}>
                                {formatTableDate(row.dataEmissao)}
                              </td>
                              <td className={cadastroListClasses.tdCenter}>{row.boleto}</td>
                              <td className={cadastroListClasses.tdCenter}>
                                {formatTableDate(row.data)}
                              </td>
                              <td className={cadastroListClasses.tdNumeric}>
                                {formatCurrencyBR(row.valorOriginal)}
                              </td>
                              <td className={cadastroListClasses.tdCenter}>{row.oc}</td>
                              <td className={cadastroListClasses.tdNumeric}>
                                {formatCurrencyBR(row.valorFinal)}
                              </td>
                              <td className={cadastroListClasses.tdCenter}>
                                {formatTableDate(row.pagamento)}
                              </td>
                              <RowActionMenuCell
                                isOpen={isRowMenuOpen(row.id)}
                                onToggle={(e) =>
                                  toggleRowActionMenu(
                                    row.id,
                                    e.currentTarget as HTMLButtonElement
                                  )
                                }
                              />
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <ListPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
              {!isResumo && rowForActionMenu && rowActionMenu ? (
                <RowActionMenuPortal
                  menu={rowActionMenu}
                  onClose={closeRowActionMenu}
                  onEdit={() => {
                    closeRowActionMenu();
                    if (tipo === 'receitas') {
                      openEditReceita(rowForActionMenu as ReceitaRow);
                    } else {
                      openEditRepasse(rowForActionMenu as RepasseRow);
                    }
                  }}
                  onDelete={() => {
                    closeRowActionMenu();
                    void handleDeleteRow(rowForActionMenu);
                  }}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Modal
          isOpen={showExport}
          onClose={() => !isExporting && setShowExport(false)}
          title="Exportar"
          size="md"
        >
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  O que exportar
                </p>
                <button
                  type="button"
                  onClick={toggleAllExportSections}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  {allExportSelected ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {RECEITAS_EXPORT_SECTIONS.map((section) => {
                  const checked = exportSections.includes(section.key);
                  return (
                    <label
                      key={section.key}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/60"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleExportSection(section.key)}
                        className="sr-only"
                      />
                      <CheckboxIndicator checked={checked} />
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {section.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Formato
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setExportFormat('excel')}
                  className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                    exportFormat === 'excel'
                      ? 'border-red-300 bg-red-50 dark:border-red-800/60 dark:bg-red-950/30'
                      : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/60'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Excel
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Cada seleção em uma aba
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setExportFormat('pdf')}
                  className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                    exportFormat === 'pdf'
                      ? 'border-red-300 bg-red-50 dark:border-red-800/60 dark:bg-red-950/30'
                      : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/60'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    PDF
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Tabelas separadas no documento
                  </p>
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setShowExport(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isExporting || exportSections.length === 0}
                onClick={() => void handleExport()}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Exportando…' : 'Exportar'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={showFilters}
          onClose={() => setShowFilters(false)}
          title="Filtros"
          size="md"
        >
          <div className="space-y-4">
            {isResumo || tipo === 'receitas' ? (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Status
                  </label>
                  <StringSingleSelectDropdown
                    value={statusFilter}
                    onChange={(v) => setStatusFilter(v as '' | ReceitaStatus)}
                    options={STATUS_FORM_OPTIONS}
                    placeholder="Todos os status"
                    allowEmpty
                    emptyOptionLabel="Todos os status"
                    disableSearch
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Mês
                  </label>
                  <StringSingleSelectDropdown
                    value={mesFilter}
                    onChange={setMesFilter}
                    options={mesOptions.map((opt) => ({
                      value: opt.key,
                      label: opt.label,
                    }))}
                    placeholder="Todos os meses"
                    allowEmpty
                    emptyOptionLabel="Todos os meses"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Boleto
                </label>
                <StringSingleSelectDropdown
                  value={boletoFilter}
                  onChange={setBoletoFilter}
                  options={BOLETO_FILTER_OPTIONS}
                  placeholder="Todos"
                  allowEmpty
                  emptyOptionLabel="Todos"
                  disableSearch
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  clearFilters();
                  setShowFilters(false);
                  setCurrentPage(1);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <RotateCcw className="h-4 w-4" />
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFilters(false);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Aplicar
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={showForm}
          onClose={closeForm}
          title={
            tipo === 'receitas'
              ? editingId
                ? 'Editar Receita'
                : 'Nova Receita'
              : editingId
                ? 'Editar Repasse'
                : 'Novo Repasse'
          }
          size="md"
        >
          <div className="space-y-4">
            {tipo === 'receitas' ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClassName}>Mês</label>
                    <StringSingleSelectDropdown
                      value={receitaForm.mesNumero}
                      onChange={(mesNumero) =>
                        setReceitaForm((prev) => ({ ...prev, mesNumero }))
                      }
                      options={MES_OPTIONS}
                      placeholder="Selecione"
                      allowEmpty
                      emptyOptionLabel="Selecione"
                      disableSearch
                    />
                  </div>
                  <div>
                    <label className={labelClassName}>Ano</label>
                    <StringSingleSelectDropdown
                      value={receitaForm.ano}
                      onChange={(ano) =>
                        setReceitaForm((prev) => ({ ...prev, ano }))
                      }
                      options={
                        receitaForm.ano &&
                        !ANO_OPTIONS.some((opt) => opt.value === receitaForm.ano)
                          ? [
                              {
                                value: receitaForm.ano,
                                label: receitaForm.ano,
                              },
                              ...ANO_OPTIONS,
                            ]
                          : ANO_OPTIONS
                      }
                      placeholder="Selecione"
                      allowEmpty
                      emptyOptionLabel="Selecione"
                      disableSearch
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    NF
                  </label>
                  <input
                    type="text"
                    value={receitaForm.nf}
                    onChange={(e) =>
                      setReceitaForm((prev) => ({ ...prev, nf: e.target.value }))
                    }
                    className={inputClassName}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClassName}>Faturamento do mês</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={receitaForm.faturamento}
                      onChange={(e) =>
                        setReceitaForm((prev) => ({
                          ...prev,
                          faturamento: maskCurrencyInputBrOrEmpty(e.target.value),
                        }))
                      }
                      placeholder="R$ 0,00"
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className={labelClassName}>Recebimento líquido</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={receitaForm.recebimentoLiquido}
                      onChange={(e) =>
                        setReceitaForm((prev) => ({
                          ...prev,
                          recebimentoLiquido: maskCurrencyInputBrOrEmpty(e.target.value),
                        }))
                      }
                      placeholder="R$ 0,00"
                      className={inputClassName}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClassName}>Status</label>
                    <StringSingleSelectDropdown
                      value={receitaForm.status}
                      onChange={(status) =>
                        setReceitaForm((prev) => ({
                          ...prev,
                          status: status as ReceitaStatus,
                        }))
                      }
                      options={STATUS_FORM_OPTIONS}
                      placeholder="Selecione"
                      allowEmpty={false}
                      disableSearch
                    />
                  </div>
                  <div>
                    <label className={labelClassName}>Data do recebimento</label>
                    <DatePickerField
                      value={receitaForm.statusData}
                      onChange={(statusData) =>
                        setReceitaForm((prev) => ({ ...prev, statusData }))
                      }
                      aria-label="Data do recebimento"
                      className="w-full"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Fornecedor
                  </label>
                  <input
                    type="text"
                    value={repasseForm.fornecedor}
                    onChange={(e) =>
                      setRepasseForm((prev) => ({ ...prev, fornecedor: e.target.value }))
                    }
                    className={inputClassName}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClassName}>Parcela</label>
                    <input
                      type="text"
                      value={repasseForm.parcela}
                      onChange={(e) =>
                        setRepasseForm((prev) => ({ ...prev, parcela: e.target.value }))
                      }
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <span className={labelClassName}>Boleto</span>
                    <label className="flex h-10 cursor-pointer items-center gap-2 group">
                      <input
                        type="checkbox"
                        checked={isBoletoSim(repasseForm.boleto)}
                        onChange={(e) =>
                          setRepasseForm((prev) => ({
                            ...prev,
                            boleto: e.target.checked ? 'SIM' : 'NÃO',
                          }))
                        }
                        className="sr-only"
                      />
                      <CheckboxIndicator checked={isBoletoSim(repasseForm.boleto)} />
                      <span className="text-sm font-medium text-gray-700 transition-colors group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-gray-100">
                        {isBoletoSim(repasseForm.boleto) ? 'Sim' : 'Não'}
                      </span>
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className={labelClassName}>Emissão</label>
                    <DatePickerField
                      value={repasseForm.dataEmissao}
                      onChange={(dataEmissao) =>
                        setRepasseForm((prev) => ({ ...prev, dataEmissao }))
                      }
                      aria-label="Data de emissão"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className={labelClassName}>Data</label>
                    <DatePickerField
                      value={repasseForm.data}
                      onChange={(data) => setRepasseForm((prev) => ({ ...prev, data }))}
                      aria-label="Data"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className={labelClassName}>Pagamento</label>
                    <DatePickerField
                      value={repasseForm.pagamento}
                      onChange={(pagamento) =>
                        setRepasseForm((prev) => ({ ...prev, pagamento }))
                      }
                      aria-label="Data de pagamento"
                      className="w-full"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className={labelClassName}>Valor original</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={repasseForm.valorOriginal}
                      onChange={(e) =>
                        setRepasseForm((prev) => ({
                          ...prev,
                          valorOriginal: maskCurrencyInputBrOrEmpty(e.target.value),
                        }))
                      }
                      placeholder="R$ 0,00"
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className={labelClassName}>O.C.</label>
                    <input
                      type="text"
                      value={repasseForm.oc}
                      onChange={(e) =>
                        setRepasseForm((prev) => ({ ...prev, oc: e.target.value }))
                      }
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className={labelClassName}>Valor final</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={repasseForm.valorFinal}
                      onChange={(e) =>
                        setRepasseForm((prev) => ({
                          ...prev,
                          valorFinal: maskCurrencyInputBrOrEmpty(e.target.value),
                        }))
                      }
                      placeholder="R$ 0,00"
                      className={inputClassName}
                    />
                  </div>
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                disabled={isSaving}
                onClick={closeForm}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveForm()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isSaving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={showImport}
          onClose={() => !isImporting && setShowImport(false)}
          title={`Importar · ${listTitle}`}
          size="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {tipo === 'receitas' ? (
                <>
                  O sistema lê a aba{' '}
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {consorcio === 'bsb' ? 'CONSORCIO BSB' : 'CONSORCIO HUB'}
                  </span>{' '}
                  da planilha de controle financeiro.
                </>
              ) : (
                <>
                  O sistema lê a aba{' '}
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    REPASSES GENNESIS
                  </span>
                  , na seção{' '}
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {consorcio === 'bsb' ? 'BSB' : 'HUB'}
                  </span>
                  .
                </>
              )}
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={isImporting}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-red-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-red-700 disabled:opacity-60 dark:text-gray-300 dark:file:bg-red-950/40 dark:file:text-red-300"
              onChange={(e) => {
                const file = e.target.files?.[0];
                void handleImportFile(file);
                e.target.value = '';
              }}
            />
            {isImporting ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Importando planilha…</p>
            ) : null}
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                disabled={isImporting}
                onClick={() => setShowImport(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
