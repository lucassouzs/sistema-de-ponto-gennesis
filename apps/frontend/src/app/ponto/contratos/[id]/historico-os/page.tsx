'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, FileDown, FileSpreadsheet } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { formatOsSePastaOrDash } from '@/lib/formatOsSePasta';
import { pleitoStatusReadOnlySpanClass } from '@/lib/pleitoStatusStyles';
import {
  exportHistoricoOsPdf,
  exportPleitosOsToXlsx,
  computeHistoricoOsTotals,
  getOsFaturamentoAcumulado,
  getOsStatus,
  getOsStatusFaturamento,
  getOsStatusFaturamentoPct,
  getPleitoCreationMonth,
  getPleitoCreationYear,
  getPleitoOrcamentoValor,
  osStatusBadgeClass,
  type BillingForOsCheck,
  type PleitoOsExportRow,
} from '@/lib/pleitoOsExport';
import toast from 'react-hot-toast';
import { formatDateTimeBr } from '@/lib/dateTimeBr';

interface ContractBrief {
  id: string;
  name: string;
  number: string;
}

const MESES_OPCOES = [
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

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  const raw = String(dateStr).trim();
  const only = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = only
    ? new Date(Number(only[1]), Number(only[2]) - 1, Number(only[3]), 12, 0, 0, 0)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function toggleInSet<T>(set: Set<T>, value: T, checked: boolean): Set<T> {
  const next = new Set(set);
  if (checked) next.add(value);
  else next.delete(value);
  return next;
}

function CheckboxFilterDropdown<T extends string | number>({
  title,
  options,
  selected,
  onChange,
  allLabel = 'Marcar todos',
  noneLabel = 'Limpar',
  minWidth = '11rem',
}: {
  title: string;
  options: { value: T; label: string }[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
  allLabel?: string;
  noneLabel?: string;
  minWidth?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const summary =
    options.length === 0
      ? 'Sem opções'
      : selected.size === 0
        ? 'Todos'
        : selected.size === options.length
          ? 'Todos selecionados'
          : `${selected.size} selecionado(s)`;

  return (
    <div ref={rootRef} className="relative" style={{ minWidth }}>
      <button
        type="button"
        onClick={() => options.length > 0 && setOpen((v) => !v)}
        disabled={options.length === 0}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex flex-col items-start min-w-0 text-left">
          <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {title}
          </span>
          <span className="text-xs truncate max-w-[140px]">{summary}</span>
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && options.length > 0 && (
        <div
          role="listbox"
          className="absolute z-50 left-0 top-full mt-1 w-full min-w-[220px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg py-2"
        >
          <div className="flex items-center justify-end gap-2 px-3 pb-2 border-b border-gray-100 dark:border-gray-700 text-[11px]">
            <button
              type="button"
              onClick={() => onChange(new Set(options.map((o) => o.value)))}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {allLabel}
            </button>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <button
              type="button"
              onClick={() => onChange(new Set())}
              className="text-gray-500 dark:text-gray-400 hover:underline"
            >
              {noneLabel}
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5 px-2 pt-2">
            {options.map((opt) => (
              <label
                key={String(opt.value)}
                className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded px-2 py-1.5"
              >
                <input
                  type="checkbox"
                  checked={selected.has(opt.value)}
                  onChange={(e) => onChange(toggleInSet(selected, opt.value, e.target.checked))}
                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="truncate">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HistoricoOsPage() {
  const params = useParams();
  const router = useRouter();
  const idParam = params?.id;
  const contractId =
    typeof idParam === 'string' ? idParam : Array.isArray(idParam) ? idParam[0] ?? '' : '';

  const [search, setSearch] = useState('');
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set());
  const [selectedOsIds, setSelectedOsIds] = useState<Set<string>>(new Set());
  const [exportingPdf, setExportingPdf] = useState(false);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const { data: contractData, isLoading: loadingContract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}`);
      return res.data;
    },
    enabled: !!contractId,
  });

  const { data: pleitosData, isLoading: loadingPleitos } = useQuery({
    queryKey: ['contract-pleitos', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/pleitos`);
      return res.data;
    },
    enabled: !!contractId,
  });

  const { data: billingsData, isLoading: loadingBillings } = useQuery({
    queryKey: ['contract-billings', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/billings`);
      return res.data;
    },
    enabled: !!contractId,
  });

  const billingsForOs = useMemo(() => {
    const rows = (billingsData as { data?: BillingForOsCheck[] } | undefined)?.data || [];
    return rows as BillingForOsCheck[];
  }, [billingsData]);

  const allOs = useMemo(() => {
    const raw = (Array.isArray(pleitosData)
      ? pleitosData
      : (pleitosData as { data?: PleitoOsExportRow[] })?.data) || [];
    return [...raw].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }, [pleitosData]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    allOs.forEach((p) => {
      const y = getPleitoCreationYear(p);
      if (y) years.add(y);
    });
    return Array.from(years)
      .sort((a, b) => b - a)
      .map((y) => ({ value: y, label: String(y) }));
  }, [allOs]);

  const monthOptions = useMemo(() => {
    const months = new Set<number>();
    allOs.forEach((p) => {
      const m = getPleitoCreationMonth(p);
      if (m) months.add(m);
    });
    return MESES_OPCOES.filter((m) => months.has(m.value));
  }, [allOs]);

  const osOptions = useMemo(
    () =>
      allOs.map((p) => ({
        value: p.id,
        label: formatOsSePastaOrDash(p.divSe, p.folderNumber),
      })),
    [allOs]
  );

  const filteredOs = useMemo(() => {
    return allOs.filter((p) => {
      if (selectedYears.size > 0) {
        const y = getPleitoCreationYear(p);
        if (y == null || !selectedYears.has(y)) return false;
      }
      if (selectedMonths.size > 0) {
        const m = getPleitoCreationMonth(p);
        if (m == null || !selectedMonths.has(m)) return false;
      }
      if (selectedOsIds.size > 0 && !selectedOsIds.has(p.id)) return false;

      const q = search.trim().toLowerCase();
      if (!q) return true;
      const os = formatOsSePastaOrDash(p.divSe, p.folderNumber).toLowerCase();
      const desc = (p.serviceDescription || '').toLowerCase();
      const status = getOsStatus(p, billingsForOs, allOs).toLowerCase();
      const statusFat = getOsStatusFaturamento(p, billingsForOs).toLowerCase();
      return os.includes(q) || desc.includes(q) || status.includes(q) || statusFat.includes(q);
    });
  }, [allOs, selectedYears, selectedMonths, selectedOsIds, search, billingsForOs]);

  const totals = useMemo(
    () => computeHistoricoOsTotals(filteredOs, billingsForOs),
    [filteredOs, billingsForOs]
  );

  const contract = (contractData as { data?: ContractBrief } | undefined)?.data;

  const handleExportExcel = () => {
    if (filteredOs.length === 0) {
      toast.error('Não há ordens de serviço para exportar.');
      return;
    }
    try {
      const contractSlug = contract?.number?.replace(/[^\w-]+/g, '_') || contractId.slice(0, 8);
      exportPleitosOsToXlsx(filteredOs, billingsForOs, `historico-os-${contractSlug}`);
      toast.success(`${filteredOs.length} ordem(ns) exportada(s) para Excel.`);
    } catch {
      toast.error('Erro ao exportar para Excel.');
    }
  };

  const handleExportPdf = async () => {
    if (allOs.length === 0) {
      toast.error('Não há ordens de serviço para exportar.');
      return;
    }
    setExportingPdf(true);
    try {
      const contractSlug = contract?.number?.replace(/[^\w-]+/g, '_') || contractId.slice(0, 8);
      await exportHistoricoOsPdf(allOs, billingsForOs, {
        contractName: contract?.name,
        contractNumber: contract?.number,
        filenamePrefix: `historico-os-${contractSlug}`,
      });
      toast.success(`PDF gerado com ${allOs.length} ordem(ns) de serviço.`);
    } catch {
      toast.error('Erro ao gerar PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  if (loadingContract || !contractId) {
    return (
      <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href={`/ponto/contratos/${contractId}`}
            className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-6 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao contrato
          </Link>

          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Histórico de OS</h1>
              {contract && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {contract.number} – {contract.name}
                </p>
              )}
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Todas as ordens de serviço cadastradas neste contrato. Use os filtros por checkbox; vazio = todos.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar descrição ou situação…"
                className="w-full sm:w-56 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={filteredOs.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Exportar Excel
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={allOs.length === 0 || exportingPdf}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium"
              >
                <FileDown className="w-4 h-4" />
                {exportingPdf ? 'Gerando PDF…' : 'Exportar PDF'}
              </button>
            </div>
          </div>

          {!loadingPleitos && !loadingBillings && allOs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <CheckboxFilterDropdown
                title="Ano de criação"
                options={yearOptions}
                selected={selectedYears}
                onChange={setSelectedYears}
              />
              <CheckboxFilterDropdown
                title="Mês de criação"
                options={monthOptions}
                selected={selectedMonths}
                onChange={setSelectedMonths}
                minWidth="12rem"
              />
              <CheckboxFilterDropdown
                title="OS / SE"
                options={osOptions}
                selected={selectedOsIds}
                onChange={setSelectedOsIds}
                minWidth="14rem"
              />
            </div>
          )}

          {!loadingPleitos && !loadingBillings && filteredOs.length > 0 && (
            <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-4 py-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Total orçado (filtro)</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrency(totals.totalOrcado)}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-4 py-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Total pleiteado (filtro)</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrency(totals.totalPleiteado)}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/50 px-4 py-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Total faturado (filtro)</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrency(totals.totalFaturado)}
                </p>
              </div>
            </div>
          )}

          {loadingPleitos || loadingBillings ? (
            <Loading />
          ) : allOs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">
              Nenhuma ordem de serviço cadastrada para este contrato.
            </p>
          ) : filteredOs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">
              Nenhuma OS encontrada com os filtros selecionados.
            </p>
          ) : (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-x-auto bg-white dark:bg-gray-900/50">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap min-w-[10rem]">
                      OS / SE
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Descrição</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      Mês/Ano criação
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      Data início
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      Data término
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                      Status Orçamento
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                      Status Execução
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">Orçamento</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      Valor faturado
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      Status Faturamento (%)
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">
                      Valor pleiteado
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      Preenchimento
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      Status Pleito
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      Status Faturamento
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredOs.map((p) => {
                    const osStatus = getOsStatus(p, billingsForOs, allOs);
                    const osStatusFat = getOsStatusFaturamento(p, billingsForOs);
                    const mesAno =
                      p.creationMonth && p.creationYear
                        ? `${String(p.creationMonth).padStart(2, '0')}/${p.creationYear}`
                        : '—';
                    const valorPleiteado = p.billingRequest ? Number(p.billingRequest) : 0;
                    const valorFaturado = getOsFaturamentoAcumulado(p, billingsForOs);
                    const statusFatPct = getOsStatusFaturamentoPct(p, billingsForOs);
                    const orcamentoNum = getPleitoOrcamentoValor(p);

                    return (
                      <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 font-medium whitespace-nowrap min-w-[10rem]">
                          {formatOsSePastaOrDash(p.divSe, p.folderNumber)}
                        </td>
                        <td
                          className="px-3 py-2 text-gray-900 dark:text-gray-100 max-w-xs truncate"
                          title={p.serviceDescription || ''}
                        >
                          {p.serviceDescription || '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">{mesAno}</td>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {formatDate(p.startDate)}
                        </td>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {formatDate(p.endDate)}
                        </td>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 align-middle">
                          <span
                            className={pleitoStatusReadOnlySpanClass('budget', p.budgetStatus)}
                            title={p.budgetStatus || ''}
                          >
                            {p.budgetStatus || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 align-middle">
                          <span
                            className={pleitoStatusReadOnlySpanClass('execution', p.executionStatus)}
                            title={p.executionStatus || ''}
                          >
                            {p.executionStatus || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {orcamentoNum > 0 ? formatCurrency(orcamentoNum) : p.budget || '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {valorFaturado > 0 ? formatCurrency(valorFaturado) : '—'}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {statusFatPct != null ? `${statusFatPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {formatCurrency(valorPleiteado)}
                        </td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {formatDateTimeBr(p.createdAt)}
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${osStatusBadgeClass(osStatus)}`}
                          >
                            {osStatus}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${osStatusBadgeClass(osStatusFat)}`}
                          >
                            {osStatusFat}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loadingPleitos && !loadingBillings && filteredOs.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              Exibindo {filteredOs.length} de {allOs.length} ordem(ns) de serviço.
            </p>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
