import type { ExtratoCaixaItem } from '@/app/ponto/financeiro/analise-extrato/extratoCaixaTypes';
import {
  exportExtratoCaixaPdf,
  type ExportExtratoCaixaPdfInput,
  type ExtratoCaixaPdfAjusteRow,
  type ExtratoCaixaPdfSection,
  type ExtratoCaixaPdfStatCard,
  type ExtratoCaixaPdfStats,
  type ExtratoCaixaResumoRow
} from './exportExtratoCaixaPdf';

export type DemonstrativoFinanceiroPdfCard = {
  title: string;
  qtd: number;
  total: number;
  kind: 'expense' | 'income';
};

export type DemonstrativoFinanceiroPdfCategory = {
  sectionTitle: string;
  items: ExtratoCaixaItem[];
};

export type DemonstrativoFinanceiroResumos = {
  mensal: ExtratoCaixaResumoRow[];
  polo: ExtratoCaixaResumoRow[];
  centroCusto: ExtratoCaixaResumoRow[];
};

export type ExportDemonstrativoFinanceiroPdfInput = {
  subtitle?: string;
  generatedAt?: Date;
  stats: ExtratoCaixaPdfStats;
  movimentacoesFiltradas: number;
  filterLines: string[];
  roi: number | null;
  roiLabel: string;
  cards: DemonstrativoFinanceiroPdfCard[];
  categories: DemonstrativoFinanceiroPdfCategory[];
  resumos: DemonstrativoFinanceiroResumos;
  ajustesManuais?: ExtratoCaixaPdfAjusteRow[];
};

const PDF_TEXT_GREEN: [number, number, number] = [22, 101, 52];
const PDF_TEXT_RED: [number, number, number] = [185, 28, 28];
const PDF_TEXT_TEAL: [number, number, number] = [15, 118, 110];
const PDF_TEXT_BLACK: [number, number, number] = [17, 24, 39];

function pdfItemEntrada(item: ExtratoCaixaItem): number {
  return item.entrada > 0 ? item.entrada : 0;
}

function pdfItemSaidaAbs(item: ExtratoCaixaItem): number {
  if (item.saida < 0) return Math.abs(item.saida);
  return item.saida > 0 ? item.saida : 0;
}

function pdfItemHasSaida(item: ExtratoCaixaItem): boolean {
  return item.saida !== 0;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

function buildIndicatorCards(input: ExportDemonstrativoFinanceiroPdfInput): ExtratoCaixaPdfStatCard[] {
  const cards: ExtratoCaixaPdfStatCard[] = input.cards.map((card) => {
    const accent = card.kind === 'expense' ? PDF_TEXT_RED : PDF_TEXT_GREEN;
    return {
      label: `${card.title} (${card.qtd.toLocaleString('pt-BR')})`,
      value: formatCurrency(card.total),
      subtitle: card.kind === 'expense' ? 'Saídas' : 'Entradas',
      accentColor: accent,
      valueColor: accent
    };
  });

  const roiColor =
    input.roi == null
      ? PDF_TEXT_BLACK
      : input.roi >= 0
        ? PDF_TEXT_TEAL
        : PDF_TEXT_RED;

  cards.push({
    label: 'ROI',
    value: input.roi == null ? '—' : formatPercent(input.roi),
    subtitle: 'Recorte filtrado',
    accentColor: roiColor,
    valueColor: roiColor
  });

  return cards;
}

function buildNaturezaRowsFromItems(items: ExtratoCaixaItem[]): ExtratoCaixaResumoRow[] {
  const map = new Map<string, { entrada: number; saida: number }>();
  for (const item of items) {
    const label = item.natureza?.trim() || 'Sem natureza';
    const bucket = map.get(label) ?? { entrada: 0, saida: 0 };
    const ent = pdfItemEntrada(item);
    const sai = pdfItemSaidaAbs(item);
    if (ent > 0) bucket.entrada += ent;
    if (pdfItemHasSaida(item)) bucket.saida += sai;
    map.set(label, bucket);
  }
  return Array.from(map.entries())
    .map(([label, totals]) => ({
      key: label,
      label,
      totalEntrada: totals.entrada,
      totalSaida: totals.saida,
      totalValor: totals.entrada - totals.saida
    }))
    .sort(
      (a, b) =>
        Math.abs(b.totalSaida) + Math.abs(b.totalEntrada) -
        (Math.abs(a.totalSaida) + Math.abs(a.totalEntrada))
    );
}

function buildDemonstrativoSections(
  input: ExportDemonstrativoFinanceiroPdfInput
): ExtratoCaixaPdfSection[] {
  const sections: ExtratoCaixaPdfSection[] = [];

  if (input.resumos.mensal.length > 0) {
    sections.push({
      title: 'Resumo por mês',
      rowLabelHeader: 'Mês',
      rows: input.resumos.mensal,
      totalRowLabel: 'Total',
      preserveRowOrder: true
    });
  }

  if (input.resumos.polo.length > 0) {
    sections.push({
      title: 'Resumo por polo',
      rowLabelHeader: 'Polo',
      rows: input.resumos.polo,
      totalRowLabel: 'Total',
      preserveRowOrder: true
    });
  }

  if (input.resumos.centroCusto.length > 0) {
    sections.push({
      title: 'Resumo por centro de custo',
      rowLabelHeader: 'Centro de custo',
      rows: input.resumos.centroCusto,
      totalRowLabel: 'Total'
    });
  }

  for (const category of input.categories) {
    if (category.items.length === 0) continue;
    sections.push({
      title: category.sectionTitle,
      rowLabelHeader: 'Natureza financeira',
      rows: buildNaturezaRowsFromItems(category.items),
      totalRowLabel: 'Total'
    });
  }

  return sections;
}

export async function exportDemonstrativoFinanceiroPdf(
  input: ExportDemonstrativoFinanceiroPdfInput
): Promise<void> {
  const generatedAt = input.generatedAt ?? new Date();
  const datePart = generatedAt.toISOString().slice(0, 10);
  const ajustesRows = input.ajustesManuais ?? [];

  const payload: ExportExtratoCaixaPdfInput = {
    title: 'Demonstrativo Financeiro',
    subtitle: input.subtitle,
    generatedAt,
    stats: input.stats,
    movimentacoesFiltradas: input.movimentacoesFiltradas,
    filterLines: input.filterLines,
    includeFilterBox: true,
    filterBoxTitle: 'Itens excluídos das listas',
    filterBoxEmptyMessage: 'Nenhum item foi desmarcado nos filtros de lista.',
    headerConsolidadoNote:
      ajustesRows.length > 0
        ? 'Demonstrativo financeiro — indicadores, ajustes manuais e resumos'
        : 'Demonstrativo financeiro — indicadores e resumos',
    indicatorCards: buildIndicatorCards(input),
    indicatorColumns: 2,
    indicatorFootnote: input.roiLabel,
    ajustesManuais: ajustesRows,
    sections: buildDemonstrativoSections(input),
    fileName: `demonstrativo-financeiro_${datePart}`,
    statsThirdCardLabel: 'Saldo Líquido',
    footerDocumentLabel: 'Demonstrativo Financeiro'
  };

  await exportExtratoCaixaPdf(payload);
}
