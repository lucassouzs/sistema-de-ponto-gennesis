'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, SquareKanban } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import {
  createKanbanCard,
  fetchKanbanBoard,
  fetchKanbanBoards,
  type Priority,
} from '@/lib/kanban';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

const PRIORITY_SELECT_OPTIONS = labeledToSelectOptions([
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
]);

export type ChatMessageForTask = {
  id: string;
  content: string;
  createdAt: string;
  sender?: { name?: string | null } | null;
  attachments?: Array<{ fileName?: string | null }>;
};

function messageToTaskTitle(content: string): string {
  const t = content.replace(/\s+/g, ' ').trim();
  if (!t || t === '📎') return 'Tarefa do chat';
  const line = t.split('\n')[0] ?? t;
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

function buildTaskDescription(
  message: ChatMessageForTask,
  chatTitle: string,
  chatId: string,
): string {
  const sender = message.sender?.name?.trim() || 'Participante';
  const date = new Date(message.createdAt).toLocaleString('pt-BR');
  let body = '';
  if (message.content && message.content !== '📎') {
    body = message.content.trim();
  } else if (message.attachments?.length) {
    const names = message.attachments
      .map((a) => a.fileName?.trim())
      .filter(Boolean)
      .join(', ');
    body = names ? `Anexo(s): ${names}` : '(mensagem com anexo)';
  } else {
    body = '(sem texto)';
  }

  const origin =
    typeof window !== 'undefined'
      ? `${window.location.origin}/ponto/conversas`
      : '/ponto/conversas';

  return [
    'Criado a partir do chat.',
    '',
    `Conversa: ${chatTitle}`,
    `Autor da mensagem: ${sender}`,
    `Data: ${date}`,
    '',
    '— Mensagem —',
    body,
    '',
    `Referência: ${origin} (conversa ${chatId.slice(0, 8)}…)`,
  ].join('\n');
}

export interface CreateTaskFromChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: ChatMessageForTask | null;
  chatId: string | null;
  chatTitle: string;
  defaultDepartmentKey?: string | null;
  canPickBoard?: boolean;
  onCreated?: (cardId: string, departmentKey: string) => void;
}

export function CreateTaskFromChatModal({
  isOpen,
  onClose,
  message,
  chatId,
  chatTitle,
  defaultDepartmentKey,
  canPickBoard = false,
  onCreated,
}: CreateTaskFromChatModalProps) {
  const [departmentKey, setDepartmentKey] = useState<string | undefined>(undefined);
  const [columnId, setColumnId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');

  const effectiveDeptKey = departmentKey ?? defaultDepartmentKey ?? undefined;

  const { data: boards } = useQuery({
    queryKey: ['kanban-boards-picker'],
    queryFn: fetchKanbanBoards,
    enabled: isOpen && canPickBoard,
  });

  const {
    data: board,
    isLoading: boardLoading,
    error: boardError,
  } = useQuery({
    queryKey: ['kanban-board-from-chat', effectiveDeptKey],
    queryFn: () => fetchKanbanBoard(effectiveDeptKey),
    enabled: isOpen && !!effectiveDeptKey,
  });

  useEffect(() => {
    if (!isOpen || !message) return;
    setTitle(messageToTaskTitle(message.content));
    setDescription(buildTaskDescription(message, chatTitle, chatId ?? ''));
    setPriority('medium');
    setDepartmentKey(defaultDepartmentKey ?? undefined);
  }, [isOpen, message, chatTitle, chatId, defaultDepartmentKey]);

  useEffect(() => {
    if (!board?.columns?.length) {
      setColumnId('');
      return;
    }
    const planned =
      board.columns.find((c) => c.title.toLowerCase() === 'planned') ?? board.columns[0];
    setColumnId(planned.id);
  }, [board?.id, board?.columns]);

  useEffect(() => {
    if (!isOpen || !canPickBoard || !boards?.length || departmentKey) return;
    const own = boards.find((b) => b.isOwnDepartment) ?? boards[0];
    setDepartmentKey(own.departmentKey);
  }, [isOpen, canPickBoard, boards, departmentKey]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!columnId || !title.trim()) {
        throw new Error('Preencha título e coluna');
      }
      if (board?.canWrite === false) {
        throw new Error('Você não tem permissão para criar cards neste quadro');
      }
      return createKanbanCard({
        columnId,
        title: title.trim(),
        description: description.trim(),
        priority,
      });
    },
    onSuccess: (card) => {
      const dept = board?.departmentKey ?? effectiveDeptKey ?? '';
      toast.success(
        (t) => (
          <span>
            Card criado no Tasks.{' '}
            {dept ? (
              <a
                href={`/ponto/kanban?departmentKey=${encodeURIComponent(dept)}`}
                className="font-semibold underline"
                onClick={() => toast.dismiss(t.id)}
              >
                Abrir quadro
              </a>
            ) : null}
          </span>
        ),
        { duration: 6000 },
      );
      onCreated?.(card.id, dept);
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Não foi possível criar o card');
    },
  });

  const boardBlocked = board?.canWrite === false;

  const boardSelectOptions = useMemo(
    () =>
      labeledToSelectOptions(
        (boards ?? []).map((b) => ({
          value: b.departmentKey,
          label: `${b.department}${b.isOwnDepartment ? ' (seu setor)' : ''}`,
        }))
      ),
    [boards]
  );

  const columnSelectOptions = useMemo(
    () =>
      labeledToSelectOptions(
        (board?.columns ?? []).map((col) => ({ value: col.id, label: col.title }))
      ),
    [board?.columns]
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <SquareKanban className="h-5 w-5 text-red-600 dark:text-red-500" />
          Criar card no Tasks
        </span>
      }
      size="md"
      confirmBeforeClose
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Transforme esta mensagem em uma tarefa no quadro do seu setor. O texto original fica na
          descrição do card.
        </p>

        {canPickBoard && boards && boards.length > 1 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Quadro (setor)
            </label>
            <StringSingleSelectDropdown
              value={effectiveDeptKey ?? ''}
              onChange={(v) => setDepartmentKey(v || undefined)}
              options={boardSelectOptions}
              allowEmpty={false}
            />
          </div>
        )}

        {boardLoading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando quadro…
          </div>
        )}

        {boardError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
            Não foi possível carregar o quadro de Tasks. Verifique seu setor no cadastro.
          </p>
        )}

        {board && !boardLoading && (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Quadro: <span className="font-medium text-gray-700 dark:text-gray-300">{board.department}</span>
            </p>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Coluna
              </label>
              <StringSingleSelectDropdown
                value={columnId}
                onChange={setColumnId}
                options={columnSelectOptions}
                disabled={boardBlocked}
                allowEmpty={false}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Título do card
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                disabled={boardBlocked}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Prioridade
              </label>
              <StringSingleSelectDropdown
                value={priority}
                onChange={(v) => setPriority(v as Priority)}
                options={PRIORITY_SELECT_OPTIONS}
                disabled={boardBlocked}
                allowEmpty={false}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Descrição
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                disabled={boardBlocked}
                className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>

            {boardBlocked && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Você pode visualizar este quadro, mas não criar cards nele.
              </p>
            )}
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={
              !board ||
              boardLoading ||
              boardBlocked ||
              !columnId ||
              !title.trim() ||
              createMutation.isPending
            }
            onClick={() => createMutation.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SquareKanban className="h-4 w-4" />
            )}
            Criar card
          </button>
        </div>
      </div>
    </Modal>
  );
}
