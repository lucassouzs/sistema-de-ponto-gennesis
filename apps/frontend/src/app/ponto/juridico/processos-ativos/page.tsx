'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, Search } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListSummary,
} from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { ListPagination } from '@/components/ui/ListPagination';
import api from '@/lib/api';
import {
  formatCurrencyBRL,
  processosAtivos,
  type ProcessoAtivo,
} from '@/data/juridico-processos-ativos';

const ITEMS_PER_PAGE = 20;

const COLUMNS: { key: keyof ProcessoAtivo; label: string; currency?: boolean }[] = [
  { key: 'reclamante', label: 'Reclamante' },
  { key: 'numeroProcesso', label: 'Nº Processo' },
  { key: 'tribunal', label: 'Tribunal' },
  { key: 'vara', label: 'Vara' },
  { key: 'mes', label: 'Mês' },
  { key: 'dataAudiencia', label: 'Data Audiência' },
  { key: 'horario', label: 'Horário' },
  { key: 'presencial', label: 'Presencial' },
  { key: 'statusProcesso', label: 'Status Processo' },
  { key: 'decisaoStf', label: 'Decisão do STF' },
  { key: 'objeto', label: 'Objeto' },
  { key: 'valorCausa', label: 'Valor da Causa', currency: true },
  { key: 'polo', label: 'Polo' },
  { key: 'funcao', label: 'Função' },
  { key: 'representanteAutor', label: 'Representante do Autor' },
  { key: 'empresa', label: 'Empresa' },
  { key: 'contrato', label: 'Contrato' },
  { key: 'periodo', label: 'Período' },
  { key: 'valorAcordo', label: 'Valor do Acordo', currency: true },
  { key: 'valorSentenca', label: 'Valor Sentença', currency: true },
  { key: 'valorCustas', label: 'Valor Custas', currency: true },
  { key: 'valorRO', label: 'Valor de RO', currency: true },
  { key: 'valorRR', label: 'Valor de RR', currency: true },
  { key: 'valorAgravo', label: 'Valor de Agravo', currency: true },
  { key: 'execucaoProvisoria', label: 'Execução Provisória' },
  { key: 'embargosExecucao', label: 'Embargos de Execução' },
  { key: 'regimeContratacao', label: 'Regime de Contratação' },
];

function cellValue(row: ProcessoAtivo, key: keyof ProcessoAtivo, currency?: boolean) {
  const value = row[key];
  if (currency && typeof value === 'number') return formatCurrencyBRL(value);
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export default function ProcessosAtivosPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return processosAtivos;
    return processosAtivos.filter((row) => {
      const haystack = [
        row.reclamante,
        row.numeroProcesso,
        row.tribunal,
        row.vara,
        row.statusProcesso,
        row.objeto,
        row.polo,
        row.empresa,
        row.contrato,
        row.funcao,
        row.representanteAutor,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [searchTerm]);

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedRows = filtered.slice(startIndex, endIndex);
  const startItem = totalFiltered === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(endIndex, totalFiltered);
  const isListEmpty = totalFiltered === 0;

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/juridico/processos-ativos">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Processos Ativos
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Acompanhe os processos jurídicos em andamento e seus principais dados.
            </p>
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <Briefcase className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Processos Ativos
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Lista completa com status, audiências e valores
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className={cadastroListClasses.searchField}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="Buscar por reclamante, processo, empresa…"
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isListEmpty ? (
                <CadastroListEmpty
                  icon={Briefcase}
                  title="Nenhum processo ativo encontrado"
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Não há processos ativos cadastrados no momento'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={startItem}
                    endItem={endItem}
                    total={totalFiltered}
                    itemLabel="processo"
                    itemLabelPlural="processos"
                    currentPage={currentPage}
                    totalPages={totalPages}
                  />
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={`${cadastroListClasses.table} min-w-[96rem]`}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          {COLUMNS.map((col) => (
                            <th
                              key={col.key}
                              className={`${
                                col.currency
                                  ? cadastroListClasses.thNumeric
                                  : cadastroListClasses.th
                              } whitespace-nowrap`}
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {paginatedRows.map((row) => (
                          <tr
                            key={row.id}
                            className="transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/50"
                          >
                            {COLUMNS.map((col) => (
                              <td
                                key={col.key}
                                className={`${
                                  col.currency
                                    ? cadastroListClasses.tdNumeric
                                    : cadastroListClasses.td
                                } max-w-[240px] truncate whitespace-nowrap`}
                                title={cellValue(row, col.key, col.currency)}
                              >
                                {cellValue(row, col.key, col.currency)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <ListPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
