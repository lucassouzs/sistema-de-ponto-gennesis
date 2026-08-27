'use client';

import React from 'react';
import { ChevronRight } from 'lucide-react';

export const listTableRowClasses = {
  /** Cadastro e listas sem clique na linha — hover neutro, só destaca a linha. */
  tr: 'group transition-colors duration-200 hover:bg-gray-50 dark:hover:bg-gray-700/50',
  /** Linha clicável que abre detalhes — vermelho + faixa lateral + cursor. */
  trNavigable:
    'group cursor-pointer transition-[background-color,box-shadow] duration-200 ease-out hover:bg-red-50/70 hover:shadow-[inset_3px_0_0_0_rgb(239_68_68)] active:bg-red-100/80 dark:hover:bg-red-950/25 dark:hover:shadow-[inset_3px_0_0_0_rgb(248_113_113)] dark:active:bg-red-950/40',
  highlightText:
    'transition-colors duration-200 group-hover:text-red-600 dark:group-hover:text-red-400',
  chevron:
    'pointer-events-none absolute left-full top-1/2 ml-1.5 h-4 w-4 -translate-y-1/2 -translate-x-1 text-red-500 opacity-0 transition-all duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100 dark:text-red-400',
  actionTh:
    'w-14 min-w-[3.5rem] px-2 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-3 sm:py-4',
  actionTd:
    'relative w-14 min-w-[3.5rem] whitespace-nowrap px-2 py-2.5 align-middle sm:px-3 sm:py-3',
} as const;

/** `navigable=true` só quando a linha inteira abre outra tela (ex.: contratos). */
export function getListTableRowClassName(navigable = false, extra?: string) {
  return [
    navigable ? listTableRowClasses.trNavigable : listTableRowClasses.tr,
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

export function rowActionMenuButtonClass(isOpen: boolean) {
  return [
    'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-200',
    isOpen
      ? 'border-red-200 bg-red-100 text-red-600 opacity-100 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-400'
      : 'border-gray-200 bg-gray-50 text-gray-600 opacity-100 shadow-sm hover:border-gray-300 hover:bg-white hover:text-gray-800 focus-visible:ring-2 focus-visible:ring-gray-300 group-hover:border-gray-300 group-hover:bg-white dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-100 dark:group-hover:border-gray-500 dark:group-hover:bg-gray-700',
  ].join(' ');
}

type ListRowNavigableLabelProps = {
  children: React.ReactNode;
  className?: string;
};

/** Nome com seta vermelha — usar apenas em linhas clicáveis (`trNavigable`). */
export function ListRowNavigableLabel({ children, className = '' }: ListRowNavigableLabelProps) {
  return (
    <span className="relative inline-block min-w-0 max-w-full">
      <span
        className={`text-sm text-gray-900 dark:text-gray-100 ${listTableRowClasses.highlightText} ${className}`}
      >
        {children}
      </span>
      <ChevronRight aria-hidden className={listTableRowClasses.chevron} />
    </span>
  );
}

/** @deprecated Use `ListRowNavigableLabel` em linhas clicáveis; texto normal nos cadastros. */
export const ListRowHighlight = ListRowNavigableLabel;
