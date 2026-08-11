'use client';

import React from 'react';
import { ExternalLink, Loader2, Paperclip, Plus, X } from 'lucide-react';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import api from '@/lib/api';
import type { FinancialControlAttachment } from '@/components/financeiro/financialControlEntry';

export async function uploadNamedAttachments(
  endpoint: string,
  files: File[]
): Promise<FinancialControlAttachment[]> {
  const uploaded: FinancialControlAttachment[] = [];
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.post(endpoint, fd);
    const d = res.data?.data as { url?: string; originalName?: string } | undefined;
    if (!d?.url) throw new Error('Resposta inválida do servidor');
    uploaded.push({
      url: d.url,
      name: d.originalName || file.name || 'Arquivo anexado',
    });
  }
  return uploaded;
}

export async function uploadFinancialControlAttachments(
  files: File[]
): Promise<FinancialControlAttachment[]> {
  return uploadNamedAttachments('/financial-control/upload-attachment', files);
}

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx';

export function FinancialControlAttachmentsField({
  files,
  uploading,
  disabled = false,
  onFilesSelect,
  onRemove,
}: {
  files: FinancialControlAttachment[];
  uploading?: boolean;
  disabled?: boolean;
  onFilesSelect: (files: File[]) => void;
  onRemove: (index: number) => void;
}) {
  const pickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    onFilesSelect(Array.from(list));
  };

  const chooseBtnClass =
    'inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 cursor-pointer hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';

  if (files.length === 0) {
    return (
      <label className={`${chooseBtnClass} ${disabled || uploading ? 'pointer-events-none' : ''}`}>
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        <span>{uploading ? 'Enviando...' : 'Escolher arquivo'}</span>
        <input
          type="file"
          multiple
          className="hidden"
          disabled={disabled || uploading}
          accept={ACCEPT}
          onChange={(e) => {
            pickFiles(e.target.files);
            e.currentTarget.value = '';
          }}
        />
      </label>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
      <ul className="divide-y divide-gray-200 dark:divide-gray-600">
        {files.map((file, index) => {
          const displayName = file.name?.trim() || 'Arquivo anexado';
          return (
            <li key={`${file.url}-${index}`} className="flex items-center gap-2 px-3 py-2.5">
              <Paperclip className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
              <span
                className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100"
                title={displayName}
              >
                {displayName}
              </span>
              <a
                href={absoluteUploadUrl(file.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir
              </a>
              <button
                type="button"
                onClick={() => onRemove(index)}
                disabled={disabled || uploading}
                aria-label="Remover anexo"
                className="shrink-0 rounded-md p-1 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <label
        className={`flex cursor-pointer items-center justify-center gap-1.5 border-t border-gray-200 px-3 py-2 text-center text-sm font-medium text-blue-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-blue-400 dark:hover:bg-gray-800/80 ${disabled || uploading ? 'pointer-events-none opacity-50' : ''}`}
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        <span>{uploading ? 'Enviando...' : 'Adicionar arquivo'}</span>
        <input
          type="file"
          multiple
          className="hidden"
          disabled={disabled || uploading}
          accept={ACCEPT}
          onChange={(e) => {
            pickFiles(e.target.files);
            e.currentTarget.value = '';
          }}
        />
      </label>
    </div>
  );
}
