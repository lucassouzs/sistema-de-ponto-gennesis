'use client';

// Página padrão de entrada para todos os usuários autenticados (home minimalista).

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  CheckSquare,
  Gavel,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Star,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import { authService } from '@/lib/auth';
import { useLogout } from '@/hooks/useLogout';
import { usePermissions } from '@/hooks/usePermissions';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { fetchPlannerEvents, type PlannerEvent } from '@/lib/plannerEvents';
import {
  fetchPlannerTaskLists,
  toDateInputValue as toPlannerDateInputValue,
  toTimeInputValue,
  updatePlannerTask,
  type PlannerTask,
} from '@/lib/plannerTasks';

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

/** Frases motivacionais (trabalho e foco) — uma por dia civil. */
const HOME_DAILY_QUOTES = [
  'Foque no que importa hoje: um passo bem feito vale mais que dez improvisados.',
  'Disciplina é fazer o essencial mesmo quando a motivação oscila.',
  'Trabalho com clareza: defina a prioridade e proteja o seu foco.',
  'Constância vence intensidade: avance um pouco, mas avance todo dia.',
  'Organização libera energia. Comece pelo que gera mais impacto.',
  'Foco não é fazer tudo; é escolher o que merece a sua atenção agora.',
  'Cada tarefa concluída fortalece o próximo resultado.',
  'Produtividade nasce de intenção: saiba o porquê antes do como.',
  'Menos distração, mais entrega. O dia rende quando você decide.',
  'Excelência é hábito: faça bem feito o que estiver nas suas mãos.',
  'Progresso silencioso também conta. Continue, mesmo sem aplauso.',
  'Planeje com calma, execute com firmeza.',
  'O foco de hoje constrói a tranquilidade de amanhã.',
  'Trabalhe com propósito: qualidade antes de quantidade.',
  'Uma prioridade clara vale mais que uma lista interminável.',
  'Respiração, foco, ação. Repita até o fim do expediente.',
  'Pequenas vitórias diárias formam grandes conquistas.',
  'Concentração é um músculo: treine escolhendo o essencial.',
  'Faça o difícil primeiro. O resto flui com mais leveza.',
  'Resultado vem de presença: esteja inteiro na tarefa atual.',
  'Clareza no início evita retrabalho no fim.',
  'Compromisso consigo mesmo: termine o que começou.',
  'O melhor momento para avançar é agora, com o que você tem.',
  'Trabalho bem feito é a melhor apresentação do seu nome.',
  'Foque no processo certo; o resultado acompanha.',
  'Menos ruído, mais profundidade. É assim que o dia rende.',
  'Disciplina diária transforma esforço em evolução.',
  'Priorize, execute, revise. Simples e poderoso.',
  'Seu foco é o recurso mais valioso do dia. Use com intenção.',
  'Comece simples, mantenha o ritmo, termine com qualidade.',
  'Ação consistente supera planos perfeitos sem movimento.',
] as const;

function getDailyQuote(date: Date): string {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  const idx = ((dayOfYear % HOME_DAILY_QUOTES.length) + HOME_DAILY_QUOTES.length) % HOME_DAILY_QUOTES.length;
  return HOME_DAILY_QUOTES[idx];
}

function getStoredUserQueryData() {
  const stored = authService.getUser();
  if (!stored) return undefined;
  return { success: true, data: stored };
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDayLabelPt(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function shiftDateInputValue(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + deltaDays);
  return toDateInputValue(date);
}

function resolveMondayYmd(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  const dow = date.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + offset);
  return toDateInputValue(date);
}

function formatWeekRangeLabel(monday: string, friday: string): string {
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return ymd;
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    });
  };
  return `${fmt(monday)} – ${fmt(friday)}`;
}

