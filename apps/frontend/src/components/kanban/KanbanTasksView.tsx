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
  Pencil,
  ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  createPlannerTask,
  createPlannerTaskList,
  deletePlannerTask,
  deletePlannerTaskList,
  fetchPlannerTaskLists,
  updatePlannerTask,
  updatePlannerTaskList,
  type PlannerTask,
  type PlannerTaskList,
} from '@/lib/plannerTasks';
import { useRightClickPanScroll } from '@/hooks/useRightClickPanScroll';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import {
  AgendaModeSwitcher,
  type AgendaSurfaceMode,
} from './AgendaModeSwitcher';

function TaskRow({
  task,
  onToggle,
  onStar,
  onDelete,
  onChangeTitle,
  busy,
}: {
  task: PlannerTask;
  onToggle: () => void;
  onStar: () => void;
  onDelete: () => void;
  onChangeTitle: (title: string) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  return (
    <div className="group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-white dark:hover:bg-gray-700/40">
      <button
        type="button"
        disabled={busy}
        onClick={onToggle}
        className="shrink-0 text-gray-300 transition-colors hover:text-red-600 disabled:opacity-50 dark:text-gray-600"
        aria-label={task.completed ? 'Reabrir tarefa' : 'Concluir tarefa'}
      >
        {task.completed ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
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
            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:border-red-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
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
            className={`w-full text-left text-sm leading-snug ${
              task.completed
                ? 'text-gray-400 line-through dark:text-gray-500'
                : 'font-medium text-gray-800 dark:text-gray-100'
            }`}
          >
            {task.title}
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          disabled={busy}
          onClick={onStar}
          className={`rounded-lg p-1.5 transition-opacity ${
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
          className="rounded-lg p-1.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600 dark:text-gray-600"
          aria-label="Excluir tarefa"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
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
  onChangeTitle,
}: {
  list: PlannerTaskList;
  filter: 'all' | 'starred';
  canDelete: boolean;
  busy: boolean;
  onRename: (title: string) => void;
  onDeleteList: () => void;
  onCreateTask: (title: string) => void;
  onToggle: (task: PlannerTask) => void;
  onStar: (task: PlannerTask) => void;
  onDeleteTask: (task: PlannerTask) => void;
  onChangeTitle: (task: PlannerTask, title: string) => void;
}) {
  const [draftTitle, setDraftTitle] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(list.title);
  const [completedOpen, setCompletedOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const openCount = openTasks.length;

  const submitTask = () => {
    const title = draftTitle.trim();
    if (!title) return;
    onCreateTask(title);
    setDraftTitle('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="flex h-full w-[min(100%,22rem)] shrink-0 flex-col overflow-hidden rounded-2xl border border-gray-200/70 bg-[#F8F9FB] shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:shadow-none sm:w-[22rem]">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3.5">
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
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        ) : (
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              {list.title}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {openCount === 0
                ? 'Nenhuma pendente'
                : openCount === 1
                  ? '1 pendente'
                  : `${openCount} pendentes`}
            </p>
          </div>
        )}

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
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
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
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
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir lista
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
        {openTasks.length === 0 ? (
          <div className="mx-1.5 mb-2 rounded-xl border border-dashed border-gray-200/90 bg-white/60 px-4 py-8 text-center dark:border-gray-600 dark:bg-gray-900/50">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-200">
              {filter === 'starred'
                ? 'Nenhuma com estrela'
                : list.tasks.length === 0
                  ? 'Lista vazia'
                  : 'Tudo concluído'}
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-400">
              {filter === 'starred'
                ? 'Marque tarefas com estrela para vê-las aqui.'
                : list.tasks.length === 0
                  ? 'Adicione a primeira tarefa abaixo.'
                  : 'Bom trabalho!'}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {openTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                busy={busy}
                onToggle={() => onToggle(task)}
                onStar={() => onStar(task)}
                onDelete={() => onDeleteTask(task)}
                onChangeTitle={(title) => onChangeTitle(task, title)}
              />
            ))}
          </div>
        )}

        {completedTasks.length > 0 && filter === 'all' && (
          <div className="mt-2 px-1">
            <button
              type="button"
              onClick={() => setCompletedOpen((v) => !v)}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left text-xs font-medium text-gray-500 transition-colors hover:bg-white hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-200"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${completedOpen ? '' : '-rotate-90'}`}
              />
              Concluídas ({completedTasks.length})
            </button>
            {completedOpen && (
              <div className="mt-0.5 max-h-44 space-y-0.5 overflow-y-auto">
                {completedTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    busy={busy}
                    onToggle={() => onToggle(task)}
                    onStar={() => onStar(task)}
                    onDelete={() => onDeleteTask(task)}
                    onChangeTitle={(title) => onChangeTitle(task, title)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200/70 px-3 py-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitTask();
              }
            }}
            placeholder="Adicionar tarefa..."
            disabled={busy}
            className="h-9 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-red-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-red-700"
          />
          <button
            type="button"
            onClick={submitTask}
            disabled={busy || !draftTitle.trim()}
            title="Adicionar tarefa"
            aria-label="Adicionar tarefa"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function KanbanTasksView({
  mode = 'tasks',
  onModeChange,
}: {
  mode?: AgendaSurfaceMode;
  onModeChange?: (next: AgendaSurfaceMode) => void;
} = {}) {
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
    mutationFn: ({ listId, title }: { listId: string; title: string }) =>
      createPlannerTask({ listId, title }),
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
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          aria-label="Filtrar tarefas"
          options={[
            { value: 'all', label: 'Todas' },
            {
              value: 'starred',
              label: (
                <>
                  <Star className="h-3.5 w-3.5" />
                  Com estrela
                </>
              ),
            },
          ]}
        />
        {onModeChange && (
          <AgendaModeSwitcher mode={mode} onChange={onModeChange} />
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Carregando listas…</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl bg-[#F3F4F6] dark:bg-gray-950/60">
          <div
            ref={listsScrollRef}
            className="app-thin-scroll flex h-full min-h-0 items-stretch gap-4 overflow-x-auto px-4 py-4"
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
                onCreateTask={(title) =>
                  createTaskMut.mutate({ listId: list.id, title })
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
                onChangeTitle={(task, title) =>
                  updateTaskMut.mutate({ id: task.id, data: { title } })
                }
              />
            ))}

            <div className="flex w-[16rem] shrink-0 items-start pt-0.5">
              {creatingList ? (
                <div className="w-full rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:shadow-none">
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
                    className="mb-3 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy || !newListTitle.trim()}
                      onClick={() => createListMut.mutate(newListTitle.trim())}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Criar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingList(false);
                        setNewListTitle('');
                      }}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreatingList(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-white/50 px-4 py-5 text-sm font-medium text-gray-500 transition-colors hover:border-gray-400 hover:bg-white hover:text-gray-700 dark:border-gray-600 dark:bg-gray-800/50 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                  <Plus className="h-4 w-4" />
                  Nova lista
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
