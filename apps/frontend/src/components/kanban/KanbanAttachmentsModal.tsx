'use client';

import React, { useRef, useState } from 'react';
import {
  Loader2,
  Trash2,
  Download,
  FileImage,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import {
  type KanbanCardAttachment,
  type KanbanCardDetail,
  addKanbanLinkAttachment,
  isKanbanLinkAttachment,
  isOptimisticKanbanCardId,
  uploadKanbanAttachments,
  deleteKanbanAttachment,
} from '@/lib/kanban';
import { kanbanInput, kanbanLabel } from './kanbanFormStyles';
import { KanbanLinkFavicon } from './KanbanLinkFavicon';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage;
  return FileText;
}

function normalizeLinkInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Informe o link');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withScheme);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('URL inválida');
  return parsed.href;
}

export interface KanbanDraftAttachment {
  id: string;
  file: File;
}

export interface KanbanDraftLink {
  id: string;
  url: string;
  displayName: string;
}

export interface KanbanAttachmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId?: string;
  attachments?: KanbanCardAttachment[];
  draftFiles?: KanbanDraftAttachment[];
  onDraftFilesChange?: (files: KanbanDraftAttachment[]) => void;
  draftLinks?: KanbanDraftLink[];
  onDraftLinksChange?: (links: KanbanDraftLink[]) => void;
  currentUserId?: string;
  canDeleteAttachments?: boolean;
  onUpdated?: (detail: KanbanCardDetail) => void | Promise<void>;
  elevated?: boolean;
}

