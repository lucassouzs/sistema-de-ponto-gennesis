'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Send, Smile, X } from 'lucide-react';
import { clsx } from 'clsx';
import { ChatComposerField } from '@/components/conversas/ChatComposerField';

export interface ChatImageComposePanelProps {
  files: File[];
  fileIndices: number[];
  activeIndex: number;
  maxFiles?: number;
  caption: string;
  sending?: boolean;
  showEmojiPicker?: boolean;
  onCaptionChange: (value: string) => void;
  onCaptionKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onActiveIndexChange: (index: number) => void;
  onRemoveAt: (fileIndex: number) => void;
  onDiscard: () => void;
  onSend: () => void;
  onAddImages?: () => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onToggleEmojiPicker?: () => void;
  onPickEmoji?: (emoji: string) => void;
}

export function ChatImageComposePanel({
  files,
  fileIndices,
  activeIndex,
  maxFiles = 5,
  caption,
  sending = false,
  showEmojiPicker = false,
  onCaptionChange,
  onCaptionKeyDown,
  onActiveIndexChange,
  onRemoveAt,
  onDiscard,
  onSend,
  onAddImages,
  onPaste,
  onToggleEmojiPicker,
  onPickEmoji,
}: ChatImageComposePanelProps) {
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  const safeActive = Math.min(Math.max(0, activeIndex), Math.max(0, fileIndices.length - 1));
  const activeFileIndex = fileIndices[safeActive];

  const [previewByFileIndex, setPreviewByFileIndex] = useState<Record<number, string>>({});

  useEffect(() => {
    const next: Record<number, string> = {};
    for (const idx of fileIndices) {
      const f = files[idx];
      if (f) next[idx] = URL.createObjectURL(f);
    }
    setPreviewByFileIndex((prev) => {
      for (const url of Object.values(prev)) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      }
      return next;
    });
    return () => {
      for (const url of Object.values(next)) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      }
    };
  }, [files, fileIndices]);

  useEffect(() => {
    const t = window.setTimeout(() => captionRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (emojiRef.current?.contains(t)) return;
      onToggleEmojiPicker?.();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showEmojiPicker, onToggleEmojiPicker]);

  const resizeCaption = useCallback((ta: HTMLTextAreaElement) => {
    ta.style.height = 'auto';
    const h = Math.round(Math.min(Math.max(ta.scrollHeight, 44), 120));
    ta.style.height = `${h}px`;
  }, []);

  const handleCaptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onCaptionChange(e.target.value);
  };

  const canAddMore = files.length < maxFiles;

  return (
    <div className="app-theme-bg relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Preview — ocupa só a área abaixo do header do chat */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-gray-100/60 px-3 py-4 dark:bg-gray-900/40">
        <button
          type="button"
          onClick={onDiscard}
          disabled={sending}
          className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70 disabled:opacity-50"
          aria-label="Cancelar envio de imagem"
          title="Cancelar"
        >
          <X size={18} strokeWidth={2} />
        </button>
        {fileIndices.length > 1 ? (
          <span className="absolute left-3 top-3 z-10 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white backdrop-blur-sm">
            {safeActive + 1} / {fileIndices.length}
          </span>
        ) : null}
        {activeFileIndex != null && previewByFileIndex[activeFileIndex] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewByFileIndex[activeFileIndex]}
            alt=""
            className="max-h-full max-w-full select-none rounded-lg object-contain"
            draggable={false}
          />
        ) : null}
      </div>

      {/* Rodapé fixo embaixo — idêntico ao composer do chat normal */}
      <div className="mt-auto flex-shrink-0 border-0 bg-transparent px-3 pb-3 pt-2 sm:px-4">
        {fileIndices.length > 0 && (
          <div className="mb-2 flex justify-center overflow-x-auto">
            <div className="flex items-center justify-center gap-2">
            {fileIndices.map((fileIdx, listIdx) => (
              <button
                key={fileIdx}
                type="button"
                onClick={() => onActiveIndexChange(listIdx)}
                className={clsx(
                  'relative h-12 w-12 shrink-0 overflow-hidden rounded-lg transition-opacity',
                  listIdx === safeActive ? 'opacity-100' : 'opacity-50 hover:opacity-80',
                )}
                aria-label={`Imagem ${listIdx + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewByFileIndex[fileIdx]}
                  alt=""
                  className="h-full w-full object-cover"
                />
                {fileIndices.length > 1 ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveAt(fileIdx);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemoveAt(fileIdx);
                      }
                    }}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-600"
                    aria-label="Remover"
                  >
                    <X size={11} strokeWidth={2.5} />
                  </span>
                ) : null}
              </button>
            ))}
            {canAddMore && onAddImages ? (
              <button
                type="button"
                onClick={onAddImages}
                disabled={sending}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-400 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-800"
                aria-label="Adicionar imagem"
              >
                <Plus size={22} strokeWidth={2} />
              </button>
            ) : null}
            </div>
          </div>
        )}

        <div
          className={clsx(
            'flex min-h-[52px] w-full min-w-0 flex-nowrap items-center gap-1 rounded-full px-1.5 py-1.5',
            'border border-gray-200/80 dark:border-gray-600/50',
            'bg-white dark:bg-gray-900',
          )}
        >
          <div className="flex h-11 shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={onAddImages}
              disabled={sending || !canAddMore || !onAddImages}
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-transparent text-gray-600 transition-colors [backface-visibility:hidden] hover:bg-black/[0.06] dark:text-gray-200 dark:hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
              title="Adicionar imagem"
              aria-label="Adicionar imagem"
            >
              <Plus size={22} strokeWidth={2} className="shrink-0" />
            </button>
            <div className="relative flex h-11 shrink-0 items-center justify-center" ref={emojiRef}>
              <button
                type="button"
                onClick={onToggleEmojiPicker}
                disabled={sending}
                className="flex size-11 shrink-0 items-center justify-center rounded-full border border-transparent text-gray-600 transition-colors hover:bg-black/[0.06] dark:text-gray-200 dark:hover:bg-white/10"
                title="Emojis"
                aria-label="Emojis"
              >
                <Smile size={22} strokeWidth={2} className="shrink-0" />
              </button>
              {showEmojiPicker && onPickEmoji ? (
                <div
                  className="absolute bottom-full left-0 z-50 mb-2 flex w-[200px] flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-[#1f2c33]"
                  role="listbox"
                >
                  {['👍', '😀', '😂', '❤️', '🔥', '👏', '🎉', '😮', '😢', '🙏', '✅', '👋'].map(
                    (e) => (
                      <button
                        key={e}
                        type="button"
                        className="rounded p-1 text-xl leading-none hover:bg-gray-100 dark:hover:bg-white/10"
                        onClick={() => onPickEmoji(e)}
                      >
                        {e}
                      </button>
                    ),
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <ChatComposerField
            textareaRef={captionRef}
            value={caption}
            onChange={handleCaptionChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
                return;
              }
              onCaptionKeyDown?.(e);
            }}
            onPaste={onPaste}
            onResize={resizeCaption}
            placeholder="Digite uma mensagem"
            disabled={sending}
          />

          <div className="flex h-11 shrink-0 items-center justify-center">
            <button
              type="button"
              onClick={onSend}
              disabled={sending || fileIndices.length === 0}
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-transparent bg-red-600 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              title="Enviar"
              aria-label="Enviar mensagem"
            >
              {sending ? (
                <Loader2 size={22} className="animate-spin shrink-0" />
              ) : (
                <Send size={22} strokeWidth={2} className="shrink-0" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
