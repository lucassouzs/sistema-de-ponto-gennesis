'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { resolveEspelhoApprovalStatus } from '@/lib/espelhoNfApproval';
import { visibleTabRefetchInterval } from '@/hooks/useVisibleTabRefetchInterval';

export type ApprovalNotificationCounts = {
  dp: number;
  espelho: number;
  fd: number;
  fuel: number;
  oc: number;
  rm: number;
  total: number;
};

const emptyCounts: ApprovalNotificationCounts = {
  dp: 0,
  espelho: 0,
  fd: 0,
  fuel: 0,
  oc: 0,
  rm: 0,
  total: 0,
};

export function useApprovalNotificationCounts() {
  const {
    isLoading,
    canAccessDpApproverPages,
    canApproveEspelhoNf,
    canApproveFuel,
    canApproveOc,
    canApproveMaterialRequests,
  } = usePermissions();

  const canFetch =
    canAccessDpApproverPages ||
    canApproveEspelhoNf ||
    canApproveFuel ||
    canApproveOc ||
    canApproveMaterialRequests;
  const enabled = !isLoading && canFetch;

  const mainQuery = useQuery({
    queryKey: ['approval-notification-counts'],
    queryFn: async () => {
      const res = await api.get('/approvals/notification-counts');
      const data = res.data?.data as Partial<ApprovalNotificationCounts> & {
        espelhoMirrors?: number;
      };
      return {
        dp: Number(data?.dp ?? 0) || 0,
        fd: Number(data?.fd ?? 0) || 0,
        fuel: Number(data?.fuel ?? 0) || 0,
        oc: Number(data?.oc ?? 0) || 0,
        rm: Number(data?.rm ?? 0) || 0,
        espelhoMirrors: Number(data?.espelhoMirrors ?? 0) || 0,
      };
    },
    enabled,
    refetchInterval: () => visibleTabRefetchInterval(30_000),
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const espelhoQuery = useQuery({
    queryKey: ['approval-notification-counts', 'espelho'],
    enabled: enabled && canApproveEspelhoNf,
    queryFn: async () => {
      const res = await api.get('/espelho-nf/bootstrap');
      const mirrors = Array.isArray(res.data?.data?.mirrors) ? res.data.data.mirrors : [];
      return mirrors.filter(
        (m: { id?: string; approvalStatus?: string | null }) =>
          resolveEspelhoApprovalStatus(String(m.id ?? ''), m.approvalStatus) ===
          'PENDING_APPROVAL',
      ).length;
    },
    refetchInterval: () => visibleTabRefetchInterval(30_000),
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  const counts = useMemo((): ApprovalNotificationCounts => {
    const base = mainQuery.data;
    const espelho = canApproveEspelhoNf ? (espelhoQuery.data ?? 0) : 0;
    const dp = canAccessDpApproverPages ? (base?.dp ?? 0) : 0;
    const fd = canAccessDpApproverPages ? (base?.fd ?? 0) : 0;
    const fuel = canApproveFuel ? (base?.fuel ?? 0) : 0;
    const oc = canApproveOc ? (base?.oc ?? 0) : 0;
    const rm = canApproveMaterialRequests ? (base?.rm ?? 0) : 0;
    const total = dp + espelho + fd + fuel + oc + rm;
    return { dp, espelho, fd, fuel, oc, rm, total };
  }, [
    mainQuery.data,
    espelhoQuery.data,
    canAccessDpApproverPages,
    canApproveEspelhoNf,
    canApproveFuel,
    canApproveOc,
    canApproveMaterialRequests,
  ]);

  return {
    counts: enabled ? counts : emptyCounts,
    isLoading: mainQuery.isLoading || (canApproveEspelhoNf && espelhoQuery.isLoading),
    refetch: async () => {
      await Promise.all([mainQuery.refetch(), espelhoQuery.refetch()]);
    },
  };
}
