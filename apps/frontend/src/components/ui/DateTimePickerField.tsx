'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import {
  DATE_PICKER_FOOTER_ACTION_CLS,
  DATE_PICKER_FOOTER_CLEAR_CLS,
  DATE_PICKER_FOOTER_CLS,
  DATE_PICKER_HEADER_LABEL_BTN_CLS,
  DATE_PICKER_MONTHS_SHORT,
  DATE_PICKER_NAV_BTN_CLS,
  DATE_PICKER_POPOVER_CLS,
  DATE_PICKER_WEEKDAY_ROW_CLS,
  DATE_PICKER_WEEKDAYS,
  DATE_PICKER_YEAR_PAGE_SIZE,
  datePickerCalendarIconCls,
  datePickerDayButtonCls,
  datePickerMonthYearButtonCls,
  datePickerTriggerCls,
  datePickerTriggerTextCls,
  datePickerYearPageStart,
  type DatePickerPanel,
} from '@/components/ui/datePickerDropdownUi';

export type DateTimePickerFieldProps = {
  /** Formato `yyyy-MM-ddTHH:mm` (datetime-local) */
  value: string;
  onChange: (value: string) => void;
  /** Valor mínimo permitido (`yyyy-MM-ddTHH:mm`). Seleções anteriores são ajustadas. */
  min?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  noFocusRing?: boolean;
  'aria-label'?: string;
};

type DateTimeParts = {
  ymd: string;
  hour: number;
  minute: number;
};

const WEEKDAYS = [...DATE_PICKER_WEEKDAYS];
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function snapMinute(minute: number): number {
  let best = MINUTES[0];
  let bestDist = Math.abs(minute - best);
  for (const step of MINUTES) {
    const dist = Math.abs(minute - step);
    if (dist < bestDist) {
      best = step;
      bestDist = dist;
    }
  }
  return best;
}

