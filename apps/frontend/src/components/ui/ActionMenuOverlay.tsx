'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Z_ACTION_MENU } from '@/lib/zIndex';

type ActionMenuOverlayProps = {
  open: boolean;
  onClose: () => void;
  top: number;
  left: number;
  children: React.ReactNode;
  /** Largura do painel (classes Tailwind). Default: w-56 */
  panelClassName?: string;
  maxHeight?: number;
  /** Abre acima do botão (translateY -100%). */
  placement?: 'below' | 'above';
  zIndex?: number;
};

/**
 * Overlay + menu ⋮: o painel fica *dentro* do backdrop para o clique
 * nas opções não ser engolido pelo z-index do overlay.
 */
export function ActionMenuOverlay({
  open,
  onClose,
  top,
  left,
  children,
  panelClassName = 'w-56',
  maxHeight,
  placement = 'below',
  zIndex = Z_ACTION_MENU,
}: ActionMenuOverlayProps) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex }} onClick={onClose}>
      <div
        role="menu"
        className={`absolute overflow-y-auto overflow-x-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 ${panelClassName}`}
        style={{
          top,
          left,
          maxHeight,
          transform: placement === 'above' ? 'translateY(-100%)' : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
