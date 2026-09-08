import { ChevronDown, ChevronUp } from 'lucide-react';
import { FORM_FIELD_NO_FOCUS_CLS } from '@/lib/formFieldUi';

export const SINGLE_SELECT_LIST_MAX = 220;

export const SINGLE_SELECT_PANEL_CLS =
  'flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-600 dark:bg-gray-800';

export function singleSelectOptionClassName(active: boolean) {
  return `flex w-full min-h-[2.75rem] items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
    active
      ? 'bg-gray-100 text-gray-900 dark:bg-gray-700/90 dark:text-white'
      : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/50'
  }`;
}

export function singleSelectTriggerBorderClass(_open: boolean, _hideFocus = false) {
  return 'border-gray-300 dark:border-gray-600';
}

export function singleSelectTriggerTextClass(hasValue: boolean) {
  return hasValue ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400';
}

export const SINGLE_SELECT_TRIGGER_BASE_CLS = `relative flex h-10 w-full items-center rounded-lg border bg-white px-3 pr-10 text-left text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-800 dark:text-gray-100 ${FORM_FIELD_NO_FOCUS_CLS}`;

export const SINGLE_SELECT_SEARCH_INPUT_CLS = `block h-9 w-full rounded-md border border-gray-200 bg-gray-50 py-2 pl-9 text-sm text-gray-900 placeholder:text-gray-400 outline-none dark:border-gray-600 dark:bg-gray-900/40 dark:text-gray-100 dark:placeholder:text-gray-500 ${FORM_FIELD_NO_FOCUS_CLS}`;

export function SingleSelectTriggerChevron({ open }: { open: boolean }) {
  return (
    <span className="pointer-events-none absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-gray-400 dark:text-gray-500">
      {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </span>
  );
}
