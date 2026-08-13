/** Revelação visual em hard refresh (F5) das páginas autenticadas. */

import {
  AUTH_REVEAL_MS,
  AUTH_VEIL_ID,
  authTransitionRevealIfNeeded,
  peekAuthTransition,
} from '@/lib/authTransition';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function isDocumentReload(): boolean {
  if (typeof performance === 'undefined') return false;
  try {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav?.type === 'reload') return true;
    // Fallback legado
    const legacy = (performance as unknown as { navigation?: { type?: number } }).navigation;
    return legacy?.type === 1;
  } catch {
    return false;
  }
}

function ensureVeil(): HTMLElement {
  let el = document.getElementById(AUTH_VEIL_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = AUTH_VEIL_ID;
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  return el;
}

/** Véu breve → revela (mesmo visual do cold enter do login). */
async function pageReloadReveal(): Promise<void> {
  if (typeof document === 'undefined') return;
  if (document.getElementById(AUTH_VEIL_ID)) return;
  if (prefersReducedMotion()) return;

  const el = ensureVeil();
  el.className = 'auth-transition-veil auth-transition-veil--to-app auth-transition-veil--covering';
  el.style.opacity = '1';
  await wait(100);
  el.classList.remove('auth-transition-veil--covering');
  el.classList.add('auth-transition-veil--revealing');
  el.style.opacity = '';
  await wait(AUTH_REVEAL_MS);
  el.remove();
}

/**
 * Boot visual do shell autenticado:
 * - após login: revela véu do auth
 * - após F5: véu curto + libera animação de conteúdo
 */
export async function bootAuthenticatedPageReveal(): Promise<{ fromReload: boolean }> {
  if (typeof window === 'undefined') return { fromReload: false };

  if (peekAuthTransition()) {
    await authTransitionRevealIfNeeded();
    return { fromReload: false };
  }

  const fromReload = isDocumentReload();
  if (fromReload) {
    await pageReloadReveal();
  }

  return { fromReload };
}
