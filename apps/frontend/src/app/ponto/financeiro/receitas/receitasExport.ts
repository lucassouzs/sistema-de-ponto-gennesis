import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { loadPdfBrandingLogo } from '@/lib/loadPdfBrandingLogo';
import { formatDateBr } from '@/lib/dateTimeBr';
import {
  readStoredUnbBranding,
  resolveOcPdfCompanyHeader,
} from '@/lib/unbBranding';
import {
  parseMesAno,
  type ReceitaRow,
  type RepasseRow,
} from './receitasImport';

export type ReceitasExportSectionKey =
  | 'receitas-bsb'
  | 'receitas-hub'
  | 'repasses-bsb'
  | 'repasses-hub';

export type ReceitasExportFormat = 'excel' | 'pdf';

export const RECEITAS_EXPORT_SECTIONS: Array<{
  key: ReceitasExportSectionKey;
  label: string;
  sheetName: string;
}> = [
  { key: 'receitas-bsb', label: 'Receitas BSB', sheetName: 'Receitas BSB' },
  { key: 'receitas-hub', label: 'Receitas HUB', sheetName: 'Receitas HUB' },
  { key: 'repasses-bsb', label: 'Repasses BSB', sheetName: 'Repasses BSB' },
  { key: 'repasses-hub', label: 'Repasses HUB', sheetName: 'Repasses HUB' },
];

const BRAND_RED: [number, number, number] = [185, 28, 28];
const HEADER_BG: [number, number, number] = [248, 249, 250];
const ROW_ALT: [number, number, number] = [249, 250, 251];
const BORDER: [number, number, number] = [209, 213, 219];
const TEXT_BLACK: [number, number, number] = [17, 24, 39];
const TEXT_MUTED: [number, number, number] = [75, 85, 99];
const MARGIN = 12;
const FOOTER_RESERVE = 12;

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatMes(mesRaw: string): string {
  return parseMesAno(mesRaw)?.mesLabel ?? mesRaw ?? '—';
}

function formatAno(mesRaw: string): string {
  const ano = parseMesAno(mesRaw)?.ano;
  return ano ? String(ano) : '—';
}

function formatDateCell(raw: string): string {
  if (!raw?.trim()) return '—';
  const br = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    let y = Number(br[3]);
    if (y < 100) y += 2000;
    const ymd = `${y}-${String(Number(br[2])).padStart(2, '0')}-${String(Number(br[1])).padStart(2, '0')}`;
    return formatDateBr(ymd, raw);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw.trim())) return formatDateBr(raw, raw);
  return raw;
}

function receitaStatusText(row: ReceitaRow): string {
  if (row.status === 'RECEBIDO' && row.statusData) {
    return `RECEBIDO - ${row.statusData}`;
  }
  return row.status;
}

function sortReceitas(rows: ReceitaRow[]): ReceitaRow[] {
  return [...rows].sort((a, b) => {
    const pa = parseMesAno(a.mes);
    const pb = parseMesAno(b.mes);
    const va = pa ? pa.ano * 100 + pa.mesNumero : 0;
    const vb = pb ? pb.ano * 100 + pb.mesNumero : 0;
    return vb - va;
  });
}

function sortRepasses(rows: RepasseRow[]): RepasseRow[] {
  return [...rows].sort((a, b) => {
    const da = formatDateCell(a.dataEmissao || a.data);
    const db = formatDateCell(b.dataEmissao || b.data);
    return db.localeCompare(da, 'pt-BR');
  });
}

function receitasToAoa(rows: ReceitaRow[]): (string | number)[][] {
  const header = [
    'Mês',
    'Ano',
    'NF',
    'Faturamento do mês',
    'Recebimento líquido',
    'Status',
  ];
  const body = sortReceitas(rows).map((row) => [
    formatMes(row.mes),
    formatAno(row.mes),
    row.nf,
    row.faturamento ?? '',
    row.recebimentoLiquido ?? '',
    receitaStatusText(row),
  ]);
  return [header, ...body];
}

function repassesToAoa(rows: RepasseRow[]): (string | number)[][] {
  const header = [
    'Fornecedor',
    'Parcela',
    'Emissão',
    'Boleto',
    'Data',
    'Valor original',
    'O.C.',
    'Valor final',
    'Pagamentos',
  ];
  const body = sortRepasses(rows).map((row) => [
    row.fornecedor,
    row.parcela,
    formatDateCell(row.dataEmissao),
    row.boleto,
    formatDateCell(row.data),
    row.valorOriginal,
    row.oc,
    row.valorFinal,
    formatDateCell(row.pagamento),
  ]);
  return [header, ...body];
}

