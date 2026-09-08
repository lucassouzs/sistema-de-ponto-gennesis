'use client';

import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';

type ScheduledNewsDto = {
  id: string;
  title: string;
  summary: string;
  content: string;
  imageUrl: string | null;
  publishAt: string;
};

export function ScheduledNewsGate({ userId }: { userId?: string }) {
  const [dismissedId, setDismissedId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setDismissedId(null);
    setOpen(false);
  }, [userId]);

  const { data } = useQuery({
    queryKey: ['scheduled-news-current', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get('/news/current');
      return (res.data?.data || null) as ScheduledNewsDto | null;
    },
  });

  React.useEffect(() => {
    if (data?.id && data.id !== dismissedId) {
      setOpen(true);
    }
  }, [data?.id, dismissedId]);

  const closeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/news/${id}/view`);
    },
    onSettled: () => {
      if (data?.id) setDismissedId(data.id);
      setOpen(false);
    },
  });

  const handleClose = () => {
    if (!data?.id || closeMutation.isPending) {
      setOpen(false);
      return;
    }
    closeMutation.mutate(data.id);
  };

  if (!data) return null;

  const imageSrc = resolveApiMediaUrl(data.imageUrl ?? null);

  return (
    <Modal isOpen={open} onClose={handleClose} size="xl" title={data.title}>
      <div className="space-y-5">
        {imageSrc ? (
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt={data.title}
              className="max-h-[24rem] w-full object-cover"
            />
          </div>
        ) : null}

        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Publicado em {new Date(data.publishAt).toLocaleString('pt-BR')}
          </p>
          <p className="text-base font-medium text-gray-900 dark:text-gray-100">{data.summary}</p>
          <div className="whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">
            {data.content}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            disabled={closeMutation.isPending}
            className="inline-flex h-10 items-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {closeMutation.isPending ? 'Fechando...' : 'Entendi'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
