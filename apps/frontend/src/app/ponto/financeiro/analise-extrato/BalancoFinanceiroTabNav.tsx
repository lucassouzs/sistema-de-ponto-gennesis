'use client';

import { AppTabButton } from '@/components/ui/AppTabButton';

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
    <nav
      className="flex flex-wrap justify-center gap-x-1 gap-y-2 overflow-x-auto py-3"
      aria-label="Abas do balanço financeiro"
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <AppTabButton
            key={tab.id}
            active={isActive}
            onClick={() => onTabChange(tab.id)}
            className="whitespace-nowrap px-4 py-3 text-sm font-medium"
          >
            {tab.label}
          </AppTabButton>
        );
      })}
    </nav>
  );
}
