'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { BreadcrumbItem } from '@/lib/pageTitle';

type PageTitleContextValue = {
  override: string | null;
  setOverride: (title: string | null) => void;
  /** Entidade dinâmica no breadcrumb (ex.: nome do contrato). */
  breadcrumbEntity: BreadcrumbItem | null;
  setBreadcrumbEntity: (entity: BreadcrumbItem | null) => void;
};

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<string | null>(null);
  const [breadcrumbEntity, setBreadcrumbEntity] = useState<BreadcrumbItem | null>(null);
  const value = useMemo(
    () => ({ override, setOverride, breadcrumbEntity, setBreadcrumbEntity }),
    [override, breadcrumbEntity],
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
