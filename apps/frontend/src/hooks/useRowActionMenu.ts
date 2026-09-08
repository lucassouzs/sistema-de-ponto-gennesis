import { useEffect, useState } from 'react';
import { computeRowActionMenuPosition } from '@/lib/computeRowActionMenuPosition';

export const ROW_ACTION_MENU_WIDTH_PX = 224;

export type RowActionMenuState = {
  rowId: string;
  top: number;
  left: number;
  maxHeight: number;
  placement: 'below' | 'above';
} | null;

export function useRowActionMenu<T extends { id: string }>(rows: T[]) {
  const [rowActionMenu, setRowActionMenu] = useState<RowActionMenuState>(null);

  const rowForActionMenu = rowActionMenu
    ? rows.find((r) => r.id === rowActionMenu.rowId) ?? null
    : null;

  const toggleRowActionMenu = (rowId: string, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setRowActionMenu((prev) => {
      if (prev?.rowId === rowId) return null;
      const coords = computeRowActionMenuPosition(rect, ROW_ACTION_MENU_WIDTH_PX);
      return { rowId, ...coords };
    });
  };

  const closeRowActionMenu = () => setRowActionMenu(null);

  const isRowMenuOpen = (rowId: string) => rowActionMenu?.rowId === rowId;

  useEffect(() => {
    if (!rowActionMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRowActionMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rowActionMenu]);

  useEffect(() => {
    if (rowActionMenu && !rows.some((r) => r.id === rowActionMenu.rowId)) {
      setRowActionMenu(null);
    }
  }, [rowActionMenu, rows]);

  return {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    setRowActionMenu,
    isRowMenuOpen
  };
}
