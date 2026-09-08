'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ModalCloseConfirm,
  type ModalCloseConfirmProps,
} from '@/components/ui/ModalCloseConfirm';

type Options = {
  /** Quando false, requestClose chama onClose direto. */
  enabled?: boolean;
  /** Reseta o estado do confirm quando o modal pai fecha. */
  isParentOpen?: boolean;
  message?: string;
  title?: string;
};

/**
 * Intercepta fechamento de modal: pede confirmação antes de chamar onClose.
 */
export function useModalCloseConfirm(
  onClose: () => void,
  options: Options = {}
): {
  requestClose: () => void;
  confirmUi: React.ReactNode;
  showConfirm: boolean;
  setShowConfirm: React.Dispatch<React.SetStateAction<boolean>>;
} {
  const { enabled = true, isParentOpen = true, message, title } = options;
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!isParentOpen) setShowConfirm(false);
  }, [isParentOpen]);

  const requestClose = useCallback(() => {
    if (!enabled) {
      onClose();
      return;
    }
    setShowConfirm(true);
  }, [enabled, onClose]);

  const handleConfirm = useCallback(() => {
    setShowConfirm(false);
    onClose();
  }, [onClose]);

  const confirmProps: ModalCloseConfirmProps = {
    isOpen: showConfirm,
    onCancel: () => setShowConfirm(false),
    onConfirm: handleConfirm,
    message,
    title,
  };

  const confirmUi = React.createElement(ModalCloseConfirm, confirmProps);

  return { requestClose, confirmUi, showConfirm, setShowConfirm };
}
