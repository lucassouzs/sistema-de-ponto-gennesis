'use client';

import React, { useState } from 'react';

const ACTIVE =
  'app-tab--active rounded-xl bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-500';
const INACTIVE =
  'rounded-xl bg-transparent text-gray-500 hover:bg-transparent hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200';
const DISABLED =
  'cursor-not-allowed rounded-xl bg-transparent text-gray-400 opacity-70 dark:text-gray-500';

const SEGMENT_ACTIVE =
  'rounded-lg bg-white text-red-600 shadow-sm dark:bg-gray-700 dark:text-red-400';
const SEGMENT_INACTIVE =
  'rounded-lg text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200';

export function appTabClassName({
  active,
  popped = false,
  disabled = false,
  className = ''
}: {
  active: boolean;
  popped?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const state = disabled
    ? DISABLED
    : active
      ? `${ACTIVE}${popped ? ' app-tab--pop' : ''}`
      : INACTIVE;
  return `app-tab inline-flex items-center justify-center ${className} ${state}`
    .replace(/\s+/g, ' ')
    .trim();
}

type AppTabButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
};

export function AppTabButton({
  active,
  className = '',
  disabled,
  onClick,
  children,
  type = 'button',
  ...rest
}: AppTabButtonProps) {
  const [popped, setPopped] = useState(false);

  return (
    <button
      type={type}
      role="tab"
      aria-selected={active}
      disabled={disabled}
      className={appTabClassName({ active, popped, disabled: Boolean(disabled), className })}
      onClick={(event) => {
        if (disabled) return;
        setPopped(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setPopped(true));
        });
        onClick?.(event);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Abas com underline (páginas e modais que não são fluxo/etapas). */
const UNDERLINE_TAB_ACTIVE: Record<'red' | 'violet' | 'blue', string> = {
  red: 'border-red-500 text-red-600 dark:border-red-400 dark:text-red-400',
  violet:
    'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400',
  blue: 'border-blue-500 text-blue-600'
};

const UNDERLINE_TAB_INACTIVE =
  'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200';

type AppUnderlineTabButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
  accent?: keyof typeof UNDERLINE_TAB_ACTIVE;
};

export function AppUnderlineTabButton({
  active,
  accent = 'red',
  className = '',
  disabled,
  children,
  type = 'button',
  ...rest
}: AppUnderlineTabButtonProps) {
  return (
    <button
      type={type}
      role="tab"
      aria-selected={active}
      disabled={disabled}
      className={`rounded-t-lg border-b-2 font-medium transition-colors ${
        active ? UNDERLINE_TAB_ACTIVE[accent] : UNDERLINE_TAB_INACTIVE
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''} ${className}`
        .replace(/\s+/g, ' ')
        .trim()}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Trilho com linha base contínua — use em volta das AppUnderlineTabButton. */
export function AppUnderlineTabList({
  children,
  className = '',
  centered = true,
  'aria-label': ariaLabel
}: {
  children: React.ReactNode;
  className?: string;
  centered?: boolean;
  'aria-label'?: string;
}) {
  return (
    <div
      className={`border-b border-gray-200 dark:border-gray-600 ${className}`.trim()}
    >
      <nav
        className={`-mb-px flex flex-wrap gap-x-1 gap-y-2 overflow-x-auto sm:gap-x-2 ${
          centered ? 'justify-center' : ''
        }`}
        role="tablist"
        aria-label={ariaLabel}
      >
        {children}
      </nav>
    </div>
  );
}

/** @deprecated Use AppUnderlineTabButton — mantido para modais já migrados. */
export const AppModalTabButton = AppUnderlineTabButton;

/** Sub-filtro / 2ª linha: trilho cinza (uso raro; preferir underline fora de etapas). */
export function AppSegmentedControl({
  children,
  className = '',
  'aria-label': ariaLabel
}: {
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-xl bg-gray-100 p-1 dark:bg-gray-800/80 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

type AppSegmentedButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
};

export function AppSegmentedButton({
  active,
  className = '',
  disabled,
  children,
  type = 'button',
  ...rest
}: AppSegmentedButtonProps) {
  return (
    <button
      type={type}
      role="tab"
      aria-selected={active}
      disabled={disabled}
      className={`inline-flex items-center justify-center px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
        active ? SEGMENT_ACTIVE : SEGMENT_INACTIVE
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''} ${className}`.replace(/\s+/g, ' ').trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
