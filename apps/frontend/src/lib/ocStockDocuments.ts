import { parsePaymentBoletoInstallments } from '@/components/oc/ocPaymentBoleto';
import { buildInitialRows, type BoletoParcelasOrderFields } from '@/components/oc/boletoParcelasUtils';
import { isOcBoletoPaymentType } from '@/components/oc/ocUploadBoleto';
import { formatCurrencyInputBrFromNumber } from '@/lib/maskCurrencyBr';

export type LinkedDocumentSource = 'oc' | 'estoque';

export type LinkedInvoiceDoc = {
  url: string;
  name: string;
  source: LinkedDocumentSource;
  number?: string | null;
};

export type LinkedBoletoDoc = {
  url: string;
  name: string;
  amount?: string;
  dueDate?: string;
  source: LinkedDocumentSource;
};

export type LinkedOcStockDocuments = {
  invoices: LinkedInvoiceDoc[];
  boletos: LinkedBoletoDoc[];
};

type OrderDocPick = {
  nfAttachments?: unknown;
  paymentBoletoUrl?: string | null;
  paymentBoletoName?: string | null;
  boletoAttachmentUrl?: string | null;
  boletoAttachmentName?: string | null;
  paymentBoletoInstallments?: unknown;
};

function parseNfAttachments(
  raw: unknown
): Array<{ url: string; name: string | null; number: string | null }> {
  if (!raw || !Array.isArray(raw)) return [];
  const out: Array<{ url: string; name: string | null; number: string | null }> = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const rec = x as Record<string, unknown>;
    const url = typeof rec.url === 'string' ? rec.url.trim() : '';
    if (!url) continue;
    const name =
      typeof rec.name === 'string' && rec.name.trim() ? String(rec.name).trim() : null;
    const number =
      typeof rec.number === 'string' && rec.number.trim() ? String(rec.number).trim() : null;
    out.push({ url, name, number });
  }
  return out;
}

function mergeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.url.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function movementNotesMatchOc(notes: string, ocNumber: string): boolean {
  const needle = `Nº OC: ${ocNumber}`;
  return notes.includes(needle) || notes.toLowerCase().includes(`nº oc: ${ocNumber.toLowerCase()}`);
}

function parseInvoicesFromMovementNotes(notes: string): LinkedInvoiceDoc[] {
  const out: LinkedInvoiceDoc[] = [];
  const re =
    /NF:\s*(.*?)\s*(?:\|\s*N[uú]mero:\s*([^|]+?)\s*)?\|\s*URL:\s*([^\s|]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(notes)) !== null) {
    const name = (match[1] || '').trim() || 'Nota fiscal';
    const number = (match[2] || '').trim() || null;
    const url = (match[3] || '').trim();
    if (!url) continue;
    out.push({ url, name, number, source: 'estoque' });
  }
  return out;
}

function parseBoletosFromMovementNotes(notes: string): LinkedBoletoDoc[] {
  const out: LinkedBoletoDoc[] = [];
  const boletoSection = notes.match(/Boletos:\s*([\s\S]*)/i)?.[1] || '';
  if (!boletoSection.trim()) return out;

  for (const line of boletoSection.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const normalized = trimmed.replace(/^\d+\)\s*/, '');
    const full = normalized.match(
      /^(.*?)\s*\|\s*Valor:\s*(.*?)\s*\|\s*Vencimento:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)\s*$/i
    );
    if (full?.[4]) {
      out.push({
        name: (full[1] || '').trim() || 'Boleto',
        amount: (full[2] || '').trim(),
        dueDate: (full[3] || '').trim(),
        url: full[4].trim(),
        source: 'estoque'
      });
    }
  }
  return out;
}

