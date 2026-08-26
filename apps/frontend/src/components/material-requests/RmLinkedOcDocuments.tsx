'use client';

import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Download, Eye, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import {
  collectOcDocumentEntries,
  EMPTY_STOCK_ATTACHMENTS,
  groupOcDocumentBlocks,
  parseStockMovementAttachmentsFromNotes,
  type StockMovementAttachmentBundle,
} from '@/lib/ocDocumentEntries';
import { OcAttachmentActions } from '@/components/oc/OcAttachmentActions';
import { buildOcPdfDownloadFileName, formatOcListDisplayId } from '@/components/oc/ocListDisplay';
import type { PurchaseOrder } from '@/components/oc/OcPurchaseOrdersPanel';

type LinkedOrderRef = {
  id: string;
  orderNumber?: string | number | null;
};

function normalizeOcNumberKey(raw: string | number | null | undefined): string {
  return String(raw ?? '').trim().toLowerCase();
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

async function openQuoteMapSnapshotPdf(mapId: string, purchaseOrderId?: string) {
  const response = await api.get(`/quote-maps/${mapId}/snapshot-pdf`, {
    responseType: 'blob',
    params: purchaseOrderId ? { purchaseOrderId } : undefined,
  });
  const blobUrl = window.URL.createObjectURL(response.data);
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
}

async function downloadQuoteMapSnapshotPdf(
  mapId: string,
  orderNumber?: string | number | null,
  supplierName?: string | null,
  purchaseOrderId?: string
) {
  const response = await api.get(`/quote-maps/${mapId}/snapshot-pdf`, {
    responseType: 'blob',
    params: purchaseOrderId ? { purchaseOrderId } : undefined,
  });
  const blobUrl = window.URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = buildOcPdfDownloadFileName(
    orderNumber != null ? String(orderNumber) : null,
    supplierName
  );
  anchor.click();
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
}

async function openQuoteMapComparisonPdf(mapId: string) {
  const response = await api.get(`/quote-maps/${mapId}/comparison-pdf`, {
    responseType: 'blob',
  });
  const blobUrl = window.URL.createObjectURL(response.data);
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
}

async function downloadQuoteMapComparisonPdf(mapId: string) {
  const response = await api.get(`/quote-maps/${mapId}/comparison-pdf`, {
    responseType: 'blob',
  });
  const blobUrl = window.URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `mapa-cotacao-comparativo-${mapId}.pdf`;
  anchor.click();
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
}

function DocSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-0 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 pb-3 dark:border-gray-700">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">
            {title}
          </h3>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">{children}</div>
    </section>
  );
}

