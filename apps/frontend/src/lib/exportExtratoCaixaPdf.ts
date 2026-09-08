import jsPDF from 'jspdf';
import { loadPdfBrandingLogo } from '@/lib/loadPdfBrandingLogo';

export type ExtratoCaixaResumoRow = {
  key: string;
  label: string;
  totalEntrada: number;
  totalSaida: number;
  totalValor: number;
};

export type ExtratoCaixaPdfSection = {
  title: string;
  rowLabelHeader: string;
  rows: ExtratoCaixaResumoRow[];
  totalRowLabel?: string;
  footnote?: string;
  /** Mantém a ordem recebida (ex.: top entradas + top saídas). */
  preserveRowOrder?: boolean;
};

export type ExtratoCaixaPdfStats = {
  totalEntrada: number;
  totalSaida: number;
  saldoLiquido: number;
  qtdEntrada: number;
  qtdSaida: number;
};

export type ExtratoCaixaPdfAjusteRow = {
  data: string;
  centroCusto: string;
  natureza: string;
  polo: string;
  observacao: string;
  valor: number;
};

export type ExtratoCaixaPdfStatCard = {
  label: string;
  value: string;
  subtitle?: string;
  accentColor?: [number, number, number];
  valueColor?: [number, number, number];
};

export type ExportExtratoCaixaPdfInput = {
  title?: string;
  subtitle?: string;
  generatedAt?: Date;
  stats: ExtratoCaixaPdfStats;
  movimentacoesFiltradas: number;
  filterLines: string[];
  /** Ajustes manuais do recorte (mesmos filtros do balanço), exibidos antes dos resumos. */
  ajustesManuais?: ExtratoCaixaPdfAjusteRow[];
  sections: ExtratoCaixaPdfSection[];
  /** Cards de indicadores (demonstrativo), exibidos acima de Saídas/Entradas/Saldo. */
  indicatorCards?: ExtratoCaixaPdfStatCard[];
  /** Colunas do grid de indicadores. Padrão: 2 */
  indicatorColumns?: number;
  /** Nota exibida abaixo do grid de indicadores (ex.: fórmula do ROI). */
  indicatorFootnote?: string;
  /** Nome do arquivo sem extensão. Padrão: balanco-financeiro-resumos_YYYY-MM-DD */
  fileName?: string;
  /** Rótulo do terceiro card de totais. Padrão: Valor */
  statsThirdCardLabel?: string;
  /** Texto do rodapé após o nome da empresa. Padrão: Balanço Financeiro */
  footerDocumentLabel?: string;
  /** Exibe a caixa de filtros aplicados. Padrão: true */
  includeFilterBox?: boolean;
  /** Título da caixa de filtros. Padrão: Filtros aplicados */
  filterBoxTitle?: string;
  /** Texto quando filterLines estiver vazio. */
  filterBoxEmptyMessage?: string;
  /** Texto no cabeçalho (canto superior direito, linha inferior). */
  headerConsolidadoNote?: string;
  /** Exibe os cards de totais (Saídas / Entradas / Valor). Padrão: true */
  includeStatsCards?: boolean;
  /** Layout das colunas nas seções de resumo. Padrão: default */
  resumoColumnLayout?: 'default' | 'saida-only';
  /** Rótulos de contrato/CC/polo para escolher logo Predial (UNB). */
  brandingContextLabels?: (string | null | undefined)[];
};

const BRAND_RED: [number, number, number] = [185, 28, 28];
const HEADER_PAGE_BG: [number, number, number] = [180, 185, 192];
const HEADER_TABLE_BG: [number, number, number] = [209, 213, 219];
const SECTION_TITLE_BG: [number, number, number] = [248, 249, 250];
const ROW_ALT: [number, number, number] = [252, 252, 253];
const BORDER: [number, number, number] = [209, 213, 219];
const TOTAL_ROW_BG: [number, number, number] = [241, 245, 249];
const TEXT_GREEN: [number, number, number] = [22, 101, 52];
const TEXT_RED: [number, number, number] = [185, 28, 28];
const TEXT_BLACK: [number, number, number] = [0, 0, 0];
const TEXT_MUTED: [number, number, number] = [75, 85, 99];

const COMPANY = {
  name: 'Gennesis Engenharia e Consultoria LTDA',
  subtitle: 'Engenharia e Consultoria'
};

