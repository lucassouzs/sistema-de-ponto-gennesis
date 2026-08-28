'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';

export type FormStepperItem = {
  id: string;
  label: string;
};

type Props = {
  steps: FormStepperItem[];
  currentIndex: number;
  onSelect?: (index: number) => void;
  /** `progress` no preenchimento; `navigation` no editor — ambos marcam etapas anteriores como concluídas */
  mode?: 'progress' | 'navigation';
  editable?: boolean;
  onStepLabelChange?: (stepId: string, label: string) => void;
  trailing?: React.ReactNode;
  className?: string;
};

function stepState(index: number, currentIndex: number) {
  if (index === currentIndex) return 'current';
  if (index < currentIndex) return 'completed';
  return 'upcoming';
}

export function FormStepsStepper({
  steps,
  currentIndex,
  onSelect,
  mode = 'progress',
  editable = false,
  onStepLabelChange,
  trailing,
  className,
}: Props) {
  if (steps.length === 0) return null;

  const singleStep = steps.length === 1;

  return (
    <div className={clsx('w-full', className)}>
      <div className={clsx('flex items-start', singleStep && 'justify-center')}>
        {steps.map((step, index) => {
          const state = stepState(index, currentIndex);
          const isLast = index === steps.length - 1;
          const clickable = typeof onSelect === 'function';
          const fallbackLabel = index === steps.length - 1 ? 'Final' : `Etapa ${index + 1}`;

          const circleNode = clickable ? (
            <button
              type="button"
              onClick={() => onSelect(index)}
              className="rounded-full transition-opacity hover:opacity-90"
              aria-current={state === 'current' ? 'step' : undefined}
              aria-label={`Selecionar ${step.label.trim() || fallbackLabel}`}
            >
              <StepCircle state={state} />
            </button>
          ) : (
            <StepCircle state={state} />
          );

          const labelNode =
            editable && onStepLabelChange ? (
              <input
                type="text"
                value={step.label}
                onChange={(e) => onStepLabelChange(step.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder={fallbackLabel}
                className={clsx(
                  'w-[6.5rem] border-0 bg-transparent p-0 text-center text-xs outline-none focus:ring-0 sm:w-[8.5rem] sm:text-sm',
                  state === 'completed'
                    ? 'font-semibold text-gray-900 dark:text-gray-100'
                    : state === 'current'
                      ? 'font-medium text-gray-800 dark:text-gray-100'
                      : 'font-medium text-gray-400 dark:text-gray-500'
                )}
              />
            ) : (
              <StepLabel state={state} label={step.label.trim() || fallbackLabel} />
            );

          return (
            <div
              key={step.id}
              className={clsx('flex min-w-0 items-start', isLast ? 'shrink-0' : 'flex-1')}
            >
              <div className="flex shrink-0 flex-col items-center gap-2">
                {circleNode}
                {labelNode}
              </div>

              {!isLast ? (
                <div
                  className="mx-1 flex h-9 min-w-[1.5rem] flex-1 items-center self-start sm:mx-2"
                  aria-hidden
                >
                  <div
                    className={clsx(
                      'h-0.5 w-full rounded-full transition-colors',
                      index < currentIndex
                        ? 'bg-red-600 dark:bg-red-500'
                        : 'bg-gray-200 dark:bg-gray-700'
                    )}
                  />
                </div>
              ) : null}
            </div>
          );
        })}

        {trailing ? (
          <div className="ml-2 flex h-9 shrink-0 items-center self-start">{trailing}</div>
        ) : null}
      </div>
    </div>
  );
}

function StepCircle({ state }: { state: 'completed' | 'current' | 'upcoming' }) {
  if (state === 'completed') {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow-sm dark:bg-red-500">
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
    );
  }

  if (state === 'current') {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-red-600 bg-white dark:border-red-500 dark:bg-gray-900">
        <span className="h-2.5 w-2.5 rounded-full bg-red-600 dark:bg-red-500" />
      </span>
    );
  }

  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900">
      <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" />
    </span>
  );
}

function StepLabel({
  state,
  label,
}: {
  state: 'completed' | 'current' | 'upcoming';
  label: string;
}) {
  return (
    <span
      className={clsx(
        'max-w-[7rem] truncate text-center text-xs sm:max-w-[9rem] sm:text-sm',
        state === 'completed'
          ? 'font-semibold text-gray-900 dark:text-gray-100'
          : state === 'current'
            ? 'font-medium text-gray-700 dark:text-gray-200'
            : 'font-medium text-gray-400 dark:text-gray-500'
      )}
    >
      {label}
    </span>
  );
}
