'use client';

import React from 'react';
import { Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { getKanbanInitials, resolveKanbanAvatarBg } from './kanbanAvatar';

export interface KanbanMemberChipProps {
  userId: string;
  name: string;
  profilePhotoUrl?: string | null;
  avatarColor?: string | null;
  isHovering: boolean;
  onHover: (hovering: boolean) => void;
  onRemove: () => void;
}

export function KanbanMemberChip({
  userId,
  name,
  profilePhotoUrl,
  avatarColor,
  isHovering,
  onHover,
  onRemove,
}: KanbanMemberChipProps) {
  const photo = resolveApiMediaUrl(profilePhotoUrl ?? null);
  const bg = resolveKanbanAvatarBg(avatarColor, userId);

  return (
    <button
      type="button"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onRemove}
      className={clsx(
        'relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden',
        !photo && bg,
      )}
      title={isHovering ? 'Remover membro' : name}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="text-xs font-bold text-white">{getKanbanInitials(name)}</span>
      )}
      <span
        className={clsx(
          'absolute inset-0 flex items-center justify-center bg-black/45 transition-opacity duration-150',
          isHovering ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        aria-hidden={!isHovering}
      >
        <Trash2 className="h-4 w-4 text-white drop-shadow-md" />
      </span>
    </button>
  );
}
