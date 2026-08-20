'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileWarning,
  GitBranch,
  Loader2,
  Map as MapIcon,
  Package,
  RefreshCw,
  ShoppingCart,
  Timer,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { CadastroListEmpty } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';

type StatusCount = { status: string; label: string; count: number };

type RmOcInsights = {
  sla: {
    ocAvgAgeDays: number;
    rmAvgAgeDays: number;
    ocStuckOver7Days: number;
    ocStuckOver14Days: number;
    rmStuckOver7Days: number;
    rmStuckOver14Days: number;
    ocAgeByApprovalStage: Array<{
      status: string;
      label: string;
      count: number;
      avgAgeDays: number;
    }>;
  };
  bottlenecks: Array<{ status: string; label: string; count: number; sharePct: number }>;
  rmByPriority: Array<{ priority: string; label: string; count: number; sharePct: number }>;
  finance: {
    openAmount: number;
    totalAmount: number;
    openSharePct: number;
    byStatus: Array<{ status: string; label: string; count: number; amount: number }>;
    topSuppliers: Array<{ supplierId: string; name: string; count: number; amount: number }>;
  };
  demandByCostCenter: Array<{ id: string; name: string; count: number; sharePct: number }>;
  demandByServiceOrder: Array<{ name: string; count: number; sharePct: number }>;
  rmToOc: {
    totalRms: number;
    withOc: number;
    withoutOc: number;
    conversionPct: number;
    approvedWithoutOc: number;
  };
  postApproval: Array<{ status: string; label: string; count: number }>;
  overdueDeliveries: number;
  inReview: { oc: number; rm: number; total: number };
  leadTime: {
    rmToOcApprovedDays: number;
    rmToOcApprovedSample: number;
    ocApprovedToClosedDays: number;
    ocApprovedToClosedSample: number;
  };
  trends: {
    days7: {
      ocCreated: number;
      ocApproved: number;
      ocClosed: number;
      rmCreated: number;
      rmApproved: number;
      rmClosed: number;
    };
    days30: {
      ocCreated: number;
      ocApproved: number;
      ocClosed: number;
      rmCreated: number;
      rmApproved: number;
      rmClosed: number;
    };
    daily: Array<{
      date: string;
      label: string;
      ocCreated: number;
      rmCreated: number;
      ocClosed: number;
      rmClosed: number;
    }>;
  };
};

type OverviewSlice = {
  generatedAt: string;
  kpis: {
    openPurchaseOrders: number;
    openMaterialRequests: number;
    quoteMapsWithoutOc: number;
  };
  purchaseOrdersByStatus: StatusCount[];
  materialRequestsByStatus: StatusCount[];
  quoteMapsBreakdown: StatusCount[];
  rmOcInsights?: RmOcInsights;
};

const ROUTES = {
  purchaseOrders: '/ponto/ordem-de-compra',
  materialRequests: '/ponto/gerenciar-materiais',
  quoteMaps: '/ponto/mapa-cotacao',
} as const;

const OC_CLOSED = new Set(['FINALIZED', 'RECEIVED', 'REJECTED', 'CANCELLED']);
const RM_CLOSED = new Set(['FULFILLED', 'REJECTED', 'CANCELLED']);

const OC_PIPELINE: Array<{ status: string; short: string }> = [
  { status: 'PENDING_COMPRAS', short: 'Compras' },
  { status: 'PENDING', short: 'Gestor' },
  { status: 'PENDING_DIRETORIA', short: 'Diretoria' },
  { status: 'IN_REVIEW', short: 'Correção' },
  { status: 'APPROVED', short: 'Aprovada' },
  { status: 'PENDING_NF_ATTACHMENT', short: 'NF' },
  { status: 'SENT', short: 'Enviada' },
  { status: 'PARTIALLY_RECEIVED', short: 'Parcial' },
];

const RM_PIPELINE: Array<{ status: string; short: string }> = [
  { status: 'PENDING', short: 'Pendente' },
  { status: 'IN_REVIEW', short: 'Correção' },
  { status: 'APPROVED', short: 'Aprovada' },
  { status: 'PARTIALLY_FULFILLED', short: 'Parcial' },
];

