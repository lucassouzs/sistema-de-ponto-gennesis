import api from '@/lib/api';

export type GestaoOsAgendaKind = 'work_order' | 'plan';

export type GestaoOsAgendaItem = {
  id: string;
  kind: GestaoOsAgendaKind;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  color: string;
  href: string;
  overdue?: boolean;
  workOrderId?: string;
  planId?: string;
};

export async function fetchGestaoOsAgenda(
  from: Date,
  to: Date,
  ownerId?: string
): Promise<GestaoOsAgendaItem[]> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString()
  });
  if (ownerId) params.set('ownerId', ownerId);
  try {
    const res = await api.get<{ success: boolean; data: GestaoOsAgendaItem[] }>(
      `/gestao-os/agenda?${params.toString()}`
    );
    return res.data?.data ?? [];
  } catch {
    return [];
  }
}
