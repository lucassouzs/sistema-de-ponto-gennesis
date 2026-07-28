import jsPDF from 'jspdf';
import {
  LICITACAO_ORCAMENTO_FORMULA_LABELS,
  LICITACAO_ORCAMENTO_FORMULA_ORDER,
  type LicitacaoOrcamentoInputs,
  type LicitacaoOrcamentoResult,
} from '@/app/ponto/licitacoes/licitacaoOrcamentoCalc';

export type ExportLicitacaoOrcamentoPdfInput = {
  titulo: string;
  numeroProcesso?: string | null;
  orgao?: string | null;
  inputs: LicitacaoOrcamentoInputs;
  result: LicitacaoOrcamentoResult;
  generatedAt?: Date;
};

const BRAND_RED: [number, number, number] = [185, 28, 28];
const BORDER: [number, number, number] = [209, 213, 219];
const TEXT_BLACK: [number, number, number] = [17, 24, 39];
const TEXT_MUTED: [number, number, number] = [75, 85, 99];
const HEADER_BG: [number, number, number] = [243, 244, 246];

const COMPANY = { name: 'Gennesis Engenharia e Consultoria LTDA' };
const MARGIN = 14;
const FOOTER_RESERVE = 12;

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function pageBottom(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight() - MARGIN - FOOTER_RESERVE;
}

function ensureSpace(doc: jsPDF, y: number, need: number): number {
  if (y + need > pageBottom(doc)) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function drawFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`${COMPANY.name} — Orçamento de licitação`, MARGIN, h - 6);
    doc.text(`Página ${p} de ${pages}`, w - MARGIN, h - 6, { align: 'right' });
  }
}

export async function exportLicitacaoOrcamentoPdf(
  input: ExportLicitacaoOrcamentoPdfInput
): Promise<void> {
  const generatedAt = input.generatedAt ?? new Date();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGIN * 2;

  doc.setFillColor(...BRAND_RED);
  doc.rect(0, 0, pageW, 2.2, 'F');

  let y = MARGIN + 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...TEXT_BLACK);
  doc.text('Orçamento de participação — Licitação', MARGIN, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(COMPANY.name, MARGIN, y);
  y += 5;
  doc.text(
    `Gerado em ${generatedAt.toLocaleDateString('pt-BR')} às ${generatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    MARGIN,
    y
  );
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_BLACK);
  const titleLines = doc.splitTextToSize(input.titulo || 'Sem título', contentW);
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 5 + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  if (input.numeroProcesso) {
    doc.text(`Processo: ${input.numeroProcesso}`, MARGIN, y);
    y += 4.5;
  }
  if (input.orgao) {
    doc.text(`Órgão: ${input.orgao}`, MARGIN, y);
    y += 4.5;
  }
  y += 4;

  const moneyRows: Array<[string, number]> = [
    ...input.inputs.expenseTypes.map(
      (type) =>
        [
          `Gastos — ${type.label}`,
          input.inputs.lines
            .filter((line) => line.category === type.id)
            .reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
        ] as [string, number]
    ),
    ['Preço de referência (edital)', input.inputs.precoReferenciaEdital],
    ['Encargos sociais', input.inputs.encargosSociais.money],
    ['Custo indireto', input.inputs.custoIndireto.money],
    ['Lucro', input.inputs.lucro.money],
    ['Tributo', input.inputs.tributo.money],
    ['Margem mínima', input.inputs.margemMinima.money],
    ['Desconto simulado', input.inputs.descontoSimulado.money],
  ];

  y = ensureSpace(doc, y, 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_BLACK);
  doc.text('Entradas de custo e parâmetros', MARGIN, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  for (const [label, value] of moneyRows) {
    y = ensureSpace(doc, y, 5);
    doc.setTextColor(...TEXT_BLACK);
    doc.text(label, MARGIN, y);
    doc.text(formatCurrency(value), MARGIN + contentW, y, { align: 'right' });
    y += 4.5;
  }

  const pctRows: Array<[string, number]> = [
    ['Encargos sociais (%)', input.inputs.encargosSociais.percent],
    ['Custo indireto (%)', input.inputs.custoIndireto.percent],
    ['Lucro (%)', input.inputs.lucro.percent],
    ['Tributo (%)', input.inputs.tributo.percent],
    ['Margem mínima (%)', input.inputs.margemMinima.percent],
    ['Desconto simulado (%)', input.inputs.descontoSimulado.percent],
  ];
  for (const [label, value] of pctRows) {
    y = ensureSpace(doc, y, 5);
    doc.setTextColor(...TEXT_BLACK);
    doc.text(label, MARGIN, y);
    doc.text(formatPercent(value), MARGIN + contentW, y, { align: 'right' });
    y += 4.5;
  }

  if (input.inputs.lines.length > 0) {
    y += 3;
    y = ensureSpace(doc, y, 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Linhas detalhadas', MARGIN, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    for (const line of input.inputs.lines) {
      y = ensureSpace(doc, y, 5);
      const categoryLabel =
        input.inputs.expenseTypes.find((item) => item.id === line.category)?.label ??
        line.category;
      const text = `${categoryLabel} — ${line.description || 'Sem descrição'}`;
      const lines = doc.splitTextToSize(text, contentW - 40);
      doc.text(lines, MARGIN, y);
      doc.text(formatCurrency(line.amount), MARGIN + contentW, y, { align: 'right' });
      y += Math.max(4.5, lines.length * 4);
    }
  }

  y += 4;
  y = ensureSpace(doc, y, 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_BLACK);
  doc.text('Resultado e fórmulas utilizadas', MARGIN, y);
  y += 6;

  for (const key of LICITACAO_ORCAMENTO_FORMULA_ORDER) {
    const label = LICITACAO_ORCAMENTO_FORMULA_LABELS[key];
    const formula = input.inputs.formulas[key];
    const value = input.result.formulaValues[key] ?? 0;
    const isPercent = key.includes('percent') || key === 'bdi_percent' || key === 'margem_real_simulada';
    const valueText = isPercent ? formatPercent(value) : formatCurrency(value);

    y = ensureSpace(doc, y, 16);
    doc.setFillColor(...HEADER_BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(MARGIN, y - 3.5, contentW, 14, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT_BLACK);
    doc.text(label, MARGIN + 2, y + 1);
    doc.text(valueText, MARGIN + contentW - 2, y + 1, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    const formulaLines = doc.splitTextToSize(`Fórmula: ${formula}`, contentW - 6);
    doc.text(formulaLines, MARGIN + 2, y + 5.5);
    y += 16;
  }

  if (input.inputs.notes?.trim()) {
    y += 2;
    y = ensureSpace(doc, y, 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_BLACK);
    doc.text('Observações', MARGIN, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT_MUTED);
    const noteLines = doc.splitTextToSize(input.inputs.notes.trim(), contentW);
    for (const line of noteLines) {
      y = ensureSpace(doc, y, 5);
      doc.text(line, MARGIN, y);
      y += 4.2;
    }
  }

  drawFooter(doc);
  const datePart = generatedAt.toISOString().slice(0, 10);
  doc.save(`orcamento-licitacao_${datePart}.pdf`);
}
