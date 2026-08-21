'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { kanbanInput } from './kanbanFormStyles';

export interface KanbanCreateBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
  saving?: boolean;
  title?: string;
  submitLabel?: string;
  initialName?: string;
  hint?: string;
}

export function KanbanCreateBoardModal({
  isOpen,
  onClose,
  onSubmit,
  saving = false,
  title = 'Novo quadro',
  submitLabel = 'Criar quadro',
  initialName = '',
  hint = 'Quadros personalizados podem ser compartilhados com outras pessoas.',
}: KanbanCreateBoardModalProps) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (isOpen) setName(initialName);
  }, [isOpen, initialName]);

  const handleClose = () => {
    if (saving) return;
    setName('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await onSubmit(trimmed);
    setName('');
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="sm" confirmBeforeClose>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Nome do quadro
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Projeto Alpha"
            maxLength={80}
            autoFocus
            className={kanbanInput}
          />
          {hint ? (
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" variant="error" disabled={saving || !name.trim()}>
            {saving ? 'Salvando…' : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
