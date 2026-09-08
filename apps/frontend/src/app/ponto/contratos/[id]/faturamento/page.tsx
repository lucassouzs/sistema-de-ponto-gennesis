'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Receipt, Trash2, Search, Filter, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { formatOsSePastaOrDash, folderForDivSe } from '@/lib/formatOsSePasta';
import { useContractTableColumnCustomizer } from '@/components/useContractTableColumnCustomizer';
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { formatDateTimeBr } from '@/lib/dateTimeBr';

interface ContractBilling {
  id: string;
  contractId: string;
  issueDate: string;
  invoiceNumber: string;
  serviceOrder: string;
  grossValue: number;
  createdAt?: string;
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function billingMatchesSearchTerm(b: ContractBilling, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  const haystack = [
    b.invoiceNumber,
    b.serviceOrder,
    b.issueDate,
    formatCurrency(b.grossValue),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(t);
}

const LIST_SEARCH_INPUT_CLASS =
  'h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

const MESES_FILTRO_SELECT_OPTIONS = labeledToSelectOptions(
  MESES_FILTRO.map((m) => ({ value: String(m.value), label: m.label }))
);

export default function FaturamentoListPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const idParam = params?.id;
  const contractId =
    typeof idParam === 'string' ? idParam : Array.isArray(idParam) ? idParam[0] ?? '' : '';
  const router = useRouter();
  const queryClient = useQueryClient();

  const yearParam = searchParams?.get('year') ?? null;
  const monthParam = searchParams?.get('month') ?? null;

  const [selectedYear, setSelectedYear] = useState(() => (yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(() => (monthParam ? parseInt(monthParam, 10) : 0));
  const [searchTermBillings, setSearchTermBillings] = useState('');
  const [showBillingFilterModal, setShowBillingFilterModal] = useState(false);
  const [filterBillingOsSe, setFilterBillingOsSe] = useState('');
  const [filterBillingInvoice, setFilterBillingInvoice] = useState('');

  const isAllYears = selectedYear === 0;
  const { user, userPosition } = usePermissions();

  const userRole: 'EMPLOYEE' = 'EMPLOYEE';
  const userName = user?.name || 'Usuário';

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

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

  const { data: pleitosData } = useQuery({
    queryKey: ['contract-pleitos', contractId, 'faturamento-labels'],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/pleitos`);
      return res.data;
    },
    enabled: !!contractId
  });

  const deleteBillingMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/contracts/${contractId}/billings/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-billings', contractId] });
      toast.success('Faturamento excluído com sucesso!');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao excluir faturamento');
    }
  });

  const billings = (Array.isArray(billingsData) ? billingsData : (billingsData as { data?: ContractBilling[] })?.data) || [];
  const pleitosForOsLabel = (
    Array.isArray(pleitosData) ? pleitosData : (pleitosData as { data?: { divSe: string | null; folderNumber: string | null }[] })?.data
  ) || [];
  const isAdministrator = (userPosition || '').trim().toLowerCase() === 'administrador';

  const containerRef = useRef<HTMLDivElement | null>(null);

  const filteredBillings = useMemo(() => {
    return billings.filter((b) => {
      const d = new Date(b.issueDate);
      if (!isAllYears && d.getFullYear() !== selectedYear) return false;
      if (selectedMonth !== 0 && d.getMonth() + 1 !== selectedMonth) return false;

      if (!billingMatchesSearchTerm(b, searchTermBillings)) return false;

      const osTerm = filterBillingOsSe.trim().toLowerCase();
      if (osTerm && !(b.serviceOrder || '').toLowerCase().includes(osTerm)) return false;

      const nfTerm = filterBillingInvoice.trim().toLowerCase();
      if (nfTerm && !(b.invoiceNumber || '').toLowerCase().includes(nfTerm)) return false;

      return true;
    });
  }, [billings, isAllYears, selectedYear, selectedMonth, searchTermBillings, filterBillingOsSe, filterBillingInvoice]);

  const hasActiveBillingFilter = Boolean(
    isAllYears || selectedMonth !== 0 || filterBillingOsSe.trim() || filterBillingInvoice.trim()
  );

  const clearBillingFilters = () => {
    setSelectedYear(new Date().getFullYear());
    setSelectedMonth(0);
    setFilterBillingOsSe('');
    setFilterBillingInvoice('');
  };

  const totalBruto = useMemo(() => {
    const bruto = filteredBillings.reduce((acc, b) => acc + (Number(b.grossValue) || 0), 0);
    return bruto;
  }, [filteredBillings]);

  const contract = contractData as { name?: string; number?: string } | undefined;

  useContractTableColumnCustomizer(containerRef, 'contracts:faturamento', filteredBillings);

  if (loadingContract || !contractId) {
    return (
      <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
        <MainLayout userRole={userRole} userName={userName} onLogout={handleLogout}>
          <Loading />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
      <MainLayout userRole={userRole} userName={userName} onLogout={handleLogout}>
        <div ref={containerRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href={`/ponto/contratos/${contractId}`}
            className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-6 text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao contrato
          </Link>

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Faturamento
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {contract?.number} – {contract?.name}
            </p>
          </div>

          <Card>
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Todos os lançamentos
                      </h3>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {filteredBillings.length} {filteredBillings.length === 1 ? 'registro' : 'registros'}
                      {selectedMonth > 0 ? ` em ${MESES_FILTRO.find((m) => m.value === selectedMonth)?.label}` : ''}
                      {isAllYears ? ' (todos os anos)' : ` (${selectedYear})`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="search"
                      value={searchTermBillings}
                      onChange={(e) => setSearchTermBillings(e.target.value)}
                      placeholder="Buscar nota, OS, valor..."
                      className={LIST_SEARCH_INPUT_CLASS}
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
                </div>
              </div>
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
                      : searchTermBillings.trim() || hasActiveBillingFilter
                        ? 'Nenhum faturamento encontrado com os filtros atuais.'
                        : 'Nenhum faturamento no período selecionado.'}
                  </p>
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="w-full" data-cc-skip-column-customizer="1">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Data Emissão</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nº Nota Fiscal</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">OS / SE</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Valor Bruto</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Preenchimento</th>
                        {isAdministrator && (
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ações</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredBillings.map((b) => (
                        <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{formatDate(b.issueDate)}</td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100">{b.invoiceNumber}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {formatOsSePastaOrDash(b.serviceOrder, folderForDivSe(pleitosForOsLabel, b.serviceOrder))}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">{formatCurrency(b.grossValue)}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDateTimeBr(b.createdAt || '')}</td>
                          {isAdministrator && (
                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => {
                                  if (confirm('Excluir este faturamento?')) {
                                    deleteBillingMutation.mutate(b.id);
                                  }
                                }}
                                disabled={deleteBillingMutation.isPending}
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
                    <tfoot className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          Total
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                          {formatCurrency(totalBruto)}
                        </td>
                        <td className="px-4 py-3"></td>
                        {isAdministrator && <td className="px-4 py-3"></td>}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Modal
            isOpen={showBillingFilterModal}
            onClose={() => setShowBillingFilterModal(false)}
            title="Filtros — Faturamento"
            size="md"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Ano</label>
                <StringSingleSelectDropdown
                  value={selectedYear ? String(selectedYear) : '0'}
                  onChange={(v) => setSelectedYear(v === '0' ? 0 : parseInt(v, 10))}
                  options={labeledToSelectOptions([
                    { value: '0', label: 'Todos' },
                    ...[2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => ({
                      value: String(y),
                      label: String(y),
                    })),
                  ])}
                  allowEmpty={false}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Mês</label>
                <StringSingleSelectDropdown
                  value={String(selectedMonth)}
                  onChange={(v) => setSelectedMonth(parseInt(v, 10))}
                  options={MESES_FILTRO_SELECT_OPTIONS}
                  allowEmpty={false}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">OS / SE</label>
                <input
                  type="text"
                  value={filterBillingOsSe}
                  onChange={(e) => setFilterBillingOsSe(e.target.value)}
                  placeholder="Filtrar por OS / SE"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Nº Nota Fiscal</label>
                <input
                  type="text"
                  value={filterBillingInvoice}
                  onChange={(e) => setFilterBillingInvoice(e.target.value)}
                  placeholder="Filtrar por nota fiscal"
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
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
