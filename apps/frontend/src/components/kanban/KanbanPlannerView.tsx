'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  RefreshCw,
  Share2,
  FileText,
  Upload,
  Download,
  X,
  CheckSquare,
  MoreVertical,
  Plus,
  Users,
  Phone,
  BarChart3,
  Star,
  CheckCircle2,
  Plane,
  Coffee,
  MapPin,
  Briefcase,
  Eye,
  Wrench,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { usePermissions } from '@/hooks/usePermissions';
import { useTheme } from '@/context/ThemeContext';
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
  plannerPastelFromColor,
  syncGoogleCalendar,
  updatePlannerEvent,
  uploadPlannerEventAta,
  type PlannerEvent,
  type PlannerEventAttendee,
} from '@/lib/plannerEvents';
import {
  fetchPlannerTasks,
  isSameDateOnly,
  toTimeInputValue,
  updatePlannerTask,
  type PlannerTask,
} from '@/lib/plannerTasks';
import { fetchGestaoOsAgenda } from '@/lib/gestaoOsAgenda';
import {
  AgendaModeSwitcher,
  type AgendaSurfaceMode,
} from './AgendaModeSwitcher';
import { kanbanLabel } from './kanbanFormStyles';
import { splitDateTime } from './kanbanDateTime';
import { KanbanMemberPickerModal, type KanbanPickerUser } from './KanbanMemberPickerModal';
import { KanbanMemberChip } from './KanbanMemberChip';
import { KanbanUserAvatar } from './KanbanUserAvatar';
import { kanbanAvatarColorForKey } from './kanbanAvatar';

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

const PLANNER_ICON_OPTIONS: {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}[] = [
  { id: 'meeting', label: 'Reunião', Icon: Users },
  { id: 'phone', label: 'Ligação', Icon: Phone },
  { id: 'chart', label: 'Vendas', Icon: BarChart3 },
  { id: 'star', label: 'Destaque', Icon: Star },
  { id: 'check', label: 'Tarefa', Icon: CheckCircle2 },
  { id: 'plane', label: 'Viagem', Icon: Plane },
  { id: 'coffee', label: 'Café', Icon: Coffee },
  { id: 'users', label: 'Equipe', Icon: Users },
  { id: 'map-pin', label: 'Local', Icon: MapPin },
  { id: 'briefcase', label: 'Trabalho', Icon: Briefcase },
  { id: 'wrench', label: 'Manutenção', Icon: Wrench },
];

function PlannerEventIconView({
  icon,
  className,
  style,
}: {
  icon?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const opt = PLANNER_ICON_OPTIONS.find((o) => o.id === icon);
  if (!opt) return null;
  const Icon = opt.Icon;
  return <Icon className={className} style={style} />;
}

function formatEventTimeRange(startAt: string, endAt: string): string {
  const start = toTimeInputValue(startAt);
  const end = toTimeInputValue(endAt);
  if (!start) return '';
  return end ? `${start} – ${end}` : start;
}

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
  userId?: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  color: string;
  icon: string | null;
  attendees: PlannerEventAttendee[];
  ataFileName?: string | null;
  ataFileUrl?: string | null;
};

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  startAt: '',
  endAt: '',
  color: COLOR_OPTIONS[0],
  icon: null,
  attendees: [],
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
    <SegmentedControl
      value={value}
      onChange={onChange}
      aria-label="Visualização do calendário"
      options={VIEW_OPTIONS.map((opt) => ({
        value: opt.id,
        title: `${opt.label} (${opt.shortcut})`,
        label: opt.label,
      }))}
    />
  );
}

