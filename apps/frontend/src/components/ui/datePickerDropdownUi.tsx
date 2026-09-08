import { clsx } from 'clsx';
import { FORM_FIELD_NO_FOCUS_CLS } from '@/lib/formFieldUi';
import { singleSelectTriggerBorderClass, singleSelectTriggerTextClass } from './singleSelectDropdownUi';

export const DATE_PICKER_WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

export const DATE_PICKER_MONTHS_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

export type DatePickerPanel = 'days' | 'months' | 'years';

export const DATE_PICKER_YEAR_PAGE_SIZE = 12;

export const DATE_PICKER_POPOVER_CLS =
  'fixed z-[9999] rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-600 dark:bg-gray-800';

export const DATE_PICKER_NAV_BTN_CLS =
  'rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100';

export const DATE_PICKER_WEEKDAY_ROW_CLS =
  'mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400';

export const DATE_PICKER_FOOTER_CLS =
  'mt-3 flex items-center justify-between gap-2 border-t border-gray-200 pt-3 dark:border-gray-600';

export const DATE_PICKER_FOOTER_CLEAR_CLS =
  'text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100';

export const DATE_PICKER_FOOTER_ACTION_CLS =
  'text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300';

export const DATE_PICKER_HEADER_LABEL_BTN_CLS =
  'rounded-md px-1.5 py-0.5 text-sm font-semibold capitalize text-gray-900 transition-colors hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700';

export function datePickerYearPageStart(year: number) {
  return Math.floor(year / DATE_PICKER_YEAR_PAGE_SIZE) * DATE_PICKER_YEAR_PAGE_SIZE;
}

export function datePickerDayButtonCls(selected: boolean, isToday: boolean) {
  return clsx(
    'flex h-9 items-center justify-center rounded-lg text-sm transition-colors',
    selected &&
      'font-semibold text-red-600 ring-1 ring-inset ring-red-500 dark:text-red-400 dark:ring-red-400',
    !selected &&
      isToday &&
      'font-semibold text-red-600/70 ring-1 ring-inset ring-red-500/35 dark:text-red-400/70 dark:ring-red-400/40',
    !selected &&
      !isToday &&
      'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700/80'
  );
}

export function datePickerMonthYearButtonCls(selected: boolean) {
  return clsx(
    'flex h-10 items-center justify-center rounded-lg text-sm capitalize transition-colors',
    selected
      ? 'font-semibold text-red-600 ring-1 ring-inset ring-red-500 dark:text-red-400 dark:ring-red-400'
      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700/80'
  );
}

export const DATE_PICKER_TRIGGER_FIELD_CLS = `group flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left text-sm outline-none transition-[border-color,box-shadow,background-color] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-800 dark:text-gray-100 ${FORM_FIELD_NO_FOCUS_CLS}`;

export const DATE_PICKER_TRIGGER_TABLE_CLS = `group flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-2.5 text-left text-xs outline-none transition-[border-color,box-shadow,background-color] disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 sm:text-sm ${FORM_FIELD_NO_FOCUS_CLS}`;

export const DATE_PICKER_TRIGGER_INLINE_CLS =
  'group flex h-auto w-full min-w-0 cursor-pointer items-center justify-between gap-2 border-0 bg-transparent px-1 py-1 text-left text-xs shadow-none sm:text-sm';

export function datePickerTriggerBorderCls(open: boolean, noFocusRing = false) {
  return singleSelectTriggerBorderClass(open, noFocusRing);
}

export function datePickerTriggerTextCls(hasValue: boolean) {
  return singleSelectTriggerTextClass(hasValue);
}

export function datePickerCalendarIconCls(_appearance: 'field' | 'inline' | 'table') {
  return 'h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500';
}

export function datePickerTriggerCls(
  open: boolean,
  appearance: 'field' | 'inline' | 'table',
  noFocusRing: boolean,
  className?: string
) {
  const base =
    appearance === 'inline'
      ? DATE_PICKER_TRIGGER_INLINE_CLS
      : appearance === 'table'
        ? DATE_PICKER_TRIGGER_TABLE_CLS
        : DATE_PICKER_TRIGGER_FIELD_CLS;

  return clsx(
    base,
    appearance !== 'inline' && datePickerTriggerBorderCls(open, noFocusRing),
    className
  );
}
