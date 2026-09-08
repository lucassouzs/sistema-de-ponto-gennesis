import type { ExtratoCaixaItem } from './extratoCaixaTypes';

export type ExtratoFluxoMensalPoint = {
  monthKey: string;
  label: string;
  entrada: number;
  /** Saídas (valor absoluto no eixo do gráfico). */
  saida: number;
  valor: number;
};

type ExtratoFluxoMensalPeriodoRow = {
  monthKey: string;
  label: string;
  entradaMes: number;
  saidaMes: number;
  valorMes: number;
};

function parseCalendarDateParts(value: string): { y: number; m: number; d: number } | null {
  const s = value.trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) };
  }

  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return { y: Number(br[3]), m: Number(br[2]), d: Number(br[1]) };
  }

  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) return null;
  return {
    y: parsed.getFullYear(),
    m: parsed.getMonth() + 1,
    d: parsed.getDate()
  };
}

function itemCompensacaoMonthKey(item: ExtratoCaixaItem): string | null {
  const data = item.dataCompensacao ?? item.data;
  if (!data) return null;
  const parts = parseCalendarDateParts(data);
  if (!parts) return null;
  return `${parts.y}-${String(parts.m).padStart(2, '0')}`;
}

function formatMonthChartLabel(monthKey: string): string {
  const month = monthKey.slice(5, 7);
  const year = monthKey.slice(2, 4);
  return `${month}/${year}`;
}

export function formatExtratoFluxoMensalTooltipLabel(monthKey: string): string {
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

function itemEntrada(item: ExtratoCaixaItem): number {
  return item.entrada > 0 ? item.entrada : 0;
}

function itemSaldoLinha(item: ExtratoCaixaItem): number {
  return item.entrada + item.saida;
}

function buildExtratoFluxoMensalPeriodoRows(
  items: readonly ExtratoCaixaItem[]
): ExtratoFluxoMensalPeriodoRow[] {
  const map = new Map<string, { entrada: number; saida: number; valor: number }>();

  for (const item of items) {
    const key = itemCompensacaoMonthKey(item);
    if (!key) continue;
    const cur = map.get(key) ?? { entrada: 0, saida: 0, valor: 0 };
    cur.entrada += itemEntrada(item);
    cur.saida += item.saida;
    cur.valor += itemSaldoLinha(item);
    map.set(key, cur);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, totals]) => ({
      monthKey,
      label: formatMonthChartLabel(monthKey),
      entradaMes: totals.entrada,
      saidaMes: Math.abs(totals.saida),
      valorMes: totals.valor
    }));
}

/** Totais de cada mês (sem acumular). */
export function buildExtratoFluxoMensalPeriodoSeries(
  items: readonly ExtratoCaixaItem[]
): ExtratoFluxoMensalPoint[] {
  return buildExtratoFluxoMensalPeriodoRows(items).map((row) => ({
    monthKey: row.monthKey,
    label: row.label,
    entrada: row.entradaMes,
    saida: row.saidaMes,
    valor: row.valorMes
  }));
}

/** Totais acumulados mês a mês. */
export function buildExtratoFluxoMensalSeries(
  items: readonly ExtratoCaixaItem[]
): ExtratoFluxoMensalPoint[] {
  const monthly = buildExtratoFluxoMensalPeriodoRows(items);

  let entradaAcumulada = 0;
  let saidaAcumulada = 0;
  let valorAcumulado = 0;
  return monthly.map((row) => {
    entradaAcumulada += row.entradaMes;
    saidaAcumulada += row.saidaMes;
    valorAcumulado += row.valorMes;
    return {
      monthKey: row.monthKey,
      label: row.label,
      entrada: entradaAcumulada,
      saida: saidaAcumulada,
      valor: valorAcumulado
    };
  });
}
