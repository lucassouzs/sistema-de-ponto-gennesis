'use client';

import React, { useState } from 'react';
import { ImagePlus, Loader2, Paperclip, X } from 'lucide-react';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { DOCUMENT_KIND_LABELS, type GestaoOsAttachment } from '@/app/ponto/sistema-gestao-os/gestaoOsTypes';

const ACCEPT = 'image/*,.pdf';

function isImageFile(file: GestaoOsAttachment) {
  const mime = String(file.mimeType || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
}

export function GestaoOsAttachmentsField({
  files,
  uploading = false,
  disabled = false,
  onFilesSelect,
  onRemove,
  label = 'Clique ou arraste as fotos',
  hint = 'PNG, JPG ou PDF',
}: {
  files: GestaoOsAttachment[];
  uploading?: boolean;
  disabled?: boolean;
  onFilesSelect: (files: File[]) => void;
  onRemove: (url: string) => void;
  label?: string;
  hint?: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const blocked = disabled || uploading;

  const pick = (list: FileList | null) => {
    if (!list?.length) return;
    onFilesSelect(Array.from(list));
  };

  return (
    <div className="space-y-2">
      <label
        onDragOver={(event) => {
          event.preventDefault();
          if (!blocked) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (blocked) return;
          pick(event.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
          dragOver
            ? 'border-red-500 bg-red-50 dark:bg-red-950/40'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800/70 dark:hover:border-gray-500 dark:hover:bg-gray-800'
        } ${blocked ? 'pointer-events-none opacity-60' : ''}`}
      >
        {uploading ? (
          <Loader2 className="h-7 w-7 animate-spin text-red-600 dark:text-red-400" />
        ) : (
          <ImagePlus className="h-7 w-7 text-gray-400 dark:text-gray-500" strokeWidth={1.4} />
        )}
        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
          {uploading ? 'Enviando...' : label}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{hint}</span>
        <input
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          disabled={blocked}
          onChange={(event) => {
            pick(event.target.files);
            event.currentTarget.value = '';
          }}
        />
      </label>

      {files.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {files.map((file) => {
            const src = resolveApiMediaUrl(file.url);
            return (
              <li
                key={file.url}
                className="relative overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800"
              >
                {isImageFile(file) && src ? (
                  <img src={src} alt={file.name} className="h-24 w-full object-cover" />
                ) : (
                  <div className="flex h-24 items-center justify-center bg-gray-50 dark:bg-gray-900/50">
                    <Paperclip className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </div>
                )}
                <p
                  className="truncate px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300"
                  title={file.name}
                >
                  {file.kind && DOCUMENT_KIND_LABELS[file.kind]
                    ? `${DOCUMENT_KIND_LABELS[file.kind]} · ${file.name}`
                    : file.name}
                </p>
                <button
                  type="button"
                  onClick={() => onRemove(file.url)}
                  disabled={blocked}
                  aria-label={`Remover ${file.name}`}
                  className="absolute right-1.5 top-1.5 rounded-md bg-black/55 p-1 text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
