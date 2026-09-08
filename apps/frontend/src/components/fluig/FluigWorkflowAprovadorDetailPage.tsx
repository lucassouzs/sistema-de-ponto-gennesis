'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Clock, Search } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { Button } from '@/components/ui/Button';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import api from '@/lib/api';
import {
  findWorkflowApproverBucketByKey,
  formatWorkflowApproverDisplayName,
  mergeWorkflowApproverBuckets,
  resolveWorkflowApproverNameKey,
  type ParsedWorkflowRow,
} from '@/lib/fluigWorkflowApproval';
import { FluigWorkflowRequestDetailModal } from '@/components/fluig/FluigWorkflowRequestDetailModal';
import {
  type ApproverRequestFilter,
  type ApproverRequestListItem,
  APPROVER_FILTER_LIST_CONFIG,
  FilteredApproverRequestList,
  FLUIG_WORKFLOW_DATASETS,
  FluigDatasetToggle,
  useFluigWorkflowApprovalDatasets,
} from '@/components/fluig/fluigWorkflowAprovadoresShared';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePermissions } from '@/hooks/usePermissions';

export function FluigWorkflowAprovadorDetailPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams<{ nameKey: string }>();
  const rawNameKey = params
    ? Array.isArray(params.nameKey)
      ? params.nameKey[0]
      : params.nameKey
    : '';
  const nameKey = resolveWorkflowApproverNameKey(decodeURIComponent(rawNameKey ?? ''));

  const [activeTab, setActiveTab] = useState(0);
  const [cardFilter, setCardFilter] = useState<ApproverRequestFilter>('approved');
  const [detailRow, setDetailRow] = useState<ParsedWorkflowRow | null>(null);

  const {
    canAccessFluigApprover,
    fluigApproverFullAccess,
    isLoading: permissionsLoading,
  } = usePermissions();

  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const user = userData?.data ?? { name: 'Usuário', role: 'EMPLOYEE' as const };

  const { g3Buckets, g5Buckets, bucketsByDataset, rowKeyMapsByDataset, isLoading, hasError, errorMessage } =
    useFluigWorkflowApprovalDatasets({ approverNameKey: nameKey });

  const mergedSummary = useMemo(
    () => mergeWorkflowApproverBuckets(g3Buckets, g5Buckets).find((item) => item.nameKey === nameKey),
    [g3Buckets, g5Buckets, nameKey]
  );

  const availableTabs = useMemo((): number[] => {
    if (!mergedSummary) return [0, 1];
    const tabs: number[] = [];
    if (mergedSummary.inG3) tabs.push(0);
    if (mergedSummary.inG5) tabs.push(1);
    return tabs.length > 0 ? tabs : [0, 1];
  }, [mergedSummary?.inG3, mergedSummary?.inG5, mergedSummary == null]);

  const effectiveTab = availableTabs.includes(activeTab) ? activeTab : availableTabs[0];
  const datasetId = FLUIG_WORKFLOW_DATASETS[effectiveTab]?.id ?? FLUIG_WORKFLOW_DATASETS[0].id;

  const activeBucket = useMemo(() => {
    const buckets = bucketsByDataset[effectiveTab] ?? [];
    return findWorkflowApproverBucketByKey(buckets, nameKey);
  }, [bucketsByDataset, effectiveTab, nameKey]);

  const provisionalDisplayName = useMemo(
    () => formatWorkflowApproverDisplayName(rawNameKey),
    [rawNameKey]
  );

  const displayName =
    mergedSummary?.name ?? activeBucket?.name ?? provisionalDisplayName;

  useDocumentTitle(`Aprovadores - ${displayName}`);

  const approvedRequests = activeBucket?.approvedRequests ?? [];
  const pendingRequests = activeBucket?.pendingRequests ?? [];

  const stats = useMemo(() => {
    if (!activeBucket) {
      return { total: 0, approved: 0, pending: 0 };
    }
    return {
      total: activeBucket.approvedCount + activeBucket.pendingCount,
      approved: activeBucket.approvedCount,
      pending: activeBucket.pendingCount,
    };
  }, [activeBucket]);

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0]);
    }
  }, [availableTabs, activeTab]);

  const handleDatasetTabChange = (tab: number) => {
    setActiveTab(tab);
    setCardFilter('approved');
    setDetailRow(null);
  };

  const handleOpenRequest = useCallback(
    (item: ApproverRequestListItem) => {
      const row = rowKeyMapsByDataset[effectiveTab]?.get(item.rowKey);
      if (row) setDetailRow(row);
    },
    [rowKeyMapsByDataset, effectiveTab]
  );

  const listHeader = APPROVER_FILTER_LIST_CONFIG[cardFilter];
  const ListHeaderIcon = listHeader.Icon;

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['fluig-workflow-approval'] });
  };

  useLayoutEffect(() => {
    if (permissionsLoading) return;
    if (!canAccessFluigApprover(nameKey)) {
      router.replace('/ponto/fluig/aprovadores');
    }
  }, [permissionsLoading, canAccessFluigApprover, nameKey, router]);

  if (permissionsLoading || (!permissionsLoading && !canAccessFluigApprover(nameKey))) {
    return null;
  }

  return (
    <ProtectedRoute route="/ponto/fluig/aprovadores">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
            {fluigApproverFullAccess ? (
              <Link
                href="/ponto/fluig/aprovadores"
                aria-label="Voltar para aprovadores"
                className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                Voltar
              </Link>
            ) : null}
            <div className="w-full max-w-3xl px-14 text-center sm:px-20">
              <h1 className="break-words text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
                {displayName}
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
                Solicitações aprovadas e pendentes com esta pessoa
              </p>
            </div>
          </div>

          {hasError && !isLoading ? (
            <Card className="w-full">
              <CardContent className="py-10 text-center">
                <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
                <Button type="button" className="mt-4" onClick={refetch}>
                  Tentar novamente
                </Button>
              </CardContent>
            </Card>
          ) : !isLoading && !mergedSummary && !activeBucket ? (
            <Card className="w-full">
              <CardContent className="py-10 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Aprovador não encontrado nos dados do Fluig.
                </p>
                <Button type="button" className="mt-4" onClick={() => router.push('/ponto/fluig/aprovadores')}>
                  Voltar para a lista
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {!isLoading ? (
                <FluigDatasetToggle
                  activeTab={effectiveTab}
                  onChange={handleDatasetTabChange}
                  availableTabs={availableTabs}
                />
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
                <FilterStatCard
                  label="Aprovados"
                  count={stats.approved}
                  icon={CheckCircle2}
                  iconBg="bg-green-100 dark:bg-green-900/30"
                  iconColor="text-green-600 dark:text-green-400"
                  isActive={cardFilter === 'approved'}
                  loading={isLoading}
                  onClick={() => setCardFilter('approved')}
                />
                <FilterStatCard
                  label="Pendentes"
                  count={stats.pending}
                  icon={Clock}
                  iconBg="bg-amber-100 dark:bg-amber-900/30"
                  iconColor="text-amber-600 dark:text-amber-400"
                  isActive={cardFilter === 'pending'}
                  loading={isLoading}
                  onClick={() => setCardFilter('pending')}
                />
              </div>

              {isLoading ? (
                <Card className={cadastroListClasses.card}>
                  <CardHeader className={cadastroListClasses.cardHeader}>
                    <div className={cadastroListClasses.cardHeaderRow}>
                      <div className={cadastroListClasses.cardHeaderIconRow}>
                        <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                          <ListHeaderIcon
                            className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`}
                          />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {listHeader.title}
                          </h3>
                        </div>
                      </div>
                      <div className={cadastroListClasses.cardToolbar}>
                        <div className="relative min-w-[240px] flex-1 sm:w-[320px] sm:flex-none">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                          <input
                            type="search"
                            disabled
                            placeholder="Buscar ID, título, etapa..."
                            className="h-10 w-full cursor-not-allowed rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 opacity-60 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                          />
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className={cadastroListClasses.cardContent}>
                    <CadastroListLoading message="Carregando solicitações..." />
                  </CardContent>
                </Card>
              ) : (
                <FilteredApproverRequestList
                  filter={cardFilter}
                  datasetId={datasetId}
                  approvedRequests={approvedRequests}
                  pendingRequests={pendingRequests}
                  onRowClick={handleOpenRequest}
                  exportName={displayName}
                />
              )}
            </>
          )}
        </div>

        <FluigWorkflowRequestDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
      </MainLayout>
    </ProtectedRoute>
  );
}
