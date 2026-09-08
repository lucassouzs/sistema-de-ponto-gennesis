'use client';

import React from 'react';
import Link from 'next/link';
import type { HelpCategoryPreview } from '@/lib/helpCenter';
import { HelpCategoryPreviewVisual } from './HelpCategoryPreviewVisual';

export function HelpTutorialCard({
  title,
  description,
  href,
  preview,
  stepsLabel,
  actions,
  actionsAlwaysVisible = false,
}: {
  title: string;
  description: string;
  href: string;
  preview: HelpCategoryPreview;
  stepsLabel?: string;
  /** Menu de ações (ex.: 3 pontos) — fica à direita do título. */
  actions?: React.ReactNode;
  /** Mantém o menu visível (ex.: enquanto o dropdown está aberto). */
  actionsAlwaysVisible?: boolean;
}) {
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-800/80">
      <Link
        href={href}
        className="block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-400/40"
      >
        <HelpCategoryPreviewVisual preview={preview} />
      </Link>
      <div className="flex flex-1 flex-col border-t border-gray-100 px-4 py-3 dark:border-gray-700">
        <div className="flex flex-1 items-start gap-2">
          <Link href={href} className="flex min-h-full min-w-0 flex-1 flex-col outline-none">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              {description}
            </p>
            {stepsLabel ? (
              <p className="mt-auto pt-2 text-xs text-gray-500 dark:text-gray-500">{stepsLabel}</p>
            ) : null}
          </Link>
          {actions ? (
            <div
              className={`shrink-0 pt-0.5 transition-opacity ${
                actionsAlwaysVisible
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
