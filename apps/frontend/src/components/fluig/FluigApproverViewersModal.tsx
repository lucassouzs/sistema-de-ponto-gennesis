'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Search, Trash2, UserCog } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import {
  addFluigApproverViewer,
  fetchFluigApproverViewers,
  removeFluigApproverViewer,
  type FluigApproverViewer,
} from '@/lib/fluigApproverViewers';
import {
  KanbanMemberPickerModal,
  type KanbanPickerUser,
} from '@/components/kanban/KanbanMemberPickerModal';
import { kanbanInput } from '@/components/kanban/kanbanFormStyles';
import { KanbanUserAvatar } from '@/components/kanban/KanbanUserAvatar';
import { textMatchesSearch } from '@/lib/normalizeSearchText';

type FluigApproverViewersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  approverNameKey: string;
  approverName: string;
  /** Quem já tem acesso total (admin/controle) não aparece na lista nem no picker. */
  excludeUserIds?: string[];
};

function ViewerRow({
  viewer,
  onRemove,
  busy,
}: {
  viewer: FluigApproverViewer;
  onRemove: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/60">
      <KanbanUserAvatar
        name={viewer.user.name}
        colorKey={viewer.user.id}
        profilePhotoUrl={viewer.user.profilePhotoUrl}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {viewer.user.name}
        </p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{viewer.user.email}</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onRemove}
        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30"
        title="Remover acesso"
        aria-label={`Remover acesso de ${viewer.user.name}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export function FluigApproverViewersModal({
  isOpen,
  onClose,
  approverNameKey,
  approverName,
  excludeUserIds = [],
}: FluigApproverViewersModalProps) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const viewersQueryKey = ['fluig-approver-viewers', approverNameKey] as const;

  const { data: viewers = [], isLoading } = useQuery({
    queryKey: viewersQueryKey,
    queryFn: () => fetchFluigApproverViewers(approverNameKey),
    enabled: isOpen && !!approverNameKey,
  });

  const sharedUserIds = useMemo(() => {
    const ids = new Set(viewers.map((viewer) => viewer.userId));
    for (const id of excludeUserIds) ids.add(id);
    return ids;
  }, [viewers, excludeUserIds]);

  const filteredViewers = useMemo(() => {
    const term = filter.trim();
    if (!term) return viewers;
    return viewers.filter(
      (viewer) =>
        textMatchesSearch(viewer.user.name, term) ||
        textMatchesSearch(viewer.user.email, term)
    );
  }, [viewers, filter]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: viewersQueryKey });
    queryClient.invalidateQueries({ queryKey: ['fluig-approver-viewers-all'] });
    queryClient.invalidateQueries({ queryKey: ['me-permissions'] });
  };

  const addMut = useMutation({
    mutationFn: (user: KanbanPickerUser) =>
      addFluigApproverViewer(approverNameKey, user.id, approverName),
    onSuccess: () => {
      invalidate();
      toast.success('Pessoa adicionada');
    },
    onError: (err: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Erro ao adicionar');
    },
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeFluigApproverViewer(approverNameKey, userId),
    onSuccess: () => {
      invalidate();
      toast.success('Acesso removido');
    },
    onError: () => toast.error('Erro ao remover acesso'),
  });

  const busy = addMut.isPending || removeMut.isPending;

  const handleSelectUser = async (user: KanbanPickerUser) => {
    setPickerOpen(false);
    await addMut.mutateAsync(user);
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Quem pode ver este aprovador"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-900/40">
            <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
              <UserCog className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{approverName}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Pessoas listadas aqui verão somente a página deste aprovador. Quem não estiver na
                lista e tiver acesso total continua vendo todos.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
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
          ) : filteredViewers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              {viewers.length === 0
                ? 'Ninguém foi designado ainda. Adicione quem deve ver esta página.'
                : 'Nenhuma pessoa encontrada com esse filtro.'}
            </div>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {filteredViewers.map((viewer) => (
                <ViewerRow
                  key={viewer.id}
                  viewer={viewer}
                  busy={busy}
                  onRemove={() => removeMut.mutate(viewer.userId)}
                />
              ))}
            </div>
          )}
        </div>
      </Modal>

      <KanbanMemberPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectUser}
        excludeUserIds={Array.from(sharedUserIds)}
        elevated
      />
    </>
  );
}
