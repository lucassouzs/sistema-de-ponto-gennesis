import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { PageSkeleton } from '@/components/ui/PageSkeleton';

type CadastroListSummaryProps = {
  startItem: number;
  endItem: number;
  total: number;
  itemLabel: string;
  itemLabelPlural?: string;
  currentPage?: number;
  totalPages?: number;
  /** Quando true, oculta o texto "Página X de Y". */
  hidePageLabel?: boolean;
  /** Centraliza horizontalmente o texto "Página X de Y". */
  centerPageLabel?: boolean;
};

export function getCadastroListRange(page: number, limit: number, total: number) {
  if (total === 0) {
    return { startItem: 0, endItem: 0, totalPages: 1 };
  }
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);
  return { startItem, endItem, totalPages };
}

/** Valor exibido na coluna ID das listas de cadastro (`code` ou número da linha). */
export function formatCadastroListId(code?: string | null, rowNumber?: number): string {
  const trimmed = String(code ?? '').trim();
  if (trimmed) return trimmed;
  if (rowNumber != null && rowNumber > 0) return String(rowNumber);
  return '—';
}

/** Skeleton da tabela/lista (não usar no loading de login/auth). */
export function CadastroListLoading({ message }: { message: string }) {
  return <PageSkeleton variant="list" rows={7} label={message} />;
}

type CadastroListEmptyProps = {
  icon: LucideIcon;
  title: string;
  hint?: string;
};

export function CadastroListEmpty({ icon: Icon, title, hint }: CadastroListEmptyProps) {
  return (
    <div className="py-8 text-center">
      <Icon className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
      <p className="text-gray-600 dark:text-gray-400">{title}</p>
      {hint ? (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function CadastroListSummary({
  startItem,
  endItem,
  total,
  itemLabel,
  itemLabelPlural,
  currentPage = 1,
  totalPages = 1,
  hidePageLabel = false,
  centerPageLabel = false,
}: CadastroListSummaryProps) {
  const plural = itemLabelPlural ?? `${itemLabel}s`;
  const label = total === 1 ? itemLabel : plural;

  return (
    <div
      className={`${cadastroListClasses.listSummary}${
        centerPageLabel && !hidePageLabel ? ' relative' : ''
      }`}
    >
      <span className={centerPageLabel && !hidePageLabel ? 'sm:mr-auto' : undefined}>
        Mostrando {startItem} a {endItem} de {total} {label}
      </span>
      {hidePageLabel ? null : (
        <span
          className={
            centerPageLabel
              ? 'text-center sm:absolute sm:left-1/2 sm:-translate-x-1/2'
              : undefined
          }
        >
          Página {currentPage} de {totalPages}
        </span>
      )}
    </div>
  );
}