function EventAttendeeAvatars({
  attendees,
  ringColor,
  mutedColor,
  size = 'md',
}: {
  attendees: PlannerEventAttendee[];
  ringColor: string;
  mutedColor: string;
  size?: 'sm' | 'md';
}) {
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
  if (attendees.length === 0) return null;

  const visible = attendees.slice(0, 3);
  const avatarClass =
    size === 'md' ? '!h-7 !w-7 !text-[10px]' : '!h-6 !w-6 !text-[9px]';
  const overflowClass =
    size === 'md'
      ? 'inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold'
      : 'inline-flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold';

  return (
    <div className="flex min-w-0 items-center -space-x-1.5">
      {visible.map((u, index) => {
        const isHovered = hoveredUserId === u.id;
        return (
          <div
            key={u.id}
            className="relative rounded-full"
            style={{
              zIndex: isHovered ? visible.length + 10 : visible.length - index,
              boxShadow: `0 0 0 2px ${ringColor}`,
            }}
            onMouseEnter={(e) => {
              e.stopPropagation();
              setHoveredUserId(u.id);
            }}
            onMouseLeave={() => setHoveredUserId(null)}
          >
            <KanbanUserAvatar
              name={u.name}
              profilePhotoUrl={u.profilePhotoUrl}
              colorKey={u.id}
              size="sm"
              showNativeTitle={false}
              className={`${avatarClass} transition-transform duration-150 ${
                isHovered ? 'scale-110' : ''
              }`}
            />
            {isHovered ? (
              <div
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 shadow-lg dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                {u.name}
              </div>
            ) : null}
          </div>
        );
      })}
      {attendees.length > 3 ? (
        <span
          className={overflowClass}
          style={{
            zIndex: 0,
            backgroundColor: mutedColor,
            color: '#fff',
            boxShadow: `0 0 0 2px ${ringColor}`,
          }}
        >
          +{attendees.length - 3}
        </span>
      ) : null}
    </div>
  );
}

