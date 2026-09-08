'use client';

import { useEffect, useState } from 'react';

const DEFAULT_MS = 220;

/**
 * Mantém o conteúdo montado durante a animação de saída.
 * `present` = ainda no DOM; `visible` = estado visual "aberto".
 */
export function useOpenTransition(open: boolean, durationMs = DEFAULT_MS) {
  const [present, setPresent] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (open) {
      setPresent(true);
      if (reduced) {
        setVisible(true);
        return;
      }
      setVisible(false);
      let raf2 = 0;
      const raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        window.cancelAnimationFrame(raf1);
        window.cancelAnimationFrame(raf2);
      };
    }

    setVisible(false);
    if (reduced) {
      setPresent(false);
      return;
    }
    const t = window.setTimeout(() => setPresent(false), durationMs);
    return () => window.clearTimeout(t);
  }, [open, durationMs]);

  return { present, visible };
}
