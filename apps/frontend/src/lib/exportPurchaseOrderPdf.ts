import jsPDF from 'jspdf';
import api from '@/lib/api';
import { loadPdfBrandingLogo } from '@/lib/loadPdfBrandingLogo';
import {
  resolveOcPdfCompanyHeader,
  shouldUseUnbBranding,
  type OcPdfCompanyHeader,
} from '@/lib/unbBranding';
import { formatPaymentConditionDisplay, type PaymentConditionRow } from '@/components/oc/PaymentConditionSelect';

const PAYMENT_TYPE: Record<string, string> = {
  AVISTA: 'À vista',
  BOLETO: 'Boleto'
};

const PAYMENT_CONDITION: Record<string, string> = {
  AVISTA: 'À vista',
  BOLETO_30: 'Boleto 30 dias',
  BOLETO_28: 'Boleto 28 dias'
};

const PAYMENT_LABELS_TTL_MS = 5 * 60 * 1000;
let paymentLabelsCache: { at: number; labels: Record<string, string> } | null = null;

async function paymentConditionLabelsMerged(): Promise<Record<string, string>> {
  const now = Date.now();
  if (paymentLabelsCache && now - paymentLabelsCache.at < PAYMENT_LABELS_TTL_MS) {
    return paymentLabelsCache.labels;
  }
  try {
    const res = await api.get('/payment-conditions', { params: { activeOnly: 'false' } });
    const rows = (res.data?.data || []) as PaymentConditionRow[];
    const m = { ...PAYMENT_CONDITION };
    for (const r of rows) {
      if (r.code && r.label) m[r.code] = formatPaymentConditionDisplay(r);
    }
    paymentLabelsCache = { at: now, labels: m };
    return m;
  } catch {
    return PAYMENT_CONDITION;
  }
}

function companyCnpjPhoneLine(co: { cnpj: string; phone: string }): string {
  const tel = (co.phone || '').trim();
  if (tel) return `CNPJ: ${co.cnpj}  |  Tel.: ${tel}`;
  return `CNPJ: ${co.cnpj}`;
}

/** Desenha nome/endereço/CNPJ do emitente; retorna o Y final. */
function drawCompanyHeaderBlock(
  pdf: jsPDF,
  co: OcPdfCompanyHeader,
  x: number,
  startY: number,
  maxWidth: number,
): number {
  let ty = startY;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.splitTextToSize(co.name, maxWidth).forEach((ln: string) => {
    pdf.text(ln, x, ty);
    ty += 5;
  });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  if (co.subtitle.trim()) {
    pdf.splitTextToSize(co.subtitle, maxWidth).forEach((ln: string) => {
      pdf.text(ln, x, ty);
      ty += 4;
    });
  }
  pdf.splitTextToSize(co.address, maxWidth).forEach((ln: string) => {
    pdf.text(ln, x, ty);
    ty += 4;
  });
  pdf.text(companyCnpjPhoneLine(co), x, ty);
  return ty;
}

const FOOTER_NOTES = [
  'Depto. de Compras — O material só será recebido em conjunto com a Nota Fiscal.',
  'Por favor, informar o número da Ordem de Compra na NF.',
  'Horário de recebimento de material: Segunda a Sexta: 08:00 às 12:00 e 13:00 às 16:40.'
];

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function formatDate(d?: string | Date | null): string {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return '—';
  return x.toLocaleDateString('pt-BR');
}

function singleLineCenterY(contentTop: number, contentHeight: number, lineGap: number): number {
  return contentTop + contentHeight / 2 + lineGap * 0.35;
}

function materialLabel(m: { name?: string | null; description?: string | null }) {
  const desc = m.description?.trim();
  const name = m.name?.trim();
  if (desc) return desc;
  if (name) return name;
  return '—';
}

/** Extrai o sequencial da OC (ex.: OC-2026-0019 → "19"). */
function purchaseOrderDisplayNumber(orderNumber: string): string {
  const raw = (orderNumber || '').trim();
  const match = raw.match(/(?:OC[-\s]?)?\d{4}[-\s]?(\d+)$/i) || raw.match(/(\d+)\s*$/);
  if (match?.[1]) {
    const n = parseInt(match[1], 10);
    if (Number.isFinite(n)) return String(n);
  }
  return raw || '—';
}

