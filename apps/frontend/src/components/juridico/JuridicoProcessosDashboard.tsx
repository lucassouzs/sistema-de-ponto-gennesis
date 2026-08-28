'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Briefcase,
  Building2,
  Coins,
  FileCheck2,
  Filter,
  FilterX,
  Gavel,
  Landmark,
  ListFilter,
  Receipt,
  Scale,
  ScrollText,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { CadastroListEmpty } from '@/components/ui/CadastroListSummary';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { Loading } from '@/components/ui/Loading';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import type { JuridicoProcesso } from '@/data/juridico-processos-ativos';
import {
  EMPTY_JURIDICO_DASHBOARD_FILTERS,
  MESES_LONGOS,
  acordosPorMes,
  acordosPorReclamante,
  applyDashboardFilters,
  buildDashboardOptions,
  computeTotals,
  formatCompactBRL,
  formatFullBRL,
  groupByContrato,
  groupByEmpresa,
  objetoIndex,
  objetoIndexByContrato,
  rankBuckets,
  type JuridicoDashboardFilters,
  type JuridicoRankItem,
} from '@/data/juridico-processos-dashboard';

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

const SERIES = {
  processos: '#b91c1c',
  acordosQtd: '#7c3aed',
  acordoValor: '#0f766e',
  ro: '#1e40af',
  causa: '#c2410c',
  sentenca: '#0891b2',
};

function useChartTheme() {
  const { isDark } = useTheme();
  const tipColor = isDark ? '#f3f4f6' : '#111827';
  return {
    chartTick: isDark ? '#9ca3af' : '#6b7280',
    chartLabel: isDark ? '#e5e7eb' : '#374151',
    chartGrid: isDark ? '#374151' : '#e5e7eb',
    pieStroke: isDark ? '#1f2937' : '#ffffff',
    barCursor: isDark ? 'rgba(148,163,184,0.14)' : 'rgba(148,163,184,0.16)',
    tipStyle: {
      background: isDark ? 'rgba(31,41,55,0.96)' : 'rgba(255,255,255,0.96)',
      border: `1px solid ${isDark ? '#4b5563' : '#e5e7eb'}`,
      borderRadius: 10,
      color: tipColor,
      fontSize: 12,
    } as React.CSSProperties,
    /** Recharts não herda `contentStyle.color` no título/itens. */
    tipLabelStyle: { color: tipColor, marginBottom: 4 } as React.CSSProperties,
    tipItemStyle: { color: tipColor } as React.CSSProperties,
  };
}

