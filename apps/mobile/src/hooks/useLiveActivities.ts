import { useCallback, useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export type LiveActivityKind = 'fuel' | 'reservation';

export type LiveActivity = {
  id: string;
  kind: LiveActivityKind;
  title: string;
  subtitle: string;
  meta: string;
  cta: string;
  statusKey: string;
};

type FuelRow = {
  id: string;
  displayNumber?: number;
  status: string;
  vehiclePlate?: string | null;
  route?: string | null;
  gasStation?: { name?: string | null } | null;
};

type ReservationRow = {
  id: string;
  code?: string;
  status: string;
  localDestino?: string | null;
  motorista?: string | null;
  createdById?: string | null;
  createdBy?: { id?: string } | null;
  solicitante?: string | null;
  vehicle?: {
    placaVeic?: string | null;
    modeloVeic?: string | null;
  } | null;
};

const POLL_MS = 35_000;

export function useLiveActivities() {
  const { user, isAuthenticated } = useAuth();
  const [items, setItems] = useState<LiveActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setItems([]);
      setLoading(false);
      return;
    }

    try {
      const [fuelRes, reservationRes] = await Promise.all([
        api.get('/api/fuel-refuel-requests/mine'),
        api.get('/api/vehicle-reservations?limit=100&page=1'),
      ]);

      const fuelJson = await fuelRes.json().catch(() => ({}));
      const reservationJson = await reservationRes.json().catch(() => ({}));

      const fuelRows = (fuelRes.ok ? (fuelJson?.data || []) : []) as FuelRow[];
      const allReservations = (reservationRes.ok ? (reservationJson?.data || []) : []) as ReservationRow[];
      const myReservations = allReservations.filter(
        (r) =>
          r.createdBy?.id === user.id ||
          r.createdById === user.id ||
          r.solicitante === user.name,
      );

      const live: LiveActivity[] = [];

      for (const row of fuelRows) {
        if (row.status !== 'AWAITING_REFUEL') continue;
        live.push({
          id: `fuel:${row.id}`,
          kind: 'fuel',
          title: 'Combustível liberado',
          subtitle: 'Pode abastecer agora',
          meta: [row.vehiclePlate, row.gasStation?.name || row.route]
            .filter(Boolean)
            .join(' · ') || `Solicitação #${row.displayNumber ?? ''}`,
          cta: 'Informar abastecimento',
          statusKey: row.status,
        });
      }

      for (const row of myReservations) {
        if (row.status !== 'APPROVED') continue;
        const plate =
          row.vehicle?.placaVeic ||
          row.vehicle?.modeloVeic ||
          'Veículo liberado';
        live.push({
          id: `reservation:${row.id}`,
          kind: 'reservation',
          title: 'Veículo liberado',
          subtitle: 'Reserva em uso',
          meta: [plate, row.localDestino].filter(Boolean).join(' · ') || row.code || 'Reserva ativa',
          cta: 'Ver reserva',
          statusKey: row.status,
        });
      }

      setItems(live);
    } catch {
      // silencioso na home
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id, user?.name]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    const id = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, refresh]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') void refresh();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [refresh]);

  return { items, loading, refresh };
}
