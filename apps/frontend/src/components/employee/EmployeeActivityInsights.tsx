'use client';

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Activity,
  CheckCircle2,
  Clock3,
  Globe,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  Trash2,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
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

type TimelineItemType =
  | 'login'
  | 'logout'
  | 'visit'
  | 'create'
  | 'delete'
  | 'approve'
  | 'reject';

type InsightsResponse = {
  topPages: Array<{ path: string; label: string | null; count: number }>;
  byHour: Array<{ hour: number; total: number }>;
  timeline: Array<{
    id: string;
    type: TimelineItemType;
    at: string;
    title: string;
    subtitle?: string | null;
  }>;
  totals: { logins: number; visits: number; actions?: number };
};

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR });
}

function formatTimeOnly(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'HH:mm:ss');
}

function toLocalDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return format(date, 'yyyy-MM-dd');
}

function formatDayHeading(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return dayKey;
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  return format(date, "EEEE, dd 'de' MMM", { locale: ptBR });
}

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <div className={cadastroListClasses.cardHeaderIconRow}>
      <div className="shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
        <Icon className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" aria-hidden />
      </div>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
          {title}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
    </div>
  );
}

function timelineVisual(type: TimelineItemType): {
  Icon: LucideIcon;
  wrap: string;
} {
  switch (type) {
    case 'login':
      return {
        Icon: LogIn,
        wrap: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
      };
    case 'logout':
      return {
        Icon: LogOut,
        wrap: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      };
    case 'create':
      return {
        Icon: Plus,
        wrap: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
      };
    case 'delete':
      return {
        Icon: Trash2,
        wrap: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
      };
    case 'approve':
      return {
        Icon: CheckCircle2,
        wrap: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
      };
    case 'reject':
      return {
        Icon: XCircle,
        wrap: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
      };
    case 'visit':
    default:
      return {
        Icon: Globe,
        wrap: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
      };
  }
}

const barColor = '#dc2626';

const PIE_COLORS_LIGHT = ['#b91c1c', '#0f766e', '#1e40af'];
const PIE_COLORS_DARK = ['#f87171', '#2dd4bf', '#93c5fd'];
const PIE_OTHERS_LIGHT = '#94a3b8';
const PIE_OTHERS_DARK = '#64748b';

type TopPageSlice = {
  path: string;
  label: string | null;
  count: number;
  name: string;
  color: string;
  pct: number;
  isOthers?: boolean;
  others?: Array<{ name: string; count: number; pct: number }>;
};

