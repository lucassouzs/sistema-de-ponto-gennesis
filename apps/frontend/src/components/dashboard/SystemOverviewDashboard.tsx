'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Activity,
  AlertTriangle,
  Car,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Fuel,
  Loader2,
  Map as MapIcon,
  Package,
  Plus,
  Receipt,
  ShoppingCart,
  Trash2,
  TrendingUp,
  Truck,
  Wallet,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { CadastroListEmpty } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';

type StatusCount = { status: string; label: string; count: number };

type OverviewData = {
  generatedAt: string;
  kpis: {
    pendingApprovals: number;
    openPurchaseOrders: number;
    openMaterialRequests: number;
    activeLogistics: number;
    pendingFuel: number;
    contractsExpiringSoon: number;
    financialAwaitingPayment: number;
    financialAwaitingPaymentAmount: number;
    openStockShortfalls: number;
    pendingVehicleReservations: number;
    openToolRentals: number;
    quoteMapsWithoutOc: number;
    espelhoNfWithoutAttachment: number;
    actionsLast7Days: number;
  };
  purchaseOrdersByStatus: StatusCount[];
  materialRequestsByStatus: StatusCount[];
  fuelByStatus: StatusCount[];
  logisticsByStatus: StatusCount[];
  financialByStatus: StatusCount[];
  stockShortfallsByStatus: StatusCount[];
  vehicleReservationsByStatus: StatusCount[];
  toolRentalsByStatus: StatusCount[];
  quoteMapsBreakdown: StatusCount[];
  espelhoNfBreakdown: StatusCount[];
  contractsTimeline: {
    active: number;
    expiring30: number;
    expiring60: number;
    expired: number;
  };
  activityByDay: Array<{
    date: string;
    label: string;
    creates: number;
    deletes: number;
    approves: number;
    rejects: number;
    total: number;
  }>;
  topAuditEntities: Array<{ entity: string; label: string; count: number }>;
  recentActions: Array<{
    id: string;
    action: string;
    entity: string;
    entityLabel: string;
    summary: string | null;
    timelineRef: string | null;
    userName: string | null;
    at: string;
  }>;
};

const ROUTES = {
  approvals: '/ponto/aprovacoes',
  purchaseOrders: '/ponto/ordem-de-compra',
  materialRequests: '/ponto/gerenciar-materiais',
  logistics: '/ponto/entregas-logistica',
  fuel: '/ponto/solicitacoes-combustivel',
  contracts: '/ponto/contratos',
  financial: '/ponto/financeiro/controle-financeiro',
  stockShortfalls: '/ponto/furo-estoque',
  vehicles: '/ponto/solicitacoes-reserva-veiculos',
  tools: '/ponto/solicitacoes-ferramentas',
  quoteMaps: '/ponto/mapa-cotacao',
  espelhoNf: '/ponto/espelho-nf',
} as const;

const CHART_PALETTE = ['#b91c1c', '#0f766e', '#1e40af', '#c2410c', '#7c3aed', '#0891b2', '#a16207', '#be185d'];

function formatCurrencyBrl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function sumCounts(rows: StatusCount[]) {
  return rows.reduce((s, r) => s + r.count, 0);
}

