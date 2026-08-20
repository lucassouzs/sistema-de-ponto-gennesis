'use client';

import React, { useMemo } from 'react';
import { helpMarkdownToHtml } from '@/lib/helpCenter/helpMarkdown';

export function HelpTutorialMarkdown({ markdown }: { markdown: string }) {
  const html = useMemo(() => helpMarkdownToHtml(markdown), [markdown]);

  if (!markdown.trim()) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">Sem conteúdo.</p>
    );
  }

  return (
    <div
      className="help-markdown max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
