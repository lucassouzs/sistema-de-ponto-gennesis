'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';

type CallHistoryItem = {
  id: string;
  chatId: string;
  callId: string;
  mode: 'direct' | 'group';
  type: 'voice' | 'video';
  startedAt: string;
  endedAt: string;
  durationSec: number;
  participants: string[];
  status: 'answered' | 'missed' | 'rejected' | 'cancelled';
};

function formatDuration(sec: number) {
  const mm = Math.floor(sec / 60).toString().padStart(2, '0');
  const ss = (sec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function HistoricoChamadasPage() {
  const router = useRouter();
  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const { data = [], isLoading } = useQuery({
    queryKey: ['call-history'],
    queryFn: async () => {
      const res = await api.get('/call-history');
      return (res.data?.data ?? []) as CallHistoryItem[];
    },
    refetchInterval: 10000,
  });

  const items = useMemo(
    () => [...data].sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt)),
    [data]
  );

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/conversas">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/conversas">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Historico de Chamadas</h1>
          {isLoading ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">Carregando...</p>
          ) : items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
              Nenhuma chamada registrada ainda.
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="rounded-xl border border-gray-200 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {it.mode === 'group' ? 'Grupo' : 'Direta'} · {it.type === 'video' ? 'Video' : 'Voz'}
                    </p>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(it.startedAt).toLocaleString('pt-BR')}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    Duracao: {formatDuration(it.durationSec)} · Status: {it.status} · Participantes: {it.participants.length}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400">Chat: {it.chatId}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