function EventBlockMenu({
  event,
  iconClassName,
  iconColor,
  canDelete,
  onEdit,
  onDelete,
}: {
  event: PlannerEvent;
  iconClassName: string;
  iconColor: string;
  canDelete?: boolean;
  onEdit: (event: PlannerEvent) => void;
  onDelete?: (event: PlannerEvent) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((open) => !open);
        }}
        className="-m-1 rounded-md p-1 opacity-70 transition-opacity hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        style={{ color: iconColor }}
        aria-label="Opções do evento"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="Opções"
      >
        <MoreVertical className={iconClassName} aria-hidden />
      </button>
      {menuOpen ? (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-50 mb-1 min-w-[9.5rem] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              onEdit(event);
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <Eye className="h-4 w-4 shrink-0 text-gray-500" />
            Ver
          </button>
          {canDelete && onDelete ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete(event);
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              Remover
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EventBlock({
  event,
  top,
  height,
  onEdit,
  onDelete,
  canDelete,
}: {
  event: PlannerEvent;
  top: number;
  height: number;
  onEdit: (event: PlannerEvent) => void;
  onDelete?: (event: PlannerEvent) => void;
  canDelete?: boolean;
}) {
  const { isDark } = useTheme();
  const pastel = plannerPastelFromColor(event.color || COLOR_OPTIONS[0], isDark);
  const attendees = event.attendees || [];
  const timeLabel = formatEventTimeRange(event.startAt, event.endAt);
  /** Layout em coluna (ícone → título → horário → avatar), como o card de referência. */
  const isSpacious = height >= 100;
  const showMeta = height >= 70;
  const showFooter = height >= 92;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onEdit(event);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onEdit(event);
        }
      }}
      className={`pointer-events-auto absolute left-1 right-1 z-10 flex cursor-pointer flex-col overflow-hidden text-left shadow-sm transition-shadow hover:shadow-md ${
        isSpacious ? 'rounded-2xl px-3 py-2.5' : 'rounded-xl px-2 py-1'
      }`}
      style={{
        top,
        height,
        backgroundColor: pastel.bg,
        color: pastel.text,
        minHeight: attendees.length > 0 ? 92 : 52,
      }}
      aria-label={event.ataFileUrl ? `${event.title} · Ata PDF anexada` : event.title}
    >
      {isSpacious ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-1.5">
            <PlannerEventIconView
              icon={event.icon}
              className="h-5 w-5 shrink-0"
              style={{ color: pastel.text }}
            />
            {event.ataFileUrl ? (
              <FileText className="h-4 w-4 shrink-0 opacity-80" style={{ color: pastel.muted }} />
            ) : null}
          </div>
          <span className="mt-2 line-clamp-3 break-words text-sm font-bold leading-snug tracking-tight sm:text-[15px]">
            {event.title}
          </span>
          {timeLabel ? (
            <span
              className="mt-1.5 truncate text-xs font-medium sm:text-[13px]"
              style={{ color: pastel.muted }}
            >
              {timeLabel}
            </span>
          ) : null}
          {showFooter ? (
            <div className="mt-auto flex items-center justify-between gap-2 pt-3">
              <EventAttendeeAvatars
                attendees={attendees}
                ringColor={pastel.bg}
                mutedColor={pastel.muted}
                size="md"
              />
              <EventBlockMenu
                event={event}
                iconClassName="h-4 w-4"
                iconColor={pastel.text}
                canDelete={canDelete}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 items-start gap-1.5">
            <PlannerEventIconView
              icon={event.icon}
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              style={{ color: pastel.text }}
            />
            {event.ataFileUrl ? (
              <FileText
                className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80"
                style={{ color: pastel.muted }}
              />
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5">
              <span className="line-clamp-2 break-words text-xs font-bold leading-tight sm:text-[13px]">
                {event.title}
              </span>
              {showMeta && timeLabel ? (
                <span
                  className="truncate text-[10px] font-medium leading-tight"
                  style={{ color: pastel.muted }}
                >
                  {timeLabel}
                </span>
              ) : null}
            </div>
            {showFooter && attendees.length === 0 ? (
              <EventBlockMenu
                event={event}
                iconClassName="h-3.5 w-3.5"
                iconColor={pastel.text}
                canDelete={canDelete}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ) : null}
          </div>
          {showFooter && attendees.length > 0 ? (
            <div className="mt-1 flex shrink-0 items-center justify-between">
              <EventAttendeeAvatars
                attendees={attendees}
                ringColor={pastel.bg}
                mutedColor={pastel.muted}
                size="sm"
              />
              <EventBlockMenu
                event={event}
                iconClassName="h-3.5 w-3.5"
                iconColor={pastel.text}
                canDelete={canDelete}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
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
  const { isDark } = useTheme();
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
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [hoveringAttendeeId, setHoveringAttendeeId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
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

  const { data: gestaoOsAgenda = [] } = useQuery({
    queryKey: [
      'gestao-os-agenda',
      activeOwnerId,
      rangeFrom.toISOString(),
      rangeTo.toISOString()
    ],
    queryFn: () => fetchGestaoOsAgenda(rangeFrom, rangeTo, activeOwnerId || undefined),
    enabled: !!activeOwnerId
  });

  const calendarEvents = useMemo<PlannerEvent[]>(() => {
    const linked: PlannerEvent[] = gestaoOsAgenda.map((item) => ({
      id: item.id,
      userId: activeOwnerId || '',
      title: item.title,
      description: item.description || '',
      startAt: item.startAt,
      endAt: item.endAt,
      color: item.color,
      icon: item.kind === 'plan' ? 'check' : 'wrench',
      href: item.href,
      source: item.kind === 'plan' ? 'gestao-os-plan' : 'gestao-os'
    }));
    return [...events, ...linked];
  }, [events, gestaoOsAgenda, activeOwnerId]);
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

  /** Só o dono (ou quem tem WRITE na agenda do dono) edita; attendee vê leitura. */
  const formCanWrite =
    canWriteEffective &&
    (!form.id || !form.userId || form.userId === activeOwnerId);

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
        icon: form.icon,
        attendeeIds: form.attendees.map((a) => a.id),
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
      setMemberPickerOpen(false);
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
    if (event.href) {
      router.push(event.href);
      return;
    }
    setPendingAtaFile(null);
    setMemberPickerOpen(false);
    setForm({
      id: event.id,
      userId: event.userId,
      title: event.title,
      description: event.description || '',
      startAt: toLocalInputValue(event.startAt),
      endAt: toLocalInputValue(event.endAt),
      color: event.color || COLOR_OPTIONS[0],
      icon: event.icon || null,
      attendees: event.attendees || [],
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

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const nowIndicatorTop = useMemo(() => {
    const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const gridStart = HOUR_START * 60;
    const gridEnd = (HOUR_END + 1) * 60;
    if (minutes < gridStart || minutes > gridEnd) return null;
    return ((minutes - gridStart) / 60) * ROW_HEIGHT;
  }, [now]);

  const nowDayIndex = useMemo(
    () => days.findIndex((day) => isSameDay(day, startOfDay(now))),
    [days, now]
  );

  const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-4">
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
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
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
            <div className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-900">
              <button
                type="button"
                onClick={goPrev}
                aria-label="Período anterior"
                className="inline-flex h-full w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="h-full rounded-md px-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label="Próximo período"
                className="inline-flex h-full w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <span className="text-base font-medium tracking-tight text-gray-900 dark:text-gray-100 sm:text-lg">
              {periodLabel}
            </span>
            {gestaoOsAgenda.length > 0 ? (
              <span className="hidden text-xs text-gray-500 sm:inline dark:text-gray-400">
                Inclui prazos de OS e planos de manutenção
              </span>
            ) : null}
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
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
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
                      Compartilhar
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

              {nowIndicatorTop != null && nowDayIndex >= 0 ? (
                <div
                  className="pointer-events-none absolute left-0 right-0 z-30 grid"
                  style={{ top: nowIndicatorTop, gridTemplateColumns: gridCols }}
                  aria-hidden
                >
                  <div />
                  {days.map((day, index) => (
                    <div key={`now-${day.toISOString()}`} className="relative">
                      {index === nowDayIndex ? (
                        <>
                          <span className="absolute left-0 top-0 z-[1] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600 shadow-sm" />
                          <span className="absolute left-0 right-0 top-0 h-0.5 -translate-y-1/2 bg-red-600" />
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <div
                className="pointer-events-none absolute inset-0 grid"
                style={{ gridTemplateColumns: gridCols }}
              >
                <div />
                {days.map((day) => {
                  const dayEvents = calendarEvents.filter((ev) => isSameDay(new Date(ev.startAt), day));
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
                        const minH = (ev.attendees?.length || 0) > 0 ? 92 : 52;
                        const height = Math.max(
                          minH,
                          ((clampedEnd - clampedStart) / 60) * ROW_HEIGHT - 2
                        );
                        return (
                          <EventBlock
                            key={ev.id}
                            event={ev}
                            top={top}
                            height={height}
                            onEdit={openEdit}
                            canDelete={canWriteEffective && !ev.href}
                            onDelete={(event) => {
                              if (confirm('Excluir este evento?')) {
                                deleteMutation.mutate(event.id);
                              }
                            }}
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
              const dayEvents = calendarEvents.filter((ev) => isSameDay(new Date(ev.startAt), day));
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
                    {dayEvents.slice(0, 3).map((ev) => {
                      const pastel = plannerPastelFromColor(ev.color || COLOR_OPTIONS[0], isDark);
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => openEdit(ev)}
                          className="flex items-center gap-1 truncate rounded-lg px-1.5 py-0.5 text-left text-[11px] font-semibold"
                          style={{ backgroundColor: pastel.bg, color: pastel.text }}
                          title={ev.title}
                        >
                          <PlannerEventIconView
                            icon={ev.icon}
                            className="h-3 w-3 shrink-0"
                            style={{ color: pastel.muted }}
                          />
                          <span className="truncate">{ev.title}</span>
                        </button>
                      );
                    })}
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
                        calendarEvents.some((ev) => isSameDay(new Date(ev.startAt), day));
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
          !formCanWrite
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
            if (!formCanWrite) return;
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
          {!formCanWrite && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {form.userId && form.userId !== activeOwnerId
                ? 'Você foi convidado para este evento — somente leitura na sua agenda.'
                : 'Agenda em modo somente leitura — você pode ver, mas não alterar.'}
            </p>
          )}
          <div>
            <label className={kanbanLabel}>Ícone</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={!formCanWrite}
                onClick={() => setForm({ ...form, icon: null })}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-xs font-medium disabled:cursor-default ${
                  !form.icon
                    ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                    : 'border-gray-200 text-gray-400 hover:border-gray-300 dark:border-gray-600'
                }`}
                title="Sem ícone"
              >
                —
              </button>
              {PLANNER_ICON_OPTIONS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  disabled={!formCanWrite}
                  title={label}
                  onClick={() => setForm({ ...form, icon: id })}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border disabled:cursor-default ${
                    form.icon === id
                      ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-600 dark:text-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={kanbanLabel}>Título</label>
            <input
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-70 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex.: Reunião de alinhamento"
              autoFocus={formCanWrite}
              disabled={!formCanWrite}
              readOnly={!formCanWrite}
            />
          </div>
          <div>
            <label className={kanbanLabel}>Data *</label>
            <DatePickerField
              value={splitDateTime(form.startAt).date}
              onChange={(ymd) => {
                if (!formCanWrite) return;
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
              disabled={!formCanWrite}
              aria-label="Data do evento"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={kanbanLabel}>Hora de início *</label>
              <TimePickerField
                value={form.startAt ? splitDateTime(form.startAt).time : ''}
                disabled={!formCanWrite || !splitDateTime(form.startAt).date}
                onChange={(time) => {
                  if (!formCanWrite) return;
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
                disabled={!formCanWrite || !splitDateTime(form.startAt).date}
                minTime={form.startAt ? splitDateTime(form.startAt).time : undefined}
                onChange={(time) => {
                  if (!formCanWrite) return;
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
              disabled={!formCanWrite}
              readOnly={!formCanWrite}
            />
          </div>

          <div className="flex flex-col">
            <label className={kanbanLabel}>Pessoas</label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {form.attendees.map((u) =>
                formCanWrite ? (
                  <KanbanMemberChip
                    key={u.id}
                    userId={u.id}
                    name={u.name}
                    profilePhotoUrl={u.profilePhotoUrl}
                    avatarColor={kanbanAvatarColorForKey(u.id)}
                    isHovering={hoveringAttendeeId === u.id}
                    onHover={(hovering) => setHoveringAttendeeId(hovering ? u.id : null)}
                    onRemove={() =>
                      setForm({
                        ...form,
                        attendees: form.attendees.filter((a) => a.id !== u.id),
                      })
                    }
                  />
                ) : (
                  <span key={u.id} title={u.name} className="inline-flex shrink-0">
                    <KanbanUserAvatar
                      name={u.name}
                      profilePhotoUrl={u.profilePhotoUrl}
                      colorClass={kanbanAvatarColorForKey(u.id)}
                      size="md"
                      className="!h-10 !w-10 !text-xs"
                    />
                  </span>
                )
              )}
              {formCanWrite &&
                meUser &&
                !form.attendees.some((a) => a.id === meUser.id) && (
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        attendees: [
                          ...f.attendees,
                          {
                            id: meUser.id,
                            name: meUser.name,
                            email: meUser.email ?? '',
                            profilePhotoUrl: meUser.profilePhotoUrl ?? null,
                          },
                        ],
                      }))
                    }
                    className="h-10 shrink-0 rounded-full border-2 border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    title="Atribuir evento a mim"
                  >
                    Atribuir a mim
                  </button>
                )}
              {formCanWrite && (
                <button
                  type="button"
                  onClick={() => setMemberPickerOpen(true)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-white text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500 dark:hover:text-gray-300"
                  title="Adicionar pessoa"
                >
                  <Plus className="h-5 w-5" />
                </button>
              )}
            </div>
            {form.attendees.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Ninguém atribuído. Quem for adicionado verá este evento na própria agenda.
              </p>
            ) : null}
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
                {formCanWrite && (
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
            ) : formCanWrite ? (
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
                  disabled={!formCanWrite}
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
            {formCanWrite && form.id ? (
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
                  setMemberPickerOpen(false);
                }}
              >
                {formCanWrite ? 'Cancelar' : 'Fechar'}
              </Button>
              {formCanWrite && (
              <Button type="submit" disabled={saveMutation.isPending || uploadingAta}>
                {saveMutation.isPending || uploadingAta ? 'Salvando…' : 'Salvar'}
              </Button>
              )}
            </div>
          </div>
        </form>
      </Modal>

      <KanbanMemberPickerModal
        isOpen={memberPickerOpen}
        onClose={() => setMemberPickerOpen(false)}
        elevated
        currentUserId={meUser?.id}
        currentUser={
          meUser
            ? {
                id: meUser.id,
                name: meUser.name,
                email: meUser.email ?? '',
                profilePhotoUrl: meUser.profilePhotoUrl ?? null,
              }
            : null
        }
        excludeUserIds={[
          ...(form.userId ? [form.userId] : activeOwnerId ? [activeOwnerId] : []),
          ...form.attendees.map((a) => a.id),
        ]}
        onSelect={(user: KanbanPickerUser) => {
          setForm((f) => ({
            ...f,
            attendees: [
              ...f.attendees,
              {
                id: user.id,
                name: user.name,
                email: user.email,
                profilePhotoUrl: user.profilePhotoUrl ?? null,
              },
            ],
          }));
          setMemberPickerOpen(false);
        }}
      />

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