type PoDetail = {
  id: string;
  orderNumber: string;
  orderDate: string;
  expectedDelivery?: string | null;
  deliveryAddress?: string | null;
  paymentType?: string | null;
  paymentCondition?: string | null;
  paymentDetails?: string | null;
  freightAmount?: unknown;
  amountToPay?: unknown;
  notes?: string | null;
  supplier: {
    code: string;
    name: string;
    cnpj?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    contactName?: string | null;
    bank?: string | null;
    agency?: string | null;
    account?: string | null;
    accountDigit?: string | null;
  };
  materialRequest?: {
    requestNumber?: string;
    serviceOrder?: string | null;
    description?: string | null;
    costCenter?: { name?: string | null };
  } | null;
  creator?: { name?: string; email?: string };
  /** Opcional: listagem pode vir sem itens; o export só reaproveita se houver linhas. */
  items?: Array<{
    quantity: unknown;
    unit?: string;
    unitPrice: unknown;
    totalPrice: unknown;
    notes?: string | null;
    material?: {
      name?: string | null;
      description?: string | null;
      sinapiCode?: string | null;
      code?: string | null;
    };
  }>;
};

export type ExportPurchaseOrderPdfOptions = {
  /** Evita refetch quando a OC já está na tela (ex.: modal). */
  order?: PoDetail;
  /** Labels já carregados no painel (evita GET /payment-conditions). */
  paymentConditionLabels?: Record<string, string>;
};

