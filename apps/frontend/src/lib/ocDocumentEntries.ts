import {
  effectivePaymentBoletoName,
  effectivePaymentBoletoUrl,
  parsePaymentBoletoInstallments,
} from '@/components/oc/ocPaymentBoleto';
import { isOcBoletoPaymentType } from '@/components/oc/ocUploadBoleto';

/** Campos mínimos usados para montar a aba Documentos da OC/RM. */
export type OcDocumentsOrderSource = {
  paymentType?: string | null;
  paymentParcelCount?: number;
  paymentBoletoInstallments?: unknown;
  paymentProofUrl?: string | null;
  paymentProofName?: string | null;
  paymentBoletoUrl?: string | null;
  paymentBoletoName?: string | null;
  nfAttachments?: unknown;
};

export type OcDocumentEntry = {
  id: string;
  label: string;
  subtitle?: string;
  url?: string;
  fileName?: string;
  pending?: boolean;
};

export type OcDocumentBlock = {
  id: string;
  title: string;
  items: OcDocumentEntry[];
};

export type StockMovementAttachmentItem = {
  name: string;
  url: string;
  amount?: string;
  dueDate?: string;
};

export type StockMovementAttachmentBundle = {
  nf: StockMovementAttachmentItem | null;
  withdrawalSheet: StockMovementAttachmentItem | null;
  paymentSlips: StockMovementAttachmentItem[];
};

export const EMPTY_STOCK_ATTACHMENTS: StockMovementAttachmentBundle = {
  nf: null,
  withdrawalSheet: null,
  paymentSlips: [],
};

function movementNotesText(notes?: string | null): string {
  return (notes || '').trim();
}

export function parseOcNfAttachments(
  raw: unknown
): Array<{ url: string; name: string | null; uploadedAt: string; number: string | null }> {
  if (!raw || !Array.isArray(raw)) return [];
  const out: Array<{ url: string; name: string | null; uploadedAt: string; number: string | null }> =
    [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const rec = x as Record<string, unknown>;
    const u = typeof rec.url === 'string' ? rec.url.trim() : '';
    if (!u) continue;
    const name =
      typeof rec.name === 'string' && rec.name.trim() ? String(rec.name).trim() : null;
    const uploadedAt =
      typeof rec.uploadedAt === 'string' && rec.uploadedAt.trim()
        ? String(rec.uploadedAt).trim()
        : '';
    const number =
      typeof rec.number === 'string' && rec.number.trim() ? String(rec.number).trim() : null;
    out.push({ url: u, name, uploadedAt, number });
  }
  return out;
}

export function parseStockMovementAttachmentsFromNotes(
  notes?: string | null
): StockMovementAttachmentBundle {
  const bundle: StockMovementAttachmentBundle = {
    nf: null,
    withdrawalSheet: null,
    paymentSlips: [],
  };
  const text = movementNotesText(notes);
  if (!text) return bundle;

  const nfMatch = text.match(/NF:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)/i);
  if (nfMatch?.[1] && nfMatch?.[2]) {
    bundle.nf = { name: nfMatch[1].trim(), url: nfMatch[2].trim() };
  }

  const withdrawalMatch = text.match(/Ficha de Retirada:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)/i);
  if (withdrawalMatch?.[1] && withdrawalMatch?.[2]) {
    bundle.withdrawalSheet = { name: withdrawalMatch[1].trim(), url: withdrawalMatch[2].trim() };
  }

  const boletoSection = text.match(/Boletos:\s*([\s\S]*)/i)?.[1] || '';
  if (boletoSection) {
    boletoSection
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const normalized = line.replace(/^\d+\)\s*/, '');
        const full = normalized.match(
          /^(.*?)\s*\|\s*Valor:\s*(.*?)\s*\|\s*Vencimento:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)\s*$/i
        );
        if (full?.[1] && full?.[4]) {
          bundle.paymentSlips.push({
            name: full[1].trim(),
            amount: full[2]?.trim() || '',
            dueDate: full[3]?.trim() || '',
            url: full[4].trim(),
          });
          return;
        }
        const simple = normalized.match(/^(.*?)\s*\|\s*URL:\s*([^\s|]+)\s*$/i);
        if (simple?.[2]) {
          bundle.paymentSlips.push({
            name: simple[1].trim() || 'Boleto',
            url: simple[2].trim(),
          });
        }
      });
  }

  return bundle;
}

