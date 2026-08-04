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
  'aria-label'?: string;
};

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className = '',
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false });

  const measure = useCallback(() => {
    const root = rootRef.current;
    const idx = options.findIndex((o) => o.value === value);
    const btn = btnRefs.current[idx];
    if (!root || !btn) return;
    const rootRect = root.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setPill({
      left: btnRect.left - rootRect.left,
      width: btnRect.width,
      ready: true,
    });
  }, [options, value]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

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
      className={`relative inline-flex shrink-0 items-center rounded-lg bg-gray-100 p-1 dark:bg-gray-800 ${className}`}
      role="group"
      aria-label={ariaLabel}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-1 bottom-1 rounded-md bg-white shadow-sm dark:bg-gray-600"
        style={{
          left: pill.left,
          width: pill.width,
          opacity: pill.ready ? 1 : 0,
          transition:
            'left 220ms cubic-bezier(0.22, 1, 0.36, 1), width 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease',
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
            className={`relative z-10 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-200 sm:px-3 ${
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
