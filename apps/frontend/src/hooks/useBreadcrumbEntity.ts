'use client';

import { useEffect } from 'react';
import { usePageTitleOverride } from '@/context/PageTitleContext';
import type { BreadcrumbItem } from '@/lib/pageTitle';

function normalizeEntities(
  entity: BreadcrumbItem | BreadcrumbItem[] | null | undefined,
): BreadcrumbItem[] {
  const list = Array.isArray(entity) ? entity : entity ? [entity] : [];
  return list
    .map((item) => ({
      label: item.label?.trim() ?? '',
      href: item.href,
    }))
    .filter((item) => item.label.length > 0);
}

/** Insere crumb(s) dinâmicos no breadcrumb da TopNavbar enquanto a página estiver montada. */
export function useBreadcrumbEntity(
  entity: BreadcrumbItem | BreadcrumbItem[] | null | undefined,
) {
  const { setBreadcrumbEntities } = usePageTitleOverride();
  const normalized = normalizeEntities(entity);
  const key = normalized.map((e) => `${e.label}|${e.href ?? ''}`).join('>');

  useEffect(() => {
    if (normalized.length === 0) {
      setBreadcrumbEntities(null);
      return;
    }
    setBreadcrumbEntities(normalized);
    return () => setBreadcrumbEntities(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captura label/href
  }, [key, setBreadcrumbEntities]);
}
