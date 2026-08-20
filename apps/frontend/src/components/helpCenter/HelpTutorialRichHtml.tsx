'use client';

import React, { useMemo } from 'react';

function sanitizeRichHtml(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

export function HelpTutorialRichHtml({ html }: { html: string }) {
  const safe = useMemo(() => sanitizeRichHtml(html), [html]);

  if (!safe.trim()) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Sem conteúdo.</p>;
  }

  return (
    <div
      className="help-rich text-sm leading-relaxed text-gray-700 dark:text-gray-300 [&_a]:font-medium [&_a]:text-red-600 [&_a]:underline dark:[&_a]:text-red-400 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-gray-900 dark:[&_h1]:text-gray-100 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-gray-900 dark:[&_h2]:text-gray-100 [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