export const EXTRATO_RESUMO_TOP_SAIDA = 20;

/** @deprecated Use EXTRATO_RESUMO_TOP_SAIDA */
export const EXTRATO_RESUMO_TOP_PADRAO = EXTRATO_RESUMO_TOP_SAIDA;

export function sortResumoRowsBySaidaDesc(rows: ExtratoCaixaResumoRow[]): ExtratoCaixaResumoRow[] {
  return [...rows].sort((a, b) => Math.abs(b.totalSaida) - Math.abs(a.totalSaida));
}

export function resumoRowSaidaMagnitude(row: ExtratoCaixaResumoRow): number {
  return Math.abs(row.totalSaida);
}

export function getTopSaidaKeys(
  allRows: ExtratoCaixaResumoRow[],
  topLimit = EXTRATO_RESUMO_TOP_SAIDA
): string[] {
  return sortResumoRowsBySaidaDesc(allRows)
    .filter((row) => resumoRowSaidaMagnitude(row) > 0)
    .slice(0, topLimit)
    .map((row) => row.key);
}

export function pickTopSaidaRows(
  allRows: ExtratoCaixaResumoRow[],
  topLimit = EXTRATO_RESUMO_TOP_SAIDA
): ExtratoCaixaResumoRow[] {
  const byKey = new Map(allRows.map((row) => [row.key, row]));
  return getTopSaidaKeys(allRows, topLimit)
    .map((key) => byKey.get(key))
    .filter((row): row is ExtratoCaixaResumoRow => row != null);
}

export function pickResumoRowsForPdf(
  allRows: ExtratoCaixaResumoRow[],
  includeAll: boolean,
  topLimit = EXTRATO_RESUMO_TOP_SAIDA
): ExtratoCaixaResumoRow[] {
  if (includeAll) return sortResumoRowsBySaidaDesc(allRows);
  return pickTopSaidaRows(allRows, topLimit);
}

function setTextColorByValue(doc: jsPDF, value: number): void {
  if (value > 0) doc.setTextColor(...TEXT_GREEN);
  else if (value < 0) doc.setTextColor(...TEXT_RED);
  else doc.setTextColor(...TEXT_BLACK);
}

function drawSectionTitleBar(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  footnote?: string
): void {
  doc.setFillColor(...SECTION_TITLE_BG);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(x, y, width, height, 1.5, 1.5, 'FD');
  doc.setFillColor(...BRAND_RED);
  doc.rect(x, y + 1.5, 2.5, height - 3, 'F');
  doc.setTextColor(...TEXT_BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(title, x + 6, y + height / 2 + 1.2);
  if (footnote) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(footnote, x + width - 4, y + height / 2 + 1.2, { align: 'right' });
  }
}

function drawTableHeaderRow(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  columns: { label: string; x: number; align?: 'left' | 'right' }[]
): void {
  doc.setFillColor(...HEADER_TABLE_BG);
  doc.setDrawColor(...BORDER);
  doc.rect(x, y, width, height, 'FD');
  doc.setTextColor(...TEXT_BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  for (const col of columns) {
    if (col.align === 'right') {
      doc.text(col.label, col.x, y + 5.5, { align: 'right' });
    } else {
      doc.text(col.label, col.x, y + 5.5);
    }
  }
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCurrencyCell(value: number): string {
  if (value === 0) return '—';
  return formatCurrency(value);
}

function computeSectionTotals(rows: ExtratoCaixaResumoRow[]) {
  let totalEntrada = 0;
  let totalSaida = 0;
  let totalValor = 0;
  for (const row of rows) {
    totalEntrada += row.totalEntrada;
    totalSaida += row.totalSaida;
    totalValor += row.totalValor;
  }
  return { totalEntrada, totalSaida, totalValor };
}

async function loadCompanyLogo(
  contextLabels: (string | null | undefined)[] = []
): Promise<{
  dataUrl: string;
  wMm: number;
  hMm: number;
} | null> {
  return loadPdfBrandingLogo({ contextLabels, maxW: 36, maxH: 22 });
}

function ensureSpace(doc: jsPDF, y: number, need: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + need > pageH - margin) {
    doc.addPage();
    return margin;
  }
  return y;
}

function truncateText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

function drawPageHeader(
  doc: jsPDF,
  margin: number,
  pageWidth: number,
  logo: { dataUrl: string; wMm: number; hMm: number } | null,
  title: string,
  generatedAt: Date,
  consolidadoNote: string
): number {
  const headerH = 36;
  doc.setFillColor(...HEADER_PAGE_BG);
  doc.rect(0, 0, pageWidth, headerH, 'F');
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, headerH - 1.2, pageWidth, 1.2, 'F');

  let textX = margin;
  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', margin, 7, logo.wMm, logo.hMm);
    textX = margin + logo.wMm + 6;
  }

  doc.setTextColor(...TEXT_BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, textX, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(COMPANY.name, textX, 23);

  const dateStr = generatedAt.toLocaleDateString('pt-BR');
  const timeStr = generatedAt.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
  doc.setFontSize(8);
  doc.text(`Gerado em ${dateStr} às ${timeStr}`, pageWidth - margin, 15, { align: 'right' });
  doc.text(consolidadoNote, pageWidth - margin, 22, { align: 'right' });

  doc.setTextColor(...TEXT_BLACK);
  return headerH + 8;
}

