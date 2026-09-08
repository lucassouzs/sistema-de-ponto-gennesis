'use client';

import { useMemo, useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import {
  OcPurchaseOrdersPanel,
  type OcTab,
} from '@/components/oc/OcPurchaseOrdersPanel';

export function OcApprovalsSection() {
  const { canApproveOcCompras, canApproveOcDiretoria, canApproveOcGestor, ocGestorScopedCostCenterIds } =
    usePermissions();

  const [searchTerm, setSearchTerm] = useState('');

  const visiblePhases = useMemo(() => {
    const phases: OcTab[] = [];
    if (canApproveOcCompras) phases.push('compras');
    if (canApproveOcGestor) phases.push('gestor');
    if (canApproveOcDiretoria) phases.push('diretoria');
    return phases;
  }, [canApproveOcCompras, canApproveOcGestor, canApproveOcDiretoria]);

  if (visiblePhases.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        Você não tem permissão para aprovar ordens de compra nesta tela.
      </div>
    );
  }

  return (
    <div className="w-full space-y-8 scroll-mt-4" id="secao-oc-aprovacoes">
      {visiblePhases.map((tab) => (
        <OcPurchaseOrdersPanel
          key={tab}
          embedded
          hideTabs
          activeTab={tab}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          allowApprovalActions
          gestorCostCenterIds={tab === 'gestor' ? ocGestorScopedCostCenterIds : undefined}
        />
      ))}
    </div>
  );
}
