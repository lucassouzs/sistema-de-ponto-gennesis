'use client';

import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';

export type BalancoFinanceiroTabId = 'extrato' | 'demonstrativo';

const TABS: ReadonlyArray<{ id: BalancoFinanceiroTabId; label: string }> = [
  { id: 'extrato', label: 'Extrato de Caixa' },
  { id: 'demonstrativo', label: 'Demonstrativo Financeiro' }
];

export function BalancoFinanceiroTabNav({
  activeTab,
  onTabChange
}: {
  activeTab: BalancoFinanceiroTabId;
  onTabChange: (tab: BalancoFinanceiroTabId) => void;
}) {
  return (
    <AppUnderlineTabList aria-label="Abas do balanço financeiro">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <AppUnderlineTabButton
            key={tab.id}
            active={isActive}
            onClick={() => onTabChange(tab.id)}
            className="whitespace-nowrap px-4 py-3 text-sm"
          >
            {tab.label}
          </AppUnderlineTabButton>
        );
      })}
    </AppUnderlineTabList>
  );
}