export function KanbanAttachmentsModal({
  isOpen,
  onClose,
  cardId,
  attachments = [],
  draftFiles = [],
  onDraftFilesChange,
  draftLinks = [],
  onDraftLinksChange,
  currentUserId,
  canDeleteAttachments = true,
  onUpdated,
  elevated = true,
}: KanbanAttachmentsModalProps) {
  const isPersisted = !!cardId && !isOptimisticKanbanCardId(cardId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkDisplayName, setLinkDisplayName] = useState('');

  function addDraftFiles(fileList: FileList | null) {
    if (!fileList?.length || !onDraftFilesChange) return;
    const next = [
      ...draftFiles,
      ...Array.from(fileList).map((file) => ({
        id: `draft-${crypto.randomUUID()}`,
        file,
      })),
    ];
    onDraftFilesChange(next);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    if (!isPersisted) {
      addDraftFiles(fileList);
      return;
    }
    setUploading(true);
    try {
      const updated = await uploadKanbanAttachments(cardId!, Array.from(fileList));
      toast.success('Anexo(s) enviado(s)');
      await onUpdated?.(updated);
    } catch {
      toast.error('Erro ao enviar anexo');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleInsertLink() {
    let normalized: string;
    try {
      normalized = normalizeLinkInput(linkUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'URL inválida');
      return;
    }

    const display = linkDisplayName.trim() || normalized;

    if (!isPersisted) {
      if (!onDraftLinksChange) return;
      onDraftLinksChange([
        ...draftLinks,
        { id: `draft-link-${crypto.randomUUID()}`, url: normalized, displayName: display },
      ]);
      setLinkUrl('');
      setLinkDisplayName('');
      toast.success('Link adicionado');
      return;
    }

    setAddingLink(true);
    try {
      const updated = await addKanbanLinkAttachment(cardId!, {
        url: normalized,
        displayName: linkDisplayName.trim() || undefined,
      });
      setLinkUrl('');
      setLinkDisplayName('');
      toast.success('Link adicionado');
      await onUpdated?.(updated);
    } catch {
      toast.error('Erro ao adicionar link');
    } finally {
      setAddingLink(false);
    }
  }

  async function handleDelete(id: string, kind: 'file' | 'link', label?: string) {
    if (!isPersisted) {
      if (kind === 'file') {
        onDraftFilesChange?.(draftFiles.filter((f) => f.id !== id));
      } else {
        onDraftLinksChange?.(draftLinks.filter((l) => l.id !== id));
      }
      return;
    }
    if (!canDeleteAttachments) return;
    const name = label?.trim() || 'este anexo';
    if (!window.confirm(`Remover o anexo "${name}"?`)) return;
    setDeletingId(id);
    try {
      const updated = await deleteKanbanAttachment(id);
      toast.success('Anexo removido');
      await onUpdated?.(updated);
    } catch {
      toast.error('Erro ao remover anexo');
    } finally {
      setDeletingId(null);
    }
  }

  function downloadDraftFile(_draftId: string, file: File) {
    const objectUrl = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = file.name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function previewDraftFile(file: File) {
    const objectUrl = URL.createObjectURL(file);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  function openAttachment(att: KanbanCardAttachment) {
    if (isKanbanLinkAttachment(att.mimeType)) {
      window.open(att.fileUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    const url = resolveApiMediaUrl(att.fileUrl);
    if (!url) {
      toast.error('URL do arquivo indisponível');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function openUrl(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function downloadAttachment(
    attachmentId: string,
    fileUrl: string,
    fileName: string,
    mimeType: string,
  ) {
    if (isKanbanLinkAttachment(mimeType)) {
      openUrl(fileUrl);
      return;
    }
    if (!fileUrl?.trim()) {
      toast.error('URL do arquivo indisponível');
      return;
    }
    setDownloadingId(attachmentId);
    try {
      const response = await api.get('/chats/direct/attachments/download', {
        params: { url: fileUrl, fileName },
        responseType: 'blob',
        timeout: 60000,
      });
      const blob = response.data as Blob;
      if (!(blob instanceof Blob)) throw new Error('invalid blob');
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
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

  const totalCount = attachments.length + draftFiles.length + draftLinks.length;
  const title = totalCount > 0 ? `Anexar (${totalCount})` : 'Anexar';
  const hasAny = totalCount > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={title}
      closeOnOverlayClick
      elevated={elevated}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="space-y-5">
        <section>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Anexe um arquivo do seu computador
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Você também pode arrastar e soltar arquivos para carregá-los.
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={clsx(
              'mt-3 rounded-lg border-2 border-dashed px-4 py-5 transition-colors text-center',
              dragOver
                ? 'border-gray-400 bg-gray-50 dark:border-gray-500 dark:bg-gray-800/80'
                : 'border-gray-200 dark:border-gray-600',
            )}
          >
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              {uploading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </span>
              ) : (
                'Escolher um arquivo'
              )}
            </button>
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">Máx. 10 MB por arquivo</p>
          </div>
        </section>

        <div className="h-px bg-gray-200 dark:bg-gray-700" />

        <section>
          <label className={kanbanLabel}>
            Pesquise ou cole o link <span className="text-red-600">*</span>
          </label>
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            className={clsx(kanbanInput, 'text-sm')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleInsertLink();
              }
            }}
          />

          <label className={clsx(kanbanLabel, 'mt-3')}>Texto para exibição (opcional)</label>
          <input
            type="text"
            value={linkDisplayName}
            onChange={(e) => setLinkDisplayName(e.target.value)}
            placeholder="Título do link"
            className={clsx(kanbanInput, 'text-sm')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleInsertLink();
              }
            }}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Dê um título ou uma descrição a este link
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={addingLink || !linkUrl.trim()}
              onClick={handleInsertLink}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
            >
              {addingLink ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Inserindo...
                </span>
              ) : (
                'Inserir'
              )}
            </button>
          </div>
        </section>

        {hasAny ? (
          <>
            <div className="h-px bg-gray-200 dark:bg-gray-700" />
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Anexos do card
              </h3>
              <ul className="max-h-[min(280px,40vh)] space-y-1 overflow-y-auto -mx-1 px-1">
                {draftLinks.map((link) => (
                  <li
                    key={link.id}
                    className="group flex items-center gap-2.5 rounded-lg px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <KanbanLinkFavicon url={link.url} size="md" className="rounded-lg" />
                    <button
                      type="button"
                      onClick={() => openUrl(link.url)}
                      className="min-w-0 flex-1 text-left"
                      title={link.url}
                    >
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {link.displayName}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {link.url} · pendente
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => openUrl(link.url)}
                        className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        title="Abrir link"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(link.id, 'link')}
                        className="rounded-md p-1.5 text-gray-400 hover:text-red-600"
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
                {draftFiles.map((draft) => {
                  const Icon = fileIcon(draft.file.type || 'application/octet-stream');
                  return (
                    <li
                      key={draft.id}
                      className="group flex items-center gap-2.5 rounded-lg px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
                        <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      </span>
                      <button
                        type="button"
                        onClick={() => previewDraftFile(draft.file)}
                        className="min-w-0 flex-1 text-left"
                        title={draft.file.name}
                      >
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {draft.file.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(draft.file.size)} · pendente
                        </p>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => downloadDraftFile(draft.id, draft.file)}
                          className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                          title="Baixar"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(draft.id, 'file')}
                          className="rounded-md p-1.5 text-gray-400 hover:text-red-600"
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
                {attachments.map((att) => {
                  const isLink = isKanbanLinkAttachment(att.mimeType);
                  const Icon = fileIcon(att.mimeType);
                  return (
                    <li
                      key={att.id}
                      className="group flex items-center gap-2.5 rounded-lg px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      {isLink ? (
                        <KanbanLinkFavicon url={att.fileUrl} size="md" className="rounded-lg" />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
                          <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openAttachment(att)}
                        className="min-w-0 flex-1 text-left"
                        title={isLink ? att.fileUrl : att.fileName}
                      >
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {att.fileName}
                        </p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {isLink
                            ? att.fileUrl
                            : `${formatFileSize(att.fileSize)} · ${att.uploader.name.split(/\s+/)[0]}`}
                        </p>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {isLink ? (
                          <button
                            type="button"
                            onClick={() => openAttachment(att)}
                            className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            title="Abrir link"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={downloadingId === att.id}
                            onClick={() =>
                              downloadAttachment(att.id, att.fileUrl, att.fileName, att.mimeType)
                            }
                            className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-50 dark:hover:text-gray-200"
                            title="Baixar"
                          >
                            {downloadingId === att.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </button>
                        )}
                        {canDeleteAttachments ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleDelete(att.id, isLink ? 'link' : 'file', att.fileName)
                            }
                            disabled={deletingId === att.id}
                            className="rounded-md p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-50"
                            title="Remover"
                          >
                            {deletingId === att.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
