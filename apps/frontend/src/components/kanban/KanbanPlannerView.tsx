'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Trash2, RefreshCw, Share2, FileText, Upload, Download, X, CheckSquare, MoreVertical, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { usePermissions } from '@/hooks/usePermissions';
import {
  createPlannerEvent,
  deletePlannerEvent,
  deletePlannerEventAta,
  disconnectGoogleCalendarApi,
  downloadPlannerEventAta,
  fetchGoogleCalendarAuthUrl,
  fetchGoogleCalendarStatus,
  fetchPlannerAgendas,
  fetchPlannerEvents,
  syncGoogleCalendar,
  updatePlannerEvent,
  uploadPlannerEventAta,
  type PlannerEvent,
} from '@/lib/plannerEvents';
import {
  fetchPlannerTasks,
  isSameDateOnly,
  toTimeInputValue,
  updatePlannerTask,
  type PlannerTask,
} from '@/lib/plannerTasks';
import { PlannerAgendaShareModal } from './PlannerAgendaShareModal';
import {
  AgendaModeSwitcher,
  type AgendaSurfaceMode,
} from './AgendaModeSwitcher';
import { kanbanLabel } from './kanbanFormStyles';
import { splitDateTime } from './kanbanDateTime';

const HOUR_START = 0;
const HOUR_END = 23;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
const ROW_HEIGHT = 56;
const TIME_COL_WIDTH = 64;

const COLOR_OPTIONS = [
  '#3B82F6',
  '#22C55E',
  '#F59E0B',
  '#EF4444',
  '#A855F7',
  '#06B6D4',
  '#EC4899',
];

type CalendarView = 'day' | 'week' | 'month' | 'year';

