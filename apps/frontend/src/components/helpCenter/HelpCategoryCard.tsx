'use client';

import React from 'react';
import Link from 'next/link';
import type { HelpCategory } from '@/lib/helpCenter';
import { HelpCategoryPreviewVisual } from './HelpCategoryPreviewVisual';

export function HelpCategoryCard({ category }: { category: HelpCategory }) {
  return (
    <Link
      href={`/ponto/central-de-ajuda/categoria/${category.slug}`}
      className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white outline-none transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gray-400/40 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-800/80 dark:focus-visible:ring-offset-gray-900"
    >
      <HelpCategoryPreviewVisual preview={category.preview} />
      <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-700">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
          {category.title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          {category.description}
        </p>
      </div>
    </Link>
  );
}
