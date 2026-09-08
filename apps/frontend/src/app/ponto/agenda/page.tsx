'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { KanbanPlannerView } from '@/components/kanban/KanbanPlannerView';
import { KanbanTasksView } from '@/components/kanban/KanbanTasksView';
import { type AgendaSurfaceMode } from '@/components/kanban/AgendaModeSwitcher';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePermissions } from '@/hooks/usePermissions';

function AgendaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: meUser } = usePermissions();
  const [agendaView, setAgendaView] = useState<AgendaSurfaceMode>('planner');

  useEffect(() => {
    const viewParam = searchParams?.get('view');
    if (viewParam === 'tasks' || viewParam === 'planner') {
      setAgendaView(viewParam);
    }
  }, [searchParams]);

  useDocumentTitle(agendaView === 'tasks' ? 'Tarefas' : 'Agenda');

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const setView = (next: AgendaSurfaceMode) => {
    setAgendaView(next);
    router.replace(next === 'tasks' ? '/ponto/agenda?view=tasks' : '/ponto/agenda');
  };

  const user = meUser || { name: 'Usuário', role: 'EMPLOYEE' };
  const isTasks = agendaView === 'tasks';

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <div className="flex h-[calc(100dvh-6rem)] flex-col overflow-hidden lg:h-[calc(100dvh-8rem)]">
        <div className="min-h-0 flex-1 overflow-hidden">
          {isTasks ? (
            <KanbanTasksView mode="tasks" onModeChange={setView} />
          ) : (
            <KanbanPlannerView mode="planner" onModeChange={setView} />
          )}
        </div>
      </div>
    </MainLayout>
  );
}

export default function AgendaPageWithSuspense() {
  return (
    <Suspense fallback={<Loading />}>
      <AgendaPage />
    </Suspense>
  );
}
