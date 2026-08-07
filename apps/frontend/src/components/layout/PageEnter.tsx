'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

/**
 * Reexecuta a animação de entrada a cada troca de rota.
 * Usado no MainLayout — não anima sidebar/topbar.
 */
export function PageEnter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
