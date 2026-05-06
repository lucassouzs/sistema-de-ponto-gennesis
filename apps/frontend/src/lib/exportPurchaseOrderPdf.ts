import jsPDF from 'jspdf';
import api from '@/lib/api';
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

async function paymentConditionLabelsMerged(): Promise<Record<string, string>> {
  try {
    const res = await api.get('/payment-conditions', { params: { activeOnly: 'false' } });
    const rows = (res.data?.data || []) as PaymentConditionRow[];
    const m = { ...PAYMENT_CONDITION };
    for (const r of rows) {
      if (r.code && r.label) m[r.code] = formatPaymentConditionDisplay(r);
    }
    return m;
  } catch {
    return PAYMENT_CONDITION;
  }
}

/** Emitente da OC no PDF (sobrescreva com NEXT_PUBLIC_OC_PDF_* no .env do frontend). */
function companyHeader() {
  return {
    name:
      process.env.NEXT_PUBLIC_OC_PDF_COMPANY_NAME || 'Gennesis Engenharia e Consultoria LTDA',
    subtitle: process.env.NEXT_PUBLIC_OC_PDF_COMPANY_SUBTITLE || 'Engenharia e Consultoria',
    address:
      process.env.NEXT_PUBLIC_OC_PDF_COMPANY_ADDRESS ||
      'SHIS QI 15, Sobreloja 55 — Lago Sul — Brasília/DF',
    phone: process.env.NEXT_PUBLIC_OC_PDF_COMPANY_PHONE || '',
    cnpj: process.env.NEXT_PUBLIC_OC_PDF_COMPANY_CNPJ || '17.851.596/0001-36'
  };
}

function companyCnpjPhoneLine(co: { cnpj: string; phone: string }): string {
  const tel = (co.phone || '').trim();
  if (tel) return `CNPJ: ${co.cnpj}  |  Tel.: ${tel}`;
  return `CNPJ: ${co.cnpj}`;
}

const FOOTER_NOTES = [
  'Depto. de Compras — O material só será recebido em conjunto com a Nota Fiscal.',
  'Por favor, informar o número da Ordem de Compra na NF.',
  'Horário de recebimento de material: Segunda a Sexta: 08:00 às 12:00 e 13:00 às 16:40.'
];

/** Tenta carregar logo: env → /oc-pdf-logo.png → /logo.png → /logobranca.png (padrão usado em outros PDFs do sistema) */
async function loadOcLogoForPdf(): Promise<{
  dataUrl: string;
  wMm: number;
  hMm: number;
} | null> {
  const candidates = [
    process.env.NEXT_PUBLIC_OC_PDF_LOGO_URL,
    '/oc-pdf-logo.png',
    '/logo.png',
    '/logobranca.png'
  ].filter(Boolean) as string[];

  for (const src of candidates) {
    const loaded = await tryLoadImageAsDataUrl(src);
    if (loaded) return loaded;
  }
  return null;
}

function tryLoadImageAsDataUrl(src: string): Promise<{
  dataUrl: string;
  wMm: number;
  hMm: number;
} | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      try {
        const dataUrl = c.toDataURL('image/png');
        const maxW = 32;
        const maxH = 20;
        const mmPerPx = 25.4 / 96;
        const iw = img.naturalWidth * mmPerPx;
        const ih = img.naturalHeight * mmPerPx;
        const s = Math.min(maxW / iw, maxH / ih, 1);
        resolve({ dataUrl, wMm: iw * s, hMm: ih * s });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    const url = src.startsWith('http')
      ? src
      : `${window.location.origin}${src.startsWith('/') ? src : `/${src}`}`;
    img.src = url;
  });
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function formatDate(d?: string | Date | null): string {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return '—';
  return x.toLocaleDateString('pt-BR');
}

function materialLabel(m: { name?: string | null; description?: string | null; sinapiCode?: string | null }) {
  const desc = m.description?.trim();
  const name = m.name?.trim();
  if (desc) return desc;
  if (name) return name;
  if (m.sinapiCode) return m.sinapiCode;
  return '—';
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
  };
  materialRequest?: {
    requestNumber?: string;
    serviceOrder?: string | null;
    description?: string | null;
    costCenter?: { name: string };
  } | null;
  creator?: { name?: string; email?: string };
  items: Array<{
    quantity: unknown;
    unit?: string;
    unitPrice: unknown;
    totalPrice: unknown;
    material?: {
      name?: string | null;
      description?: string | null;
      sinapiCode?: string | null;
      code?: string | null;
    };
  }>;
};

