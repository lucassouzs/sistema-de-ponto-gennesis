export const KANBAN_AVATAR_COLORS = [
  'bg-gradient-to-br from-amber-400 to-orange-500',
  'bg-gradient-to-br from-sky-400 to-blue-600',
  'bg-gradient-to-br from-violet-400 to-purple-600',
  'bg-gradient-to-br from-emerald-400 to-teal-600',
  'bg-gradient-to-br from-rose-400 to-pink-600',
  'bg-gradient-to-br from-indigo-400 to-blue-600',
] as const;

export const KANBAN_AVATAR_FALLBACK = KANBAN_AVATAR_COLORS[3];

export function getKanbanInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

export function kanbanAvatarColorForKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  return KANBAN_AVATAR_COLORS[Math.abs(hash) % KANBAN_AVATAR_COLORS.length];
}

export function resolveKanbanAvatarBg(colorClass?: string | null, colorKey?: string | null): string {
  if (colorClass?.includes('bg-')) return colorClass;
  if (colorKey) return kanbanAvatarColorForKey(colorKey);
  return KANBAN_AVATAR_FALLBACK;
}