const VIEW_OPTIONS: { id: CalendarView; label: string; shortcut: string }[] = [
  { id: 'day', label: 'Dia', shortcut: 'D' },
  { id: 'week', label: 'Semana', shortcut: 'W' },
  { id: 'month', label: 'Mês', shortcut: 'M' },
  { id: 'year', label: 'Ano', shortcut: 'Y' },
];

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function startOfMonth(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function startOfYear(date: Date): Date {
  const d = startOfDay(date);
  d.setMonth(0, 1);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function endOfMonth(date: Date): Date {
  return addDays(addMonths(startOfMonth(date), 1), 0);
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function fromLocalInputValue(value: string): string {
  const d = new Date(value);
  return d.toISOString();
}

function combineDateAndTime(date: string, time: string): string {
  if (!date) return '';
  return `${date}T${time || '09:00'}`;
}

function addOneHourHm(time: string): string {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return '10:00';
  const total = (Number(match[1]) * 60 + Number(match[2]) + 60) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mi = String(total % 60).padStart(2, '0');
  return `${hh}:${mi}`;
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 am';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? 'am' : 'pm';
  return `${h12} ${suffix}`;
}

function MiniMonthCalendar({
  selected,
  onSelect,
}: {
  selected: Date;
  onSelect: (day: Date) => void;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(selected));
  const today = useMemo(() => startOfDay(new Date()), []);

  useEffect(() => {
    setCursor(startOfMonth(selected));
  }, [selected]);

  const cells = useMemo(() => {
    const monthStart = startOfMonth(cursor);
    const gridStart = startOfWeek(monthStart);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  const weekLetters = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  return (
    <div className="w-full rounded-xl border border-gray-200/80 bg-white p-3.5 dark:border-gray-700/80 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium capitalize text-gray-800 dark:text-gray-100">
          {monthLabel}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setCursor((c) => addMonths(c, -1))}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mb-1.5 grid grid-cols-7 text-center">
        {weekLetters.map((letter, idx) => (
          <span
            key={`${letter}-${idx}`}
            className="py-1 text-[10px] font-normal uppercase tracking-wide text-gray-400 dark:text-gray-500"
          >
            {letter}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {cells.map((day) => {
          const inMonth = isSameMonth(day, cursor);
          const isSelected = isSameDay(day, selected);
          const isToday = isSameDay(day, today);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelect(startOfDay(day))}
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors ${
                isToday
                  ? 'bg-red-600 font-medium text-white'
                  : isSelected
                    ? 'bg-gray-900 font-medium text-white dark:bg-gray-100 dark:text-gray-900'
                    : inMonth
                      ? 'font-normal text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
                      : 'font-normal text-gray-300 hover:bg-gray-50 dark:text-gray-600 dark:hover:bg-gray-800/50'
              }`}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function dayHeaderLabel(date: Date): { weekday: string; day: number } {
  const weekday = date
    .toLocaleDateString('pt-BR', { weekday: 'short' })
    .replace('.', '');
  return { weekday, day: date.getDate() };
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function rangeForView(view: CalendarView, anchor: Date): { from: Date; to: Date } {
  if (view === 'day') {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, 1) };
  }
  if (view === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 7) };
  }
  if (view === 'month') {
    const monthStart = startOfMonth(anchor);
    const from = startOfWeek(monthStart);
    const monthEnd = endOfMonth(anchor);
    const lastCell = addDays(startOfWeek(monthEnd), 7);
    return { from, to: lastCell };
  }
  const from = startOfYear(anchor);
  return { from, to: addYears(from, 1) };
}

type FormState = {
  id?: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  color: string;
  ataFileName?: string | null;
  ataFileUrl?: string | null;
};

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  startAt: '',
  endAt: '',
  color: COLOR_OPTIONS[0],
  ataFileName: null,
  ataFileUrl: null,
};

function ViewSwitcher({
  value,
  onChange,
}: {
  value: CalendarView;
  onChange: (view: CalendarView) => void;
}) {
  return (
    <div
      className="inline-flex shrink-0 items-center rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
      role="group"
      aria-label="Visualização do calendário"
    >
      {VIEW_OPTIONS.map((opt) => {
        const selected = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            title={`${opt.label} (${opt.shortcut})`}
            aria-pressed={selected}
            onClick={() => onChange(opt.id)}
            className={`rounded-md px-2.5 py-1.5 text-sm transition-colors sm:px-3 ${
              selected
                ? 'bg-white font-medium text-red-600 shadow-sm dark:bg-gray-600 dark:text-red-400'
                : 'font-normal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function EventBlock({
  event,
  top,
  height,
  onEdit,
}: {
  event: PlannerEvent;
  top: number;
  height: number;
  onEdit: (event: PlannerEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onEdit(event);
      }}
      className="pointer-events-auto absolute left-1 right-1 z-10 overflow-hidden rounded-md px-1.5 py-1 text-left text-xs font-semibold text-white shadow-sm"
      style={{
        top,
        height,
        backgroundColor: event.color || COLOR_OPTIONS[0],
      }}
      title={event.ataFileUrl ? `${event.title} · Ata PDF anexada` : event.title}
    >
      <span className="flex items-start gap-1">
        {event.ataFileUrl ? <FileText className="mt-0.5 h-3 w-3 shrink-0 opacity-90" /> : null}
        <span className="line-clamp-2">{event.title}</span>
      </span>
    </button>
  );
}

export function KanbanPlannerView({
  mode = 'planner',
  onModeChange,
  pageTitle,
  pageSubtitle,
}: {
  mode?: AgendaSurfaceMode;
  onModeChange?: (next: AgendaSurfaceMode) => void;
  pageTitle?: string;
  pageSubtitle?: string;
} = {}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user: meUser } = usePermissions();
  const [view, setView] = useState<CalendarView>('week');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [pendingAtaFile, setPendingAtaFile] = useState<File | null>(null);
  const [uploadingAta, setUploadingAta] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const ataInputRef = useRef<HTMLInputElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  const { data: agendas = [], isError: agendasError } = useQuery({
    queryKey: ['planner-agendas'],
    queryFn: fetchPlannerAgendas,
    enabled: !!meUser?.id,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (agendasError) {
      toast.error('Não foi possível carregar agendas compartilhadas');
    }
  }, [agendasError]);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!actionsMenuRef.current?.contains(e.target as Node)) setActionsMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActionsMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [actionsMenuOpen]);

  const activeOwnerId = selectedOwnerId || meUser?.id || '';
  const activeAgenda = useMemo(
    () => agendas.find((a) => a.ownerId === activeOwnerId) || agendas.find((a) => a.isMine),
    [agendas, activeOwnerId]
  );
  const isOwnAgenda = !activeAgenda || activeAgenda.isMine || activeAgenda.permission === 'OWNER';
  const canWrite =
    isOwnAgenda || activeAgenda?.permission === 'WRITE' || activeAgenda?.permission === 'OWNER';

  const { from: rangeFrom, to: rangeTo } = useMemo(
    () => rangeForView(view, anchor),
    [view, anchor]
  );

  const days = useMemo(() => {
    if (view === 'day') return [startOfDay(anchor)];
    if (view === 'week') {
      const weekStart = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    }
    return [];
  }, [view, anchor]);

  const monthCells = useMemo(() => {
    if (view !== 'month') return [];
    const from = startOfWeek(startOfMonth(anchor));
    return Array.from({ length: 42 }, (_, i) => addDays(from, i));
  }, [view, anchor]);

  const today = useMemo(() => startOfDay(new Date()), []);

  const { data: eventsResult, isLoading } = useQuery({
    queryKey: [
      'planner-events',
      activeOwnerId,
      view,
      rangeFrom.toISOString(),
      rangeTo.toISOString(),
    ],
    queryFn: () => fetchPlannerEvents(rangeFrom, rangeTo, activeOwnerId || undefined),
    enabled: !!activeOwnerId,
  });
  const events = eventsResult?.events ?? [];
  // Dono da agenda aberta = usuário logado → sempre pode editar
  const viewingOwnAgenda = !!meUser?.id && activeOwnerId === meUser.id;
  const canWriteEffective =
    viewingOwnAgenda ||
    eventsResult?.meta?.canWrite === true ||
    eventsResult?.meta?.isOwner === true ||
    (!eventsResult?.meta && canWrite);
  const isOwnerEffective =
    viewingOwnAgenda ||
    eventsResult?.meta?.isOwner === true ||
    (!eventsResult?.meta && isOwnAgenda);

  const { data: googleStatus } = useQuery({
    queryKey: ['planner-events', 'google-status'],
    queryFn: fetchGoogleCalendarStatus,
    staleTime: 60_000,
    enabled: isOwnerEffective,
  });

  // Tarefas com data (só na própria agenda)
  const { data: agendaTasks = [] } = useQuery({
    queryKey: ['planner-tasks', 'calendar', rangeFrom.toISOString(), rangeTo.toISOString()],
    queryFn: () =>
      fetchPlannerTasks({
        from: rangeFrom,
        to: rangeTo,
        withDue: true,
        includeCompleted: true,
      }),
    enabled: viewingOwnAgenda,
  });

  const tasksByDay = useMemo(() => {
    const map = new Map<string, PlannerTask[]>();
    for (const task of agendaTasks) {
      if (!task.dueDate) continue;
      const keyDays =
        view === 'month'
          ? monthCells
          : view === 'day' || view === 'week'
            ? days
            : [];
      for (const day of keyDays) {
        if (isSameDateOnly(day, task.dueDate)) {
          const k = day.toISOString();
          const list = map.get(k) || [];
          list.push(task);
          map.set(k, list);
        }
      }
    }
    return map;
  }, [agendaTasks, days, monthCells, view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'd') setView('day');
      if (key === 'w') setView('week');
      if (key === 'm') setView('month');
      if (key === 'y') setView('year');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const flag = searchParams?.get('googleCalendar');
    if (!flag) return;

    if (flag === 'connected') {
      toast.success('Google Calendar conectado! Sincronizando…');
      void (async () => {
        try {
          setSyncingGoogle(true);
          const syncFrom = addDays(rangeFrom, -7);
          const syncTo = addDays(rangeTo, 14);
          const result = await syncGoogleCalendar(syncFrom, syncTo);
          toast.success(
            `Sincronizado: ${result.imported} novo(s), ${result.updated} atualizado(s)` +
              (result.calendars ? ` · ${result.calendars} agenda(s)` : '')
          );
          queryClient.invalidateQueries({ queryKey: ['planner-events'] });
        } catch (err: any) {
          toast.error(err?.response?.data?.message || 'Erro ao sincronizar Google Calendar');
        } finally {
          setSyncingGoogle(false);
        }
      })();
    } else if (flag === 'error') {
      const reason = searchParams?.get('reason') || 'falha na conexão';
      toast.error(`Google Calendar: ${reason}`);
    }

    const next = new URLSearchParams(searchParams?.toString() || '');
    next.delete('googleCalendar');
    next.delete('reason');
    const qs = next.toString();
    const path = pathname ?? '/';
    router.replace(qs ? `${path}?${qs}` : path);
  }, [searchParams, pathname, router, rangeFrom, rangeTo, queryClient]);

  const handleGoogleSyncClick = async () => {
    if (!isOwnerEffective) {
      toast.error('Só o dono da agenda pode sincronizar o Google Calendar');
      return;
    }
    try {
      setSyncingGoogle(true);
      if (!googleStatus?.configured) {
        toast.error(
          'Google Calendar ainda não foi configurado no servidor (faltam as chaves OAuth).'
        );
        return;
      }
      if (!googleStatus.connected) {
        const returnTo =
          typeof window !== 'undefined'
            ? `${window.location.pathname}${window.location.search}`
            : '/ponto/agenda';
        const url = await fetchGoogleCalendarAuthUrl(returnTo);
        window.location.href = url;
        return;
      }
      const syncFrom = addDays(rangeFrom, -7);
      const syncTo = addDays(rangeTo, 14);
      const result = await syncGoogleCalendar(syncFrom, syncTo);
      toast.success(
        `Sincronizado: ${result.imported} novo(s), ${result.updated} atualizado(s)` +
          (result.calendars ? ` · ${result.calendars} agenda(s)` : '')
      );
      queryClient.invalidateQueries({ queryKey: ['planner-events'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao sincronizar Google Calendar');
    } finally {
      setSyncingGoogle(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        startAt: fromLocalInputValue(form.startAt),
        endAt: fromLocalInputValue(form.endAt),
        color: form.color,
        ownerId: activeOwnerId || undefined,
      };
      const saved = form.id
        ? await updatePlannerEvent(form.id, payload)
        : await createPlannerEvent(payload);

      if (pendingAtaFile) {
        setUploadingAta(true);
        try {
          return await uploadPlannerEventAta(saved.id, pendingAtaFile);
        } finally {
          setUploadingAta(false);
        }
      }
      return saved;
    },
    onSuccess: () => {
      toast.success(form.id ? 'Evento atualizado' : 'Evento criado');
      queryClient.invalidateQueries({ queryKey: ['planner-events'] });
      setFormOpen(false);
      setForm(EMPTY_FORM);
      setPendingAtaFile(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao salvar evento');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => deletePlannerEvent(id),
    onSuccess: () => {
      toast.success('Evento excluído');
      queryClient.invalidateQueries({ queryKey: ['planner-events'] });
      setFormOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao excluir evento');
    },
  });

  const openCreateAt = (day: Date, hour: number) => {
    if (!canWriteEffective) return;
    setPendingAtaFile(null);
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(hour + 1, 0, 0, 0);
    setForm({
      ...EMPTY_FORM,
      startAt: toLocalInputValue(start.toISOString()),
      endAt: toLocalInputValue(end.toISOString()),
    });
    setFormOpen(true);
  };

  const openCreateOnDay = (day: Date) => {
    if (!canWriteEffective) return;
    setPendingAtaFile(null);
    const start = new Date(day);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start);
    end.setHours(10, 0, 0, 0);
    setForm({
      ...EMPTY_FORM,
      startAt: toLocalInputValue(start.toISOString()),
      endAt: toLocalInputValue(end.toISOString()),
    });
    setFormOpen(true);
  };

  const openEdit = (event: PlannerEvent) => {
    setPendingAtaFile(null);
    setForm({
      id: event.id,
      title: event.title,
      description: event.description || '',
      startAt: toLocalInputValue(event.startAt),
      endAt: toLocalInputValue(event.endAt),
      color: event.color || COLOR_OPTIONS[0],
      ataFileName: event.ataFileName,
      ataFileUrl: event.ataFileUrl,
    });
    setFormOpen(true);
  };

  const goPrev = () => {
    if (view === 'day') setAnchor((a) => addDays(a, -1));
    else if (view === 'week') setAnchor((a) => addDays(a, -7));
    else if (view === 'month') setAnchor((a) => addMonths(a, -1));
    else setAnchor((a) => addYears(a, -1));
  };

  const goNext = () => {
    if (view === 'day') setAnchor((a) => addDays(a, 1));
    else if (view === 'week') setAnchor((a) => addDays(a, 7));
    else if (view === 'month') setAnchor((a) => addMonths(a, 1));
    else setAnchor((a) => addYears(a, 1));
  };

  const goToday = () => setAnchor(startOfDay(new Date()));

  useEffect(() => {
    if (view !== 'day' && view !== 'week') return;
    const el = gridScrollRef.current;
    if (!el) return;
    const hour = Math.max(0, new Date().getHours() - 1);
    const top = hour * ROW_HEIGHT;
    requestAnimationFrame(() => {
      el.scrollTop = top;
    });
  }, [view, anchor]);

  const periodLabel = useMemo(() => {
    const capitalizeFirst = (value: string) =>
      value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;

    if (view === 'day') {
      return capitalizeFirst(
        anchor.toLocaleDateString('pt-BR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      );
    }
    if (view === 'week' || view === 'month') {
      return capitalizeFirst(
        (view === 'week' ? startOfWeek(anchor) : anchor).toLocaleDateString('pt-BR', {
          month: 'long',
          year: 'numeric',
        })
      );
    }
    return String(anchor.getFullYear());
  }, [view, anchor]);

  const gridHeight = HOURS.length * ROW_HEIGHT;
  const dayCount = days.length || 1;
  const gridCols = `${TIME_COL_WIDTH}px repeat(${dayCount}, minmax(0, 1fr))`;

  const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 lg:flex-row lg:items-stretch lg:gap-4">
      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[248px]">
        {pageTitle ? (
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
              {pageTitle}
            </h1>
            {pageSubtitle ? (
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{pageSubtitle}</p>
            ) : null}
          </div>
        ) : null}
        {canWriteEffective && (
          <button
            type="button"
            onClick={() => {
              setPendingAtaFile(null);
              const now = new Date();
              const start = new Date(now);
              start.setMinutes(0, 0, 0);
              const end = new Date(start);
              end.setHours(start.getHours() + 1);
              setForm({
                ...EMPTY_FORM,
                startAt: toLocalInputValue(start.toISOString()),
                endAt: toLocalInputValue(end.toISOString()),
              });
              setFormOpen(true);
            }}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Criar evento</span>
          </button>
        )}
        <MiniMonthCalendar
          selected={anchor}
          onSelect={(day) => {
            setAnchor(day);
            if (view === 'month') setView('day');
          }}
        />
      </aside>

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-900">
              <button
                type="button"
                onClick={goPrev}
                aria-label="Período anterior"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="h-8 rounded-md px-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Próximo período"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <span className="text-base font-medium tracking-tight text-gray-900 dark:text-gray-100 sm:text-lg">
              {periodLabel}
            </span>
            {agendas.length > 1 && (
              <label className="ml-0.5 inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="sr-only sm:not-sr-only">Agenda</span>
                <select
                  value={activeOwnerId}
                  onChange={(e) => setSelectedOwnerId(e.target.value)}
                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800 outline-none transition-colors hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-gray-600"
                  title="Escolher agenda"
                  aria-label="Escolher agenda"
                >
                  {agendas.map((a) => (
                    <option key={a.ownerId} value={a.ownerId}>
                      {a.isMine ? 'Minha agenda' : a.name}
                      {!a.isMine && a.permission === 'READ' ? ' (só ver)' : ''}
                      {!a.isMine && a.permission === 'WRITE' ? ' (editar)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isOwnerEffective && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {canWriteEffective
                  ? `Editando agenda de ${activeAgenda?.name || 'outro usuário'}`
                  : `Vendo agenda de ${activeAgenda?.name || 'outro usuário'} (só ver)`}
              </span>
            )}
            {isOwnerEffective && (
              <div ref={actionsMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setActionsMenuOpen((v) => !v)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  aria-label="Mais opções"
                  aria-haspopup="menu"
                  aria-expanded={actionsMenuOpen}
                  title="Mais opções"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {actionsMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-40 mt-1.5 min-w-[220px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActionsMenuOpen(false);
                        setShareOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <Share2 className="h-4 w-4 shrink-0 text-gray-500" />
                      Compartilhar com alguém
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={syncingGoogle}
                      onClick={() => {
                        setActionsMenuOpen(false);
                        void handleGoogleSyncClick();
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <RefreshCw
                        className={`h-4 w-4 shrink-0 text-gray-500 ${syncingGoogle ? 'animate-spin' : ''}`}
                      />
                      {syncingGoogle
                        ? 'Sincronizando…'
                        : googleStatus?.connected
                          ? 'Sincronizar Google'
                          : 'Conectar ao Google'}
                    </button>
                    {googleStatus?.connected && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={async () => {
                          setActionsMenuOpen(false);
                          try {
                            await disconnectGoogleCalendarApi();
                            queryClient.invalidateQueries({
                              queryKey: ['planner-events', 'google-status'],
                            });
                            toast.success('Google Calendar desconectado');
                          } catch {
                            toast.error('Erro ao desconectar');
                          }
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
                      >
                        Desconectar Google
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <ViewSwitcher
              value={view}
              onChange={(next) => {
                setView(next);
                if (next === 'week') setAnchor((a) => startOfWeek(a));
                if (next === 'month') setAnchor((a) => startOfMonth(a));
                if (next === 'year') setAnchor((a) => startOfYear(a));
                if (next === 'day') setAnchor((a) => startOfDay(a));
              }}
            />
            {onModeChange && (
              <AgendaModeSwitcher mode={mode} onChange={onModeChange} />
            )}
          </div>
        </div>

      {(view === 'day' || view === 'week') && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200/80 bg-white dark:border-gray-700/80 dark:bg-gray-900">
          {/* Cabeçalho + grade no mesmo scroll: evita linhas tortas por causa da scrollbar */}
          <div
            ref={gridScrollRef}
            className="min-h-0 flex-1 overflow-auto"
            style={{ scrollbarGutter: 'stable' }}
          >
            <div
              className="sticky top-0 z-20 grid border-b border-gray-100 bg-white/95 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div className="border-r border-gray-100 dark:border-gray-800" />
              {days.map((day) => {
                const { weekday, day: dayNum } = dayHeaderLabel(day);
                const isToday = isSameDay(day, today);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => {
                      setAnchor(startOfDay(day));
                      setView('day');
                    }}
                    className="flex flex-col items-center gap-1 border-r border-gray-100 py-2.5 transition-colors hover:bg-gray-50/80 dark:border-gray-800 dark:hover:bg-gray-800/40"
                    title={`Abrir dia ${day.toLocaleDateString('pt-BR')}`}
                    aria-label={`Abrir agenda do dia ${day.toLocaleDateString('pt-BR')}`}
                  >
                    <span className="text-[11px] font-normal uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      {weekday}
                    </span>
                    <span
                      className={
                        isToday
                          ? 'flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-sm font-medium text-white'
                          : 'flex h-8 w-8 items-center justify-center rounded-full text-sm font-normal text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700'
                      }
                    >
                      {dayNum}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative" style={{ height: gridHeight }}>
              {/* Linhas verticais únicas (mesma grade do cabeçalho) */}
              <div
                className="pointer-events-none absolute inset-0 grid"
                style={{ gridTemplateColumns: gridCols }}
                aria-hidden
              >
                <div className="border-r border-gray-100 dark:border-gray-800" />
                {days.map((day) => (
                  <div
                    key={`vline-${day.toISOString()}`}
                    className="border-r border-gray-100 dark:border-gray-800"
                  />
                ))}
              </div>

              {HOURS.map((hour, idx) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 grid border-t border-gray-100 dark:border-gray-800"
                  style={{
                    top: idx * ROW_HEIGHT,
                    height: ROW_HEIGHT,
                    gridTemplateColumns: gridCols,
                  }}
                >
                  <div className="relative">
                    <span
                      className={`pointer-events-none absolute right-2 z-[1] bg-white px-0.5 text-[10px] leading-none text-gray-400 dark:bg-gray-900 dark:text-gray-500 ${
                        idx === 0
                          ? 'top-1'
                          : 'top-0 -translate-y-1/2'
                      }`}
                    >
                      {formatHourLabel(hour)}
                    </span>
                  </div>
                  {days.map((day) => (
                    <button
                      key={`${day.toISOString()}-${hour}`}
                      type="button"
                      onClick={() => openCreateAt(day, hour)}
                      className="hover:bg-red-50/40 dark:hover:bg-red-950/20"
                      aria-label={`Criar evento ${day.toLocaleDateString('pt-BR')} às ${hour}h`}
                    />
                  ))}
                </div>
              ))}

              <div
                className="pointer-events-none absolute inset-0 grid"
                style={{ gridTemplateColumns: gridCols }}
              >
                <div />
                {days.map((day) => {
                  const dayEvents = events.filter((ev) => isSameDay(new Date(ev.startAt), day));
                  const dayTasks = viewingOwnAgenda
                    ? tasksByDay.get(day.toISOString()) || []
                    : [];
                  const gridStart = HOUR_START * 60;
                  const gridEnd = (HOUR_END + 1) * 60;
                  return (
                    <div key={day.toISOString()} className="relative min-w-0">
                      {dayEvents.map((ev) => {
                        const start = new Date(ev.startAt);
                        const end = new Date(ev.endAt);
                        const startMinutes = start.getHours() * 60 + start.getMinutes();
                        const endMinutes = end.getHours() * 60 + end.getMinutes();
                        const clampedStart = Math.max(startMinutes, gridStart);
                        const clampedEnd = Math.min(endMinutes, gridEnd);
                        if (clampedEnd <= clampedStart) return null;
                        const top = ((clampedStart - gridStart) / 60) * ROW_HEIGHT;
                        const height = Math.max(
                          36,
                          ((clampedEnd - clampedStart) / 60) * ROW_HEIGHT - 2
                        );
                        return (
                          <EventBlock
                            key={ev.id}
                            event={ev}
                            top={top}
                            height={height}
                            onEdit={openEdit}
                          />
                        );
                      })}
                      {dayTasks.map((task) => {
                        if (!task.dueDate) return null;
                        const due = new Date(task.dueDate);
                        if (Number.isNaN(due.getTime())) return null;
                        const startMinutes = due.getHours() * 60 + due.getMinutes();
                        const endMinutes = startMinutes + 30;
                        const clampedStart = Math.max(startMinutes, gridStart);
                        const clampedEnd = Math.min(endMinutes, gridEnd);
                        if (clampedEnd <= clampedStart) return null;
                        const top = ((clampedStart - gridStart) / 60) * ROW_HEIGHT;
                        const height = Math.max(
                          22,
                          ((clampedEnd - clampedStart) / 60) * ROW_HEIGHT - 2
                        );
                        const timeLabel = toTimeInputValue(task.dueDate);
                        return (
                          <button
                            key={`task-block-${task.id}`}
                            type="button"
                            onClick={() => {
                              void updatePlannerTask(task.id, {
                                completed: !task.completed,
                              }).then(() => {
                                queryClient.invalidateQueries({ queryKey: ['planner-tasks'] });
                              });
                            }}
                            className={`pointer-events-auto absolute left-1 right-1 z-[2] overflow-hidden rounded-md border px-1.5 py-0.5 text-left shadow-sm ${
                              task.completed
                                ? 'border-gray-300 bg-gray-100 text-gray-400 line-through dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                                : 'border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-950/70 dark:text-amber-100'
                            }`}
                            style={{ top, height }}
                            title={timeLabel ? `${timeLabel} · ${task.title}` : task.title}
                          >
                            <span className="flex items-center gap-1 text-[11px] font-semibold leading-tight">
                              <CheckSquare className="h-3 w-3 shrink-0" />
                              <span className="truncate">
                                {timeLabel ? `${timeLabel} ` : ''}
                                {task.title}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {isLoading && (
            <div className="border-t border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Carregando agenda…
            </div>
          )}
        </div>
      )}

      {view === 'month' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200/80 bg-white dark:border-gray-700/80 dark:bg-gray-900">
          <div className="grid shrink-0 grid-cols-7 border-b border-gray-100 dark:border-gray-800">
            {weekdayNames.map((name) => (
              <div
                key={name}
                className="px-2 py-2 text-center text-[11px] font-normal uppercase tracking-wide text-gray-400 dark:text-gray-500"
              >
                {name}
              </div>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
            {monthCells.map((day) => {
              const inMonth = isSameMonth(day, anchor);
              const isToday = isSameDay(day, today);
              const dayEvents = events.filter((ev) => isSameDay(new Date(ev.startAt), day));
              const dayTasks = viewingOwnAgenda
                ? tasksByDay.get(day.toISOString()) || []
                : [];
              return (
                <div
                  key={day.toISOString()}
                  className={`flex h-full min-h-0 flex-col border-b border-r border-gray-200 p-1.5 dark:border-gray-700 ${
                    inMonth ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-950/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setAnchor(startOfDay(day));
                      setView('day');
                    }}
                    className={`mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      isToday
                        ? 'bg-red-600 text-white'
                        : inMonth
                          ? 'text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800'
                          : 'text-gray-400 hover:bg-gray-100 dark:text-gray-600'
                    }`}
                  >
                    {day.getDate()}
                  </button>
                  <div className="flex min-h-0 flex-1 flex-col gap-0.5">
                    {dayTasks.slice(0, 2).map((task) => {
                      const timeLabel = toTimeInputValue(task.dueDate);
                      return (
                        <span
                          key={task.id}
                          className={`truncate rounded px-1 py-0.5 text-[11px] font-semibold ${
                            task.completed
                              ? 'bg-gray-100 text-gray-400 line-through dark:bg-gray-800'
                              : 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
                          }`}
                          title={timeLabel ? `${timeLabel} · ${task.title}` : task.title}
                        >
                          ✓ {timeLabel ? `${timeLabel} ` : ''}
                          {task.title}
                        </span>
                      );
                    })}
                    {dayEvents.slice(0, 3).map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => openEdit(ev)}
                        className="truncate rounded px-1 py-0.5 text-left text-[11px] font-semibold text-white"
                        style={{ backgroundColor: ev.color || COLOR_OPTIONS[0] }}
                        title={ev.title}
                      >
                        {ev.title}
                      </button>
                    ))}
                    {dayEvents.length + dayTasks.length > 4 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAnchor(startOfDay(day));
                          setView('day');
                        }}
                        className="px-1 text-left text-[11px] font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400"
                      >
                        +{dayEvents.length + dayTasks.length - 4} mais
                      </button>
                    )}
                    {dayEvents.length === 0 && dayTasks.length === 0 && inMonth && (
                      <button
                        type="button"
                        onClick={() => openCreateOnDay(day)}
                        className="mt-auto h-full min-h-[28px] w-full rounded hover:bg-red-50/60 dark:hover:bg-red-950/20"
                        aria-label={`Criar evento em ${day.toLocaleDateString('pt-BR')}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {isLoading && (
            <div className="shrink-0 border-t border-gray-200 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Carregando agenda…
            </div>
          )}
        </div>
      )}

      {view === 'year' && (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="grid h-full min-h-[640px] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:grid-rows-3">
            {Array.from({ length: 12 }, (_, monthIdx) => {
              const monthDate = new Date(anchor.getFullYear(), monthIdx, 1);
              const monthLabel = monthDate.toLocaleDateString('pt-BR', { month: 'long' });
              const cellsStart = startOfWeek(monthDate);
              const cells = Array.from({ length: 42 }, (_, i) => addDays(cellsStart, i));
              return (
                <button
                  key={monthIdx}
                  type="button"
                  onClick={() => {
                    setAnchor(startOfMonth(monthDate));
                    setView('month');
                  }}
                  className="flex h-full min-h-0 flex-col rounded-xl border border-gray-200/80 bg-white p-3 text-left transition-colors hover:border-red-300 hover:shadow-sm dark:border-gray-700/80 dark:bg-gray-900 dark:hover:border-red-800"
                >
                  <div className="mb-2 shrink-0 text-sm font-semibold capitalize text-gray-800 dark:text-gray-100">
                    {monthLabel}
                  </div>
                  <div className="grid shrink-0 grid-cols-7 gap-px text-center text-[10px] text-gray-400">
                    {weekdayNames.map((n) => (
                      <span key={n}>{n[0]}</span>
                    ))}
                  </div>
                  <div className="mt-1 grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-px text-center">
                    {cells.map((day) => {
                      const inMonth = day.getMonth() === monthIdx;
                      const isToday = isSameDay(day, today);
                      const hasEvents =
                        inMonth &&
                        events.some((ev) => isSameDay(new Date(ev.startAt), day));
                      return (
                        <span
                          key={day.toISOString()}
                          className={`flex h-full min-h-0 items-center justify-center rounded-full text-[11px] ${
                            isToday
                              ? 'bg-red-600 font-bold text-white'
                              : inMonth
                                ? hasEvents
                                  ? 'font-semibold text-red-600 dark:text-red-400'
                                  : 'text-gray-700 dark:text-gray-200'
                                : 'text-gray-300 dark:text-gray-700'
                          }`}
                        >
                          {day.getDate()}
                        </span>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      </div>

      <Modal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setForm(EMPTY_FORM);
          setPendingAtaFile(null);
        }}
        title={
          !canWriteEffective
            ? 'Detalhes do evento'
            : form.id
              ? 'Editar evento'
              : 'Novo evento'
        }
        size="md"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canWriteEffective) return;
            if (!form.title.trim()) {
              toast.error('Informe o título');
              return;
            }
            if (!form.startAt || !form.endAt) {
              toast.error('Informe a data e os horários');
              return;
            }
            if (form.endAt <= form.startAt) {
              toast.error('O término deve ser depois do início');
              return;
            }
            saveMutation.mutate();
          }}
        >
          {!canWriteEffective && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              Agenda em modo somente leitura — você pode ver, mas não alterar.
            </p>
          )}
          <div>
            <label className={kanbanLabel}>Título</label>
            <input
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-70 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex.: Reunião de alinhamento"
              autoFocus={canWriteEffective}
              disabled={!canWriteEffective}
              readOnly={!canWriteEffective}
            />
          </div>
          <div>
            <label className={kanbanLabel}>Data *</label>
            <DatePickerField
              value={splitDateTime(form.startAt).date}
              onChange={(ymd) => {
                if (!canWriteEffective) return;
                if (!ymd) {
                  setForm({ ...form, startAt: '', endAt: '' });
                  return;
                }
                const startTime = splitDateTime(form.startAt).time || '09:00';
                const endTime =
                  splitDateTime(form.endAt).time || addOneHourHm(startTime);
                setForm({
                  ...form,
                  startAt: combineDateAndTime(ymd, startTime),
                  endAt: combineDateAndTime(ymd, endTime),
                });
              }}
              placeholder="dd/mm/aaaa"
              noFocusRing
              disabled={!canWriteEffective}
              aria-label="Data do evento"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={kanbanLabel}>Hora de início *</label>
              <TimePickerField
                value={form.startAt ? splitDateTime(form.startAt).time : ''}
                disabled={!canWriteEffective || !splitDateTime(form.startAt).date}
                onChange={(time) => {
                  if (!canWriteEffective) return;
                  const date = splitDateTime(form.startAt).date;
                  if (!date) return;
                  const nextStart = combineDateAndTime(date, time || '09:00');
                  const endTime = splitDateTime(form.endAt).time || addOneHourHm(time || '09:00');
                  let nextEnd = combineDateAndTime(date, endTime);
                  if (nextEnd <= nextStart) {
                    nextEnd = combineDateAndTime(date, addOneHourHm(time || '09:00'));
                  }
                  setForm({ ...form, startAt: nextStart, endAt: nextEnd });
                }}
                noFocusRing
                aria-label="Hora de início"
              />
            </div>
            <div>
              <label className={kanbanLabel}>Hora de término *</label>
              <TimePickerField
                value={form.endAt ? splitDateTime(form.endAt).time : ''}
                disabled={!canWriteEffective || !splitDateTime(form.startAt).date}
                minTime={form.startAt ? splitDateTime(form.startAt).time : undefined}
                onChange={(time) => {
                  if (!canWriteEffective) return;
                  const date = splitDateTime(form.startAt).date;
                  if (!date) return;
                  setForm({
                    ...form,
                    endAt: combineDateAndTime(date, time || '10:00'),
                  });
                }}
                noFocusRing
                aria-label="Hora de término"
              />
            </div>
          </div>
          <div>
            <label className={kanbanLabel}>
              Descrição
            </label>
            <textarea
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-70 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Opcional"
              disabled={!canWriteEffective}
              readOnly={!canWriteEffective}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Ata da reunião (PDF)
            </label>
            <input
              ref={ataInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                e.target.value = '';
                if (!file) return;
                if (
                  file.type &&
                  file.type !== 'application/pdf' &&
                  !file.name.toLowerCase().endsWith('.pdf')
                ) {
                  toast.error('Envie apenas PDF');
                  return;
                }
                if (file.size > 10 * 1024 * 1024) {
                  toast.error('PDF muito grande (máx. 10MB)');
                  return;
                }
                setPendingAtaFile(file);
              }}
            />
            {pendingAtaFile || form.ataFileUrl ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/60">
                <FileText className="h-4 w-4 shrink-0 text-red-600" />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-100">
                  {pendingAtaFile?.name || form.ataFileName || 'ata.pdf'}
                  {pendingAtaFile ? ' (novo — salve para enviar)' : ''}
                </span>
                <button
                  type="button"
                  title="Baixar ata"
                  aria-label="Baixar ata"
                  onClick={async () => {
                    try {
                      if (pendingAtaFile) {
                        const url = URL.createObjectURL(pendingAtaFile);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = pendingAtaFile.name || 'ata.pdf';
                        a.click();
                        URL.revokeObjectURL(url);
                        return;
                      }
                      if (!form.ataFileUrl) return;
                      await downloadPlannerEventAta(
                        form.ataFileUrl,
                        form.ataFileName || 'ata.pdf'
                      );
                    } catch {
                      toast.error('Erro ao baixar a ata');
                    }
                  }}
                  className="rounded-md p-1.5 text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Download className="h-4 w-4" />
                </button>
                {canWriteEffective && (
                  <>
                    <button
                      type="button"
                      title="Trocar PDF"
                      aria-label="Trocar PDF"
                      onClick={() => ataInputRef.current?.click()}
                      className="rounded-md p-1.5 text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <Upload className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Remover ata"
                      aria-label="Remover ata"
                      onClick={async () => {
                        if (pendingAtaFile) {
                          setPendingAtaFile(null);
                          return;
                        }
                        if (!form.id || !form.ataFileUrl) return;
                        if (!confirm('Remover o PDF da ata?')) return;
                        try {
                          setUploadingAta(true);
                          const updated = await deletePlannerEventAta(form.id);
                          setForm((f) => ({
                            ...f,
                            ataFileName: updated.ataFileName,
                            ataFileUrl: updated.ataFileUrl,
                          }));
                          queryClient.invalidateQueries({ queryKey: ['planner-events'] });
                          toast.success('Ata removida');
                        } catch (err: any) {
                          toast.error(err?.response?.data?.message || 'Erro ao remover ata');
                        } finally {
                          setUploadingAta(false);
                        }
                      }}
                      className="rounded-md p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            ) : canWriteEffective ? (
              <button
                type="button"
                onClick={() => ataInputRef.current?.click()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm font-medium text-gray-600 hover:border-red-300 hover:bg-red-50/40 hover:text-red-700 dark:border-gray-600 dark:text-gray-300 dark:hover:border-red-800 dark:hover:bg-red-950/20"
              >
                <Upload className="h-4 w-4" />
                Importar PDF da ata
              </button>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma ata anexada.</p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Cor
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={!canWriteEffective}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`h-7 w-7 rounded-full border-2 disabled:cursor-default ${
                    form.color === c ? 'border-gray-900 dark:border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-2">
            {canWriteEffective && form.id ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Excluir este evento?')) deleteMutation.mutate(form.id!);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
                Excluir
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFormOpen(false);
                  setForm(EMPTY_FORM);
                }}
              >
                {canWriteEffective ? 'Cancelar' : 'Fechar'}
              </Button>
              {canWriteEffective && (
              <Button type="submit" disabled={saveMutation.isPending || uploadingAta}>
                {saveMutation.isPending || uploadingAta ? 'Salvando…' : 'Salvar'}
              </Button>
              )}
            </div>
          </div>
        </form>
      </Modal>

      <PlannerAgendaShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        currentUserId={meUser?.id}
        ownerUser={
          meUser
            ? {
                id: meUser.id,
                name: meUser.name,
                email: meUser.email ?? '',
                profilePhotoUrl: meUser.profilePhotoUrl ?? null,
              }
            : null
        }
      />
    </div>
  );
}