function useChartTheme() {
  const { isDark } = useTheme();
  return {
    isDark,
    chartTick: isDark ? '#9ca3af' : '#6b7280',
    chartMuted: isDark ? '#6b7280' : '#9ca3af',
    chartGrid: isDark ? '#374151' : '#e5e7eb',
    tipBg: isDark ? 'rgba(31,41,55,0.96)' : 'rgba(255,255,255,0.96)',
    tipBorder: isDark ? '#4b5563' : '#e5e7eb',
    tipColor: isDark ? '#f3f4f6' : '#111827',
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

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  iconBg,
  iconColor,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  hint?: string;
  iconBg: string;
  iconColor: string;
  href?: string;
}) {
  const inner = (
    <Card className="h-full transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center">
          <div className={`flex-shrink-0 rounded-lg p-2 sm:p-3 ${iconBg}`}>
            <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${iconColor}`} />
          </div>
          <div className="ml-3 min-w-0 flex-1 sm:ml-4">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-2xl">{value}</p>
            {hint ? (
              <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">{hint}</p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (!href) return inner;
  return (
    <Link href={href} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 rounded-lg">
      {inner}
    </Link>
  );
}

function actionVisual(action: string): { Icon: LucideIcon; wrap: string } {
  const a = action.toUpperCase();
  if (a === 'DELETE')
    return { Icon: Trash2, wrap: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' };
  if (a === 'APPROVE')
    return { Icon: CheckCircle2, wrap: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' };
  if (a === 'REJECT')
    return { Icon: XCircle, wrap: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' };
  return { Icon: Plus, wrap: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' };
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
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="relative h-[168px] w-[168px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={74}
                    paddingAngle={2}
                    stroke={theme.pieStroke}
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.status} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={theme.tipStyle} formatter={(value: number, name: string) => [`${value}`, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{total}</span>
                <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">total</span>
              </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5">
              {chartData.slice(0, 6).map((item) => {
                const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                return (
                  <li key={item.status} className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200">{item.label}</span>
                    <span className="shrink-0 tabular-nums text-gray-400 dark:text-gray-500">{pct}%</span>
                    <span className="w-7 shrink-0 text-right tabular-nums text-gray-600 dark:text-gray-300">{item.count}</span>
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

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="mx-auto h-16 w-72 rounded-lg bg-gray-200/80 dark:bg-gray-800" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="h-[5.5rem] rounded-lg bg-gray-200/80 dark:bg-gray-800" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2">
        <div className="h-80 rounded-lg bg-gray-200/80 dark:bg-gray-800" />
        <div className="h-80 rounded-lg bg-gray-200/80 dark:bg-gray-800" />
      </div>
      <div className="flex min-h-[8rem] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-red-600 dark:text-red-400" />
      </div>
    </div>
  );
}

export function SystemOverviewDashboard() {
  const theme = useChartTheme();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: async () => {
      const res = await api.get('/dashboard/overview');
      return res.data?.data as OverviewData;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const contractsBars = useMemo(() => {
    if (!data) return [];
    const c = data.contractsTimeline;
    return [
      { key: 'active', label: 'Ativos', count: c.active, color: '#0f766e' },
      { key: 'e30', label: 'Vence 30d', count: c.expiring30, color: '#c2410c' },
      { key: 'e60', label: 'Vence 60d', count: c.expiring60, color: '#a16207' },
      { key: 'expired', label: 'Vencidos', count: c.expired, color: '#b91c1c' },
    ];
  }, [data]);

  const radarData = useMemo(() => {
    if (!data) return [];
    const k = data.kpis;
    const max = Math.max(
      k.openPurchaseOrders,
      k.openMaterialRequests,
      k.activeLogistics,
      k.pendingFuel,
      k.openStockShortfalls,
      k.pendingVehicleReservations,
      k.openToolRentals,
      k.quoteMapsWithoutOc,
      1
    );
    const scale = (v: number) => Math.round((v / max) * 100);
    return [
      { subject: 'OCs', value: scale(k.openPurchaseOrders), full: k.openPurchaseOrders },
      { subject: 'RMs', value: scale(k.openMaterialRequests), full: k.openMaterialRequests },
      { subject: 'Logística', value: scale(k.activeLogistics), full: k.activeLogistics },
      { subject: 'Combustível', value: scale(k.pendingFuel), full: k.pendingFuel },
      { subject: 'Furos', value: scale(k.openStockShortfalls), full: k.openStockShortfalls },
      { subject: 'Veículos', value: scale(k.pendingVehicleReservations), full: k.pendingVehicleReservations },
      { subject: 'Ferramentas', value: scale(k.openToolRentals), full: k.openToolRentals },
      { subject: 'Cotações', value: scale(k.quoteMapsWithoutOc), full: k.quoteMapsWithoutOc },
    ];
  }, [data]);

  const backlogCompare = useMemo(() => {
    if (!data) return [];
    const closedPo = ['FINALIZED', 'RECEIVED', 'REJECTED', 'CANCELLED'];
    const closedRm = ['FULFILLED', 'REJECTED', 'CANCELLED'];
    const closedFuel = ['COMPLETED', 'APPROVED', 'REJECTED', 'CANCELLED'];
    const poOpen =
      sumCounts(data.purchaseOrdersByStatus) -
      data.purchaseOrdersByStatus.filter((s) => closedPo.includes(s.status)).reduce((a, s) => a + s.count, 0);
    const poDone = data.purchaseOrdersByStatus
      .filter((s) => closedPo.includes(s.status))
      .reduce((a, s) => a + s.count, 0);
    const rmOpen =
      sumCounts(data.materialRequestsByStatus) -
      data.materialRequestsByStatus.filter((s) => closedRm.includes(s.status)).reduce((a, s) => a + s.count, 0);
    const rmDone = data.materialRequestsByStatus
      .filter((s) => closedRm.includes(s.status))
      .reduce((a, s) => a + s.count, 0);
    const fuelOpen = data.fuelByStatus
      .filter((s) => !closedFuel.includes(s.status))
      .reduce((a, s) => a + s.count, 0);
    const fuelDone = data.fuelByStatus
      .filter((s) => closedFuel.includes(s.status))
      .reduce((a, s) => a + s.count, 0);
    const logOpen = data.logisticsByStatus.find((s) => s.status === 'PENDING')?.count ?? 0;
    const logDone = data.logisticsByStatus.find((s) => s.status === 'COMPLETED')?.count ?? 0;
    const toolsOpen = data.toolRentalsByStatus
      .filter((s) => ['OPEN', 'SUPPLIER_RELATION', 'AWAITING_PAYMENT'].includes(s.status))
      .reduce((a, s) => a + s.count, 0);
    const toolsDone = data.toolRentalsByStatus
      .filter((s) => ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(s.status))
      .reduce((a, s) => a + s.count, 0);
    const vehiclesOpen = data.vehicleReservationsByStatus
      .filter((s) => ['PENDING_SUPPLIES', 'APPROVED', 'COMPLETED'].includes(s.status))
      .reduce((a, s) => a + s.count, 0);
    const vehiclesDone = data.vehicleReservationsByStatus
      .filter((s) => ['INSPECTED', 'REJECTED', 'CANCELLED'].includes(s.status))
      .reduce((a, s) => a + s.count, 0);
    return [
      { name: 'OC', aberto: poOpen, concluido: poDone },
      { name: 'RM', aberto: rmOpen, concluido: rmDone },
      { name: 'Combustível', aberto: fuelOpen, concluido: fuelDone },
      { name: 'Logística', aberto: logOpen, concluido: logDone },
      { name: 'Ferramentas', aberto: toolsOpen, concluido: toolsDone },
      { name: 'Veículos', aberto: vehiclesOpen, concluido: vehiclesDone },
    ];
  }, [data]);

  const logisticsRadial = useMemo(() => {
    if (!data) return [];
    const pending = data.logisticsByStatus.find((s) => s.status === 'PENDING')?.count ?? 0;
    const done = data.logisticsByStatus.find((s) => s.status === 'COMPLETED')?.count ?? 0;
    const total = pending + done;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return [{ name: 'Concluídas', value: pct, fill: '#0f766e' }];
  }, [data]);

  const logisticsPct = logisticsRadial[0]?.value ?? 0;

  const actionMix = useMemo(() => {
    if (!data) return [];
    const creates = data.activityByDay.reduce((s, d) => s + d.creates, 0);
    const deletes = data.activityByDay.reduce((s, d) => s + d.deletes, 0);
    const approves = data.activityByDay.reduce((s, d) => s + d.approves, 0);
    const rejects = data.activityByDay.reduce((s, d) => s + d.rejects, 0);
    return [
      { name: 'Adições', value: creates, color: '#0f766e' },
      { name: 'Aprovações', value: approves, color: '#1e40af' },
      { name: 'Exclusões', value: deletes, color: '#b91c1c' },
      { name: 'Rejeições', value: rejects, color: '#c2410c' },
    ].filter((d) => d.value > 0);
  }, [data]);

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-10 text-center dark:border-red-900/50 dark:bg-red-950/30">
        <p className="text-sm font-medium text-red-700 dark:text-red-300">Não foi possível carregar o painel geral.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 inline-flex items-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const { kpis } = data;
  const updatedLabel = format(new Date(data.generatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
          Painel do Sistema
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
          Visão geral de compras, logística, estoque, frota, financeiro e atividade
          {isFetching ? ' · atualizando…' : ` · atualizado ${updatedLabel}`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
        <KpiCard
          icon={ClipboardList}
          label="Aprovações pendentes"
          value={kpis.pendingApprovals}
          hint="OC, RM, combustível, frota, ferramentas e furos"
          iconBg="bg-red-100 dark:bg-red-900/30"
          iconColor="text-red-600 dark:text-red-400"
          href={ROUTES.approvals}
        />
        <KpiCard
          icon={ShoppingCart}
          label="OCs em aberto"
          value={kpis.openPurchaseOrders}
          hint="Fora de finalizadas / recebidas"
          iconBg="bg-blue-100 dark:bg-blue-900/30"
          iconColor="text-blue-600 dark:text-blue-400"
          href={ROUTES.purchaseOrders}
        />
        <KpiCard
          icon={Package}
          label="RMs em aberto"
          value={kpis.openMaterialRequests}
          hint="Solicitações ainda não encerradas"
          iconBg="bg-teal-100 dark:bg-teal-900/30"
          iconColor="text-teal-700 dark:text-teal-300"
          href={ROUTES.materialRequests}
        />
        <KpiCard
          icon={Truck}
          label="Logística ativa"
          value={kpis.activeLogistics}
          hint="Entregas pendentes"
          iconBg="bg-yellow-100 dark:bg-yellow-900/30"
          iconColor="text-yellow-600 dark:text-yellow-400"
          href={ROUTES.logistics}
        />
        <KpiCard
          icon={Fuel}
          label="Combustível pendente"
          value={kpis.pendingFuel}
          hint="Gestor ou suprimentos"
          iconBg="bg-orange-100 dark:bg-orange-900/30"
          iconColor="text-orange-600 dark:text-orange-400"
          href={ROUTES.fuel}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Furos de estoque"
          value={kpis.openStockShortfalls}
          hint="Pendências de entrega abertas"
          iconBg="bg-rose-100 dark:bg-rose-900/30"
          iconColor="text-rose-700 dark:text-rose-300"
          href={ROUTES.stockShortfalls}
        />
        <KpiCard
          icon={Car}
          label="Reservas pendentes"
          value={kpis.pendingVehicleReservations}
          hint="Aguardando suprimentos"
          iconBg="bg-indigo-100 dark:bg-indigo-900/30"
          iconColor="text-indigo-700 dark:text-indigo-300"
          href={ROUTES.vehicles}
        />
        <KpiCard
          icon={Wrench}
          label="Ferramentas em aberto"
          value={kpis.openToolRentals}
          hint="Abertas até pagamento"
          iconBg="bg-cyan-100 dark:bg-cyan-900/30"
          iconColor="text-cyan-700 dark:text-cyan-300"
          href={ROUTES.tools}
        />
        <KpiCard
          icon={MapIcon}
          label="Cotações sem OC"
          value={kpis.quoteMapsWithoutOc}
          hint="Mapas ainda sem ordem gerada"
          iconBg="bg-violet-100 dark:bg-violet-900/30"
          iconColor="text-violet-700 dark:text-violet-300"
          href={ROUTES.quoteMaps}
        />
        <KpiCard
          icon={Receipt}
          label="Espelhos sem NF"
          value={kpis.espelhoNfWithoutAttachment}
          hint="Cadastros sem anexo de nota"
          iconBg="bg-fuchsia-100 dark:bg-fuchsia-900/30"
          iconColor="text-fuchsia-700 dark:text-fuchsia-300"
          href={ROUTES.espelhoNf}
        />
        <KpiCard
          icon={FileText}
          label="Contratos a vencer"
          value={kpis.contractsExpiringSoon}
          hint="Próximos 60 dias"
          iconBg="bg-amber-100 dark:bg-amber-900/30"
          iconColor="text-amber-700 dark:text-amber-300"
          href={ROUTES.contracts}
        />
        <KpiCard
          icon={Wallet}
          label="Valor a pagar"
          value={formatCurrencyBrl(kpis.financialAwaitingPaymentAmount || 0)}
          hint={`${kpis.financialAwaitingPayment} lançamento(s) aguardando`}
          iconBg="bg-slate-100 dark:bg-slate-800"
          iconColor="text-slate-700 dark:text-slate-300"
          href={ROUTES.financial}
        />
        <KpiCard
          icon={Activity}
          label="Ações (7 dias)"
          value={kpis.actionsLast7Days}
          hint="Adições, exclusões e aprovações"
          iconBg="bg-green-100 dark:bg-green-900/30"
          iconColor="text-green-600 dark:text-green-400"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Card className={`${cadastroListClasses.card} flex min-h-0 flex-col`}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <SectionTitle
              icon={TrendingUp}
              title="Atividade do sistema"
              subtitle="Últimos 14 dias — criações, exclusões e aprovações"
            />
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.activityByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="actCreate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f766e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="actApprove" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1e40af" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#1e40af" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: theme.chartTick, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} width={28} tick={{ fill: theme.chartTick, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={theme.tipStyle} labelStyle={{ color: theme.chartMuted }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="creates" name="Adições" stroke="#0f766e" fill="url(#actCreate)" strokeWidth={2} />
                  <Area type="monotone" dataKey="approves" name="Aprovações" stroke="#1e40af" fill="url(#actApprove)" strokeWidth={2} />
                  <Bar dataKey="deletes" name="Exclusões" fill="#b91c1c" radius={[3, 3, 0, 0]} maxBarSize={14} opacity={0.85} />
                  <Line type="monotone" dataKey="rejects" name="Rejeições" stroke="#c2410c" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  <Line type="monotone" dataKey="total" name="Total" stroke="#64748b" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className={`${cadastroListClasses.card} flex min-h-0 flex-col`}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <SectionTitle icon={ClipboardList} title="Pressão operacional" subtitle="Indicadores relativos de pendências" />
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} cx="50%" cy="52%" outerRadius="72%">
                  <PolarGrid stroke={theme.chartGrid} />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: theme.chartTick, fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Pendências" dataKey="value" stroke="#b91c1c" fill="#b91c1c" fillOpacity={0.28} strokeWidth={2} />
                  <Tooltip
                    contentStyle={theme.tipStyle}
                    formatter={(_v: number, _n: string, item: { payload?: { full?: number; subject?: string } }) => [
                      `${item.payload?.full ?? 0}`,
                      item.payload?.subject || 'Valor',
                    ]}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <DonutCard
          title="Ordens de compra"
          subtitle="Distribuição por status"
          href={ROUTES.purchaseOrders}
          icon={ShoppingCart}
          data={data.purchaseOrdersByStatus}
          emptyHint="Nenhuma OC cadastrada"
        />
        <DonutCard
          title="Solicitações de materiais"
          subtitle="Distribuição por status"
          href={ROUTES.materialRequests}
          icon={Package}
          data={data.materialRequestsByStatus}
          emptyHint="Nenhuma RM cadastrada"
        />
        <DonutCard
          title="Combustível"
          subtitle="Pedidos por etapa"
          href={ROUTES.fuel}
          icon={Fuel}
          data={data.fuelByStatus}
          emptyHint="Nenhum abastecimento"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <DonutCard
          title="Furos de estoque"
          subtitle="Abertos vs resolvidos"
          href={ROUTES.stockShortfalls}
          icon={AlertTriangle}
          data={data.stockShortfallsByStatus}
          emptyHint="Nenhum furo registrado"
        />
        <DonutCard
          title="Reservas de veículos"
          subtitle="Distribuição por status"
          href={ROUTES.vehicles}
          icon={Car}
          data={data.vehicleReservationsByStatus}
          emptyHint="Nenhuma reserva cadastrada"
        />
        <DonutCard
          title="Ferramentas"
          subtitle="Fluxo até o pagamento"
          href={ROUTES.tools}
          icon={Wrench}
          data={data.toolRentalsByStatus}
          emptyHint="Nenhuma solicitação de ferramentas"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <DonutCard
          title="Mapas de cotação"
          subtitle="Com e sem OC gerada"
          href={ROUTES.quoteMaps}
          icon={MapIcon}
          data={data.quoteMapsBreakdown}
          emptyHint="Nenhum mapa de cotação"
        />
        <DonutCard
          title="Espelho NF"
          subtitle="Anexos de nota fiscal"
          href={ROUTES.espelhoNf}
          icon={Receipt}
          data={data.espelhoNfBreakdown}
          emptyHint="Nenhum espelho cadastrado"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
        <Card className={`${cadastroListClasses.card} flex min-h-0 flex-col`}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <SectionTitle icon={Package} title="Aberto × concluído" subtitle="Comparativo entre módulos" />
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            {backlogCompare.every((r) => r.aberto === 0 && r.concluido === 0) ? (
              <CadastroListEmpty icon={Package} title="Sem volume" hint="Ainda não há registros nesses módulos" />
            ) : (
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={backlogCompare} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: theme.chartTick, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} width={28} tick={{ fill: theme.chartTick, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={theme.tipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="aberto" name="Em aberto" stackId="a" fill="#c2410c" radius={[0, 0, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="concluido" name="Concluído" stackId="a" fill="#0f766e" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`${cadastroListClasses.card} flex min-h-0 flex-col`}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <SectionTitle icon={Truck} title="Logística" subtitle="Taxa de conclusão" href={ROUTES.logistics} />
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            {sumCounts(data.logisticsByStatus) === 0 ? (
              <CadastroListEmpty icon={Truck} title="Sem entregas" hint="Nenhuma solicitação logística" />
            ) : (
              <div className="relative h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius="58%"
                    outerRadius="88%"
                    barSize={18}
                    data={logisticsRadial}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar background dataKey="value" cornerRadius={10} />
                    <Tooltip contentStyle={theme.tipStyle} formatter={(v: number) => [`${v}%`, 'Concluídas']} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{logisticsPct}%</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">concluídas</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`${cadastroListClasses.card} flex min-h-0 flex-col`}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <SectionTitle icon={FileText} title="Contratos" subtitle="Situação por vigência" href={ROUTES.contracts} />
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            {contractsBars.every((b) => b.count === 0) ? (
              <CadastroListEmpty icon={FileText} title="Sem contratos" hint="Nenhum contrato cadastrado" />
            ) : (
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={contractsBars} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: theme.chartTick, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="label" width={78} tick={{ fill: theme.chartTick, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                      contentStyle={theme.tipStyle}
                    />
                    <Bar dataKey="count" name="Contratos" radius={[0, 6, 6, 0]} maxBarSize={22}>
                      {contractsBars.map((entry) => (
                        <Cell key={entry.key} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className={`${cadastroListClasses.card} flex min-h-0 flex-col`}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <SectionTitle icon={Wallet} title="Financeiro" subtitle="Lançamentos por status" href={ROUTES.financial} />
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            {data.financialByStatus.every((s) => s.count === 0) ? (
              <CadastroListEmpty icon={Wallet} title="Sem lançamentos" hint="Controle financeiro vazio" />
            ) : (
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.financialByStatus.filter((s) => s.count > 0)}
                    margin={{ top: 8, right: 4, left: 0, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} vertical={false} />
                    <XAxis
                      dataKey="label"
                      interval={0}
                      angle={-28}
                      textAnchor="end"
                      height={60}
                      tick={{ fill: theme.chartTick, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis allowDecimals={false} width={28} tick={{ fill: theme.chartTick, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={theme.tipStyle} />
                    <Bar dataKey="count" name="Qtd" radius={[4, 4, 0, 0]} maxBarSize={28}>
                      {data.financialByStatus
                        .filter((s) => s.count > 0)
                        .map((entry, i) => (
                          <Cell key={entry.status} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                        ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`${cadastroListClasses.card} flex min-h-0 flex-col`}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <SectionTitle icon={Activity} title="Mix de ações" subtitle="Composição dos últimos 14 dias" />
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            {actionMix.length === 0 ? (
              <CadastroListEmpty icon={Activity} title="Sem ações" hint="Ainda não há auditoria no período" />
            ) : (
              <div className="flex h-[240px] items-center gap-2">
                <div className="h-full w-[55%] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={actionMix}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={88}
                        paddingAngle={2}
                        stroke={theme.pieStroke}
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {actionMix.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={theme.tipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="min-w-0 flex-1 space-y-2 pr-1">
                  {actionMix.map((item) => (
                    <li key={item.name} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200">{item.name}</span>
                      <span className="tabular-nums font-medium text-gray-900 dark:text-gray-100">{item.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={`${cadastroListClasses.card} flex min-h-0 flex-col`}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <SectionTitle icon={Activity} title="Módulos mais movimentados" subtitle="Ações nos últimos 30 dias" />
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            {data.topAuditEntities.length === 0 ? (
              <CadastroListEmpty icon={Activity} title="Sem ações" hint="Ainda não há auditoria no período" />
            ) : (
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topAuditEntities} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: theme.chartTick, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={110}
                      tick={{ fill: theme.chartTick, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={theme.tipStyle} />
                    <Bar dataKey="count" name="Ações" radius={[0, 6, 6, 0]} maxBarSize={18}>
                      {data.topAuditEntities.map((_, i) => (
                        <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className={cadastroListClasses.card}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <SectionTitle icon={Activity} title="Ações recentes" subtitle="Últimas movimentações registradas no sistema" />
        </CardHeader>
        <CardContent className={cadastroListClasses.cardContent}>
          {data.recentActions.length === 0 ? (
            <CadastroListEmpty icon={Activity} title="Nenhuma ação recente" hint="As ações passam a aparecer conforme o uso" />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/80">
              {data.recentActions.map((item) => {
                const visual = actionVisual(item.action);
                const ItemIcon = visual.Icon;
                return (
                  <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${visual.wrap}`}>
                      <ItemIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {item.summary || `${item.action} · ${item.entityLabel}`}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {[item.userName, item.timelineRef || item.entityLabel].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <time className="shrink-0 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                      {format(new Date(item.at), 'dd/MM HH:mm', { locale: ptBR })}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
