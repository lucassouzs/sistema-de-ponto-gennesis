import { MODAL_OVERLAY_CLASS } from '@/lib/zIndex';

/**
 * Considera só overlays que realmente bloqueiam interação
 * (visíveis e com pointer-events ativos).
 */
export function hasBlockingModalOverlay(): boolean {
  if (typeof document === 'undefined') return false;
  const overlays = document.querySelectorAll<HTMLElement>(`.${MODAL_OVERLAY_CLASS}`);
  for (const el of overlays) {
    if (el.closest('[aria-hidden="true"]')) continue;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (style.pointerEvents === 'none') continue;
    // Backdrop de dropdown (z-10/z-20), não modal de verdade.
    const z = Number.parseInt(style.zIndex, 10);
    if (Number.isFinite(z) && z < 1000) continue;
    // Não ignorar opacity 0: a animação de entrada começa em 0 e o observer
    // só vê childList — senão a sidebar continua clicável depois do fade.
    return true;
  }
  return false;
}

/** Wheel/touch dentro da modal (ou dropdown em portal) deve rolar o conteúdo. */
export function isEventInsideModalUi(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Node)) return false;
  const el = target instanceof Element ? target : target.parentElement;
  if (!el) return false;
  if (el.closest(`.${MODAL_OVERLAY_CLASS}`)) return true;
  if (el.closest('#dropdown-portal-root')) return true;
  return false;
}

let wheelLockAttached = false;

function onBackgroundScroll(event: WheelEvent | TouchEvent) {
  if (isEventInsideModalUi(event.target)) return;
  event.preventDefault();
}

function attachWheelLock() {
  if (typeof document === 'undefined' || wheelLockAttached) return;
  document.addEventListener('wheel', onBackgroundScroll, { passive: false, capture: true });
  document.addEventListener('touchmove', onBackgroundScroll, { passive: false, capture: true });
  wheelLockAttached = true;
}

function detachWheelLock() {
  if (typeof document === 'undefined' || !wheelLockAttached) return;
  document.removeEventListener('wheel', onBackgroundScroll, true);
  document.removeEventListener('touchmove', onBackgroundScroll, true);
  wheelLockAttached = false;
}

/** Sincroniza `modal-open` no html/body quando existe overlay de modal no DOM. */
export function syncModalOpenClass() {
  if (typeof document === 'undefined') return;
  const hasOverlay = hasBlockingModalOverlay();
  document.documentElement.classList.toggle('modal-open', hasOverlay);
  document.body.classList.toggle('modal-open', hasOverlay);
  if (hasOverlay) attachWheelLock();
  else detachWheelLock();
}

export function teardownModalScrollLock() {
  detachWheelLock();
}
