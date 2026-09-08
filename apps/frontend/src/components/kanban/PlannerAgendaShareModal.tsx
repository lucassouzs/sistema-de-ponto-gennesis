'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import {
  addPlannerAgendaShare,
  fetchPlannerAgendaShares,
  removePlannerAgendaShare,
  updatePlannerAgendaShare,
  type PlannerAgendaShare,
} from '@/lib/plannerEvents';
import {
  KanbanMemberPickerModal,
  type KanbanPickerUser,
} from './KanbanMemberPickerModal';
import { kanbanInput } from './kanbanFormStyles';
import { KanbanUserAvatar } from './KanbanUserAvatar';
import { textMatchesSearch } from '@/lib/normalizeSearchText';

export interface PlannerAgendaShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
  ownerUser?: KanbanPickerUser | null;
}

function CreatorRow({ user }: { user: KanbanPickerUser }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/60">
      <KanbanUserAvatar
        name={user.name}
        colorKey={user.id}
        profilePhotoUrl={user.profilePhotoUrl}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {user.name}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
      </div>
      <span className="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
        Dono
      </span>
    </div>
  );
}

function ShareRow({
  share,
  onRemove,
  onChangePermission,
  busy,
}: {
  share: PlannerAgendaShare;
  onRemove: () => void;
  onChangePermission: (permission: 'READ' | 'WRITE') => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/60">
      <KanbanUserAvatar
        name={share.user.name}
        colorKey={share.user.id}
        profilePhotoUrl={share.user.profilePhotoUrl}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {share.user.name}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{share.user.email}</p>
      </div>
      <select
        value={share.permission}
        disabled={busy}
        onChange={(e) => onChangePermission(e.target.value as 'READ' | 'WRITE')}
        className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-medium text-gray-700 outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
        aria-label={`Permissão de ${share.user.name}`}
      >
        <option value="READ">Só ver</option>
        <option value="WRITE">Editar</option>
      </select>
      <button
        type="button"
        disabled={busy}
        onClick={onRemove}
        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30"
        title="Remover acesso"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export function PlannerAgendaShareModal({
  isOpen,
  onClose,
  currentUserId,
  ownerUser,
}: PlannerAgendaShareModalProps) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<'READ' | 'WRITE'>('READ');
  const [filter, setFilter] = useState('');

  const sharesQueryKey = ['planner-agenda-shares'] as const;

  const { data: shares = [], isLoading } = useQuery({
    queryKey: sharesQueryKey,
    queryFn: fetchPlannerAgendaShares,
    enabled: isOpen,
  });

  const sharedUserIds = useMemo(() => new Set(shares.map((s) => s.userId)), [shares]);

  const pickerExcludeUserIds = useMemo(() => {
    const ids = Array.from(sharedUserIds);
    if (currentUserId) ids.push(currentUserId);
    return ids;
  }, [sharedUserIds, currentUserId]);

  const filteredShares = useMemo(() => {
    const q = filter.trim();
    if (!q) return shares;
    return shares.filter(
      (s) => textMatchesSearch(s.user.name, q) || textMatchesSearch(s.user.email, q)
    );
  }, [shares, filter]);

  const ownerMatchesFilter = useMemo(() => {
    if (!ownerUser) return false;
    const q = filter.trim();
    if (!q) return true;
    return textMatchesSearch(ownerUser.name, q) || textMatchesSearch(ownerUser.email, q);
  }, [ownerUser, filter]);

  const hasVisiblePeople = ownerMatchesFilter || filteredShares.length > 0;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: sharesQueryKey });
    queryClient.invalidateQueries({ queryKey: ['planner-agendas'] });
  };

  const addMut = useMutation({
    mutationFn: (user: KanbanPickerUser) =>
      addPlannerAgendaShare(user.id, pendingPermission),
    onSuccess: () => {
      invalidate();
      toast.success('Agenda compartilhada');
    },
    onError: (err: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          'Erro ao compartilhar'
      );
    },
  });

  const updateMut = useMutation({
    mutationFn: ({
      userId,
      permission,
    }: {
      userId: string;
      permission: 'READ' | 'WRITE';
    }) => updatePlannerAgendaShare(userId, permission),
    onSuccess: () => {
      invalidate();
      toast.success('Permissão atualizada');
    },
    onError: () => toast.error('Erro ao atualizar permissão'),
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => removePlannerAgendaShare(userId),
    onSuccess: () => {
      invalidate();
      toast.success('Acesso removido');
    },
    onError: () => toast.error('Erro ao remover acesso'),
  });

  const busy = addMut.isPending || updateMut.isPending || removeMut.isPending;

  const handleSelectUser = async (user: KanbanPickerUser) => {
    setPickerOpen(false);
    await addMut.mutateAsync(user);
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Compartilhar agenda" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Escolha quem pode ver ou editar sua agenda no sistema.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Ao adicionar:
            </label>
            <select
              value={pendingPermission}
              onChange={(e) => setPendingPermission(e.target.value as 'READ' | 'WRITE')}
              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-800 outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="READ">Só ver</option>
              <option value="WRITE">Editar</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar pessoas com acesso…"
                className={clsx(kanbanInput, 'pl-9')}
              />
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={busy}
              title="Adicionar pessoa"
              aria-label="Adicionar pessoa"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : !hasVisiblePeople ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              Nenhuma pessoa encontrada com esse filtro.
            </div>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {ownerUser && ownerMatchesFilter && <CreatorRow user={ownerUser} />}
              {filteredShares.map((share) => (
                <ShareRow
                  key={share.id}
                  share={share}
                  busy={busy}
                  onRemove={() => removeMut.mutate(share.userId)}
                  onChangePermission={(permission) =>
                    updateMut.mutate({ userId: share.userId, permission })
                  }
                />
              ))}
              {ownerMatchesFilter && filteredShares.length === 0 && shares.length === 0 && (
                <p className="px-1 pt-1 text-center text-xs text-gray-500 dark:text-gray-400">
                  Ninguém foi convidado ainda.
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>

      <KanbanMemberPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectUser}
        excludeUserIds={pickerExcludeUserIds}
        elevated
      />
    </>
  );
}
