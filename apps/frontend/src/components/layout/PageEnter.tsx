'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isDocumentReload } from '@/lib/pageReveal';
import { LAYOUT_CHROME } from '@/lib/layoutChrome';

/**
 * Reexecuta a animação de entrada a cada troca de rota e após F5 / bfcache.
 * Usado no MainLayout — não anima sidebar/topbar.
 */
export function PageEnter({
  children,
  ready = true,
  fromReload = false,
  className = '',
}: {
  children: React.ReactNode;
  /** Só anima depois do boot visual (reload/login). */
  ready?: boolean;
  fromReload?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const [tick, setTick] = useState(0);
  const [reloadAnim, setReloadAnim] = useState(fromReload);
  const animKey = `${pathname}-${tick}-${reloadAnim ? '1' : '0'}`;
  const [settledKey, setSettledKey] = useState<string | null>(null);

  useEffect(() => {
    setReloadAnim(fromReload || isDocumentReload());
  }, [fromReload]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setReloadAnim(true);
        setTick((n) => n + 1);
      }
    };
    const onReplay = () => {
      setReloadAnim(false);
      setTick((n) => n + 1);
    };
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener(LAYOUT_CHROME.REPLAY_PAGE_ENTER, onReplay);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener(LAYOUT_CHROME.REPLAY_PAGE_ENTER, onReplay);
    };
  }, []);

  const isFirstPathEffect = React.useRef(true);
  useEffect(() => {
    if (isFirstPathEffect.current) {
      isFirstPathEffect.current = false;
      return;
    }
    setTick(0);
    setReloadAnim(false);
  }, [pathname]);

  useEffect(() => {
    if (!ready) {
      setSettledKey(null);
      return;
    }
    const id = window.setTimeout(() => setSettledKey(animKey), 800);
    return () => window.clearTimeout(id);
  }, [animKey, ready]);

  const extra = className ? ` ${className}` : '';
  const settled = ready && settledKey === animKey;

  if (!ready) {
    return <div className={`page-enter page-enter--pending${extra}`}>{children}</div>;
  }

  return (
    <div
      key={`${pathname}-${tick}`}
      className={`page-enter${reloadAnim ? ' page-enter--reload' : ''}${settled ? ' page-enter--settled' : ''}${extra}`}
    >
      {children}
    </div>
  );
}