export type ExportReceitasInput = {
  sections: ReceitasExportSectionKey[];
  receitas: ReceitaRow[];
  repasses: RepasseRow[];
};

function getSectionRows(
  key: ReceitasExportSectionKey,
  receitas: ReceitaRow[],
  repasses: RepasseRow[]
): { kind: 'receitas' | 'repasses'; aoa: (string | number)[][]; count: number } {
  if (key === 'receitas-bsb' || key === 'receitas-hub') {
    const consorcio = key === 'receitas-bsb' ? 'bsb' : 'hub';
    const rows = receitas.filter((r) => r.consorcio === consorcio);
    return { kind: 'receitas', aoa: receitasToAoa(rows), count: rows.length };
  }
  const consorcio = key === 'repasses-bsb' ? 'bsb' : 'hub';
  const rows = repasses.filter((r) => r.consorcio === consorcio);
  return { kind: 'repasses', aoa: repassesToAoa(rows), count: rows.length };
}

export function exportReceitasExcel(input: ExportReceitasInput): void {
  if (input.sections.length === 0) {
    throw new Error('Selecione ao menos um item para exportar.');
  }

  const wb = XLSX.utils.book_new();
  let added = 0;

  for (const key of input.sections) {
    const meta = RECEITAS_EXPORT_SECTIONS.find((s) => s.key === key);
    if (!meta) continue;
    const { aoa } = getSectionRows(key, input.receitas, input.repasses);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = aoa[0].map((_, colIdx) => {
      const maxLen = aoa.reduce((max, row) => {
        const cell = row[colIdx];
        const len = cell == null ? 0 : String(cell).length;
        return Math.max(max, len);
      }, 8);
      return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
    });
    XLSX.utils.book_append_sheet(wb, ws, meta.sheetName.slice(0, 31));
    added += 1;
  }

  if (added === 0) {
    throw new Error('Nenhum dado para exportar.');
  }

  const suffix = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `receitas-export_${suffix}.xlsx`);
}

function getPageBottom(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight() - MARGIN - FOOTER_RESERVE;
}

function ensureSpace(doc: jsPDF, y: number, need: number): number {
  if (y + need > getPageBottom(doc)) {
    doc.addPage();
    return MARGIN + 4;
  }
  return y;
}

