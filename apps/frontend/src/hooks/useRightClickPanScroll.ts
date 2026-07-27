'use client';

import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

const MOVE_THRESHOLD_PX = 4;

type Scroller = HTMLElement | 'window';

type PanState = {
  panning: boolean;
  didPan: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
  xScroller: Scroller;
  yScroller: Scroller;
  prevHtmlScrollBehavior: string;
};

function canScroll(node: HTMLElement, axis: 'x' | 'y'): boolean {
  const overflow =
    axis === 'x' ? getComputedStyle(node).overflowX : getComputedStyle(node).overflowY;
  if (!/(auto|scroll|overlay)/.test(overflow)) return false;
  return axis === 'x'
    ? node.scrollWidth > node.clientWidth + 1
    : node.scrollHeight > node.clientHeight + 1;
}

/**
 * Horizontal: prioriza o próprio elemento (lista/board).
 * Vertical: se o elemento não rola em Y, vai direto na window — evita ancestrais
 * intermediários e o jank do scroll-behavior: smooth no html.
 */
function getScroller(el: HTMLElement, axis: 'x' | 'y'): Scroller {
  if (canScroll(el, axis)) return el;
  if (axis === 'y') return 'window';
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.documentElement) {
    if (canScroll(node, axis)) return node;
    node = node.parentElement;
  }
  return 'window';
}

function readScroll(scroller: Scroller, axis: 'x' | 'y'): number {
  if (scroller === 'window') {
    return axis === 'x' ? window.scrollX : window.scrollY;
  }
  return axis === 'x' ? scroller.scrollLeft : scroller.scrollTop;
}

function writeScroll(scroller: Scroller, axis: 'x' | 'y', value: number) {
  if (scroller === 'window') {
    // Com scroll-behavior: auto no html durante o pan, 'auto' é instantâneo.
    window.scrollTo({
      left: axis === 'x' ? value : window.scrollX,
      top: axis === 'y' ? value : window.scrollY,
      behavior: 'auto',
    });
    return;
  }
  if (axis === 'x') scroller.scrollLeft = value;
  else scroller.scrollTop = value;
}

function bindRightClickPan<T extends HTMLElement>(el: T): () => void {
  const state: PanState = {
    panning: false,
    didPan: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
    xScroller: el,
    yScroller: 'window',
    prevHtmlScrollBehavior: '',
  };

  const clearCursor = () => {
    el.style.cursor = '';
    el.style.userSelect = '';
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.documentElement.style.scrollBehavior = state.prevHtmlScrollBehavior;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!state.panning || e.pointerId !== state.pointerId) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (Math.abs(dx) > MOVE_THRESHOLD_PX || Math.abs(dy) > MOVE_THRESHOLD_PX) {
      state.didPan = true;
    }
    writeScroll(state.xScroller, 'x', state.startScrollLeft - dx);
    writeScroll(state.yScroller, 'y', state.startScrollTop - dy);
  };

  const endPan = (e: PointerEvent) => {
    if (!state.panning) return;
    if (e.pointerId !== state.pointerId && e.type !== 'pointercancel') return;
    state.panning = false;
    clearCursor();
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', endPan, true);
    document.removeEventListener('pointercancel', endPan, true);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 2) return;
    state.panning = true;
    state.didPan = false;
    state.pointerId = e.pointerId;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.xScroller = getScroller(el, 'x');
    state.yScroller = getScroller(el, 'y');
    state.startScrollLeft = readScroll(state.xScroller, 'x');
    state.startScrollTop = readScroll(state.yScroller, 'y');
    state.prevHtmlScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    // Listeners no document: sobrevive a scroll da página (pointer capture costuma falhar).
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', endPan, true);
    document.addEventListener('pointercancel', endPan, true);
  };

  const onContextMenu = (e: Event) => {
    if (!state.didPan) return;
    e.preventDefault();
    e.stopPropagation();
    state.didPan = false;
  };

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('contextmenu', onContextMenu);

  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('contextmenu', onContextMenu);
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', endPan, true);
    document.removeEventListener('pointercancel', endPan, true);
    if (state.panning) {
      state.panning = false;
      clearCursor();
    }
  };
}

/**
 * Arrastar com o botão direito para pan/scroll (estilo Miro) em um container overflow.
 * - Sem argumento: retorna callback ref.
 * - Com RefObject: anexa no elemento apontado pelo ref.
 */
export function useRightClickPanScroll<T extends HTMLElement>(
  externalRef?: RefObject<T | null>
) {
  const cleanupRef = useRef<(() => void) | null>(null);

  const attach = useCallback((el: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!el) return;
    cleanupRef.current = bindRightClickPan(el);
  }, []);

  useLayoutEffect(() => {
    if (!externalRef) return;
    attach(externalRef.current);
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [attach, externalRef]);

  return attach;
}
