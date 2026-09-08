'use client';

import React, { useState } from 'react';
import { ListChecks, Plus, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/Checkbox';

export type NaoSeHabilitaItem = {
  id: string;
  title: string;
  isDone: boolean;
};

type Props = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  items: NaoSeHabilitaItem[];
  onItemsChange: (items: NaoSeHabilitaItem[]) => void;
  disabled?: boolean;
};

export function LicitacaoNaoSeHabilitaPanel({
  enabled,
  onEnabledChange,
  items,
  onItemsChange,
  disabled = false,
}: Props) {
  const [newItem, setNewItem] = useState('');

  const handleAdd = () => {
    const title = newItem.trim();
    if (!title || disabled) return;
    onItemsChange([
      ...items,
      {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `nsh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        isDone: false,
      },
    ]);
    setNewItem('');
  };

  const removeItem = (id: string) => {
    if (disabled) return;
    onItemsChange(items.filter((item) => item.id !== id));
  };

  return (
    <CardShell>
      <Checkbox
        checked={enabled}
        disabled={disabled}
        onChange={onEnabledChange}
        label="Não se habilita"
      />

      {enabled ? (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-red-600" aria-hidden />
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Motivos / itens
            </h4>
            {items.length > 0 ? (
              <span className="text-xs text-gray-500">{items.length} item(ns)</span>
            ) : null}
          </div>

          {items.length > 0 ? (
            <ul className="mb-3 space-y-1">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  className="group/item flex items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-white/80 dark:hover:bg-gray-800/50"
                >
                  <span className="shrink-0 pt-0.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Item {index + 1} -
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-gray-900 dark:text-gray-100">
                    {item.title}
                  </span>
                  <button
                    type="button"
                    title="Excluir item"
                    disabled={disabled}
                    onClick={() => removeItem(item.id)}
                    className="rounded p-1 text-gray-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover/item:opacity-100 disabled:opacity-40 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-center text-sm text-gray-400">
              Nenhum item ainda. Digite e pressione Enter.
            </p>
          )}

          <div className="flex items-center gap-2">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="Adicionar item..."
              disabled={disabled}
              className="h-9 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={disabled || !newItem.trim()}
              title="Adicionar item"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </CardShell>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm dark:border-gray-800 dark:bg-gray-950/40">
      {children}
    </div>
  );
}