export function collectLinkedDocumentsFromOrder(order: OrderDocPick): LinkedOcStockDocuments {
  const invoices: LinkedInvoiceDoc[] = parseNfAttachments(order.nfAttachments).map((nf) => ({
    url: nf.url,
    name: nf.name || 'Nota fiscal',
    number: nf.number,
    source: 'oc' as const
  }));

  const boletos: LinkedBoletoDoc[] = [];
  const installmentRows = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);
  for (let i = 0; i < installmentRows.length; i += 1) {
    const row = installmentRows[i];
    const url = (row.boletoUrl || '').trim();
    if (!url) continue;
    boletos.push({
      url,
      name: (row.boletoName || '').trim() || `Boleto parcela ${i + 1}`,
      amount: row.amount != null ? formatInstallmentAmountLabel(row.amount) : undefined,
      dueDate: row.dueDate || undefined,
      source: 'oc'
    });
  }
  if (boletos.length === 0) {
    const paymentUrl = (order.paymentBoletoUrl || '').trim();
    if (paymentUrl) {
      boletos.push({
        url: paymentUrl,
        name: (order.paymentBoletoName || '').trim() || 'Boleto pagamento',
        source: 'oc'
      });
    }
    const creationUrl = (order.boletoAttachmentUrl || '').trim();
    if (creationUrl && creationUrl !== paymentUrl) {
      boletos.push({
        url: creationUrl,
        name: (order.boletoAttachmentName || '').trim() || 'Boleto OC',
        source: 'oc'
      });
    }
  }

  return {
    invoices: mergeByUrl(invoices),
    boletos: mergeByUrl(boletos)
  };
}

export function collectLinkedDocumentsFromMovements(
  movements: Array<{ notes?: string | null; type?: string }>,
  ocNumber: string
): LinkedOcStockDocuments {
  const trimmed = ocNumber.trim();
  if (!trimmed) return { invoices: [], boletos: [] };

  const invoices: LinkedInvoiceDoc[] = [];
  const boletos: LinkedBoletoDoc[] = [];

  for (const mov of movements) {
    if (mov.type && mov.type !== 'IN') continue;
    const notes = mov.notes || '';
    if (!notes || !movementNotesMatchOc(notes, trimmed)) continue;
    invoices.push(...parseInvoicesFromMovementNotes(notes));
    boletos.push(...parseBoletosFromMovementNotes(notes));
  }

  return {
    invoices: mergeByUrl(invoices),
    boletos: mergeByUrl(boletos)
  };
}

export function buildLinkedOcStockDocuments(
  order: OrderDocPick | null | undefined,
  movements: Array<{ notes?: string | null; type?: string }>,
  ocNumber: string
): LinkedOcStockDocuments {
  const fromOc = order ? collectLinkedDocumentsFromOrder(order) : { invoices: [], boletos: [] };
  const fromStock = collectLinkedDocumentsFromMovements(movements, ocNumber);
  return {
    invoices: mergeByUrl([...fromOc.invoices, ...fromStock.invoices]),
    boletos: mergeByUrl([...fromOc.boletos, ...fromStock.boletos])
  };
}

export function linkedDocumentSourceLabel(source: LinkedDocumentSource): string {
  return source === 'oc' ? 'Ordem de compra' : 'Estoque';
}

export type StockPaymentSlipSeed = {
  id: string;
  url: string;
  originalName: string;
  amount: string;
  dueDate: string;
};

function formatInstallmentAmountLabel(amount: string | number | undefined | null): string {
  if (amount == null || amount === '') return '';
  const n = typeof amount === 'number' ? amount : Number(String(amount).replace(',', '.'));
  if (!Number.isFinite(n)) return String(amount);
  return formatCurrencyInputBrFromNumber(n);
}

