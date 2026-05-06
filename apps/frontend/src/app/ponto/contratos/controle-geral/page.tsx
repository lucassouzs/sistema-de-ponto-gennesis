'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  LayoutDashboard,
  BarChart3,
  Search,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';

interface ContractOverview {
  id: string;
  name: string;
  number: string;
  startDate: string;
  endDate: string;
  costCenter?: { id: string; code: string; name: string };
  valuePlusAddenda: number;
  qtdProducoesSemanais?: number;
  /** Valor bruto (NFs), todos os anos */
  faturamentoAcumulado: number;
  /** Valor bruto no ano do filtro (0 se filtro "Todos") */
  faturamentoAnual: number;
  /** Se false, a coluna anual deve exibir "—" */
  faturamentoAnualAplica?: boolean;
  totalProducaoSemanal: number;
  valorOrcado: number;
  pendenteFaturamento: number;
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export default function ControleGeralContratosPage() {
  const router = useRouter();
  const [selectedYear, setSelectedYear] = useState<number | ''>(() => new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  const { data: overviewData, isLoading: loadingOverview } = useQuery({
    queryKey: ['contracts-overview', selectedYear],
    queryFn: async () => {
      const res = await api.get('/contracts/overview', {
        params: selectedYear ? { year: selectedYear } : {}
      });
      return res.data;
    }
  });

  const rawList = (overviewData?.data ?? []) as ContractOverview[];
  const filterYear = overviewData?.filterYear ?? null;

  const filteredContracts = useMemo(() => {
    if (!searchTerm.trim()) return rawList;
    const term = searchTerm.toLowerCase().trim();
    return rawList.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.number.toLowerCase().includes(term) ||
        (c.costCenter?.name ?? '').toLowerCase().includes(term) ||
        (c.costCenter?.code ?? '').toLowerCase().includes(term)
    );
  }, [rawList, searchTerm]);

  const totals = useMemo(() => {
    return filteredContracts.reduce(
      (acc, c) => ({
        faturamentoAcumulado: acc.faturamentoAcumulado + c.faturamentoAcumulado,
        faturamentoAnual: acc.faturamentoAnual + c.faturamentoAnual,
        totalProducaoSemanal: acc.totalProducaoSemanal + c.totalProducaoSemanal,
        valorOrcado: acc.valorOrcado + c.valorOrcado,
        pendenteFaturamento: acc.pendenteFaturamento + c.pendenteFaturamento
      }),
      {
        faturamentoAcumulado: 0,
        faturamentoAnual: 0,
        totalProducaoSemanal: 0,
        valorOrcado: 0,
        pendenteFaturamento: 0
      }
    );
  }, [filteredContracts]);


  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const availableYears = ((overviewData?.availableYears as number[] | undefined) || []).filter((y) =>
    Number.isFinite(y)
  );

  // Ordem fixa solicitada para este módulo:
  // CONTRATO, CENTRO DE CUSTO, FATURAMENTO ACUMULADO, FATURAMENTO ANUAL, PRODUÇÃO, VALOR ORÇADO, PENDENTE FATURAMENTO.

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/contratos">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/contratos">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div ref={containerRef} className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link
                href="/ponto/contratos"
                className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4 text-sm font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar para contratos
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <LayoutDashboard className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    Controle Geral de Contratos
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Visão consolidada de todos os contratos
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Ano</label>
                <select
                  value={selectedYear}
                  onChange={(e) =>
                    setSelectedYear(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                  }
                  className="h-10 min-w-[7rem] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todos</option>
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="relative flex-1 sm:flex-initial sm:min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar contrato..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-medium">Faturamento acumulado</span>: soma do valor bruto (NFs) em todos os anos.
            {filterYear != null ? (
              <>
                {' '}
                <span className="font-medium">Faturamento anual</span>: NFs com emissão em {filterYear}. Produção
                semanal: ano {filterYear}.
              </>
            ) : (
              <> Faturamento anual: selecione um ano no filtro. Produção semanal: todos os períodos.</>
            )}
          </p>

          {loadingOverview ? (
            <Card>
              <CardContent className="py-16">
                <Loading message="Carregando controle geral..." size="lg" />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {filteredContracts.length}{' '}
                    {filteredContracts.length === 1 ? 'contrato' : 'contratos'}
                  </h3>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[200px]">
                          Contrato
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Centro de Custo
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
                          Faturamento acumulado
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
                          Faturamento anual
                          {filterYear != null ? (
                            <span className="block font-normal normal-case text-[10px] text-gray-400 mt-0.5">
                              ({filterYear})
                            </span>
                          ) : null}
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Produção
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
                          Valor orçado
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
                          Pendente faturamento
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-16">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredContracts.map((c) => (
                        <tr
                          key={c.id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">
                                {c.name}
                              </p>
                              <p className="text-xs font-mono text-gray-500 dark:text-gray-400">
                                nº {c.number}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {c.costCenter?.name || c.costCenter?.code || '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-green-600 dark:text-green-400">
                            {formatCurrency(c.faturamentoAcumulado)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-emerald-500/90 dark:text-emerald-400/90">
                            {c.faturamentoAnualAplica === false ? (
                              <span className="text-gray-400 dark:text-gray-500">—</span>
                            ) : (
                              formatCurrency(c.faturamentoAnual)
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                              <BarChart3 className="w-4 h-4 text-amber-500" />
                              {formatCurrency(c.totalProducaoSemanal)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(c.valorOrcado)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-amber-700 dark:text-amber-400">
                            {formatCurrency(c.pendenteFaturamento)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/ponto/contratos/${c.id}`}
                              className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-4 h-4" />
                              Ver
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <tr className="font-semibold">
                        <td
                          colSpan={2}
                          className="px-4 py-3 text-gray-900 dark:text-gray-100"
                        >
                          Total ({filteredContracts.length}{' '}
                          {filteredContracts.length === 1 ? 'contrato' : 'contratos'})
                        </td>
                        <td className="px-4 py-3 text-right text-green-600 dark:text-green-400">
                          {formatCurrency(totals.faturamentoAcumulado)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-500/90 dark:text-emerald-400/90">
                          {filterYear == null ? (
                            <span className="text-gray-400 dark:text-gray-500">—</span>
                          ) : (
                            formatCurrency(totals.faturamentoAnual)
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-900 dark:text-gray-100">
                          {formatCurrency(totals.totalProducaoSemanal)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                          {formatCurrency(totals.valorOrcado)}
                        </td>
                        <td className="px-4 py-3 text-right text-amber-700 dark:text-amber-400">
                          {formatCurrency(totals.pendenteFaturamento)}
                        </td>
                        <td className="px-4 py-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {filteredContracts.length === 0 && (
                  <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>
                      {searchTerm
                        ? 'Nenhum contrato encontrado para a busca.'
                        : 'Nenhum contrato cadastrado.'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
