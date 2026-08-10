'use client';

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Activity,
  Clock3,
  Globe,
  Loader2,
  LogIn,
  LogOut,
  TrendingUp,
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

type InsightsResponse = {
  topPages: Array<{ path: string; label: string | null; count: number }>;
  byHour: Array<{ hour: number; total: number }>;
  timeline: Array<{
    id: string;
    type: 'login' | 'logout' | 'visit';
    at: string;
    title: string;
    subtitle?: string | null;
  }>;
  totals: { logins: number; visits: number };
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

const barColor = '#dc2626';

const PIE_COLORS_LIGHT = ['#dc2626', '#ea580c', '#d97706', '#059669', '#2563eb'];
const PIE_COLORS_DARK = ['#f87171', '#fb923c', '#fbbf24', '#34d399', '#60a5fa'];

export function EmployeeActivityInsights({
  userId,
  from,
  to,
  periodFilter,
}: {
  userId: string;
  from: string;
  to: string;
  periodFilter: React.ReactNode;
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

  const topPagesTotal = useMemo(
    () => (data?.topPages || []).reduce((sum, item) => sum + item.count, 0),
    [data?.topPages]
  );

  const topPagesData = useMemo(() => {
    const palette = isDark ? PIE_COLORS_DARK : PIE_COLORS_LIGHT;
    return (data?.topPages || []).map((item, index) => ({
      ...item,
      name: item.label || item.path,
      color: palette[index % palette.length],
      pct: topPagesTotal > 0 ? Math.round((item.count / topPagesTotal) * 100) : 0,
    }));
  }, [data?.topPages, isDark, topPagesTotal]);

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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Card className={`${cadastroListClasses.card} flex h-full min-h-0 flex-col`}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <SectionHeader
                icon={TrendingUp}
                title="Páginas mais visitadas"
                subtitle="Top 5 no período"
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
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5">
                  <div className="h-[176px] w-[176px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={topPagesData}
                          dataKey="count"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={76}
                          paddingAngle={2}
                          stroke={pieStroke}
                          strokeWidth={2}
                          isAnimationActive={false}
                        >
                          {topPagesData.map((entry) => (
                            <Cell key={entry.path} fill={entry.color} stroke={pieStroke} strokeWidth={2} />
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
                          formatter={(value: number, name: string) => [
                            `${value} visita${value === 1 ? '' : 's'}`,
                            name,
                          ]}
                          contentStyle={{
                            backgroundColor: chartTooltipBg,
                            borderRadius: 10,
                            border: `1px solid ${chartTooltipBorder}`,
                            color: chartTooltipColor,
                            fontSize: 12,
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.15)',
                          }}
                          labelStyle={{ color: chartTooltipColor }}
                          itemStyle={{ color: chartTooltipColor }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                    {topPagesData.map((item) => (
                      <li
                        key={item.path}
                        className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1"
                        title={item.path}
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

          <Card className={`${cadastroListClasses.card} flex h-full min-h-0 flex-col lg:col-span-2 xl:col-span-1`}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <SectionHeader
                icon={Activity}
                title="Linha do tempo"
                subtitle="Logins, saídas e páginas em ordem"
              />
            </CardHeader>
            <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col`}>
              {data.timeline.length === 0 ? (
                <CadastroListEmpty
                  icon={Activity}
                  title="Nenhum evento no período"
                  hint="Ajuste o filtro de datas"
                />
              ) : (
                <ul className="max-h-[260px] min-h-0 flex-1 space-y-0 overflow-y-auto pr-1">
                  {data.timeline.map((item, index) => {
                    const isLogin = item.type === 'login';
                    const isLogout = item.type === 'logout';
                    return (
                      <li key={item.id} className="relative flex gap-2.5 pb-3 last:pb-0">
                        {index < data.timeline.length - 1 ? (
                          <span
                            className="absolute left-[11px] top-7 bottom-0 w-px bg-gray-200 dark:bg-gray-700"
                            aria-hidden
                          />
                        ) : null}
                        <div
                          className={`relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                            isLogin
                              ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'
                              : isLogout
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          }`}
                        >
                          {isLogin ? (
                            <LogIn className="h-3.5 w-3.5" />
                          ) : isLogout ? (
                            <LogOut className="h-3.5 w-3.5" />
                          ) : (
                            <Globe className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
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
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
