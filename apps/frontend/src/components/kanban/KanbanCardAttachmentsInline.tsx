'use client';

import React, { useState } from 'react';
import {
  Paperclip,
  FileText,
  FileImage,
  Plus,
  Download,
  Trash2,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import {
  type KanbanCardAttachment,
  type KanbanCardDetail,
  deleteKanbanAttachment,
  isKanbanLinkAttachment,
} from '@/lib/kanban';
import { kanbanLabel } from './kanbanFormStyles';
import { KanbanLinkFavicon } from './KanbanLinkFavicon';
import type { KanbanDraftAttachment, KanbanDraftLink } from './KanbanAttachmentsModal';

function attachmentIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage;
  return FileText;
}

type InlineItem = {
  id: string;
  title: string;
  tooltip: string;
  isLink: boolean;
  mimeType?: string;
  pending?: boolean;
  uploaderId?: string;
  fileUrl?: string;
  fileName?: string;
  draftFile?: File;
  draftUrl?: string;
};

function getItemLinkUrl(item: InlineItem): string {
  return item.draftUrl ?? item.fileUrl ?? item.tooltip;
}

export interface KanbanCardAttachmentsInlineProps {
  attachments?: KanbanCardAttachment[];
  draftFiles?: KanbanDraftAttachment[];
  draftLinks?: KanbanDraftLink[];
  currentUserId?: string;
  /** Quadro só leitura: oculta excluir em anexos de terceiros. */
  canDeleteAttachments?: boolean;
  onAddClick: () => void;
  onDraftFilesChange?: (files: KanbanDraftAttachment[]) => void;
  onDraftLinksChange?: (links: KanbanDraftLink[]) => void;
  onUpdated?: (detail: KanbanCardDetail) => void | Promise<void>;
  className?: string;
}

export function KanbanCardAttachmentsInline({
  attachments = [],
  draftFiles = [],
  draftLinks = [],
  currentUserId,
  canDeleteAttachments = true,
  onAddClick,
  onDraftFilesChange,
  onDraftLinksChange,
  onUpdated,
  className,
}: KanbanCardAttachmentsInlineProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const items: InlineItem[] = [
    ...draftLinks.map((link) => ({
      id: link.id,
      title: link.displayName,
      tooltip: link.url,
      isLink: true,
      pending: true,
      draftUrl: link.url,
    })),
    ...draftFiles.map((draft) => ({
      id: draft.id,
      title: draft.file.name,
      tooltip: draft.file.name,
      isLink: false,
      mimeType: draft.file.type,
      pending: true,
      draftFile: draft.file,
    })),
    ...attachments.map((att) => {
      const isLink = isKanbanLinkAttachment(att.mimeType);
      return {
        id: att.id,
        title: att.fileName,
        tooltip: isLink ? att.fileUrl : att.fileName,
        isLink,
        mimeType: att.mimeType,
        pending: false,
        uploaderId: att.uploader.id,
        fileUrl: att.fileUrl,
        fileName: att.fileName,
      };
    }),
  ];

  const count = items.length;

  function openItem(item: InlineItem) {
    if (item.pending && item.draftFile) {
      const url = URL.createObjectURL(item.draftFile);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    if (item.isLink || item.draftUrl) {
      window.open(item.draftUrl ?? item.fileUrl!, '_blank', 'noopener,noreferrer');
      return;
    }
    const url = resolveApiMediaUrl(item.fileUrl ?? null);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else toast.error('URL do arquivo indisponível');
  }

  async function handleDownload(item: InlineItem) {
    if (item.pending && item.draftFile) {
      const objectUrl = URL.createObjectURL(item.draftFile);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = item.draftFile.name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      return;
    }
    if (item.isLink || item.draftUrl) {
      openItem(item);
      return;
    }
    if (!item.fileUrl?.trim()) {
      toast.error('URL do arquivo indisponível');
      return;
    }
    setDownloadingId(item.id);
    try {
      const response = await api.get('/chats/direct/attachments/download', {
        params: { url: item.fileUrl, fileName: item.fileName ?? 'arquivo' },
        responseType: 'blob',
        timeout: 60000,
      });
      const blob = response.data as Blob;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = item.fileName ?? 'arquivo';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error('Erro ao baixar anexo');
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(item: InlineItem) {
    if (item.pending) {
      if (item.draftFile) {
        onDraftFilesChange?.(draftFiles.filter((f) => f.id !== item.id));
      } else {
        onDraftLinksChange?.(draftLinks.filter((l) => l.id !== item.id));
      }
      return;
    }
    if (!canDelete(item)) return;

    const label = item.title?.trim() || 'este anexo';
    if (!window.confirm(`Remover o anexo "${label}"?`)) return;

    setDeletingId(item.id);
    try {
      const updated = await deleteKanbanAttachment(item.id);
      toast.success('Anexo removido');
      await onUpdated?.(updated);
    } catch {
      toast.error('Erro ao remover anexo');
    } finally {
      setDeletingId(null);
    }
  }

  function canDelete(item: InlineItem) {
    if (!canDeleteAttachments) return false;
    if (item.pending) return true;
    if (!item.uploaderId || !currentUserId) return canDeleteAttachments;
    return canDeleteAttachments;
  }

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className={clsx(kanbanLabel, 'mb-0')}>
          Anexos{count > 0 ? ` (${count})` : ''}
        </label>
        <button
          type="button"
          onClick={onAddClick}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar
        </button>
      </div>

      {count === 0 ? (
        <button
          type="button"
          onClick={onAddClick}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 p-2 text-left transition-colors hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-800/50"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-700">
            <Paperclip className="h-3.5 w-3.5 text-gray-400" />
          </span>
          <span className="truncate text-sm text-gray-500 dark:text-gray-400">
            Nenhum anexo — clique para adicionar arquivo ou link
          </span>
        </button>
      ) : (
        <ul className="max-h-52 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
          {items.map((item) => {
            const Icon = attachmentIcon(item.mimeType ?? 'application/octet-stream');
            const showDelete = canDelete(item);

            return (
              <li
                key={item.id}
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800/80"
              >
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  title={item.tooltip}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left transition-colors"
                >
                  {item.isLink ? (
                    <KanbanLinkFavicon url={getItemLinkUrl(item)} size="sm" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-700">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500 dark:text-gray-400" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {item.title}
                    {item.pending ? (
                      <span className="ml-1.5 text-xs font-normal text-gray-400">
                        · pendente
                      </span>
                    ) : null}
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-0.5">
                  {item.isLink ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openItem(item);
                      }}
                      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                      title="Abrir link"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={downloadingId === item.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(item);
                      }}
                      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                      title="Baixar"
                    >
                      {downloadingId === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  {showDelete ? (
                    <button
                      type="button"
                      disabled={deletingId === item.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item);
                      }}
                      className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-red-400"
                      title="Excluir"
                    >
                      {deletingId === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
