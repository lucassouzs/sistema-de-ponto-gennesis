import type { QueryGastosDetailRow, QueryGastosNaturezaDetailRow } from './buildQueryGastosRows';
import type { RecebidoMensalByGastosContractEntry } from './recebidoMensalTypes';
import {
  normalizeContractOrderKey,
  normalizeGastosOperacionaisContractName,
  getGastosContractAggregateKey
} from './gastosOperacionaisContractOrder';
import { gastosNaturezaTotalContribution } from './gastosOperacionaisAllowedNaturezas';

export type ControleGeralFluxoPoint = {
  monthKey: string;
  label: string;
  entrada: number;
  saida: number;
  valor: number;
};

export type ControleGeralFluxoProjecaoPoint = ControleGeralFluxoPoint & {
  projetado: boolean;
};

export type ControleGeralFluxoProjecaoMeta = {
  avgEntrada: number;
  avgSaida: number;
  mesesNaMedia: number;
  mesesElegiveis: number;
  projectionYear: number;
};

export type ControleGeralFluxoProjecaoSeries = {
  points: ControleGeralFluxoProjecaoPoint[];
  meta: ControleGeralFluxoProjecaoMeta | null;
};

export type ControleGeralFluxoBuildInput = {
  gastosRows: readonly QueryGastosDetailRow[];
  recebidoMensal?: readonly RecebidoMensalByGastosContractEntry[];
};

/** Totais exibidos na linha da tabela — o modal deve espelhar estes valores. */
export type ControleGeralFluxoRowSnapshot = {
  gastos: number;
  recebido: number;
  lucroLiquido: number;
};

type MonthlyPeriodoRow = {
  monthKey: string;
  label: string;
  entradaMes: number;
  /** Soma assinada DFC do mês (despesa negativa / crédito positivo). */
  gastoSignedMes: number;
  /** Gasto do mês na mesma convenção da tabela: −gastoSigned. */
  saidaMes: number;
  valorMes: number;
};

const EXCLUDE_FIRST_MONTHS = 3;
const WEIGHT_WINDOW = 6;

function contractLookupKey(contract: string): string {
  return getGastosContractAggregateKey(contract);
}

