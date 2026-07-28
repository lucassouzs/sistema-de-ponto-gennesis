'use client';

import { useEffect } from 'react';
import { usePageTitleOverride } from '@/context/PageTitleContext';
import type { BreadcrumbItem } from '@/lib/pageTitle';

/** Insere um crumb dinâmico no breadcrumb da TopNavbar enquanto a página estiver montada. */
export function useBreadcrumbEntity(entity: BreadcrumbItem | null | undefined) {
  const { setBreadcrumbEntity } = usePageTitleOverride();

  useEffect(() => {
    const label = entity?.label?.trim();
    if (!label) {
      setBreadcrumbEntity(null);
      return;
    }
    setBreadcrumbEntity({ label, href: entity?.href });
    return () => setBreadcrumbEntity(null);
  }, [entity?.label, entity?.href, setBreadcrumbEntity]);
}