export async function exportPurchaseOrderPdf(orderId: string): Promise<void> {
  const res = await api.get(`/purchase-orders/${orderId}`);
  const order = (res.data as { data?: PoDetail }).data;
  if (!order) throw new Error('Ordem de compra não encontrada');

  const condLabels = await paymentConditionLabelsMerged();

  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const cw = pageW - 2 * margin;
  let y = margin;

  const co = companyHeader();
  const logo = await loadOcLogoForPdf();

  if (logo) {
    pdf.addImage(logo.dataUrl, 'PNG', margin, margin, logo.wMm, logo.hMm);
    const tx = margin + logo.wMm + 4;
    let ty = margin + 4;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(co.name, tx, ty);
    ty += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(co.subtitle, tx, ty);
    ty += 4;
    pdf.text(co.address, tx, ty);
    ty += 4;
    pdf.text(companyCnpjPhoneLine(co), tx, ty);
    y = Math.max(margin + logo.hMm, ty) + 6;
  } else {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(co.name, margin, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(co.subtitle, margin, y);
    y += 4;
    pdf.text(co.address, margin, y);
    y += 4;
    pdf.text(companyCnpjPhoneLine(co), margin, y);
    y += 8;
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('ORDEM DE COMPRA', pageW / 2, y, { align: 'center' });
  y += 7;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Ordem de Compra nº: ${order.orderNumber}`, margin, y);
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
    `Telefone: ${s.phone || '—'}  |  E-mail: ${s.email || '—'}`
  ];
  supplierLines.forEach((line) => {
    const lines = pdf.splitTextToSize(line, cw);
    lines.forEach((ln: string) => {
      if (y > pageH - 40) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(ln, margin, y);
      y += 3.8;
    });
  });
  y += 3;

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
  y += 4;
  pdf.text(`Centro de custo: ${mr?.costCenter?.name || '—'}`, margin, y);
  y += 4;
  const desc = (mr?.description || '').trim();
  if (desc) {
    pdf.setFont('helvetica', 'bold');
    pdf.text('Descrição da solicitação:', margin, y);
    y += 3.5;
    pdf.setFont('helvetica', 'normal');
    pdf.splitTextToSize(desc, cw).forEach((ln: string) => {
      if (y > pageH - 45) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(ln, margin, y);
      y += 3.8;
    });
  }
  y += 4;

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
  y += 4;
  pdf.text(`Condição / forma de pagamento: ${payCond}`, margin, y);
  y += 4;
  if (order.paymentDetails?.trim()) {
    pdf.splitTextToSize(`Dados do pagamento: ${order.paymentDetails.trim()}`, cw).forEach((ln: string) => {
      if (y > pageH - 40) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(ln, margin, y);
      y += 3.8;
    });
  }
  if (order.deliveryAddress?.trim()) {
    pdf.splitTextToSize(`Endereço de entrega: ${order.deliveryAddress.trim()}`, cw).forEach((ln: string) => {
      if (y > pageH - 40) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(ln, margin, y);
      y += 3.8;
    });
  }
  if (order.creator?.name) {
    pdf.text(`Comprador: ${order.creator.name}`, margin, y);
    y += 4;
  }
  y += 3;

  if (y > pageH - 60) {
    pdf.addPage();
    y = margin;
  }

  const items = order.items || [];
  let total = 0;
  const col = { item: margin, desc: margin + 14, qtd: margin + 108, und: margin + 124, vu: margin + 138 };
  const rowH = 6;
  const lineGap = 3.5;
  /** Espaço extra após o conteúdo da linha, antes de qualquer separador (evita linha “cortando” o texto) */
  const rowPaddingBottom = 2.5;

  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, y - 4, cw, rowH, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  pdf.text('ITEM', col.item, y);
  pdf.text('DESCRIÇÃO', col.desc, y);
  pdf.text('QTD', col.qtd, y);
  pdf.text('UND', col.und, y);
  pdf.text('V. UNIT.', col.vu, y);
  pdf.text('TOTAL', margin + cw - 1, y, { align: 'right' });
  y += rowH + 2;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setDrawColor(200, 200, 200);

  items.forEach((it, idx) => {
    const qty = Number(it.quantity);
    const unitP = Number(it.unitPrice);
    const lineT = Number(it.totalPrice);
    total += lineT;
    const label = materialLabel(it.material || {});
    const descLines = pdf.splitTextToSize(label, 90);
    const sinapi = it.material?.sinapiCode ? String(it.material.sinapiCode).substring(0, 14) : '';
    const itemLeft = sinapi ? `${idx + 1}\n${sinapi}` : String(idx + 1);
    const itemLeftLines = itemLeft.split('\n');
    const colDescH = descLines.length * lineGap;
    const colItemH = itemLeftLines.length * lineGap;
    const rowHeight = Math.max(colDescH, colItemH, lineGap * 2) + 1;

    if (y + rowHeight + rowPaddingBottom > pageH - 40) {
      pdf.addPage();
      y = margin;
    }

    const rowTop = y;
    itemLeftLines.forEach((ln: string, i: number) => {
      pdf.text(ln, col.item, rowTop + i * lineGap);
    });
    descLines.forEach((ln: string, i: number) => {
      pdf.text(ln, col.desc, rowTop + i * lineGap);
    });
    pdf.text(qty.toLocaleString('pt-BR', { maximumFractionDigits: 2 }), col.qtd, rowTop);
    pdf.text((it.unit || '—').substring(0, 8), col.und, rowTop);
    pdf.text(formatCurrency(unitP), col.vu, rowTop);
    pdf.text(formatCurrency(lineT), margin + cw - 1, rowTop, { align: 'right' });

    const contentBottom = rowTop + rowHeight + rowPaddingBottom;
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

  const safeName = order.orderNumber.replace(/[^\w.-]+/g, '_');
  pdf.save(`OC-${safeName}.pdf`);
}
