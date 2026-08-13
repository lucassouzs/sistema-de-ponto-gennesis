'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isDocumentReload } from '@/lib/pageReveal';

/**
 * Reexecuta a animação de entrada a cada troca de rota e após F5 / bfcache.
 * Usado no MainLayout — não anima sidebar/topbar.
 */
export function PageEnter({
  children,
  ready = true,
  fromReload = false,
}: {
  children: React.ReactNode;
  /** Só anima depois do boot visual (reload/login). */
  ready?: boolean;
  fromReload?: boolean;
}) {
  const pathname = usePathname();
  const [tick, setTick] = useState(0);
  const [reloadAnim, setReloadAnim] = useState(fromReload);

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
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  // Troca de rota (não no mount): limpa flag de reload
  const isFirstPathEffect = React.useRef(true);
  useEffect(() => {
    if (isFirstPathEffect.current) {
      isFirstPathEffect.current = false;
      return;
    }
    setTick(0);
    setReloadAnim(false);
  }, [pathname]);

  if (!ready) {
    return <div className="page-enter page-enter--pending">{children}</div>;
  }

  return (
    <div
      key={`${pathname}-${tick}`}
      className={`page-enter${reloadAnim ? ' page-enter--reload' : ''}`}
    >
      {children}
    </div>
  );
}
