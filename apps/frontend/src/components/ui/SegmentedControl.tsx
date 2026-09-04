'use client';

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  title?: string;
  ariaLabel?: string;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  onChange: (next: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  pillClassName?: string;
  'aria-label'?: string;
};

type PillState = { left: number; width: number; ready: boolean };

function pillsEqual(a: PillState, b: PillState) {
  return a.ready === b.ready && a.left === b.left && a.width === b.width;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className = '',
  pillClassName = 'bg-white shadow-sm dark:bg-gray-600',
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<PillState>({ left: 0, width: 0, ready: false });
  const valueRef = useRef(value);
  const optionsRef = useRef(options);
  valueRef.current = value;
  optionsRef.current = options;

  const measure = useCallback(() => {
    const root = rootRef.current;
    const idx = optionsRef.current.findIndex((o) => o.value === valueRef.current);
    const btn = btnRefs.current[idx];
    if (!root || !btn) return;
    const rootRect = root.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    // Inteiros evitam jitter de subpixel reentrando no ResizeObserver.
    const next: PillState = {
      left: Math.round(btnRect.left - rootRect.left),
      width: Math.round(btnRect.width),
      ready: true,
    };
    setPill((prev) => (pillsEqual(prev, next) ? prev : next));
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, value, options]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    btnRefs.current.forEach((b) => b && ro.observe(b));
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, options.length]);

  return (
    <div
      ref={rootRef}
      className={`relative inline-flex h-9 shrink-0 items-stretch rounded-lg bg-gray-100 p-1 dark:bg-gray-800 ${className}`}
      role="group"
      aria-label={ariaLabel}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute top-1 bottom-1 rounded-md ${pillClassName}`}
        style={{
          left: pill.left,
          width: pill.width,
          opacity: pill.ready ? 1 : 0,
          transition:
            'left 280ms cubic-bezier(0.22, 1, 0.36, 1), width 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease',
        }}
      />
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            title={opt.title}
            aria-label={opt.ariaLabel}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`relative z-10 inline-flex h-full items-center justify-center gap-1.5 rounded-md px-2.5 text-sm transition-colors duration-200 sm:px-3 ${
              active
                ? 'font-medium text-red-600 dark:text-red-400'
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
