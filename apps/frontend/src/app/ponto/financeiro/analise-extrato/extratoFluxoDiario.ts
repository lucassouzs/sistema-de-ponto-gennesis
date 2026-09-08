import type { ExtratoCaixaItem } from './extratoCaixaTypes';

export type ExtratoFluxoDiarioPoint = {
  dayKey: string;
  label: string;
  /** Entradas acumuladas até o dia (inclusive). */
  entrada: number;
  /** Saídas acumuladas até o dia (inclusive, valor absoluto). */
  saida: number;
  /** Saldo líquido acumulado até o dia (inclusive). */
  valor: number;
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

function itemCompensacaoDayKey(item: ExtratoCaixaItem): string | null {
  const data = item.dataCompensacao ?? item.data;
  if (!data) return null;
  const parts = parseCalendarDateParts(data);
  if (!parts) return null;
  return `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
}

function formatDayLabel(dayKey: string): string {
  const parts = dayKey.split('-');
  if (parts.length !== 3) return dayKey;
  return `${parts[2]}/${parts[1]}`;
}

function itemEntrada(item: ExtratoCaixaItem): number {
  return item.entrada > 0 ? item.entrada : 0;
}

function itemSaldoLinha(item: ExtratoCaixaItem): number {
  return item.entrada + item.saida;
}

export function buildExtratoFluxoDiarioSeries(
  items: readonly ExtratoCaixaItem[]
): ExtratoFluxoDiarioPoint[] {
  const map = new Map<string, { entrada: number; saida: number; valor: number }>();

  for (const item of items) {
    const key = itemCompensacaoDayKey(item);
    if (!key) continue;
    const cur = map.get(key) ?? { entrada: 0, saida: 0, valor: 0 };
    cur.entrada += itemEntrada(item);
    cur.saida += item.saida;
    cur.valor += itemSaldoLinha(item);
    map.set(key, cur);
  }

  const daily = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, totals]) => ({
      dayKey,
      label: formatDayLabel(dayKey),
      entradaDia: totals.entrada,
      saidaDia: Math.abs(totals.saida),
      valorDia: totals.valor
    }));

  let entradaAcumulada = 0;
  let saidaAcumulada = 0;
  let valorAcumulado = 0;
  return daily.map((row) => {
    entradaAcumulada += row.entradaDia;
    saidaAcumulada += row.saidaDia;
    valorAcumulado += row.valorDia;
    return {
      dayKey: row.dayKey,
      label: row.label,
      entrada: entradaAcumulada,
      saida: saidaAcumulada,
      valor: valorAcumulado
    };
  });
}

export function formatExtratoFluxoCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function formatExtratoFluxoAxisValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`;
  }
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
