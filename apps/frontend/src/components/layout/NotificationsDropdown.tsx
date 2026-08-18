'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  Bell,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  FileCheck,
  FileText,
  Fuel,
  MessageCircle,
  Package,
  PackageCheck,
  PackageX,
  Shield,
  ShoppingCart,
  Truck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { useApprovalNotificationCounts } from '@/hooks/useApprovalNotificationCounts';
import { useFdNotificationCounts } from '@/hooks/useFdNotificationCounts';
import { usePermissions } from '@/hooks/usePermissions';
import { visibleTabRefetchInterval } from '@/hooks/useVisibleTabRefetchInterval';
import { NotificationCountBadge } from '@/components/ui/NotificationCountBadge';

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  count: number;
  href: string;
  Icon: LucideIcon;
};

type NotificationsDropdownProps = {
  chatUnreadCount?: number;
};

export function NotificationsDropdown({ chatUnreadCount = 0 }: NotificationsDropdownProps) {
  const {
    isLoading: permissionsLoading,
    isAdministrator,
    isDepartmentCompras,
    can,
    canAccessDpApproverPages,
    canApproveEspelhoNf,
    canApproveFuel,
    canApproveOc,
    canApproveMaterialRequests,
    canAccessRecebimentoEntregasRoutePage,
  } = usePermissions();
  const { counts, isLoading: approvalsLoading } = useApprovalNotificationCounts();
  const { counts: fdNotificationCounts } = useFdNotificationCounts();

  const canSeeFuroEstoque =
    isAdministrator || isDepartmentCompras || can(pathToModuleKey('/ponto/furo-estoque'));
  const canSeeFuelSupplies =
    isAdministrator ||
    isDepartmentCompras ||
    can(pathToModuleKey('/ponto/solicitacoes-combustivel'));
  const canSeeVehicleReservationSupplies =
    isAdministrator ||
    isDepartmentCompras ||
    can(pathToModuleKey('/ponto/solicitacoes-reserva-veiculos'));
  const canSeeEntregaLogistica =
    isAdministrator || can(pathToModuleKey('/ponto/entrega-logistica'));
  const canSeeFdAprovadas =
    isAdministrator ||
    isDepartmentCompras ||
    can(pathToModuleKey('/ponto/fds-aprovadas'));

  const canSeeGestaoOs =
    isAdministrator ||
    can(pathToModuleKey('/ponto/sistema-gestao-os')) ||
    can(pathToModuleKey('/ponto/meus-chamados')) ||
    can(pathToModuleKey('/ponto/sistema-gestao-os/planos'));

  const { data: gestaoOsInbox } = useQuery({
    queryKey: ['gestao-os-inbox'],
    queryFn: async () => {
      const res = await api.get('/gestao-os/inbox');
      return (res.data?.data ?? null) as {
        assignedCount: number;
        slaOverdueCount: number;
        slaWarningCount: number;
        overduePlansCount: number;
        warrantyExpiringCount: number;
        warrantyExpiredCount: number;
      } | null;
    },
    enabled: !permissionsLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const { data: pendingFuroCount = 0 } = useQuery({
    queryKey: ['stock-shortfalls-pending-count'],
    queryFn: async () => {
      const res = await api.get('/stock/shortfalls/pending-count');
      const n = Number(res.data?.count ?? res.data?.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canSeeFuroEstoque && !permissionsLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const { data: recebimentoPendingCount = 0 } = useQuery({
    queryKey: ['material-deliveries-recebimento-pending-count'],
    queryFn: async () => {
      const res = await api.get('/material-deliveries/summary', {
        params: { forRecebimento: 'true' },
      });
      const n = Number(res.data?.data?.awaitingEngineering ?? 0);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canAccessRecebimentoEntregasRoutePage && !permissionsLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const { data: fuelSuppliesPendingCount = 0 } = useQuery({
    queryKey: ['fuel-supplies-pending-count'],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests/supplies-pending-count');
      const n = Number(res.data?.data?.count ?? res.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canSeeFuelSupplies && !permissionsLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const { data: vehicleReservationSuppliesPendingCount = 0 } = useQuery({
    queryKey: ['vehicle-reservation-supplies-pending-count'],
    queryFn: async () => {
      const res = await api.get('/vehicle-reservations/supplies-pending-count');
      const n = Number(res.data?.data?.count ?? res.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canSeeVehicleReservationSupplies && !permissionsLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const { data: entregaLogisticaPendingCount = 0 } = useQuery({
    queryKey: ['logistics-delivery-pending-count'],
    queryFn: async () => {
      const res = await api.get('/logistics-delivery-requests/pending-count');
      const n = Number(res.data?.data?.count ?? res.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canSeeEntregaLogistica && !permissionsLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const items = useMemo((): NotificationItem[] => {
    const list: NotificationItem[] = [];

    if (canAccessDpApproverPages && counts.dp > 0) {
      list.push({
        id: 'dp',
        title: 'Solicitações',
        description: 'Pendentes de aprovação do DP',
        count: counts.dp,
        href: '/ponto/aprovacoes?tab=dp',
        Icon: ClipboardList,
      });
    }
    if (canApproveEspelhoNf && counts.espelho > 0) {
      list.push({
        id: 'espelho',
        title: 'Espelhos da NF',
        description: 'Aguardando aprovação',
        count: counts.espelho,
        href: '/ponto/aprovacoes?tab=espelho',
        Icon: FileText,
      });
    }
    if (canAccessDpApproverPages && counts.fd > 0) {
      list.push({
        id: 'fd',
        title: 'Fichas de Demanda',
        description: 'Pendentes de decisão',
        count: counts.fd,
        href: '/ponto/aprovacoes?tab=fd',
        Icon: FileCheck,
      });
    }
    if (canApproveFuel && counts.fuel > 0) {
      list.push({
        id: 'fuel',
        title: 'Combustível',
        description: 'Solicitações pendentes',
        count: counts.fuel,
        href: '/ponto/aprovacoes?tab=fuel',
        Icon: Fuel,
      });
    }
    if (canApproveMaterialRequests && counts.rm > 0) {
      list.push({
        id: 'rm',
        title: 'Requisições de Materiais',
        description: 'Aguardando aprovação',
        count: counts.rm,
        href: '/ponto/aprovacoes?tab=rm',
        Icon: Package,
      });
    }
    if (canApproveOc && counts.oc > 0) {
      list.push({
        id: 'oc',
        title: 'Ordens de Compra',
        description: 'Pendentes de aprovação',
        count: counts.oc,
        href: '/ponto/aprovacoes?tab=oc',
        Icon: ShoppingCart,
      });
    }
    if (canSeeFdAprovadas && fdNotificationCounts.pendingPurchase > 0) {
      list.push({
        id: 'fd-compras',
        title: "FD's Aprovadas",
        description: 'Pendentes em compras',
        count: fdNotificationCounts.pendingPurchase,
        href: '/ponto/fds-aprovadas',
        Icon: FileCheck,
      });
    }
    if (canSeeFuroEstoque && pendingFuroCount > 0) {
      list.push({
        id: 'furo-estoque',
        title: 'Furo de Estoque',
        description: 'Pendências de entrega',
        count: pendingFuroCount,
        href: '/ponto/furo-estoque',
        Icon: PackageX,
      });
    }
    if (canAccessRecebimentoEntregasRoutePage && recebimentoPendingCount > 0) {
      list.push({
        id: 'recebimento',
        title: 'Recebimento de Entregas',
        description: 'Aguardando confirmação',
        count: recebimentoPendingCount,
        href: '/ponto/recebimento-entregas',
        Icon: PackageCheck,
      });
    }
    if (canSeeFuelSupplies && fuelSuppliesPendingCount > 0) {
      list.push({
        id: 'fuel-supplies',
        title: 'Solicitações de Combustível',
        description: 'Abastecimentos pendentes',
        count: fuelSuppliesPendingCount,
        href: '/ponto/solicitacoes-combustivel',
        Icon: Fuel,
      });
    }
    if (canSeeVehicleReservationSupplies && vehicleReservationSuppliesPendingCount > 0) {
      list.push({
        id: 'vehicle-supplies',
        title: 'Reservas de Veículos',
        description: 'Solicitações pendentes',
        count: vehicleReservationSuppliesPendingCount,
        href: '/ponto/solicitacoes-reserva-veiculos',
        Icon: CalendarRange,
      });
    }
    if (canSeeEntregaLogistica && entregaLogisticaPendingCount > 0) {
      list.push({
        id: 'entrega-logistica',
        title: 'Entrega da Logística',
        description: 'Pendentes de finalização',
        count: entregaLogisticaPendingCount,
        href: '/ponto/entrega-logistica',
        Icon: Truck,
      });
    }
    if (chatUnreadCount > 0) {
      list.push({
        id: 'chat',
        title: 'Conversas',
        description: 'Mensagens não lidas',
        count: chatUnreadCount,
        href: '/ponto/conversas',
        Icon: MessageCircle,
      });
    }

    const assignedCount = gestaoOsInbox?.assignedCount ?? 0;
    const slaOverdueCount = gestaoOsInbox?.slaOverdueCount ?? 0;
    const slaWarningCount = gestaoOsInbox?.slaWarningCount ?? 0;
    const overduePlansCount = gestaoOsInbox?.overduePlansCount ?? 0;
    const warrantyCount =
      (gestaoOsInbox?.warrantyExpiredCount ?? 0) + (gestaoOsInbox?.warrantyExpiringCount ?? 0);
    const osHomeHref = canSeeGestaoOs
      ? '/ponto/sistema-gestao-os'
      : '/ponto/meus-chamados';
    if (assignedCount > 0) {
      list.push({
        id: 'gestao-os-assigned',
        title: 'OS atribuídas',
        description: 'Chamados sob sua responsabilidade',
        count: assignedCount,
        href: osHomeHref,
        Icon: Wrench,
      });
    }
    if (slaOverdueCount > 0) {
      list.push({
        id: 'gestao-os-sla-overdue',
        title: 'SLA atrasado',
        description: 'OS fora do prazo',
        count: slaOverdueCount,
        href: canSeeGestaoOs ? '/ponto/sistema-gestao-os?overdue=1' : '/ponto/meus-chamados',
        Icon: Wrench,
      });
    }
    if (slaWarningCount > 0) {
      list.push({
        id: 'gestao-os-sla-warning',
        title: 'SLA no fim do prazo',
        description: 'OS próximas do estouro',
        count: slaWarningCount,
        href: osHomeHref,
        Icon: Wrench,
      });
    }
    if (overduePlansCount > 0) {
      list.push({
        id: 'gestao-os-plans',
        title: 'Planos vencidos',
        description: 'Preventivas / PMOC em atraso',
        count: overduePlansCount,
        href: '/ponto/sistema-gestao-os/planos',
        Icon: CalendarClock,
      });
    }
    if (warrantyCount > 0) {
      list.push({
        id: 'gestao-os-warranty',
        title: 'Garantia de ativos',
        description: 'Vencidas ou a vencer em 30 dias',
        count: warrantyCount,
        href: '/ponto/sistema-gestao-os/locais',
        Icon: Shield,
      });
    }

    return list;
  }, [
    canAccessDpApproverPages,
    canApproveEspelhoNf,
    canApproveFuel,
    canApproveOc,
    canApproveMaterialRequests,
    canSeeFdAprovadas,
    canSeeFuroEstoque,
    canAccessRecebimentoEntregasRoutePage,
    canSeeFuelSupplies,
    canSeeVehicleReservationSupplies,
    canSeeEntregaLogistica,
    counts,
    fdNotificationCounts.pendingPurchase,
    pendingFuroCount,
    recebimentoPendingCount,
    fuelSuppliesPendingCount,
    vehicleReservationSuppliesPendingCount,
    entregaLogisticaPendingCount,
    chatUnreadCount,
    gestaoOsInbox,
  ]);

  const badgeTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.count, 0),
    [items],
  );

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: Math.round(rect.bottom + 8),
      right: Math.round(window.innerWidth - rect.right),
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const handleReposition = () => updatePos();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, updatePos]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Notificações${badgeTotal > 0 ? `, ${badgeTotal} pendentes` : ''}`}
        title="Notificações"
        onClick={() => setOpen((v) => !v)}
        className="notif-bell-btn relative flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200/80 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <Bell className="notif-bell-btn__icon h-5 w-5" />
        <NotificationCountBadge count={badgeTotal} rail />
      </button>

      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              aria-hidden="true"
              onClick={() => setOpen(false)}
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Notificações"
              data-app-topnav
              style={{
                position: 'fixed',
                top: pos.top,
                right: pos.right,
                zIndex: 9999,
              }}
              className="app-popover-panel flex w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Notificações
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {badgeTotal > 0
                    ? `${badgeTotal} pendente${badgeTotal === 1 ? '' : 's'}`
                    : 'Tudo em dia'}
                </p>
              </div>

              <div className="max-h-[min(24rem,70vh)] overflow-y-auto overscroll-contain">
                {approvalsLoading && items.length === 0 ? (
                  <div className="space-y-2 p-3">
                    {Array.from({ length: 3 }, (_, i) => (
                      <div
                        key={i}
                        className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700/60"
                      />
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500">
                      <Bell className="h-5 w-5" />
                    </span>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      Nenhuma notificação
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Quando houver pendências, elas aparecem aqui.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700/80">
                    {items.map((item) => {
                      const Icon = item.Icon;
                      return (
                        <li key={item.id}>
                          <Link
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {item.title}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                                {item.description}
                              </span>
                            </span>
                            <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center self-center rounded-md bg-red-600 px-1 text-[10px] font-bold text-white">
                              {item.count > 99 ? '99+' : item.count}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
