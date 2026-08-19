export const ROW_ACTION_MENU_GAP_PX = 4;
export const ROW_ACTION_MENU_VIEWPORT_PAD_PX = 8;
/** Altura mínima desejável antes de preferir abrir o menu para cima (~3 itens). */
export const ROW_ACTION_MENU_MIN_HEIGHT_PX = 132;
export const ROW_ACTION_MENU_MAX_HEIGHT_PX = 320;

export type RowActionMenuPlacement = 'below' | 'above';

export type RowActionMenuCoords = {
  top: number;
  left: number;
  maxHeight: number;
  placement: RowActionMenuPlacement;
};

export function computeRowActionMenuPosition(
  rect: DOMRect,
  menuWidthPx: number
): RowActionMenuCoords {
  let left = rect.right - menuWidthPx;
  left = Math.max(
    ROW_ACTION_MENU_VIEWPORT_PAD_PX,
    Math.min(left, window.innerWidth - menuWidthPx - ROW_ACTION_MENU_VIEWPORT_PAD_PX)
  );

  const spaceBelow =
    window.innerHeight - rect.bottom - ROW_ACTION_MENU_GAP_PX - ROW_ACTION_MENU_VIEWPORT_PAD_PX;
  const spaceAbove = rect.top - ROW_ACTION_MENU_GAP_PX - ROW_ACTION_MENU_VIEWPORT_PAD_PX;

  // Preferir abrir para cima quando embaixo não comporta ~3 itens e há mais espaço acima.
  const openAbove =
    spaceBelow < ROW_ACTION_MENU_MIN_HEIGHT_PX && spaceAbove > spaceBelow;

  if (!openAbove) {
    return {
      top: rect.bottom + ROW_ACTION_MENU_GAP_PX,
      left,
      maxHeight: Math.min(ROW_ACTION_MENU_MAX_HEIGHT_PX, Math.max(spaceBelow, 0)),
      placement: 'below',
    };
  }

  return {
    top: rect.top - ROW_ACTION_MENU_GAP_PX,
    left,
    maxHeight: Math.min(ROW_ACTION_MENU_MAX_HEIGHT_PX, Math.max(spaceAbove, 0)),
    placement: 'above',
  };
}
