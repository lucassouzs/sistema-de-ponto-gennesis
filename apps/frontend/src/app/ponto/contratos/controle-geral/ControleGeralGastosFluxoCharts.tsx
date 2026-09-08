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
import {
  formatExtratoFluxoAxisValue,
  formatExtratoFluxoCurrency
} from '../../financeiro/analise-extrato/extratoFluxoDiario';
import {
  buildControleGeralFluxoMensalPeriodoSeries,
  buildControleGeralFluxoMensalSeries,
  buildControleGeralFluxoProjecaoAnualSeries,
  formatControleGeralFluxoMensalTooltipLabel,
  type ControleGeralFluxoBuildInput,
  type ControleGeralFluxoPoint
} from './controleGeralGastosFluxo';

function seriesLabel(mode: 'acumulado' | 'periodo', kind: 'entrada' | 'saida' | 'valor'): string {
  const suffix = mode === 'acumulado' ? 'acumulado' : 'mês';
  if (kind === 'entrada') return `Recebidos (${suffix})`;
  if (kind === 'saida') return `Gastos (${suffix})`;
  return `Lucro líquido (${suffix})`;
}

function GastosFluxoMensalChart({
  input,
  mode = 'acumulado',
  title,
  titleSuffix
}: {
  input: ControleGeralFluxoBuildInput;
  mode?: 'acumulado' | 'periodo';
  title?: string;
  titleSuffix?: string;
}) {
  const resolvedTitle =
    title ??
    (mode === 'acumulado' ? 'Evolução Mensal (Acumulado)' : 'Evolução mensal — por mês');
  const suffix = titleSuffix ? ` — ${titleSuffix}` : '';
  const resolvedSubtitle =
    mode === 'acumulado'
      ? 'Recebidos, gastos e lucro líquido acumulados mês a mês.'
      : 'Recebidos, gastos e lucro líquido de cada mês de apuração.';

  const series = useMemo(
    () =>
      mode === 'acumulado'
        ? buildControleGeralFluxoMensalSeries(input)
        : buildControleGeralFluxoMensalPeriodoSeries(input),
    [input, mode]
  );

  if (series.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center dark:border-gray-700 dark:bg-gray-900/30">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Sem dados no período para exibir o gráfico.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white px-3 py-4 dark:border-gray-700 dark:bg-gray-900/20 sm:px-4">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {resolvedTitle}
          {suffix}
        </h4>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{resolvedSubtitle}</p>
      </div>

      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series as ControleGeralFluxoPoint[]}
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
              formatter={(value: number, name: string) => {
                const kind = name === 'entrada' ? 'entrada' : name === 'saida' ? 'saida' : 'valor';
                return [formatExtratoFluxoCurrency(value), seriesLabel(mode, kind)];
              }}
              labelFormatter={(_, payload) => {
                const monthKey = payload?.[0]?.payload?.monthKey as string | undefined;
                if (!monthKey) return '';
                return formatControleGeralFluxoMensalTooltipLabel(monthKey);
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

type ProjecaoChartRow = {
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

function GastosFluxoProjecaoAnualChart({
  input,
  title = 'Projeção anual',
  titleSuffix
}: {
  input: ControleGeralFluxoBuildInput;
  title?: string;
  titleSuffix?: string;
}) {
  const suffix = titleSuffix ? ` — ${titleSuffix}` : '';
  const { points, meta } = useMemo(
    () => buildControleGeralFluxoProjecaoAnualSeries(input),
    [input]
  );

  const chartData = useMemo((): ProjecaoChartRow[] => {
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

  if (points.length === 0 || !meta) {
    return (
      <div className="mb-4 rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center dark:border-gray-700 dark:bg-gray-900/30">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Sem dados suficientes para projetar o restante do ano.
        </p>
      </div>
    );
  }

  const hasProjected = points.some((point) => point.projetado);

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white px-3 py-4 dark:border-gray-700 dark:bg-gray-900/20 sm:px-4">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {title}
          {suffix}
        </h4>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Lucro líquido acumulado real + projeção até dez/{String(meta.projectionYear).slice(2)}.
          Média móvel ponderada dos últimos {meta.mesesNaMedia} mês(es) (pesos 1–6), desconsiderando
          os 3 primeiros meses da série ({meta.mesesElegiveis} mês(es) elegíveis).
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Incremento mensal projetado — recebidos: {formatExtratoFluxoCurrency(meta.avgEntrada)} ·
          gastos: {formatExtratoFluxoCurrency(meta.avgSaida)} · lucro:{' '}
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
              formatter={(value: number, name: string) => {
                const projetado = name.endsWith('Proj');
                const label = name.startsWith('entrada')
                  ? 'Recebidos (acum.)'
                  : name.startsWith('saida')
                    ? 'Gastos (acum.)'
                    : 'Lucro líquido (acum.)';
                return [
                  formatExtratoFluxoCurrency(value),
                  projetado ? `${label} (projetado)` : label
                ];
              }}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as ProjecaoChartRow | undefined;
                if (!row?.monthKey) return '';
                const label = formatControleGeralFluxoMensalTooltipLabel(row.monthKey);
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
                  ? 'Recebidos (acum.)'
                  : value === 'saidaReal'
                    ? 'Gastos (acum.)'
                    : value === 'valorReal'
                      ? 'Lucro líquido (acum.)'
                      : value === 'entradaProj'
                        ? 'Recebidos (projetado)'
                        : value === 'saidaProj'
                          ? 'Gastos (projetado)'
                          : 'Lucro líquido (projetado)'
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

type ControleGeralGastosFluxoChartsProps = {
  input: ControleGeralFluxoBuildInput;
  titleSuffix?: string;
};

export function ControleGeralGastosFluxoCharts({
  input,
  titleSuffix
}: ControleGeralGastosFluxoChartsProps) {
  return (
    <>
      <GastosFluxoMensalChart input={input} titleSuffix={titleSuffix} />
      <GastosFluxoMensalChart input={input} mode="periodo" titleSuffix={titleSuffix} />
      <GastosFluxoProjecaoAnualChart input={input} titleSuffix={titleSuffix} />
    </>
  );
}
