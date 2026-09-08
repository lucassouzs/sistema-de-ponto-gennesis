'use client';

import { NotificationCountBadge } from '@/components/ui/NotificationCountBadge';
import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';

export type AprovacaoTabId = 'dp' | 'espelho' | 'fd' | 'fuel' | 'rm' | 'oc';

export type AprovacaoTabDef = {
  id: AprovacaoTabId;
  label: string;
  count?: number;
};

export function AprovacoesTabsNav({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: AprovacaoTabDef[];
  activeTab: AprovacaoTabId;
  onTabChange: (tab: AprovacaoTabId) => void;
}) {
  if (tabs.length <= 1) return null;

  return (
    <AppUnderlineTabList aria-label="Abas de aprovações">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const count = tab.count ?? 0;
        return (
          <AppUnderlineTabButton
            key={tab.id}
            active={isActive}
            onClick={() => onTabChange(tab.id)}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm sm:px-4"
          >
            {tab.label}
            {count > 0 ? <NotificationCountBadge count={count} inline /> : null}
          </AppUnderlineTabButton>
        );
      })}
    </AppUnderlineTabList>
  );
}
