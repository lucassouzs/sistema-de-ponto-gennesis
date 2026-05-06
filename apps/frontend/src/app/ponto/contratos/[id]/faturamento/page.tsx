'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Receipt, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { formatOsSePastaOrDash, folderForDivSe } from '@/lib/formatOsSePasta';
import { useContractTableColumnCustomizer } from '@/components/useContractTableColumnCustomizer';
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/usePermissions';

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
      if (selectedMonth === 0) return true;
      return d.getMonth() + 1 === selectedMonth;
    });
  }, [billings, isAllYears, selectedYear, selectedMonth]);

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
                  <div className="flex flex-nowrap items-center gap-4 mt-3 overflow-x-auto pb-1">
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Ano:</label>
                      <select
                        value={selectedYear || ''}
                        onChange={(e) => setSelectedYear(e.target.value ? parseInt(e.target.value, 10) : 0)}
                        className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-[120px]"
                      >
                        <option value="0">Todos</option>
                        {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Mês:</label>
                      <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                        className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-[160px]"
                      >
                        {MESES_FILTRO.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
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
                    Nenhum faturamento no período selecionado.
                  </p>
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
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDateTime(b.createdAt || '')}</td>
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
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
