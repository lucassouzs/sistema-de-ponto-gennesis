'use client';

import React from 'react';
import { Check, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import { DriveMimeIcon } from '@/components/drive/DriveMimeIcon';

export type DriveUploadStatus =
  | 'queued'
  | 'uploading'
  | 'finalizing'
  | 'done'
  | 'error'
  | 'cancelled';

export interface DriveUploadItem {
  id: string;
  name: string;
  size: number;
  loaded: number;
  progress: number;
  status: DriveUploadStatus;
  error?: string;
  startedAt: number;
  speedBps?: number;
}

function formatRemaining(item: DriveUploadItem): string {
  if (item.status === 'finalizing') return 'Salvando na nuvem…';
  if (item.status === 'queued') return 'Na fila…';
  if (item.status === 'done') return 'Concluído';
  if (item.status === 'cancelled') return 'Cancelado';
  if (item.status === 'error') return item.error || 'Falha no envio';

  const loaded = item.loaded;
  const total = item.size || 0;
  if (total <= 0 || loaded <= 0) return 'Calculando…';

  const elapsedMs = Math.max(1, Date.now() - item.startedAt);
  const speed = item.speedBps && item.speedBps > 0 ? item.speedBps : loaded / (elapsedMs / 1000);
  if (!speed || speed <= 0) return 'Calculando…';

  const remainingBytes = Math.max(0, total - loaded);
  const seconds = remainingBytes / speed;
  if (!Number.isFinite(seconds) || seconds < 0) return 'Calculando…';
  if (seconds < 5) return 'Quase lá…';
  if (seconds < 60) return `Restam ${Math.ceil(seconds)} s…`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `Restam ${minutes} min…`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin > 0 ? `Restam ${hours} h ${remMin} min…` : `Restam ${hours} h…`;
}

interface DriveUploadPanelProps {
  items: DriveUploadItem[];
  minimized: boolean;
  onToggleMinimized: () => void;
  onClose: () => void;
  onCancelAll: () => void;
  onCancelItem: (id: string) => void;
}

export function DriveUploadPanel({
  items,
  minimized,
  onToggleMinimized,
  onClose,
  onCancelAll,
  onCancelItem,
}: DriveUploadPanelProps) {
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    const hasActive = items.some(
      (i) => i.status === 'uploading' || i.status === 'finalizing' || i.status === 'queued',
    );
    if (!hasActive) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [items]);

  if (items.length === 0) return null;

  const active = items.filter(
    (i) => i.status === 'uploading' || i.status === 'finalizing' || i.status === 'queued',
  );
  const allDone = items.every((i) => i.status === 'done');
  const headerLabel =
    active.length > 0
      ? `Fazendo upload de ${active.length} item${active.length === 1 ? '' : 's'}`
      : allDone
        ? `${items.length} upload${items.length === 1 ? '' : 's'} concluído${items.length === 1 ? '' : 's'}`
        : 'Uploads';

  const primaryActive = active[0];
  const canCancel = active.length > 0;
  const listNeedsScroll = items.length > 4;

  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-50 w-[min(100vw-2rem,340px)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
          {headerLabel}
        </p>
        <button
          type="button"
          onClick={onToggleMinimized}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          aria-label={minimized ? 'Expandir' : 'Minimizar'}
        >
          {minimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!minimized && (
        <div className="overflow-hidden border-t border-gray-100 px-3 pb-3 pt-2 dark:border-gray-800">
          {canCancel && primaryActive && (
            <div className="mb-2.5 flex h-5 items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {formatRemaining(primaryActive)}
              </p>
              <button
                type="button"
                onClick={onCancelAll}
                className="shrink-0 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                Cancelar
              </button>
            </div>
          )}

          <ul
            className={`space-y-2.5 overflow-x-hidden ${
              listNeedsScroll ? 'max-h-52 overflow-y-auto' : 'overflow-y-hidden'
            }`}
          >
            {items.map((item) => {
              const inFlight =
                item.status === 'uploading' ||
                item.status === 'finalizing' ||
                item.status === 'queued';

              return (
                <li key={item.id} className="flex min-w-0 items-center gap-2.5 overflow-hidden">
                  <span className="shrink-0">
                    <DriveMimeIcon fileName={item.name} className="h-7 w-7" />
                  </span>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p
                      className="block truncate text-sm text-gray-700 dark:text-gray-200"
                      title={item.name}
                    >
                      {item.name}
                    </p>
                    {item.status === 'error' && (
                      <p className="truncate text-[11px] text-red-600 dark:text-red-400">
                        {item.error || 'Falha no envio'}
                      </p>
                    )}
                    {item.status === 'cancelled' && (
                      <p className="text-[11px] text-gray-400">Cancelado</p>
                    )}
                  </div>
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {inFlight && (
                      <button
                        type="button"
                        onClick={() => onCancelItem(item.id)}
                        className="rounded p-0.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Cancelar"
                        aria-label={`Cancelar ${item.name}`}
                      >
                        <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                      </button>
                    )}
                    {item.status === 'done' && (
                      <Check className="h-4 w-4 text-emerald-500" strokeWidth={2.5} />
                    )}
                    {(item.status === 'cancelled' || item.status === 'error') && (
                      <X
                        className={`h-4 w-4 ${
                          item.status === 'error' ? 'text-red-500' : 'text-gray-300'
                        }`}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
