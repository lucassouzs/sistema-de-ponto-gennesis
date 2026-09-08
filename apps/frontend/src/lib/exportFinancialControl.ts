import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import {
  FINANCIAL_CONTROL_STATUS_EXPORT_LABELS,
  type FinancialControlStatus,
} from '@/lib/financialControlStatus';
import { formatDateBr, parseDateSafe } from '@/lib/dateTimeBr';
import {
  formatFinancialControlObservationDisplay,
  formatOcListDisplayId,
} from '@/components/oc/ocListDisplay';
import { resolveNfAndParcelForDisplay } from '@/components/financeiro/financialControlEntry';
import { loadPdfBrandingLogo } from '@/lib/loadPdfBrandingLogo';
import {
  readStoredUnbBranding,
  resolveOcPdfCompanyHeader,
} from '@/lib/unbBranding';

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const BRAND_RED: [number, number, number] = [185, 28, 28];
const HEADER_BG: [number, number, number] = [248, 249, 250];
const ROW_ALT: [number, number, number] = [249, 250, 251];
const BORDER: [number, number, number] = [209, 213, 219];
const TEXT_BLACK: [number, number, number] = [17, 24, 39];
const TEXT_MUTED: [number, number, number] = [75, 85, 99];
const MARGIN = 10;
const FOOTER_RESERVE = 12;

export type FinancialControlExportEntry = {
  paymentMonth: number;
  paymentYear: number;
  status: string;
  osCode: string | null;
  supplierName: string | null;
  nfNumber?: string | null;
  parcelNumber: string | null;
  emissionDate: string | null;
  boleto: string | null;
  dueDate: string | null;
  originalValue: string | number | null;
  ocNumber: string | null;
  finalValue: string | number | null;
  paidDate: string | null;
  remainingDays: number | null;
  receivedNote: string | null;
};

export type FinancialControlExportFormat = 'excel' | 'pdf';

export type FinancialControlPdfMeta = {
  consorcioLabel: string;
  filterSummary?: string;
  /** Usuário UNB → logo e emitente Consórcio Predial. */
  useUnbBranding?: boolean;
};

function formatDateBrExport(value: string | null | undefined): string {
  if (!value) return '';
  const d = parseDateSafe(value);
  if (!d || d.getFullYear() < 1990) return '';
  return formatDateBr(value, '');
}

function calcRemainingDays(dueDate: string, paidDate: string): number | '' {
  const due = parseDateSafe(dueDate);
  const paid = parseDateSafe(paidDate);
  if (!due || !paid) return '';
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(paid.getFullYear(), paid.getMonth(), paid.getDate());
  return Math.floor((a - b) / (1000 * 60 * 60 * 24));
}

function toNumber(value: string | number | null | undefined): number | '' {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return isNaN(n) ? '' : n;
}

function resolveRemainingDays(entry: FinancialControlExportEntry): number | '' {
  if (entry.dueDate && entry.paidDate) {
    return calcRemainingDays(entry.dueDate, entry.paidDate);
  }
  if (entry.remainingDays === null || entry.remainingDays === undefined) return '';
  return entry.remainingDays;
}

function formatCurrencyPdf(value: string | number | null | undefined): string {
  const n = toNumber(value);
  if (n === '') return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildExportRows(entries: FinancialControlExportEntry[]) {
  return entries.map((entry) => {
    const monthLabel = MONTHS_PT[entry.paymentMonth - 1] ?? String(entry.paymentMonth);
    const { nfNumber, parcelNumber } = resolveNfAndParcelForDisplay(entry);
    return {
      Mês: monthLabel,
      Ano: entry.paymentYear,
      Status:
        FINANCIAL_CONTROL_STATUS_EXPORT_LABELS[entry.status as FinancialControlStatus] ??
        entry.status,
      'O.S.': entry.osCode ?? '',
      'Nome do Fornecedor': entry.supplierName ?? '',
      'Número da NF': nfNumber ?? '',
      Parcela: parcelNumber ?? '',
      'Data Emissão': formatDateBrExport(entry.emissionDate),
      Boleto: entry.boleto ?? '',
      'Data de Vencimento': formatDateBrExport(entry.dueDate),
      'Valor Original': toNumber(entry.originalValue),
      'O.C.': entry.ocNumber ? formatOcListDisplayId(entry.ocNumber) : '',
      'Valor Final': toNumber(entry.finalValue),
      'Data de Pagamento': formatDateBrExport(entry.paidDate),
      'Diferença de Dias': resolveRemainingDays(entry),
      Observação: formatFinancialControlObservationDisplay(entry.receivedNote),
    };
  });
}

export function exportFinancialControlEntries(
  entries: FinancialControlExportEntry[],
  filenameSuffix: string
): void {
  const rows = buildExportRows(entries);

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 12 },
    { wch: 6 },
    { wch: 12 },
    { wch: 14 },
    { wch: 36 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
    { wch: 8 },
    { wch: 16 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 28 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Lançamentos');
  XLSX.writeFile(workbook, `controle-financeiro_${filenameSuffix}.xlsx`);
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
    doc.text(`Controle Financeiro · Exportação · ${dateStr}`, MARGIN, pageHeight - MARGIN - 2.5);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - MARGIN, pageHeight - MARGIN - 2.5, {
      align: 'right',
    });
  }
}

