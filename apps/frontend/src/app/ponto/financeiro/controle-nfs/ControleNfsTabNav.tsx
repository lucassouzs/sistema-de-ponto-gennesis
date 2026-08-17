'use client';

import type { ControleNfsTab } from './controleNfsTypes';
import { AppTabButton } from '@/components/ui/AppTabButton';

export function ControleNfsTabNav({
  tabs,
  activeTab,
  onTabChange
}: {
  tabs: ControleNfsTab[];
  activeTab: string;
  onTabChange: (tabKey: string) => void;
}) {
  return (
    <nav
      className="flex flex-wrap justify-center gap-x-1 gap-y-2 overflow-x-auto py-3"
      aria-label="Abas do controle de notas fiscais"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <AppTabButton
            key={tab.key}
            active={isActive}
            onClick={() => onTabChange(tab.key)}
            className="whitespace-nowrap px-4 py-3 text-sm font-medium"
          >
            {tab.label}
          </AppTabButton>
        );
      })}
    </nav>
  );
}
