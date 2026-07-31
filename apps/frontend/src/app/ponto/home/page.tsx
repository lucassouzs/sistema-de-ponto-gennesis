'use client';

// Página padrão de entrada para todos os usuários autenticados (home minimalista).

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FileCheck,
  CalendarClock,
  ListTodo,
  Gavel,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  type LucideIcon,
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
import {
  DATE_PICKER_FOOTER_ACTION_CLS,
  DATE_PICKER_FOOTER_CLS,
  DATE_PICKER_NAV_BTN_CLS,
  DATE_PICKER_POPOVER_CLS,
  DATE_PICKER_WEEKDAY_ROW_CLS,
  DATE_PICKER_WEEKDAYS,
  datePickerDayButtonCls,
} from '@/components/ui/datePickerDropdownUi';
import { useTheme } from '@/context/ThemeContext';
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

function parseYmdLocal(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function CompactDayPicker({
  value,
  max,
  onChange,
}: {
  value: string;
  max: string;
  onChange: (ymd: string) => void;
}) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => parseYmdLocal(value) ?? new Date());
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 280 });

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const popoverH = 340;
    const gap = 6;
    let top = rect.bottom + gap;
    if (top + popoverH > window.innerHeight - 8) {
      top = Math.max(8, rect.top - popoverH - gap);
    }
    const width = 280;
    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = window.innerWidth - width - 8;
    }
    setCoords({ top, left: Math.max(8, left), width });
  }, []);

  useEffect(() => {
    const parsed = parseYmdLocal(value);
    if (parsed) setViewDate(parsed);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const pickDay = (day: number) => {
    const ymd = toDateInputValue(new Date(year, month, day, 12, 0, 0, 0));
    if (ymd > max) return;
    onChange(ymd);
    setOpen(false);
  };

  const popover = open ? (
    <div
      ref={popoverRef}
      id={listboxId}
      role="dialog"
      aria-label="Calendário"
      className={DATE_PICKER_POPOVER_CLS}
      style={{ top: coords.top, left: coords.left, width: coords.width }}
    >
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className={DATE_PICKER_NAV_BTN_CLS}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold capitalize text-gray-900 dark:text-gray-100">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className={DATE_PICKER_NAV_BTN_CLS}
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className={DATE_PICKER_WEEKDAY_ROW_CLS}>
        {DATE_PICKER_WEEKDAYS.map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <span key={`e-${i}`} aria-hidden />;
          const ymd = toDateInputValue(new Date(year, month, day, 12, 0, 0, 0));
          const selected = value === ymd;
          const isToday = ymd === max;
          const disabled = ymd > max;
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => pickDay(day)}
              className={`${datePickerDayButtonCls(selected, isToday)} disabled:pointer-events-none disabled:opacity-30`}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className={DATE_PICKER_FOOTER_CLS}>
        <span />
        <button
          type="button"
          onClick={() => {
            onChange(max);
            setViewDate(parseYmdLocal(max) ?? new Date());
            setOpen(false);
          }}
          className={DATE_PICKER_FOOTER_ACTION_CLS}
        >
          Hoje
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Escolher data"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? listboxId : undefined}
        title="Escolher data"
        onClick={() => {
          if (!open) updatePosition();
          setOpen((v) => !v);
        }}
        className="min-w-[4.25rem] select-none rounded px-1 py-0 text-center text-[10px] font-medium leading-5 tabular-nums text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
      >
        {formatDayLabelPt(value)}
      </button>
      {typeof document !== 'undefined' && popover
        ? createPortal(popover, document.body)
        : null}
    </>
  );
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
  const [profileHydrated, setProfileHydrated] = useState(false);

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

  const { isAdministrator, can, canAccessDpApproverPages, canApproveEspelhoNf, canApproveFuel, canApproveOc, canApproveMaterialRequests } = usePermissions();
  const { counts: approvalCounts } = useApprovalNotificationCounts();

  const canSeeApprovals =
    canAccessDpApproverPages || canApproveEspelhoNf || canApproveFuel || canApproveOc || canApproveMaterialRequests;

  const canSeePncp =
    isAdministrator ||
    can(pathToModuleKey('/ponto/licitacoes-pncp')) ||
    can(pathToModuleKey('/ponto/licitacoes'));

  const [pncpCaptacaoDay, setPncpCaptacaoDay] = useState(() => toDateInputValue(new Date()));
  const todayInputValue = toDateInputValue(now);
  const canGoNextPncpDay = pncpCaptacaoDay < todayInputValue;
  const currentWeekMonday = resolveMondayYmd(todayInputValue);
  const [pncpWeekMonday, setPncpWeekMonday] = useState(currentWeekMonday);
  const canGoNextPncpWeek = pncpWeekMonday < currentWeekMonday;

  const { data: pncpEnviosData } = useQuery({
    queryKey: ['pncp-meus-envios-count', pncpCaptacaoDay],
    queryFn: async () => {
      const res = await api.get('/pncp/meus-envios-count', {
        params: { date: pncpCaptacaoDay },
      });
      return res.data?.data as { total?: number } | undefined;
    },
    enabled: canSeePncp && Boolean(pncpCaptacaoDay),
    staleTime: 30_000,
  });
  const pncpEnviadosCount = Number(pncpEnviosData?.total || 0);

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
      <div className="relative min-h-[calc(100vh-6rem)]">
        <div className="w-full">
          {/* Cabeçalho de boas-vindas */}
          <div className="animate-home-fade-in flex flex-col gap-4 text-left sm:flex-row sm:items-start sm:justify-between sm:gap-8">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
                {greeting}, <span className="text-red-600 dark:text-red-500">{firstName}</span>!
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{formattedDate}</p>
            </div>
            <blockquote className="max-w-xl shrink-0 border-l-2 border-red-500/70 pl-4 sm:mt-1 sm:max-w-md sm:border-l-0 sm:border-r-2 sm:pl-0 sm:pr-4 md:max-w-lg lg:max-w-xl">
              <p className="text-base font-medium leading-snug text-gray-700 dark:text-gray-200 sm:text-right sm:text-lg">
                “{dailyQuote}”
              </p>
            </blockquote>
          </div>

          {/* Cards de status */}
          {statCards.length > 0 && (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
              {statCards.map((card) => {
                const Icon = card.icon;
                const colors = STAT_CARD_ACCENT_CLASSES[card.accent];

                if (card.id === 'pncp-enviados') {
                  return (
                    <Card key={card.id} className="h-full">
                      <CardContent className="flex h-full items-center p-4 sm:p-6">
                        <div className="flex w-full items-center">
                          <Link
                            href={card.href}
                            className={`p-2 sm:p-3 rounded-lg flex-shrink-0 ${colors.bg} transition-opacity hover:opacity-90`}
                            aria-label="Abrir PNCP"
                          >
                            <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${colors.icon}`} />
                          </Link>
                          <div className="ml-3 sm:ml-4 min-w-0 flex-1">
                            <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-normal">
                              {card.label}
                            </p>
                            <div className="mt-1 flex items-baseline gap-1.5">
                              <p className="shrink-0 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                                {card.value}
                              </p>
                              <div className="flex min-w-0 items-center gap-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPncpCaptacaoDay((day) => shiftDateInputValue(day, -1))
                                  }
                                  className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                                  aria-label="Dia anterior"
                                >
                                  <ChevronLeft className="h-3 w-3" />
                                </button>
                                <CompactDayPicker
                                  value={pncpCaptacaoDay}
                                  max={todayInputValue}
                                  onChange={setPncpCaptacaoDay}
                                />
                                <button
                                  type="button"
                                  disabled={!canGoNextPncpDay}
                                  onClick={() =>
                                    setPncpCaptacaoDay((day) => {
                                      const next = shiftDateInputValue(day, 1);
                                      return next > todayInputValue ? todayInputValue : next;
                                    })
                                  }
                                  className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:pointer-events-none disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                                  aria-label="Próximo dia"
                                >
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }

                return (
                  <Link key={card.id} href={card.href} className="block h-full">
                    <Card className="h-full">
                      <CardContent className="flex h-full items-center p-4 sm:p-6">
                        <div className="flex w-full items-center">
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

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch">
            {canSeePncp && (
              <Card className="flex h-full flex-col lg:col-span-2">
                <CardHeader className="border-b-0 pb-1">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-center space-x-3">
                      <div className="shrink-0 rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30 sm:p-3">
                        <Gavel className="h-5 w-5 text-emerald-600 dark:text-emerald-400 sm:h-6 sm:w-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Captações
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Envios para análise · semana vs. anterior
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-3 sm:gap-4 lg:justify-end">
                      <div className="flex items-center gap-3 text-xs font-medium text-gray-600 dark:text-gray-400">
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
                        <span className="min-w-[8.5rem] text-center text-xs font-medium tabular-nums text-gray-600 dark:text-gray-300">
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
                <CardContent className="flex min-h-0 flex-1 flex-col">
                  <div className="h-[260px] w-full flex-1 font-sans text-xs text-gray-500 dark:text-gray-400 sm:min-h-[320px] sm:h-auto">
                    {pncpSemanaLoading ? (
                      <p className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                        Carregando…
                      </p>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={pncpWeekChartData}
                          margin={{ top: 20, right: 12, left: 8, bottom: 8 }}
                          barCategoryGap="28%"
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
                            width={44}
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
                            maxBarSize={48}
                            minPointSize={2}
                          />
                          <Bar
                            dataKey="atual"
                            name="atual"
                            fill={chartBarAtual}
                            radius={[6, 6, 0, 0]}
                            maxBarSize={48}
                            minPointSize={2}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className={`flex h-full flex-col ${canSeePncp ? '' : 'lg:col-span-3'}`}>
              <CardHeader className="border-b-0 pb-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center space-x-3">
                    <div className="shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                      <CalendarClock className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Agenda
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
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
                {agendaLoading ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Carregando…</p>
                ) : todayItems.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nada marcado na agenda para hoje.
                  </p>
                ) : (
                  <ol className="relative ml-1 max-h-[320px] overflow-y-auto pr-1">
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
        </div>
      </div>
    </MainLayout>
  );
}