export function collectOcDocumentEntries(
  order: OcDocumentsOrderSource,
  stockAttachments: StockMovementAttachmentBundle = EMPTY_STOCK_ATTACHMENTS
): OcDocumentEntry[] {
  const entries: OcDocumentEntry[] = [];
  const seenIds = new Set<string>();

  const push = (entry: Omit<OcDocumentEntry, 'id'> & { id: string }) => {
    if (seenIds.has(entry.id)) return;
    seenIds.add(entry.id);
    const url = entry.url?.trim() || undefined;
    entries.push({
      ...entry,
      url,
      pending: !url,
      fileName: url ? entry.fileName || entry.label : undefined,
      subtitle: url ? entry.subtitle : entry.subtitle || 'Não anexado',
    });
  };

  if (isOcBoletoPaymentType(order.paymentType)) {
    const parcelCount = Math.max(1, order.paymentParcelCount ?? 1);
    const rows = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);

    for (let index = 0; index < parcelCount; index++) {
      const row = rows[index];
      const parcelLabel = String(index + 1);
      const boletoUrl =
        parcelCount > 1
          ? (row?.boletoUrl || '').trim()
          : effectivePaymentBoletoUrl(order) || (row?.boletoUrl || '').trim();
      push({
        id: parcelCount > 1 ? `boleto-parcela-${index}` : 'boleto',
        label: parcelCount > 1 ? `Boleto - Parcela ${parcelLabel}` : 'Boleto - Parcela 1',
        url: boletoUrl || undefined,
        fileName:
          (parcelCount > 1
            ? row?.boletoName?.trim()
            : effectivePaymentBoletoName(order) || row?.boletoName?.trim()) ||
          `Boleto parcela ${parcelLabel}`,
      });
      const proofUrl =
        parcelCount > 1
          ? (row?.installmentProofUrl || '').trim()
          : (order.paymentProofUrl || '').trim() || (row?.installmentProofUrl || '').trim();
      push({
        id: parcelCount > 1 ? `comprovante-parcela-${index}` : 'comprovante',
        label:
          parcelCount > 1 ? `Comprovante - Parcela ${parcelLabel}` : 'Comprovante - Parcela 1',
        url: proofUrl || undefined,
        fileName:
          (parcelCount > 1
            ? row?.installmentProofName?.trim()
            : order.paymentProofName?.trim() || row?.installmentProofName?.trim()) ||
          `Comprovante parcela ${parcelLabel}`,
      });
    }
  } else {
    push({
      id: 'comprovante',
      label: 'Comprovante de pagamento',
      url: (order.paymentProofUrl || '').trim() || undefined,
      fileName: order.paymentProofName?.trim() || 'Comprovante pagamento',
    });
    stockAttachments.paymentSlips.forEach((slip, index) => {
      if (!slip.url) return;
      push({
        id: `boleto-estoque-${index}-${slip.url}`,
        label: slip.amount ? `Boleto (${slip.amount})` : `Boleto ${index + 1}`,
        subtitle: slip.dueDate ? `Vencimento: ${slip.dueDate}` : undefined,
        url: slip.url,
        fileName: slip.name || `Boleto ${index + 1}`,
      });
    });
  }

  const nfs = parseOcNfAttachments(order.nfAttachments);
  if (nfs.length > 0) {
    nfs.forEach((nf, index) => {
      push({
        id: `nf-${index}-${nf.url || nf.number || index}`,
        label: nf.number ? `Nota Fiscal ${nf.number}` : `Nota Fiscal ${index + 1}`,
        subtitle: nf.uploadedAt ? new Date(nf.uploadedAt).toLocaleString('pt-BR') : undefined,
        url: nf.url,
        fileName: nf.name || `NF ${index + 1}`,
      });
    });
  } else if (stockAttachments.nf?.url) {
    push({
      id: 'nf-estoque',
      label: 'Nota Fiscal 1',
      url: stockAttachments.nf.url,
      fileName: stockAttachments.nf.name || 'NF estoque',
    });
  } else {
    push({
      id: 'nf-pending',
      label: 'Nota Fiscal',
      subtitle: 'Não anexada',
    });
  }

  push({
    id: 'ficha-retirada',
    label: 'Ficha de Retirada',
    url: stockAttachments.withdrawalSheet?.url || undefined,
    fileName: stockAttachments.withdrawalSheet?.name || 'Ficha de Retirada',
    subtitle: stockAttachments.withdrawalSheet?.url ? undefined : 'Não anexada',
  });

  return entries;
}

export function groupOcDocumentBlocks(
  entries: OcDocumentEntry[],
  order: Pick<OcDocumentsOrderSource, 'paymentType' | 'paymentParcelCount'>
): OcDocumentBlock[] {
  const blocks: OcDocumentBlock[] = [];
  const used = new Set<string>();

  const take = (
    pred: (e: OcDocumentEntry) => boolean,
    mapItem?: (e: OcDocumentEntry) => OcDocumentEntry
  ) => {
    const items = entries
      .filter((e) => !used.has(e.id) && pred(e))
      .map((e) => {
        used.add(e.id);
        return mapItem ? mapItem(e) : e;
      });
    return items;
  };

  if (isOcBoletoPaymentType(order.paymentType)) {
    const parcelCount = Math.max(1, order.paymentParcelCount ?? 1);
    for (let index = 0; index < parcelCount; index++) {
      const items = take(
        (e) =>
          e.id === `boleto-parcela-${index}` ||
          e.id === `comprovante-parcela-${index}` ||
          (parcelCount === 1 && (e.id === 'boleto' || e.id === 'comprovante')),
        (e) => ({
          ...e,
          label: e.id.includes('comprovante') ? 'Comprovante' : 'Boleto',
        })
      );
      if (items.length > 0) {
        blocks.push({ id: `parcela-${index}`, title: `Parcela ${index + 1}`, items });
      }
    }
  } else {
    const items = take((e) => e.id === 'comprovante' || e.id.startsWith('boleto-estoque-'));
    if (items.length > 0) {
      blocks.push({ id: 'pagamento', title: 'Pagamento', items });
    }
  }

  const nfItems = take((e) => e.id.startsWith('nf-') || e.id === 'nf-pending' || e.id === 'nf-estoque');
  if (nfItems.length > 0) {
    blocks.push({ id: 'notas-fiscais', title: 'Nota Fiscal', items: nfItems });
  }

  const fichaItems = take(
    (e) => e.id === 'ficha-retirada',
    (e) => ({ ...e, label: 'Arquivo' })
  );
  if (fichaItems.length > 0) {
    blocks.push({ id: 'ficha-retirada', title: 'Ficha de Retirada', items: fichaItems });
  }

  const leftovers = entries.filter((e) => !used.has(e.id));
  if (leftovers.length > 0) {
    blocks.push({ id: 'outros', title: 'Outros', items: leftovers });
  }

  return blocks;
}
