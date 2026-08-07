'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import api from '@/lib/api';
import { resolvePageTitle } from '@/lib/pageTitle';
import { hasStoredAuthToken } from '@/lib/authSession';

/**
 * Envia page-views para o backend (histórico de rastreio do usuário).
 * Debounce por path no cliente; o servidor também deduplica ~45s.
 */
export function usePageActivityTracker() {
  const pathname = usePathname();
  const lastSentRef = useRef<{ path: string; at: number } | null>(null);

  useEffect(() => {
    if (!pathname || !pathname.startsWith('/ponto')) return;
    if (typeof window === 'undefined') return;
    if (!hasStoredAuthToken()) return;

    const now = Date.now();
    const last = lastSentRef.current;
    if (last && last.path === pathname && now - last.at < 30_000) return;

    lastSentRef.current = { path: pathname, at: now };
    const label = resolvePageTitle(pathname) || undefined;

    void api
      .post('/users/me/page-view', { path: pathname, label })
      .catch(() => {
        /* silencioso — não atrapalhar navegação */
      });
  }, [pathname]);
}