function DocItem({
  label,
  subtitle,
  url,
  fileName,
  pending = false,
  onView,
  onDownload,
}: {
  label: string;
  subtitle?: string;
  url?: string;
  fileName?: string;
  pending?: boolean;
  onView?: () => void | Promise<void>;
  onDownload?: () => void | Promise<void>;
}) {
  const actionBtnCls =
    'inline-flex items-center justify-center rounded-md p-1.5 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300';
  const isPending = pending || (!url && !onView && !onDownload);

  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-3 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        ) : fileName && fileName !== label ? (
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{fileName}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {isPending ? (
          <span className="inline-flex whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            Pendente
          </span>
        ) : url ? (
          <OcAttachmentActions url={url} fileName={fileName || label} variant="buttons" />
        ) : (
          <>
            {onView ? (
              <button
                type="button"
                onClick={() => void onView()}
                title="Ver"
                aria-label={`Ver ${label}`}
                className={actionBtnCls}
              >
                <Eye className="h-5 w-5 shrink-0" />
              </button>
            ) : null}
            {onDownload ? (
              <button
                type="button"
                onClick={() => void onDownload()}
                title="Baixar"
                aria-label={`Baixar ${label}`}
                className={actionBtnCls}
              >
                <Download className="h-5 w-5 shrink-0" />
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function SingleOcDocuments({
  order,
  isLoading,
  stockAttachments,
}: {
  order: PurchaseOrder | undefined;
  isLoading: boolean;
  stockAttachments: StockMovementAttachmentBundle;
}) {
  const quoteMap = order?.quoteMap;
  const documentBlocks = useMemo(() => {
    if (!order) return [];
    const entries = collectOcDocumentEntries(order, stockAttachments);
    return groupOcDocumentBlocks(entries, order);
  }, [order, stockAttachments]);

  if (isLoading && !order) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando documentos…
      </div>
    );
  }

  if (!order) {
    return (
      <p className="py-3 text-sm text-gray-500 dark:text-gray-400">
        Não foi possível carregar os documentos desta OC.
      </p>
    );
  }

  const ocLabel = formatOcListDisplayId(order.orderNumber);
  const supplierName = order.supplier?.name?.trim() || null;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-50">OC {ocLabel}</h4>
        {supplierName ? (
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{supplierName}</p>
        ) : null}
      </div>

      <div className="space-y-3 pl-0 sm:pl-1">
        <DocSection title="Mapa de Cotação">
          {quoteMap ? (
            <>
              <DocItem
                label="PDF da OC"
                subtitle={`Criado em ${formatDate(quoteMap.createdAt)}`}
                onView={async () => {
                  try {
                    await openQuoteMapSnapshotPdf(quoteMap.id, order.id);
                  } catch {
                    toast.error('Não foi possível abrir o PDF da OC.');
                  }
                }}
                onDownload={async () => {
                  try {
                    await downloadQuoteMapSnapshotPdf(
                      quoteMap.id,
                      order.orderNumber,
                      order.supplier?.name,
                      order.id
                    );
                  } catch {
                    toast.error('Não foi possível baixar o PDF da OC.');
                  }
                }}
              />
              <DocItem
                label="Comparativo"
                subtitle="Todas as cotações + vencedor"
                onView={async () => {
                  try {
                    await openQuoteMapComparisonPdf(quoteMap.id);
                  } catch {
                    toast.error('Não foi possível abrir o PDF comparativo.');
                  }
                }}
                onDownload={async () => {
                  try {
                    await downloadQuoteMapComparisonPdf(quoteMap.id);
                  } catch {
                    toast.error('Não foi possível baixar o PDF comparativo.');
                  }
                }}
              />
            </>
          ) : (
            <DocItem label="Arquivo" subtitle="Não anexado" pending />
          )}
        </DocSection>

        {documentBlocks.map((block) => (
          <DocSection key={block.id} title={block.title}>
            {block.items.map((doc) => (
              <DocItem
                key={doc.id}
                label={doc.label}
                subtitle={doc.subtitle}
                url={doc.url}
                fileName={doc.fileName}
                pending={doc.pending}
              />
            ))}
          </DocSection>
        ))}
      </div>
    </div>
  );
}

/**
 * Documentos das OCs vinculadas à RM — mesma estrutura da aba Documentos da OC,
 * agrupados por ordem de compra. Anexos vivem na OC (e Ficha de Demanda na RM);
 * o que for anexado em qualquer fase aparece nos dois lados.
 */
export function RmLinkedOcDocuments({
  orders,
  enabled = true,
}: {
  orders: LinkedOrderRef[];
  enabled?: boolean;
}) {
  const sorted = useMemo(() => {
    return [...orders].sort((a, b) =>
      String(a.orderNumber ?? '').localeCompare(String(b.orderNumber ?? ''), 'pt-BR', {
        numeric: true,
      })
    );
  }, [orders]);

  const detailQueries = useQueries({
    queries: sorted.map((o) => ({
      queryKey: ['purchase-order', o.id, 'rm-documents'] as const,
      queryFn: async () => {
        const res = await api.get(`/purchase-orders/${o.id}`);
        return (res.data?.data || res.data) as PurchaseOrder;
      },
      enabled: enabled && !!o.id,
      staleTime: 30_000,
    })),
  });

  const { data: stockMovementsData } = useQuery({
    queryKey: ['stock-movements-oc-tags'],
    queryFn: async () => {
      const res = await api.get('/stock/movements', { params: { limit: 1000 } });
      return res.data;
    },
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const stockByOcKey = useMemo(() => {
    const map = new Map<string, StockMovementAttachmentBundle>();
    const movements = (stockMovementsData?.data || []) as Array<{
      notes?: string | null;
      createdAt?: string;
    }>;
    const latestNotesByKey = new Map<string, { notes: string; at: number }>();

    for (const mov of movements) {
      const notes = mov.notes || '';
      const ocMatch = notes.match(/Nº OC:\s*([^\n|]+)/i);
      const ocRaw = ocMatch?.[1]?.trim();
      if (!ocRaw) continue;
      const key = normalizeOcNumberKey(ocRaw);
      const at = mov.createdAt ? new Date(mov.createdAt).getTime() : 0;
      const prev = latestNotesByKey.get(key);
      if (!prev || at >= prev.at) {
        latestNotesByKey.set(key, { notes, at });
      }
    }

    latestNotesByKey.forEach((value, key) => {
      map.set(key, parseStockMovementAttachmentsFromNotes(value.notes));
    });
    return map;
  }, [stockMovementsData]);

  if (sorted.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
        Nenhuma ordem de compra vinculada. Os documentos da OC (mapa, boletos, NF…) aparecerão aqui
        quando a RM gerar OCs.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">
          Documentos por ordem de compra
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Mesmos anexos da OC — o que for adicionado em qualquer fase aparece aqui e na ordem de
          compra.
        </p>
      </div>

      {sorted.map((ref, index) => {
        const q = detailQueries[index];
        const order = q?.data;
        const ocKey = normalizeOcNumberKey(order?.orderNumber ?? ref.orderNumber);
        const stockAttachments = stockByOcKey.get(ocKey) || EMPTY_STOCK_ATTACHMENTS;
        return (
          <div
            key={ref.id}
            className="rounded-xl border border-gray-200/80 bg-gray-50/40 p-4 dark:border-gray-700/80 dark:bg-gray-900/30"
          >
            <SingleOcDocuments
              order={order}
              isLoading={Boolean(q?.isLoading || q?.isFetching)}
              stockAttachments={stockAttachments}
            />
          </div>
        );
      })}
    </div>
  );
}