/** Chave alternativa (espelha o backend) para casar nomes de contrato. */
function contractLookupKeyAlt(contract: string): string {
  return normalizeGastosOperacionaisContractName(contract)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function contractsMatch(a: string, b: string): boolean {
  const keyA = contractLookupKey(a);
  const keyB = contractLookupKey(b);
  if (keyA === keyB) return true;
  return contractLookupKeyAlt(a) === contractLookupKeyAlt(b);
}

function monthKeyFromRow(row: QueryGastosDetailRow): string {
  return `${row.year}-${String(row.month).padStart(2, '0')}`;
}

function monthKeyFromRecebido(entry: RecebidoMensalByGastosContractEntry): string {
  return `${entry.year}-${String(entry.month).padStart(2, '0')}`;
}

function formatMonthChartLabel(monthKey: string): string {
  const month = monthKey.slice(5, 7);
  const year = monthKey.slice(2, 4);
  return `${month}/${year}`;
}

export function formatControleGeralFluxoMensalTooltipLabel(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return monthKey;
  }
  const text = new Date(year, month - 1, 1).toLocaleString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function filterGastosDetailRowsForContract(
  detailRows: readonly QueryGastosDetailRow[],
  contract: string,
  filters?: { months?: number[]; years?: number[] }
): QueryGastosDetailRow[] {
  const monthFilter = filters?.months?.length ? new Set(filters.months) : null;
  const yearFilter = filters?.years?.length ? new Set(filters.years) : null;
  // Mesma chave da agregação da tabela (aliases + catálogo).
  const targetKey = contractLookupKey(contract);

  return detailRows.filter((row) => {
    if (contractLookupKey(row.contract) !== targetKey) return false;
    if (monthFilter && !monthFilter.has(row.month)) return false;
    if (yearFilter && !yearFilter.has(row.year)) return false;
    return true;
  });
}

export type SystemContractGastosLookup = {
  name: string;
  costCenter?: { code?: string; name?: string } | null;
};

/** Casamento por nome do contrato e/ou centro de custo (mesma regra do Controle Geral). */
export function filterGastosDetailRowsForSystemContract(
  detailRows: readonly QueryGastosDetailRow[],
  contract: SystemContractGastosLookup,
  filters?: { months?: number[]; years?: number[] }
): QueryGastosDetailRow[] {
  const labels = [
    contract.name,
    contract.costCenter?.name,
    contract.costCenter?.code
  ].filter((label): label is string => Boolean(label?.trim()));

  if (labels.length === 0) return [];

  const merged: QueryGastosDetailRow[] = [];
  const seen = new Set<string>();

  for (const label of labels) {
    for (const row of filterGastosDetailRowsForContract(detailRows, label, filters)) {
      const dedupeKey = `${row.contract}|${row.year}|${row.month}|${row.dateISO ?? ''}|${row.total}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      merged.push(row);
    }
  }

  return merged;
}

export function filterGastosNaturezaDetailRowsForSystemContract(
  detailRows: readonly QueryGastosNaturezaDetailRow[],
  contract: SystemContractGastosLookup,
  filters?: { months?: number[]; years?: number[] }
): QueryGastosNaturezaDetailRow[] {
  const labels = [
    contract.name,
    contract.costCenter?.name,
    contract.costCenter?.code
  ].filter((label): label is string => Boolean(label?.trim()));

  if (labels.length === 0) return [];

  const merged: QueryGastosNaturezaDetailRow[] = [];
  const seen = new Set<string>();

  for (const label of labels) {
    for (const row of filterGastosNaturezaDetailRowsForContract(detailRows, label, filters)) {
      const dedupeKey = `${row.contract}|${row.year}|${row.month}|${row.dateISO ?? ''}|${row.natureza}|${row.total}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      merged.push(row);
    }
  }

  return merged;
}

function filterGastosNaturezaDetailRowsForContract(
  detailRows: readonly QueryGastosNaturezaDetailRow[],
  contract: string,
  filters?: { months?: number[]; years?: number[] }
): QueryGastosNaturezaDetailRow[] {
  const monthFilter = filters?.months?.length ? new Set(filters.months) : null;
  const yearFilter = filters?.years?.length ? new Set(filters.years) : null;

  return detailRows.filter((row) => {
    if (!contractsMatch(row.contract, contract)) return false;
    if (monthFilter && !monthFilter.has(row.month)) return false;
    if (yearFilter && !yearFilter.has(row.year)) return false;
    return true;
  });
}

export function gastosMonthPeriodBounds(
  year: number,
  month: number
): { periodFrom: string; periodTo: string } {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  const dd = String(lastDay).padStart(2, '0');
  return {
    periodFrom: `${year}-${mm}-01`,
    periodTo: `${year}-${mm}-${dd}`
  };
}

export function gastosYearPeriodBounds(year: number): { periodFrom: string; periodTo: string } {
  return {
    periodFrom: `${year}-01-01`,
    periodTo: `${year}-12-31`
  };
}

export function aggregateGastosOperacionaisMonthlyTotals(
  rows: readonly QueryGastosDetailRow[],
  year: number
): number[] {
  const porMes = new Array(12).fill(0);
  for (const row of rows) {
    if (row.year !== year || row.month < 1 || row.month > 12) continue;
    // Totais diários já vêm com contribuição DFC (despesa negativa / crédito positivo).
    // Somar com Math.abs por dia inflava o valor da linha vs. o resumo do modal.
    porMes[row.month - 1] += row.total;
  }
  return porMes;
}

export function aggregateGastosOperacionaisYearlyTotals(
  rows: readonly QueryGastosDetailRow[],
  years: readonly number[]
): Record<number, number> {
  const allowed = new Set(years);
  const porAno: Record<number, number> = {};
  for (const row of rows) {
    if (!allowed.has(row.year)) continue;
    porAno[row.year] = (porAno[row.year] ?? 0) + row.total;
  }
  return porAno;
}

/** Agrega pelo mesmo critério do modal de resumo (naturezas + contribuição DFC no frontend). */
export function aggregateGastosNaturezaMonthlyTotals(
  rows: readonly QueryGastosNaturezaDetailRow[],
  year: number
): number[] {
  const porMes = new Array(12).fill(0);
  for (const row of rows) {
    if (row.year !== year || row.month < 1 || row.month > 12) continue;
    porMes[row.month - 1] += gastosNaturezaTotalContribution(row.natureza, row.total);
  }
  return porMes;
}

export function aggregateGastosNaturezaYearlyTotals(
  rows: readonly QueryGastosNaturezaDetailRow[],
  years: readonly number[]
): Record<number, number> {
  const allowed = new Set(years);
  const porAno: Record<number, number> = {};
  for (const row of rows) {
    if (!allowed.has(row.year)) continue;
    porAno[row.year] =
      (porAno[row.year] ?? 0) + gastosNaturezaTotalContribution(row.natureza, row.total);
  }
  return porAno;
}

export function filterRecebidoMensalForContract(
  entries: readonly RecebidoMensalByGastosContractEntry[],
  contract: string,
  filters?: { months?: number[]; years?: number[] }
): RecebidoMensalByGastosContractEntry[] {
  const monthFilter = filters?.months?.length ? new Set(filters.months) : null;
  const yearFilter = filters?.years?.length ? new Set(filters.years) : null;

  return entries.filter((entry) => {
    if (!contractsMatch(entry.contract, contract)) return false;
    if (monthFilter && !monthFilter.has(entry.month)) return false;
    if (yearFilter && !yearFilter.has(entry.year)) return false;
    return true;
  });
}

/** Evita somar o mesmo mês mais de uma vez (aliases / abas NF's — espelha Math.max da linha). */
export function mergeRecebidoMensalByMonth(
  entries: readonly RecebidoMensalByGastosContractEntry[]
): RecebidoMensalByGastosContractEntry[] {
  const map = new Map<string, RecebidoMensalByGastosContractEntry>();

  for (const entry of entries) {
    const monthKey = `${entry.year}-${String(entry.month).padStart(2, '0')}`;
    const existing = map.get(monthKey);
    if (!existing) {
      map.set(monthKey, { ...entry });
      continue;
    }
    existing.recebido = Math.max(existing.recebido, entry.recebido);
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.contract.localeCompare(b.contract, 'pt-BR');
  });
}