function drawSingleStatCard(
  doc: jsPDF,
  x: number,
  y: number,
  cardW: number,
  cardH: number,
  card: ExtratoCaixaPdfStatCard
): void {
  const accent = card.accentColor ?? TEXT_RED;
  const valueColor = card.valueColor ?? TEXT_BLACK;

  doc.setDrawColor(...BORDER);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, cardW, cardH, 2.5, 2.5, 'FD');
  doc.setFillColor(...accent);
  doc.roundedRect(x, y + 2, 2.5, cardH - 4, 1, 1, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(truncateText(doc, card.label, cardW - 10), x + 6, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...valueColor);
  doc.text(truncateText(doc, card.value, cardW - 10), x + 6, y + 15);

  if (card.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(truncateText(doc, card.subtitle, cardW - 10), x + 6, y + 20);
  }
}

function drawStatCardsGrid(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  cards: ExtratoCaixaPdfStatCard[],
  columns = 3
): number {
  if (cards.length === 0) return y;

  const gap = 4;
  const cardW = (contentW - gap * (columns - 1)) / columns;
  const cardH = 22;
  const rowCount = Math.ceil(cards.length / columns);

  for (let row = 0; row < rowCount; row++) {
    y = ensureSpace(doc, y, cardH + 8, margin);

    for (let col = 0; col < columns; col++) {
      const index = row * columns + col;
      if (index >= cards.length) break;
      const x = margin + col * (cardW + gap);
      drawSingleStatCard(doc, x, y, cardW, cardH, cards[index]);
    }

    y += cardH + gap;
  }

  doc.setTextColor(...TEXT_BLACK);
  return y + 4;
}

function drawStatsCards(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  stats: ExtratoCaixaPdfStats,
  movimentacoesFiltradas: number,
  statsThirdCardLabel = 'Valor'
): number {
  const saldoColor =
    stats.saldoLiquido > 0 ? TEXT_GREEN : stats.saldoLiquido < 0 ? TEXT_RED : TEXT_BLACK;

  return drawStatCardsGrid(
    doc,
    y,
    margin,
    contentW,
    [
      {
        label: 'Saídas',
        value: formatCurrency(stats.totalSaida),
        subtitle: `${stats.qtdSaida} mov.`,
        accentColor: TEXT_RED,
        valueColor: TEXT_RED
      },
      {
        label: 'Entradas',
        value: formatCurrency(stats.totalEntrada),
        subtitle: `${stats.qtdEntrada} mov.`,
        accentColor: TEXT_GREEN,
        valueColor: TEXT_GREEN
      },
      {
        label: statsThirdCardLabel,
        value: formatCurrency(stats.saldoLiquido),
        subtitle: `${movimentacoesFiltradas} no período filtrado`,
        accentColor: saldoColor,
        valueColor: saldoColor
      }
    ],
    3
  );
}

