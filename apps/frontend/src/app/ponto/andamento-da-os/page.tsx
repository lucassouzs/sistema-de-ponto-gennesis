'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ClipboardList, Edit, Trash2, Search, X, AlertCircle, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import {
  budgetStatusPillClass,
  executionStatusPillClass,
  pleitoStatusReadOnlySpanClass,
  pleitoStatusSelectBase
} from '@/lib/pleitoStatusStyles';

const RVI_RVF_OPCOES = ['FEITO', 'PENDENTE'];

const STATUS_EXECUCAO_OPCOES = [
  'CONCLUÍDA',
  'EXECUÇÃO',
  'FINALIZADA',
  'GARANTIA',
  'GARANTIA RESOLVIDA',
  'PD. EXECUÇÃO',
  'PENDÊNCIA',
  'STANDBY'
];

const STATUS_ORCAMENTO_OPCOES = [
  'Analise Fiscal',
  'Engenharia',
  'Equipe de Orçamento',
  'Aprovado',
  'Faturado',
  'Stand By'
];
const OUTRO_STATUS = '__OUTRO__';

const ANO_ATUAL = new Date().getFullYear();
const ANOS_FILTRO = Array.from({ length: 16 }, (_, i) => ANO_ATUAL - 6 + i);

const MESES = [
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' }
];

function getCurrentMonthYear() {
  const d = new Date();
  return {
    creationMonth: String(d.getMonth() + 1).padStart(2, '0'),
    creationYear: String(d.getFullYear())
  };
}

export interface Pleito {
  id: string;
  updatedContract?: { id: string; name: string; number: string } | null;
  creationMonth: string | null;
  creationYear: number | null;
  startDate: string | null;
  endDate: string | null;
  budgetStatus: string | null;
  folderNumber: string | null;
  lot: string | null;
  divSe: string | null;
  location: string | null;
  unit: string | null;
  serviceDescription: string;
  budget: string | null;
  executionStatus: string | null;
  billingStatus: string | null;
  accumulatedBilled: number | null;
  billingRequest: number | null;
  budgetAmount1: number | null;
  budgetAmount2: number | null;
  budgetAmount3: number | null;
  budgetAmount4: number | null;
  pv: string | null;
  ipi: string | null;
  reportsBilling: string | null;
  engineer: string | null;
  supervisor: string | null;
}

const emptyForm = (): Record<string, string> => {
  const { creationMonth, creationYear } = getCurrentMonthYear();
  return {
  creationMonth,
  creationYear,
  startDate: '',
  endDate: '',
  budgetStatus: '',
  budgetStatusCustom: '',
  folderNumber: '',
  lot: '',
  divSe: '',
  location: '',
  unit: '',
  serviceDescription: '',
  executionStatus: '',
  billingStatus: '',
  accumulatedBilled: '',
  billingRequest: '',
  budgetAmount1: '',
  budgetAmount2: '',
  budgetAmount3: '',
  budgetAmount4: '',
  pv: '',
  ipi: '',
  reportsBilling: '',
  engineer: '',
  supervisor: ''
  };
};

