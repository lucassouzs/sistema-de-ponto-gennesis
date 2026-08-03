'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Circle,
  MoreVertical,
  Plus,
  Star,
  Trash2,
  Calendar,
  Pencil,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  combineDateAndTime,
  createPlannerTask,
  createPlannerTaskList,
  deletePlannerTask,
  deletePlannerTaskList,
  fetchPlannerTaskLists,
  toDateInputValue,
  toTimeInputValue,
  updatePlannerTask,
  updatePlannerTaskList,
  type PlannerTask,
  type PlannerTaskList,
} from '@/lib/plannerTasks';
import { useRightClickPanScroll } from '@/hooks/useRightClickPanScroll';

function TaskRow({
  task,
  onToggle,
  onStar,
  onDelete,
  onChangeDue,
  onChangeTitle,
  busy,
}: {
  task: PlannerTask;
  onToggle: () => void;
  onStar: () => void;
  onDelete: () => void;
  onChangeDue: (dueDate: string | null) => void;
  onChangeTitle: (title: string) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const dateVal = toDateInputValue(task.dueDate);
  const timeVal = toTimeInputValue(task.dueDate) || '09:00';

  return (
    <div className="group flex items-start gap-2.5 rounded-lg px-1.5 py-2 transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
      <button
        type="button"
        disabled={busy}
        onClick={onToggle}
        className="mt-0.5 shrink-0 text-gray-300 transition-colors hover:text-red-600 disabled:opacity-50 dark:text-gray-600"
        aria-label={task.completed ? 'Reabrir tarefa' : 'Concluir tarefa'}
      >
        {task.completed ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        {editing && !task.completed ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              setEditing(false);
              const next = draft.trim();
              if (next && next !== task.title) onChangeTitle(next);
              else setDraft(task.title);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setDraft(task.title);
                setEditing(false);
              }
            }}
            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-normal text-gray-900 outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!task.completed) {
                setDraft(task.title);
                setEditing(true);
              }
            }}
            className={`w-full text-left text-sm font-normal ${
              task.completed
                ? 'text-gray-400 line-through dark:text-gray-500'
                : 'text-gray-800 dark:text-gray-100'
            }`}
          >
            {task.title}
          </button>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <label className="inline-flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
            <Calendar className="h-3 w-3" />
            <input
              type="date"
              disabled={busy || task.completed}
              value={dateVal}
              onChange={(e) => {
                const nextDate = e.target.value;
                if (!nextDate) {
                  onChangeDue(null);
                  return;
                }
                onChangeDue(combineDateAndTime(nextDate, timeVal || '09:00'));
              }}
              className="rounded border border-gray-200/80 bg-transparent px-1 py-0.5 text-[11px] font-normal outline-none disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
            />
          </label>
          {dateVal ? (
            <input
              type="time"
              disabled={busy || task.completed}
              value={timeVal}
              onChange={(e) => {
                onChangeDue(combineDateAndTime(dateVal, e.target.value || '09:00'));
              }}
              className="rounded border border-gray-200/80 bg-transparent px-1 py-0.5 text-[11px] font-normal outline-none disabled:opacity-50 dark:border-gray-700 dark:text-gray-300"
            />
          ) : null}
        </div>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={onStar}
        className={`mt-0.5 shrink-0 rounded-md p-1 transition-opacity ${
          task.starred
            ? 'text-amber-500'
            : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-amber-500 dark:text-gray-600'
        }`}
        aria-label={task.starred ? 'Remover estrela' : 'Marcar com estrela'}
      >
        <Star className={`h-3.5 w-3.5 ${task.starred ? 'fill-current' : ''}`} />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="mt-0.5 shrink-0 rounded-md p-1 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600 dark:text-gray-600"
        aria-label="Excluir tarefa"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ListBlock({
  list,
  filter,
  canDelete,
  busy,
  onRename,
  onDeleteList,
  onCreateTask,
  onToggle,
  onStar,
  onDeleteTask,
  onChangeDue,
  onChangeTitle,
}: {
  list: PlannerTaskList;
  filter: 'all' | 'starred';
  canDelete: boolean;
  busy: boolean;
  onRename: (title: string) => void;
  onDeleteList: () => void;
  onCreateTask: (title: string, dueDate: string | null) => void;
  onToggle: (task: PlannerTask) => void;
  onStar: (task: PlannerTask) => void;
  onDeleteTask: (task: PlannerTask) => void;
  onChangeDue: (task: PlannerTask, dueDate: string | null) => void;
  onChangeTitle: (task: PlannerTask, title: string) => void;
}) {
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDue, setDraftDue] = useState('');
  const [draftTime, setDraftTime] = useState('09:00');
  const [adding, setAdding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(list.title);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const openTasks = useMemo(() => {
    let items = list.tasks.filter((t) => !t.completed);
    if (filter === 'starred') items = items.filter((t) => t.starred);
    return items;
  }, [list.tasks, filter]);

  const completedTasks = useMemo(
    () => list.tasks.filter((t) => t.completed),
    [list.tasks]
  );

  const submitTask = () => {
    const title = draftTitle.trim();
    if (!title) {
      toast.error('Digite o título da tarefa');
      return;
    }
    onCreateTask(title, combineDateAndTime(draftDue || null, draftTime));
    setDraftTitle('');
    setDraftDue('');
    setDraftTime('09:00');
    setAdding(false);
  };

  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border border-gray-200/80 bg-white dark:border-gray-700/80 dark:bg-gray-900 sm:w-[320px]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-3.5 py-2.5 dark:border-gray-800">
        {renaming ? (
          <input
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onBlur={() => {
              setRenaming(false);
              const next = renameDraft.trim();
              if (next && next !== list.title) onRename(next);
              else setRenameDraft(list.title);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setRenameDraft(list.title);
                setRenaming(false);
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm font-medium text-gray-900 outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        ) : (
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {list.title}
          </h3>
        )}

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="Opções da lista"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setRenameDraft(list.title);
                  setRenaming(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-normal text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Pencil className="h-3.5 w-3.5" />
                Renomear
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDeleteList();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-normal text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir lista
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-b border-gray-100 px-3 py-2 dark:border-gray-800">
        {adding ? (
          <div className="space-y-2">
            <input
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitTask();
                if (e.key === 'Escape') {
                  setAdding(false);
                  setDraftTitle('');
                }
              }}
              placeholder="Título da tarefa"
              className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-normal outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                value={draftDue}
                onChange={(e) => {
                  setDraftDue(e.target.value);
                  if (e.target.value && !draftTime) setDraftTime('09:00');
                }}
                className="rounded border border-gray-200 bg-white px-1.5 py-1 text-[11px] dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              />
              {draftDue ? (
                <input
                  type="time"
                  value={draftTime}
                  onChange={(e) => setDraftTime(e.target.value || '09:00')}
                  className="rounded border border-gray-200 bg-white px-1.5 py-1 text-[11px] dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                />
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !draftTitle.trim()}
                onClick={submitTask}
                className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Adicionar
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setDraftTitle('');
                }}
                className="rounded-lg px-2.5 py-1 text-xs font-normal text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-normal text-gray-500 transition-colors hover:bg-gray-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-800/60 dark:hover:text-red-400"
          >
            <Plus className="h-4 w-4" />
            Adicionar uma tarefa
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-1">
        {openTasks.length === 0 ? (
          <div className="px-2 py-12 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
            <p className="mt-3 text-sm font-normal text-gray-600 dark:text-gray-300">
              {filter === 'starred'
                ? 'Nenhuma tarefa com estrela'
                : list.tasks.length === 0
                  ? 'Não há tarefas'
                  : 'Todas as tarefas concluídas'}
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {list.tasks.length === 0 ? 'Adicione uma tarefa acima.' : 'Bom trabalho!'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800/80">
            {openTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                busy={busy}
                onToggle={() => onToggle(task)}
                onStar={() => onStar(task)}
                onDelete={() => onDeleteTask(task)}
                onChangeDue={(dueDate) => onChangeDue(task, dueDate)}
                onChangeTitle={(title) => onChangeTitle(task, title)}
              />
            ))}
          </div>
        )}
      </div>

      {completedTasks.length > 0 && filter === 'all' && (
        <details className="shrink-0 border-t border-gray-100 dark:border-gray-800">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-normal text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/50">
            Concluídas ({completedTasks.length})
          </summary>
          <div className="max-h-40 divide-y divide-gray-50 overflow-y-auto px-2.5 pb-2 dark:divide-gray-800/80">
            {completedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                busy={busy}
                onToggle={() => onToggle(task)}
                onStar={() => onStar(task)}
                onDelete={() => onDeleteTask(task)}
                onChangeDue={(dueDate) => onChangeDue(task, dueDate)}
                onChangeTitle={(title) => onChangeTitle(task, title)}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function KanbanTasksView() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'starred'>('all');
  const [creatingList, setCreatingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const listsScrollRef = useRightClickPanScroll<HTMLDivElement>();

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['planner-task-lists'],
    queryFn: fetchPlannerTaskLists,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
    queryClient.invalidateQueries({ queryKey: ['planner-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['planner-events'] });
  };

  const createListMut = useMutation({
    mutationFn: (title: string) => createPlannerTaskList({ title }),
    onSuccess: () => {
      setCreatingList(false);
      setNewListTitle('');
      invalidate();
      toast.success('Lista criada');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao criar lista');
    },
  });

  const updateListMut = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      updatePlannerTaskList(id, { title }),
    onSuccess: () => invalidate(),
    onError: () => toast.error('Erro ao renomear lista'),
  });

  const deleteListMut = useMutation({
    mutationFn: (id: string) => deletePlannerTaskList(id),
    onSuccess: () => {
      invalidate();
      toast.success('Lista excluída');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao excluir lista');
    },
  });

  const createTaskMut = useMutation({
    mutationFn: ({
      listId,
      title,
      dueDate,
    }: {
      listId: string;
      title: string;
      dueDate: string | null;
    }) => createPlannerTask({ listId, title, dueDate }),
    onSuccess: () => {
      invalidate();
      toast.success('Tarefa adicionada');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao criar tarefa');
    },
  });

  const updateTaskMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updatePlannerTask>[1] }) =>
      updatePlannerTask(id, data),
    onSuccess: () => invalidate(),
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao atualizar tarefa');
    },
  });

  const deleteTaskMut = useMutation({
    mutationFn: (id: string) => deletePlannerTask(id),
    onSuccess: () => {
      invalidate();
      toast.success('Tarefa excluída');
    },
    onError: () => toast.error('Erro ao excluir tarefa'),
  });

  const busy =
    createListMut.isPending ||
    updateListMut.isPending ||
    deleteListMut.isPending ||
    createTaskMut.isPending ||
    updateTaskMut.isPending ||
    deleteTaskMut.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 pb-3">
      <div
        className="inline-flex w-fit shrink-0 items-center rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
        role="group"
        aria-label="Filtrar tarefas"
      >
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            filter === 'all'
              ? 'bg-white font-medium text-red-600 shadow-sm dark:bg-gray-600 dark:text-red-400'
              : 'font-normal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          Todas
        </button>
        <button
          type="button"
          onClick={() => setFilter('starred')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
            filter === 'starred'
              ? 'bg-white font-medium text-red-600 shadow-sm dark:bg-gray-600 dark:text-red-400'
              : 'font-normal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Star className="h-3.5 w-3.5" />
          Com estrela
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Carregando listas…</p>
      ) : (
        <div
          ref={listsScrollRef}
          className="flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto pb-1"
        >
          {lists.map((list) => (
            <ListBlock
              key={list.id}
              list={list}
              filter={filter}
              canDelete={lists.length > 1}
              busy={busy}
              onRename={(title) => updateListMut.mutate({ id: list.id, title })}
              onDeleteList={() => {
                if (confirm(`Excluir a lista "${list.title}" e todas as tarefas dela?`)) {
                  deleteListMut.mutate(list.id);
                }
              }}
              onCreateTask={(title, dueDate) =>
                createTaskMut.mutate({ listId: list.id, title, dueDate })
              }
              onToggle={(task) =>
                updateTaskMut.mutate({
                  id: task.id,
                  data: { completed: !task.completed },
                })
              }
              onStar={(task) =>
                updateTaskMut.mutate({
                  id: task.id,
                  data: { starred: !task.starred },
                })
              }
              onDeleteTask={(task) => {
                if (confirm('Excluir esta tarefa?')) deleteTaskMut.mutate(task.id);
              }}
              onChangeDue={(task, dueDate) =>
                updateTaskMut.mutate({ id: task.id, data: { dueDate } })
              }
              onChangeTitle={(task, title) =>
                updateTaskMut.mutate({ id: task.id, data: { title } })
              }
            />
          ))}

          <div className="flex w-[280px] shrink-0 flex-col">
            {creatingList ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4 dark:border-gray-600 dark:bg-gray-900">
                <input
                  autoFocus
                  value={newListTitle}
                  onChange={(e) => setNewListTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newListTitle.trim()) {
                      createListMut.mutate(newListTitle.trim());
                    }
                    if (e.key === 'Escape') {
                      setCreatingList(false);
                      setNewListTitle('');
                    }
                  }}
                  placeholder="Nome da lista"
                  className="mb-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy || !newListTitle.trim()}
                    onClick={() => createListMut.mutate(newListTitle.trim())}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Criar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingList(false);
                      setNewListTitle('');
                    }}
                    className="rounded-lg px-3 py-1.5 text-sm font-normal text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreatingList(true)}
                className="flex h-full min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 text-sm font-normal text-gray-400 transition-colors hover:border-gray-400 hover:bg-gray-50/80 hover:text-gray-600 dark:border-gray-600 dark:hover:bg-gray-900/60 dark:hover:text-gray-300"
              >
                <Plus className="h-5 w-5" />
                Criar nova lista
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
