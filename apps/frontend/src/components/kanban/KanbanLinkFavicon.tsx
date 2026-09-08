'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import { clsx } from 'clsx';

export function getHostnameFromUrl(url: string): string | null {
  try {
    const trimmed = url.trim();
    if (!trimmed) return null;
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withScheme).hostname;
  } catch {
    return null;
  }
}

function buildFaviconSources(hostname: string): string[] {
  return [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
  ];
}

export interface KanbanLinkFaviconProps {
  url: string;
  size?: 'sm' | 'md';
  className?: string;
}

const boxClass = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
} as const;

const fallbackIconClass = {
  sm: 'h-4 w-4',
  md: 'h-4 w-4',
} as const;

export function KanbanLinkFavicon({ url, size = 'sm', className }: KanbanLinkFaviconProps) {
  const hostname = useMemo(() => getHostnameFromUrl(url), [url]);
  const sources = useMemo(
    () => (hostname ? buildFaviconSources(hostname) : []),
    [hostname],
  );
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [url, hostname]);

  const faviconUrl = sources[sourceIndex] ?? null;
  const showFallback = !faviconUrl || sourceIndex >= sources.length;

  function handleImageError() {
    setSourceIndex((i) => i + 1);
  }

  return (
    <span
      className={clsx(
        'relative shrink-0 overflow-hidden rounded-md',
        boxClass[size],
        showFallback && 'flex items-center justify-center bg-gray-100 dark:bg-gray-700',
        className,
      )}
    >
      {showFallback ? (
        <Link2
          className={clsx(fallbackIconClass[size], 'text-gray-500 dark:text-gray-400')}
          aria-hidden
        />
      ) : (
        <img
          src={faviconUrl}
          alt=""
          className="h-full w-full scale-[1] object-cover"
          onError={handleImageError}
          referrerPolicy="no-referrer"
        />
      )}
    </span>
  );
}
