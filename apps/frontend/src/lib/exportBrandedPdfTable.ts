import jsPDF from 'jspdf';
import { EXPORT_COMPANY, loadPdfDualLogoStrip } from '@/lib/exportBrandingLogos';

const BRAND_RED: [number, number, number] = [185, 28, 28];
const HEADER_BG: [number, number, number] = [248, 249, 250];
const SECTION_BG: [number, number, number] = [241, 245, 249];
const ROW_ALT: [number, number, number] = [249, 250, 251];
const BORDER: [number, number, number] = [209, 213, 219];
const TEXT_BLACK: [number, number, number] = [17, 24, 39];
const TEXT_MUTED: [number, number, number] = [75, 85, 99];
const TEXT_GREEN: [number, number, number] = [22, 101, 52];
const TEXT_AMBER: [number, number, number] = [146, 64, 14];
const TEXT_RED: [number, number, number] = [153, 27, 27];

const MARGIN = 12;
const FOOTER_RESERVE = 12;

export type BrandedPdfColumn = {
  key: string;
  label: string;
  width: number;
  tone?: 'status' | 'muted' | 'bold';
};

export type ExportBrandedPdfOptions = {
  title: string;
  subtitle?: string;
  filename: string;
  columns: BrandedPdfColumn[];
  rows: Record<string, string>[];
  footerLabel?: string;
};

function statusColor(value: string): [number, number, number] {
  const v = value.trim().toUpperCase();
  if (['ATIVO', 'PAGO', 'SIM'].includes(v)) return TEXT_GREEN;
  if (['PENDENTE', 'EM_ABERTA', 'EM ABERTO', 'NAO', 'NÃO'].includes(v)) return TEXT_AMBER;
  if (['VENCIDO', 'VENCIDA', 'BAIXADA', 'INATIVO'].includes(v)) return TEXT_RED;
  return TEXT_MUTED;
}

function getPageBottom(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight() - MARGIN - FOOTER_RESERVE;
}

function drawHeader(
  doc: jsPDF,
  pageWidth: number,
  logo: { dataUrl: string; wMm: number; hMm: number } | null,
  title: string,
  generatedAt: Date,
  total: number
): number {
  const headerH = Math.max(26, (logo?.hMm || 0) + 10);
  doc.setFillColor(...HEADER_BG);
  doc.rect(0, 0, pageWidth, headerH, 'F');
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, headerH - 1, pageWidth, 1, 'F');

  let textX = MARGIN;
  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', MARGIN, 4, logo.wMm, logo.hMm);
    textX = MARGIN + logo.wMm + 5;
  }

  doc.setTextColor(...TEXT_BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, textX, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(EXPORT_COMPANY, textX, 17);

  const dateStr = generatedAt.toLocaleDateString('pt-BR');
  const timeStr = generatedAt.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`Gerado em ${dateStr} às ${timeStr}`, pageWidth - MARGIN, 11, { align: 'right' });
  doc.text(
    `${total} registro${total === 1 ? '' : 's'}`,
    pageWidth - MARGIN,
    17,
    { align: 'right' }
  );

  return headerH + 8;
}

function drawTableHeader(doc: jsPDF, y: number, columns: BrandedPdfColumn[]): number {
  const rowH = 8;
  const tableW = columns.reduce((a, c) => a + c.width, 0);
  doc.setFillColor(...SECTION_BG);
  doc.setDrawColor(...BORDER);
  doc.rect(MARGIN, y, tableW, rowH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  let x = MARGIN;
  for (const col of columns) {
    doc.text(col.label, x + 1.5, y + 5.2);
    x += col.width;
  }
  return y + rowH;
}

function drawRow(
  doc: jsPDF,
  y: number,
  columns: BrandedPdfColumn[],
  values: Record<string, string>,
  alt: boolean
): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  const lineHeights = columns.map((col) => {
    const lines = doc.splitTextToSize(values[col.key] || '—', col.width - 3) as string[];
    return Math.max(1, lines.length);
  });
  const maxLines = Math.max(...lineHeights);
  const rowH = Math.max(7.5, maxLines * 3.4 + 3.2);
  const tableW = columns.reduce((a, c) => a + c.width, 0);

  if (alt) {
    doc.setFillColor(...ROW_ALT);
    doc.rect(MARGIN, y, tableW, rowH, 'F');
  }

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y + rowH, MARGIN + tableW, y + rowH);

  let x = MARGIN;
  for (const col of columns) {
    const raw = values[col.key] || '—';
    const lines = doc.splitTextToSize(raw, col.width - 3) as string[];
    let ly = y + 4.2;
    for (const line of lines) {
      if (col.tone === 'status') {
        doc.setTextColor(...statusColor(raw));
        doc.setFont('helvetica', 'bold');
      } else if (col.tone === 'muted') {
        doc.setTextColor(...TEXT_MUTED);
        doc.setFont('helvetica', 'normal');
      } else if (col.tone === 'bold') {
        doc.setTextColor(...TEXT_BLACK);
        doc.setFont('helvetica', 'bold');
      } else {
        doc.setTextColor(...TEXT_BLACK);
        doc.setFont('helvetica', 'normal');
      }
      doc.text(line, x + 1.5, ly);
      ly += 3.4;
    }
    x += col.width;
  }

  return y + rowH;
}

function drawFooter(doc: jsPDF, footerLabel: string) {
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`${EXPORT_COMPANY} — ${footerLabel}`, MARGIN, pageH - 5);
    doc.text(`Página ${p} de ${pageCount}`, pageW - MARGIN, pageH - 5, { align: 'right' });
  }
}

export async function exportBrandedPdfTable(options: ExportBrandedPdfOptions): Promise<void> {
  const { title, subtitle, filename, columns, rows, footerLabel } = options;
  if (!rows.length) throw new Error('Nenhum registro para exportar');

  const generatedAt = new Date();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const logo = await loadPdfDualLogoStrip(16);

  let y = drawHeader(doc, pageWidth, logo, title, generatedAt, rows.length);

  if (subtitle) {
    doc.setFillColor(...HEADER_BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(MARGIN, y, pageWidth - MARGIN * 2, 10, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(subtitle, MARGIN + 3, y + 6.2);
    y += 14;
  }

  y = drawTableHeader(doc, y, columns);

  rows.forEach((row, idx) => {
    if (y + 10 > getPageBottom(doc)) {
      doc.addPage();
      y = drawHeader(doc, pageWidth, logo, title, generatedAt, rows.length);
      y = drawTableHeader(doc, y, columns);
    }
    y = drawRow(doc, y, columns, row, idx % 2 === 1);
  });

  drawFooter(doc, footerLabel || title);
  doc.save(filename);
}
