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
  buildExtratoFluxoProjecaoAnualSeries,
  formatExtratoFluxoMensalTooltipLabel
} from './extratoFluxoProjecao';

type ChartRow = {
  monthKey: string;
  label: string;
  projetado: boolean;
  entradaReal: number | null;
  saidaReal: number | null;
  valorReal: number | null;
  entradaProj: number | null;
  saidaProj: number | null;
  valorProj: number | null;
};

type ExtratoFluxoProjecaoAnualChartProps = {
  items: readonly ExtratoCaixaItem[];
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
};

function chartTooltipFormatter(value: number, name: string) {
  const label =
    name.startsWith('entrada')
      ? 'Entradas (acum.)'
      : name.startsWith('saida')
        ? 'Saídas (acum.)'
        : 'Valor (acum.)';
  const projetado = name.endsWith('Proj');
  return [formatExtratoFluxoCurrency(value), projetado ? `${label} (projetado)` : label];
}

export function ExtratoFluxoProjecaoAnualChart({
  items,
  title = 'Projeção anual',
  subtitle,
  emptyMessage = 'Sem dados suficientes para projetar o restante do ano.'
}: ExtratoFluxoProjecaoAnualChartProps) {
  const { points, meta } = useMemo(
    () => buildExtratoFluxoProjecaoAnualSeries(items),
    [items]
  );

  const chartData = useMemo((): ChartRow[] => {
    return points.map((point, index) => {
      const nextProjected = points[index + 1]?.projetado === true;
      const isBridge = !point.projetado && nextProjected;

      return {
        monthKey: point.monthKey,
        label: point.label,
        projetado: point.projetado,
        entradaReal: point.projetado ? null : point.entrada,
        saidaReal: point.projetado ? null : point.saida,
        valorReal: point.projetado ? null : point.valor,
        entradaProj: point.projetado || isBridge ? point.entrada : null,
        saidaProj: point.projetado || isBridge ? point.saida : null,
        valorProj: point.projetado || isBridge ? point.valor : null
      };
    });
  }, [points]);

  const resolvedSubtitle =
    subtitle ??
    (meta
      ? `Acumulado real + projeção até dez/${String(meta.projectionYear).slice(2)}. Média móvel ponderada dos últimos ${meta.mesesNaMedia} mês(es) (pesos 1–6), desconsiderando os 3 primeiros meses da série (${meta.mesesElegiveis} mês(es) elegíveis).`
      : 'Projeção acumulada até o final do ano.');

  if (points.length === 0 || !meta) {
    return (
      <div className="mb-4 rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center dark:border-gray-700 dark:bg-gray-900/30">
        <p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  const hasProjected = points.some((point) => point.projetado);

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white px-3 py-4 dark:border-gray-700 dark:bg-gray-900/20 sm:px-4">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
        {resolvedSubtitle ? (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{resolvedSubtitle}</p>
        ) : null}
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Incremento mensal projetado — entradas: {formatExtratoFluxoCurrency(meta.avgEntrada)} ·
          saídas: {formatExtratoFluxoCurrency(meta.avgSaida)} · valor:{' '}
          {formatExtratoFluxoCurrency(meta.avgEntrada - meta.avgSaida)}
        </p>
      </div>

      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
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
              formatter={(value: number, name: string) => chartTooltipFormatter(value, name)}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as ChartRow | undefined;
                if (!row?.monthKey) return '';
                const label = formatExtratoFluxoMensalTooltipLabel(row.monthKey);
                return row.projetado ? `${label} (projetado)` : label;
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
                value === 'entradaReal'
                  ? 'Entradas (acum.)'
                  : value === 'saidaReal'
                    ? 'Saídas (acum.)'
                    : value === 'valorReal'
                      ? 'Valor (acum.)'
                      : value === 'entradaProj'
                        ? 'Entradas (projetado)'
                        : value === 'saidaProj'
                          ? 'Saídas (projetado)'
                          : 'Valor (projetado)'
              }
            />
            <Line
              type="monotone"
              dataKey="entradaReal"
              name="entradaReal"
              stroke="#16a34a"
              strokeWidth={2}
              dot={chartData.length <= 24}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="saidaReal"
              name="saidaReal"
              stroke="#dc2626"
              strokeWidth={2}
              dot={chartData.length <= 24}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="valorReal"
              name="valorReal"
              stroke="#2563eb"
              strokeWidth={2}
              dot={chartData.length <= 24}
              activeDot={{ r: 4 }}
              connectNulls={false}
            />
            {hasProjected ? (
              <>
                <Line
                  type="monotone"
                  dataKey="entradaProj"
                  name="entradaProj"
                  stroke="#16a34a"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="saidaProj"
                  name="saidaProj"
                  stroke="#dc2626"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="valorProj"
                  name="valorProj"
                  stroke="#2563eb"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls
                />
              </>
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