function drawFilterBox(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  filterLines: string[],
  title = 'Filtros aplicados',
  emptyMessage = 'Nenhum filtro restritivo aplicado (todos os registros visíveis).'
): number {
  const lines = filterLines.length > 0 ? filterLines : [emptyMessage];
  doc.setFontSize(8);
  const wrapped: string[] = [];
  for (const line of lines) {
    wrapped.push(...doc.splitTextToSize(line, contentW - 12));
  }
  const boxH = 10 + wrapped.length * 4.2;
  y = ensureSpace(doc, y, boxH + 4, margin);

  doc.setFillColor(248, 249, 250);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(margin, y, contentW, boxH, 2, 2, 'FD');
  doc.setFillColor(...BRAND_RED);
  doc.rect(margin, y + 2, 2.5, boxH - 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_BLACK);
  doc.text(title, margin + 8, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  let ly = y + 12;
  for (const line of wrapped) {
    doc.text(line, margin + 6, ly);
    ly += 4.2;
  }

  doc.setTextColor(0, 0, 0);
  return y + boxH + 8;
}

function drawResumoSection(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  section: ExtratoCaixaPdfSection,
  columnLayout: 'default' | 'saida-only' = 'default'
): number {
  const rowH = 7;
  const headerH = 8;
  const titleH = 10;
  const sortedRows = section.preserveRowOrder
    ? [...section.rows]
    : [...section.rows].sort((a, b) => b.totalValor - a.totalValor);
  const totais = computeSectionTotals(sortedRows);
  const totalLabel = section.totalRowLabel ?? 'Total';

  y = ensureSpace(doc, y, titleH + headerH + rowH * Math.min(sortedRows.length, 3) + 20, margin);

  drawSectionTitleBar(doc, margin, y, contentW, titleH, section.title, section.footnote);
  y += titleH + 3;

  const saidaOnly = columnLayout === 'saida-only';
  const colLabel = saidaOnly ? contentW * 0.68 : contentW * 0.42;
  const colVal = saidaOnly ? contentW - colLabel : (contentW - colLabel) / 3;
  const colX = saidaOnly
    ? [margin, margin + colLabel]
    : [margin, margin + colLabel, margin + colLabel + colVal, margin + colLabel + colVal * 2];

  const drawTableHeader = () => {
    const columns = saidaOnly
      ? [
          { label: section.rowLabelHeader, x: colX[0] + 3 },
          { label: 'Saída', x: colX[1] + colVal - 3, align: 'right' as const }
        ]
      : [
          { label: section.rowLabelHeader, x: colX[0] + 3 },
          { label: 'Saída', x: colX[1] + colVal - 3, align: 'right' as const },
          { label: 'Entrada', x: colX[2] + colVal - 3, align: 'right' as const },
          { label: 'Valor', x: colX[3] + colVal - 3, align: 'right' as const }
        ];
    drawTableHeaderRow(doc, margin, y, contentW, headerH, columns);
    y += headerH;
  };

  drawTableHeader();

  if (sortedRows.length === 0) {
    y = ensureSpace(doc, y, rowH + 4, margin);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Nenhum registro neste resumo com os filtros atuais.', margin + 3, y + 5);
    doc.setTextColor(...TEXT_BLACK);
    return y + rowH + 6;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  for (let i = 0; i < sortedRows.length; i++) {
    if (y + rowH > doc.internal.pageSize.getHeight() - margin - 14) {
      doc.addPage();
      y = margin;
      drawSectionTitleBar(doc, margin, y, contentW, titleH, `${section.title} (continuação)`);
      y += titleH + 3;
      drawTableHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
    }

    if (i % 2 === 0) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(margin, y, contentW, rowH, 'F');
    }
    doc.setDrawColor(...BORDER);
    doc.line(margin, y + rowH, margin + contentW, y + rowH);

    const row = sortedRows[i];
    const label = truncateText(doc, row.label, colLabel - 6);
    doc.setTextColor(...TEXT_BLACK);
    doc.text(label, colX[0] + 3, y + 5);
    if (saidaOnly) {
      doc.setTextColor(...TEXT_RED);
      doc.text(formatCurrencyCell(row.totalSaida), colX[1] + colVal - 3, y + 5, { align: 'right' });
    } else {
      setTextColorByValue(doc, row.totalSaida);
      doc.text(formatCurrencyCell(row.totalSaida), colX[1] + colVal - 3, y + 5, { align: 'right' });
      setTextColorByValue(doc, row.totalEntrada);
      doc.text(formatCurrencyCell(row.totalEntrada), colX[2] + colVal - 3, y + 5, { align: 'right' });
      setTextColorByValue(doc, row.totalValor);
      doc.text(formatCurrencyCell(row.totalValor), colX[3] + colVal - 3, y + 5, { align: 'right' });
    }
    y += rowH;
  }

  y = ensureSpace(doc, y, rowH + 4, margin);
  doc.setFillColor(...TOTAL_ROW_BG);
  doc.rect(margin, y, contentW, rowH, 'F');
  doc.setDrawColor(...BORDER);
  doc.line(margin, y, margin + contentW, y);
  doc.line(margin, y + rowH, margin + contentW, y + rowH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_BLACK);
  doc.text(totalLabel, colX[0] + 3, y + 5);
  if (saidaOnly) {
    doc.setTextColor(...TEXT_RED);
    doc.text(formatCurrency(totais.totalSaida), colX[1] + colVal - 3, y + 5, { align: 'right' });
  } else {
    setTextColorByValue(doc, totais.totalSaida);
    doc.text(formatCurrency(totais.totalSaida), colX[1] + colVal - 3, y + 5, { align: 'right' });
    setTextColorByValue(doc, totais.totalEntrada);
    doc.text(formatCurrency(totais.totalEntrada), colX[2] + colVal - 3, y + 5, { align: 'right' });
    setTextColorByValue(doc, totais.totalValor);
    doc.text(formatCurrency(totais.totalValor), colX[3] + colVal - 3, y + 5, { align: 'right' });
  }
  y += rowH + 10;

  return y;
}

const AJUSTE_ROW_FILL: [number, number, number] = [255, 251, 235];

function drawAjustesManuaisSection(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  rows: ExtratoCaixaPdfAjusteRow[]
): number {
  if (rows.length === 0) return y;

  const rowH = 7;
  const headerH = 8;
  const titleH = 10;

  const colData = 18;
  const colValor = 26;
  const colPolo = 14;
  const colNatureza = 32;
  const colCc = 48;
  const colObservacao = contentW - colData - colCc - colNatureza - colPolo - colValor;

  const colX = [
    margin,
    margin + colData,
    margin + colData + colCc,
    margin + colData + colCc + colNatureza,
    margin + colData + colCc + colNatureza + colPolo,
    margin + colData + colCc + colNatureza + colPolo + colObservacao
  ];

  y = ensureSpace(doc, y, titleH + headerH + rowH * Math.min(rows.length, 3) + 20, margin);

  drawSectionTitleBar(doc, margin, y, contentW, titleH, 'Ajustes manuais', 'Somados ao balanço do TOTVS');
  y += titleH + 3;

  const drawTableHeader = () => {
    drawTableHeaderRow(doc, margin, y, contentW, headerH, [
      { label: 'Data', x: colX[0] + 2 },
      { label: 'Centro de custo', x: colX[1] + 2 },
      { label: 'Natureza', x: colX[2] + 2 },
      { label: 'Polo', x: colX[3] + 2 },
      { label: 'Observação', x: colX[4] + 2 },
      { label: 'Valor', x: colX[5] + colValor - 2, align: 'right' }
    ]);
    y += headerH;
  };

  drawTableHeader();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);

  let totalValor = 0;

  for (let i = 0; i < rows.length; i++) {
    if (y + rowH > doc.internal.pageSize.getHeight() - margin - 14) {
      doc.addPage();
      y = margin;
      drawSectionTitleBar(doc, margin, y, contentW, titleH, 'Ajustes manuais (continuação)');
      y += titleH + 3;
      drawTableHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
    }

    doc.setFillColor(...AJUSTE_ROW_FILL);
    doc.rect(margin, y, contentW, rowH, 'F');
    doc.setDrawColor(...BORDER);
    doc.line(margin, y + rowH, margin + contentW, y + rowH);

    const row = rows[i];
    totalValor += row.valor;

    doc.setTextColor(31, 41, 55);
    doc.text(row.data, colX[0] + 2, y + 5);
    doc.text(truncateText(doc, row.centroCusto, colCc - 4), colX[1] + 2, y + 5);
    doc.text(truncateText(doc, row.natureza, colNatureza - 4), colX[2] + 2, y + 5);
    doc.text(truncateText(doc, row.polo, colPolo - 4), colX[3] + 2, y + 5);
    doc.text(truncateText(doc, row.observacao, colObservacao - 4), colX[4] + 2, y + 5);

    if (row.valor < 0) doc.setTextColor(185, 28, 28);
    else if (row.valor > 0) doc.setTextColor(22, 101, 52);
    doc.text(formatCurrency(row.valor), colX[5] + colValor - 2, y + 5, { align: 'right' });
    doc.setTextColor(31, 41, 55);

    y += rowH;
  }

  y = ensureSpace(doc, y, rowH + 4, margin);
  doc.setFillColor(...TOTAL_ROW_BG);
  doc.rect(margin, y, contentW, rowH, 'F');
  doc.setDrawColor(...BORDER);
  doc.line(margin, y, margin + contentW, y);
  doc.line(margin, y + rowH, margin + contentW, y + rowH);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...TEXT_BLACK);
  doc.text('Total dos ajustes', colX[0] + 2, y + 5);
  setTextColorByValue(doc, totalValor);
  doc.text(formatCurrency(totalValor), colX[5] + colValor - 2, y + 5, { align: 'right' });
  y += rowH + 10;

  return y;
}

