'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { usePageTitleOverride } from '@/context/PageTitleContext';
import { buildDocumentTitle, resolvePageTitle } from '@/lib/pageTitle';

export function DocumentTitle() {
  const pathname = usePathname();
  const { override } = usePageTitleOverride();
  const pageTitle = override ?? resolvePageTitle(pathname ?? '/');
  const documentTitle = buildDocumentTitle(pageTitle);

  useEffect(() => {
    document.title = documentTitle;
  }, [documentTitle]);

  return null;
}
