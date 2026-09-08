'use client';

import React, { useCallback, useMemo, useRef } from 'react';
import { splitTextWithMentions } from '@/lib/chatMentions';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** HTML do espelho: mesma largura de caracteres que o textarea (só cor muda, sem bold). */
function buildComposerMirrorHtml(text: string): string {
  return splitTextWithMentions(text)
    .map((seg) => {
      if (seg.type === 'mention') {
        return `<span class="composer-mention-token">${escapeHtml(seg.value)}</span>`;
      }
      return escapeHtml(seg.value);
    })
    .join('');
}

const LAYER_CLASS =
  'chat-composer-layer block w-full min-h-[44px] max-h-[120px] min-w-0 resize-none border-0 bg-transparent px-1.5 py-2 text-base font-normal leading-6';

export interface ChatComposerFieldProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  placeholder?: string;
  disabled?: boolean;
  mentionPicker?: React.ReactNode;
  onResize?: (ta: HTMLTextAreaElement) => void;
}

export function ChatComposerField({
  value,
  onChange,
  onKeyDown,
  onPaste,
  textareaRef,
  placeholder,
  disabled,
  mentionPicker,
  onResize,
}: ChatComposerFieldProps) {
  const mirrorRef = useRef<HTMLDivElement>(null);

  const showPlaceholder = Boolean(placeholder) && value.length === 0;

  const mirrorHtml = useMemo(
    () => (value ? buildComposerMirrorHtml(value) : ''),
    [value],
  );

  const syncMirrorScroll = useCallback(() => {
    const ta = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!ta || !mirror) return;
    mirror.scrollTop = ta.scrollTop;
    mirror.scrollLeft = ta.scrollLeft;
  }, [textareaRef]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e);
    onResize?.(e.target);
    requestAnimationFrame(syncMirrorScroll);
  };

  return (
    <div className="relative flex min-h-[44px] min-w-0 flex-1 flex-col justify-center self-center">
      {mentionPicker}
      <div className="relative min-h-[44px] w-full">
        {value ? (
          <div
            ref={mirrorRef}
            aria-hidden
            className={`composer-mirror-layer pointer-events-none absolute inset-0 z-0 overflow-hidden ${LAYER_CLASS} text-gray-900 dark:text-gray-100`}
            dangerouslySetInnerHTML={{ __html: mirrorHtml }}
          />
        ) : (
          <div ref={mirrorRef} aria-hidden className="absolute inset-0 z-0" />
        )}
        {showPlaceholder ? (
          <div
            className={`composer-placeholder pointer-events-none absolute inset-0 z-[1] overflow-hidden ${LAYER_CLASS} text-gray-500 dark:text-gray-400/90`}
            aria-hidden
          >
            {placeholder}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onScroll={syncMirrorScroll}
          aria-label={placeholder}
          rows={1}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          className={`chat-composer-input chat-composer-input--mentions relative z-[2] ${LAYER_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
          style={{ height: '44px', minHeight: '44px' }}
        />
      </div>
    </div>
  );
}
