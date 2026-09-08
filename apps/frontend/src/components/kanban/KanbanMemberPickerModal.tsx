'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { isGennecyBotUser } from '@/lib/gennecyBot';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { Modal } from '@/components/ui/Modal';
import { kanbanInput } from './kanbanFormStyles';
import { getKanbanInitials, resolveKanbanAvatarBg } from './kanbanAvatar';
import { textMatchesSearch } from '@/lib/normalizeSearchText';

export interface KanbanPickerUser {
  id: string;
  name: string;
  email: string;
  profilePhotoUrl?: string | null;
}

async function fetchKanbanPickerUsers(): Promise<KanbanPickerUser[]> {
  const res = await api.get('/kanban/picker-users');
  return res.data.data;
}

export interface KanbanMemberPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (user: KanbanPickerUser) => void | Promise<void>;
  excludeUserIds?: string[];
  currentUserId?: string;
  /** Usuário logado — exibido como "Atribuir a mim" quando ainda não está no card. */
  currentUser?: KanbanPickerUser | null;
  elevated?: boolean;
}

function UserRow({
  user,
  onSelect,
}: {
  user: KanbanPickerUser;
  onSelect: (user: KanbanPickerUser) => void;
}) {
  const photo = resolveApiMediaUrl(user.profilePhotoUrl ?? null);
  return (
    <button
      type="button"
      onClick={() => onSelect(user)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors text-left"
    >
      <div
        className={clsx(
          'w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0 overflow-hidden',
          photo ? '' : resolveKanbanAvatarBg(null, user.id),
        )}
      >
        {photo ? (
          <img src={photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          getKanbanInitials(user.name)
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
      </div>
    </button>
  );
}

export function KanbanMemberPickerModal({
  isOpen,
  onClose,
  onSelect,
  excludeUserIds = [],
  currentUserId,
  currentUser,
  elevated = true,
}: KanbanMemberPickerModalProps) {
  const [search, setSearch] = useState('');

  const { data: users = [], isLoading, isError } = useQuery({
    queryKey: ['kanban-member-picker-users', 'include-self'],
    queryFn: fetchKanbanPickerUsers,
    enabled: isOpen,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (isGennecyBotUser(u)) return false;
      if (currentUser && u.id === currentUser.id) return false;
      if (excludeUserIds.includes(u.id)) return false;
      if (!q) return true;
      return textMatchesSearch(u.name, q) || textMatchesSearch(u.email, q);
    });
  }, [users, search, excludeUserIds, currentUser]);

  const showSelfOption =
    !!currentUser &&
    !isGennecyBotUser(currentUser) &&
    !excludeUserIds.includes(currentUser.id) &&
    (!search.trim() ||
      textMatchesSearch(currentUser.name, search) ||
      textMatchesSearch(currentUser.email, search));

  async function handleSelect(user: KanbanPickerUser) {
    await onSelect(user);
    setSearch('');
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title="Adicionar membro"
      closeOnOverlayClick
      elevated={elevated}
      scrollContent={false}
    >
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
          className={clsx(kanbanInput, 'pl-9 text-sm')}
          autoFocus
        />
      </div>

      <div className="max-h-[min(320px,50vh)] overflow-y-auto overscroll-y-contain -mx-1">
        {isLoading && (
          <div className="flex items-center justify-center py-10 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}
        {isError && (
          <p className="text-sm text-red-600 dark:text-red-400 py-4 text-center">
            Não foi possível carregar os usuários.
          </p>
        )}
        {!isLoading && !isError && !showSelfOption && filtered.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
            {search.trim() ? 'Nenhum usuário encontrado.' : 'Nenhum usuário disponível.'}
          </p>
        )}
        {!isLoading && !isError && showSelfOption && currentUser && (
          <button
            type="button"
            onClick={() => handleSelect(currentUser)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-900/40 transition-colors text-left mb-1"
          >
            <div
              className={clsx(
                'w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0 overflow-hidden',
                resolveApiMediaUrl(currentUser.profilePhotoUrl ?? null)
                  ? ''
                  : resolveKanbanAvatarBg(null, currentUser.id),
              )}
            >
              {resolveApiMediaUrl(currentUser.profilePhotoUrl ?? null) ? (
                <img
                  src={resolveApiMediaUrl(currentUser.profilePhotoUrl ?? null)!}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                getKanbanInitials(currentUser.name)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200 truncate">
                Atribuir a mim
              </p>
              <p className="text-xs text-red-600/80 dark:text-red-300/80 truncate">
                {currentUser.name}
              </p>
            </div>
          </button>
        )}
        {!isLoading &&
          !isError &&
          filtered.map((user) => (
            <UserRow key={user.id} user={user} onSelect={handleSelect} />
          ))}
      </div>

      {currentUserId && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          Selecione você ou outro colaborador para atribuir ao card.
        </p>
      )}
    </Modal>
  );
}
