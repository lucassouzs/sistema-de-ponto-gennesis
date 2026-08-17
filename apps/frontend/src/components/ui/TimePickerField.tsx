'use client';

import React, { useMemo } from 'react';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { stringsToSelectOptions } from '@/lib/selectOptionBuilders';

export type TimePickerFieldProps = {
  /** Formato `HH:mm` */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  noFocusRing?: boolean;
  /** Intervalo em minutos (padrão: 15). */
  stepMinutes?: number;
  /** Só lista horários estritamente depois deste (`HH:mm`). */
  minTime?: string;
  allowEmpty?: boolean;
  'aria-label'?: string;
};

function buildTimeOptions(stepMinutes: number, minTime?: string): string[] {
  const step = Math.max(1, Math.min(60, stepMinutes));
  const minMinutes = isValidHm(minTime || '')
    ? (() => {
        const [h, m] = (minTime as string).split(':').map(Number);
        return h * 60 + m;
      })()
    : -1;

  const options: string[] = [];
  for (let total = 0; total < 24 * 60; total += step) {
    if (total <= minMinutes) continue;
    const h = String(Math.floor(total / 60)).padStart(2, '0');
    const m = String(total % 60).padStart(2, '0');
    options.push(`${h}:${m}`);
  }
  return options;
}

function isValidHm(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

function nearestOption(value: string, options: string[]): string {
  if (!isValidHm(value) || options.length === 0) return '';
  if (options.includes(value)) return value;
  const [h, m] = value.split(':').map(Number);
  const target = h * 60 + m;
  let best = options[0];
  let bestDiff = Infinity;
  for (const opt of options) {
    const [oh, om] = opt.split(':').map(Number);
    const diff = Math.abs(oh * 60 + om - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = opt;
    }
  }
  return best;
}

export function TimePickerField({
  value,
  onChange,
  placeholder = 'hh:mm',
  disabled = false,
  className,
  noFocusRing = false,
  stepMinutes = 15,
  minTime,
  allowEmpty = false,
}: TimePickerFieldProps) {
  const timeOptions = useMemo(
    () => buildTimeOptions(stepMinutes, minTime),
    [stepMinutes, minTime]
  );
  const dropdownOptions = useMemo(
    () => stringsToSelectOptions(timeOptions),
    [timeOptions]
  );
  const selected = nearestOption(value, timeOptions);

  return (
    <SingleSelectSearchDropdown
      value={selected}
      onChange={onChange}
      options={dropdownOptions}
      disabled={disabled}
      placeholder={placeholder}
      searchPlaceholder="Pesquisar hora..."
      emptyOptionsMessage="Nenhum horário disponível."
      emptySearchMessage="Nenhum horário encontrado."
      allowEmpty={allowEmpty}
      className={className}
      noFocusRing={noFocusRing}
      matchTriggerWidth
      menuMinWidth={140}
      listMaxHeight={220}
    />
  );
}