function brDateLabelToYmd(label: string): string {
  const trimmed = label.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Fingerprint dos anexos de boleto na OC — força re-sync quando o usuário salva na aba Anexar Boleto. */
export function orderBoletoDocumentsFingerprint(
  order: OrderDocPick & { id: string; paymentParcelCount?: number; paymentType?: string | null }
): string {
  return [
    order.id,
    order.paymentParcelCount ?? 1,
    order.paymentType ?? '',
    (order.paymentBoletoUrl || '').trim(),
    (order.boletoAttachmentUrl || '').trim(),
    JSON.stringify(order.paymentBoletoInstallments ?? null)
  ].join('\0');
}

export function resolveInstallmentBoletoAtIndex(
  order: OrderDocPick,
  index: number,
  parcelCount: number
): { url: string; name: string; amount?: string; dueDate?: string } | null {
  const rows = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);
  const row = rows[index];
  let url = (row?.boletoUrl || '').trim();
  let name = (row?.boletoName || '').trim();
  if (!url && index === 0) {
    url = (order.paymentBoletoUrl || order.boletoAttachmentUrl || '').trim();
    name = (order.paymentBoletoName || order.boletoAttachmentName || name).trim();
  }
  if (!url) return null;
  return {
    url,
    name: name || `Boleto parcela ${index + 1}`,
    amount: row && Number.isFinite(row.amount) ? String(row.amount) : undefined,
    dueDate: row?.dueDate || undefined
  };
}

/** Pré-monta um slot de boleto por parcela da OC (estoque). */
export function buildStockPaymentSlipsForOrder(
  order: (OrderDocPick & BoletoParcelasOrderFields & { id: string; paymentType?: string | null }) | null | undefined,
  ocNumber: string,
  movements: Array<{ notes?: string | null; type?: string }>
): StockPaymentSlipSeed[] {
  if (!order || !isOcBoletoPaymentType(order.paymentType)) return [];
  const parcelCount = order.paymentParcelCount ?? 1;
  if (parcelCount <= 1) return [];

  const rows = buildInitialRows(order);
  const linkedBoletos = buildLinkedOcStockDocuments(order, movements, ocNumber).boletos;

  return Array.from({ length: parcelCount }, (_, i) => {
    const row = rows[i];
    const installmentBoleto = resolveInstallmentBoletoAtIndex(order, i, parcelCount);
    const linked = linkedBoletos[i];
    const dueFromInstallment = installmentBoleto?.dueDate
      ? brDateLabelToYmd(installmentBoleto.dueDate)
      : '';
    const dueFromLinked = linked?.dueDate ? brDateLabelToYmd(linked.dueDate) : '';
    return {
      id: `slip-${order.id}-${i}`,
      url: (installmentBoleto?.url || row?.boletoUrl || linked?.url || '').trim(),
      originalName: (
        installmentBoleto?.name ||
        row?.boletoName ||
        linked?.name ||
        ''
      ).trim(),
      amount:
        row?.amount ||
        (installmentBoleto?.amount ? formatInstallmentAmountLabel(installmentBoleto.amount) : '') ||
        (linked?.amount ? formatInstallmentAmountLabel(linked.amount) : ''),
      dueDate: (row?.dueDate || dueFromInstallment || dueFromLinked || '').trim()
    };
  });
}

export function mergeStockPaymentSlipsWithLinked(
  paymentSlips: StockPaymentSlipSeed[],
  linkedBoletos: LinkedBoletoDoc[]
): StockPaymentSlipSeed[] {
  if (paymentSlips.length === 0) {
    return linkedBoletos.map((boleto, index) => ({
      id: `linked-${index}-${boleto.url}`,
      url: boleto.url,
      originalName: boleto.name,
      amount: boleto.amount ? formatInstallmentAmountLabel(boleto.amount) : '',
      dueDate: boleto.dueDate ? brDateLabelToYmd(boleto.dueDate) : ''
    }));
  }
  return paymentSlips.map((slip, i) => {
    const linked = linkedBoletos[i];
    const url = (slip.url || linked?.url || '').trim();
    if (!url) return slip;
    return {
      ...slip,
      url,
      originalName: (slip.originalName || linked?.name || '').trim() || slip.originalName,
      amount: slip.amount || (linked?.amount ? formatInstallmentAmountLabel(linked.amount) : ''),
      dueDate:
        slip.dueDate ||
        (linked?.dueDate ? brDateLabelToYmd(linked.dueDate) : '')
    };
  });
}
