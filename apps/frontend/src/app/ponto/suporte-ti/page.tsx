'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LifeBuoy, RefreshCw, Search } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import api from '@/lib/api';

type SupportTicket = {
  id: string;
  displayNumber: number;
  category: string;
  status: string;
  channel: string;
  subject: string;
  description: string;
  moduleHint: string | null;
  requesterName: string | null;
  requesterPhone: string | null;
  requesterCpf: string | null;
  resolutionNote: string | null;
  createdAt: string;
  requester?: { name: string; email: string } | null;
  assignee?: { name: string; email: string } | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  PASSWORD_RESET: 'Senha / acesso',
  SYSTEM_ERROR: 'Erro no sistema',
  PERMISSION: 'Permissão / menu',
  OTHER: 'Outro',
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em atendimento',
  RESOLVED: 'Resolvido',
  CLOSED: 'Encerrado',
};

const CHANNEL_LABELS: Record<string, string> = {
  GENNECY_CHAT: 'Gennecy (chat)',
  WHATSAPP: 'WhatsApp',
  WEB: 'Web',
};

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

async function fetchTickets(params: { status?: string; q?: string }) {
  const res = await api.get('/support-tickets', { params });
  return (res.data?.data ?? []) as SupportTicket[];
}

export default function SuporteTiPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const queryKey = ['support-tickets', statusFilter, search.trim()];

  const { data: tickets = [], isLoading, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      fetchTickets({
        status: statusFilter || undefined,
        q: search.trim() || undefined,
      }),
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { id: string; status: string; resolutionNote?: string }) => {
      const res = await api.patch(`/support-tickets/${input.id}`, {
        status: input.status,
        resolutionNote: input.resolutionNote,
      });
      return res.data?.data as SupportTicket;
    },
    onSuccess: (updated) => {
      toast.success(`Chamado #${updated.displayNumber} atualizado`);
      setSelected(updated);
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao atualizar chamado');
    },
  });

  const openCount = useMemo(
    () => tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length,
    [tickets],
  );

  const openDetail = (ticket: SupportTicket) => {
    setSelected(ticket);
    setResolutionNote(ticket.resolutionNote || '');
  };

  return (
    <ProtectedRoute route="/ponto/suporte-ti">
      <MainLayout>
        <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <LifeBuoy className="h-6 w-6" />
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  Suporte ao Sistema
                </h1>
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Chamados abertos pela Gennecy (senha, erro, permissão). Pendentes na lista:{' '}
                <strong>{openCount}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, assunto ou descrição…"
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="">Todos os status</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <Loading message="Carregando chamados…" />
          ) : tickets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500 dark:border-gray-700">
              Nenhum chamado encontrado.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">#</th>
                    <th className="px-4 py-3 text-left font-medium">Assunto</th>
                    <th className="px-4 py-3 text-left font-medium">Solicitante</th>
                    <th className="px-4 py-3 text-left font-medium">Canal</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Aberto em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {tickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="cursor-pointer hover:bg-red-50/40 dark:hover:bg-red-900/10"
                      onClick={() => openDetail(ticket)}
                    >
                      <td className="px-4 py-3 font-mono">{ticket.displayNumber}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{CATEGORY_LABELS[ticket.category] || ticket.subject}</div>
                        <div className="line-clamp-1 text-xs text-gray-500">{ticket.description}</div>
                      </td>
                      <td className="px-4 py-3">
                        {ticket.requester?.name || ticket.requesterName || '—'}
                        {ticket.requesterPhone ? (
                          <div className="text-xs text-gray-500">{ticket.requesterPhone}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">{CHANNEL_LABELS[ticket.channel] || ticket.channel}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800">
                          {STATUS_LABELS[ticket.status] || ticket.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {format(new Date(ticket.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selected && (
          <AppModalOverlay
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4"
            onClick={() => setSelected(null)}
          >
            <div
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold">Chamado #{selected.displayNumber}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {CATEGORY_LABELS[selected.category]} · {CHANNEL_LABELS[selected.channel]}
              </p>

              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase text-gray-400">Solicitante</div>
                  <div>{selected.requester?.name || selected.requesterName || '—'}</div>
                  {selected.requesterCpf ? <div className="text-gray-500">CPF: {selected.requesterCpf}</div> : null}
                  {selected.requesterPhone ? <div className="text-gray-500">{selected.requesterPhone}</div> : null}
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-gray-400">Descrição</div>
                  <p className="whitespace-pre-wrap">{selected.description}</p>
                </div>
                {selected.moduleHint ? (
                  <div>
                    <div className="text-xs font-semibold uppercase text-gray-400">Tela / módulo</div>
                    <p>{selected.moduleHint}</p>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 space-y-3">
                <label className="block text-sm font-medium">Status</label>
                <select
                  value={selected.status}
                  onChange={(e) =>
                    setSelected({ ...selected, status: e.target.value })
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>

                <label className="block text-sm font-medium">Observação de resolução</label>
                <textarea
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                  placeholder="O que foi feito para resolver…"
                />
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={updateMutation.isPending}
                  onClick={() =>
                    updateMutation.mutate({
                      id: selected.id,
                      status: selected.status,
                      resolutionNote,
                    })
                  }
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Salvar
                </button>
              </div>
            </div>
          </AppModalOverlay>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}
