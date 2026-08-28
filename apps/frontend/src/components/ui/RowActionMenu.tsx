'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Edit, MoreVertical, Trash2 } from 'lucide-react';
import type { RowActionMenuState } from '@/hooks/useRowActionMenu';
import { listTableRowClasses, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { Z_ACTION_MENU } from '@/lib/zIndex';

export type RowActionMenuExtraItem = {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  disabledTitle?: string;
  /** Cor do texto do item (ícone pode seguir a mesma paleta). */
  tone?: 'default' | 'success' | 'danger';
};

type RowActionMenuCellProps = {
  isOpen: boolean;
  onToggle: (e: React.MouseEvent<HTMLButtonElement>) => void;
  align?: 'left' | 'center' | 'right';
  className?: string;
};

const actionAlignClass = {
  left: { td: 'text-left', flex: 'justify-start' },
  center: { td: 'text-center', flex: 'justify-center' },
  right: { td: 'text-right', flex: 'justify-end' },
} as const;

export function RowActionMenuCell({
  isOpen,
  onToggle,
  align = 'right',
  className,
}: RowActionMenuCellProps) {
  const alignment = actionAlignClass[align];
  return (
    <td
      className={
        className ??
        `${listTableRowClasses.actionTd} ${alignment.td}`
      }
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`flex ${alignment.flex}`}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(e);
          }}
          className={rowActionMenuButtonClass(isOpen)}
          aria-label="Menu de ações"
          aria-expanded={isOpen}
          aria-haspopup="menu"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>
    </td>
  );
}

type RowActionMenuPortalProps = {
  menu: RowActionMenuState;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  editDisabled?: boolean;
  deleteDisabled?: boolean;
  deleteDisabledTitle?: string;
  /** Oculta só a ação Excluir (mantém Editar). */
  hideDelete?: boolean;
  extraItems?: RowActionMenuExtraItem[];
  /** Oculta Editar/Excluir — exibe só `extraItems` */
  hideDefaultActions?: boolean;
  /** z-index do overlay que contém o menu */
  zIndex?: number;
};

export function RowActionMenuPortal({
  menu,
  onClose,
  onEdit,
  onDelete,
  editDisabled = false,
  deleteDisabled = false,
  deleteDisabledTitle,
  hideDelete = false,
  extraItems = [],
  hideDefaultActions = false,
  zIndex = Z_ACTION_MENU
}: RowActionMenuPortalProps) {
  if (!menu || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0"
      style={{ zIndex }}
      onClick={onClose}
    >
      <div
        role="menu"
        className="absolute w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
        style={{
          top: menu.top,
          left: menu.left,
          maxHeight: menu.maxHeight,
          transform: menu.placement === 'above' ? 'translateY(-100%)' : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {!hideDefaultActions && onEdit ? (
          <button
            type="button"
            role="menuitem"
            disabled={editDisabled}
            onClick={(e) => {
              e.stopPropagation();
              if (editDisabled || !onEdit) return;
              onClose();
              onEdit();
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <Edit className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <span>Editar</span>
          </button>
        ) : null}
        {extraItems.map((item, index) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            title={item.disabled ? item.disabledTitle : item.label}
            onClick={(e) => {
              e.stopPropagation();
              if (item.disabled) return;
              onClose();
              item.onClick();
            }}
            className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
              hideDefaultActions && index === 0
                ? ''
                : 'border-t border-gray-200 dark:border-gray-700'
            } ${
              item.disabled
                ? 'cursor-not-allowed text-gray-400 dark:text-gray-500'
                : item.tone === 'success'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : item.tone === 'danger'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
        {!hideDefaultActions && !hideDelete && onDelete ? (
          <button
            type="button"
            role="menuitem"
            disabled={deleteDisabled}
            onClick={(e) => {
              e.stopPropagation();
              if (deleteDisabled) return;
              onClose();
              onDelete();
            }}
            title={deleteDisabled ? deleteDisabledTitle : 'Excluir'}
            className={`flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700 ${
              deleteDisabled
                ? 'cursor-not-allowed text-gray-400 dark:text-gray-500'
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            <Trash2
              className={`h-4 w-4 shrink-0 ${
                deleteDisabled ? 'text-gray-400 dark:text-gray-500' : 'text-red-600 dark:text-red-400'
              }`}
            />
            <span>Excluir</span>
          </button>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

/**
 * Classes padrão para páginas de cadastro.
 * Alinhamento: texto/código à esquerda (`th`/`td`); status e Sim/Não centralizados (`thCenter`/`tdCenter`);
 * números à direita (`thNumeric`/`tdNumeric`); ações à direita (`thRight` + `RowActionMenuCell`).
 */
export const cadastroListClasses = {
  card: 'w-full min-w-0',
  cardHeader: 'border-b-0 pb-1',
  cardContent: 'min-w-0 pt-2',
  cardHeaderRow:
    'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
  cardHeaderIconRow: 'flex min-w-0 items-center space-x-3',
  cardToolbar:
    'flex w-full min-w-0 flex-shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end',
  /** Busca + botão de filtro na mesma altura (quadrado). */
  searchFilterGroup:
    'flex h-10 w-full min-w-0 flex-1 basis-full items-stretch gap-2 sm:basis-auto sm:w-auto sm:flex-none',
  /** Campo de busca dentro do grupo busca+filtro. */
  searchFieldInGroup: 'relative min-w-0 flex-1 sm:min-w-[240px] sm:w-[280px]',
  /** Botão ícone de filtro — altura igual ao campo ao lado, largura = altura. */
  filterIconButton:
    'relative box-border inline-flex aspect-square shrink-0 self-stretch items-center justify-center rounded-lg border p-0',
  /** Campo de busca das toolbars — ocupa a largura no mobile sem forçar overflow. */
  searchField: 'relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none',
  /** Wrapper de tabela — scroll horizontal no mobile sem estourar a viewport. */
  tableScroll: 'table-scroll',
  listSummary:
    'mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2',
  pagination:
    'mt-4 flex flex-wrap items-center justify-center gap-2 sm:mt-6',
  /** min-w força scroll horizontal; sem table-fixed as colunas não esmagam a ação. */
  table: 'w-full min-w-[36rem] text-sm',
  th: 'px-2 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 sm:py-4',
  thCenter:
    'px-2 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 sm:py-4',
  thNumeric:
    'px-2 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 sm:py-4',
  thRight: listTableRowClasses.actionTh,
  td: 'px-2 py-3 text-sm text-gray-900 dark:text-gray-100 sm:px-6 sm:py-4',
  tdMuted: 'px-2 py-3 text-sm text-gray-600 dark:text-gray-400 sm:px-6 sm:py-4',
  tdMono:
    'whitespace-nowrap px-2 py-3 font-mono text-sm text-gray-900 dark:text-gray-100 sm:px-6 sm:py-4',
  tdCenter:
    'whitespace-nowrap px-2 py-3 text-center text-sm text-gray-900 dark:text-gray-100 sm:px-6 sm:py-4',
  tdNumeric:
    'whitespace-nowrap px-2 py-3 text-right text-sm text-gray-600 dark:text-gray-400 sm:px-6 sm:py-4',
  tdTruncate: 'min-w-0 px-2 py-3 sm:px-6 sm:py-4',
} as const;

export {
  listTableRowClasses,
  ListRowNavigableLabel,
  getListTableRowClassName,
  rowActionMenuButtonClass,
} from '@/components/ui/listTableUi';
