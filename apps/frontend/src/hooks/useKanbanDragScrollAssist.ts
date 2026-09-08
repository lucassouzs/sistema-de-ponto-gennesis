'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Zona nas bordas da tela que ativa o auto-scroll vertical. */
const VERTICAL_EDGE_PX = 120;
/** Zona nas bordas do quadro para scroll horizontal. */
const HORIZONTAL_EDGE_PX = 88;
/** Velocidade mínima (px/frame) — mesmo encostando na borda já rola visível. */
const VERTICAL_MIN_STEP = 28;
const VERTICAL_MAX_STEP = 88;
const HORIZONTAL_MIN_STEP = 18;
const HORIZONTAL_MAX_STEP = 56;
/** Reserva no topo (header) antes de subir o scroll. */
const TOP_INSET_PX = 64;

function verticalScrollStep(pointerY: number): number {
  const vh = window.innerHeight;
  const bottomZoneStart = vh - VERTICAL_EDGE_PX;
  const topZoneEnd = TOP_INSET_PX + VERTICAL_EDGE_PX;

  if (pointerY > bottomZoneStart) {
    const raw = Math.min(1, (pointerY - bottomZoneStart) / VERTICAL_EDGE_PX);
    const intensity = Math.sqrt(raw);
    return VERTICAL_MIN_STEP + (VERTICAL_MAX_STEP - VERTICAL_MIN_STEP) * intensity;
  }

  if (pointerY < topZoneEnd) {
    const raw = Math.min(1, (topZoneEnd - pointerY) / VERTICAL_EDGE_PX);
    const intensity = Math.sqrt(raw);
    return -(VERTICAL_MIN_STEP + (VERTICAL_MAX_STEP - VERTICAL_MIN_STEP) * intensity);
  }

  return 0;
}

function horizontalScrollStep(pointerX: number, board: HTMLElement): number {
  const rect = board.getBoundingClientRect();

  if (pointerX > rect.right - HORIZONTAL_EDGE_PX) {
    const raw = Math.min(1, (pointerX - (rect.right - HORIZONTAL_EDGE_PX)) / HORIZONTAL_EDGE_PX);
    const intensity = Math.sqrt(raw);
    return HORIZONTAL_MIN_STEP + (HORIZONTAL_MAX_STEP - HORIZONTAL_MIN_STEP) * intensity;
  }

  if (pointerX < rect.left + HORIZONTAL_EDGE_PX) {
    const raw = Math.min(1, (rect.left + HORIZONTAL_EDGE_PX - pointerX) / HORIZONTAL_EDGE_PX);
    const intensity = Math.sqrt(raw);
    return -(HORIZONTAL_MIN_STEP + (HORIZONTAL_MAX_STEP - HORIZONTAL_MIN_STEP) * intensity);
  }

  return 0;
}

function isPointerNearBoard(clientX: number, clientY: number, board: HTMLElement | null): boolean {
  if (!board) return false;
  const rect = board.getBoundingClientRect();
  const pad = 48;
  return (
    clientX >= rect.left - pad &&
    clientX <= rect.right + pad &&
    clientY >= rect.top - pad &&
    clientY <= rect.bottom + pad
  );
}

/**
 * Auto-scroll vertical (janela) e horizontal (quadro) durante drag nativo do Kanban,
 * além de permitir rolar com a roda do mouse enquanto segura o card.
 */
export function useKanbanDragScrollAssist(
  isDragging: boolean,
  boardHorizontalRef: RefObject<HTMLElement | null>,
) {
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!isDragging) {
      pointerRef.current = null;
      return;
    }

    let raf = 0;

    const autoScrollStep = () => {
      const pointer = pointerRef.current;
      if (!pointer) {
        raf = requestAnimationFrame(autoScrollStep);
        return;
      }

      const { x, y } = pointer;

      const verticalDelta = verticalScrollStep(y);
      if (verticalDelta !== 0) {
        window.scrollBy({ top: verticalDelta, left: 0, behavior: 'auto' });
      }

      const board = boardHorizontalRef.current;
      if (board) {
        const horizontalDelta = horizontalScrollStep(x, board);
        if (horizontalDelta !== 0) {
          board.scrollLeft += horizontalDelta;
        }
      }

      raf = requestAnimationFrame(autoScrollStep);
    };

    const onDragOver = (e: DragEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };

    const onWheel = (e: WheelEvent) => {
      const board = boardHorizontalRef.current;
      // Só captura a roda perto do quadro — fora disso o scroll da página segue normal.
      if (!isPointerNearBoard(e.clientX, e.clientY, board)) return;

      e.preventDefault();
      window.scrollBy({ top: e.deltaY * 1.35, left: 0, behavior: 'auto' });

      if (!board) return;

      const horizontalDelta = e.deltaX !== 0 ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (horizontalDelta !== 0) {
        board.scrollLeft += horizontalDelta * 1.35;
      }
    };

    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('wheel', onWheel, { passive: false, capture: true });
    raf = requestAnimationFrame(autoScrollStep);

    return () => {
      document.removeEventListener('dragover', onDragOver, true);
      document.removeEventListener('wheel', onWheel, true);
      cancelAnimationFrame(raf);
      pointerRef.current = null;
    };
  }, [isDragging, boardHorizontalRef]);
}