/** Casamento exato por chave canônica — evita duplicar recebidos de aliases na série mensal. */
export function filterRecebidoMensalForContractExact(
  entries: readonly RecebidoMensalByGastosContractEntry[],
  contract: string,
  filters?: { months?: number[]; years?: number[] }
): RecebidoMensalByGastosContractEntry[] {
  const targetKey = contractLookupKey(contract);
  const monthFilter = filters?.months?.length ? new Set(filters.months) : null;
  const yearFilter = filters?.years?.length ? new Set(filters.years) : null;

  return mergeRecebidoMensalByMonth(
    entries.filter((entry) => {
      if (contractLookupKey(entry.contract) !== targetKey) return false;
      if (monthFilter && !monthFilter.has(entry.month)) return false;
      if (yearFilter && !yearFilter.has(entry.year)) return false;
      return true;
    })
  );
}

/** Ajusta a série mensal para fechar no total da linha (mesma regra agregada da tabela). */
export function alignRecebidoMensalSeriesToTotal(
  entries: readonly RecebidoMensalByGastosContractEntry[],
  targetTotal: number
): RecebidoMensalByGastosContractEntry[] {
  if (!entries.length || !Number.isFinite(targetTotal) || targetTotal <= 0) {
    return [...entries];
  }

  const currentTotal = entries.reduce((sum, entry) => sum + entry.recebido, 0);
  if (!Number.isFinite(currentTotal) || currentTotal <= 0) {
    return [...entries];
  }
  if (Math.abs(currentTotal - targetTotal) < 0.01) {
    return [...entries];
  }

  const factor = targetTotal / currentTotal;
  return entries.map((entry) => ({
    ...entry,
    recebido: entry.recebido * factor
  }));
}