function pleitoToForm(p: Pleito): Record<string, string> {
  const m = p.creationMonth;
  const num = m ? parseInt(String(m).replace(/\D/g, ''), 10) : NaN;
  const monthVal = num >= 1 && num <= 12 ? String(num).padStart(2, '0') : (m || '');
  return {
    creationMonth: monthVal,
    creationYear: p.creationYear != null ? String(p.creationYear) : '',
    startDate: p.startDate ? p.startDate.split('T')[0] : '',
    endDate: p.endDate ? p.endDate.split('T')[0] : '',
    budgetStatus: STATUS_ORCAMENTO_OPCOES.includes(p.budgetStatus || '') ? (p.budgetStatus || '') : (p.budgetStatus ? OUTRO_STATUS : ''),
    budgetStatusCustom: STATUS_ORCAMENTO_OPCOES.includes(p.budgetStatus || '') ? '' : (p.budgetStatus || ''),
    folderNumber: p.folderNumber || '',
    lot: p.lot || '',
    divSe: p.divSe || '',
    location: p.location || '',
    unit: p.unit || '',
    serviceDescription: p.serviceDescription || '',
    executionStatus: p.executionStatus || '',
    billingStatus: (p.billingStatus || '').replace('%', '').trim(),
    accumulatedBilled: formatBudgetForInput(p.accumulatedBilled != null ? String(p.accumulatedBilled) : null),
    billingRequest: formatBudgetForInput(p.billingRequest != null ? String(p.billingRequest) : null),
    budgetAmount1: formatBudgetForInput(p.budgetAmount1 != null ? String(p.budgetAmount1) : null),
    budgetAmount2: formatBudgetForInput(p.budgetAmount2 != null ? String(p.budgetAmount2) : null),
    budgetAmount3: formatBudgetForInput(p.budgetAmount3 != null ? String(p.budgetAmount3) : null),
    budgetAmount4: formatBudgetForInput(p.budgetAmount4 != null ? String(p.budgetAmount4) : null),
    pv: p.pv || '',
    ipi: p.ipi || '',
    reportsBilling: p.reportsBilling || '',
    engineer: p.engineer || '',
    supervisor: p.supervisor || ''
  };
}

const toPayloadNum = (v: string) => { const n = parseBudgetToNumber(v); return n !== 0 ? n : null; };
const toPayloadStr = (v: string) => (v?.trim() || null);
const currencyChange = (form: Record<string, string>, setForm: (f: Record<string, string>) => void, key: string) =>
  (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '');
    setForm({ ...form, [key]: v ? (Number(v) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '' });
  };

function formToPayload(f: Record<string, string>) {
  const nBudget = parseBudgetToNumber(getLatestBudgetFromForm(f));
  return {
    creationMonth: toPayloadStr(f.creationMonth),
    creationYear: toPayloadStr(f.creationYear),
    startDate: toPayloadStr(f.startDate),
    endDate: toPayloadStr(f.endDate),
    budgetStatus: (f.budgetStatus === OUTRO_STATUS ? f.budgetStatusCustom?.trim() : f.budgetStatus?.trim()) || null,
    folderNumber: toPayloadStr(f.folderNumber),
    lot: toPayloadStr(f.lot),
    divSe: toPayloadStr(f.divSe),
    location: toPayloadStr(f.location),
    unit: toPayloadStr(f.unit),
    serviceDescription: f.serviceDescription.trim(),
    budget: nBudget !== 0 ? nBudget.toFixed(2) : null,
    executionStatus: toPayloadStr(f.executionStatus),
    billingStatus: f.billingStatus ? String(f.billingStatus).replace(',', '.').trim() : null,
    updatedContractId: null,
    accumulatedBilled: toPayloadNum(f.accumulatedBilled)?.toFixed(2) ?? null,
    billingRequest: toPayloadNum(f.billingRequest)?.toFixed(2) ?? null,
    invoiceNumber: null,
    estimator: null,
    budgetAmount1: toPayloadNum(f.budgetAmount1),
    budgetAmount2: toPayloadNum(f.budgetAmount2),
    budgetAmount3: toPayloadNum(f.budgetAmount3),
    budgetAmount4: toPayloadNum(f.budgetAmount4),
    pv: toPayloadStr(f.pv),
    ipi: toPayloadStr(f.ipi),
    reportsBilling: toPayloadStr(f.reportsBilling),
    engineer: toPayloadStr(f.engineer),
    supervisor: toPayloadStr(f.supervisor)
  };
}

function formatDate(s: string | null) {
  if (!s) return '-';
  return new Date(s).toLocaleDateString('pt-BR');
}