const CHART_PALETTE = [
  '#b91c1c',
  '#0f766e',
  '#1e40af',
  '#c2410c',
  '#0891b2',
  '#a16207',
  '#be185d',
  '#334155',
];

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: '#b91c1c',
  HIGH: '#c2410c',
  MEDIUM: '#a16207',
  LOW: '#0f766e',
};

function sumCounts(rows: StatusCount[]) {
  return rows.reduce((s, r) => s + r.count, 0);
}

function countByStatus(rows: StatusCount[], statuses: Set<string>) {
  return rows.filter((r) => statuses.has(r.status)).reduce((s, r) => s + r.count, 0);
}

function statusMap(rows: StatusCount[]) {
  return new Map(rows.map((r) => [r.status, r]));
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

function formatDays(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}d`;
}

function useChartTheme() {
  const { isDark } = useTheme();
  return {
    chartTick: isDark ? '#9ca3af' : '#6b7280',
    chartGrid: isDark ? '#374151' : '#e5e7eb',
    pieStroke: isDark ? '#1f2937' : '#ffffff',
    tipStyle: {
      background: isDark ? 'rgba(31,41,55,0.96)' : 'rgba(255,255,255,0.96)',
      border: `1px solid ${isDark ? '#4b5563' : '#e5e7eb'}`,
      borderRadius: 10,
      color: isDark ? '#f3f4f6' : '#111827',
      fontSize: 12,
    } as React.CSSProperties,
  };
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
  href,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  href?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className={cadastroListClasses.cardHeaderIconRow}>
        <div className="shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
          <Icon className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">{title}</h2>
          {subtitle ? <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
        </div>
      </div>
      {href ? (
        <Link
          href={href}
          aria-label={`Abrir ${title}`}
          title={`Abrir ${title}`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

function SectionBanner({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-gray-200 pb-2 dark:border-gray-700">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">
        {title}
      </h3>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
    </div>
  );
}

function HorizontalBars({
  rows,
  valueKey = 'count',
  formatValue,
}: {
  rows: Array<{ key: string; label: string; value: number; color?: string; meta?: string }>;
  valueKey?: string;
  formatValue?: (n: number) => string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const fmt = formatValue ?? ((n: number) => String(n));
  void valueKey;
  return (
    <div className="space-y-3">
      {rows.map((row, i) => {
        const widthPct = Math.min(100, Math.max(4, Math.round((row.value / max) * 100)));
        const color = row.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
        return (
          <div key={row.key} className="min-w-0 space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span
                className="min-w-0 truncate text-sm font-medium text-gray-800 dark:text-gray-100"
                title={row.label}
              >
                {row.label}
              </span>
              <div className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {fmt(row.value)}
                </span>
                {row.meta ? (
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">{row.meta}</span>
                ) : null}
              </div>
            </div>
            <div className="h-3.5 w-full min-w-0 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full max-w-full rounded-md transition-all duration-700 ease-out"
                style={{ width: `${widthPct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DonutCard({
  title,
  subtitle,
  href,
  icon,
  data,
  emptyHint,
}: {
  title: string;
  subtitle: string;
  href?: string;
  icon: LucideIcon;
  data: StatusCount[];
  emptyHint: string;
}) {
  const theme = useChartTheme();
  const total = sumCounts(data);
  const chartData = data
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((d, i) => ({
      ...d,
      color: CHART_PALETTE[i % CHART_PALETTE.length],
    }));

  return (
    <Card className={`${cadastroListClasses.card} flex h-full min-h-0 flex-col`}>
      <CardHeader className={cadastroListClasses.cardHeader}>
        <SectionTitle icon={icon} title={title} subtitle={subtitle} href={href} />
      </CardHeader>
      <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col`}>
        {total === 0 ? (
          <CadastroListEmpty icon={icon} title="Sem dados" hint={emptyHint} />
        ) : (
          <div className="flex flex-col items-stretch gap-5 sm:flex-row sm:items-center">
            <div className="relative mx-auto h-[200px] w-[200px] shrink-0 sm:mx-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={38}
                    outerRadius={90}
                    paddingAngle={1.5}
                    stroke={theme.pieStroke}
                    strokeWidth={3}
                    cornerRadius={3}
                    isAnimationActive
                    animationDuration={650}
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.status} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={theme.tipStyle}
                    formatter={(value: number, name: string) => [`${value}`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="text-[1.75rem] font-bold leading-none tabular-nums text-gray-900 dark:text-gray-100">
                  {total}
                </span>
              </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-2.5">
              {chartData.slice(0, 7).map((item) => {
                const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                return (
                  <li key={item.status} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-gray-100">
                        {item.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                        {pct}%
                      </span>
                      <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-gray-800 dark:text-gray-100">
                        {item.count}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: item.color }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PipelineCard({
  title,
  subtitle,
  href,
  icon,
  stages,
  byStatus,
}: {
  title: string;
  subtitle: string;
  href: string;
  icon: LucideIcon;
  stages: Array<{ status: string; short: string }>;
  byStatus: Map<string, StatusCount>;
}) {
  const rows = stages
    .map((stage, index) => {
      const row = byStatus.get(stage.status);
      return {
        key: stage.status,
        label: row?.label ?? stage.short,
        count: row?.count ?? 0,
        color: CHART_PALETTE[index % CHART_PALETTE.length],
      };
    })
    .filter((row) => row.count > 0);

  const max = Math.max(...rows.map((r) => r.count), 1);
  const activeTotal = rows.reduce((s, r) => s + r.count, 0);

  return (
    <Card className={`${cadastroListClasses.card} flex h-full min-h-0 flex-col`}>
      <CardHeader className={cadastroListClasses.cardHeader}>
        <SectionTitle icon={icon} title={title} subtitle={subtitle} href={href} />
      </CardHeader>
      <CardContent className={cadastroListClasses.cardContent}>
        {activeTotal === 0 ? (
          <CadastroListEmpty icon={icon} title="Fila zerada" hint="Nenhum item nestas etapas agora." />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const width = Math.max(8, Math.round((row.count / max) * 100));
              const share = Math.round((row.count / activeTotal) * 100);
              return (
                <div
                  key={row.key}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)_auto] items-center gap-3"
                >
                  <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                    {row.label}
                  </span>
                  <div className="h-3.5 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-full rounded-md transition-all duration-700 ease-out"
                      style={{ width: `${width}%`, backgroundColor: row.color }}
                    />
                  </div>
                  <div className="flex w-[4.25rem] shrink-0 items-baseline justify-end gap-1.5 tabular-nums">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {row.count}
                    </span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">{share}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RmOcDashboard() {
  const theme = useChartTheme();
  const router = useRouter();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-overview', 'rm-oc-v3'],
    queryFn: async () => {
      const res = await api.get('/dashboard/overview');
      return res.data?.data as OverviewSlice;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const metrics = useMemo(() => {
    if (!data) return null;
    const ocRows = data.purchaseOrdersByStatus ?? [];
    const rmRows = data.materialRequestsByStatus ?? [];
    const quoteRows = data.quoteMapsBreakdown ?? [];
    const insights = data.rmOcInsights;

    const ocTotal = sumCounts(ocRows);
    const rmTotal = sumCounts(rmRows);
    const ocClosed = countByStatus(ocRows, OC_CLOSED);
    const rmClosed = countByStatus(rmRows, RM_CLOSED);
    const ocOpen = data.kpis.openPurchaseOrders;
    const rmOpen = data.kpis.openMaterialRequests;
    const ocCompletion = ocTotal > 0 ? Math.round((ocClosed / ocTotal) * 100) : 0;
    const rmCompletion = rmTotal > 0 ? Math.round((rmClosed / rmTotal) * 100) : 0;
    const quoteWithout = quoteRows.find((r) => r.status === 'WITHOUT_OC')?.count ?? 0;
    const quoteWith = quoteRows.find((r) => r.status === 'WITH_OC')?.count ?? 0;
    const quoteTotal = quoteWithout + quoteWith;
    const quoteConversion = quoteTotal > 0 ? Math.round((quoteWith / quoteTotal) * 100) : 0;

    return {
      ocTotal,
      rmTotal,
      ocOpen,
      rmOpen,
      ocClosed,
      rmClosed,
      ocCompletion,
      rmCompletion,
      quoteWithout,
      quoteWith,
      quoteConversion,
      ocByStatus: statusMap(ocRows),
      rmByStatus: statusMap(rmRows),
      ocRows,
      rmRows,
      insights,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-red-600 dark:text-red-400" />
      </div>
    );
  }

  if (isError || !data || !metrics) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center dark:border-red-900/50 dark:bg-red-950/30">
        <p className="text-sm text-red-700 dark:text-red-300">
          Não foi possível carregar o painel de RMs e OCs.
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const insights = metrics.insights;
  const trendDaily = (insights?.trends.daily ?? []).slice(-14);
  const postApprovalActive = (insights?.postApproval ?? []).filter((r) => r.count > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs principais */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        <FilterStatCard
          icon={ShoppingCart}
          label="OCs em aberto"
          count={metrics.ocOpen}
          subtitle={`${metrics.ocTotal} no total · ${metrics.ocCompletion}% encerradas`}
          iconBg="bg-blue-100 dark:bg-blue-900/30"
          iconColor="text-blue-600 dark:text-blue-400"
          onClick={() => router.push(ROUTES.purchaseOrders)}
        />
        <FilterStatCard
          icon={Package}
          label="RMs em aberto"
          count={metrics.rmOpen}
          subtitle={`${metrics.rmTotal} no total · ${metrics.rmCompletion}% encerradas`}
          iconBg="bg-teal-100 dark:bg-teal-900/30"
          iconColor="text-teal-600 dark:text-teal-400"
          onClick={() => router.push(ROUTES.materialRequests)}
        />
        <FilterStatCard
          icon={MapIcon}
          label="Cotações sem OC"
          count={metrics.quoteWithout}
          subtitle={`${metrics.quoteConversion}% dos mapas já geraram OC`}
          iconBg="bg-rose-100 dark:bg-rose-900/30"
          iconColor="text-rose-600 dark:text-rose-400"
          onClick={() => router.push(ROUTES.quoteMaps)}
        />
      </div>

      {insights ? (
        <>
          <SectionBanner
            title="Tempo, atraso e ciclo"
            subtitle="Fila parada, entrega atrasada, correção e lead time"
          />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <FilterStatCard
              icon={Timer}
              label="Idade média OCs"
              count={formatDays(insights.sla.ocAvgAgeDays)}
              subtitle={`${insights.sla.ocStuckOver7Days} ≥ 7d · ${insights.sla.ocStuckOver14Days} ≥ 14d`}
              iconBg="bg-orange-100 dark:bg-orange-900/30"
              iconColor="text-orange-600 dark:text-orange-400"
            />
            <FilterStatCard
              icon={Clock3}
              label="Idade média RMs"
              count={formatDays(insights.sla.rmAvgAgeDays)}
              subtitle={`${insights.sla.rmStuckOver7Days} ≥ 7d · ${insights.sla.rmStuckOver14Days} ≥ 14d`}
              iconBg="bg-amber-100 dark:bg-amber-900/30"
              iconColor="text-amber-600 dark:text-amber-400"
            />
            <FilterStatCard
              icon={AlertTriangle}
              label="OCs paradas ≥ 14d"
              count={insights.sla.ocStuckOver14Days}
              subtitle="Em aberto há duas semanas ou mais"
              iconBg="bg-rose-100 dark:bg-rose-900/30"
              iconColor="text-rose-600 dark:text-rose-400"
              onClick={() => router.push(ROUTES.purchaseOrders)}
            />
            <FilterStatCard
              icon={AlertTriangle}
              label="RMs paradas ≥ 14d"
              count={insights.sla.rmStuckOver14Days}
              subtitle="Em aberto há duas semanas ou mais"
              iconBg="bg-rose-100 dark:bg-rose-900/30"
              iconColor="text-rose-600 dark:text-rose-400"
              onClick={() => router.push(ROUTES.materialRequests)}
            />
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <FilterStatCard
              icon={FileWarning}
              label="Entrega atrasada"
              count={insights.overdueDeliveries}
              subtitle="OCs abertas com prazo de entrega vencido"
              iconBg="bg-red-100 dark:bg-red-900/30"
              iconColor="text-red-600 dark:text-red-400"
              onClick={() => router.push(ROUTES.purchaseOrders)}
            />
            <FilterStatCard
              icon={RefreshCw}
              label="Em correção"
              count={insights.inReview.total}
              subtitle={`OC ${insights.inReview.oc} · RM ${insights.inReview.rm}`}
              iconBg="bg-orange-100 dark:bg-orange-900/30"
              iconColor="text-orange-600 dark:text-orange-400"
            />
            <FilterStatCard
              icon={GitBranch}
              label="Lead time RM → OC"
              count={formatDays(insights.leadTime.rmToOcApprovedDays)}
              subtitle={
                insights.leadTime.rmToOcApprovedSample > 0
                  ? `Média até OC aprovada · n=${insights.leadTime.rmToOcApprovedSample}`
                  : 'Sem amostra nos últimos 30 dias'
              }
              iconBg="bg-teal-100 dark:bg-teal-900/30"
              iconColor="text-teal-600 dark:text-teal-400"
            />
            <FilterStatCard
              icon={CheckCircle2}
              label="Lead time OC → fim"
              count={formatDays(insights.leadTime.ocApprovedToClosedDays)}
              subtitle={
                insights.leadTime.ocApprovedToClosedSample > 0
                  ? `Aprovada até finalizada · n=${insights.leadTime.ocApprovedToClosedSample}`
                  : 'Sem amostra nos últimos 30 dias'
              }
              iconBg="bg-sky-100 dark:bg-sky-900/30"
              iconColor="text-sky-600 dark:text-sky-400"
            />
          </div>
        </>
      ) : null}

      <SectionBanner title="Funis e distribuição" subtitle="Fluxo ativo e status geral de OCs e RMs" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PipelineCard
          title="Funil de OCs em andamento"
          subtitle="Etapas ativas do fluxo de compra"
          href={ROUTES.purchaseOrders}
          icon={ShoppingCart}
          stages={OC_PIPELINE}
          byStatus={metrics.ocByStatus}
        />
        <PipelineCard
          title="Funil de RMs em andamento"
          subtitle="Da solicitação até o atendimento parcial"
          href={ROUTES.materialRequests}
          icon={Package}
          stages={RM_PIPELINE}
          byStatus={metrics.rmByStatus}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DonutCard
          title="Ordens de compra"
          subtitle="Distribuição por status"
          href={ROUTES.purchaseOrders}
          icon={ShoppingCart}
          data={metrics.ocRows}
          emptyHint="Nenhuma OC cadastrada."
        />
        <DonutCard
          title="Requisições de materiais"
          subtitle="Distribuição por status"
          href={ROUTES.materialRequests}
          icon={Package}
          data={metrics.rmRows}
          emptyHint="Nenhuma RM cadastrada."
        />
      </div>

      {insights ? (
        <>
          <SectionBanner
            title="Prioridade, conversão e pós-aprovação"
            subtitle="Pressão por prioridade, RM→OC e etapas depois da aprovação"
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className={cadastroListClasses.card}>
              <CardHeader className={cadastroListClasses.cardHeader}>
                <SectionTitle
                  icon={AlertTriangle}
                  title="Prioridade das RMs"
                  subtitle="Urgente → baixa"
                  href={ROUTES.materialRequests}
                />
              </CardHeader>
              <CardContent className={cadastroListClasses.cardContent}>
                <div className="flex flex-col items-center gap-4 sm:flex-row">
                  <div className="relative h-[160px] w-[160px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={insights.rmByPriority.filter((r) => r.count > 0)}
                          dataKey="count"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          innerRadius={34}
                          outerRadius={72}
                          paddingAngle={1.5}
                          stroke={theme.pieStroke}
                          strokeWidth={3}
                        >
                          {insights.rmByPriority
                            .filter((r) => r.count > 0)
                            .map((entry) => (
                              <Cell
                                key={entry.priority}
                                fill={PRIORITY_COLORS[entry.priority] ?? '#64748b'}
                              />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={theme.tipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                        {insights.rmByPriority.reduce((s, r) => s + r.count, 0)}
                      </span>
                    </div>
                  </div>
                  <ul className="min-w-0 flex-1 space-y-2">
                    {insights.rmByPriority.map((item) => (
                      <li key={item.priority} className="flex items-center gap-2 text-xs">
                        <span
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: PRIORITY_COLORS[item.priority] }}
                        />
                        <span className="flex-1 font-medium text-gray-800 dark:text-gray-100">
                          {item.label}
                        </span>
                        <span className="tabular-nums text-gray-500">{item.sharePct}%</span>
                        <span className="w-6 text-right font-semibold tabular-nums">{item.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card className={cadastroListClasses.card}>
              <CardHeader className={cadastroListClasses.cardHeader}>
                <SectionTitle
                  icon={GitBranch}
                  title="RM → OC"
                  subtitle="Conversão de requisição em compra"
                  href={ROUTES.materialRequests}
                />
              </CardHeader>
              <CardContent className={`${cadastroListClasses.cardContent} space-y-4`}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/50">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Conversão</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-300">
                      {insights.rmToOc.conversionPct}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/50">
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Aprovadas s/ OC</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-rose-700 dark:text-rose-300">
                      {insights.rmToOc.approvedWithoutOc}
                    </p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Com OC</span>
                    <span className="font-semibold tabular-nums">
                      {insights.rmToOc.withOc}{' '}
                      <span className="text-xs font-normal text-gray-500">
                        (
                        {insights.rmToOc.totalRms > 0
                          ? Math.round((insights.rmToOc.withOc / insights.rmToOc.totalRms) * 100)
                          : 0}
                        %)
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-300">Sem OC</span>
                    <span className="font-semibold tabular-nums">
                      {insights.rmToOc.withoutOc}{' '}
                      <span className="text-xs font-normal text-gray-500">
                        (
                        {insights.rmToOc.totalRms > 0
                          ? Math.round((insights.rmToOc.withoutOc / insights.rmToOc.totalRms) * 100)
                          : 0}
                        %)
                      </span>
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-full rounded-full bg-teal-600 dark:bg-teal-500"
                      style={{ width: `${insights.rmToOc.conversionPct}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={cadastroListClasses.card}>
              <CardHeader className={cadastroListClasses.cardHeader}>
                <SectionTitle
                  icon={CheckCircle2}
                  title="Pós-aprovação"
                  subtitle="NF, comprovante e recebimento"
                  href={ROUTES.purchaseOrders}
                />
              </CardHeader>
              <CardContent className={cadastroListClasses.cardContent}>
                {postApprovalActive.length === 0 ? (
                  <CadastroListEmpty
                    icon={CheckCircle2}
                    title="Sem OCs pós-aprovação"
                    hint="Quando houver, as etapas aparecem aqui."
                  />
                ) : (
                  <HorizontalBars
                    rows={postApprovalActive.map((r, i) => ({
                      key: r.status,
                      label: r.label,
                      value: r.count,
                      color: CHART_PALETTE[i % CHART_PALETTE.length],
                    }))}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <SectionBanner
            title="Financeiro e demanda"
            subtitle="Valor em aberto, fornecedores e concentração por ordem de serviço"
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className={cadastroListClasses.card}>
              <CardHeader className={cadastroListClasses.cardHeader}>
                <SectionTitle
                  icon={Wallet}
                  title="Valor por status (OCs)"
                  subtitle={`Aberto ${formatCurrency(insights.finance.openAmount)} · Total ${formatCurrency(insights.finance.totalAmount)}`}
                  href={ROUTES.purchaseOrders}
                />
              </CardHeader>
              <CardContent className={cadastroListClasses.cardContent}>
                {insights.finance.byStatus.length === 0 ? (
                  <CadastroListEmpty icon={Wallet} title="Sem valores" hint="OCs sem amountToPay." />
                ) : (
                  <HorizontalBars
                    rows={insights.finance.byStatus.slice(0, 8).map((r, i) => ({
                      key: r.status,
                      label: r.label,
                      value: r.amount,
                      color: CHART_PALETTE[i % CHART_PALETTE.length],
                      meta: `${r.count}`,
                    }))}
                    formatValue={formatCurrency}
                  />
                )}
              </CardContent>
            </Card>

            <Card className={cadastroListClasses.card}>
              <CardHeader className={cadastroListClasses.cardHeader}>
                <SectionTitle
                  icon={Building2}
                  title="Top fornecedores (OCs abertas)"
                  subtitle="Por valor em aberto"
                  href={ROUTES.purchaseOrders}
                />
              </CardHeader>
              <CardContent className={cadastroListClasses.cardContent}>
                {insights.finance.topSuppliers.length === 0 ? (
                  <CadastroListEmpty
                    icon={Building2}
                    title="Sem fornecedores"
                    hint="Nenhuma OC aberta com fornecedor."
                  />
                ) : (
                  <HorizontalBars
                    rows={insights.finance.topSuppliers.map((r, i) => ({
                      key: r.supplierId,
                      label: r.name,
                      value: r.amount,
                      color: CHART_PALETTE[i % CHART_PALETTE.length],
                      meta: `${r.count} OC`,
                    }))}
                    formatValue={formatCurrency}
                  />
                )}
              </CardContent>
            </Card>

            <Card className={cadastroListClasses.card}>
              <CardHeader className={cadastroListClasses.cardHeader}>
                <SectionTitle
                  icon={Package}
                  title="Demanda por ordem de serviço"
                  subtitle="RMs em aberto com OS informada"
                  href={ROUTES.materialRequests}
                />
              </CardHeader>
              <CardContent className={cadastroListClasses.cardContent}>
                {insights.demandByServiceOrder.length === 0 ? (
                  <CadastroListEmpty
                    icon={Package}
                    title="Sem ordens de serviço"
                    hint="Nenhuma RM aberta com OS informada."
                  />
                ) : (
                  <HorizontalBars
                    rows={insights.demandByServiceOrder.map((r, i) => ({
                      key: r.name,
                      label: r.name,
                      value: r.count,
                      color: CHART_PALETTE[i % CHART_PALETTE.length],
                      meta: `${r.sharePct}%`,
                    }))}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <SectionBanner
            title="Tendência"
            subtitle="Criadas, aprovadas e encerradas — últimos 7 dias e série diária"
          />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <FilterStatCard
              icon={ShoppingCart}
              label="OCs (7 dias)"
              count={insights.trends.days7.ocCreated}
              subtitle={`Aprov. ${insights.trends.days7.ocApproved} · Enc. ${insights.trends.days7.ocClosed}`}
              iconBg="bg-blue-100 dark:bg-blue-900/30"
              iconColor="text-blue-600 dark:text-blue-400"
            />
            <FilterStatCard
              icon={Package}
              label="RMs (7 dias)"
              count={insights.trends.days7.rmCreated}
              subtitle={`Aprov. ${insights.trends.days7.rmApproved} · Enc. ${insights.trends.days7.rmClosed}`}
              iconBg="bg-teal-100 dark:bg-teal-900/30"
              iconColor="text-teal-600 dark:text-teal-400"
            />
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <SectionTitle
                icon={TrendingUp}
                title="Criadas × encerradas (14 dias)"
                subtitle="Série diária de OCs e RMs"
              />
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendDaily} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: theme.chartTick, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: theme.chartTick, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                    />
                    <Tooltip contentStyle={theme.tipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="ocCreated"
                      name="OC criadas"
                      stroke="#1e40af"
                      fill="#1e40af"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="rmCreated"
                      name="RM criadas"
                      stroke="#0f766e"
                      fill="#0f766e"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="ocClosed"
                      name="OC encerradas"
                      stroke="#c2410c"
                      fill="#c2410c"
                      fillOpacity={0.08}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="rmClosed"
                      name="RM encerradas"
                      stroke="#a16207"
                      fill="#a16207"
                      fillOpacity={0.08}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
