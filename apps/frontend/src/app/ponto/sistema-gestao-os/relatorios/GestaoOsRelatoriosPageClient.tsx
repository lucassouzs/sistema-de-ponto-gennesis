'use client';

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Clock3,
  FolderKanban,
  Timer,
  Users,
  Wrench
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import {
  CadastroListEmpty,
  CadastroListLoading
} from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import api from '@/lib/api';
import { GestaoOsReportsSummary, STATUS_LABELS, type GestaoOsStatus } from '../gestaoOsTypes';
import { useGestaoOsCompany } from '../useGestaoOsCompany';

type GestaoOsWorkloadRow = {
  assigneeId: string;
  name: string;
  email: string | null;
  openCount: number;
  overdueCount: number;
  warningCount: number;
  openHours?: number;
};

type DistRow = { key: string; label: string; count: number };

const PHASE_ORDER: GestaoOsStatus[] = [
  'OPEN',
  'UNDER_REVIEW',
  'APPROVED',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'COMPLETED',
  'REWORK',
  'CLOSED',
  'CANCELLED'
];

function DistributionCard({
  title,
  icon: Icon,
  rows,
  emptyTitle
}: {
  title: string;
  icon: LucideIcon;
  rows: DistRow[];
  emptyTitle: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card className={cadastroListClasses.card}>
      <CardHeader className={cadastroListClasses.cardHeader}>
        <div className={cadastroListClasses.cardHeaderIconRow}>
          <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30">
            <Icon className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {rows.length} {rows.length === 1 ? 'item' : 'itens'}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cadastroListClasses.cardContent}>
        {rows.length === 0 ? (
          <CadastroListEmpty icon={Icon} title={emptyTitle} />
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((row) => (
              <li key={row.key} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                    {row.label}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {row.count}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-red-500/80 dark:bg-red-400/80"
                    style={{ width: `${Math.max(6, (row.count / max) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function GestaoOsRelatoriosPageClient() {
  const router = useRouter();
  const { isLoading: loadingCompany } = useGestaoOsCompany();

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
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const { data, isLoading } = useQuery({
    queryKey: ['gestao-os-reports-summary'],
    enabled: !loadingCompany,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsReportsSummary }>(
        '/gestao-os/reports/summary'
      );
      return res.data?.data;
    }
  });

  const { data: workload = [], isLoading: loadingWorkload } = useQuery({
    queryKey: ['gestao-os-reports-workload'],
    enabled: !loadingCompany,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsWorkloadRow[] }>(
        '/gestao-os/reports/workload'
      );
      return res.data?.data ?? [];
    }
  });

  const phaseRows = useMemo<DistRow[]>(() => {
    if (!data) return [];
    return PHASE_ORDER.map((status) => ({
      key: status,
      label: STATUS_LABELS[status],
      count: data.byStatus[status] ?? 0
    })).filter((row) => row.count > 0);
  }, [data]);

  if (loadingUser || loadingCompany) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/sistema-gestao-os/relatorios">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Relatórios de Chamados
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Indicadores de backlog, atraso, MTTR e distribuição.
            </p>
          </div>

          {isLoading || !data ? (
            <Card className={cadastroListClasses.card}>
              <CardContent className={cadastroListClasses.cardContent}>
                <CadastroListLoading message="Carregando indicadores..." />
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <FilterStatCard
                  label="Em aberto"
                  count={data.openLike}
                  subtitle="Chamados ainda em andamento"
                  icon={FolderKanban}
                  iconBg="bg-red-100 dark:bg-red-900/30"
                  iconColor="text-red-600 dark:text-red-400"
                />
                <FilterStatCard
                  label="Atrasadas"
                  count={data.overdue}
                  subtitle="Prazo de SLA estourado"
                  icon={AlertTriangle}
                  iconBg="bg-rose-100 dark:bg-rose-900/30"
                  iconColor="text-rose-600 dark:text-rose-400"
                />
                <FilterStatCard
                  label="MTTR"
                  count={data.mttrHours != null ? data.mttrHours : '—'}
                  subtitle="Tempo médio de reparo (horas)"
                  icon={Timer}
                  iconBg="bg-sky-100 dark:bg-sky-900/30"
                  iconColor="text-sky-600 dark:text-sky-400"
                />
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <DistributionCard
                  title="Por fase"
                  icon={BarChart3}
                  rows={phaseRows}
                  emptyTitle="Nenhum chamado no período"
                />
                <DistributionCard
                  title="Por categoria"
                  icon={Wrench}
                  rows={data.byCategory.map((r) => ({
                    key: r.category,
                    label: r.category,
                    count: r.count
                  }))}
                  emptyTitle="Nenhuma categoria com chamado"
                />
                <DistributionCard
                  title="Por prédio"
                  icon={Building2}
                  rows={data.byBuilding.map((r) => ({
                    key: r.buildingId || r.name,
                    label: r.name,
                    count: r.count
                  }))}
                  emptyTitle="Nenhum prédio com chamado"
                />
                <DistributionCard
                  title="Por técnico"
                  icon={Users}
                  rows={data.byTechnician.map((r) => ({
                    key: r.assigneeId || r.name,
                    label: r.name,
                    count: r.count
                  }))}
                  emptyTitle="Nenhum técnico atribuído"
                />
              </div>

              <Card className={cadastroListClasses.card}>
                <CardHeader className={cadastroListClasses.cardHeader}>
                  <div className={cadastroListClasses.cardHeaderIconRow}>
                    <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                      <Clock3 className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Carga dos técnicos
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        OS abertas, horas em execução, atrasadas e no prazo em risco
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className={cadastroListClasses.cardContent}>
                  {loadingWorkload ? (
                    <CadastroListLoading message="Carregando carga dos técnicos..." />
                  ) : workload.length === 0 ? (
                    <CadastroListEmpty
                      icon={Users}
                      title="Nenhum técnico com OS aberta"
                      hint="Quando houver chamados atribuídos, a carga aparece aqui."
                    />
                  ) : (
                    <div className={cadastroListClasses.tableScroll}>
                      <table className={`${cadastroListClasses.table} min-w-[36rem]`}>
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className={cadastroListClasses.th}>Técnico</th>
                            <th className={cadastroListClasses.thCenter}>Abertas</th>
                            <th className={cadastroListClasses.thCenter}>Horas</th>
                            <th className={cadastroListClasses.thCenter}>Atrasadas</th>
                            <th className={cadastroListClasses.thCenter}>Em risco</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                          {workload.map((row) => (
                            <tr key={row.assigneeId}>
                              <td className={cadastroListClasses.td}>
                                <span className="block truncate font-medium">{row.name}</span>
                                {row.email ? (
                                  <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                                    {row.email}
                                  </span>
                                ) : null}
                              </td>
                              <td className={cadastroListClasses.tdCenter}>
                                <span className="tabular-nums font-semibold">{row.openCount}</span>
                              </td>
                              <td className={cadastroListClasses.tdCenter}>
                                <span className="tabular-nums font-semibold">
                                  {Number(row.openHours ?? 0)
                                    .toFixed(1)
                                    .replace('.', ',')}
                                  h
                                </span>
                              </td>
                              <td className={cadastroListClasses.tdCenter}>
                                <span
                                  className={`tabular-nums font-semibold ${
                                    row.overdueCount > 0
                                      ? 'text-rose-700 dark:text-rose-300'
                                      : 'text-gray-500 dark:text-gray-400'
                                  }`}
                                >
                                  {row.overdueCount}
                                </span>
                              </td>
                              <td className={cadastroListClasses.tdCenter}>
                                <span
                                  className={`tabular-nums font-semibold ${
                                    row.warningCount > 0
                                      ? 'text-amber-700 dark:text-amber-300'
                                      : 'text-gray-500 dark:text-gray-400'
                                  }`}
                                >
                                  {row.warningCount}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
