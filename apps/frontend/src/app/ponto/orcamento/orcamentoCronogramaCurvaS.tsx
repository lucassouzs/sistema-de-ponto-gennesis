'use client';

import React, { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  calcularCurvaSCronograma,
  type CronogramaCurvaSPonto
} from './orcamentoCronogramaCalc';
import { formatDataIso, parseDataIso, type CronogramaLinhaServico, type CronogramaPersist } from './orcamentoCronogramaTypes';

type Props = {
  linhas: CronogramaLinhaServico[];
  cronograma: CronogramaPersist;
  dataInicioObra?: string;
  dataFimObra?: string;
  hoje?: Date;
};

function tooltipFormatter(value: number, name: string) {
  const label = name === 'planPct' ? 'Planejado' : 'Real';
  return [`${value.toFixed(1).replace('.', ',')}%`, label];
}

export function CronogramaCurvaSPanel({
  linhas,
  cronograma,
  dataInicioObra,
  dataFimObra,
  hoje = new Date()
}: Props) {
  const pontos = useMemo(
    () => calcularCurvaSCronograma(linhas, cronograma, dataInicioObra, dataFimObra),
    [linhas, cronograma, dataInicioObra, dataFimObra]
  );

  const hojeIso = formatDataIso(hoje);
  const pontoHoje =
    pontos.find((p) => p.dataIso === hojeIso) ??
    pontos.find((p) => p.dataIso > hojeIso) ??
    [...pontos].reverse().find((p) => p.dataIso <= hojeIso);
  const ultimoReal = pontos.length > 0 ? pontos[pontos.length - 1].realPct : 0;
  const ultimoPlan = pontos.length > 0 ? pontos[pontos.length - 1].planPct : 0;
  const primeiroIso = pontos[0]?.dataIso;
  const ultimoIso = pontos[pontos.length - 1]?.dataIso;
  const hojeNoIntervalo = Boolean(
    primeiroIso && ultimoIso && hojeIso >= primeiroIso && hojeIso <= ultimoIso
  );

  if (pontos.length < 2) {
    return (
      <div className="border-t border-gray-200/80 px-4 py-4 dark:border-gray-700/80 sm:px-5">
        <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Curva S — avanço físico</h4>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Defina o prazo da obra e as datas plan/real das etapas para exibir a curva acumulada.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200/80 px-4 py-4 dark:border-gray-700/80 sm:px-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Curva S — avanço físico acumulado</h4>
          <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
            % ponderado pelo valor das etapas · planejado (tracejado) vs real (sólido)
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] tabular-nums text-gray-600 dark:text-gray-400">
          <span>
            Plan. atual:{' '}
            <strong className="font-semibold text-gray-800 dark:text-gray-200">
              {ultimoPlan.toFixed(1).replace('.', ',')}%
            </strong>
          </span>
          <span>
            Real atual:{' '}
            <strong className="font-semibold text-sky-600 dark:text-sky-400">
              {ultimoReal.toFixed(1).replace('.', ',')}%
            </strong>
          </span>
        </div>
      </div>

      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pontos as CronogramaCurvaSPonto[]} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-gray-500 dark:text-gray-400"
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-gray-500 dark:text-gray-400"
              tickFormatter={(v) => `${v}%`}
              width={36}
            />
            <Tooltip
              formatter={tooltipFormatter}
              labelFormatter={(_, payload) => {
                const iso = payload?.[0]?.payload?.dataIso as string | undefined;
                const d = iso ? parseDataIso(iso) : null;
                return d
                  ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                  : '';
              }}
              contentStyle={{
                borderRadius: 8,
                fontSize: 12,
                border: '1px solid var(--tooltip-border, #e5e7eb)',
                backgroundColor: 'var(--tooltip-bg, rgba(255,255,255,0.96))'
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value) => (value === 'planPct' ? 'Planejado' : 'Real')}
            />
            {hojeNoIntervalo && pontoHoje ? (
              <ReferenceLine
                x={pontoHoje.label}
                stroke="#ef4444"
                strokeDasharray="4 4"
                label={{ value: 'Hoje', position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="planPct"
              name="planPct"
              stroke="#9ca3af"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="realPct"
              name="realPct"
              stroke="#0ea5e9"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
