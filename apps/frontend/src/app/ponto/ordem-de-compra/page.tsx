'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import {
  OcPurchaseOrdersPanel,
  type OcTab,
  type PurchaseOrder
} from '@/components/oc/OcPurchaseOrdersPanel';
import {
  OcFluxTabsNav,
  isOcUnbUserCostCenter,
  resolveOcFluxDefaultTab,
  resolveOcFluxNavigateTab,
} from '@/components/oc/OcFluxTabsNav';
import { OcGlobalSearch } from '@/components/oc/OcGlobalSearch';
import { computeOcTabCounts } from '@/components/oc/ocTabCounts';

export default function OrdemDeCompraPage() {
  const router = useRouter();
  const { user, isLoading: loadingUser } = usePermissions();
  const isUnbUser = isOcUnbUserCostCenter(
    (user?.employee?.costCenter as string | null | undefined) ?? null
  );
  const [ocTab, setOcTab] = useState<OcTab>(() => resolveOcFluxDefaultTab(isUnbUser));
  const [searchTerm, setSearchTerm] = useState('');

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: ordersData, isLoading: loadingOrders } = useQuery({
    queryKey: ['purchase-orders', 'list-summary'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 500, summary: '1' } });
      return res.data;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const { data: finalizedTotal = 0 } = useQuery({
    queryKey: ['purchase-orders', 'finalized-total'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', {
        params: { status: 'FINALIZED,SENT', page: 1, limit: 1 }
      });
      return Number(res.data?.pagination?.total ?? 0);
    },
    enabled: !!user,
    staleTime: 30_000
  });

  const allOrders: PurchaseOrder[] = ordersData?.data || [];
  const tabCounts = useMemo(() => computeOcTabCounts(allOrders), [allOrders]);

  const displayUser = user || { name: 'Usuário', role: 'EMPLOYEE' as const };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/ordem-de-compra">
        <MainLayout userRole={displayUser.role || 'EMPLOYEE'} userName={displayUser.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/ordem-de-compra">
      <MainLayout userRole={displayUser.role || 'EMPLOYEE'} userName={displayUser.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-gray-100">
              Ordens de Compra
            </h1>
            <p className="mt-2 text-sm text-gray-600 sm:text-base dark:text-gray-400">
              Acompanhe aprovações, pagamentos e o fluxo completo das OCs em um só lugar.
            </p>
          </div>

          <OcGlobalSearch
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onNavigate={(tab) => setOcTab(resolveOcFluxNavigateTab(tab, isUnbUser))}
            orders={allOrders}
          />

          <div className="scroll-mt-4">
            <OcFluxTabsNav
              activeTab={ocTab}
              onActiveTab={setOcTab}
              tabCounts={tabCounts}
              finalizedTotal={finalizedTotal}
            />

            <div className="mt-4">
              <OcPurchaseOrdersPanel
                embedded
                hideTabs
                hideSearch
                activeTab={ocTab}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
              />
            </div>
          </div>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
