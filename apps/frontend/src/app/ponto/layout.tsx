'use client';

import React from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * Shell persistente de /ponto — mantém Sidebar/TopNavbar montados entre navegações
 * (lista ↔ detalhe etc.), evitando o “piscar” do chrome a cada page.tsx.
 * Páginas que ainda envolvem MainLayout viram passthrough via contexto.
 */
export default function PontoLayout({ children }: { children: React.ReactNode }) {
  const { user } = usePermissions();

  return (
    <MainLayout
      userRole={(user?.role as 'EMPLOYEE' | undefined) || 'EMPLOYEE'}
      userName={user?.name || ''}
    >
      {children}
    </MainLayout>
  );
}
