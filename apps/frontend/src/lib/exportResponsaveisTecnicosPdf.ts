import jsPDF from 'jspdf';
import { EXPORT_COMPANY, loadPdfDualLogoStrip } from '@/lib/exportBrandingLogos';
import type { ResponsavelTecnicoExportRow } from '@/lib/responsavelTecnicoImport';

const BRAND_RED: [number, number, number] = [185, 28, 28];
const HEADER_BG: [number, number, number] = [248, 249, 250];
const SECTION_BG: [number, number, number] = [241, 245, 249];
const ROW_ALT: [number, number, number] = [249, 250, 251];
const BORDER: [number, number, number] = [209, 213, 219];
const TEXT_BLACK: [number, number, number] = [17, 24, 39];
const TEXT_MUTED: [number, number, number] = [75, 85, 99];
const TEXT_GREEN: [number, number, number] = [22, 101, 52];
const TEXT_AMBER: [number, number, number] = [146, 64, 14];

const MARGIN = 12;
const FOOTER_RESERVE = 12;

type Col = { key: string; label: string; width: number };

const COLS: Col[] = [
  { key: 'n', label: '#', width: 10 },
  { key: 'crea', label: 'CREA', width: 14 },
  { key: 'profissional', label: 'PROFISSIONAL', width: 62 },
  { key: 'empresa', label: 'EMPRESA', width: 38 },
  { key: 'titulo', label: 'TÍTULO', width: 48 },
  { key: 'status', label: 'STATUS', width: 22 },
  { key: 'anuidade', label: 'ANUIDADE', width: 22 },
];

function formatExportDate(value?: string | null): string {
  if (!value) return '—';
  const raw = String(value).trim();
  if (!raw) return '—';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function extractUf(crea?: string | null): string {
  const raw = String(crea || '').trim().toUpperCase();
  if (!raw) return '—';
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  const m = raw.match(/\b([A-Z]{2})\b/);
  return m?.[1] || raw.slice(0, 2) || '—';
}

function getPageBottom(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight() - MARGIN - FOOTER_RESERVE;
}

function drawHeader(
  doc: jsPDF,
  pageWidth: number,
  logo: { dataUrl: string; wMm: number; hMm: number } | null,
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
  doc.text('Licitações — Responsáveis Técnicos', textX, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(EXPORT_COMPANY, textX, 17);

  const dateStr = generatedAt.toLocaleDateString('pt-BR');
  const timeStr = generatedAt.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Gerado em ${dateStr} às ${timeStr}`, pageWidth - MARGIN, 11, { align: 'right' });
  doc.text(
    `${total} profissional${total === 1 ? '' : 'is'} na lista`,
    pageWidth - MARGIN,
    17,
    { align: 'right' }
  );

  return headerH + 8;
}

function drawTableHeader(doc: jsPDF, y: number): number {
  const rowH = 8;
  let x = MARGIN;
  doc.setFillColor(...SECTION_BG);
  doc.setDrawColor(...BORDER);
  doc.rect(
    MARGIN,
    y,
    COLS.reduce((a, c) => a + c.width, 0),
    rowH,
    'FD'
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_MUTED);
  for (const col of COLS) {
    doc.text(col.label, x + 1.5, y + 5.2);
    x += col.width;
  }
  return y + rowH;
}

function drawRow(
  doc: jsPDF,
  y: number,
  index: number,
  row: ResponsavelTecnicoExportRow,
  alt: boolean
): number {
  const profissional = String(row.profissional || '—').trim() || '—';
  const registro = String(row.registro || '').trim();
  const empresa = String(row.empresa || '—').trim() || '—';
  const titulo = String(row.titulo || '—').trim() || '—';
  const status = String(row.status || '—').trim().toUpperCase() || '—';
  const anuidade = String(row.anuidade2026 || '—').trim().toUpperCase() || '—';
  const crea = extractUf(row.crea);

  const values: Record<string, string> = {
    n: String(index),
    crea,
    profissional: registro ? `${profissional} · ${registro}` : profissional,
    empresa,
    titulo,
    status,
    anuidade,
  };

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  const lineHeights: number[] = COLS.map((col) => {
    const lines = doc.splitTextToSize(values[col.key] || '—', col.width - 3) as string[];
    return Math.max(1, lines.length);
  });
  const maxLines = Math.max(...lineHeights);
  const rowH = Math.max(7.5, maxLines * 3.4 + 3.2);

  if (alt) {
    doc.setFillColor(...ROW_ALT);
    doc.rect(
      MARGIN,
      y,
      COLS.reduce((a, c) => a + c.width, 0),
      rowH,
      'F'
    );
  }

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y + rowH, MARGIN + COLS.reduce((a, c) => a + c.width, 0), y + rowH);

  let x = MARGIN;
  for (const col of COLS) {
    const lines = doc.splitTextToSize(values[col.key] || '—', col.width - 3) as string[];
    let ly = y + 4.2;
    for (const line of lines) {
      if (col.key === 'status') {
        doc.setTextColor(...(status === 'ATIVO' ? TEXT_GREEN : TEXT_AMBER));
        doc.setFont('helvetica', 'bold');
      } else if (col.key === 'n' || col.key === 'crea') {
        doc.setTextColor(...TEXT_MUTED);
        doc.setFont('helvetica', 'normal');
      } else {
        doc.setTextColor(...TEXT_BLACK);
        doc.setFont('helvetica', col.key === 'profissional' ? 'bold' : 'normal');
      }
      doc.text(line, x + 1.5, ly);
      ly += 3.4;
    }
    x += col.width;
  }

  return y + rowH;
}

function drawFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`${EXPORT_COMPANY} — Responsáveis Técnicos`, MARGIN, pageH - 5);
    doc.text(`Página ${p} de ${pageCount}`, pageW - MARGIN, pageH - 5, { align: 'right' });
  }
}

export async function exportResponsaveisTecnicosPdf(
  entries: ResponsavelTecnicoExportRow[],
  filenameSuffix?: string
): Promise<void> {
  if (!entries.length) {
    throw new Error('Nenhum registro para exportar');
  }

  const generatedAt = new Date();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const logo = await loadPdfDualLogoStrip(16);

  let y = drawHeader(doc, pageWidth, logo, generatedAt, entries.length);

  doc.setFillColor(...HEADER_BG);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(MARGIN, y, pageWidth - MARGIN * 2, 10, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(
    'Cadastro de profissionais CREA para o módulo de Licitações. Lista conforme filtros aplicados na tela.',
    MARGIN + 3,
    y + 6.2
  );
  y += 14;

  y = drawTableHeader(doc, y);

  entries.forEach((row, idx) => {
    const bottom = getPageBottom(doc);
    if (y + 10 > bottom) {
      doc.addPage();
      y = drawHeader(doc, pageWidth, logo, generatedAt, entries.length);
      y = drawTableHeader(doc, y);
    }
    y = drawRow(doc, y, idx + 1, row, idx % 2 === 1);
  });

  drawFooter(doc);
  const suffix = filenameSuffix || new Date().toISOString().slice(0, 10);
  doc.save(`responsaveis-tecnicos_${suffix}.pdf`);
}
