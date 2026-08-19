import jsPDF from 'jspdf';
import type { GestaoOsReportsSummary } from '@/app/ponto/sistema-gestao-os/gestaoOsTypes';
import { STATUS_LABELS } from '@/app/ponto/sistema-gestao-os/gestaoOsTypes';
import { loadPdfBrandingLogo } from '@/lib/loadPdfBrandingLogo';

export async function exportGestaoOsReportsPdf(data: GestaoOsReportsSummary) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  let y = 14;

  const ensure = (need = 10) => {
    if (y + need < pageH - 12) return;
    pdf.addPage();
    y = 16;
  };

  try {
    const logo = await loadPdfBrandingLogo();
    if (logo) pdf.addImage(logo.dataUrl, 'PNG', 14, 10, logo.wMm, logo.hMm);
  } catch {
    /* sem logo */
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('Relatório gerencial de OS', pageW / 2, y, { align: 'center' });
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, pageW / 2, y, { align: 'center' });
  y += 10;

  const cards: Array<[string, string]> = [
    ['Em aberto', String(data.openLike)],
    ['Resolvidas', String(data.resolved ?? 0)],
    ['Pendentes', String(data.pending ?? data.openLike)],
    ['Atrasadas', String(data.overdue)],
    ['MTTR (h)', data.mttrHours != null ? String(data.mttrHours) : '—']
  ];
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Indicadores', 14, y);
  y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  for (const [label, value] of cards) {
    ensure();
    pdf.text(`${label}: ${value}`, 14, y);
    y += 5;
  }

  y += 3;
  ensure(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Por fase', 14, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  for (const [status, count] of Object.entries(data.byStatus)) {
    if (!count) continue;
    ensure();
    pdf.text(`${STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status}: ${count}`, 14, y);
    y += 5;
  }

  y += 3;
  ensure(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Volume mensal por tipo', 14, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  for (const month of data.monthlyByCategory || []) {
    ensure(8);
    pdf.text(`${month.month} — total ${month.total}`, 14, y);
    y += 5;
    for (const row of month.byCategory) {
      ensure();
      pdf.text(`  ${row.category}: ${row.count}`, 16, y);
      y += 4.5;
    }
  }

  y += 3;
  ensure(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Insumos / materiais', 14, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  if (!data.materials?.length) {
    pdf.text('Nenhum material lançado nas OS.', 14, y);
    y += 5;
  } else {
    for (const row of data.materials.slice(0, 30)) {
      ensure();
      pdf.text(
        `${row.name}: qtd ${row.quantity} · R$ ${row.cost.toFixed(2)} · ${row.osCount} OS`,
        14,
        y
      );
      y += 5;
    }
  }

  y += 3;
  ensure(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Pendências', 14, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  if (!data.pendencias?.length) {
    pdf.text('Nenhuma OS pendente.', 14, y);
  } else {
    for (const row of data.pendencias.slice(0, 40)) {
      ensure(8);
      const wrapped = pdf.splitTextToSize(
        `${row.label} · ${STATUS_LABELS[row.status]} · ${row.category} · ${row.locationLabel || '—'}`,
        pageW - 28
      );
      pdf.text(wrapped, 14, y);
      y += wrapped.length * 4.5;
    }
  }

  pdf.save(`relatorio-os-${new Date().toISOString().slice(0, 10)}.pdf`);
}