function truncateLabel(value: string, max = 22): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatCount(value: number): string {
  return value.toLocaleString('pt-BR');
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className={cadastroListClasses.cardHeaderIconRow}>
      <div className="shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
        <Icon className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" aria-hidden />
      </div>
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
          {title}
        </h2>
        {subtitle ? (
          <p className="truncate text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

function ChartCard({
  icon,
  title,
  subtitle,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`${cadastroListClasses.card} flex h-full min-h-0 flex-col ${className || ''}`}>
      <CardHeader className={cadastroListClasses.cardHeader}>
        <SectionTitle icon={icon} title={title} subtitle={subtitle} />
      </CardHeader>
      <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col`}>
        {children}
      </CardContent>
    </Card>
  );
}

function ChartEmpty({ icon, hint }: { icon: LucideIcon; hint: string }) {
  return <CadastroListEmpty icon={icon} title="Sem dados no filtro atual" hint={hint} />;
}

/** Barras horizontais — os nomes de contrato/empresa são longos e não caberiam no eixo X. */
function RankBarChart({
  data,
  color,
  formatValue,
  icon,
  emptyHint,
}: {
  data: JuridicoRankItem[];
  color?: string;
  formatValue: (value: number) => string;
  icon: LucideIcon;
  emptyHint: string;
}) {
  const theme = useChartTheme();
  if (!data.length) return <ChartEmpty icon={icon} hint={emptyHint} />;

  const max = Math.max(...data.map((item) => item.value), 1);
  const height = Math.max(220, data.length * 38 + 16);

  // Larguras dinâmicas: labels curtos (GENNESIS) não deixam faixa vazia; valores longos
  // (R$ 557,22 Mil) só reservam o espaço necessário à direita.
  const longestLabelChars = Math.max(...data.map((item) => item.label.length), 1);
  const yAxisWidth = Math.min(168, Math.max(68, Math.round(longestLabelChars * 6.4)));
  const longestValueChars = Math.max(
    ...data.map((item) => formatValue(item.value).length),
    4,
  );
  const rightMargin = Math.min(108, Math.max(52, Math.round(longestValueChars * 7)));
  const labelMaxChars = Math.max(10, Math.floor(yAxisWidth / 6.2));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 2, right: rightMargin, bottom: 2, left: 0 }}
          barCategoryGap="18%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} horizontal={false} />
          <XAxis type="number" hide domain={[0, max]} />
          <YAxis
            type="category"
            dataKey="label"
            width={yAxisWidth}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            tick={{ fill: theme.chartTick, fontSize: 11 }}
            tickFormatter={(value: string) => truncateLabel(value, labelMaxChars)}
          />
          <Tooltip
            contentStyle={theme.tipStyle}
            labelStyle={theme.tipLabelStyle}
            itemStyle={theme.tipItemStyle}
            cursor={{ fill: theme.barCursor }}
            formatter={(value: number) => [formatValue(value), 'Total']}
            labelFormatter={(label: string) => String(label)}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26} animationDuration={650}>
            {data.map((item, index) => (
              <Cell key={item.key} fill={color ?? CHART_PALETTE[index % CHART_PALETTE.length]} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              offset={8}
              fill={theme.chartLabel}
              fontSize={11}
              formatter={(value: number) => formatValue(Number(value))}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutChart({
  data,
  formatValue,
  icon,
  emptyHint,
}: {
  data: JuridicoRankItem[];
  formatValue: (value: number) => string;
  icon: LucideIcon;
  emptyHint: string;
}) {
  const theme = useChartTheme();
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!data.length || total <= 0) return <ChartEmpty icon={icon} hint={emptyHint} />;

  const slices = data.map((item, index) => ({
    ...item,
    color: CHART_PALETTE[index % CHART_PALETTE.length],
  }));

  return (
    <div className="flex flex-col items-stretch gap-5 sm:flex-row sm:items-center">
      <div className="relative mx-auto h-[210px] w-[210px] shrink-0 sm:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={96}
              paddingAngle={1.5}
              stroke={theme.pieStroke}
              strokeWidth={3}
              cornerRadius={3}
              animationDuration={650}
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={theme.tipStyle}
              labelStyle={theme.tipLabelStyle}
              itemStyle={theme.tipItemStyle}
              formatter={(value: number, name: string) => [formatValue(value), name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold leading-none tabular-nums text-gray-900 dark:text-gray-100">
            {formatValue(total)}
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Total
          </span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {slices.slice(0, 7).map((slice) => {
          const pct = Math.round((slice.value / total) * 1000) / 10;
          return (
            <li key={slice.key} className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-gray-100">
                  {slice.label}
                </span>
                <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                  {pct.toLocaleString('pt-BR')}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: slice.color }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RankingList({
  data,
  icon,
  emptyHint,
  formatValue = formatCount,
}: {
  data: JuridicoRankItem[];
  icon: LucideIcon;
  emptyHint: string;
  formatValue?: (value: number) => string;
}) {
  if (!data.length) return <ChartEmpty icon={icon} hint={emptyHint} />;
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <ul className="space-y-2.5">
      {data.map((item, index) => {
        const pct = Math.max(4, Math.round((item.value / max) * 100));
        const color = CHART_PALETTE[index % CHART_PALETTE.length];
        return (
          <li key={item.key} className="min-w-0 space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span
                className="min-w-0 truncate font-medium text-gray-800 dark:text-gray-100"
                title={item.label}
              >
                {item.label}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                {formatValue(item.value)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      {children}
    </div>
  );
}

const TABS = [
  { key: 'empresa', label: 'Por empresa', icon: Building2 },
  { key: 'contrato', label: 'Por contrato', icon: ScrollText },
  { key: 'acordos', label: 'Acordos', icon: Coins },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function JuridicoProcessosDashboard() {
  const [filters, setFilters] = useState<JuridicoDashboardFilters>(
    EMPTY_JURIDICO_DASHBOARD_FILTERS,
  );
  const [showFilters, setShowFilters] = useState(false);
  const [tab, setTab] = useState<TabKey>('empresa');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['juridico-processos-dashboard'],
    queryFn: async () => {
      const res = await api.get('/juridico-processos');
      return (res.data?.data || []) as JuridicoProcesso[];
    },
  });

  const allRows = data || [];
  const options = useMemo(() => buildDashboardOptions(allRows), [allRows]);
  const rows = useMemo(() => applyDashboardFilters(allRows, filters), [allRows, filters]);

  const totals = useMemo(() => computeTotals(rows), [rows]);
  const empresas = useMemo(() => groupByEmpresa(rows), [rows]);
  const contratos = useMemo(() => groupByContrato(rows), [rows]);
  const objetos = useMemo(() => objetoIndex(rows), [rows]);
  const objetosPorContrato = useMemo(() => objetoIndexByContrato(rows), [rows]);
  const acordosMes = useMemo(() => acordosPorMes(rows), [rows]);
  const acordosReclamantes = useMemo(() => acordosPorReclamante(rows), [rows]);

  const theme = useChartTheme();
  const filtersActive = Object.values(filters).some((value) => value !== '');

  const setFilter = (key: keyof JuridicoDashboardFilters) => (value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  if (isLoading) {
    return <Loading message="Carregando indicadores..." size="lg" />;
  }

  if (isError) {
    const message =
      (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (error as Error)?.message ||
      'Erro ao carregar os processos';
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-gray-700 dark:text-gray-300">
          {message}
        </CardContent>
      </Card>
    );
  }

  const kpis = [
    {
      key: 'causa',
      label: 'Total causa',
      value: formatCompactBRL(totals.valorCausa),
      subtitle: formatFullBRL(totals.valorCausa),
      icon: Scale,
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      iconColor: 'text-red-600 dark:text-red-400',
    },
    {
      key: 'sentenca',
      label: 'Total sentença',
      value: formatCompactBRL(totals.valorSentenca),
      subtitle: formatFullBRL(totals.valorSentenca),
      icon: Gavel,
      iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
      iconColor: 'text-cyan-600 dark:text-cyan-400',
    },
    {
      key: 'custas',
      label: 'Total custas',
      value: formatCompactBRL(totals.valorCustas),
      subtitle: formatFullBRL(totals.valorCustas),
      icon: Receipt,
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      key: 'ro',
      label: 'Total RO',
      value: formatCompactBRL(totals.valorRO),
      subtitle: formatFullBRL(totals.valorRO),
      icon: TrendingUp,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      key: 'acordo',
      label: 'Total acordado',
      value: formatCompactBRL(totals.valorAcordo),
      subtitle: formatFullBRL(totals.valorAcordo),
      icon: Coins,
      iconBg: 'bg-teal-100 dark:bg-teal-900/30',
      iconColor: 'text-teal-600 dark:text-teal-400',
    },
    {
      key: 'processos',
      label: 'Total processos',
      value: formatCount(totals.processos),
      subtitle: `${allRows.length} cadastrados`,
      icon: Briefcase,
      iconBg: 'bg-slate-100 dark:bg-slate-800/60',
      iconColor: 'text-slate-600 dark:text-slate-300',
    },
    {
      key: 'acordos',
      label: 'Total acordos',
      value: formatCount(totals.acordos),
      subtitle:
        totals.processos > 0
          ? `${Math.round((totals.acordos / totals.processos) * 100)}% dos processos`
          : '—',
      icon: FileCheck2,
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      iconColor: 'text-purple-600 dark:text-purple-400',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-4 sm:space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
          {kpis.slice(0, 3).map((kpi) => (
            <FilterStatCard
              key={kpi.key}
              label={kpi.label}
              count={kpi.value}
              subtitle={kpi.subtitle}
              icon={kpi.icon}
              iconBg={kpi.iconBg}
              iconColor={kpi.iconColor}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          {kpis.slice(3).map((kpi) => (
            <FilterStatCard
              key={kpi.key}
              label={kpi.label}
              count={kpi.value}
              subtitle={kpi.subtitle}
              icon={kpi.icon}
              iconBg={kpi.iconBg}
              iconColor={kpi.iconColor}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-stretch gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-1.5 dark:border-gray-700 dark:bg-gray-800">
          {TABS.map((item) => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                aria-pressed={active}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors sm:flex-none ${
                  active
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((prev) => !prev)}
          className={`${cadastroListClasses.filterIconButton} transition-colors ${
            showFilters || filtersActive
              ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
              : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700'
          }`}
          aria-expanded={showFilters}
          aria-label="Abrir filtros"
          title={filtersActive ? 'Filtros ativos' : 'Filtros'}
        >
          <Filter className="h-4 w-4" />
          {filtersActive ? (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
          ) : null}
        </button>
      </div>

      {showFilters ? (
        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <SectionTitle
                icon={ListFilter}
                title="Filtros"
                subtitle="Recorte os indicadores por empresa, contrato, polo, objeto e período de abertura"
              />
              {filtersActive ? (
                <button
                  type="button"
                  onClick={() => setFilters(EMPTY_JURIDICO_DASHBOARD_FILTERS)}
                  className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                >
                  <FilterX className="h-4 w-4 shrink-0" />
                  <span>Limpar filtros</span>
                </button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <FilterField label="Empresa">
                <StringSingleSelectDropdown
                  value={filters.empresa}
                  onChange={setFilter('empresa')}
                  options={options.empresas}
                  placeholder="Todas"
                  emptyOptionLabel="Todas"
                  matchTriggerWidth
                />
              </FilterField>
              <FilterField label="Contrato">
                <StringSingleSelectDropdown
                  value={filters.contrato}
                  onChange={setFilter('contrato')}
                  options={options.contratos}
                  placeholder="Todos"
                  emptyOptionLabel="Todos"
                  matchTriggerWidth
                />
              </FilterField>
              <FilterField label="Polo">
                <StringSingleSelectDropdown
                  value={filters.polo}
                  onChange={setFilter('polo')}
                  options={options.polos}
                  placeholder="Todos"
                  emptyOptionLabel="Todos"
                  matchTriggerWidth
                />
              </FilterField>
              <FilterField label="Objeto">
                <StringSingleSelectDropdown
                  value={filters.objeto}
                  onChange={setFilter('objeto')}
                  options={options.objetos}
                  placeholder="Todos"
                  emptyOptionLabel="Todos"
                  matchTriggerWidth
                />
              </FilterField>
              <FilterField label="Ano de abertura">
                <StringSingleSelectDropdown
                  value={filters.ano}
                  onChange={setFilter('ano')}
                  options={options.anos}
                  placeholder="Todos"
                  emptyOptionLabel="Todos"
                  disableSearch
                  matchTriggerWidth
                />
              </FilterField>
              <FilterField label="Mês de abertura">
                <StringSingleSelectDropdown
                  value={filters.mes}
                  onChange={setFilter('mes')}
                  options={MESES_LONGOS.map((label, index) => ({
                    value: String(index + 1),
                    label,
                  }))}
                  placeholder="Todos"
                  emptyOptionLabel="Todos"
                  disableSearch
                  matchTriggerWidth
                />
              </FilterField>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'empresa' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard
            icon={Briefcase}
            title="Índice de processos por empresa"
            subtitle="Quantidade de processos"
          >
            <RankBarChart
              data={rankBuckets(empresas, (b) => b.processos, 8)}
              color={SERIES.processos}
              formatValue={formatCount}
              icon={Briefcase}
              emptyHint="Ajuste os filtros para ver os processos"
            />
          </ChartCard>

          <ChartCard
            icon={FileCheck2}
            title="Índice de acordos fechados por empresa"
            subtitle="Quantidade de acordos"
          >
            <RankBarChart
              data={rankBuckets(empresas, (b) => b.acordos, 8)}
              color={SERIES.acordosQtd}
              formatValue={formatCount}
              icon={FileCheck2}
              emptyHint="Nenhum acordo fechado no filtro atual"
            />
          </ChartCard>

          <ChartCard icon={Scale} title="Total causa por empresa" subtitle="Valor da causa">
            <RankBarChart
              data={rankBuckets(empresas, (b) => b.valorCausa, 8)}
              color={SERIES.causa}
              formatValue={formatCompactBRL}
              icon={Scale}
              emptyHint="Sem valores de causa no filtro atual"
            />
          </ChartCard>

          <ChartCard icon={Gavel} title="Total sentença por empresa" subtitle="Valor de sentença">
            <RankBarChart
              data={rankBuckets(empresas, (b) => b.valorSentenca, 8)}
              color={SERIES.sentenca}
              formatValue={formatCompactBRL}
              icon={Gavel}
              emptyHint="Sem valores de sentença no filtro atual"
            />
          </ChartCard>

          <ChartCard icon={Coins} title="Total acordado por empresa" subtitle="Valor de acordo">
            <RankBarChart
              data={rankBuckets(empresas, (b) => b.valorAcordo, 8)}
              color={SERIES.acordoValor}
              formatValue={formatCompactBRL}
              icon={Coins}
              emptyHint="Sem valores de acordo no filtro atual"
            />
          </ChartCard>

          <ChartCard icon={TrendingUp} title="Total RO por empresa" subtitle="Recurso ordinário">
            <RankBarChart
              data={rankBuckets(empresas, (b) => b.valorRO, 8)}
              color={SERIES.ro}
              formatValue={formatCompactBRL}
              icon={TrendingUp}
              emptyHint="Sem valores de RO no filtro atual"
            />
          </ChartCard>

          <ChartCard
            icon={Landmark}
            title="% RO por empresa"
            subtitle="Participação de cada empresa no valor total de RO"
            className="lg:col-span-2"
          >
            <DonutChart
              data={rankBuckets(empresas, (b) => b.valorRO, 8)}
              formatValue={formatCompactBRL}
              icon={Landmark}
              emptyHint="Sem valores de RO no filtro atual"
            />
          </ChartCard>
        </div>
      ) : null}

      {tab === 'contrato' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard
            icon={ScrollText}
            title="Contratos com mais processos"
            subtitle="Top 8 por quantidade de processos"
          >
            <RankBarChart
              data={rankBuckets(contratos, (b) => b.processos, 8)}
              color={SERIES.processos}
              formatValue={formatCount}
              icon={ScrollText}
              emptyHint="Ajuste os filtros para ver os contratos"
            />
          </ChartCard>

          <ChartCard
            icon={FileCheck2}
            title="Acordos fechados por contrato"
            subtitle="Quantidade de acordos"
          >
            <RankBarChart
              data={rankBuckets(contratos, (b) => b.acordos, 8)}
              color={SERIES.acordosQtd}
              formatValue={formatCount}
              icon={FileCheck2}
              emptyHint="Nenhum acordo fechado no filtro atual"
            />
          </ChartCard>

          <ChartCard icon={Coins} title="Total acordado por contrato" subtitle="Valor de acordo">
            <RankBarChart
              data={rankBuckets(contratos, (b) => b.valorAcordo, 8)}
              color={SERIES.acordoValor}
              formatValue={formatCompactBRL}
              icon={Coins}
              emptyHint="Sem valores de acordo no filtro atual"
            />
          </ChartCard>

          <ChartCard icon={TrendingUp} title="Total RO por contrato" subtitle="Recurso ordinário">
            <RankBarChart
              data={rankBuckets(contratos, (b) => b.valorRO, 8)}
              color={SERIES.ro}
              formatValue={formatCompactBRL}
              icon={TrendingUp}
              emptyHint="Sem valores de RO no filtro atual"
            />
          </ChartCard>

          <ChartCard
            icon={ListFilter}
            title="Índice de objetos"
            subtitle="Quantas vezes cada objeto aparece nos processos"
          >
            <RankingList
              data={objetos}
              icon={ListFilter}
              emptyHint="Os processos filtrados não têm objetos cadastrados"
            />
          </ChartCard>

          <ChartCard
            icon={ScrollText}
            title="Índice de objetos por contrato"
            subtitle="Objetos mais recorrentes nos contratos com mais processos"
          >
            {objetosPorContrato.length === 0 ? (
              <ChartEmpty
                icon={ScrollText}
                hint="Os processos filtrados não têm objetos cadastrados"
              />
            ) : (
              <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {objetosPorContrato.map((group) => (
                  <div
                    key={group.key}
                    className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span
                        className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200"
                        title={group.contrato}
                      >
                        {group.contrato}
                      </span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-red-600 dark:text-red-400">
                        {formatCount(group.total)}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {group.objetos.map((objeto) => (
                        <li
                          key={objeto.key}
                          className="flex items-baseline justify-between gap-3 text-xs text-gray-600 dark:text-gray-400"
                        >
                          <span className="min-w-0 truncate" title={objeto.label}>
                            {objeto.label}
                          </span>
                          <span className="shrink-0 font-medium tabular-nums text-gray-800 dark:text-gray-200">
                            {formatCount(objeto.value)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </div>
      ) : null}

      {tab === 'acordos' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard
            icon={Coins}
            title="Acordos fechados por mês/ano"
            subtitle="Quantidade pela data do acordo"
            className="lg:col-span-2"
          >
            {acordosMes.length === 0 ? (
              <ChartEmpty icon={Coins} hint="Nenhum acordo com data no filtro atual" />
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={acordosMes} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: theme.chartTick, fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: theme.chartGrid }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      allowDecimals={false}
                      width={32}
                      tick={{ fill: theme.chartTick, fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={theme.tipStyle}
                      labelStyle={theme.tipLabelStyle}
                      itemStyle={theme.tipItemStyle}
                      formatter={(value: number) => [formatCount(value), 'Acordos']}
                      labelFormatter={(label: string) => {
                        const mes = acordosMes.find((item) => item.label === label);
                        return mes && mes.valor > 0
                          ? `${label} · ${formatFullBRL(mes.valor)}`
                          : String(label);
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="quantidade"
                      stroke={SERIES.acordosQtd}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: SERIES.acordosQtd, strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      animationDuration={650}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <ChartCard
            icon={FileCheck2}
            title="Acordos fechados por contrato"
            subtitle="Distribuição da quantidade de acordos"
          >
            <DonutChart
              data={rankBuckets(contratos, (b) => b.acordos, 8)}
              formatValue={formatCount}
              icon={FileCheck2}
              emptyHint="Nenhum acordo fechado no filtro atual"
            />
          </ChartCard>

          <ChartCard
            icon={Coins}
            title="Valor de acordos por contrato"
            subtitle="Soma dos valores acordados"
          >
            <RankBarChart
              data={rankBuckets(contratos, (b) => b.valorAcordo, 8)}
              color={SERIES.acordoValor}
              formatValue={formatCompactBRL}
              icon={Coins}
              emptyHint="Sem valores de acordo no filtro atual"
            />
          </ChartCard>

          <ChartCard
            icon={Users}
            title="Acordos por reclamante"
            subtitle={`${acordosReclamantes.length} acordo(s) no filtro atual`}
            className="lg:col-span-2"
          >
            {acordosReclamantes.length === 0 ? (
              <ChartEmpty icon={Users} hint="Nenhum acordo fechado no filtro atual" />
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead className="sticky top-0 z-10 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                    <tr>
                      <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Reclamante
                      </th>
                      <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Contrato
                      </th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Empresa
                      </th>
                      <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Data
                      </th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Valor
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {acordosReclamantes.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                        <td
                          className="max-w-[240px] truncate px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100"
                          title={item.reclamante}
                        >
                          {item.reclamante}
                        </td>
                        <td
                          className="max-w-[220px] truncate px-3 py-2 text-sm text-gray-600 dark:text-gray-400"
                          title={item.contrato}
                        >
                          {item.contrato}
                        </td>
                        <td className="px-3 py-2 text-center text-sm text-gray-600 dark:text-gray-400">
                          {item.empresa}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center text-sm text-gray-600 dark:text-gray-400">
                          {item.data}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                          {item.valor > 0 ? formatFullBRL(item.valor) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>
        </div>
      ) : null}
    </div>
  );
}
