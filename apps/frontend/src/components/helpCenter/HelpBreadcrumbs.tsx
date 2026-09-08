'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export type HelpBreadcrumbItem = {
  label: string;
  href?: string;
};

export function HelpBreadcrumbs({ items }: { items: HelpBreadcrumbItem[] }) {
  return (
    <nav aria-label="Navegação" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
            ) : null}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="hover:text-gray-800 dark:hover:text-gray-200"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={
                  isLast
                    ? 'font-medium text-gray-800 dark:text-gray-200'
                    : undefined
                }
                aria-current={isLast ? 'page' : undefined}
              >
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
