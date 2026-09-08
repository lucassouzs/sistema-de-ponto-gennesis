import jsPDF from 'jspdf';
import type { GestaoOsAssetQr } from '@/app/ponto/sistema-gestao-os/gestaoOsTypes';
import { loadPdfBrandingLogo, type PdfBrandingLogo } from '@/lib/loadPdfBrandingLogo';

function locationLine(label: GestaoOsAssetQr): string {
  const parts = [label.buildingName, label.sectorName, label.placeName]
    .map((part) => part?.trim())
    .filter(Boolean) as string[];
  if (parts.length) return parts.join('  ·  ');
  return label.locationLabel.replace(/ › /g, '  ·  ');
}

function expandLabels(
  labels: GestaoOsAssetQr[],
  quantities?: Record<string, number>
): GestaoOsAssetQr[] {
  if (!quantities) return labels;
  const expanded: GestaoOsAssetQr[] = [];
  for (const label of labels) {
    const qty = Math.min(20, Math.max(0, Math.round(Number(quantities[label.assetId]) || 0)));
    for (let i = 0; i < qty; i += 1) expanded.push(label);
  }
  return expanded;
}

export async function downloadGestaoOsAssetQrLabelsPdf(
  labels: GestaoOsAssetQr[],
  opts?: {
    companyName?: string;
    forceUnbBranding?: boolean;
    quantities?: Record<string, number>;
  }
): Promise<number> {
  const copies = expandLabels(labels, opts?.quantities).slice(0, 200);
  if (!copies.length) return 0;

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 12;
  const marginY = 14;
  const cols = 2;
  const labelW = 90;
  const labelH = 54;
  const gapX = (pageW - marginX * 2 - labelW * cols) / (cols - 1);
  const gapY = 8;
  const rowsPerPage = Math.max(1, Math.floor((pageH - marginY * 2 + gapY) / (labelH + gapY)));
  const perPage = cols * rowsPerPage;
  const companyName = opts?.companyName?.trim() || 'Gennesis Engenharia';

  const logo = await loadPdfBrandingLogo({
    userBrandingOnly: true,
    forceUnbBranding: opts?.forceUnbBranding,
    maxW: 24,
    maxH: 12
  });

  copies.forEach((label, index) => {
    if (index > 0 && index % perPage === 0) pdf.addPage();
    const slot = index % perPage;
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const x = marginX + col * (labelW + gapX);
    const y = marginY + row * (labelH + gapY);
    drawLabel(pdf, { x, y, w: labelW, h: labelH, label, companyName, logo });
  });

  pdf.save(copies.length === 1 ? 'etiqueta-qr-ativo.pdf' : 'etiquetas-qr-ativos.pdf');
  return copies.length;
}

function drawCropMarks(pdf: jsPDF, x: number, y: number, w: number, h: number) {
  const len = 2.2;
  const gap = 1.5;
  pdf.setDrawColor(190, 190, 190);
  pdf.setLineWidth(0.12);
  const marks: Array<[number, number, number, number]> = [
    [x - gap - len, y, x - gap, y],
    [x, y - gap - len, x, y - gap],
    [x + w + gap, y, x + w + gap + len, y],
    [x + w, y - gap - len, x + w, y - gap],
    [x - gap - len, y + h, x - gap, y + h],
    [x, y + h + gap, x, y + h + gap + len],
    [x + w + gap, y + h, x + w + gap + len, y + h],
    [x + w, y + h + gap, x + w, y + h + gap + len]
  ];
  for (const [x1, y1, x2, y2] of marks) pdf.line(x1, y1, x2, y2);
}

function drawLabel(
  pdf: jsPDF,
  input: {
    x: number;
    y: number;
    w: number;
    h: number;
    label: GestaoOsAssetQr;
    companyName: string;
    logo: PdfBrandingLogo | null;
  }
) {
  const { x, y, w, h, label, companyName, logo } = input;
  const leftW = w * 0.52;
  const pad = 5;
  const ink: [number, number, number] = [24, 24, 27];
  const mute: [number, number, number] = [113, 113, 122];
  const textX = x + pad + 1;
  const copyW = leftW - pad * 2;

  drawCropMarks(pdf, x, y, w, h);

  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(228, 228, 231);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(x, y, w, h, 3.2, 3.2, 'FD');

  const brandY = y + 6.5;
  let brandTextX = textX;
  if (logo) {
    const maxH = 8;
    const scale = Math.min(maxH / logo.hMm, 14 / logo.wMm, 1);
    const lw = logo.wMm * scale;
    const lh = logo.hMm * scale;
    pdf.addImage(logo.dataUrl, 'PNG', textX, brandY, lw, lh);
    brandTextX = textX + lw + 2.2;
    pdf.setTextColor(...ink);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text(companyName.replace(/ Engenharia.*$/i, ''), brandTextX, brandY + lh * 0.72);
  } else {
    pdf.setTextColor(...ink);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text(companyName.replace(/ Engenharia.*$/i, ''), textX, brandY + 6);
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  const nameLines = pdf.splitTextToSize(label.name, copyW).slice(0, 2) as string[];
  const location = locationLine(label);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  const locLines = location ? (pdf.splitTextToSize(location, copyW).slice(0, 2) as string[]) : [];

  const nameLh = 3.8;
  const locLh = 3.1;
  let baseline = y + h - 6.5;
  if (locLines.length) {
    const firstLoc = baseline - (locLines.length - 1) * locLh;
    pdf.setTextColor(...mute);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.text(locLines, textX, firstLoc);
    baseline = firstLoc - 4.2;
  }

  pdf.setTextColor(...ink);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  const firstName = baseline - (nameLines.length - 1) * nameLh;
  pdf.text(nameLines, textX, firstName);

  const qrBox = Math.min(h - pad * 2, w - leftW - pad);
  const qrX = x + leftW + (w - leftW - qrBox - pad) / 2;
  const qrY = y + (h - qrBox) / 2;
  if (label.dataUrl) {
    pdf.addImage(label.dataUrl, 'PNG', qrX, qrY, qrBox, qrBox);
  }
}
