'use client';

import { useEffect } from 'react';
import { usePageTitleOverride } from '@/context/PageTitleContext';

/** Sobrescreve o título da aba enquanto a página estiver montada. */
export function useDocumentTitle(title: string | null | undefined) {
  const { setOverride } = usePageTitleOverride();

  useEffect(() => {
    if (!title?.trim()) return;
    setOverride(title.trim());
    return () => setOverride(null);
  }, [title, setOverride]);
}