function parseYmd(s: string): Date | null {
  if (!s) return null;
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nowParts(): DateTimeParts {
  const date = new Date();
  return {
    ymd: toYmd(date),
    hour: date.getHours(),
    minute: snapMinute(date.getMinutes())
  };
}

function parseDateTimeLocal(value: string): DateTimeParts | null {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  return {
    ymd: match[1],
    hour: Number(match[2]),
    minute: snapMinute(Number(match[3]))
  };
}

function toDateTimeLocal(parts: DateTimeParts): string {
  return `${parts.ymd}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function clampPartsToMin(parts: DateTimeParts, min?: string): DateTimeParts {
  if (!min) return parts;
  const next = toDateTimeLocal(parts);
  if (next >= min) return parts;
  return parseDateTimeLocal(min) ?? parts;
}

function formatDisplayBr(value: string): string {
  const parts = parseDateTimeLocal(value);
  if (!parts) return '';
  const [year, month, day] = parts.ymd.split('-');
  return `${day}/${month}/${year} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

const ITEM_HEIGHT_PX = 36;
const WHEEL_HEIGHT_PX = ITEM_HEIGHT_PX * 7;

function TimeWheelColumn({
  label,
  items,
  selected,
  onSelect
}: {
  label: string;
  items: number[];
  selected: number;
  onSelect: (value: number) => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollEndTimerRef = useRef<number | null>(null);
  const syncingScrollRef = useRef(false);
  const wheelLockRef = useRef(false);
  const selectedRef = useRef(selected);
  const [centerIndex, setCenterIndex] = useState(() => Math.max(0, items.indexOf(selected)));

  selectedRef.current = selected;

  const getEdgePadding = useCallback((shellHeight: number) => {
    return Math.max(0, (shellHeight - ITEM_HEIGHT_PX) / 2);
  }, []);

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = 'auto') => {
      const container = listRef.current;
      const shell = shellRef.current;
      const content = contentRef.current;
      if (!container || !shell || !content) return;

      const clamped = Math.max(0, Math.min(items.length - 1, index));
      const padding = getEdgePadding(shell.clientHeight);
      content.style.paddingTop = `${padding}px`;
      content.style.paddingBottom = `${padding}px`;

      syncingScrollRef.current = true;
      container.scrollTo({ top: clamped * ITEM_HEIGHT_PX, behavior });
      setCenterIndex(clamped);
      window.setTimeout(() => {
        syncingScrollRef.current = false;
      }, behavior === 'smooth' ? 180 : 0);
    },
    [getEdgePadding, items.length]
  );

  const syncWheelLayout = useCallback(() => {
    if (syncingScrollRef.current) return;
    const index = Math.max(0, items.indexOf(selectedRef.current));
    scrollToIndex(index);
  }, [items, scrollToIndex]);

  const updateCenterFromScroll = useCallback(() => {
    const container = listRef.current;
    if (!container) return;
    const index = Math.round(container.scrollTop / ITEM_HEIGHT_PX);
    setCenterIndex(Math.max(0, Math.min(items.length - 1, index)));
  }, [items.length]);

  const snapToNearest = useCallback(() => {
    const container = listRef.current;
    if (!container) return;
    const index = Math.round(container.scrollTop / ITEM_HEIGHT_PX);
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    scrollToIndex(clamped);
    const value = items[clamped];
    if (value !== selectedRef.current) onSelect(value);
  }, [items, onSelect, scrollToIndex]);

  const queueSnap = useCallback(() => {
    if (scrollEndTimerRef.current) window.clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = window.setTimeout(snapToNearest, 120);
  }, [snapToNearest]);

  const stepBy = useCallback(
    (direction: -1 | 1) => {
      const container = listRef.current;
      if (!container) return;
      const currentIndex = Math.round(container.scrollTop / ITEM_HEIGHT_PX);
      const nextIndex = Math.max(0, Math.min(items.length - 1, currentIndex + direction));
      scrollToIndex(nextIndex);
      const value = items[nextIndex];
      if (value !== selectedRef.current) onSelect(value);
    },
    [items, onSelect, scrollToIndex]
  );

  useLayoutEffect(() => {
    syncWheelLayout();
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(() => syncWheelLayout());
    observer.observe(shell);
    return () => observer.disconnect();
  }, [syncWheelLayout]);

  useLayoutEffect(() => {
    syncWheelLayout();
  }, [selected, syncWheelLayout]);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (wheelLockRef.current) return;

      wheelLockRef.current = true;
      window.setTimeout(() => {
        wheelLockRef.current = false;
      }, 40);

      stepBy(event.deltaY > 0 ? 1 : -1);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [stepBy]);

  useEffect(
    () => () => {
      if (scrollEndTimerRef.current) window.clearTimeout(scrollEndTimerRef.current);
    },
    []
  );

  const handleScroll = () => {
    if (syncingScrollRef.current) return;
    updateCenterFromScroll();
    queueSnap();
  };

  const edgePaddingPx = getEdgePadding(WHEEL_HEIGHT_PX);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <p className="mb-1 shrink-0 text-center text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <div
        ref={shellRef}
        className="relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600"
        style={{ height: WHEEL_HEIGHT_PX }}
      >
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="scrollbar-hide absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div
            ref={contentRef}
            style={{
              paddingTop: edgePaddingPx,
              paddingBottom: edgePaddingPx
            }}
          >
            {items.map((item, index) => {
              const isCenter = index === centerIndex;
              return (
                <div
                  key={item}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      stepBy(-1);
                    }
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      stepBy(1);
                    }
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      scrollToIndex(index);
                      onSelect(item);
                    }
                  }}
                  onClick={() => {
                    scrollToIndex(index);
                    onSelect(item);
                  }}
                  style={{ height: ITEM_HEIGHT_PX }}
                  className={clsx(
                    'mx-1 flex cursor-pointer select-none items-center justify-center rounded-md text-sm tabular-nums transition-colors',
                    isCenter
                      ? 'font-semibold text-red-600 ring-1 ring-inset ring-red-500 dark:text-red-400 dark:ring-red-400'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
                  )}
                >
                  {String(item).padStart(2, '0')}
                </div>
              );
            })}
          </div>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-10 bg-gradient-to-b from-white via-white/80 to-transparent dark:from-gray-800 dark:via-gray-800/80"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-10 bg-gradient-to-t from-white via-white/80 to-transparent dark:from-gray-800 dark:via-gray-800/80"
        />
      </div>
    </div>
  );
}

