'use client';

import React from 'react';
import {
  Clock,
  Cloud,
  HardDrive,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';

export type DriveSidebarView =
  | 'meu-drive'
  | 'shared'
  | 'recent'
  | 'starred'
  | 'trash';

type StorageInfo = {
  usedBytes: number;
};

type Props = {
  activeView: DriveSidebarView;
  onChangeView: (view: DriveSidebarView) => void;
  storage?: StorageInfo;
  storageLoading?: boolean;
};

function formatUsed(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 ** 2);
  if (mb < 1024) {
    return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
  }
  const gb = bytes / (1024 ** 3);
  return `${gb.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`;
}

const NAV: Array<{
  id: DriveSidebarView;
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}> = [
  { id: 'meu-drive', label: 'Meu Drive', Icon: HardDrive },
  { id: 'shared', label: 'Compartilhados comigo', Icon: Share2 },
  { id: 'recent', label: 'Recentes', Icon: Clock },
  { id: 'starred', label: 'Com estrela', Icon: Star },
  { id: 'trash', label: 'Lixeira', Icon: Trash2 },
];

export function DriveSidebar({
  activeView,
  onChangeView,
  storage,
  storageLoading,
}: Props) {
  const used = storage?.usedBytes ?? 0;

  return (
    <aside className="flex w-full shrink-0 flex-col lg:sticky lg:top-4 lg:w-52 lg:self-start">
      <nav
        className="-mx-1 flex gap-0.5 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
        aria-label="Navegação do Drive"
      >
        {NAV.map(({ id, label, Icon }) => {
          const active = activeView === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChangeView(id)}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors lg:w-full ${
                active
                  ? 'bg-red-50 font-medium text-red-700 dark:bg-red-900/20 dark:text-red-500'
                  : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              <Icon
                strokeWidth={1.75}
                className={`h-4 w-4 shrink-0 ${
                  active
                    ? 'text-red-600 dark:text-red-500'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              />
              <span className="whitespace-nowrap leading-none">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-5 hidden border-t border-gray-200 pt-5 dark:border-gray-700 lg:block">
        <div className="flex items-center gap-3 rounded-xl px-2.5 py-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/40">
            <Cloud className="h-4 w-4 text-red-600 dark:text-red-400" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400">Armazenamento</p>
            {storageLoading ? (
              <div className="mt-1.5 h-3.5 w-16 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            ) : (
              <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {formatUsed(used)}
                <span className="ml-1 font-normal text-gray-500 dark:text-gray-400">
                  usados
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
