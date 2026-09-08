import type { ExtratoCaixaItem } from './extratoCaixaTypes';
import {
  buildExtratoFluxoMensalPeriodoSeries,
  buildExtratoFluxoMensalSeries,
  formatExtratoFluxoMensalTooltipLabel,
  type ExtratoFluxoMensalPoint
} from './extratoFluxoMensal';

/** Meses iniciais da série histórica ignorados no cálculo da média. */
const EXCLUDE_FIRST_MONTHS = 3;
/** Janela da média móvel ponderada (pesos 1 … 6). */
const WEIGHT_WINDOW = 6;

export type ExtratoFluxoProjecaoPoint = {
  monthKey: string;
  label: string;
  entrada: number;
  saida: number;
  valor: number;
  projetado: boolean;
};

export type ExtratoFluxoProjecaoMeta = {
  avgEntrada: number;
  avgSaida: number;
  mesesNaMedia: number;
  mesesElegiveis: number;
  projectionYear: number;
};

export type ExtratoFluxoProjecaoSeries = {
  points: ExtratoFluxoProjecaoPoint[];
  meta: ExtratoFluxoProjecaoMeta | null;
};

function formatMonthChartLabel(monthKey: string): string {
  const month = monthKey.slice(5, 7);
  const year = monthKey.slice(2, 4);
  return `${month}/${year}`;
}

function inferProjectionYear(periodSeries: readonly ExtratoFluxoMensalPoint[]): number {
  let maxYear = new Date().getFullYear();
  for (const row of periodSeries) {
    const year = Number(row.monthKey.slice(0, 4));
    if (Number.isFinite(year) && year > maxYear) maxYear = year;
  }
  return maxYear;
}

function monthKeysThroughDecember(year: number): string[] {
  const keys: string[] = [];
  for (let m = 1; m <= 12; m += 1) {
    keys.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return keys;
}

/**
 * Média móvel ponderada dos últimos 6 meses elegíveis.
 * Desconsidera os 3 primeiros meses da série histórica.
 * Peso do mês mais antigo da janela = 1; o mais recente = 6.
 */
function computeWeightedMonthlyAverages(
  periodSeries: readonly ExtratoFluxoMensalPoint[]
): { avgEntrada: number; avgSaida: number; mesesNaMedia: number; mesesElegiveis: number } | null {
  const sorted = [...periodSeries].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const eligible = sorted.slice(EXCLUDE_FIRST_MONTHS);
  if (eligible.length === 0) return null;

  const window = eligible.slice(-WEIGHT_WINDOW);
  const n = window.length;

  let weightedEntrada = 0;
  let weightedSaida = 0;
  let weightSum = 0;

  for (let i = 0; i < n; i += 1) {
    const weight = 7 - n + i;
    weightedEntrada += window[i]!.entrada * weight;
    weightedSaida += window[i]!.saida * weight;
    weightSum += weight;
  }

  return {
    avgEntrada: weightedEntrada / weightSum,
    avgSaida: weightedSaida / weightSum,
    mesesNaMedia: n,
    mesesElegiveis: eligible.length
  };
}

export function buildExtratoFluxoProjecaoAnualSeries(
  items: readonly ExtratoCaixaItem[]
): ExtratoFluxoProjecaoSeries {
  if (items.length === 0) {
    return { points: [], meta: null };
  }

  const periodSeries = buildExtratoFluxoMensalPeriodoSeries(items);
  if (periodSeries.length === 0) {
    return { points: [], meta: null };
  }

  const averages = computeWeightedMonthlyAverages(periodSeries);
  if (!averages) {
    return { points: [], meta: null };
  }

  const cumulativeSeries = buildExtratoFluxoMensalSeries(items);
  const cumulativeByMonth = new Map(
    cumulativeSeries.map((row) => [row.monthKey, row])
  );

  const periodByMonth = new Map(periodSeries.map((row) => [row.monthKey, row]));

  const projectionYear = inferProjectionYear(periodSeries);
  const yearMonthKeys = monthKeysThroughDecember(projectionYear);

  const lastActualInYear = Array.from(periodByMonth.keys())
    .filter((key) => key.startsWith(`${projectionYear}-`))
    .sort()
    .at(-1);

  if (!lastActualInYear) {
    return { points: [], meta: null };
  }

  const lastActualCumulative = cumulativeByMonth.get(lastActualInYear);
  if (!lastActualCumulative) {
    return { points: [], meta: null };
  }

  const points: ExtratoFluxoProjecaoPoint[] = [];
  let projEntrada = lastActualCumulative.entrada;
  let projSaida = lastActualCumulative.saida;
  let projValor = lastActualCumulative.valor;
  let projecting = false;

  for (const monthKey of yearMonthKeys) {
    const actualCumulative = cumulativeByMonth.get(monthKey);
    const hasPeriod = periodByMonth.has(monthKey);

    if (hasPeriod && actualCumulative && !projecting) {
      points.push({
        monthKey,
        label: formatMonthChartLabel(monthKey),
        entrada: actualCumulative.entrada,
        saida: actualCumulative.saida,
        valor: actualCumulative.valor,
        projetado: false
      });
      projEntrada = actualCumulative.entrada;
      projSaida = actualCumulative.saida;
      projValor = actualCumulative.valor;

      if (monthKey === lastActualInYear) {
        projecting = true;
      }
      continue;
    }

    if (!projecting) continue;

    projEntrada += averages.avgEntrada;
    projSaida += averages.avgSaida;
    projValor += averages.avgEntrada - averages.avgSaida;

    points.push({
      monthKey,
      label: formatMonthChartLabel(monthKey),
      entrada: projEntrada,
      saida: projSaida,
      valor: projValor,
      projetado: true
    });
  }

  if (points.length === 0 || !points.some((p) => p.projetado)) {
    return { points: [], meta: null };
  }

  return {
    points,
    meta: {
      avgEntrada: averages.avgEntrada,
      avgSaida: averages.avgSaida,
      mesesNaMedia: averages.mesesNaMedia,
      mesesElegiveis: averages.mesesElegiveis,
      projectionYear
    }
  };
}

export { formatExtratoFluxoMensalTooltipLabel };
