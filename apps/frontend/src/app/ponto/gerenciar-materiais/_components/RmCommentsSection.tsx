'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';

export type RmComment = {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    profilePhotoUrl?: string | null;
  };
};

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 45) return 'agora';
  if (diffSec < 3600) return `há ${Math.max(1, Math.round(diffSec / 60))} min`;
  if (diffSec < 86400) return `há ${Math.max(1, Math.round(diffSec / 3600))}h`;
  if (diffSec < 86400 * 7) return `há ${Math.max(1, Math.round(diffSec / 86400))}d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

type RmCommentsSectionProps = {
  materialRequestId: string;
  currentUserId?: string | null;
};

export function RmCommentsSection({ materialRequestId, currentUserId }: RmCommentsSectionProps) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const queryKey = ['material-request-comments', materialRequestId] as const;

  const { data: comments = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await api.get(`/material-requests/${materialRequestId}/comments`);
      return (res.data?.data ?? []) as RmComment[];
    },
    enabled: !!materialRequestId,
  });

  const postMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await api.post(`/material-requests/${materialRequestId}/comments`, { content });
      return res.data.data as RmComment;
    },
    onSuccess: (comment) => {
      queryClient.setQueryData<RmComment[]>(queryKey, (prev) => [...(prev ?? []), comment]);
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
      queryClient.setQueryData<RmComment[]>(queryKey, (prev) =>
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

  return (
    <div className="border-t border-gray-200 pt-4 dark:border-gray-600">
      <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Comentários</h4>

      <div className="mb-3 max-h-56 min-h-[6rem] overflow-y-auto">
        {isLoading ? (
          <p className="py-6 text-center text-sm text-gray-400">Carregando…</p>
        ) : comments.length === 0 ? (
          <p className="flex min-h-[6rem] items-center justify-center px-2 text-center text-sm text-gray-400">
            Nenhum comentário ainda.
          </p>
        ) : (
          <div className="space-y-3 pb-1">
            {comments.map((comment) => {
              const canDelete = currentUserId === comment.author.id;
              return (
                <div
                  key={comment.id}
                  className="group/comment flex items-start gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[11px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-200">
                    {authorInitials(comment.author.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium leading-tight text-gray-900 dark:text-gray-100">
                        {comment.author.name}
                      </span>
                      <div className="relative flex h-6 min-w-[3.25rem] shrink-0 items-center justify-end">
                        <span
                          className={`text-[10px] leading-none whitespace-nowrap text-gray-400 transition-opacity duration-150 ${
                            canDelete ? 'group-hover/comment:invisible group-hover/comment:opacity-0' : ''
                          }`}
                        >
                          {formatRelativeTime(comment.createdAt)}
                        </span>
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() => deleteMutation.mutate(comment.id)}
                            disabled={deleteMutation.isPending}
                            className="absolute inset-0 flex items-center justify-end rounded-md text-gray-400 opacity-0 invisible transition-all duration-150 hover:text-red-600 group-hover/comment:visible group-hover/comment:opacity-100"
                            title="Excluir comentário"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-snug text-gray-600 dark:text-gray-300">
                      {comment.content}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escrever um comentário..."
        rows={2}
        className={`${FORM_FIELD_TEXTAREA_CLS} mb-2 !min-h-0 py-2 text-sm`}
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
    </div>
  );
}
