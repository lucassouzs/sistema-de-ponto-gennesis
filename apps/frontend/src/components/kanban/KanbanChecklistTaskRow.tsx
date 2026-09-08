'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, Loader2, Trash2, UserMinus, UserPlus, X } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import {
  type KanbanCardMember,
  type KanbanCardDetail,
  type KanbanChecklistItem,
  updateChecklistItem,
} from '@/lib/kanban';
import { CheckboxIndicator } from '@/components/ui/Checkbox';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Z_MODAL_STACKED } from '@/lib/zIndex';
import { KanbanUserAvatar } from './KanbanUserAvatar';
import { splitDateTime } from './kanbanDateTime';

function formatTaskDueDate(value: string): string {
  const { date } = splitDateTime(value);
  if (!date) return '';
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

function isOverdue(value: string): boolean {
  const { date } = splitDateTime(value);
  if (!date) return false;
  const today = new Date();
  const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return date < t;
}

const POPOVER_Z = Z_MODAL_STACKED;

function useFixedPopoverStyle(
  open: boolean,
  anchorRef: React.RefObject<HTMLButtonElement | null>,
  width: number,
  estimatedHeight: number,
) {
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    const update = () => {
      const rect = anchorRef.current!.getBoundingClientRect();
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < estimatedHeight + gap && rect.top > estimatedHeight + gap;

      setStyle({
        position: 'fixed',
        zIndex: POPOVER_Z,
        width,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
        right: Math.max(8, window.innerWidth - rect.right),
        visibility: 'visible',
      });
    };

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, anchorRef, width, estimatedHeight]);

  return style;
}

export type KanbanTaskAssigneeOption = Pick<
  KanbanCardMember,
  'userId' | 'name' | 'profilePhotoUrl' | 'avatarColor'
>;

export interface KanbanChecklistTaskRowProps {
  item: KanbanChecklistItem;
  cardMembers: KanbanCardMember[];
  currentUser?: KanbanTaskAssigneeOption | null;
  isDeleting?: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdated: (card: KanbanCardDetail) => void | Promise<void>;
  /** Atualiza item ainda sem ID real da API (criação otimista). */
  onLocalPatch?: (
    partial: Partial<
      Pick<KanbanChecklistItem, 'title' | 'dueDate' | 'assigneeUserId' | 'assignee'>
    >,
  ) => void;
}