export async function exportPurchaseOrderPdf(
  orderId: string,
  options?: ExportPurchaseOrderPdfOptions,
): Promise<void> {
  const reusedOrder =
    options?.order?.id === orderId && Array.isArray(options.order.items) && options.order.items.length > 0
      ? options.order
      : null;

  const orderPromise = reusedOrder
    ? Promise.resolve(reusedOrder)
    : api.get(`/purchase-orders/${orderId}/pdf-data`).then((res) => {
        const data = (res.data as { data?: PoDetail }).data;
        if (!data) throw new Error('Ordem de compra não encontrada');
        return data;
      });

  const labelsPromise = options?.paymentConditionLabels
    ? Promise.resolve({ ...PAYMENT_CONDITION, ...options.paymentConditionLabels })
    : paymentConditionLabelsMerged();

  const [order, condLabels] = await Promise.all([orderPromise, labelsPromise]);

  const contextLabels = [
    order.materialRequest?.costCenter?.name,
    order.materialRequest?.serviceOrder,
  ];
  const logoPromise = loadPdfBrandingLogo({
    contextLabels,
    maxW: 32,
    maxH: 20,
  });

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const cw = pageW - 2 * margin;
  let y = margin;

  const co = resolveOcPdfCompanyHeader(shouldUseUnbBranding(...contextLabels));
  const logo = await logoPromise;

  if (logo) {
    pdf.addImage(logo.dataUrl, 'PNG', margin, margin, logo.wMm, logo.hMm);
    const tx = margin + logo.wMm + 4;
    const textMaxW = pageW - margin - tx;
    const ty = drawCompanyHeaderBlock(pdf, co, tx, margin + 4, textMaxW);
    y = Math.max(margin + logo.hMm, ty) + 6;
  } else {
    const ty = drawCompanyHeaderBlock(pdf, co, margin, y, cw);
    y = ty + 8;
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('ORDEM DE COMPRA', pageW / 2, y, { align: 'center' });
  y += 7;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const ocDisplayNumber = purchaseOrderDisplayNumber(order.orderNumber);
  pdf.text(`Ordem de Compra nº: ${ocDisplayNumber}`, margin, y);
  pdf.text(`Data: ${formatDate(order.orderDate)}`, margin + cw - 1, y, { align: 'right' });
  y += 5;
  pdf.setDrawColor(180, 180, 180);
  pdf.line(margin, y, margin + cw, y);
  y += 6;

  const s = order.supplier;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Dados do fornecedor', margin, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  const supplierLines = [
    `Razão social: ${s.name || '—'}`,
    `Código: ${s.code || '—'}`,
    `CNPJ: ${s.cnpj || '—'}`,
    `Endereço: ${[s.address, s.city, s.state, s.zipCode].filter(Boolean).join(' — ') || '—'}`,
    `Contato: ${s.contactName || '—'}`,
    `Telefone: ${s.phone || '—'}  |  E-mail: ${s.email || '—'}`,
    `Banco: ${s.bank || '—'}  |  Agência: ${s.agency || '—'}`,
    `Conta: ${s.account || '—'}  |  Dígito: ${s.accountDigit || '—'}`
  ];
  supplierLines.forEach((line) => {
    const lines = pdf.splitTextToSize(line, cw);
    lines.forEach((ln: string) => {
      if (y > pageH - 40) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(ln, margin, y);
      y += 4.6;
    });
  });
  y += 4;

  const mr = order.materialRequest;
  if (y > pageH - 55) {
    pdf.addPage();
    y = margin;
  }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Solicitação de compra (SC)', margin, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(`SC nº: ${mr?.requestNumber || '—'}`, margin, y);
  pdf.text(`Ordem de serviço: ${(mr?.serviceOrder || '').trim() || '—'}`, margin + 75, y);
  y += 5;
  pdf.text(`Centro de custo: ${mr?.costCenter?.name || '—'}`, margin, y);
  y += 5;
  const desc = (mr?.description || '').trim();
  if (desc) {
    pdf.setFont('helvetica', 'bold');
    pdf.text('Descrição da solicitação:', margin, y);
    y += 4;
    pdf.setFont('helvetica', 'normal');
    pdf.splitTextToSize(desc, cw).forEach((ln: string) => {
      if (y > pageH - 45) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(ln, margin, y);
      y += 4.6;
    });
  }
  y += 5;

  if (y > pageH - 50) {
    pdf.addPage();
    y = margin;
  }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Pagamento e entrega', margin, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  const payCond =
    [condLabels[order.paymentCondition || ''] || order.paymentCondition, PAYMENT_TYPE[order.paymentType || ''] || order.paymentType]
      .filter(Boolean)
      .join(' — ') || '—';
  pdf.text(`Data de entrega prevista: ${formatDate(order.expectedDelivery)}`, margin, y);
  y += 5;
  pdf.text(`Condição / forma de pagamento: ${payCond}`, margin, y);
  y += 5;
  if (order.paymentDetails?.trim()) {
    pdf.splitTextToSize(`Dados do pagamento: ${order.paymentDetails.trim()}`, cw).forEach((ln: string) => {
      if (y > pageH - 40) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(ln, margin, y);
      y += 4.6;
    });
  }
  if (order.deliveryAddress?.trim()) {
    pdf.splitTextToSize(`Endereço de entrega: ${order.deliveryAddress.trim()}`, cw).forEach((ln: string) => {
      if (y > pageH - 40) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(ln, margin, y);
      y += 4.6;
    });
  }
  if (order.creator?.name) {
    pdf.text(`Comprador: ${order.creator.name}`, margin, y);
    y += 5;
  }
  y += 4;

  if (y > pageH - 60) {
    pdf.addPage();
    y = margin;
  }

  const items = order.items || [];
  let total = 0;
  const col = { desc: margin + 14, vu: margin + 138 };
  /** Centros horizontais para ITEM / QTD / UND (colunas curtas alinhadas no meio). */
  const colMid = {
    item: margin + 7,
    qtd: margin + 116,
    und: margin + 131,
  };
  const descMaxW = 90;
  const rowH = 6;
  const lineGap = 3.5;
  const detailLineGap = 3.1;
  /** Distância baseline nome → baseline detalhamento. */
  const nameToDetailGap = 3.6;
  /** Espaço extra após o conteúdo da linha, antes de qualquer separador (evita linha “cortando” o texto) */
  const rowPaddingBottom = 2.5;
  const rowTopPad = 0.5;

  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, y - 4, cw, rowH, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.text('ITEM', colMid.item, y, { align: 'center' });
  pdf.text('MATERIAL', col.desc, y);
  pdf.text('QTD', colMid.qtd, y, { align: 'center' });
  pdf.text('UND', colMid.und, y, { align: 'center' });
  pdf.text('V. UNIT.', col.vu, y);
  pdf.text('TOTAL', margin + cw - 1, y, { align: 'right' });
  y += rowH - 1;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setDrawColor(200, 200, 200);

  items.forEach((it, idx) => {
    const qty = Number(it.quantity);
    const unitP = Number(it.unitPrice);
    const lineT = Number(it.totalPrice);
    total += lineT;
    const label = materialLabel(it.material || {});
    const detail = typeof it.notes === 'string' ? it.notes.trim() : '';
    const descLines = pdf.splitTextToSize(label, descMaxW);
    const detailLines = detail ? pdf.splitTextToSize(detail, descMaxW) : [];
    const descBlockHeight =
      descLines.length * lineGap +
      (detailLines.length > 0
        ? nameToDetailGap - lineGap + detailLines.length * detailLineGap
        : 0);
    const rowHeight = rowTopPad + descBlockHeight + rowPaddingBottom;

    if (y + rowHeight > pageH - 40) {
      pdf.addPage();
      y = margin;
    }

    const rowTop = y;
    const contentTop = rowTop + rowTopPad;
    const descStartY = contentTop + lineGap * 0.85;
    const centerY = singleLineCenterY(contentTop, descBlockHeight, lineGap);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(0, 0, 0);
    pdf.text(String(idx + 1), colMid.item, centerY, { align: 'center' });
    descLines.forEach((ln: string, i: number) => {
      pdf.text(ln, col.desc, descStartY + i * lineGap);
    });
    if (detailLines.length > 0) {
      const detailStartY = descStartY + (descLines.length - 1) * lineGap + nameToDetailGap;
      pdf.setFontSize(6.5);
      pdf.setTextColor(90, 90, 90);
      detailLines.forEach((ln: string, i: number) => {
        pdf.text(ln, col.desc, detailStartY + i * detailLineGap);
      });
      pdf.setFontSize(7);
      pdf.setTextColor(0, 0, 0);
    }
    pdf.text(qty.toLocaleString('pt-BR', { maximumFractionDigits: 2 }), colMid.qtd, centerY, {
      align: 'center',
    });
    pdf.text((it.unit || '—').substring(0, 8), colMid.und, centerY, { align: 'center' });
    pdf.text(formatCurrency(unitP), col.vu, centerY);
    pdf.text(formatCurrency(lineT), margin + cw - 1, centerY, { align: 'right' });

    const contentBottom = rowTop + rowHeight;
    y = contentBottom;

    if (idx < items.length - 1) {
      pdf.line(margin, y, margin + cw, y);
      y += 3;
    } else {
      y += 4;
    }
  });

  const freightNum =
    order.freightAmount != null && order.freightAmount !== '' && Number.isFinite(Number(order.freightAmount))
      ? Number(order.freightAmount)
      : order.amountToPay != null && order.amountToPay !== '' && Number.isFinite(Number(order.amountToPay))
        ? Math.max(0, Number(order.amountToPay) - total)
        : 0;
  const grandTotal =
    order.amountToPay != null && order.amountToPay !== '' && Number.isFinite(Number(order.amountToPay))
      ? Number(order.amountToPay)
      : total + freightNum;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(`Valor itens: ${formatCurrency(total)}`, margin + cw - 1, y, { align: 'right' });
  y += 4;
  pdf.text(`Frete: ${formatCurrency(freightNum)}`, margin + cw - 1, y, { align: 'right' });
  y += 4;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text(`Total a pagar: ${formatCurrency(grandTotal)}`, margin + cw - 1, y, { align: 'right' });
  y += 10;

  if (order.notes?.trim()) {
    if (y > pageH - 35) {
      pdf.addPage();
      y = margin;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('Observações', margin, y);
    y += 4;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.splitTextToSize(order.notes.trim(), cw).forEach((ln: string) => {
      if (y > pageH - 25) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(ln, margin, y);
      y += 3.8;
    });
    y += 4;
  }

  if (y > pageH - 30) {
    pdf.addPage();
    y = margin;
  }
  pdf.setDrawColor(100, 100, 100);
  pdf.line(margin, y, margin + cw, y);
  y += 5;
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(7);
  FOOTER_NOTES.forEach((line) => {
    if (y > pageH - 15) {
      pdf.addPage();
      y = margin;
    }
    pdf.splitTextToSize(line, cw).forEach((ln: string) => {
      pdf.text(ln, margin, y);
      y += 3.5;
    });
  });

  pdf.save(`Ordem_de_Compra_${ocDisplayNumber}.pdf`);
}
