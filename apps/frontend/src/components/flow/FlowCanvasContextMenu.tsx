'use client';

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BoxSelect, Trash2 } from 'lucide-react';

type FlowCanvasContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  canDelete: boolean;
  onClose: () => void;
  onSelectAll: () => void;
  onDelete: () => void;
};

export function FlowCanvasContextMenu({
  open,
  x,
  y,
  canDelete,
  onClose,
  onSelectAll,
  onDelete,
}: FlowCanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = React.useState({ x, y });

  useLayoutEffect(() => {
    if (!open) return;
    setPosition({ x, y });
  }, [open, x, y]);

  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const el = menuRef.current;
    if (!el) return;

    const margin = 8;
    const { width, height } = el.getBoundingClientRect();
    if (!width && !height) return;

    let nextX = x;
    let nextY = y;
    if (nextX + width + margin > window.innerWidth) {
      nextX = Math.max(margin, window.innerWidth - width - margin);
    }
    if (nextY + height + margin > window.innerHeight) {
      nextY = Math.max(margin, window.innerHeight - height - margin);
    }
    if (nextX !== position.x || nextY !== position.y) {
      setPosition({ x: nextX, y: nextY });
    }
  }, [open, x, y, position.x, position.y]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onMouseDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };

    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onMouseDown, true);
    }, 0);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onClose, true);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ left: position.x, top: position.y }}
      className="fixed z-[200] min-w-[180px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onSelectAll();
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <BoxSelect className="h-4 w-4 shrink-0" />
        Selecionar tudo
      </button>
      <hr className="my-1 border-gray-200 dark:border-gray-700" />
      <button
        type="button"
        role="menuitem"
        disabled={!canDelete}
        onClick={() => {
          if (!canDelete) return;
          onDelete();
          onClose();
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-900/20"
      >
        <Trash2 className="h-4 w-4 shrink-0" />
        Excluir
      </button>
    </div>,
    document.body,
  );
}
