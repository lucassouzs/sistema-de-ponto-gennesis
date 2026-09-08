'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Hash, Loader2, Pencil, Pin, PinOff, Plus, Search, Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

export type ChatTopicItem = {
  id: string;
  chatId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  isPinned: boolean;
  sortOrder: number;
  messageCount: number;
  createdBy: {
    id: string;
    name: string;
  };
};

export type ChatTopicsResponse = {
  topics: ChatTopicItem[];
  canDeleteTopics: boolean;
};

export async function fetchChatTopics(chatId: string): Promise<ChatTopicsResponse> {
  const res = await api.get(`/chats/direct/${chatId}/topics`);
  return {
    topics: res.data?.data ?? [],
    canDeleteTopics: Boolean(res.data?.canDeleteTopics)
  };
}

async function createChatTopicApi(
  chatId: string,
  payload: { title: string; initialMessage?: string }
): Promise<ChatTopicItem> {
  const res = await api.post(`/chats/direct/${chatId}/topics`, payload);
  return res.data.data;
}

async function setChatTopicPinnedApi(
  chatId: string,
  topicId: string,
  isPinned: boolean
): Promise<ChatTopicItem> {
  const res = await api.patch(`/chats/direct/${chatId}/topics/${topicId}/pin`, { isPinned });
  return res.data.data;
}

async function reorderChatTopicsApi(
  chatId: string,
  payload: { pinnedIds?: string[]; unpinnedIds?: string[] }
): Promise<ChatTopicItem[]> {
  const res = await api.patch(`/chats/direct/${chatId}/topics/reorder`, payload);
  return res.data?.data ?? [];
}

async function renameChatTopicApi(
  chatId: string,
  topicId: string,
  title: string
): Promise<ChatTopicItem> {
  const res = await api.patch(`/chats/direct/${chatId}/topics/${topicId}`, { title });
  return res.data.data;
}

async function deleteChatTopicApi(chatId: string, topicId: string): Promise<void> {
  await api.delete(`/chats/direct/${chatId}/topics/${topicId}`);
}

function formatTopicDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function reorderList(list: ChatTopicItem[], fromId: string, toId: string): ChatTopicItem[] {
  const fromIdx = list.findIndex((t) => t.id === fromId);
  const toIdx = list.findIndex((t) => t.id === toId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return list;
  const next = [...list];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
}

type ChatTopicsSidebarProps = {
  chatId: string;
  selectedTopicId: string | null;
  onSelectTopic: (topicId: string | null) => void;
  className?: string;
};

export function ChatTopicsSidebar({
  chatId,
  selectedTopicId,
  onSelectTopic,
  className
}: ChatTopicsSidebarProps) {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [renameTopic, setRenameTopic] = useState<ChatTopicItem | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [deleteTopic, setDeleteTopic] = useState<ChatTopicItem | null>(null);
  const [topicSearch, setTopicSearch] = useState('');
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicMessage, setNewTopicMessage] = useState('');
  const [dragTopicId, setDragTopicId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const { data: topicsData, isLoading } = useQuery({
    queryKey: ['chatTopics', chatId],
    queryFn: () => fetchChatTopics(chatId),
    enabled: !!chatId,
    staleTime: 10_000,
  });

  const topics = topicsData?.topics ?? [];
  const canDeleteTopics = topicsData?.canDeleteTopics ?? false;

  useEffect(() => {
    setTopicSearch('');
    setDragTopicId(null);
    setDropTargetId(null);
    setRenameTopic(null);
    setDeleteTopic(null);
  }, [chatId]);

  const createMutation = useMutation({
    mutationFn: (payload: { title: string; initialMessage?: string }) =>
      createChatTopicApi(chatId, payload),
    onSuccess: (topic) => {
      queryClient.invalidateQueries({ queryKey: ['chatTopics', chatId] });
      queryClient.invalidateQueries({ queryKey: ['directChat', chatId] });
      onSelectTopic(topic.id);
      setShowCreateModal(false);
      setNewTopicTitle('');
      setNewTopicMessage('');
      toast.success('Tópico criado');
    },
    onError: (err: { response?: { data?: { error?: string; message?: string } } }) => {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Erro ao criar tópico');
    }
  });

  const pinMutation = useMutation({
    mutationFn: ({ topicId, isPinned }: { topicId: string; isPinned: boolean }) =>
      setChatTopicPinnedApi(chatId, topicId, isPinned),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatTopics', chatId] });
    },
    onError: (err: { response?: { data?: { error?: string; message?: string } } }) => {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Erro ao fixar tópico');
    }
  });

  const reorderMutation = useMutation({
    mutationFn: (payload: { pinnedIds?: string[]; unpinnedIds?: string[] }) =>
      reorderChatTopicsApi(chatId, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['chatTopics', chatId], (prev: ChatTopicsResponse | undefined) => ({
        topics: data,
        canDeleteTopics: prev?.canDeleteTopics ?? canDeleteTopics
      }));
      setDragTopicId(null);
      setDropTargetId(null);
    },
    onError: (err: { response?: { data?: { error?: string; message?: string } } }) => {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Erro ao reordenar');
      queryClient.invalidateQueries({ queryKey: ['chatTopics', chatId] });
    }
  });

  const renameMutation = useMutation({
    mutationFn: ({ topicId, title }: { topicId: string; title: string }) =>
      renameChatTopicApi(chatId, topicId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatTopics', chatId] });
      setRenameTopic(null);
      setRenameTitle('');
      toast.success('Tópico renomeado');
    },
    onError: (err: { response?: { data?: { error?: string; message?: string } } }) => {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Erro ao renomear tópico');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (topicId: string) => deleteChatTopicApi(chatId, topicId),
    onSuccess: (_, topicId) => {
      queryClient.invalidateQueries({ queryKey: ['chatTopics', chatId] });
      queryClient.invalidateQueries({ queryKey: ['directChat', chatId] });
      if (selectedTopicId === topicId) onSelectTopic(null);
      setDeleteTopic(null);
      toast.success('Tópico excluído');
    },
    onError: (err: { response?: { data?: { error?: string; message?: string } } }) => {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Erro ao excluir tópico');
    }
  });

  const topicSearchNorm = topicSearch.trim().toLowerCase();
  const isSearching = topicSearchNorm.length > 0;

  const filteredTopics = useMemo(() => {
    if (!topicSearchNorm) return topics;
    return topics.filter((topic) => {
      const title = topic.title.toLowerCase();
      const author = topic.createdBy.name.toLowerCase();
      return title.includes(topicSearchNorm) || author.includes(topicSearchNorm);
    });
  }, [topics, topicSearchNorm]);

  const pinnedTopics = useMemo(
    () => (isSearching ? filteredTopics.filter((t) => t.isPinned) : topics.filter((t) => t.isPinned)),
    [topics, filteredTopics, isSearching]
  );

  const unpinnedTopics = useMemo(
    () => (isSearching ? filteredTopics.filter((t) => !t.isPinned) : topics.filter((t) => !t.isPinned)),
    [topics, filteredTopics, isSearching]
  );

  const commitReorder = (section: 'pinned' | 'unpinned', nextList: ChatTopicItem[]) => {
    reorderMutation.mutate({
      pinnedIds: section === 'pinned' ? nextList.map((t) => t.id) : pinnedTopics.map((t) => t.id),
      unpinnedIds:
        section === 'unpinned' ? nextList.map((t) => t.id) : unpinnedTopics.map((t) => t.id)
    });
  };

  const handleDropOnTopic = (
    targetId: string,
    section: 'pinned' | 'unpinned',
    list: ChatTopicItem[]
  ) => {
    if (!dragTopicId || dragTopicId === targetId) return;
    const dragged = list.find((t) => t.id === dragTopicId);
    if (!dragged) return;
    if (section === 'pinned' && !dragged.isPinned) return;
    if (section === 'unpinned' && dragged.isPinned) return;
    commitReorder(section, reorderList(list, dragTopicId, targetId));
  };

  const renderTopicRow = (topic: ChatTopicItem, section: 'pinned' | 'unpinned') => {
    const active = selectedTopicId === topic.id;
    const isDragging = dragTopicId === topic.id;
    const isDropTarget = dropTargetId === topic.id && dragTopicId !== topic.id;

    return (
      <div
        key={topic.id}
        draggable={!isSearching && !reorderMutation.isPending}
        onDragStart={(e) => {
          setDragTopicId(topic.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => {
          setDragTopicId(null);
          setDropTargetId(null);
        }}
        onDragOver={(e) => {
          if (!dragTopicId || dragTopicId === topic.id) return;
          e.preventDefault();
          setDropTargetId(topic.id);
        }}
        onDragLeave={() => {
          if (dropTargetId === topic.id) setDropTargetId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleDropOnTopic(topic.id, section, section === 'pinned' ? pinnedTopics : unpinnedTopics);
        }}
        className={clsx(
          'group flex items-stretch gap-0.5 rounded-lg transition-colors',
          isDragging && 'opacity-50',
          isDropTarget && 'ring-2 ring-red-400/60 ring-inset'
        )}
      >
        <button
          type="button"
          className="flex w-5 shrink-0 cursor-grab items-center justify-center text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing dark:text-gray-600"
          aria-label="Arrastar para reordenar"
          tabIndex={-1}
        >
          <GripVertical size={14} />
        </button>

        <button
          type="button"
          onClick={() => onSelectTopic(topic.id)}
          className={clsx(
            'min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition-colors',
            active
              ? 'bg-red-50 dark:bg-red-950/40 ring-1 ring-red-200 dark:ring-red-900/50'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800/80'
          )}
          title={topic.title}
        >
          <div className="flex items-start gap-2">
            <Hash
              size={14}
              className={clsx(
                'mt-0.5 shrink-0',
                active ? 'text-red-600 dark:text-red-400' : 'text-gray-400'
              )}
            />
            <div className="min-w-0 flex-1">
              <p
                className={clsx(
                  'text-sm font-medium truncate',
                  active ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-gray-100'
                )}
              >
                {topic.title}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                {topic.messageCount} msg · {topic.createdBy.name}
                {topic.lastMessageAt ? ` · ${formatTopicDate(topic.lastMessageAt)}` : ''}
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setRenameTopic(topic);
            setRenameTitle(topic.title);
          }}
          className="flex w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800"
          title="Renomear tópico"
          aria-label="Renomear tópico"
        >
          <Pencil size={14} />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            pinMutation.mutate({ topicId: topic.id, isPinned: !topic.isPinned });
          }}
          disabled={pinMutation.isPending}
          className={clsx(
            'flex w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
            topic.isPinned
              ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30'
              : 'text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800'
          )}
          title={topic.isPinned ? 'Desafixar tópico' : 'Fixar no topo'}
          aria-label={topic.isPinned ? 'Desafixar tópico' : 'Fixar no topo'}
        >
          {topic.isPinned ? <Pin size={14} className="rotate-45" /> : <PinOff size={14} />}
        </button>

        {canDeleteTopics ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTopic(topic);
            }}
            className="flex w-7 shrink-0 items-center justify-center rounded-lg text-red-500 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950/30"
            title="Excluir tópico"
            aria-label="Excluir tópico"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
    );
  };

  const renderTopicSection = (
    label: string,
    sectionTopics: ChatTopicItem[],
    section: 'pinned' | 'unpinned'
  ) => {
    if (sectionTopics.length === 0) return null;
    return (
      <div className="space-y-1">
        <p className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          {label}
        </p>
        {sectionTopics.map((topic) => renderTopicRow(topic, section))}
      </div>
    );
  };

  return (
    <>
      <aside
        className={clsx(
          'flex h-full w-[260px] shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900',
          className
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-gray-800">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Tópicos
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Arraste · fixe · renomeie
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
            title="Novo tópico"
            aria-label="Novo tópico"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              aria-hidden
            />
            <input
              type="search"
              value={topicSearch}
              onChange={(e) => setTopicSearch(e.target.value)}
              placeholder="Pesquisar tópico..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-8 text-xs text-gray-900 placeholder:text-gray-400 outline-none focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
              aria-label="Pesquisar tópico"
            />
            {topicSearch ? (
              <button
                type="button"
                onClick={() => setTopicSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Limpar pesquisa"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 space-y-1">
          <button
            type="button"
            onClick={() => onSelectTopic(null)}
            className={clsx(
              'w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
              selectedTopicId === null
                ? 'bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100'
                : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/60'
            )}
          >
            Conversa geral
          </button>

          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : topics.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-gray-500 dark:text-gray-400">
              Nenhum tópico ainda. Crie um para iniciar uma discussão focada.
            </p>
          ) : isSearching && filteredTopics.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-gray-500 dark:text-gray-400">
              Nenhum tópico encontrado para &quot;{topicSearch.trim()}&quot;.
            </p>
          ) : isSearching ? (
            <>
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {filteredTopics.length} resultado{filteredTopics.length !== 1 ? 's' : ''}
              </p>
              {filteredTopics.map((topic) =>
                renderTopicRow(topic, topic.isPinned ? 'pinned' : 'unpinned')
              )}
            </>
          ) : (
            <>
              {renderTopicSection('Fixados', pinnedTopics, 'pinned')}
              {renderTopicSection(
                pinnedTopics.length > 0 ? 'Demais tópicos' : 'Tópicos',
                unpinnedTopics,
                'unpinned'
              )}
            </>
          )}
        </div>
      </aside>

      {showCreateModal && (
        <>
          <AppModalOverlay
            as="button"
            type="button"
            aria-label="Fechar"
            className="app-modal-overlay fixed inset-0 z-[2200] bg-black/50"
            onClick={() => !createMutation.isPending && setShowCreateModal(false)} />
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[1201] flex items-center justify-center p-4 pointer-events-none">
            <div
              role="dialog"
              aria-modal="true"
              className="pointer-events-auto w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Novo tópico</h2>
                <button
                  type="button"
                  disabled={createMutation.isPending}
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3 px-4 py-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Título do tópico
                  </label>
                  <input
                    type="text"
                    value={newTopicTitle}
                    onChange={(e) => setNewTopicTitle(e.target.value)}
                    maxLength={200}
                    placeholder="Ex.: Orçamento do contrato X"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Primeira mensagem (opcional)
                  </label>
                  <textarea
                    value={newTopicMessage}
                    onChange={(e) => setNewTopicMessage(e.target.value)}
                    rows={3}
                    placeholder="Descreva o assunto para os participantes responderem..."
                    className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
                <button
                  type="button"
                  disabled={createMutation.isPending}
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={createMutation.isPending || newTopicTitle.trim().length < 2}
                  onClick={() =>
                    createMutation.mutate({
                      title: newTopicTitle.trim(),
                      initialMessage: newTopicMessage.trim() || undefined
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                  Criar tópico
                </button>
              </div>
            </div>
          </AppModalOverlay>
        </>
      )}

      {renameTopic && (
        <>
          <AppModalOverlay
            as="button"
            type="button"
            aria-label="Fechar"
            className="app-modal-overlay fixed inset-0 z-[2200] bg-black/50"
            onClick={() => !renameMutation.isPending && setRenameTopic(null)} />
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[1201] flex items-center justify-center p-4 pointer-events-none">
            <div
              role="dialog"
              aria-modal="true"
              className="pointer-events-auto w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Renomear tópico</h2>
                <button
                  type="button"
                  disabled={renameMutation.isPending}
                  onClick={() => setRenameTopic(null)}
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="px-4 py-4">
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  Título do tópico
                </label>
                <input
                  type="text"
                  value={renameTitle}
                  onChange={(e) => setRenameTitle(e.target.value)}
                  maxLength={200}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && renameTitle.trim().length >= 2) {
                      renameMutation.mutate({ topicId: renameTopic.id, title: renameTitle.trim() });
                    }
                  }}
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
                <button
                  type="button"
                  disabled={renameMutation.isPending}
                  onClick={() => setRenameTopic(null)}
                  className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={
                    renameMutation.isPending ||
                    renameTitle.trim().length < 2 ||
                    renameTitle.trim() === renameTopic.title
                  }
                  onClick={() =>
                    renameMutation.mutate({ topicId: renameTopic.id, title: renameTitle.trim() })
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {renameMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                  Salvar
                </button>
              </div>
            </div>
          </AppModalOverlay>
        </>
      )}

      {deleteTopic && (
        <>
          <AppModalOverlay
            as="button"
            type="button"
            aria-label="Fechar"
            className="app-modal-overlay fixed inset-0 z-[2200] bg-black/50"
            onClick={() => !deleteMutation.isPending && setDeleteTopic(null)} />
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[1201] flex items-center justify-center p-4 pointer-events-none">
            <div
              role="dialog"
              aria-modal="true"
              className="pointer-events-auto w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Excluir tópico</h2>
              </div>
              <div className="px-4 py-4">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Excluir o tópico <span className="font-semibold">&quot;{deleteTopic.title}&quot;</span>?
                  As mensagens permanecerão na conversa geral.
                </p>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => setDeleteTopic(null)}
                  className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(deleteTopic.id)}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                  Excluir
                </button>
              </div>
            </div>
          </AppModalOverlay>
        </>
      )}
    </>
  );
}
