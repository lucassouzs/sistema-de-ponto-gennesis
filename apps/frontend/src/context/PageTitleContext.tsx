'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { BreadcrumbItem } from '@/lib/pageTitle';

type PageTitleContextValue = {
  override: string | null;
  setOverride: (title: string | null) => void;
  /** Crumbs dinâmicos no breadcrumb (ex.: pasta do Drive, nome do contrato). */
  breadcrumbEntities: BreadcrumbItem[];
  setBreadcrumbEntities: (entities: BreadcrumbItem[] | null) => void;
};

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

function sameEntities(a: BreadcrumbItem[], b: BreadcrumbItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (item, i) => item.label === b[i]?.label && (item.href ?? '') === (b[i]?.href ?? ''),
  );
}

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<string | null>(null);
  const [breadcrumbEntities, setBreadcrumbEntitiesState] = useState<BreadcrumbItem[]>([]);

  const setBreadcrumbEntities = useCallback((entities: BreadcrumbItem[] | null) => {
    const next = entities?.length ? entities : [];
    setBreadcrumbEntitiesState((prev) => (sameEntities(prev, next) ? prev : next));
  }, []);

  const value = useMemo(
    () => ({ override, setOverride, breadcrumbEntities, setBreadcrumbEntities }),
    [override, breadcrumbEntities, setBreadcrumbEntities],
  );

  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>;
}

export function usePageTitleOverride() {
  const ctx = useContext(PageTitleContext);
  if (!ctx) {
    throw new Error('usePageTitleOverride must be used within PageTitleProvider');
  }
  return ctx;
}
