'use client';

import React from 'react';
import { FileText, Mic, X } from 'lucide-react';

/** Chips de anexos que não são imagem (ficam acima do campo de texto). */
export interface ChatComposerAttachmentsProps {
  files: File[];
  onRemove: (index: number) => void;
}

export function ChatComposerAttachments({ files, onRemove }: ChatComposerAttachmentsProps) {
  const otherItems = files
    .map((f, index) => (!f.type.startsWith('image/') ? { f, index } : null))
    .filter((x): x is { f: File; index: number } => x != null);

  if (otherItems.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2 px-0.5">
      {otherItems.map(({ f, index }) => (
        <div
          key={index}
          className="flex max-w-[160px] items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-800 dark:bg-gray-900"
        >
          {f.type.startsWith('audio/') ? <Mic size={12} /> : <FileText size={12} />}
          <span className="flex-1 truncate">{f.name}</span>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="shrink-0 hover:text-red-500"
            aria-label="Remover anexo"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
