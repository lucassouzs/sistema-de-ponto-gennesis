import { fixMojibakeFileName } from '@/lib/fixMojibakeFileName';

export type RmDemandSheetAttachment = { url: string; name: string };

/** Normaliza anexos da Ficha de Demanda (lista JSON ou campos legados Url/Name). */
export function parseRmDemandSheetAttachments(r: {
  demandSheetAttachments?: unknown;
  demandSheetAttachmentUrl?: string | null;
  demandSheetAttachmentName?: string | null;
} | null | undefined): RmDemandSheetAttachment[] {
  if (!r) return [];
  const raw = r.demandSheetAttachments;
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const url = String((item as { url?: unknown }).url || '').trim();
        if (!url) return null;
        const name =
          fixMojibakeFileName(String((item as { name?: unknown }).name || '').trim()) ||
          'Arquivo anexado';
        return { url, name };
      })
      .filter((item): item is RmDemandSheetAttachment => Boolean(item));
  }
  const url = String(r.demandSheetAttachmentUrl || '').trim();
  if (!url) return [];
  return [
    {
      url,
      name:
        fixMojibakeFileName(String(r.demandSheetAttachmentName || '').trim()) || 'Arquivo anexado',
    },
  ];
}