function KanbanChecklistTaskRowInner({
  item,
  cardMembers,
  currentUser,
  isDeleting = false,
  onToggle,
  onDelete,
  onUpdated,
  onLocalPatch,
}: KanbanChecklistTaskRowProps) {
  const [openMenu, setOpenMenu] = useState<'date' | 'assign' | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [draftDate, setDraftDate] = useState(() => splitDateTime(item.dueDate).date);
  const rowRef = useRef<HTMLLIElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dateBtnRef = useRef<HTMLButtonElement>(null);
  const assignBtnRef = useRef<HTMLButtonElement>(null);
  const datePopoverStyle = useFixedPopoverStyle(openMenu === 'date', dateBtnRef, 208, 120);
  const assignPopoverStyle = useFixedPopoverStyle(openMenu === 'assign', assignBtnRef, 224, 160);

  const { data: authMe } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data?.data as
        | { id: string; name: string; profilePhotoUrl?: string | null }
        | undefined;
    },
    staleTime: 5 * 60 * 1000,
  });

  const resolvedCurrentUser = useMemo((): KanbanTaskAssigneeOption | null => {
    if (currentUser?.userId) return currentUser;
    if (!authMe?.id) return null;
    return {
      userId: authMe.id,
      name: authMe.name,
      profilePhotoUrl: authMe.profilePhotoUrl ?? null,
      avatarColor: '',
    };
  }, [currentUser, authMe]);

  const assignableMembers = useMemo(() => {
    if (!resolvedCurrentUser?.userId) return cardMembers;
    if (cardMembers.some((m) => m.userId === resolvedCurrentUser.userId)) return cardMembers;
    return [resolvedCurrentUser, ...cardMembers];
  }, [cardMembers, resolvedCurrentUser]);

  useEffect(() => {
    setDraftDate(splitDateTime(item.dueDate).date);
  }, [item.dueDate]);

  useEffect(() => {
    if (!editingTitle) setDraftTitle(item.title);
  }, [item.title, editingTitle]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    if (!openMenu) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (rowRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpenMenu(null);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openMenu]);

  async function patch(partial: {
    assigneeUserId?: string | null;
    dueDate?: string | null;
  }) {
    if (onLocalPatch) {
      const assignee =
        partial.assigneeUserId === undefined
          ? undefined
          : partial.assigneeUserId
            ? (() => {
                const m = assignableMembers.find((x) => x.userId === partial.assigneeUserId);
                return m
                  ? {
                      id: m.userId,
                      name: m.name,
                      profilePhotoUrl: m.profilePhotoUrl,
                      avatarColor: m.avatarColor,
                    }
                  : null;
              })()
            : null;
      onLocalPatch({
        ...partial,
        ...(partial.assigneeUserId !== undefined ? { assignee: assignee ?? null } : {}),
      });
      setOpenMenu(null);
      return;
    }
    setSaving(true);
    try {
      const { card: updated } = await updateChecklistItem(item.id, partial);
      await onUpdated(updated);
      setOpenMenu(null);
    } catch {
      toast.error('Erro ao atualizar tarefa');
    } finally {
      setSaving(false);
    }
  }

  async function saveDate() {
    await patch({ dueDate: draftDate || null });
  }

  async function saveTitle() {
    const trimmed = draftTitle.trim();
    if (!trimmed) {
      setDraftTitle(item.title);
      setEditingTitle(false);
      return;
    }
    if (trimmed === item.title) {
      setEditingTitle(false);
      return;
    }
    if (onLocalPatch) {
      onLocalPatch({ title: trimmed });
      setEditingTitle(false);
      return;
    }
    setSaving(true);
    try {
      const { card: updated } = await updateChecklistItem(item.id, { title: trimmed });
      await onUpdated(updated);
      setEditingTitle(false);
    } catch {
      toast.error('Erro ao atualizar tarefa');
      setDraftTitle(item.title);
    } finally {
      setSaving(false);
    }
  }

  function cancelTitleEdit() {
    setDraftTitle(item.title);
    setEditingTitle(false);
  }

  const overdue = item.dueDate && !item.isDone && isOverdue(item.dueDate);
  const titleClass = clsx(
    'flex-1 min-w-0 text-sm text-gray-800 dark:text-gray-200 leading-5 break-words',
    item.isDone && 'line-through text-gray-400 dark:text-gray-500',
  );
  const titleInputClass = clsx(
    titleClass,
    'h-5 bg-transparent border-0 p-0 shadow-none outline-none ring-0',
    'focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0',
  );
  const showActions = openMenu !== null;
  const hasMeta = !!(item.dueDate || item.assignee);

  return (
    <li
      ref={rowRef}
      className="group relative flex items-center gap-2 min-h-[2.25rem] rounded-lg px-2 py-1.5 hover:bg-white dark:hover:bg-gray-800"
    >
      <CheckboxIndicator
        checked={item.isDone}
        onChange={onToggle}
        asButton
        disabled={isDeleting || saving}
        className="shrink-0"
      />

      {editingTitle ? (
        <input
          ref={titleInputRef}
          type="text"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={() => void saveTitle()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void saveTitle();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              cancelTitleEdit();
            }
          }}
          className={titleInputClass}
          aria-label="Editar tarefa"
        />
      ) : (
        <span
          role="button"
          tabIndex={0}
          title={item.title}
          onClick={() => setEditingTitle(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setEditingTitle(true);
            }
          }}
          className={clsx(titleClass, 'cursor-text')}
        >
          {item.title}
        </span>
      )}

      <div
        className={clsx(
          'relative shrink-0 flex items-center justify-end min-h-7',
          hasMeta ? 'min-w-[5.5rem]' : 'min-w-[4.5rem]',
        )}
      >
        {/* Data e responsável — visíveis fora do hover */}
        <div
          className={clsx(
            'flex items-center justify-end gap-2 transition-opacity duration-150',
            showActions ? 'opacity-0 pointer-events-none' : 'opacity-100 group-hover:opacity-0 group-hover:pointer-events-none',
          )}
        >
          {item.dueDate && (
            <span
              className={clsx(
                'inline-flex items-center gap-1 text-xs whitespace-nowrap',
                overdue
                  ? 'text-red-600 dark:text-red-400 font-medium'
                  : 'text-gray-500 dark:text-gray-400',
              )}
              title="Data de entrega"
            >
              <Clock className="w-3 h-3 shrink-0" />
              {formatTaskDueDate(item.dueDate)}
            </span>
          )}
          {item.assignee && (
            <span title={item.assignee.name} className="inline-flex shrink-0">
              <KanbanUserAvatar
                name={item.assignee.name}
                profilePhotoUrl={item.assignee.profilePhotoUrl}
                colorClass={item.assignee.avatarColor}
                size="sm"
                className="!w-6 !h-6 !text-[10px]"
              />
            </span>
          )}
        </div>

        {/* Ações — visíveis no hover ou com popover aberto */}
        <div
          className={clsx(
            'absolute right-0 inset-y-0 flex items-center gap-0.5 transition-opacity duration-150',
            showActions ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto',
          )}
        >
          <button
            ref={dateBtnRef}
            type="button"
            onClick={() => setOpenMenu((m) => (m === 'date' ? null : 'date'))}
            className={clsx(
              'p-1.5 rounded-md transition-colors',
              item.dueDate
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
            )}
            title="Data de conclusão"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>

          <button
            ref={assignBtnRef}
            type="button"
            onClick={() => setOpenMenu((m) => (m === 'assign' ? null : 'assign'))}
            className={clsx(
              'p-1.5 rounded-md transition-colors',
              item.assignee
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
            )}
            title="Atribuir membro"
          >
            <UserPlus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={isDeleting || saving}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Excluir tarefa"
          >
            {isDeleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {saving && (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600 shrink-0 pointer-events-none" />
      )}

      {typeof document !== 'undefined' &&
        openMenu === 'date' &&
        createPortal(
          <div
            ref={popoverRef}
            style={datePopoverStyle}
            className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg p-3"
          >
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
              Data de conclusão
            </p>
            <DatePickerField
              value={draftDate}
              onChange={setDraftDate}
              placeholder="dd/mm/aaaa"
              noFocusRing
              aria-label="Data de conclusão"
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                disabled={saving}
                onClick={saveDate}
                className="flex-1 text-xs font-medium py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Salvar
              </button>
              {item.dueDate && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => patch({ dueDate: null })}
                  className="px-2 text-xs text-gray-500 hover:text-red-600"
                  title="Remover data"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}

      {typeof document !== 'undefined' &&
        openMenu === 'assign' &&
        createPortal(
          <div
            ref={popoverRef}
            style={assignPopoverStyle}
            className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg py-1 max-h-48 overflow-y-auto"
          >
            {assignableMembers.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 px-3 py-3 text-center">
                Nenhum usuário disponível para atribuição.
              </p>
            ) : (
              <>
                {assignableMembers.map((m) => {
                  const isSelf =
                    resolvedCurrentUser?.userId === m.userId &&
                    !cardMembers.some((cm) => cm.userId === m.userId);
                  return (
                    <button
                      key={m.userId}
                      type="button"
                      disabled={saving}
                      onClick={() => patch({ assigneeUserId: m.userId })}
                      className={clsx(
                        'w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700/60',
                        item.assigneeUserId === m.userId &&
                          'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300',
                      )}
                    >
                      <KanbanUserAvatar
                        name={m.name}
                        profilePhotoUrl={m.profilePhotoUrl}
                        colorKey={m.userId}
                        colorClass={m.avatarColor}
                        size="sm"
                      />
                      <span className="truncate">
                        {isSelf ? 'Atribuir a mim' : m.name}
                      </span>
                    </button>
                  );
                })}
                {item.assignee && (
                  <div className="border-t border-gray-200 dark:border-gray-600 mt-1">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => patch({ assigneeUserId: null })}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors disabled:opacity-50 rounded-b-lg"
                    >
                      <UserMinus className="w-4 h-4 shrink-0" />
                      Remover responsável
                    </button>
                  </div>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
    </li>
  );
}

export const KanbanChecklistTaskRow = React.memo(KanbanChecklistTaskRowInner);
