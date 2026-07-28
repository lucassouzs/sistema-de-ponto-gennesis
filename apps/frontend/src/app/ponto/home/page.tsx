'use client';

// Página padrão de entrada para todos os usuários autenticados (home minimalista).

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  FileCheck,
  Users,
  ShoppingCart,
  BookPlus,
  ImagePlus,
  Car,
  CalendarClock,
  ListTodo,
  Gavel,
  type LucideIcon,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import api from '@/lib/api';
import { authService } from '@/lib/auth';
import { useLogout } from '@/hooks/useLogout';
import { usePermissions } from '@/hooks/usePermissions';
import { useApprovalNotificationCounts } from '@/hooks/useApprovalNotificationCounts';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { fetchPlannerEvents, type PlannerEvent } from '@/lib/plannerEvents';
import {
  fetchPlannerTasks,
  toTimeInputValue,
  type PlannerTask,
} from '@/lib/plannerTasks';

type QuickAction = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  visible: boolean;
};

type StatCard = {
  id: string;
  label: string;
  value: number;
  href: string;
  icon: LucideIcon;
  accent: 'red' | 'blue' | 'yellow' | 'green';
  visible: boolean;
};

const STAT_CARD_ACCENT_CLASSES: Record<StatCard['accent'], { bg: string; icon: string }> = {
  red: { bg: 'bg-red-100 dark:bg-red-900/30', icon: 'text-red-600 dark:text-red-400' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', icon: 'text-blue-600 dark:text-blue-400' },
  yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', icon: 'text-yellow-600 dark:text-yellow-400' },
  green: { bg: 'bg-green-100 dark:bg-green-900/30', icon: 'text-green-600 dark:text-green-400' },
};

function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getStoredUserQueryData() {
  const stored = authService.getUser();
  if (!stored) return undefined;
  return { success: true, data: stored };
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

type TodayItem = {
  id: string;
  kind: 'event' | 'task';
  title: string;
  sortAt: number;
  expiresAt: number;
  timeLabel: string;
  color?: string;
};

function buildTodayItems(events: PlannerEvent[], tasks: PlannerTask[]): TodayItem[] {
  const items: TodayItem[] = [];

  for (const ev of events) {
    const start = new Date(ev.startAt);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(ev.endAt);
    const expiresAt = Number.isNaN(end.getTime()) ? start.getTime() : end.getTime();
    items.push({
      id: `ev-${ev.id}`,
      kind: 'event',
      title: ev.title,
      sortAt: start.getTime(),
      expiresAt,
      timeLabel: start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      color: ev.color || '#3B82F6',
    });
  }

  for (const task of tasks) {
    if (!task.dueDate || task.completed) continue;
    const due = new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) continue;
    const time = toTimeInputValue(task.dueDate);
    items.push({
      id: `task-${task.id}`,
      kind: 'task',
      title: task.title,
      sortAt: due.getTime(),
      expiresAt: due.getTime(),
      timeLabel: time || '—',
    });
  }

  return items.sort((a, b) => a.sortAt - b.sortAt);
}

export default function HomePage() {
  const handleLogout = useLogout();
  const [now, setNow] = useState<Date>(() => new Date());

  // Não bloqueia o shell: usa cache/storage e atualiza /auth/me em background
  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me', {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    placeholderData: () => getStoredUserQueryData(),
  });

  const todayRange = useMemo(() => {
    const from = startOfDay(now);
    return { from, to: addDays(from, 1) };
  }, [now]);

  const { data: todayEvents = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['planner-events', 'home-today', todayRange.from.toISOString()],
    queryFn: async () => {
      const { events } = await fetchPlannerEvents(todayRange.from, todayRange.to);
      return events;
    },
    staleTime: 60_000,
  });

  const { data: todayTasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ['planner-tasks', 'home-today', todayRange.from.toISOString()],
    queryFn: () =>
      fetchPlannerTasks({
        from: todayRange.from,
        to: todayRange.to,
        withDue: true,
        includeCompleted: false,
      }),
    staleTime: 60_000,
  });

  const todayItems = useMemo(() => {
    const items = buildTodayItems(todayEvents, todayTasks);
    const cutoff = now.getTime();
    return items.filter((item) => item.expiresAt >= cutoff);
  }, [todayEvents, todayTasks, now]);

  const agendaLoading = loadingEvents || loadingTasks;

  const { isAdministrator, isDepartmentPessoal, permissions, can, canAccessDpApproverPages, canApproveEspelhoNf, canApproveFuel, canApproveOc, canApproveMaterialRequests } = usePermissions();
  const { counts: approvalCounts } = useApprovalNotificationCounts();

  const canSeeApprovals =
    canAccessDpApproverPages || canApproveEspelhoNf || canApproveFuel || canApproveOc || canApproveMaterialRequests;

  const canSeePncp =
    isAdministrator ||
    can(pathToModuleKey('/ponto/licitacoes-pncp')) ||
    can(pathToModuleKey('/ponto/licitacoes'));

  const { data: pncpEnviosData } = useQuery({
    queryKey: ['pncp-meus-envios-count'],
    queryFn: async () => {
      const res = await api.get('/pncp/meus-envios-count');
      return res.data?.data as { total?: number } | undefined;
    },
    enabled: canSeePncp,
    staleTime: 60_000,
  });
  const pncpEnviadosCount = Number(pncpEnviosData?.total || 0);

  const allStatCards: StatCard[] = [
    {
      id: 'aprovacoes',
      label: 'Aprovações pendentes',
      value: approvalCounts.total,
      href: '/ponto/aprovacoes',
      icon: FileCheck,
      accent: 'red',
      visible: canSeeApprovals,
    },
    {
      id: 'eventos-hoje',
      label: 'Eventos hoje',
      value: todayEvents.length,
      href: '/ponto/agenda',
      icon: CalendarClock,
      accent: 'blue',
      visible: true,
    },
    {
      id: 'tarefas-hoje',
      label: 'Tarefas pendentes',
      value: todayTasks.length,
      href: '/ponto/agenda',
      icon: ListTodo,
      accent: 'yellow',
      visible: true,
    },
    {
      id: 'pncp-enviados',
      label: 'Licitações captadas',
      value: pncpEnviadosCount,
      href: '/ponto/licitacoes-pncp',
      icon: Gavel,
      accent: 'green',
      visible: canSeePncp,
    },
  ];
  const statCards = allStatCards.filter((card) => card.visible);

  const quickActions: QuickAction[] = [
    {
      id: 'materiais',
      label: 'Solicitar materiais',
      href: '/ponto/solicitar-materiais',
      icon: ShoppingCart,
      visible: isAdministrator || can(pathToModuleKey('/ponto/solicitar-materiais')),
    },
    {
      id: 'ferias',
      label: 'Solicitar férias',
      href: '/ponto/ferias',
      icon: ImagePlus,
      visible: isAdministrator || can(pathToModuleKey('/ponto/ferias')),
    },
    {
      id: 'atestados',
      label: 'Registrar ausência',
      href: '/ponto/atestados',
      icon: BookPlus,
      visible: isAdministrator || can(pathToModuleKey('/ponto/atestados')),
    },
    {
      id: 'aprovacoes',
      label: 'Aprovações',
      href: '/ponto/aprovacoes',
      icon: FileCheck,
      visible: canSeeApprovals,
    },
    {
      id: 'funcionarios',
      label: 'Funcionários',
      href: '/ponto/funcionarios',
      icon: Users,
      visible: isAdministrator || isDepartmentPessoal || permissions.canManageEmployees,
    },
    {
      id: 'reserva-veiculos',
      label: 'Reserva de veículos',
      href: '/ponto/reserva-veiculos',
      icon: Car,
      visible: isAdministrator || can(pathToModuleKey('/ponto/reserva-veiculos')),
    },
  ].filter((action) => action.visible);

  useEffect(() => {
    // Atualiza o relógio a cada minuto (suficiente para a home)
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const user = userData?.data || authService.getUser() || { name: 'Usuário', role: 'EMPLOYEE' };
  const firstName = (user?.name || 'Usuário').split(' ')[0] || 'Usuário';

  const greeting = getGreeting(now);

  const formattedDate = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
    return capitalizeFirst(formatter.format(now));
  }, [now]);

  const formattedTime = useMemo(() => {
    return now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [now]);

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <div className="relative min-h-[calc(100vh-6rem)]">
        <div className="w-full">
          {/* Cabeçalho de boas-vindas */}
          <div className="animate-home-fade-in text-left">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
              {greeting}, <span className="text-red-600 dark:text-red-500">{firstName}</span>!
            </h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>{formattedDate}</span>
              <span aria-hidden>·</span>
              <span className="font-mono font-semibold tabular-nums text-gray-700 dark:text-gray-300">
                {formattedTime}
              </span>
            </div>
          </div>

          {/* Cards de status */}
          {statCards.length > 0 && (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
              {statCards.map((card) => {
                const Icon = card.icon;
                const colors = STAT_CARD_ACCENT_CLASSES[card.accent];
                return (
                  <Link key={card.id} href={card.href} className="block">
                    <Card>
                      <CardContent className="p-4 sm:p-6">
                        <div className="flex items-center">
                          <div className={`p-2 sm:p-3 rounded-lg flex-shrink-0 ${colors.bg}`}>
                            <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${colors.icon}`} />
                          </div>
                          <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                            <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal">
                              {card.label}
                            </p>
                            <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                              {card.value}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Corpo: agenda (principal) + acesso rápido (lateral) */}
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Agenda de hoje */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex w-full flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-5 w-5 text-red-600 dark:text-red-400" />
                      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Na agenda hoje
                      </h2>
                      {todayItems.length > 0 && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-400">
                          {todayItems.length}
                        </span>
                      )}
                    </div>
                    <Link
                      href="/ponto/agenda"
                      className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Abrir agenda
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  {agendaLoading ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Carregando…</p>
                  ) : todayItems.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nada marcado na agenda para hoje.
                    </p>
                  ) : (
                    <ol className="relative ml-1">
                      {todayItems.map((item) => (
                        <li key={item.id} className="flex gap-3 pb-5 last:pb-0">
                          <div className="relative flex w-2.5 shrink-0 flex-col items-center self-stretch">
                            <span
                              className="absolute bottom-0 left-1/2 top-[5px] w-px -translate-x-1/2 bg-gray-200 dark:bg-gray-700"
                              aria-hidden
                            />
                            <span
                              className="relative z-10 h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  item.kind === 'event' ? item.color || '#3B82F6' : '#F59E0B',
                              }}
                              aria-hidden
                            />
                          </div>
                          <Link href="/ponto/agenda" className="group block min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <time className="font-mono text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">
                                {item.timeLabel}
                              </time>
                              <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                {item.kind === 'task' ? 'Tarefa' : 'Evento'}
                              </span>
                            </div>
                            <p className="mt-0.5 text-sm font-medium text-gray-900 group-hover:text-red-600 dark:text-gray-100 dark:group-hover:text-red-400">
                              {item.title}
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Acesso rápido */}
            {quickActions.length > 0 && (
              <Card>
                <CardHeader>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    Acesso rápido
                  </h2>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    {quickActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <Link
                          key={action.id}
                          href={action.href}
                          className="flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-red-300 hover:bg-red-50/50 hover:text-red-600 dark:text-gray-300 dark:hover:border-red-500/40 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          {action.label}
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
