'use client';

import { useEffect } from 'react';
import { syncModalOpenClass, teardownModalScrollLock } from '@/lib/modalBodyLock';
import { MODAL_OVERLAY_CLASS } from '@/lib/zIndex';

/**
 * Observa overlays de modal no DOM e aplica `modal-open` (scroll + bloqueio da sidebar).
 * Montado uma vez no MainLayout.
 *
 * Só observa `childList` (montar/desmontar overlay). Observar `class` em toda a árvore
 * travava páginas pesadas como Controle Geral e impedia navegar pelo menu.
 */
export function useModalOverlayObserver() {
  useEffect(() => {
    syncModalOpenClass();

    let rafId = 0;
    let delayId = 0;
    const scheduleSync = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        syncModalOpenClass();
        window.clearTimeout(delayId);
        delayId = window.setTimeout(syncModalOpenClass, 220);
      });
    };

    const observer = new MutationObserver(scheduleSync);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      if (rafId) window.cancelAnimationFrame(rafId);
      if (delayId) window.clearTimeout(delayId);
      teardownModalScrollLock();
      document.documentElement.classList.remove('modal-open');
      document.body.classList.remove('modal-open');
    };
  }, []);
}

export { MODAL_OVERLAY_CLASS };
