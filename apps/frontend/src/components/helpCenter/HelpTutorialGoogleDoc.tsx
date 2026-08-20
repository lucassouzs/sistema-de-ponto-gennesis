'use client';

import React, { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { toGoogleDocsEmbedUrl } from '@/lib/helpCenter/googleDocsEmbed';

export function HelpTutorialGoogleDoc({ docsUrl }: { docsUrl: string }) {
  const embedUrl = useMemo(() => toGoogleDocsEmbedUrl(docsUrl), [docsUrl]);

  if (!embedUrl) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        URL do Google Docs inválida.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <iframe
          title="Google Docs"
          src={embedUrl}
          className="h-[min(75vh,720px)] w-full border-0"
          allow="fullscreen"
        />
      </div>
      <div className="flex justify-end">
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
        >
          Abrir no Google Docs
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}
