'use client';

import { createContext, useContext } from 'react';

/** true quando a árvore já está dentro do MainLayout persistente (layout de /ponto). */
export const MainLayoutShellContext = createContext(false);

export function useIsInsideMainLayoutShell(): boolean {
  return useContext(MainLayoutShellContext);
}
