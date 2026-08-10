import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { MODAL_OVERLAY_CLASS } from '@/lib/zIndex';
import { syncModalOpenClass } from '@/lib/modalBodyLock';
import { useOpenTransition } from '@/hooks/useOpenTransition';

let modalScrollLockCount = 0;

/** Pilha de modais abertos — o último é o que recebe scroll (ex.: picker sobre o card). */
const modalRootStack: HTMLElement[] = [];

function registerModalRoot(root: HTMLElement) {
  modalRootStack.push(root);
}

function unregisterModalRoot(root: HTMLElement) {
  const idx = modalRootStack.lastIndexOf(root);
  if (idx >= 0) modalRootStack.splice(idx, 1);
}

function isEventInTopModal(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const top = modalRootStack[modalRootStack.length - 1];
  if (top?.contains(target)) return true;
  const portal = document.getElementById('dropdown-portal-root');
  return !!portal?.contains(target);
}

function lockPageScroll() {
  modalScrollLockCount += 1;
}

function unlockPageScroll() {
  modalScrollLockCount = Math.max(0, modalScrollLockCount - 1);
}

const MODAL_ANIM_MS = 220;

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '5xl' | '2xl' | 'full';
  closeOnOverlayClick?: boolean;
  /** Quando false, a tecla Escape não fecha o modal. */
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  headerActions?: React.ReactNode;
  /** Permite dropdowns absolutos saírem do conteúdo sem serem cortados. */
  contentOverflowVisible?: boolean;
  /** Acima de modais padrão (ex.: etiquetas/datas abertas sobre o card). */
  elevated?: boolean;
  /** Quando false, o corpo não rola — o filho controla o overflow (ex.: Kanban card). */
  scrollContent?: boolean;
  /** Classes extras no wrapper interno do conteúdo (ex.: ajustar padding). */
  contentClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  headerActions,
  contentOverflowVisible = false,
  elevated = false,
  scrollContent = true,
  contentClassName,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const { present, visible } = useOpenTransition(isOpen, MODAL_ANIM_MS);

  useEffect(() => {
    if (!isOpen) return;

    const root = rootRef.current;
    if (root) registerModalRoot(root);

    const handleEscape = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        onClose();
      }
    };

    const blockBackgroundScroll = (event: WheelEvent | TouchEvent) => {
      if (isEventInTopModal(event.target)) return;
      event.preventDefault();
    };

    lockPageScroll();
    syncModalOpenClass();
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('wheel', blockBackgroundScroll, { passive: false, capture: true });
    document.addEventListener('touchmove', blockBackgroundScroll, { passive: false, capture: true });

    return () => {
      if (root) unregisterModalRoot(root);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('wheel', blockBackgroundScroll, { capture: true });
      document.removeEventListener('touchmove', blockBackgroundScroll, { capture: true });
      unlockPageScroll();
      syncModalOpenClass();
    };
  }, [isOpen, onClose, closeOnEscape]);

  if (!present) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '2xl': 'max-w-6xl',
    full: 'max-w-full mx-2 sm:mx-4',
  };

  const stopScrollChain = (event: React.WheelEvent | React.TouchEvent) => {
    event.preventDefault();
  };

  const modalContent = (
    <div
      ref={rootRef}
      data-modal-anim="controlled"
      data-state={visible ? 'open' : 'closed'}
      className={clsx(
        MODAL_OVERLAY_CLASS,
        'fixed inset-0 overflow-hidden overscroll-none touch-none',
        elevated ? 'z-[2100]' : 'z-[2000]',
        !isOpen && 'pointer-events-none',
      )}
    >
      <div className="flex h-full min-h-0 items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4 overflow-hidden">
        {/* Overlay */}
        <div
          className={clsx(
            'app-modal-backdrop fixed inset-0 z-0 bg-black/50 touch-none',
            visible ? 'app-modal-backdrop--open' : 'app-modal-backdrop--closed',
          )}
          onMouseDown={(e) => {
            if (closeOnOverlayClick && isOpen && e.target === e.currentTarget) onClose();
          }}
          onWheel={stopScrollChain}
          onTouchMove={stopScrollChain}
        />

        {/* Modal */}
        <div
          role="dialog"
          aria-modal="true"
          className={clsx(
            'app-modal-panel relative z-10 bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-lg shadow-xl w-full flex flex-col',
            'max-h-[min(92dvh,calc(100vh-1.5rem))] sm:max-h-[calc(100dvh-2rem)] overflow-hidden',
            sizeClasses[size],
            visible ? 'app-modal-panel--open' : 'app-modal-panel--closed',
          )}
        >
          {/* Header */}
          {(title || showCloseButton || headerActions) && (
            <div className="flex items-center gap-3 p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 shrink-0 w-full">
              {title ? (
                <div className="flex-1 min-w-0 pr-2">
                  {typeof title === 'string' ? (
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {title}
                    </h3>
                  ) : (
                    title
                  )}
                </div>
              ) : (
                <div className="flex-1 min-w-0" aria-hidden />
              )}
              <div className="flex items-center gap-2 shrink-0 ml-auto">
                {headerActions}
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    aria-label="Fechar"
                  >
                    <X className="w-6 h-6" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Content */}
          <div
            className={clsx(
              'flex-1 min-h-0',
              scrollContent
                ? 'overflow-y-auto overscroll-contain'
                : 'flex min-h-0 flex-col overflow-hidden',
              contentOverflowVisible && scrollContent && 'overflow-x-visible',
            )}
          >
            <div
              className={clsx(
                'p-6',
                !scrollContent && 'flex min-h-0 flex-1 flex-col overflow-hidden',
                contentClassName,
              )}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