export function EmployeeActivityInsights({
  userId,
  from,
  to,
  periodFilter,
  belowCharts,
}: {
  userId: string;
  from: string;
  to: string;
  periodFilter: React.ReactNode;
  /** Conteúdo abaixo dos gráficos (ex.: histórico), alinhado à esquerda da timeline alta */
  belowCharts?: React.ReactNode;
}) {
  const { isDark } = useTheme();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['user-activity-insights', userId, from, to],
    queryFn: async () => {
      const res = await api.get(`/users/${userId}/activity/insights`, {
        params: {
          from: from || undefined,
          to: to || undefined,
        },
      });
      return res.data?.data as InsightsResponse;
    },
    enabled: Boolean(userId),
    staleTime: 15_000,
  });

  const chartTick = isDark ? '#9ca3af' : '#6b7280';
  const chartMuted = isDark ? '#6b7280' : '#9ca3af';
  const chartGrid = isDark ? '#374151' : '#e5e7eb';
  const chartTooltipBg = isDark ? 'rgba(31, 41, 55, 0.96)' : 'rgba(255, 255, 255, 0.96)';
  const chartTooltipBorder = isDark ? '#4b5563' : '#e5e7eb';
  const chartTooltipColor = isDark ? '#f3f4f6' : '#111827';

  const topPagesFiltered = useMemo(() => {
    return (data?.topPages || []).filter((item) => {
      const path = String(item.path || '').replace(/\/+$/, '').toLowerCase();
      const label = String(item.label || '').trim().toLowerCase();
      if (path === '/ponto/home' || path === '/home') return false;
      if (label === 'início' || label === 'inicio') return false;
      return true;
    });
  }, [data?.topPages]);

  const topPagesTotal = useMemo(
    () => topPagesFiltered.reduce((sum, item) => sum + item.count, 0),
    [topPagesFiltered]
  );

  const topPagesData = useMemo((): TopPageSlice[] => {
    const palette = isDark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT;
    const othersColor = isDark ? PIE_OTHERS_DARK : PIE_OTHERS_LIGHT;
    const pctOf = (count: number) =>
      topPagesTotal > 0 ? Math.round((count / topPagesTotal) * 100) : 0;

    const ranked = topPagesFiltered.map((item) => ({
      ...item,
      name: item.label || item.path,
    }));

    if (ranked.length <= 3) {
      return ranked.map((item, index) => ({
        ...item,
        color: palette[index % palette.length],
        pct: pctOf(item.count),
      }));
    }

    const top3 = ranked.slice(0, 3).map((item, index) => ({
      ...item,
      color: palette[index % palette.length],
      pct: pctOf(item.count),
    }));

    const rest = ranked.slice(3);
    const othersCount = rest.reduce((sum, item) => sum + item.count, 0);
    return [
      ...top3,
      {
        path: '__others__',
        label: 'Outros',
        count: othersCount,
        name: 'Outros',
        color: othersColor,
        pct: pctOf(othersCount),
        isOthers: true,
        others: rest.map((item) => ({
          name: item.name,
          count: item.count,
          pct: pctOf(item.count),
        })),
      },
    ];
  }, [topPagesFiltered, isDark, topPagesTotal]);

  const pieStroke = isDark ? '#1f2937' : '#ffffff';
  const pieCenterMain = isDark ? '#f9fafb' : '#111827';
  const pieCenterMuted = isDark ? '#9ca3af' : '#6b7280';

  const peakHour = useMemo(() => {
    const hours = data?.byHour || [];
    if (!hours.length) return null;
    const best = hours.reduce((a, b) => (b.total > a.total ? b : a), hours[0]);
    return best.total > 0 ? best : null;
  }, [data?.byHour]);

  const hourChartData = useMemo(
    () =>
      (data?.byHour || []).map((row) => ({
        ...row,
        label: `${String(row.hour).padStart(2, '0')}h`,
      })),
    [data?.byHour]
  );

  const timelineByDay = useMemo(() => {
    const groups: Array<{
      dayKey: string;
      label: string;
      items: InsightsResponse['timeline'];
    }> = [];
    const indexByDay = new Map<string, number>();

    for (const item of data?.timeline || []) {
      const dayKey = toLocalDayKey(item.at);
      const existing = indexByDay.get(dayKey);
      if (existing == null) {
        indexByDay.set(dayKey, groups.length);
        groups.push({
          dayKey,
          label: capitalizeFirst(formatDayHeading(dayKey)),
          items: [item],
        });
      } else {
        groups[existing].items.push(item);
      }
    }

    return groups;
  }, [data?.timeline]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
            Insights do período
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Páginas, horários e linha do tempo
          </p>
        </div>
        {periodFilter}
      </div>

      {isLoading ? (
        <div className="flex min-h-[12rem] items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <Loader2 className="h-7 w-7 animate-spin text-red-600 dark:text-red-400" />
        </div>
      ) : isError || !data ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          Não foi possível carregar os insights.
        </div>
      ) : (
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className={`${cadastroListClasses.card} flex h-full min-h-0 flex-col`}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <SectionHeader
                icon={TrendingUp}
                title="Páginas mais visitadas"
                subtitle="Top 3 no período"
              />
            </CardHeader>
            <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col`}>
              {topPagesData.length === 0 ? (
                <CadastroListEmpty
                  icon={Globe}
                  title="Nenhuma página no período"
                  hint="Ajuste o filtro ou aguarde novas visitas"
                />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex min-h-0 flex-1 items-start justify-center pt-1 pb-3">
                    <div className="h-[210px] w-[210px] shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={topPagesData}
                            dataKey="count"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={58}
                            outerRadius={92}
                            paddingAngle={2}
                            stroke={pieStroke}
                            strokeWidth={2}
                            isAnimationActive={false}
                          >
                            {topPagesData.map((entry) => (
                              <Cell
                                key={entry.path}
                                fill={entry.color}
                                stroke={pieStroke}
                                strokeWidth={2}
                              />
                            ))}
                            <Label
                              position="center"
                              content={({ viewBox }) => {
                                if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null;
                                const { cx, cy } = viewBox;
                                return (
                                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                                    <tspan
                                      x={cx}
                                      y={(cy || 0) - 4}
                                      fill={pieCenterMain}
                                      fontSize={22}
                                      fontWeight={700}
                                    >
                                      {topPagesTotal}
                                    </tspan>
                                    <tspan
                                      x={cx}
                                      y={(cy || 0) + 14}
                                      fill={pieCenterMuted}
                                      fontSize={11}
                                      fontWeight={500}
                                    >
                                      visitas
                                    </tspan>
                                  </text>
                                );
                              }}
                            />
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const entry = payload[0]?.payload as TopPageSlice | undefined;
                              if (!entry) return null;

                              return (
                                <div
                                  className="rounded-[10px] px-3 py-2 text-xs shadow-lg"
                                  style={{
                                    backgroundColor: chartTooltipBg,
                                    border: `1px solid ${chartTooltipBorder}`,
                                    color: chartTooltipColor,
                                  }}
                                >
                                  {entry.isOthers && entry.others?.length ? (
                                    <>
                                      <p className="mb-1.5 font-semibold">Outros ({entry.pct}%)</p>
                                      <ul className="space-y-1">
                                        {entry.others.map((page) => (
                                          <li
                                            key={page.name}
                                            className="flex items-center justify-between gap-4"
                                          >
                                            <span className="truncate">{page.name}</span>
                                            <span
                                              className="shrink-0 tabular-nums"
                                              style={{ color: chartMuted }}
                                            >
                                              {page.pct}%
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    </>
                                  ) : (
                                    <>
                                      <p className="font-semibold">{entry.name}</p>
                                      <p style={{ color: chartMuted }}>
                                        {entry.count} visita{entry.count === 1 ? '' : 's'} · {entry.pct}%
                                      </p>
                                    </>
                                  )}
                                </div>
                              );
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <ul className="grid w-full min-w-0 shrink-0 grid-cols-1 gap-2 sm:grid-cols-2">
                    {topPagesData.map((item) => (
                      <li
                        key={item.path}
                        className="group relative flex min-w-0 items-center gap-2 rounded-md px-1 py-1"
                        title={item.isOthers ? undefined : item.path}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                          aria-hidden
                        />
                        <span
                          className="min-w-0 flex-1 truncate text-xs font-medium"
                          style={{ color: isDark ? '#f3f4f6' : '#111827' }}
                        >
                          {item.name}
                        </span>
                        <span
                          className="shrink-0 text-xs tabular-nums"
                          style={{ color: isDark ? '#9ca3af' : '#6b7280' }}
                        >
                          {item.pct}%
                        </span>
                        {item.isOthers && item.others?.length ? (
                          <div
                            className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-max min-w-[10rem] max-w-[16rem] rounded-[10px] px-3 py-2 text-xs shadow-lg group-hover:block"
                            style={{
                              backgroundColor: chartTooltipBg,
                              border: `1px solid ${chartTooltipBorder}`,
                              color: chartTooltipColor,
                            }}
                          >
                            <p className="mb-1.5 font-semibold">Outros ({item.pct}%)</p>
                            <ul className="space-y-1">
                              {item.others.map((page) => (
                                <li
                                  key={page.name}
                                  className="flex items-center justify-between gap-4"
                                >
                                  <span className="truncate">{page.name}</span>
                                  <span
                                    className="shrink-0 tabular-nums"
                                    style={{ color: chartMuted }}
                                  >
                                    {page.pct}%
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={`${cadastroListClasses.card} flex h-full min-h-0 flex-col`}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <SectionHeader
                icon={Clock3}
                title="Horário de pico"
                subtitle={
                  peakHour
                    ? `Mais ativo por volta das ${String(peakHour.hour).padStart(2, '0')}h`
                    : 'Atividade por hora do dia'
                }
              />
            </CardHeader>
            <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col`}>
              {(data.totals.logins + data.totals.visits) === 0 ? (
                <CadastroListEmpty
                  icon={Clock3}
                  title="Sem atividade no período"
                  hint="Ajuste o filtro de datas"
                />
              ) : (
                <div className="relative min-h-[240px] w-full flex-1">
                  <div className="absolute inset-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hourChartData} margin={{ top: 8, right: 4, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                        <XAxis
                          dataKey="label"
                          interval={2}
                          tick={{ fill: chartTick, fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          width={28}
                          tick={{ fill: chartTick, fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                          formatter={(value: number) => [value, 'Eventos']}
                          labelFormatter={(label) => `Horário ${label}`}
                          contentStyle={{
                            backgroundColor: chartTooltipBg,
                            borderRadius: 8,
                            border: `1px solid ${chartTooltipBorder}`,
                            color: chartTooltipColor,
                            fontSize: 12,
                          }}
                          labelStyle={{ color: chartMuted, marginBottom: 2 }}
                          itemStyle={{ color: chartTooltipColor }}
                        />
                        <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={22}>
                          {hourChartData.map((entry) => (
                            <Cell
                              key={entry.hour}
                              fill={
                                peakHour && entry.hour === peakHour.hour
                                  ? barColor
                                  : isDark
                                    ? '#7f1d1d'
                                    : '#fca5a5'
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          </div>

          {belowCharts}

          </div>

          <Card className={`${cadastroListClasses.card} flex w-full flex-col xl:w-[min(100%,24rem)] xl:shrink-0`}>
            <CardHeader className={`${cadastroListClasses.cardHeader} shrink-0`}>
              <SectionHeader
                icon={Activity}
                title="Linha do tempo"
                subtitle="Logins, páginas e ações em ordem"
              />
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {data.timeline.length === 0 ? (
                <CadastroListEmpty
                  icon={Activity}
                  title="Nenhum evento no período"
                  hint="Ajuste o filtro de datas"
                />
              ) : (
                <div>
                  {timelineByDay.map((group) => (
                    <div key={group.dayKey} className="mb-3 last:mb-0">
                      <p className="sticky top-0 z-[2] mb-2 bg-white/95 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 backdrop-blur-sm dark:bg-gray-800/95 dark:text-gray-400">
                        {group.label}
                      </p>
                      <ul className="space-y-0">
                        {group.items.map((item, index) => {
                          const visual = timelineVisual(item.type);
                          const ItemIcon = visual.Icon;
                          const next = group.items[index + 1];
                          const isLoginLogoutPair =
                            !!next &&
                            ((item.type === 'login' && next.type === 'logout') ||
                              (item.type === 'logout' && next.type === 'login'));
                          const showConnector =
                            index < group.items.length - 1 && !isLoginLogoutPair;
                          return (
                            <li
                              key={item.id}
                              className="relative flex items-center gap-2.5 pb-3 last:pb-0"
                            >
                              {showConnector ? (
                                <span
                                  className="absolute left-[11px] top-[calc(50%+12px)] bottom-0 w-px bg-gray-200 dark:bg-gray-700"
                                  aria-hidden
                                />
                              ) : null}
                              <div
                                className={`relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${visual.wrap}`}
                              >
                                <ItemIcon className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {item.title}
                                  </p>
                                  <time
                                    className="shrink-0 text-[11px] tabular-nums text-gray-500 dark:text-gray-400"
                                    dateTime={item.at}
                                    title={formatDateTime(item.at)}
                                  >
                                    {formatTimeOnly(item.at)}
                                  </time>
                                </div>
                                {item.subtitle ? (
                                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                    {item.subtitle}
                                  </p>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
