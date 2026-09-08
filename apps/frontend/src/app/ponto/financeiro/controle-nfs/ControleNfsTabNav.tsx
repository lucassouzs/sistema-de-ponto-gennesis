'use client';

import type { ControleNfsTab } from './controleNfsTypes';
import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';

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
    <AppUnderlineTabList aria-label="Abas do controle de notas fiscais">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <AppUnderlineTabButton
            key={tab.key}
            active={isActive}
            onClick={() => onTabChange(tab.key)}
            className="whitespace-nowrap px-4 py-3 text-sm"
          >
            {tab.label}
          </AppUnderlineTabButton>
        );
      })}
    </AppUnderlineTabList>
  );
}
