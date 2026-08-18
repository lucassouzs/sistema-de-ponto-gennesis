'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { MODAL_OVERLAY_CLASS } from '@/lib/zIndex';
import { syncModalOpenClass } from '@/lib/modalBodyLock';

type OverlayTag = 'div' | 'button';

export type AppModalOverlayProps = React.HTMLAttributes<HTMLElement> & {
  as?: OverlayTag;
  type?: 'button' | 'submit' | 'reset';
};

/**
 * Overlay de modal no `document.body`.
 * Overlays `fixed` dentro da página ficam presos à animação de entrada
 * (transform cria containing block) e não cobrem sidebar/topnav.
 */
export function AppModalOverlay({
  as = 'div',
  className,
  children,
  type,
  ...rest
}: AppModalOverlayProps) {
  useEffect(() => {
    syncModalOpenClass();
    const t = window.setTimeout(syncModalOpenClass, 220);
    return () => {
      window.clearTimeout(t);
      syncModalOpenClass();
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    React.createElement(
      as,
      {
        className: clsx(MODAL_OVERLAY_CLASS, className),
        ...(as === 'button' ? { type: type ?? 'button' } : {}),
        ...rest,
      },
      children,
    ),
    document.body,
  );
}
