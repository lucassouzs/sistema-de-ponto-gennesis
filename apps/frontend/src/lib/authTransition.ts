/** Transição visual entre app ↔ login (véu em tela cheia). */

export const AUTH_TRANSITION_STORAGE_KEY = 'gennesis-auth-transition';
export type AuthTransitionKind = 'to-login' | 'to-app';

export const AUTH_VEIL_ID = 'auth-transition-veil';
export const AUTH_COVER_MS = 420;
export const AUTH_REVEAL_MS = 480;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function markAuthTransition(kind: AuthTransitionKind) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(AUTH_TRANSITION_STORAGE_KEY, kind);
  } catch {
    /* ignore */
  }
}

export function peekAuthTransition(): AuthTransitionKind | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = sessionStorage.getItem(AUTH_TRANSITION_STORAGE_KEY);
    return v === 'to-login' || v === 'to-app' ? v : null;
  } catch {
    return null;
  }
}

export function consumeAuthTransition(): AuthTransitionKind | null {
  const kind = peekAuthTransition();
  if (typeof window === 'undefined') return null;
  try {
    sessionStorage.removeItem(AUTH_TRANSITION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return kind;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
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

/**
 * Cobre a tela atual antes de navegar (logout → login ou login → app).
 * O véu permanece no DOM para a próxima página revelar.
 */
export async function authTransitionCover(kind: AuthTransitionKind): Promise<void> {
  if (typeof document === 'undefined') return;
  markAuthTransition(kind);

  if (prefersReducedMotion()) return;

  const el = ensureVeil();
  el.className = `auth-transition-veil auth-transition-veil--${kind}`;
  // reflow para garantir que a animação rode mesmo se o nó já existia
  void el.offsetWidth;
  el.classList.add('auth-transition-veil--covering');
  document.documentElement.classList.add('auth-transition-dimming');

  await wait(AUTH_COVER_MS);
}

/**
 * Remove o véu com fade-out na página de destino.
 * Seguro chamar sempre no mount de login / shell autenticado.
 */
export async function authTransitionRevealIfNeeded(): Promise<void> {
  if (typeof document === 'undefined') return;

  const pending = consumeAuthTransition();
  const el = document.getElementById(AUTH_VEIL_ID);

  document.documentElement.classList.remove('auth-transition-dimming');

  if (!el && !pending) return;

  if (prefersReducedMotion()) {
    el?.remove();
    return;
  }

  if (!el) return;

  // Se chegou sem cover (ex.: hard refresh), só remove
  if (!pending && !el.classList.contains('auth-transition-veil--covering')) {
    el.remove();
    return;
  }

  el.classList.remove('auth-transition-veil--covering');
  el.classList.add('auth-transition-veil--revealing');
  await wait(AUTH_REVEAL_MS);
  el.remove();
}

/**
 * Primeira abertura do login (sem vir de logout): breve véu → revela a página.
 */
export async function authTransitionLoginColdEnter(): Promise<void> {
  if (typeof document === 'undefined') return;
  if (peekAuthTransition()) return;
  if (document.getElementById(AUTH_VEIL_ID)) return;
  if (prefersReducedMotion()) return;

  const el = ensureVeil();
  el.className = 'auth-transition-veil auth-transition-veil--to-login auth-transition-veil--covering';
  el.style.opacity = '1';
  await wait(120);
  el.classList.remove('auth-transition-veil--covering');
  el.classList.add('auth-transition-veil--revealing');
  el.style.opacity = '';
  await wait(AUTH_REVEAL_MS);
  el.remove();
}
