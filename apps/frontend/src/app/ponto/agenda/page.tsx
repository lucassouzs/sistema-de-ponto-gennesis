'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { KanbanPlannerView } from '@/components/kanban/KanbanPlannerView';
import { KanbanTasksView } from '@/components/kanban/KanbanTasksView';
import {
  AgendaModeSwitcher,
  type AgendaSurfaceMode,
} from '@/components/kanban/AgendaModeSwitcher';
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
      <div className="flex h-[calc(100dvh-2rem)] flex-col overflow-hidden -mx-2 sm:-mx-4 lg:h-[calc(100dvh-4rem)]">
        <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-1">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
              {isTasks ? 'Tarefas' : 'Agenda'}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {isTasks ? 'Minhas tarefas' : 'Agenda pessoal'}
            </p>
          </div>
          <AgendaModeSwitcher mode={agendaView} onChange={setView} />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {isTasks ? <KanbanTasksView /> : <KanbanPlannerView mode="planner" />}
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