function formatMoney(n: number | null) {
  if (n == null) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function parseBudgetToNumber(v: string | null): number {
  if (!v) return 0;
  const s = String(v).replace(/[R$\s]/g, '').trim();
  if (!s) return 0;
  if (s.includes(',')) {
    const cleaned = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function formatBudgetForInput(v: string | null): string {
  const n = parseBudgetToNumber(v);
  return n === 0 ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Retorna o valor do orçamento mais atual (último R0X preenchido: R04 > R03 > R02 > R01) */
function getLatestBudgetFromForm(f: Record<string, string>): string {
  for (let i = 4; i >= 1; i--) {
    const n = parseBudgetToNumber(f[`budgetAmount${i}`]);
    if (n !== 0) return formatBudgetForInput(String(n));
  }
  return '';
}

function formatBudgetCurrency(v: string | null): string {
  if (!v) return '-';
  const n = parseBudgetToNumber(v);
  return n === 0 ? '-' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function formatCreationMonthYear(month: string | null, year: number | null): string {
  if (!month && !year) return '-';
  const m = month ? parseInt(String(month).replace(/\D/g, ''), 10) : NaN;
  const monthLabel = m >= 1 && m <= 12 ? MESES[m - 1]?.label : month || '';
  const yearStr = year ? String(year) : '';
  if (monthLabel && yearStr) return `${monthLabel}/${yearStr}`;
  return monthLabel || yearStr || '-';
}

function Input({
  label,
  name,
  form,
  setForm,
  type = 'text',
  textarea = false,
  step
}: {
  label: string;
  name: string;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  type?: string;
  textarea?: boolean;
  step?: string;
}) {
  const base =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      {textarea ? (
        <textarea
          rows={3}
          value={form[name] || ''}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
          className={base}
        />
      ) : (
        <input
          type={type}
          step={step}
          value={form[name] || ''}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
          className={base}
        />
      )}
    </div>
  );
}

export default function AndamentoDaOsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [filterContractId, setFilterContractId] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterLot, setFilterLot] = useState('');
  const [filterBudgetStatus, setFilterBudgetStatus] = useState('');
  const [filterPendingBilling, setFilterPendingBilling] = useState<'sim' | 'nao' | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Pleito | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: contractsListData } = useQuery({
    queryKey: ['contracts-list-os-filters'],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500, page: 1 } });
      return res.data;
    }
  });

  const { data: listData, isLoading: loadingList } = useQuery({
    queryKey: [
      'pleitos',
      searchTerm,
      currentPage,
      filterContractId,
      filterMonth,
      filterYear,
      filterLot,
      filterBudgetStatus,
      filterPendingBilling
    ],
    queryFn: async () => {
      const res = await api.get('/pleitos', {
        params: {
          search: searchTerm || undefined,
          page: currentPage,
          limit: 20,
          contractId: filterContractId || undefined,
          creationMonth: filterMonth || undefined,
          creationYear: filterYear || undefined,
          lot: filterLot.trim() || undefined,
          budgetStatus: filterBudgetStatus || undefined,
          pendingBilling: filterPendingBilling || undefined
        }
      });
      return res.data;
    }
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => api.patch(`/pleitos/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pleitos'] });
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm());
      toast.success('Atualizado!');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Erro ao atualizar')
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/pleitos/${id}`, { params: { excluirOrdemServico: true } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pleitos'] });
      setDeleteId(null);
      toast.success('Excluído!');
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Erro ao excluir')
  });

  const rows = (listData?.data || []) as Pleito[];
  const pagination = listData?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 };
  const contractsForFilter = (contractsListData?.data || []) as Array<{ id: string; name: string; number: string }>;

  const openEdit = (p: Pleito) => {
    setEditing(p);
    setForm(pleitoToForm(p));
    setShowForm(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.serviceDescription.trim()) {
      toast.error('Descrição do serviço é obrigatória');
      return;
    }
    if (!editing) {
      toast.error('Abra um registro pela lista para editar.');
      return;
    }
    const payload = formToPayload(form);
    updateMut.mutate({ id: editing.id, data: payload });
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) return <Loading message="Carregando..." fullScreen size="lg" />;

  return (
    <ProtectedRoute route="/ponto/andamento-da-os">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center justify-center gap-2">
              <ClipboardList className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              Ordem de Serviço
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Acompanhamento e controle das ordens de serviço
            </p>
          </div>

          <Card>
            <CardHeader className="border-b-0 space-y-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar descrição, pasta, nota, local, contrato..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="flex flex-wrap items-end gap-2 gap-y-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 mr-1">
                  <Filter className="w-3.5 h-3.5 shrink-0" />
                  Filtros
                </div>
                <div className="min-w-[160px] flex-1 sm:flex-initial">
                  <label className="block text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">Contrato</label>
                  <select
                    value={filterContractId}
                    onChange={(e) => {
                      setFilterContractId(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Todos</option>
                    {contractsForFilter.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.number ? `${c.number} — ${c.name}` : c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-[120px]">
                  <label className="block text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">Mês</label>
                  <select
                    value={filterMonth}
                    onChange={(e) => {
                      setFilterMonth(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Todos</option>
                    {MESES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-[100px]">
                  <label className="block text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">Ano</label>
                  <select
                    value={filterYear}
                    onChange={(e) => {
                      setFilterYear(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Todos</option>
                    {ANOS_FILTRO.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[100px] flex-1 sm:flex-initial sm:max-w-[140px]">
                  <label className="block text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">Lote</label>
                  <input
                    type="text"
                    value={filterLot}
                    onChange={(e) => {
                      setFilterLot(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Contém..."
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div className="min-w-[150px] flex-1 sm:flex-initial">
                  <label className="block text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">Status orçamento</label>
                  <select
                    value={filterBudgetStatus}
                    onChange={(e) => {
                      setFilterBudgetStatus(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Todos</option>
                    {STATUS_ORCAMENTO_OPCOES.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[160px] flex-1 sm:flex-initial">
                  <label className="block text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5">Pendente faturamento</label>
                  <select
                    value={filterPendingBilling}
                    onChange={(e) => {
                      setFilterPendingBilling((e.target.value as 'sim' | 'nao' | '') || '');
                      setCurrentPage(1);
                    }}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Todos</option>
                    <option value="sim">Com valor pendente</option>
                    <option value="nao">Sem pendência</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFilterContractId('');
                    setFilterMonth('');
                    setFilterYear('');
                    setFilterLot('');
                    setFilterBudgetStatus('');
                    setFilterPendingBilling('');
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Limpar filtros
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[2950px]">
                  <thead className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
                    <tr>
                      {[
                        'Contrato',
                        'Mês/Ano criação',
                        'Data início',
                        'Data término',
                        'Status orçamento',
                        'Nº pasta',
                        'Lote',
                        'OS / SE',
                        'Local',
                        'Unidade',
                        'Descrição serviço',
                        'Orçamento',
                        'Status execução',
                        'Status faturamento (%)',
                        'Acumulado faturado',
                        'Pendente faturamento',
                        'Orçamento R01',
                        'Orçamento R02',
                        'Orçamento R03',
                        'Orçamento R04',
                        'RVI',
                        'RVF',
                        'Feedback Relatorios',
                        'Engenheiro',
                        'Encarregado',
                        'Ações'
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-2 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {loadingList ? (
                      <tr>
                        <td colSpan={26} className="px-4 py-8 text-center text-gray-500">
                          Carregando...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={26} className="px-4 py-8 text-center text-gray-500">
                          Nenhum registro encontrado com os filtros atuais.
                        </td>
                      </tr>
                    ) : (
                      rows.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="px-2 py-2 max-w-[200px] truncate" title={p.updatedContract ? `${p.updatedContract.number} ${p.updatedContract.name}` : ''}>
                            {p.updatedContract ? (
                              <span className="text-gray-900 dark:text-gray-100">
                                {p.updatedContract.name}
                                {p.updatedContract.number ? (
                                  <span className="text-gray-500 dark:text-gray-400"> ({p.updatedContract.number})</span>
                                ) : null}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatCreationMonthYear(p.creationMonth, p.creationYear)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatDate(p.startDate)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatDate(p.endDate)}</td>
                          <td className="px-2 py-2 max-w-[100px] truncate">
                            <span className={pleitoStatusReadOnlySpanClass('budget', p.budgetStatus)} title={p.budgetStatus || ''}>
                              {p.budgetStatus || '—'}
                            </span>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">{p.folderNumber || '-'}</td>
                          <td className="px-2 py-2">{p.lot || '-'}</td>
                          <td className="px-2 py-2">{p.divSe || '-'}</td>
                          <td className="px-2 py-2 max-w-[120px] truncate">{p.location || '-'}</td>
                          <td className="px-2 py-2">{p.unit || '-'}</td>
                          <td className="px-2 py-2 max-w-[200px] truncate" title={p.serviceDescription}>
                            {p.serviceDescription}
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatBudgetCurrency(p.budget)}</td>
                          <td className="px-2 py-2 max-w-[100px] truncate">
                            <span className={pleitoStatusReadOnlySpanClass('execution', p.executionStatus)} title={p.executionStatus || ''}>
                              {p.executionStatus || '—'}
                            </span>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap">{p.billingStatus != null && p.billingStatus !== '' ? `${String(p.billingStatus).replace('.', ',')}%` : '-'}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatMoney(p.accumulatedBilled)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatMoney(p.billingRequest)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatMoney(p.budgetAmount1)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatMoney(p.budgetAmount2)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatMoney(p.budgetAmount3)}</td>
                          <td className="px-2 py-2 whitespace-nowrap">{formatMoney(p.budgetAmount4)}</td>
                          <td className="px-2 py-2 max-w-[100px] truncate">{p.pv || '-'}</td>
                          <td className="px-2 py-2 max-w-[100px] truncate">{p.ipi || '-'}</td>
                          <td className="px-2 py-2 max-w-[120px] truncate">{p.reportsBilling || '-'}</td>
                          <td className="px-2 py-2 max-w-[100px] truncate">{p.engineer || '-'}</td>
                          <td className="px-2 py-2 max-w-[100px] truncate">{p.supervisor || '-'}</td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => openEdit(p)}
                                className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteId(p.id)}
                                className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {pagination.totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    Página {pagination.page} de {pagination.totalPages} ({pagination.total} registros)
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => p - 1)}
                      className="px-3 py-1 border rounded disabled:opacity-50"
                    >
                      Anterior
                    </button>
                    <button
                      disabled={currentPage >= pagination.totalPages}
                      onClick={() => setCurrentPage((p) => p + 1)}
                      className="px-3 py-1 border rounded disabled:opacity-50"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
            <div className="absolute inset-0" onClick={() => setShowForm(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl max-h-[95vh] overflow-y-auto">
              <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b bg-white dark:bg-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Editar Ordem de Serviço</h3>
                <button onClick={() => setShowForm(false)} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={submit} className="p-4 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Mês de criação</label>
                      <select
                        value={form.creationMonth || ''}
                        onChange={(e) => setForm({ ...form, creationMonth: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                      >
                        <option value="">Selecione</option>
                        {MESES.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ano</label>
                      <input
                        type="number"
                        min={2000}
                        max={2100}
                        value={form.creationYear || ''}
                        onChange={(e) => setForm({ ...form, creationYear: e.target.value })}
                        placeholder="Ano"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                      />
                    </div>
                  </div>
                  <Input label="Data início" name="startDate" form={form} setForm={setForm} type="date" />
                  <Input label="Data término" name="endDate" form={form} setForm={setForm} type="date" />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status orçamento</label>
                    <select
                      value={form.budgetStatus || ''}
                      onChange={(e) => setForm({ ...form, budgetStatus: e.target.value })}
                      className={
                        form.budgetStatus && form.budgetStatus !== ''
                          ? `${pleitoStatusSelectBase} ${
                              form.budgetStatus === OUTRO_STATUS
                                ? budgetStatusPillClass(form.budgetStatusCustom || null)
                                : budgetStatusPillClass(form.budgetStatus)
                            }`
                          : 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm'
                      }
                    >
                      <option value="">Selecione</option>
                      {STATUS_ORCAMENTO_OPCOES.map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                      <option value={OUTRO_STATUS}>Outro (cadastrar novo)</option>
                    </select>
                    {form.budgetStatus === OUTRO_STATUS && (
                      <input
                        type="text"
                        value={form.budgetStatusCustom || ''}
                        onChange={(e) => setForm({ ...form, budgetStatusCustom: e.target.value })}
                        placeholder="Digite o novo status"
                        className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                      />
                    )}
                  </div>
                  <div className="w-28">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nº pasta</label>
                    <input
                      type="number"
                      min={0}
                      value={form.folderNumber || ''}
                      onChange={(e) => setForm({ ...form, folderNumber: e.target.value })}
                      placeholder="Nº"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    />
                  </div>
                  <Input label="Lote" name="lot" form={form} setForm={setForm} />
                  <Input label="OS / SE" name="divSe" form={form} setForm={setForm} />
                  <Input label="Local" name="location" form={form} setForm={setForm} />
                  <Input label="Unidade" name="unit" form={form} setForm={setForm} />
                  <div className="md:col-span-2 lg:col-span-3">
                    <Input label="Descrição do serviço *" name="serviceDescription" form={form} setForm={setForm} textarea />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Orçamento (somente leitura — valor mais atual)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium text-sm">
                        R$
                      </span>
                      <div className="w-full pl-12 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 text-sm">
                        {getLatestBudgetFromForm(form) || '-'}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status execução</label>
                    <select
                      value={form.executionStatus || ''}
                      onChange={(e) => setForm({ ...form, executionStatus: e.target.value })}
                      className={
                        form.executionStatus && form.executionStatus !== ''
                          ? `${pleitoStatusSelectBase} ${executionStatusPillClass(form.executionStatus)}`
                          : 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm'
                      }
                    >
                      <option value="">Selecione</option>
                      {STATUS_EXECUCAO_OPCOES.map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status faturamento (%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={form.billingStatus || ''}
                        onChange={(e) => setForm({ ...form, billingStatus: e.target.value })}
                        placeholder="0"
                        className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium text-sm">
                        %
                      </span>
                    </div>
                  </div>
                  {[
                    { key: 'accumulatedBilled', label: 'Acumulado faturado' },
                    { key: 'billingRequest', label: 'Pendente faturamento' },
                    { key: 'budgetAmount1', label: 'Orçamento R01' },
                    { key: 'budgetAmount2', label: 'Orçamento R02' },
                    { key: 'budgetAmount3', label: 'Orçamento R03' },
                    { key: 'budgetAmount4', label: 'Orçamento R04' }
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium text-sm">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={form[key] || ''}
                          onChange={currencyChange(form, setForm, key)}
                          placeholder="0,00"
                          className="w-full pl-12 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">RVI</label>
                    <select
                      value={form.pv || ''}
                      onChange={(e) => setForm({ ...form, pv: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    >
                      <option value="">Selecione</option>
                      {RVI_RVF_OPCOES.map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">RVF</label>
                    <select
                      value={form.ipi || ''}
                      onChange={(e) => setForm({ ...form, ipi: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                    >
                      <option value="">Selecione</option>
                      {RVI_RVF_OPCOES.map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  </div>
                  <Input label="Feedback Relatorios" name="reportsBilling" form={form} setForm={setForm} />
                  <Input label="Engenheiro" name="engineer" form={form} setForm={setForm} />
                  <Input label="Encarregado" name="supervisor" form={form} setForm={setForm} />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={updateMut.isPending}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50"
                  >
                    {updateMut.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="absolute inset-0" onClick={() => setDeleteId(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm mx-4 shadow-xl">
              <div className="flex justify-center mb-3">
                <AlertCircle className="w-10 h-10 text-red-500" />
              </div>
              <p className="text-center text-gray-700 dark:text-gray-300 mb-4">Excluir este registro de Ordem de Serviço?</p>
              <div className="flex justify-center gap-2">
                <button onClick={() => setDeleteId(null)} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">
                  Cancelar
                </button>
                <button
                  onClick={() => deleteMut.mutate(deleteId)}
                  disabled={deleteMut.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}
