'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { CheckboxIndicator } from '@/components/ui/Checkbox';
import { LicitacaoCommentEditor, LicitacaoCommentFormatted } from './LicitacaoCommentEditor';
import {
  type ChecklistItemState,
  type ChecklistSectionDef,
  checklistItemKey,
} from './licitacaoChecklist';

type Props = {
  sections: ChecklistSectionDef[];
  state: Record<string, ChecklistItemState>;
  onChange: (key: string, patch: Partial<ChecklistItemState>) => void;
  disabled?: boolean;
  canManageItems?: boolean;
  onAddItem?: (sectionId: string, label: string) => void | Promise<void>;
  onRemoveItem?: (sectionId: string, itemId: string) => void | Promise<void>;
  managingItems?: boolean;
};

export function LicitacaoChecklistEditor({
  sections,
  state,
  onChange,
  disabled,
  canManageItems,
  onAddItem,
  onRemoveItem,
  managingItems,
}: Props) {
  const [addingSectionId, setAddingSectionId] = useState<string | null>(null);
  const [newItemLabel, setNewItemLabel] = useState('');
  const [openCommentKeys, setOpenCommentKeys] = useState<Set<string>>(() => new Set());

  const toggleComment = useCallback((key: string) => {
    setOpenCommentKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const closeAllComments = useCallback(() => {
    setOpenCommentKeys((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  useEffect(() => {
    if (openCommentKeys.size === 0) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const host = target.closest('[data-checklist-comment-host]');
      if (host) {
        const hostKey = host.getAttribute('data-checklist-comment-host');
        if (hostKey && openCommentKeys.has(hostKey)) return;
      }

      if (target.closest('[data-checklist-comment-toggle]')) return;

      closeAllComments();
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [openCommentKeys, closeAllComments]);

  const submitNewItem = async (sectionId: string) => {
    const label = newItemLabel.trim();
    if (!label || !onAddItem) return;
    await onAddItem(sectionId, label);
    setNewItemLabel('');
    setAddingSectionId(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Checklist de análise de licitações
      </p>
      {sections.map((section) => (
        <section key={section.id}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-gray-800 dark:text-gray-200">
              {section.title}
            </h3>
            {canManageItems ? (
              <button
                type="button"
                disabled={disabled || managingItems}
                onClick={() => {
                  setAddingSectionId(section.id);
                  setNewItemLabel('');
                }}
                className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Plus className="h-3 w-3" />
                Item
              </button>
            ) : null}
          </div>
          <ul className="space-y-2">
            {section.items.map((item) => {
              const key = checklistItemKey(section.id, item.id);
              const row = state[key] ?? { checked: false, comentario: '' };
              const commentOpen = openCommentKeys.has(key);
              const hasComment = Boolean(row.comentario.trim());
              return (
                <li
                  key={key}
                  data-checklist-comment-host={commentOpen ? key : undefined}
                  className="rounded-md border border-gray-200 bg-gray-50/80 px-2.5 py-2 dark:border-gray-700 dark:bg-gray-900/40"
                >
                  <div className="flex items-start gap-2">
                    <label
                      className={`group flex min-w-0 flex-1 items-start gap-2 ${
                        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                      }`}
                    >
                      <span className="relative mt-0.5 inline-flex size-5 shrink-0 items-center justify-center">
                        <input
                          type="checkbox"
                          checked={row.checked}
                          disabled={disabled}
                          onChange={(e) => onChange(key, { checked: e.target.checked })}
                          className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
                        />
                        <CheckboxIndicator checked={row.checked} disabled={disabled} />
                      </span>
                      <span className="text-xs leading-snug text-gray-800 dark:text-gray-200">
                        {item.label}
                      </span>
                    </label>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        data-checklist-comment-toggle={key}
                        disabled={disabled}
                        onClick={() => toggleComment(key)}
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium transition-colors ${
                          commentOpen
                            ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                            : hasComment
                              ? 'text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30'
                              : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                        }`}
                        title={commentOpen ? 'Ocultar comentário' : 'Adicionar comentário'}
                      >
                        <MessageSquare className="h-3 w-3 shrink-0" />
                        {commentOpen ? 'Ocultar' : 'Comentário'}
                      </button>
                      {canManageItems ? (
                        <button
                          type="button"
                          disabled={disabled || managingItems}
                          onClick={() => onRemoveItem?.(section.id, item.id)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30"
                          title="Excluir item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {commentOpen ? (
                    <div className="mt-1.5 space-y-1">
                      <LicitacaoCommentEditor
                        value={row.comentario}
                        disabled={disabled}
                        onChange={(comentario) => onChange(key, { comentario })}
                      />
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        Ctrl+B negrito · Ctrl+I itálico · Ctrl+U sublinhado · Tab indenta · &quot;-&quot; + espaço bolinha
                      </p>
                    </div>
                  ) : hasComment ? (
                    <div className="mt-1.5 text-xs text-gray-700 dark:text-gray-300">
                      <LicitacaoCommentFormatted text={row.comentario} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {canManageItems && addingSectionId === section.id ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={newItemLabel}
                onChange={(e) => setNewItemLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void submitNewItem(section.id);
                  }
                  if (e.key === 'Escape') {
                    setAddingSectionId(null);
                    setNewItemLabel('');
                  }
                }}
                placeholder="Texto do novo item…"
                className="h-8 min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 text-xs dark:border-gray-600 dark:bg-gray-900"
                autoFocus
              />
              <button
                type="button"
                disabled={!newItemLabel.trim() || managingItems}
                onClick={() => void submitNewItem(section.id)}
                className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {managingItems ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Adicionar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingSectionId(null);
                  setNewItemLabel('');
                }}
                className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600"
              >
                Cancelar
              </button>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
