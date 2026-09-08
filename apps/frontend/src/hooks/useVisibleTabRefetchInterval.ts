'use client';

import { useEffect, useState } from 'react';

/**
 * Retorna o intervalo de polling quando a aba do navegador está visível,
 * ou `false` quando oculta (economiza rede e CPU do servidor).
 */
export function useVisibleTabRefetchInterval(intervalMs: number): number | false {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  );

  useEffect(() => {
    const onVisibilityChange = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  return visible ? intervalMs : false;
}

/** Para `refetchInterval` do React Query — callback com acesso ao document. */
export function visibleTabRefetchInterval(intervalMs: number): number | false {
  if (typeof document === 'undefined') return intervalMs;
  return document.hidden ? false : intervalMs;
}