export function DateTimePickerField({
  value,
  onChange,
  min,
  placeholder = 'dd/mm/aaaa hh:mm',
  disabled = false,
  className,
  noFocusRing = false,
  'aria-label': ariaLabel
}: DateTimePickerFieldProps) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<DatePickerPanel>('days');
  const [draft, setDraft] = useState<DateTimeParts>(() => parseDateTimeLocal(value) ?? nowParts());
  const [viewDate, setViewDate] = useState(() => parseYmd(value.split('T')[0]) ?? new Date());
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 420 });

  const commit = useCallback(
    (parts: DateTimeParts) => {
      const clamped = clampPartsToMin(parts, min);
      setDraft(clamped);
      onChange(toDateTimeLocal(clamped));
    },
    [min, onChange]
  );

  const updatePosition = useCallback(() => {
    const element = triggerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const popoverHeight = 360;
    const popoverWidth = 420;
    const gap = 6;
    let top = rect.bottom + gap;
    if (top + popoverHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - popoverHeight - gap);
    }
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - 8) {
      left = window.innerWidth - popoverWidth - 8;
    }
    left = Math.max(8, left);
    setCoords({ top, left, width: popoverWidth });
  }, []);

  useEffect(() => {
    const parsed = parseDateTimeLocal(value);
    if (parsed) {
      setDraft(parsed);
      setViewDate(parseYmd(parsed.ymd) ?? new Date());
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    setDraft(parseDateTimeLocal(value) ?? nowParts());
    const parsed = parseDateTimeLocal(value);
    setViewDate(parseYmd(parsed?.ymd ?? '') ?? new Date());
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updatePosition, value]);

  useEffect(() => {
    if (!open) setPanel('days');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (panel !== 'days') {
          setPanel(panel === 'years' ? 'months' : 'days');
          return;
        }
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, panel]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleDateString('pt-BR', { month: 'long' });
  const todayYmd = toYmd(new Date());
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let index = 0; index < startWeekday; index++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);

  const yearPageStart = datePickerYearPageStart(year);
  const yearPageEnd = yearPageStart + DATE_PICKER_YEAR_PAGE_SIZE - 1;
  const yearOptions = Array.from({ length: DATE_PICKER_YEAR_PAGE_SIZE }, (_, i) => yearPageStart + i);

  const pickDay = (day: number) => {
    commit({ ...draft, ymd: toYmd(new Date(year, month, day, 12, 0, 0, 0)) });
  };

  const navigatePrev = () => {
    if (panel === 'years') {
      setViewDate(new Date(year - DATE_PICKER_YEAR_PAGE_SIZE, month, 1));
      return;
    }
    if (panel === 'months') {
      setViewDate(new Date(year - 1, month, 1));
      return;
    }
    setViewDate(new Date(year, month - 1, 1));
  };

  const navigateNext = () => {
    if (panel === 'years') {
      setViewDate(new Date(year + DATE_PICKER_YEAR_PAGE_SIZE, month, 1));
      return;
    }
    if (panel === 'months') {
      setViewDate(new Date(year + 1, month, 1));
      return;
    }
    setViewDate(new Date(year, month + 1, 1));
  };

  const popover = open ? (
    <div
      ref={popoverRef}
      id={listboxId}
      role="dialog"
      aria-label="Calendário e horário"
      className={DATE_PICKER_POPOVER_CLS}
      style={{ top: coords.top, left: coords.left, width: coords.width }}
    >
      <div className="flex items-stretch gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={navigatePrev}
              className={DATE_PICKER_NAV_BTN_CLS}
              aria-label={
                panel === 'years' ? 'Anos anteriores' : panel === 'months' ? 'Ano anterior' : 'Mês anterior'
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 items-center justify-center gap-0.5">
              {panel === 'days' && (
                <>
                  <button
                    type="button"
                    onClick={() => setPanel('months')}
                    className={DATE_PICKER_HEADER_LABEL_BTN_CLS}
                    aria-label="Escolher mês"
                  >
                    {monthName}
                  </button>
                  <span className="px-0.5 text-sm font-semibold text-gray-500 dark:text-gray-400" aria-hidden>
                    de
                  </span>
                  <button
                    type="button"
                    onClick={() => setPanel('years')}
                    className={DATE_PICKER_HEADER_LABEL_BTN_CLS}
                    aria-label="Escolher ano"
                  >
                    {year}
                  </button>
                </>
              )}
              {panel === 'months' && (
                <button
                  type="button"
                  onClick={() => setPanel('years')}
                  className={DATE_PICKER_HEADER_LABEL_BTN_CLS}
                  aria-label="Escolher ano"
                >
                  {year}
                </button>
              )}
              {panel === 'years' && (
                <span className="px-1.5 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {yearPageStart}–{yearPageEnd}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={navigateNext}
              className={DATE_PICKER_NAV_BTN_CLS}
              aria-label={
                panel === 'years' ? 'Próximos anos' : panel === 'months' ? 'Próximo ano' : 'Próximo mês'
              }
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {panel === 'days' && (
            <>
              <div className={DATE_PICKER_WEEKDAY_ROW_CLS}>
                {WEEKDAYS.map((weekday) => (
                  <span key={weekday} className="py-1">
                    {weekday}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((day, index) => {
                  if (day === null) return <span key={`empty-${index}`} aria-hidden />;
                  const ymd = toYmd(new Date(year, month, day, 12, 0, 0, 0));
                  const selected = draft.ymd === ymd;
                  const isToday = ymd === todayYmd;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => pickDay(day)}
                      className={datePickerDayButtonCls(selected, isToday)}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {panel === 'months' && (
            <div className="grid grid-cols-3 gap-1 py-1">
              {DATE_PICKER_MONTHS_SHORT.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setViewDate(new Date(year, index, 1));
                    setPanel('days');
                  }}
                  className={datePickerMonthYearButtonCls(index === month)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {panel === 'years' && (
            <div className="grid grid-cols-3 gap-1 py-1">
              {yearOptions.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setViewDate(new Date(y, month, 1));
                    setPanel('months');
                  }}
                  className={datePickerMonthYearButtonCls(y === year)}
                >
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          aria-hidden
          className="w-px shrink-0 self-stretch bg-gray-200 dark:bg-gray-600"
        />

        <div className="flex w-[128px] shrink-0 flex-col self-stretch justify-between">
          <div className="flex gap-2">
            <TimeWheelColumn
              label="Hora"
              items={HOURS}
              selected={draft.hour}
              onSelect={(hour) => commit({ ...draft, hour })}
            />
            <TimeWheelColumn
              label="Min"
              items={MINUTES}
              selected={draft.minute}
              onSelect={(minute) => commit({ ...draft, minute })}
            />
          </div>
        </div>
      </div>

      <div className={DATE_PICKER_FOOTER_CLS}>
        <button
          type="button"
          onClick={() => {
            onChange('');
            setOpen(false);
          }}
          className={DATE_PICKER_FOOTER_CLEAR_CLS}
        >
          Limpar
        </button>
        <button
          type="button"
          onClick={() => {
            const current = nowParts();
            commit(current);
            setViewDate(parseYmd(current.ymd) ?? new Date());
            setPanel('days');
            setOpen(false);
          }}
          className={DATE_PICKER_FOOTER_ACTION_CLS}
        >
          Agora
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? placeholder}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? listboxId : undefined}
        className={datePickerTriggerCls(open, 'field', noFocusRing, className)}
        data-form-field-trigger="true"
        onClick={() => {
          if (disabled) return;
          if (!open) updatePosition();
          setOpen((current) => !current);
        }}
      >
        <span className={clsx('min-w-0 truncate tabular-nums', datePickerTriggerTextCls(Boolean(value)))}>
          {value ? formatDisplayBr(value) : placeholder}
        </span>
        <Calendar className={datePickerCalendarIconCls('field')} aria-hidden />
      </button>
      {typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}
    </>
  );
}
