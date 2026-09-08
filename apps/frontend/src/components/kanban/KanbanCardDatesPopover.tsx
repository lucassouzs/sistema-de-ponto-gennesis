'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { DateTimePickerField } from '@/components/ui/DateTimePickerField';
import { kanbanLabel } from './kanbanFormStyles';
import { splitDateTime, toYmd } from './kanbanDateTime';

function parseYmd(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function compareYmd(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Converte valor do Kanban (`yyyy-MM-ddTHH:mm:ss`) para o picker (`yyyy-MM-ddTHH:mm`). */
function kanbanToPickerValue(value: string): string {
  if (!value) return '';
  const { date, time } = splitDateTime(value);
  if (!date) return '';
  return `${date}T${time}`;
}

/** Converte valor do picker para o formato persistido no Kanban. */
function pickerToKanban(value: string): string {
  if (!value) return '';
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return '';
  return `${match[1]}T${match[2]}:00`;
}

function pickerDatePart(value: string): string {
  return value.split('T')[0] ?? '';
}

function setPickerDate(value: string, ymd: string): string {
  const time = value.includes('T') ? (value.split('T')[1] ?? '09:00').slice(0, 5) : '09:00';
  return `${ymd}T${time || '09:00'}`;
}

export interface KanbanCardDatesPanelProps {
  startDate: string;
  endDate: string;
  onClose: () => void;
  onSave: (start: string | null, end: string | null) => void | Promise<void>;
}

/** Conteúdo do painel de datas (usar dentro de Modal). */
export function KanbanCardDatesPanel({
  startDate: initialStart,
  endDate: initialEnd,
  onClose,
  onSave,
}: KanbanCardDatesPanelProps) {
  const [startValue, setStartValue] = useState(() => kanbanToPickerValue(initialStart));
  const [endValue, setEndValue] = useState(() => kanbanToPickerValue(initialEnd));
  const [viewDate, setViewDate] = useState(() => {
    const anchor =
      parseYmd(pickerDatePart(kanbanToPickerValue(initialEnd))) ??
      parseYmd(pickerDatePart(kanbanToPickerValue(initialStart)));
    return anchor ?? new Date();
  });
  const [pickPhase, setPickPhase] = useState<'start' | 'end'>('start');

  const startDate = pickerDatePart(startValue);
  const endDate = pickerDatePart(endValue);

  useEffect(() => {
    const nextStart = kanbanToPickerValue(initialStart);
    const nextEnd = kanbanToPickerValue(initialEnd);
    setStartValue(nextStart);
    setEndValue(nextEnd);
    const anchor = parseYmd(pickerDatePart(nextEnd)) ?? parseYmd(pickerDatePart(nextStart));
    if (anchor) setViewDate(anchor);
    if (initialStart && initialEnd) setPickPhase('start');
    else if (initialStart && !initialEnd) setPickPhase('end');
    else setPickPhase('start');
  }, [initialStart, initialEnd]);

  const activePickPhase: 'start' | 'end' = !startDate ? 'start' : !endDate ? 'end' : pickPhase;

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const todayYmd = toYmd(new Date());
  const viewingTodayMonth =
    year === new Date().getFullYear() && month === new Date().getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function dayYmd(day: number): string {
    return toYmd(new Date(year, month, day));
  }

  function getDayVisual(day: number) {
    const ymd = dayYmd(day);
    const s = startDate;
    const e = endDate;
    const isStart = !!s && ymd === s;
    const isEnd = !!e && ymd === e;
    const inRange =
      !!s && !!e && s !== e && compareYmd(ymd, s) > 0 && compareYmd(ymd, e) < 0;
    const isToday = ymd === todayYmd;
    return { isStart, isEnd, inRange, isToday };
  }

  function pickDay(day: number) {
    const ymd = dayYmd(day);

    if (activePickPhase === 'start') {
      setStartValue(setPickerDate(startValue, ymd));
      setEndValue('');
      setPickPhase('end');
      return;
    }

    let s = startDate;
    let e = ymd;
    if (s && compareYmd(e, s) < 0) {
      [s, e] = [e, s];
    }
    setStartValue(setPickerDate(startValue, s));
    setEndValue(setPickerDate(endValue, e));
    setPickPhase('start');
  }

  function validateDates(): { start: string; end: string } | null {
    if (!startValue.trim()) {
      toast.error('Informe a data de início');
      return null;
    }
    if (!endValue.trim()) {
      toast.error('Informe a data de término');
      return null;
    }
    const start = pickerToKanban(startValue);
    const end = pickerToKanban(endValue);
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      toast.error('A data e hora de término devem ser posteriores à de início');
      return null;
    }
    return { start, end };
  }

  async function handleSave() {
    const validated = validateDates();
    if (!validated) return;
    void onSave(validated.start, validated.end);
    onClose();
  }

  async function handleRemove() {
    setStartValue('');
    setEndValue('');
    setPickPhase('start');
    await Promise.resolve(onSave(null, null));
    onClose();
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <div className="select-none">
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-0.5">
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              onClick={() => setViewDate(new Date(year - 1, month, 1))}
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col items-center gap-0.5 min-w-0">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">
              {monthLabel}
            </span>
            {!viewingTodayMonth && (
              <button
                type="button"
                onClick={() => setViewDate(new Date())}
                className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline"
              >
                Ir para hoje
              </button>
            )}
          </div>
          <div className="flex gap-0.5">
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              onClick={() => setViewDate(new Date(year + 1, month, 1))}
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center mb-2">
          {activePickPhase === 'start'
            ? 'Selecione a data de início no calendário'
            : 'Agora selecione a data de término'}
        </p>

        <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-gray-500 dark:text-gray-400 mb-1">
          {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (day === null) return <span key={`e-${i}`} />;

            const { isStart, isEnd, inRange, isToday } = getDayVisual(day);
            const isEndpoint = isStart || isEnd;

            return (
              <button
                key={day}
                type="button"
                onClick={() => pickDay(day)}
                aria-current={isToday ? 'date' : undefined}
                title={isToday ? 'Hoje' : undefined}
                className={clsx(
                  'h-8 text-sm rounded-md transition-colors flex items-center justify-center',
                  isEndpoint &&
                    'bg-red-600 dark:bg-red-500 text-white font-semibold',
                  isToday &&
                    !isEndpoint &&
                    'font-semibold text-red-600 dark:text-red-400',
                  inRange &&
                    !isEndpoint &&
                    !isToday &&
                    'bg-red-100/90 dark:bg-red-950/45 text-red-800 dark:text-red-200',
                  !isEndpoint &&
                    !inRange &&
                    !isToday &&
                    'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/80',
                  !isEndpoint &&
                    !inRange &&
                    isToday &&
                    'hover:bg-gray-100 dark:hover:bg-gray-700/80',
                )}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 space-y-4 border-t border-gray-200 pt-5 dark:border-gray-700">
        <div>
          <label className={kanbanLabel}>Data de início *</label>
          <DateTimePickerField
            value={startValue}
            onChange={(next) => {
              setStartValue(next);
              if (next && !endDate) setPickPhase('end');
              if (!next) setPickPhase('start');
            }}
            placeholder="dd/mm/aaaa hh:mm"
            noFocusRing
            aria-label="Data de início"
          />
        </div>

        <div>
          <label className={kanbanLabel}>Data de término *</label>
          <DateTimePickerField
            value={endValue}
            onChange={(next) => {
              setEndValue(next);
              if (next) setPickPhase('start');
              else setPickPhase(startDate ? 'end' : 'start');
            }}
            min={startValue || undefined}
            placeholder="dd/mm/aaaa hh:mm"
            noFocusRing
            aria-label="Data de término"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t border-gray-200 dark:border-gray-700 pt-4">
        <Button
          type="button"
          className="w-full !bg-red-600 hover:!bg-red-700 !text-white border-transparent focus:outline-none focus:ring-0 focus-visible:ring-0"
          onClick={handleSave}
        >
          Salvar
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full border-gray-300 dark:border-gray-600"
          onClick={handleRemove}
        >
          Remover
        </Button>
      </div>
    </div>
  );
}
