'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import {
  PERMISSION_MODULES,
  PERMISSION_MODULE_KEYS_OPEN_ACCESS,
  pathToModuleKey,
} from '@sistema-ponto/permission-modules';
import { usePermissions } from '@/hooks/usePermissions';
import { useTheme } from '@/context/ThemeContext';
import { resolveModuleCategoryIcon } from '@/lib/moduleNavIcons';

type SearchItem = {
  name: string;
  href: string;
  category: string;
};

const EXTRA_ITEMS: SearchItem[] = [
  { name: 'Início', href: '/ponto/home', category: 'Principal' },
  { name: 'Agenda', href: '/ponto/agenda', category: 'Principal' },
  { name: 'Conversas', href: '/ponto/conversas', category: 'Principal' },
  { name: 'Aprovações', href: '/ponto/aprovacoes', category: 'Principal' },
];

const OPEN_ACCESS = new Set(PERMISSION_MODULE_KEYS_OPEN_ACCESS);

type NavSearchProps = {
  inputRef?: React.MutableRefObject<HTMLInputElement | null>;
};

export function NavSearch({ inputRef }: NavSearchProps) {
  const router = useRouter();
  const { isDark } = useTheme();
  const {
    can,
    isAdministrator,
    canAccessDpApproverPages,
    canApproveEspelhoNf,
    canApproveFuel,
    canApproveOc,
    canApproveMaterialRequests,
    canAccessCollaborationTools,
  } = usePermissions();
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  const setInputRef = (el: HTMLInputElement | null) => {
    localInputRef.current = el;
    if (inputRef) {
      inputRef.current = el;
    }
  };

  const catalog = useMemo((): SearchItem[] => {
    const fromModules: SearchItem[] = PERMISSION_MODULES.map((m) => ({
      name: m.name,
      href: m.href,
      category: m.category,
    }));
    const seen = new Set(fromModules.map((i) => i.href));
    const extras = EXTRA_ITEMS.filter((i) => !seen.has(i.href));
    return [...extras, ...fromModules];
  }, []);

  const canSeeApprovals =
    canAccessDpApproverPages ||
    canApproveEspelhoNf ||
    canApproveFuel ||
    canApproveOc ||
    canApproveMaterialRequests;

  const accessible = useMemo(() => {
    return catalog.filter((item) => {
      if (
        item.href === '/ponto/agenda' ||
        item.href === '/ponto/conversas' ||
        item.href === '/ponto/drive' ||
        item.href === '/ponto/kanban' ||
        item.href === '/ponto/flow'
      ) {
        return canAccessCollaborationTools;
      }
      if (item.href === '/ponto/home') {
        return true;
      }
      if (item.href === '/ponto/aprovacoes') return canSeeApprovals;
      if (isAdministrator) return true;
      const key = pathToModuleKey(item.href);
      if (OPEN_ACCESS.has(key)) return canAccessCollaborationTools;
      return can(key);
    });
  }, [catalog, can, isAdministrator, canSeeApprovals, canAccessCollaborationTools]);

  const results = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return accessible
      .filter((item) => {
        const hay = `${item.name} ${item.category}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [accessible, term]);

  const updatePanelPos = () => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 16);
    const left = Math.min(Math.max(8, Math.round(rect.left)), window.innerWidth - width - 8);
    setPanelPos({
      top: Math.round(rect.bottom + 6),
      left,
      width,
    });
  };

  useEffect(() => {
    if (!open || mobileOpen) {
      if (!mobileOpen) setPanelPos(null);
      return;
    }
    updatePanelPos();
    const onResize = () => updatePanelPos();
    const onScroll = () => updatePanelPos();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, term, results.length, mobileOpen]);

  useEffect(() => {
    if (!open && !mobileOpen) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open, mobileOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, [term]);

  useEffect(() => {
    if (!mobileOpen) return;
    const t = window.setTimeout(() => mobileInputRef.current?.focus(), 50);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const openMobile = () => setMobileOpen(true);
    window.addEventListener('app:open-mobile-search', openMobile);
    return () => window.removeEventListener('app:open-mobile-search', openMobile);
  }, []);

  const goTo = (href: string) => {
    setOpen(false);
    setMobileOpen(false);
    setTerm('');
    router.push(href);
  };

  const showPanel = open && term.trim().length > 0 && !mobileOpen;
  const hasTerm = term.trim().length > 0;
  const showShortcutHint = !focused && !hasTerm;

  const resultsList = (
    <>
      {results.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {hasTerm ? `Nenhum resultado para “${term.trim()}”` : 'Digite para buscar páginas'}
        </p>
      ) : (
        <ul className="max-h-[min(20rem,60vh)] overflow-y-auto py-1">
          {results.map((item, index) => {
            const Icon = resolveModuleCategoryIcon(item.category);
            const active = index === activeIndex;
            return (
              <li key={`${item.href}-${item.name}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => goTo(item.href)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'bg-red-50 dark:bg-red-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  {Icon ? (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      <Icon className="h-4 w-4" />
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {item.name}
                    </span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      {item.category}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (hasTerm) {
        setTerm('');
        setOpen(false);
      } else if (mobileOpen) {
        setMobileOpen(false);
      } else {
        setOpen(false);
      }
      return;
    }
    if (!(open || mobileOpen) || !hasTerm) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) goTo(item.href);
    }
  };

  return (
    <>
      {/* Mobile: ícone que abre overlay full-screen */}
      <button
        type="button"
        aria-label="Buscar páginas"
        onClick={() => setMobileOpen(true)}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200/80 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 sm:hidden"
      >
        <Search className="h-4 w-4" />
      </button>

      {/* Desktop / tablet: busca em pill */}
      <div
        ref={wrapRef}
        className="relative hidden w-[min(28rem,36vw)] min-w-[12rem] sm:block md:min-w-[14rem] lg:w-[28rem]"
        data-app-topnav
      >
        <label
          className={`nav-search relative block overflow-hidden rounded-full transition-[background-color,box-shadow] duration-500 ease-out ${
            isDark
              ? 'bg-slate-800 shadow-[inset_0_2px_8px_rgba(0,0,0,0.7),inset_0_-1px_2px_rgba(255,255,255,0.06)]'
              : 'bg-sky-100 shadow-[inset_0_2px_8px_rgba(15,23,42,0.2),inset_0_-1px_2px_rgba(255,255,255,0.75)]'
          }`}
        >
          <span className="sr-only">Buscar páginas</span>

          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
            <span
              className={`absolute inset-0 transition-opacity duration-500 ${
                isDark
                  ? 'opacity-100 bg-[radial-gradient(ellipse_at_12%_35%,rgba(99,102,241,0.4),transparent_42%),radial-gradient(ellipse_at_88%_60%,rgba(56,189,248,0.12),transparent_45%)]'
                  : 'opacity-100 bg-[radial-gradient(ellipse_at_10%_30%,rgba(253,224,71,0.55),transparent_40%),radial-gradient(ellipse_at_85%_70%,rgba(125,211,252,0.45),transparent_48%)]'
              }`}
            />
            <span
              className={`nav-search-stars absolute inset-0 transition-opacity duration-500 ${
                isDark ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <span className="absolute left-[18%] top-2 size-0.5 rounded-full bg-white/90" />
              <span className="absolute left-[32%] top-3.5 size-[3px] rounded-full bg-white/65" />
              <span className="absolute left-[48%] top-2 size-0.5 rounded-full bg-white/80" />
              <span className="absolute left-[62%] top-3 size-[2px] rounded-full bg-white/70" />
              <span className="absolute left-[78%] top-2.5 size-0.5 rounded-full bg-white/85" />
              <span className="absolute bottom-2 left-[40%] size-0.5 rounded-full bg-white/75" />
            </span>
          </span>

          <Search
            className={`pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 transition-colors duration-500 ${
              isDark ? 'text-slate-300/80' : 'text-sky-700/55'
            }`}
          />
          <input
            ref={setInputRef}
            type="text"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setFocused(true);
              if (term.trim()) setOpen(true);
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={onSearchKeyDown}
            placeholder="Buscar..."
            className={`relative z-10 h-10 w-full rounded-full border-0 bg-transparent py-2 pl-10 pr-11 text-sm font-medium outline-none ring-0 transition-colors duration-500 ${
              isDark
                ? 'text-slate-100 placeholder:text-slate-400/70'
                : 'text-slate-800 placeholder:text-sky-900/40'
            }`}
            autoComplete="off"
          />
          {hasTerm ? (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => {
                setTerm('');
                setOpen(false);
                localInputRef.current?.focus();
              }}
              className={`absolute right-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors ${
                isDark
                  ? 'text-slate-300 hover:bg-white/10 hover:text-white'
                  : 'text-sky-800/60 hover:bg-white/50 hover:text-sky-900'
              }`}
            >
              <X className="h-4 w-4" />
            </button>
          ) : showShortcutHint ? (
            <kbd
              className={`pointer-events-none absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide transition-colors duration-500 md:inline-flex ${
                isDark
                  ? 'bg-slate-950/45 text-slate-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.55)]'
                  : 'bg-white/45 text-sky-800/55 shadow-[inset_0_1px_2px_rgba(15,23,42,0.12)]'
              }`}
            >
              Ctrl K
            </kbd>
          ) : null}
        </label>
      </div>

      {/* Overlay de busca no mobile */}
      {mobileOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex flex-col bg-white pt-[env(safe-area-inset-top)] dark:bg-gray-900 sm:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Buscar páginas"
          >
            <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-gray-800">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  ref={mobileInputRef}
                  type="search"
                  value={term}
                  onChange={(e) => {
                    setTerm(e.target.value);
                    setOpen(true);
                  }}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Buscar páginas..."
                  className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm text-gray-900 outline-none ring-0 focus:border-red-300 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-red-700"
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  setTerm('');
                  setOpen(false);
                }}
                className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{resultsList}</div>
          </div>,
          document.body,
        )}

      {showPanel &&
        panelPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            data-app-topnav
            role="listbox"
            aria-label="Resultados da busca"
            style={{
              position: 'fixed',
              top: panelPos.top,
              left: panelPos.left,
              width: panelPos.width,
              zIndex: 9999,
            }}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
          >
            {resultsList}
          </div>,
          document.body,
        )}
    </>
  );
}
