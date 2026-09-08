'use client';

import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { ExtratoCaixaItem } from './extratoCaixaTypes';
import {
  formatExtratoFluxoAxisValue,
  formatExtratoFluxoCurrency
} from './extratoFluxoDiario';
import {
  buildExtratoFluxoMensalPeriodoSeries,
  buildExtratoFluxoMensalSeries,
  formatExtratoFluxoMensalTooltipLabel,
  type ExtratoFluxoMensalPoint
} from './extratoFluxoMensal';

export type ExtratoFluxoMensalChartMode = 'acumulado' | 'periodo';

type ExtratoFluxoMensalChartProps = {
  items: readonly ExtratoCaixaItem[];
  mode?: ExtratoFluxoMensalChartMode;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
};

function seriesLabel(mode: ExtratoFluxoMensalChartMode, kind: 'entrada' | 'saida' | 'valor'): string {
  const suffix = mode === 'acumulado' ? 'acumulado' : 'mês';
  if (kind === 'entrada') return `Entradas (${suffix})`;
  if (kind === 'saida') return `Saídas (${suffix})`;
  return `Valor (${suffix})`;
}

export function ExtratoFluxoMensalChart({
  items,
  mode = 'acumulado',
  title,
  subtitle,
  emptyMessage = 'Sem movimentações no período para exibir o gráfico.'
}: ExtratoFluxoMensalChartProps) {
  const resolvedTitle =
    title ?? (mode === 'acumulado' ? 'Evolução Mensal (Acumulado)' : 'Evolução mensal — por mês');
  const resolvedSubtitle =
    subtitle ??
    (mode === 'acumulado'
      ? 'Entradas, saídas e saldo líquido acumulados mês a mês.'
      : 'Entradas, saídas e saldo líquido de cada mês de compensação.');

  const series = useMemo(
    () =>
      mode === 'acumulado'
        ? buildExtratoFluxoMensalSeries(items)
        : buildExtratoFluxoMensalPeriodoSeries(items),
    [items, mode]
  );

  const tooltipFormatter = (value: number, name: string) => {
    const kind = name === 'entrada' ? 'entrada' : name === 'saida' ? 'saida' : 'valor';
    return [formatExtratoFluxoCurrency(value), seriesLabel(mode, kind)];
  };

  if (series.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center dark:border-gray-700 dark:bg-gray-900/30">
        <p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white px-3 py-4 dark:border-gray-700 dark:bg-gray-900/20 sm:px-4">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{resolvedTitle}</h4>
        {resolvedSubtitle ? (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{resolvedSubtitle}</p>
        ) : null}
      </div>

      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series as ExtratoFluxoMensalPoint[]}
            margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-gray-500 dark:text-gray-400"
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-gray-500 dark:text-gray-400"
              tickFormatter={formatExtratoFluxoAxisValue}
              width={52}
            />
            <Tooltip
              formatter={tooltipFormatter}
              labelFormatter={(_, payload) => {
                const monthKey = payload?.[0]?.payload?.monthKey as string | undefined;
                if (!monthKey) return '';
                return formatExtratoFluxoMensalTooltipLabel(monthKey);
              }}
              contentStyle={{
                borderRadius: 8,
                fontSize: 12,
                border: '1px solid #e5e7eb',
                backgroundColor: 'rgba(255,255,255,0.96)'
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value) =>
                seriesLabel(
                  mode,
                  value === 'entrada' ? 'entrada' : value === 'saida' ? 'saida' : 'valor'
                )
              }
            />
            <Line
              type="monotone"
              dataKey="entrada"
              name="entrada"
              stroke="#16a34a"
              strokeWidth={2}
              dot={series.length <= 24}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="saida"
              name="saida"
              stroke="#dc2626"
              strokeWidth={2}
              dot={series.length <= 24}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="valor"
              name="valor"
              stroke="#2563eb"
              strokeWidth={2}
              dot={series.length <= 24}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
