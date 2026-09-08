'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';

export type RmFeedItem = {
  id: string;
  kind?: 'comment' | 'system';
  content: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    profilePhotoUrl?: string | null;
  } | null;
};

function toLocalDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}

function formatTimeHm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function shortPersonName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return fullName.trim();
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function formatSystemLine(content: string): string {
  let text = content.trim();
  text = text.replace(
    /^([A-Za-zÀ-ÿ' .]+?) (criou|aprovou|enviou|rejeitou|cancelou|excluiu)/i,
    (_, name: string, verb: string) => `${shortPersonName(name)} ${verb}`
  );
  return text;
}

type RmCommentsSectionProps = {
  materialRequestId: string;
  currentUserId?: string | null;
  /** Layout em tela cheia da aba (lista com scroll + composer fixo embaixo). */
  fillHeight?: boolean;
};

export function RmCommentsSection({
  materialRequestId,
  currentUserId,
  fillHeight = false
}: RmCommentsSectionProps) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const queryKey = ['material-request-comments', materialRequestId] as const;

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await api.get(`/material-requests/${materialRequestId}/comments`);
      return (res.data?.data ?? []) as RmFeedItem[];
    },
    enabled: !!materialRequestId,
  });

  const groupedByDay = useMemo(() => {
    const groups: Array<{ dayKey: string; label: string; items: RmFeedItem[] }> = [];
    const indexByDay = new Map<string, number>();
    for (const item of items) {
      const dayKey = toLocalDayKey(item.createdAt) || 'unknown';
      const existing = indexByDay.get(dayKey);
      if (existing == null) {
        indexByDay.set(dayKey, groups.length);
        groups.push({
          dayKey,
          label: formatDayLabel(item.createdAt) || dayKey,
          items: [item],
        });
      } else {
        groups[existing].items.push(item);
      }
    }
    return groups;
  }, [items]);

  const postMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await api.post(`/material-requests/${materialRequestId}/comments`, { content });
      return res.data.data as RmFeedItem;
    },
    onSuccess: (comment) => {
      queryClient.setQueryData<RmFeedItem[]>(queryKey, (prev) => [
        ...(prev ?? []),
        { ...comment, kind: comment.kind || 'comment' },
      ]);
      setText('');
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Não foi possível comentar');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await api.delete(`/material-requests/comments/${commentId}`);
      return commentId;
    },
    onSuccess: (commentId) => {
      queryClient.setQueryData<RmFeedItem[]>(queryKey, (prev) =>
        (prev ?? []).filter((c) => c.id !== commentId)
      );
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Não foi possível excluir');
    },
  });

  const handlePost = () => {
    const content = text.trim();
    if (!content || postMutation.isPending) return;
    postMutation.mutate(content);
  };

  const feed = (
    <>
      {isLoading ? (
        <p className="py-16 text-center text-sm text-gray-400">Carregando…</p>
      ) : items.length === 0 ? (
        <p
          className={`flex items-center justify-center px-2 text-center text-sm text-gray-400 ${
            fillHeight ? 'h-full min-h-[12rem]' : 'min-h-[6rem]'
          }`}
        >
          Nenhum comentário ainda.
        </p>
      ) : (
        <div className="space-y-3 pb-2">
          {groupedByDay.map((group) => (
            <div key={group.dayKey} className="space-y-3">
              <div className="flex items-center gap-3 py-2">
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                <span className="shrink-0 text-[11px] font-medium tracking-wide text-gray-400 dark:text-gray-500">
                  {group.label}
                </span>
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
              </div>

              {group.items.map((item) => {
                const kind = item.kind || 'comment';
                const timeLabel = formatTimeHm(item.createdAt);

                if (kind === 'system') {
                  return (
                    <div key={item.id} className="flex justify-center px-4 py-0.5">
                      <p className="max-w-md text-center text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
                        {formatSystemLine(item.content)}
                        {timeLabel ? (
                          <>
                            <span className="mx-1 opacity-50">·</span>
                            {timeLabel}
                          </>
                        ) : null}
                      </p>
                    </div>
                  );
                }

                const author = item.author;
                if (!author) return null;
                const canDelete = currentUserId === author.id;
                return (
                  <div
                    key={item.id}
                    className="group/comment flex items-start gap-2.5 rounded-lg px-1 py-1"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[11px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-200">
                      {authorInitials(author.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium leading-tight text-gray-900 dark:text-gray-100">
                          {author.name}
                        </span>
                        <div className="relative flex h-6 min-w-[3.25rem] shrink-0 items-center justify-end">
                          <span
                            className={`text-[10px] leading-none whitespace-nowrap text-gray-400 transition-opacity duration-150 ${
                              canDelete ? 'group-hover/comment:invisible group-hover/comment:opacity-0' : ''
                            }`}
                          >
                            {timeLabel}
                          </span>
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => deleteMutation.mutate(item.id)}
                              disabled={deleteMutation.isPending}
                              className="absolute inset-0 flex items-center justify-end rounded-md text-gray-400 opacity-0 invisible transition-all duration-150 hover:text-red-600 group-hover/comment:visible group-hover/comment:opacity-100"
                              title="Excluir comentário"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-snug text-gray-600 dark:text-gray-300">
                        {item.content}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </>
  );

  const composer = (
    <>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escrever um comentário..."
        rows={2}
        className={`${FORM_FIELD_TEXTAREA_CLS} mb-0 !min-h-0 resize-none py-2 text-sm`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handlePost();
          }
        }}
      />
      <button
        type="button"
        onClick={handlePost}
        disabled={!text.trim() || postMutation.isPending}
        className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
      >
        {postMutation.isPending ? 'Enviando…' : 'Comentar'}
      </button>
    </>
  );

  if (fillHeight) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">{feed}</div>
        <div className="shrink-0 space-y-2 border-t border-gray-200 bg-white pt-3 dark:border-gray-700 dark:bg-gray-800">
          {composer}
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 pt-4 dark:border-gray-600">
      <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Comentários</h4>
      <div className="mb-3 max-h-56 min-h-[6rem] overflow-y-auto">{feed}</div>
      <div className="space-y-2">{composer}</div>
    </div>
  );
}