function drawPdfFooters(doc: jsPDF, generatedAt: Date) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const dateStr = generatedAt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.line(MARGIN, pageHeight - MARGIN - 7, pageWidth - MARGIN, pageHeight - MARGIN - 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Receitas · Exportação · ${dateStr}`, MARGIN, pageHeight - MARGIN - 2.5);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - MARGIN, pageHeight - MARGIN - 2.5, {
      align: 'right',
    });
  }
}

function drawPdfHeader(
  doc: jsPDF,
  logo: Awaited<ReturnType<typeof loadPdfBrandingLogo>>,
  generatedAt: Date,
  companyName: string
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const headerH = 24;

  doc.setFillColor(...HEADER_BG);
  doc.rect(0, 0, pageWidth, headerH, 'F');
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, headerH - 1.2, pageWidth, 1.2, 'F');

  let textX = MARGIN;
  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', MARGIN, 3.5, logo.wMm, logo.hMm);
    textX = MARGIN + logo.wMm + 4;
  }

  doc.setTextColor(...TEXT_BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Receitas — Exportação financeira', textX, 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(companyName, textX, 16);

  const dateStr = generatedAt.toLocaleDateString('pt-BR');
  const timeStr = generatedAt.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`Gerado em ${dateStr} às ${timeStr}`, pageWidth - MARGIN, 10, { align: 'right' });

  return headerH + 8;
}

function drawSectionTitle(doc: jsPDF, y: number, title: string, count: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentW = pageWidth - MARGIN * 2;
  y = ensureSpace(doc, y, 12);

  doc.setFillColor(...BRAND_RED);
  doc.roundedRect(MARGIN, y, contentW, 9, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(title, MARGIN + 3.5, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `${count} ${count === 1 ? 'registro' : 'registros'}`,
    pageWidth - MARGIN - 3.5,
    y + 6,
    { align: 'right' }
  );
  return y + 12;
}

function drawTable(
  doc: jsPDF,
  startY: number,
  headers: string[],
  rows: string[][],
  colWidths: number[]
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentW = pageWidth - MARGIN * 2;
  const rowH = 7;
  const headerH = 8;
  let y = startY;

  const drawHeaderRow = () => {
    y = ensureSpace(doc, y, headerH + 2);
    let x = MARGIN;
    doc.setFillColor(...HEADER_BG);
    doc.setDrawColor(...BORDER);
    doc.rect(MARGIN, y, contentW, headerH, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    headers.forEach((h, i) => {
      doc.text(h, x + 1.5, y + 5.2);
      x += colWidths[i];
    });
    y += headerH;
  };

  drawHeaderRow();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  rows.forEach((row, rowIdx) => {
    if (y + rowH > getPageBottom(doc)) {
      doc.addPage();
      y = MARGIN + 4;
      drawHeaderRow();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
    }

    let x = MARGIN;
    if (rowIdx % 2 === 1) {
      doc.setFillColor(...ROW_ALT);
      doc.rect(MARGIN, y, contentW, rowH, 'F');
    }
    doc.setDrawColor(...BORDER);
    doc.rect(MARGIN, y, contentW, rowH, 'S');
    doc.setTextColor(...TEXT_BLACK);

    row.forEach((cell, i) => {
      const maxW = colWidths[i] - 3;
      const text = doc.splitTextToSize(String(cell || '—'), maxW);
      doc.text(text[0] || '—', x + 1.5, y + 4.8);
      x += colWidths[i];
    });
    y += rowH;
  });

  return y + 6;
}

function aoaToPdfRows(aoa: (string | number)[][]): { headers: string[]; rows: string[][] } {
  const headers = (aoa[0] ?? []).map(String);
  const rows = aoa.slice(1).map((row) =>
    row.map((cell, idx) => {
      if (typeof cell === 'number' && Number.isFinite(cell)) {
        // currency-like columns for receitas (3,4) and repasses (5,7)
        if (
          headers[idx]?.toLowerCase().includes('valor') ||
          headers[idx]?.toLowerCase().includes('faturamento') ||
          headers[idx]?.toLowerCase().includes('recebimento')
        ) {
          return formatCurrency(cell);
        }
        return String(cell);
      }
      return cell == null || cell === '' ? '—' : String(cell);
    })
  );
  return { headers, rows };
}

function colWidthsFor(headers: string[], contentW: number): number[] {
  const weights = headers.map((h) => {
    const n = h.toLowerCase();
    if (n.includes('fornecedor')) return 2.4;
    if (n.includes('status')) return 1.8;
    if (n.includes('faturamento') || n.includes('recebimento') || n.includes('valor')) return 1.5;
    if (n === 'nf' || n === 'ano' || n === 'o.c.' || n === 'boleto') return 0.7;
    if (n === 'mês' || n === 'mes') return 1.1;
    return 1;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / sum) * contentW);
}

export async function exportReceitasPdf(input: ExportReceitasInput): Promise<void> {
  if (input.sections.length === 0) {
    throw new Error('Selecione ao menos um item para exportar.');
  }

  const generatedAt = new Date();
  const useUnb = readStoredUnbBranding();
  const company = resolveOcPdfCompanyHeader(useUnb);
  const logo = await loadPdfBrandingLogo({
    userBrandingOnly: true,
    maxW: 32,
    maxH: 16,
  });
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentW = pageWidth - MARGIN * 2;

  let y = drawPdfHeader(doc, logo, generatedAt, company.name);
  let sectionsDrawn = 0;

  for (const key of input.sections) {
    const meta = RECEITAS_EXPORT_SECTIONS.find((s) => s.key === key);
    if (!meta) continue;
    const { aoa, count } = getSectionRows(key, input.receitas, input.repasses);
    const { headers, rows } = aoaToPdfRows(aoa);

    y = drawSectionTitle(doc, y, meta.label, count);

    if (count === 0) {
      y = ensureSpace(doc, y, 10);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...TEXT_MUTED);
      doc.text('Nenhum registro nesta seção.', MARGIN + 2, y + 4);
      y += 12;
      sectionsDrawn += 1;
      continue;
    }

    const widths = colWidthsFor(headers, contentW);
    y = drawTable(doc, y, headers, rows, widths);
    sectionsDrawn += 1;
  }

  if (sectionsDrawn === 0) {
    throw new Error('Nenhum dado para exportar.');
  }

  drawPdfFooters(doc, generatedAt);
  const suffix = generatedAt.toISOString().slice(0, 10);
  doc.save(`receitas-export_${suffix}.pdf`);
}
