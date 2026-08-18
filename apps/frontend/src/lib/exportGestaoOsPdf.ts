import jsPDF from 'jspdf';
import type { GestaoOsWorkOrder } from '@/app/ponto/sistema-gestao-os/gestaoOsTypes';
import {
  MAINTENANCE_TYPE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS
} from '@/app/ponto/sistema-gestao-os/gestaoOsTypes';
import { loadPdfBrandingLogo } from '@/lib/loadPdfBrandingLogo';

function formatDt(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

function money(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export async function exportGestaoOsPdf(detail: GestaoOsWorkOrder) {
  const pdf = await buildGestaoOsPdf(detail);
  pdf.save(gestaoOsPdfFileName(detail));
}

async function buildGestaoOsPdf(detail: GestaoOsWorkOrder) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  let y = 14;

  try {
    const logo = await loadPdfBrandingLogo();
    if (logo) {
      pdf.addImage(logo.dataUrl, 'PNG', 14, 10, logo.wMm, logo.hMm);
    }
  } catch {
    /* sem logo */
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('Ordem de Serviço / Chamado', pageW / 2, y, { align: 'center' });
  y += 8;
  pdf.setFontSize(11);
  const title =
    detail.osNumber != null
      ? `OS #${detail.osNumber}  ·  Chamado #${detail.displayNumber}`
      : `Chamado #${detail.displayNumber}`;
  pdf.text(title, pageW / 2, y, { align: 'center' });
  y += 10;

  const lines: Array<[string, string]> = [
    ['Status', STATUS_LABELS[detail.status] || detail.status],
    ['Prioridade', PRIORITY_LABELS[detail.priority] || detail.priority],
    [
      'Tipo',
      detail.maintenanceType
        ? MAINTENANCE_TYPE_LABELS[detail.maintenanceType]
        : '—'
    ],
    ['Categoria', detail.category || '—'],
    ['Local', detail.locationLabel || '—'],
    ['Solicitante', detail.requester?.name || '—'],
    ['Responsável', detail.assignee?.name || 'Não atribuído'],
    ['Abertura', formatDt(detail.openedAt)],
    ['Prazo (SLA)', formatDt(detail.dueAt ?? null)],
    [
      'SLA aplicado',
      detail.slaHoursApplied != null ? `${detail.slaHoursApplied} h` : '—'
    ]
  ];

  pdf.setFontSize(9);
  for (const [label, value] of lines) {
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${label}:`, 14, y);
    pdf.setFont('helvetica', 'normal');
    const wrapped = pdf.splitTextToSize(String(value), pageW - 55);
    pdf.text(wrapped, 50, y);
    y += Math.max(6, wrapped.length * 4.5);
    if (y > 270) {
      pdf.addPage();
      y = 16;
    }
  }

  y += 2;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Descrição', 14, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  const desc = pdf.splitTextToSize(detail.description || '—', pageW - 28);
  pdf.text(desc, 14, y);
  y += desc.length * 4.5 + 4;

  const checklist = detail.checklistResponses || [];
  if (checklist.length) {
    if (y > 250) {
      pdf.addPage();
      y = 16;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.text('Checklist', 14, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    for (const item of checklist) {
      const mark = item.checked ? '[X]' : '[ ]';
      const line = pdf.splitTextToSize(`${mark} ${item.label}`, pageW - 28);
      pdf.text(line, 14, y);
      y += line.length * 4.5;
      if (y > 275) {
        pdf.addPage();
        y = 16;
      }
    }
    y += 3;
  }

  const parts = detail.parts || [];
  if (parts.length) {
    if (y > 240) {
      pdf.addPage();
      y = 16;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.text('Peças / custos', 14, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    for (const p of parts) {
      const line = `${p.name} · qtd ${p.quantity} · ${p.supplier || 's/ fornecedor'} · ${money(
        p.unitCost != null ? p.unitCost * p.quantity : null
      )} · prev. ${formatDt(p.expectedAt)}`;
      const wrapped = pdf.splitTextToSize(line, pageW - 28);
      pdf.text(wrapped, 14, y);
      y += wrapped.length * 4.5;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Total: ${money(detail.partsTotalCost ?? 0)}`, 14, y);
    y += 8;
  }

  if (y > 230) {
    pdf.addPage();
    y = 16;
  }
  pdf.setFont('helvetica', 'bold');
  pdf.text('Assinaturas', 14, y);
  y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Solicitante: ${detail.signatureRequesterUrl ? 'assinado' : '________________'}`, 14, y);
  y += 8;
  pdf.text(`Técnico: ${detail.signatureTechnicianUrl ? 'assinado' : '________________'}`, 14, y);
  y += 12;

  if (detail.startPhotoUrl || detail.endPhotoUrl || detail.safetyPhotoUrl) {
    pdf.setFont('helvetica', 'bold');
    pdf.text('Registros fotográficos (referência)', 14, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    if (detail.safetyPhotoUrl) {
      pdf.text(`EPI: ${detail.safetyPhotoUrl}`, 14, y);
      y += 4;
    }
    if (detail.startPhotoUrl) {
      pdf.text(`Início: ${detail.startPhotoUrl}`, 14, y);
      y += 4;
    }
    if (detail.endPhotoUrl) {
      pdf.text(`Fim: ${detail.endPhotoUrl}`, 14, y);
    }
  }

  return pdf;
}

export function gestaoOsPdfFileName(detail: GestaoOsWorkOrder): string {
  return detail.osNumber != null
    ? `OS-${detail.osNumber}.pdf`
    : `chamado-${detail.displayNumber}.pdf`;
}

export async function openGestaoOsPdf(detail: GestaoOsWorkOrder) {
  const pdf = await buildGestaoOsPdf(detail);
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    pdf.save(gestaoOsPdfFileName(detail));
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
