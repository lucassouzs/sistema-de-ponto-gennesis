'use client';

import type { LucideIcon } from 'lucide-react';
import { CheckCircle, Clock, LayoutList, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { FilterStatCard } from '@/components/ui/FilterStatCard';

export type ApprovalPhaseStatCard<T extends string> = {
  filter: T;
  label: string;
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
};

/** Cards padrão: Pendentes / Aprovadas / Canceladas / Todas */
export const DEFAULT_APPROVAL_PHASE_CARDS: ApprovalPhaseStatCard<
  'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'
>[] = [
  {
    filter: 'PENDING',
    label: 'Pendentes',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    Icon: Clock,
  },
  {
    filter: 'APPROVED',
    label: 'Aprovadas',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
  },
  {
    filter: 'REJECTED',
    label: 'Canceladas',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: XCircle,
  },
  {
    filter: 'ALL',
    label: 'Todos',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: LayoutList,
  },
];

type ApprovalPhaseStatCardsProps<T extends string> = {
  cards: ApprovalPhaseStatCard<T>[];
  activeFilter: T;
  counts: Partial<Record<T, number>>;
  loading?: boolean;
  onSelect: (filter: T) => void;
  columnsClassName?: string;
};

export function ApprovalPhaseStatCards<T extends string>({
  cards,
  activeFilter,
  counts,
  loading = false,
  onSelect,
  columnsClassName = 'grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4',
}: ApprovalPhaseStatCardsProps<T>) {
  return (
    <div className={columnsClassName}>
      {cards.map((card) => (
        <FilterStatCard
          key={card.filter}
          label={card.label}
          count={counts[card.filter] ?? 0}
          icon={card.Icon}
          iconBg={card.iconBg}
          iconColor={card.iconColor}
          isActive={activeFilter === card.filter}
          loading={loading}
          onClick={() => onSelect(card.filter)}
        />
      ))}
    </div>
  );
}

/** Busca contagens por fase em paralelo (mesmo filtro da lista). */
export async function fetchApprovalPhaseCounts<T extends string>(
  url: string,
  phases: readonly T[],
): Promise<Record<T, number>> {
  const results = await Promise.all(
    phases.map(async (phase) => {
      const res = await api.get(url, { params: { phase } });
      const data = res.data?.data;
      const count = Array.isArray(data) ? data.length : 0;
      return [phase, count] as const;
    }),
  );
  return Object.fromEntries(results) as Record<T, number>;
}
