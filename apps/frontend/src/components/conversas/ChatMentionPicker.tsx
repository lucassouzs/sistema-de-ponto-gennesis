'use client';

import React from 'react';
import { Bot } from 'lucide-react';
import { clsx } from 'clsx';
import type { ChatMentionOption } from '@/lib/chatMentions';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export interface ChatMentionPickerProps {
  options: ChatMentionOption[];
  activeIndex: number;
  onSelect: (option: ChatMentionOption) => void;
  onHoverIndex: (index: number) => void;
}

export function ChatMentionPicker({
  options,
  activeIndex,
  onSelect,
  onHoverIndex,
}: ChatMentionPickerProps) {
  if (options.length === 0) {
    return (
      <div
        role="listbox"
        className="absolute bottom-full left-0 z-[80] mb-2 w-full min-w-[220px] max-w-sm rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
      >
        Nenhuma menção encontrada
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Mencionar pessoa ou Gennecy"
      className="absolute bottom-full left-0 z-[80] mb-2 w-full min-w-[240px] max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
      onMouseDown={(e) => e.preventDefault()}
    >
      <p className="border-b border-gray-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
        Mencionar
      </p>
      <ul className="max-h-52 overflow-y-auto py-1">
        {options.map((opt, i) => {
          const active = i === activeIndex;
          const photo = resolveApiMediaUrl(opt.photoUrl ?? null);
          return (
            <li key={opt.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={clsx(
                  'flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors',
                  active
                    ? 'bg-red-50 text-red-900 dark:bg-red-900/30 dark:text-red-100'
                    : 'text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/60',
                )}
                onMouseEnter={() => onHoverIndex(i)}
                onClick={() => onSelect(opt)}
              >
                <span
                  className={clsx(
                    'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold',
                    opt.kind === 'bot'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200',
                  )}
                >
                  {opt.kind === 'bot' ? (
                    photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Bot className="h-4 w-4" strokeWidth={2.5} />
                    )
                  ) : photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    getInitials(opt.label)
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{opt.label}</span>
                  {opt.subtitle ? (
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      {opt.subtitle}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-mono text-xs text-gray-400 dark:text-gray-500">
                  {opt.insertText.trim()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-400 dark:border-gray-700 dark:text-gray-500">
        ↑↓ navegar · Enter para inserir
      </p>
    </div>
  );
}
