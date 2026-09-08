'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { OsTab, OsPleitoListItem } from './osFluxTypes';
import { buildOsGlobalSearchHits, type OsGlobalSearchHit } from './osFluxUtils';

export function OsGlobalSearch({
  searchTerm,
  onSearchChange,
  onNavigate,
  pleitos
}: {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onNavigate: (tab: OsTab) => void;
  pleitos: OsPleitoListItem[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const hits = useMemo(
    () => buildOsGlobalSearchHits(pleitos, searchTerm),
    [pleitos, searchTerm]
  );

  useEffect(() => {
    setOpen(searchTerm.trim().length > 0);
  }, [searchTerm]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const selectHit = (hit: OsGlobalSearchHit) => {
    onNavigate(hit.tab);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative mx-auto w-full max-w-2xl px-2">
      <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
      <input
        type="text"
        inputMode="search"
        autoComplete="off"
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        onFocus={() => {
          if (searchTerm.trim()) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            return;
          }
          if (e.key === 'Enter' && hits[0]) {
            e.preventDefault();
            selectHit(hits[0]);
          }
        }}
        placeholder="Buscar OS, descrição, contrato, pasta, engenheiro em todas as fases..."
        className="h-11 w-full rounded-xl border border-gray-300 bg-white py-2 pl-10 pr-10 text-sm font-medium text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />
      {searchTerm ? (
        <button
          type="button"
          onClick={() => {
            onSearchChange('');
            setOpen(false);
          }}
          aria-label="Limpar busca"
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      {open && searchTerm.trim() ? (
        <div className="absolute left-2 right-2 top-full z-30 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
              Nenhuma OS encontrada em nenhuma fase
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1" role="listbox">
              {hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    role="option"
                    onClick={() => selectHit(hit)}
                    className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/60"
                  >
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {hit.title}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{hit.subtitle}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hits.length > 0 ? (
            <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Enter vai para o primeiro resultado · clique para ir à fase
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