function formatDayMonthShort(ymd: string): string {
  return formatDayLabelPt(ymd);
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

type AgendaEventItem = {
  id: string;
  title: string;
  sortAt: number;
  expiresAt: number;
  timeStart: string;
  timeRange: string | null;
  accent: string;
  ongoing: boolean;
};

type TarefaPreview = {
  task: PlannerTask;
  dueLabel: string | null;
  sortAt: number;
  overdue: boolean;
};

const HOME_LIST_MAX = 5;

function formatClock(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function hasMeaningfulTime(date: Date): boolean {
  return date.getHours() !== 0 || date.getMinutes() !== 0;
}

function buildTodayEvents(events: PlannerEvent[], nowMs: number): AgendaEventItem[] {
  const items: AgendaEventItem[] = [];

  for (const ev of events) {
    const start = new Date(ev.startAt);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(ev.endAt);
    const endMs = Number.isNaN(end.getTime()) ? start.getTime() : end.getTime();
    const hasRange = !Number.isNaN(end.getTime()) && endMs > start.getTime();

    items.push({
      id: ev.id,
      title: ev.title,
      sortAt: start.getTime(),
      expiresAt: endMs,
      timeStart: formatClock(start),
      timeRange: hasRange ? `${formatClock(start)} – ${formatClock(end)}` : null,
      accent: ev.color || '#3B82F6',
      ongoing: start.getTime() <= nowMs && endMs >= nowMs,
    });
  }

  return items.sort((a, b) => a.sortAt - b.sortAt);
}

function buildTarefaPreviews(tasks: PlannerTask[], now: Date): TarefaPreview[] {
  const todayKey = toPlannerDateInputValue(now);
  const todayStart = startOfDay(now).getTime();
  const rows: TarefaPreview[] = [];

  for (const task of tasks) {
    if (task.completed) continue;

    let dueLabel: string | null = null;
    let sortAt = Number.POSITIVE_INFINITY;
    let overdue = false;

    if (task.dueDate) {
      const due = new Date(task.dueDate);
      if (!Number.isNaN(due.getTime())) {
        sortAt = due.getTime();
        const dueKey = toPlannerDateInputValue(due);
        const time = toTimeInputValue(due);
        if (dueKey === todayKey) {
          dueLabel = hasMeaningfulTime(due) && time ? time : 'Hoje';
        } else if (startOfDay(due).getTime() < todayStart) {
          dueLabel = 'Atrasada';
          overdue = true;
        } else {
          dueLabel = due.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
          });
        }
      }
    }

    rows.push({ task, dueLabel, sortAt, overdue });
  }

  return rows.sort((a, b) => {
    if (a.task.starred !== b.task.starred) return a.task.starred ? -1 : 1;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.sortAt !== b.sortAt) return a.sortAt - b.sortAt;
    return a.task.title.localeCompare(b.task.title, 'pt-BR');
  });
}

