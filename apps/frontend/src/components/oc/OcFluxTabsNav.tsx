'use client';

import { useEffect, useMemo } from 'react';
import { TabCountBadge } from '@/components/ui/TabCountBadge';
import { AppTabButton } from '@/components/ui/AppTabButton';
import { usePermissions } from '@/hooks/usePermissions';
import {
  isUnbCostCenter,
  persistUnbBranding,
  readStoredUnbBranding,
} from '@/lib/unbBranding';
import type { OcTab } from './OcPurchaseOrdersPanel';

export type OcTabCounts = {
  compras: number;
  gestor: number;
  diretoria: number;
  IN_REVIEW: number;
  APPROVED: number;
  ATTACH_BOLETO: number;
  PROOF_VALIDATION: number;
  PROOF_CORRECTION: number;
  ATTACH_NF: number;
  outras: number;
};

export const OC_FLUX_DEFAULT_TAB: OcTab = 'compras';
export const OC_FLUX_DEFAULT_TAB_UNB: OcTab = 'gestor';

/** Abas ocultas quando o centro de custo do usuário é UNB. */
export const OC_UNB_HIDDEN_TABS: readonly OcTab[] = ['compras', 'diretoria'];

const OC_FLUX_TABS: ReadonlyArray<{
  id: OcTab;
  label: string;
  countKey: keyof OcTabCounts | 'FINALIZADAS';
}> = [
  { id: 'compras', label: 'Aprovação Compras', countKey: 'compras' },
  { id: 'gestor', label: 'Aprovação Gestor', countKey: 'gestor' },
  { id: 'diretoria', label: 'Aprovação Diretoria', countKey: 'diretoria' },
  { id: 'ATTACH_BOLETO', label: 'Anexar Boleto', countKey: 'ATTACH_BOLETO' },
  { id: 'APPROVED', label: 'Pagamento', countKey: 'APPROVED' },
  { id: 'PROOF_VALIDATION', label: 'Validação Comprovante', countKey: 'PROOF_VALIDATION' },
  { id: 'PROOF_CORRECTION', label: 'Correção Comprovante', countKey: 'PROOF_CORRECTION' },
  { id: 'ATTACH_NF', label: 'Anexar NF', countKey: 'ATTACH_NF' },
  { id: 'FINALIZADAS', label: 'Finalizadas', countKey: 'FINALIZADAS' },
  { id: 'IN_REVIEW', label: 'Correção', countKey: 'IN_REVIEW' },
  { id: 'outras', label: 'Canceladas', countKey: 'outras' }
];

export function isOcUnbUserCostCenter(costCenter?: string | null): boolean {
  if (costCenter != null && costCenter !== '') {
    return isUnbCostCenter(costCenter);
  }
  if (typeof window === 'undefined') return false;
  return readStoredUnbBranding();
}

export function resolveOcFluxDefaultTab(isUnbUser: boolean): OcTab {
  return isUnbUser ? OC_FLUX_DEFAULT_TAB_UNB : OC_FLUX_DEFAULT_TAB;
}

export function isOcFluxTabVisible(tab: OcTab, isUnbUser: boolean): boolean {
  if (!isUnbUser) return true;
  return !OC_UNB_HIDDEN_TABS.includes(tab);
}

export function resolveOcFluxNavigateTab(tab: OcTab, isUnbUser: boolean): OcTab {
  return isOcFluxTabVisible(tab, isUnbUser) ? tab : OC_FLUX_DEFAULT_TAB_UNB;
}

export function OcFluxTabsNav({
  activeTab,
  onActiveTab,
  tabCounts,
  finalizedTotal
}: {
  activeTab: OcTab;
  onActiveTab: (tab: OcTab) => void;
  tabCounts: OcTabCounts;
  finalizedTotal: number;
}) {
  const { user } = usePermissions();
  const costCenter = user?.employee?.costCenter as string | null | undefined;
  const isUnbUser = isOcUnbUserCostCenter(costCenter);

  useEffect(() => {
    if (costCenter != null && costCenter !== '') {
      persistUnbBranding(costCenter);
    }
  }, [costCenter]);

  useEffect(() => {
    if (!isOcFluxTabVisible(activeTab, isUnbUser)) {
      onActiveTab(OC_FLUX_DEFAULT_TAB_UNB);
    }
  }, [activeTab, isUnbUser, onActiveTab]);

  const visibleTabs = useMemo(
    () => OC_FLUX_TABS.filter((tab) => isOcFluxTabVisible(tab.id, isUnbUser)),
    [isUnbUser]
  );

  const countFor = (key: keyof OcTabCounts | 'FINALIZADAS') =>
    key === 'FINALIZADAS' ? finalizedTotal : tabCounts[key];

  return (
    <div id="secao-fluxo-oc-tabs" className="scroll-mt-4">
      <div className="px-2 bg-transparent">
        <nav className="-mb-px flex flex-wrap justify-center gap-x-1 gap-y-2 overflow-x-auto py-3 sm:gap-x-2">
          {visibleTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <AppTabButton
                key={tab.id}
                active={active}
                onClick={() => onActiveTab(tab.id)}
                className="flex items-center gap-2 whitespace-nowrap px-2 py-2 text-xs font-medium sm:px-3 sm:text-sm"
              >
                {tab.label}
                <span className="app-tab__badge">
                  <TabCountBadge count={countFor(tab.countKey)} active={active} tone="red" />
                </span>
              </AppTabButton>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