function drawFooter(doc: jsPDF, margin: number, documentLabel = 'Balanço Financeiro') {
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...BORDER);
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`${COMPANY.name} — ${documentLabel}`, margin, pageH - 8);
    doc.text(`Página ${p} de ${pageCount}`, pageW - margin, pageH - 8, { align: 'right' });
  }
}

export async function exportExtratoCaixaPdf(input: ExportExtratoCaixaPdfInput): Promise<void> {
  const brandingContext = [
    ...(input.brandingContextLabels ?? []),
    ...input.filterLines,
  ];
  const logo = await loadCompanyLogo(brandingContext);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentW = pageWidth - margin * 2;
  const generatedAt = input.generatedAt ?? new Date();
  const title = input.title ?? 'Balanço Financeiro';
  const ajustesRows = input.ajustesManuais ?? [];
  const consolidadoNote =
    input.headerConsolidadoNote ??
    (ajustesRows.length > 0
      ? 'Consolidado e ajustes manuais do recorte filtrado'
      : 'Consolidado — movimentações detalhadas não incluídas');

  let y = drawPageHeader(
    doc,
    margin,
    pageWidth,
    logo,
    title,
    generatedAt,
    consolidadoNote
  );

  if (input.includeFilterBox !== false) {
    y = drawFilterBox(
      doc,
      y,
      margin,
      contentW,
      input.filterLines,
      input.filterBoxTitle,
      input.filterBoxEmptyMessage
    );
  }

  if (input.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    doc.text(input.subtitle, margin, y);
    y += 6;
  }

  if (input.indicatorCards && input.indicatorCards.length > 0) {
    y = ensureSpace(doc, y, 14, margin);
    drawSectionTitleBar(
      doc,
      margin,
      y,
      contentW,
      10,
      'Indicadores do demonstrativo financeiro'
    );
    y += 13;
    y = drawStatCardsGrid(
      doc,
      y,
      margin,
      contentW,
      input.indicatorCards,
      input.indicatorColumns ?? 2
    );
    if (input.indicatorFootnote?.trim()) {
      y = ensureSpace(doc, y, 8, margin);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...TEXT_MUTED);
      const footnoteLines = doc.splitTextToSize(input.indicatorFootnote.trim(), contentW);
      for (const line of footnoteLines) {
        doc.text(line, margin, y);
        y += 3.5;
      }
      doc.setTextColor(...TEXT_BLACK);
      y += 4;
    }
  }

  if (input.includeStatsCards !== false) {
    y = drawStatsCards(
      doc,
      y,
      margin,
      contentW,
      input.stats,
      input.movimentacoesFiltradas,
      input.statsThirdCardLabel
    );
  }
  y = drawAjustesManuaisSection(doc, y, margin, contentW, ajustesRows);

  const resumoColumnLayout = input.resumoColumnLayout ?? 'default';
  for (const section of input.sections) {
    if (section.rows.length === 0) continue;
    y = drawResumoSection(doc, y, margin, contentW, section, resumoColumnLayout);
  }

  drawFooter(doc, margin, input.footerDocumentLabel);

  const datePart = generatedAt.toISOString().slice(0, 10);
  const defaultName = `balanco-financeiro-resumos_${datePart}`;
  doc.save(`${input.fileName ?? defaultName}.pdf`);
}