export default function HomePage() {
  const handleLogout = useLogout();
  const queryClient = useQueryClient();
  const [now, setNow] = useState<Date>(() => new Date());
  const [profileHydrated, setProfileHydrated] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  useEffect(() => {
    setProfileHydrated(true);
  }, []);

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
    // Só após mount: localStorage no 1º paint do cliente diverge do SSR ("Usuário" vs nome real)
    placeholderData: profileHydrated ? getStoredUserQueryData() : undefined,
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

  const { data: taskLists = [], isLoading: loadingTasks } = useQuery({
    queryKey: ['planner-task-lists'],
    queryFn: fetchPlannerTaskLists,
    staleTime: 60_000,
  });

  const todayAgendaItems = useMemo(() => {
    const items = buildTodayEvents(todayEvents, now.getTime());
    return items.filter((item) => item.expiresAt >= now.getTime());
  }, [todayEvents, now]);

  const tarefaRows = useMemo(() => {
    const open = taskLists.flatMap((list) => list.tasks || []).filter((t) => !t.completed);
    return buildTarefaPreviews(open, now);
  }, [taskLists, now]);

  const visibleAgenda = todayAgendaItems.slice(0, HOME_LIST_MAX);
  const hiddenAgenda = Math.max(0, todayAgendaItems.length - visibleAgenda.length);
  const visibleTarefas = tarefaRows.slice(0, HOME_LIST_MAX);
  const hiddenTarefas = Math.max(0, tarefaRows.length - visibleTarefas.length);

  const toggleTaskMut = useMutation({
    mutationFn: (task: PlannerTask) =>
      updatePlannerTask(task.id, { completed: !task.completed }),
    onMutate: (task) => setBusyTaskId(task.id),
    onSettled: () => {
      setBusyTaskId(null);
      void queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
    },
  });

  const starTaskMut = useMutation({
    mutationFn: (task: PlannerTask) =>
      updatePlannerTask(task.id, { starred: !task.starred }),
    onMutate: (task) => setBusyTaskId(task.id),
    onSettled: () => {
      setBusyTaskId(null);
      void queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
    },
  });

  const { isAdministrator, can } = usePermissions();

  const canSeePncp =
    isAdministrator ||
    can(pathToModuleKey('/ponto/licitacoes-pncp')) ||
    can(pathToModuleKey('/ponto/licitacoes'));

  const todayInputValue = toDateInputValue(now);
  const currentWeekMonday = resolveMondayYmd(todayInputValue);
  const [pncpWeekMonday, setPncpWeekMonday] = useState(currentWeekMonday);
  const canGoNextPncpWeek = pncpWeekMonday < currentWeekMonday;

  const pncpPrevWeekMonday = shiftDateInputValue(pncpWeekMonday, -7);

  type PncpSemanaPayload = {
    monday?: string;
    friday?: string;
    days?: Array<{ date: string; label: string; total: number }>;
  };

  const { data: pncpSemanaCompare, isLoading: pncpSemanaLoading } = useQuery({
    queryKey: ['pncp-meus-envios-semana-compare', pncpWeekMonday],
    queryFn: async () => {
      const [atualRes, anteriorRes] = await Promise.all([
        api.get('/pncp/meus-envios-semana', { params: { weekStart: pncpWeekMonday } }),
        api.get('/pncp/meus-envios-semana', { params: { weekStart: pncpPrevWeekMonday } }),
      ]);
      return {
        atual: atualRes.data?.data as PncpSemanaPayload | undefined,
        anterior: anteriorRes.data?.data as PncpSemanaPayload | undefined,
      };
    },
    enabled: canSeePncp && Boolean(pncpWeekMonday),
    staleTime: 30_000,
  });

  const pncpWeekChartData = useMemo(() => {
    const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'] as const;
    const atualDays = pncpSemanaCompare?.atual?.days;
    const anteriorDays = pncpSemanaCompare?.anterior?.days;
    return labels.map((label, i) => {
      const atual = atualDays?.[i];
      const anterior = anteriorDays?.[i];
      return {
        label,
        atual: Number(atual?.total || 0),
        anterior: Number(anterior?.total || 0),
        date: atual?.date || shiftDateInputValue(pncpWeekMonday, i),
        dateAnterior: anterior?.date || shiftDateInputValue(pncpPrevWeekMonday, i),
        dateLabel: formatDayMonthShort(atual?.date || shiftDateInputValue(pncpWeekMonday, i)),
      };
    });
  }, [pncpSemanaCompare, pncpWeekMonday, pncpPrevWeekMonday]);

  const pncpWeekFriday =
    pncpSemanaCompare?.atual?.friday || shiftDateInputValue(pncpWeekMonday, 4);
  const { isDark } = useTheme();
  const chartBarAtual = '#10b981';
  const chartBarAnterior = isDark ? '#6b7280' : '#d1d5db';
  // Alinha ao padrão do sistema: text-xs / text-sm + gray-500/400 (eixos) e gray-900/100 (valores)
  const chartFontFamily =
    'inherit, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const chartTick = isDark ? '#9ca3af' : '#6b7280'; // gray-400 / gray-500
  const chartMuted = isDark ? '#6b7280' : '#9ca3af'; // gray-500 / gray-400
  const chartGrid = isDark ? '#374151' : '#e5e7eb';
  const chartTooltipBg = isDark ? 'rgba(31, 41, 55, 0.96)' : 'rgba(255, 255, 255, 0.96)';
  const chartTooltipBorder = isDark ? '#4b5563' : '#e5e7eb';
  const chartTooltipColor = isDark ? '#f3f4f6' : '#111827';
  const chartAxisTick = {
    fill: chartTick,
    fontSize: 12,
    fontWeight: 500 as const,
    fontFamily: chartFontFamily,
  };

  useEffect(() => {
    // Atualiza o relógio a cada minuto (suficiente para a home)
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const firstName = (user?.name || 'Usuário').split(' ')[0] || 'Usuário';

  const greeting = getGreeting(now);
  const dailyQuote = useMemo(() => getDailyQuote(now), [now]);

  const formattedDate = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return capitalizeFirst(formatter.format(now));
  }, [now]);

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <div className="relative min-h-[calc(100vh-6rem)] min-w-0">
        <div className="w-full min-w-0">
          {/* Cabeçalho de boas-vindas */}
          <div className="animate-home-fade-in flex flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-8">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
                {greeting}, <span className="text-red-600 dark:text-red-500">{firstName}</span>!
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{formattedDate}</p>
            </div>
            <blockquote className="min-w-0 max-w-full border-l-2 border-red-500/70 pl-3 sm:max-w-md sm:border-l-0 sm:border-r-2 sm:pl-0 sm:pr-4 md:max-w-lg lg:max-w-xl">
              <p className="text-sm font-medium leading-snug text-gray-700 dark:text-gray-200 sm:text-right sm:text-base md:text-lg">
                “{dailyQuote}”
              </p>
            </blockquote>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-3 lg:items-start">
            {canSeePncp && (
              <Card className="flex h-full min-w-0 flex-col lg:col-span-2">
                <CardHeader className="border-b-0 pb-1">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-center space-x-3">
                      <div className="shrink-0 rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30 sm:p-3">
                        <Gavel className="h-5 w-5 text-emerald-600 dark:text-emerald-400 sm:h-6 sm:w-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
                          Captações
                        </h3>
                        <p className="text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
                          Envios para análise · semana vs. anterior
                        </p>
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-4 lg:justify-end">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400 sm:gap-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: chartBarAnterior }}
                            aria-hidden
                          />
                          Semana anterior
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: chartBarAtual }}
                            aria-hidden
                          />
                          Esta semana
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setPncpWeekMonday((day) => shiftDateInputValue(day, -7))
                          }
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                          aria-label="Semana anterior"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="min-w-[7.5rem] text-center text-xs font-medium tabular-nums text-gray-600 dark:text-gray-300 sm:min-w-[8.5rem]">
                          {formatWeekRangeLabel(pncpWeekMonday, pncpWeekFriday)}
                        </span>
                        <button
                          type="button"
                          disabled={!canGoNextPncpWeek}
                          onClick={() =>
                            setPncpWeekMonday((day) => {
                              const next = shiftDateInputValue(day, 7);
                              return next > currentWeekMonday ? currentWeekMonday : next;
                            })
                          }
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:pointer-events-none disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                          aria-label="Próxima semana"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <div className="h-[220px] w-full min-w-0 flex-1 font-sans text-xs text-gray-500 dark:text-gray-400 sm:h-auto sm:min-h-[320px]">
                    {pncpSemanaLoading ? (
                      <p className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                        Carregando…
                      </p>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={pncpWeekChartData}
                          margin={{ top: 16, right: 4, left: 0, bottom: 4 }}
                          barCategoryGap="20%"
                          barGap={0}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                          <XAxis
                            dataKey="label"
                            interval={0}
                            tick={(props) => {
                              const { x, y, payload } = props;
                              const row = pncpWeekChartData.find((d) => d.label === payload.value);
                              return (
                                <g transform={`translate(${x},${y})`}>
                                  <text
                                    x={0}
                                    y={0}
                                    dy={12}
                                    textAnchor="middle"
                                    fill={chartTick}
                                    fontSize={12}
                                    fontWeight={600}
                                    fontFamily={chartFontFamily}
                                  >
                                    {payload.value}
                                  </text>
                                  <text
                                    x={0}
                                    y={0}
                                    dy={26}
                                    textAnchor="middle"
                                    fill={chartMuted}
                                    fontSize={10}
                                    fontWeight={500}
                                    fontFamily={chartFontFamily}
                                  >
                                    {row?.dateLabel || ''}
                                  </text>
                                </g>
                              );
                            }}
                            height={36}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={chartAxisTick}
                            axisLine={false}
                            tickLine={false}
                            width={32}
                          />
                          <Tooltip
                            cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                            formatter={(value: number, name: string) => [
                              value,
                              name === 'atual' ? 'Esta semana' : 'Semana anterior',
                            ]}
                            labelFormatter={(label, payload) => {
                              const row = payload?.[0]?.payload as
                                | { date?: string; dateLabel?: string }
                                | undefined;
                              const date = row?.date;
                              if (!date) return String(label);
                              const [y, m, d] = date.split('-').map(Number);
                              if (!y || !m || !d) return String(label);
                              const pretty = new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
                                weekday: 'long',
                                day: '2-digit',
                                month: 'short',
                              });
                              return capitalizeFirst(pretty);
                            }}
                            contentStyle={{
                              backgroundColor: chartTooltipBg,
                              borderRadius: 8,
                              border: `1px solid ${chartTooltipBorder}`,
                              color: chartTooltipColor,
                              fontFamily: chartFontFamily,
                              fontSize: 12,
                              fontWeight: 500,
                              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            }}
                            labelStyle={{
                              color: chartMuted,
                              fontFamily: chartFontFamily,
                              fontSize: 12,
                              fontWeight: 500,
                              marginBottom: 2,
                            }}
                            itemStyle={{
                              color: chartTooltipColor,
                              fontFamily: chartFontFamily,
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          />
                          <Bar
                            dataKey="anterior"
                            name="anterior"
                            fill={chartBarAnterior}
                            radius={[6, 6, 0, 0]}
                            maxBarSize={36}
                            minPointSize={2}
                          />
                          <Bar
                            dataKey="atual"
                            name="atual"
                            fill={chartBarAtual}
                            radius={[6, 6, 0, 0]}
                            maxBarSize={36}
                            minPointSize={2}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <div
              className={`flex min-w-0 flex-col gap-4 sm:gap-6 ${
                canSeePncp ? '' : 'lg:col-span-3 lg:grid lg:grid-cols-2'
              }`}
            >
              <Card className="flex min-w-0 flex-col">
                <CardHeader className="border-b-0 pb-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center space-x-3">
                      <div className="shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                        <CalendarClock className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
                          Agenda
                        </h3>
                        <p className="truncate text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
                          {formattedDate}
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/ponto/agenda"
                      aria-label="Abrir agenda"
                      title="Abrir agenda"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col">
                  {loadingEvents ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Carregando…</p>
                  ) : todayAgendaItems.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhum evento para hoje.
                    </p>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {visibleAgenda.map((item) => (
                        <Link
                          key={item.id}
                          href="/ponto/agenda"
                          className="group -mx-1 flex items-center gap-3 rounded-md px-1 py-2.5 transition-colors first:pt-1.5 last:pb-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                        >
                          <span
                            className="w-0.5 self-stretch shrink-0 rounded-full"
                            style={{ backgroundColor: item.accent }}
                            aria-hidden
                          />
                          <span className="w-11 shrink-0 text-xs font-semibold tabular-nums text-gray-500 dark:text-gray-400">
                            {item.timeStart}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-gray-900 group-hover:text-red-700 dark:text-gray-100 dark:group-hover:text-red-300">
                              {item.title}
                            </span>
                            <span
                              className={`mt-0.5 block text-xs ${
                                item.ongoing
                                  ? 'font-medium text-red-600 dark:text-red-400'
                                  : 'text-gray-400 dark:text-gray-500'
                              }`}
                            >
                              {item.ongoing
                                ? 'Em andamento'
                                : item.timeRange || item.timeStart}
                            </span>
                          </span>
                        </Link>
                      ))}
                      {hiddenAgenda > 0 ? (
                        <Link
                          href="/ponto/agenda"
                          className="inline-block pt-2.5 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                        >
                          Ver todos ({todayAgendaItems.length})
                        </Link>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="flex min-w-0 flex-col">
                <CardHeader className="border-b-0 pb-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center space-x-3">
                      <div className="shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                        <CheckSquare className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
                          Tarefas
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {loadingTasks
                            ? 'Carregando…'
                            : tarefaRows.length === 0
                              ? 'Nenhuma pendente'
                              : `${tarefaRows.length} pendente${
                                  tarefaRows.length === 1 ? '' : 's'
                                }`}
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/ponto/agenda?view=tasks"
                      aria-label="Abrir tarefas"
                      title="Abrir tarefas"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col">
                  {loadingTasks ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Carregando…</p>
                  ) : tarefaRows.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhuma tarefa pendente.
                    </p>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {visibleTarefas.map(({ task, dueLabel, overdue }) => {
                        const busy = busyTaskId === task.id;
                        return (
                          <div
                            key={task.id}
                            className="group -mx-1 flex items-center gap-2.5 rounded-md px-1 py-2 first:pt-1.5 last:pb-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          >
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => toggleTaskMut.mutate(task)}
                              aria-label={`Concluir ${task.title}`}
                              className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border border-gray-300 bg-white outline-none transition-colors hover:border-red-400 disabled:opacity-60 dark:border-gray-600 dark:bg-transparent dark:hover:border-red-500"
                            />
                            <Link
                              href="/ponto/agenda?view=tasks"
                              className="min-w-0 flex-1"
                            >
                              <span className="block truncate text-sm text-gray-800 group-hover:text-gray-950 dark:text-gray-200 dark:group-hover:text-gray-50">
                                {task.title}
                              </span>
                            </Link>
                            {dueLabel ? (
                              <span
                                className={`shrink-0 text-xs tabular-nums ${
                                  overdue
                                    ? 'font-medium text-red-600 dark:text-red-400'
                                    : 'text-gray-400 dark:text-gray-500'
                                }`}
                              >
                                {dueLabel}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => starTaskMut.mutate(task)}
                              aria-label={
                                task.starred ? 'Remover estrela' : 'Marcar com estrela'
                              }
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-300 outline-none transition-colors hover:text-amber-500 disabled:opacity-60 dark:text-gray-600"
                            >
                              <Star
                                className={`h-3.5 w-3.5 ${
                                  task.starred
                                    ? 'fill-amber-400 text-amber-400'
                                    : ''
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                      {hiddenTarefas > 0 ? (
                        <Link
                          href="/ponto/agenda?view=tasks"
                          className="inline-block pt-2.5 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                        >
                          Ver todas ({tarefaRows.length})
                        </Link>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
