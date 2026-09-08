'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { fetchFlowDiagram } from '@/lib/flow';
import { Loading } from '@/components/ui/Loading';
import { MainLayout } from '@/components/layout/MainLayout';
import { FlowDiagramList } from './FlowDiagramList';
import { FlowEditor } from './FlowEditor';

export function FlowPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const diagramId = searchParams?.get('id') ?? null;
  const [user, setUser] = useState<{ name: string; role: 'EMPLOYEE' } | null>(null);

  useEffect(() => {
    api
      .get('/auth/me')
      .then((res) => setUser(res.data?.data ?? { name: 'Usuário', role: 'EMPLOYEE' }))
      .catch(() => setUser({ name: 'Usuário', role: 'EMPLOYEE' }));
  }, []);

  const { data: diagram, isLoading } = useQuery({
    queryKey: ['flow-diagram', diagramId],
    queryFn: () => fetchFlowDiagram(diagramId!),
    enabled: Boolean(diagramId),
  });

  const openDiagram = useCallback(
    (id: string) => {
      router.push(`/ponto/flow?id=${id}`);
    },
    [router],
  );

  const handleBack = useCallback(() => {
    router.push('/ponto/flow');
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  if (!user) {
    return <Loading message="Carregando Flow..." fullScreen size="lg" />;
  }

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      {diagramId ? (
        isLoading || !diagram ? (
          <Loading message="Carregando fluxograma..." fullScreen size="lg" />
        ) : (
          <FlowEditor diagram={diagram} onBack={handleBack} />
        )
      ) : (
        <div className="p-4 lg:p-8">
          <FlowDiagramList onOpen={openDiagram} />
        </div>
      )}
    </MainLayout>
  );
}