function buildMonthlyPeriodoRows(input: ControleGeralFluxoBuildInput): MonthlyPeriodoRow[] {
  const map = new Map<string, { entrada: number; gastoSigned: number }>();

  for (const row of input.gastosRows) {
    const key = monthKeyFromRow(row);
    const cur = map.get(key) ?? { entrada: 0, gastoSigned: 0 };
    // Não usar Math.abs por linha: créditos DFC reduziriam o total da tabela
    // (Math.abs(soma)) mas inflariam o gráfico (soma(Math.abs)).
    cur.gastoSigned += row.total;
    map.set(key, cur);
  }

  for (const entry of input.recebidoMensal ?? []) {
    const key = monthKeyFromRecebido(entry);
    const cur = map.get(key) ?? { entrada: 0, gastoSigned: 0 };
    cur.entrada += entry.recebido;
    map.set(key, cur);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, totals]) => {
      // Despesa negativa → saida positiva (mesmo sentido da coluna Gastos).
      const saidaMes = -totals.gastoSigned;
      return {
        monthKey,
        label: formatMonthChartLabel(monthKey),
        entradaMes: totals.entrada,
        gastoSignedMes: totals.gastoSigned,
        saidaMes,
        valorMes: totals.entrada - Math.abs(totals.gastoSigned)
      };
    });
}

export function buildControleGeralFluxoMensalPeriodoSeries(
  input: ControleGeralFluxoBuildInput
): ControleGeralFluxoPoint[] {
  return buildMonthlyPeriodoRows(input).map((row) => ({
    monthKey: row.monthKey,
    label: row.label,
    entrada: row.entradaMes,
    saida: row.saidaMes,
    valor: row.valorMes
  }));
}

export function buildControleGeralFluxoMensalSeries(
  input: ControleGeralFluxoBuildInput
): ControleGeralFluxoPoint[] {
  const monthly = buildMonthlyPeriodoRows(input);

  let entradaAcumulada = 0;
  let gastoSignedAcumulado = 0;

  return monthly.map((row) => {
    entradaAcumulada += row.entradaMes;
    gastoSignedAcumulado += row.gastoSignedMes;
    // Espelha a linha: Gastos = |soma assinada|; Lucro = Recebido − |Gastos|.
    const saidaAcumulada = Math.abs(gastoSignedAcumulado);
    return {
      monthKey: row.monthKey,
      label: row.label,
      entrada: entradaAcumulada,
      saida: saidaAcumulada,
      valor: entradaAcumulada - saidaAcumulada
    };
  });
}

function inferProjectionYear(periodSeries: readonly ControleGeralFluxoPoint[]): number {
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

function computeWeightedMonthlyAverages(
  periodSeries: readonly ControleGeralFluxoPoint[]
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

export function buildControleGeralFluxoProjecaoAnualSeries(
  input: ControleGeralFluxoBuildInput
): ControleGeralFluxoProjecaoSeries {
  if (input.gastosRows.length === 0 && !(input.recebidoMensal?.length ?? 0)) {
    return { points: [], meta: null };
  }

  const periodSeries = buildControleGeralFluxoMensalPeriodoSeries(input);
  if (periodSeries.length === 0) {
    return { points: [], meta: null };
  }

  const averages = computeWeightedMonthlyAverages(periodSeries);
  if (!averages) {
    return { points: [], meta: null };
  }

  const cumulativeSeries = buildControleGeralFluxoMensalSeries(input);
  const cumulativeByMonth = new Map(cumulativeSeries.map((row) => [row.monthKey, row]));
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

  const points: ControleGeralFluxoProjecaoPoint[] = [];
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

export function summarizeControleGeralGastosFluxo(
  input: ControleGeralFluxoBuildInput,
  nfsTotals?: { faturamento: number; recebido: number },
  rowSnapshot?: ControleGeralFluxoRowSnapshot
) {
  if (rowSnapshot) {
    return {
      totalSaida: rowSnapshot.gastos,
      totalEntrada: rowSnapshot.recebido,
      totalValor: rowSnapshot.lucroLiquido
    };
  }

  // Mesma regra da coluna Gastos: |soma assinada|, não soma de |cada linha|.
  const signedGastos = input.gastosRows.reduce((sum, row) => sum + row.total, 0);
  const totalGastos = Math.abs(signedGastos);
  const totalRecebidoSerie = (input.recebidoMensal ?? []).reduce(
    (sum, entry) => sum + entry.recebido,
    0
  );
  const totalEntrada =
    nfsTotals != null && Number.isFinite(nfsTotals.recebido)
      ? nfsTotals.recebido
      : totalRecebidoSerie > 0
        ? totalRecebidoSerie
        : (nfsTotals?.faturamento ?? 0);

  return {
    totalSaida: totalGastos,
    totalEntrada,
    totalValor: totalEntrada - totalGastos
  };
}
