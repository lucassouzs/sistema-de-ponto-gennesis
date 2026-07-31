import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const storage = {
  getItem: async (key: string) => {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
};

export type ActivityKind = 'fuel' | 'reservation';

export type ActivityNotification = {
  id: string;
  entityId: string;
  kind: ActivityKind;
  status: string;
  title: string;
  body: string;
  updatedAt: string;
  detectedAt: string;
  read: boolean;
};

export type StatusSnapshot = Record<string, { status: string; updatedAt: string }>;

const SNAPSHOT_KEY = '@activity_status_snapshot';
const FEED_KEY = '@activity_notifications_feed';
const MAX_FEED = 60;

export async function loadSnapshot(): Promise<StatusSnapshot> {
  try {
    const raw = await storage.getItem(SNAPSHOT_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StatusSnapshot;
  } catch {
    return {};
  }
}

export async function saveSnapshot(snapshot: StatusSnapshot) {
  await storage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function loadFeed(): Promise<ActivityNotification[]> {
  try {
    const raw = await storage.getItem(FEED_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ActivityNotification[];
  } catch {
    return [];
  }
}

export async function saveFeed(items: ActivityNotification[]) {
  await storage.setItem(FEED_KEY, JSON.stringify(items.slice(0, MAX_FEED)));
}

export function fuelStatusTitle(status: string): string {
  const map: Record<string, string> = {
    PENDING_MANAGER: 'Combustível aguardando gestor',
    PENDING_SUPPLIES: 'Combustível aguardando suprimentos',
    APPROVED: 'Combustível aguardando suprimentos',
    AWAITING_REFUEL: 'Combustível liberado para abastecer',
    COMPLETED: 'Abastecimento concluído',
    REJECTED: 'Solicitação de combustível rejeitada',
    CANCELLED: 'Solicitação de combustível cancelada',
  };
  return map[status] || 'Atualização de combustível';
}

export function reservationStatusTitle(status: string): string {
  const map: Record<string, string> = {
    PENDING_SUPPLIES: 'Reserva aguardando aprovação',
    APPROVED: 'Reserva aprovada',
    COMPLETED: 'Reserva aguardando vistoria',
    INSPECTED: 'Vistoria da reserva concluída',
    REJECTED: 'Reserva cancelada',
    CANCELLED: 'Reserva cancelada',
  };
  return map[status] || 'Atualização de reserva';
}

export function fuelStatusBody(status: string): string {
  const map: Record<string, string> = {
    PENDING_MANAGER: 'Sua solicitação está com o gestor.',
    PENDING_SUPPLIES: 'Suprimentos vai analisar o pedido.',
    APPROVED: 'Suprimentos vai analisar o pedido.',
    AWAITING_REFUEL: 'Você já pode informar o abastecimento.',
    COMPLETED: 'O abastecimento foi registrado com sucesso.',
    REJECTED: 'Confira o motivo na solicitação.',
    CANCELLED: 'A solicitação foi cancelada.',
  };
  return map[status] || 'Status atualizado.';
}

export function reservationStatusBody(status: string): string {
  const map: Record<string, string> = {
    PENDING_SUPPLIES: 'Sua reserva está em análise.',
    APPROVED: 'O veículo foi liberado para uso.',
    COMPLETED: 'A baixa foi registrada; falta a vistoria.',
    INSPECTED: 'A vistoria foi concluída.',
    REJECTED: 'Confira o motivo no detalhe da reserva.',
    CANCELLED: 'A reserva foi cancelada.',
  };
  return map[status] || 'Status atualizado.';
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Agora';
  if (mins < 60) return `Há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Ontem';
  if (days < 7) return `Há ${days} dias`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
