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
  buildExtratoFluxoDiarioSeries,
  formatExtratoFluxoAxisValue,
  formatExtratoFluxoCurrency,
  type ExtratoFluxoDiarioPoint
} from './extratoFluxoDiario';

type ExtratoFluxoDiarioChartProps = {
  items: readonly ExtratoCaixaItem[];
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
};

function chartTooltipFormatter(value: number, name: string) {
  const label =
    name === 'entrada'
      ? 'Entradas (acumulado)'
      : name === 'saida'
        ? 'Saídas (acumulado)'
        : 'Valor (acumulado)';
  return [formatExtratoFluxoCurrency(value), label];
}

export function ExtratoFluxoDiarioChart({
  items,
  title = 'Evolução diária',
  subtitle = 'Entradas, saídas e saldo líquido acumulados dia a dia.',
  emptyMessage = 'Sem movimentações no período para exibir o gráfico.'
}: ExtratoFluxoDiarioChartProps) {
  const series = useMemo(() => buildExtratoFluxoDiarioSeries(items), [items]);

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
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        ) : null}
      </div>

      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series as ExtratoFluxoDiarioPoint[]}
            margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-gray-500 dark:text-gray-400"
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-gray-500 dark:text-gray-400"
              tickFormatter={formatExtratoFluxoAxisValue}
              width={52}
            />
            <Tooltip
              formatter={chartTooltipFormatter}
              labelFormatter={(_, payload) => {
                const dayKey = payload?.[0]?.payload?.dayKey as string | undefined;
                if (!dayKey) return '';
                const [y, m, d] = dayKey.split('-');
                return `${d}/${m}/${y}`;
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
                value === 'entrada'
                  ? 'Entradas (acumulado)'
                  : value === 'saida'
                    ? 'Saídas (acumulado)'
                    : 'Valor (acumulado)'
              }
            />
            <Line
              type="monotone"
              dataKey="entrada"
              name="entrada"
              stroke="#16a34a"
              strokeWidth={2}
              dot={series.length <= 31}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="saida"
              name="saida"
              stroke="#dc2626"
              strokeWidth={2}
              dot={series.length <= 31}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="valor"
              name="valor"
              stroke="#2563eb"
              strokeWidth={2}
              dot={series.length <= 31}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
