'use client';

import { NotificationCountBadge } from '@/components/ui/NotificationCountBadge';
import { AppTabButton } from '@/components/ui/AppTabButton';

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
    <nav
      className="-mb-px flex flex-wrap justify-center gap-x-1 gap-y-2 overflow-x-auto py-3 sm:gap-x-2"
      aria-label="Abas de aprovações"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const count = tab.count ?? 0;
        return (
          <AppTabButton
            key={tab.id}
            active={isActive}
            onClick={() => onTabChange(tab.id)}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap px-3 py-2 text-sm font-medium sm:px-4"
          >
            {tab.label}
            {count > 0 ? (
              <span className="app-tab__badge">
                <NotificationCountBadge count={count} inline />
              </span>
            ) : null}
          </AppTabButton>
        );
      })}
    </nav>
  );
}