function drawPdfHeader(
  doc: jsPDF,
  logo: Awaited<ReturnType<typeof loadPdfBrandingLogo>>,
  generatedAt: Date,
  companyName: string,
  consorcioLabel: string,
  filterSummary: string | undefined,
  entryCount: number,
  totalFinal: number
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const headerH = 26;

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
  doc.text('Controle Financeiro — Lançamentos', textX, 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`${companyName} · ${consorcioLabel}`, textX, 14.5);

  const dateStr = generatedAt.toLocaleDateString('pt-BR');
  const timeStr = generatedAt.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`Gerado em ${dateStr} às ${timeStr}`, pageWidth - MARGIN, 9, { align: 'right' });
  doc.text(
    `${entryCount} lançamento(s) · Total: ${formatCurrencyPdf(totalFinal)}`,
    pageWidth - MARGIN,
    14.5,
    { align: 'right' }
  );

  let y = headerH + 6;
  if (filterSummary) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(filterSummary, MARGIN, y);
    y += 5;
  }
  return y + 2;
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
  const rowH = 6.5;
  const headerH = 7.5;
  let y = startY;

  const drawHeaderRow = () => {
    y = ensureSpace(doc, y, headerH + 2);
    let x = MARGIN;
    doc.setFillColor(...HEADER_BG);
    doc.setDrawColor(...BORDER);
    doc.rect(MARGIN, y, contentW, headerH, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...TEXT_MUTED);
    headers.forEach((h, i) => {
      doc.text(h, x + 1, y + 5);
      x += colWidths[i];
    });
    y += headerH;
  };

  drawHeaderRow();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);

  rows.forEach((row, rowIdx) => {
    if (y + rowH > getPageBottom(doc)) {
      doc.addPage();
      y = MARGIN + 4;
      drawHeaderRow();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
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
      const maxW = colWidths[i] - 2;
      const text = doc.splitTextToSize(String(cell || '—'), maxW);
      doc.text(text[0] || '—', x + 1, y + 4.4);
      x += colWidths[i];
    });
    y += rowH;
  });

  return y + 4;
}

export async function exportFinancialControlEntriesPdf(
  entries: FinancialControlExportEntry[],
  filenameSuffix: string,
  meta: FinancialControlPdfMeta
): Promise<void> {
  const generatedAt = new Date();
  const useUnb = meta.useUnbBranding ?? readStoredUnbBranding();
  const company = resolveOcPdfCompanyHeader(useUnb);
  const logo = await loadPdfBrandingLogo({
    forceUnbBranding: useUnb,
    maxW: 32,
    maxH: 16,
  });

  const totalFinal = entries.reduce((sum, entry) => {
    if (entry.status === 'CANCELADO') return sum;
    const n = toNumber(entry.finalValue);
    return sum + (n === '' ? 0 : n);
  }, 0);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentW = pageWidth - MARGIN * 2;

  let y = drawPdfHeader(
    doc,
    logo,
    generatedAt,
    company.name,
    meta.consorcioLabel,
    meta.filterSummary,
    entries.length,
    totalFinal
  );

  const headers = [
    'Mês',
    'Ano',
    'Status',
    'O.S.',
    'Fornecedor',
    'NF',
    'Parc.',
    'Emissão',
    'Vencimento',
    'Val. Orig.',
    'O.C.',
    'Val. Final',
    'Pagamento',
    'Obs.',
  ];

  const weights = [0.9, 0.55, 1.3, 0.9, 2.2, 0.85, 0.55, 0.9, 0.95, 1.0, 0.75, 1.0, 0.95, 1.4];
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const colWidths = weights.map((w) => (w / weightSum) * contentW);

  const rows = entries.map((entry) => {
    const monthLabel = MONTHS_PT[entry.paymentMonth - 1] ?? String(entry.paymentMonth);
    const { nfNumber, parcelNumber } = resolveNfAndParcelForDisplay(entry);
    return [
      monthLabel,
      String(entry.paymentYear || '—'),
      FINANCIAL_CONTROL_STATUS_EXPORT_LABELS[entry.status as FinancialControlStatus] ??
        entry.status,
      entry.osCode || '—',
      entry.supplierName || '—',
      nfNumber || '—',
      parcelNumber || '—',
      formatDateBrExport(entry.emissionDate) || '—',
      formatDateBrExport(entry.dueDate) || '—',
      formatCurrencyPdf(entry.originalValue),
      entry.ocNumber ? formatOcListDisplayId(entry.ocNumber) : '—',
      formatCurrencyPdf(entry.finalValue),
      formatDateBrExport(entry.paidDate) || '—',
      formatFinancialControlObservationDisplay(entry.receivedNote) || '—',
    ];
  });

  if (rows.length === 0) {
    y = ensureSpace(doc, y, 10);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Nenhum lançamento para exportar.', MARGIN + 2, y + 4);
  } else {
    drawTable(doc, y, headers, rows, colWidths);
  }

  drawPdfFooters(doc, generatedAt);
  doc.save(`controle-financeiro_${filenameSuffix}.pdf`);
}
