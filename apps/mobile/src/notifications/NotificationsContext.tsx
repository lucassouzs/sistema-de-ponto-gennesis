import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  ActivityNotification,
  StatusSnapshot,
  fuelStatusBody,
  fuelStatusTitle,
  loadFeed,
  loadSnapshot,
  reservationStatusBody,
  reservationStatusTitle,
  saveFeed,
  saveSnapshot,
} from './activityStorage';
import {
  ensureSystemNotificationPermissions,
  presentSystemNotifications,
  syncAppIconBadge,
} from './systemNotifications';
const POLL_MS = 40_000;

type NotificationsContextValue = {
  notifications: ActivityNotification[];
  unreadCount: number;
  sheetVisible: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  markAllRead: () => void;
  refresh: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

type FuelRow = {
  id: string;
  status: string;
  updatedAt?: string;
  createdAt?: string;
  vehiclePlate?: string | null;
  route?: string | null;
};

type ReservationRow = {
  id: string;
  status: string;
  updatedAt?: string;
  createdAt?: string;
  createdById?: string | null;
  createdBy?: { id?: string } | null;
  solicitante?: string | null;
  veiculo?: { plate?: string | null; model?: string | null } | null;
  veiculoPlaca?: string | null;
};

function snapKey(kind: 'fuel' | 'reservation', id: string) {
  return `${kind}:${id}`;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const snapshotRef = useRef<StatusSnapshot>({});
  const seededRef = useRef(false);
  const pollingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [snap, feed] = await Promise.all([loadSnapshot(), loadFeed()]);
      if (cancelled) return;
      snapshotRef.current = snap;
      seededRef.current = Object.keys(snap).length > 0;
      setNotifications(feed);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyDiff = useCallback(
    (rows: Array<{ kind: 'fuel' | 'reservation'; id: string; status: string; updatedAt: string; subtitle?: string }>) => {
      const prev = snapshotRef.current;
      const next: StatusSnapshot = { ...prev };
      const fresh: ActivityNotification[] = [];
      const now = new Date().toISOString();

      for (const row of rows) {
        const key = snapKey(row.kind, row.id);
        const before = prev[key];
        next[key] = { status: row.status, updatedAt: row.updatedAt };

        if (!seededRef.current) continue;
        if (!before) continue;
        if (before.status === row.status) continue;

        const title =
          row.kind === 'fuel' ? fuelStatusTitle(row.status) : reservationStatusTitle(row.status);
        const bodyBase =
          row.kind === 'fuel' ? fuelStatusBody(row.status) : reservationStatusBody(row.status);
        const body = row.subtitle ? `${bodyBase} · ${row.subtitle}` : bodyBase;

        fresh.push({
          id: `${key}:${row.status}:${row.updatedAt}`,
          entityId: row.id,
          kind: row.kind,
          status: row.status,
          title,
          body,
          updatedAt: row.updatedAt,
          detectedAt: now,
          read: false,
        });
      }

      snapshotRef.current = next;
      void saveSnapshot(next);
      if (!seededRef.current) {
        seededRef.current = true;
        return;
      }
      if (fresh.length === 0) return;

      void presentSystemNotifications(fresh);

      setNotifications((curr) => {
        const ids = new Set(fresh.map((f) => f.id));
        const merged = [...fresh, ...curr.filter((c) => !ids.has(c.id))];
        void saveFeed(merged);
        return merged;
      });
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user?.id || pollingRef.current) return;
    pollingRef.current = true;
    try {
      const [fuelRes, reservationRes] = await Promise.all([
        api.get('/api/fuel-refuel-requests/mine'),
        api.get('/api/vehicle-reservations/mine?limit=100&page=1'),
      ]);

      const fuelJson = await fuelRes.json().catch(() => ({}));
      const reservationJson = await reservationRes.json().catch(() => ({}));

      const fuelRows = (fuelRes.ok ? (fuelJson?.data || []) : []) as FuelRow[];
      const myReservations = (reservationRes.ok ? (reservationJson?.data || []) : []) as ReservationRow[];

      const normalized = [
        ...fuelRows.map((r) => ({
          kind: 'fuel' as const,
          id: r.id,
          status: r.status,
          updatedAt: r.updatedAt || r.createdAt || new Date().toISOString(),
          subtitle: r.vehiclePlate || r.route || undefined,
        })),
        ...myReservations.map((r) => ({
          kind: 'reservation' as const,
          id: r.id,
          status: r.status,
          updatedAt: r.updatedAt || r.createdAt || new Date().toISOString(),
          subtitle: r.veiculo?.plate || r.veiculoPlaca || r.veiculo?.model || undefined,
        })),
      ];

      applyDiff(normalized);
    } catch {
      // silencioso: badge/feed não devem quebrar o app
    } finally {
      pollingRef.current = false;
    }
  }, [applyDiff, isAuthenticated, user?.id, user?.name]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (Platform.OS !== 'web') {
      void ensureSystemNotificationPermissions();
    }
    void refresh();
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

  const markAllRead = useCallback(() => {
    setNotifications((curr) => {
      const next = curr.map((n) => (n.read ? n : { ...n, read: true }));
      void saveFeed(next);
      return next;
    });
  }, []);

  const openSheet = useCallback(() => {
    setSheetVisible(true);
    markAllRead();
  }, [markAllRead]);

  const closeSheet = useCallback(() => {
    setSheetVisible(false);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      openSheet();
    });
    return () => sub.remove();
  }, [openSheet]);

  const unreadCount = useMemo(    () => notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0),
    [notifications],
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void syncAppIconBadge(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    if (!isAuthenticated) {
      void syncAppIconBadge(0);
    }
  }, [isAuthenticated]);

  const value = useMemo(    () => ({
      notifications,
      unreadCount,
      sheetVisible,
      openSheet,
      closeSheet,
      markAllRead,
      refresh,
    }),
    [notifications, unreadCount, sheetVisible, openSheet, closeSheet, markAllRead, refresh],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    return {
      notifications: [] as ActivityNotification[],
      unreadCount: 0,
      sheetVisible: false,
      openSheet: () => undefined,
      closeSheet: () => undefined,
      markAllRead: () => undefined,
      refresh: async () => undefined,
    };
  }
  return ctx;
}
