'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { KanbanCardModal } from '@/components/kanban/KanbanCardModal';
import { KanbanCardLabelsPanel } from '@/components/kanban/KanbanCardLabelsPopover';
import { KanbanLabelColorMapInline } from '@/components/kanban/KanbanLabelColorPicker';
import { KanbanCreateBoardModal } from '@/components/kanban/KanbanCreateBoardModal';
import { KanbanBoardShareModal } from '@/components/kanban/KanbanBoardShareModal';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { CheckboxIndicator } from '@/components/ui/Checkbox';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import {
  originFromElement,
  useCelebratePulse,
  usePaperConfetti,
} from '@/components/ui/PaperConfettiBurst';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import {
  kanbanLabel,
  kanbanInput,
  kanbanInputNumber,
} from '@/components/kanban/kanbanFormStyles';
import api from '@/lib/api';
import { useKanbanDragScrollAssist } from '@/hooks/useKanbanDragScrollAssist';
import { useRightClickPanScroll } from '@/hooks/useRightClickPanScroll';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  type Priority,
  type KanbanCard,
  type KanbanColumn,
  type KanbanBoard,
  type KanbanBoardSummary,
  fetchKanbanBoard,
  fetchKanbanBoards,
  createKanbanBoard,
  updateKanbanBoard,
  deleteKanbanBoard,
  updateKanbanBoardLabelPresets,
  createKanbanColumn,
  updateKanbanColumn,
  deleteKanbanColumn,
  moveKanbanCard,
  deleteKanbanCard,
  duplicateKanbanCard,
  insertCardIntoBoardCache,
  replaceCardInBoardCache,
  removeCardFromBoardCache,
  removeColumnFromBoardCache,
  insertColumnIntoBoardCache,
  buildOptimisticCardCopy,
  buildOptimisticKanbanColumn,
  patchColumnInBoardCache,
  patchCardInBoardCache,
  syncCardOnBoardCache,
  seedKanbanCardCacheFromBoard,
  remapLabelsInBoardCache,
  type KanbanBoardCardChecklistPatch,
  fetchKanbanCard,
  isOptimisticKanbanCardId,
  kanbanCardQueryKey,
  exportKanbanBoardTrello,
  importKanbanBoardTrello,
  updateKanbanCard,
  fetchKanbanArchivedCards,
  type KanbanArchivedCard,
} from '@/lib/kanban';
import {
  resolveKanbanDefaultBoard,
  saveKanbanDefaultBoard,
  clearKanbanDefaultBoard,
  getKanbanDefaultBoard,
} from '@/lib/kanbanDefaultBoard';
import { readKanbanBoardCache, writeKanbanBoardCache, writeKanbanBoardCacheDebounced } from '@/lib/kanbanBoardCache';
import { KanbanUserAvatar } from '@/components/kanban/KanbanUserAvatar';
import { KANBAN_PRIORITY_CONFIG, KANBAN_PRIORITY_ORDER } from '@/components/kanban/kanbanPriority';
import { KanbanPriorityBars } from '@/components/kanban/KanbanPriorityBars';
import {
  getKanbanLabelPalette,
  getKanbanLabelTextColor,
  getKanbanColumnSurfaceStyle,
  normalizeKanbanLabels,
  type KanbanLabelPreset,
} from '@/components/kanban/kanbanLabels';
import {
  formatKanbanCardEndDate,
  splitDateTime,
} from '@/components/kanban/kanbanDateTime';
import {
  Plus,
  MoreHorizontal,
  MoreVertical,
  X,
  Search,
  Filter,
  Calendar,
  MessageSquare,
  Paperclip,
  BarChart2,
  ListChecks,
  Columns,
  List,
  Tag,
  Trash2,
  Edit3,
  Copy,
  ArrowRightLeft,
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  Clock,
  Flag,
  Circle,
  CheckCircle2,
  XCircle,
  Loader,
  Loader2,
  LayoutGrid,
  ChevronUp,
  Eye,
  Users,
  Star,
  Minimize2,
  Maximize2,
  Download,
  Upload,
  ArrowUpDown,
  Check,
  Archive,
} from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

const PRIORITY_CONFIG = KANBAN_PRIORITY_CONFIG;

const KANBAN_PRIORITY_ALL_VALUES = KANBAN_PRIORITY_ORDER;

/** Quantidade inicial de cards visíveis por coluna; "Ver mais" carrega mais este lote. */
const KANBAN_COLUMN_VISIBLE_BATCH = 10;

function readKanbanCollapsedColumns(boardKey: string | null): Set<string> {
  if (!boardKey || typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(`kanban-collapsed:${boardKey}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function writeKanbanCollapsedColumns(boardKey: string | null, ids: Set<string>) {
  if (!boardKey || typeof window === 'undefined') return;
  sessionStorage.setItem(`kanban-collapsed:${boardKey}`, JSON.stringify(Array.from(ids)));
}

/** Todos marcados (ou lista vazia) = sem filtro restritivo nesse campo. */
function multiselectFilterShowsAll(selected: string[], allValues: string[]): boolean {
  if (allValues.length === 0) return true;
  return selected.length === 0 || selected.length >= allValues.length;
}

function isMultiselectFilterActive(selected: string[], allValues: string[]): boolean {
  if (allValues.length === 0) return false;
  return selected.length > 0 && selected.length < allValues.length;
}

// ─── Helper functions ─────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const { date } = splitDateTime(dateStr);
  if (!date) return false;
  return new Date(date + 'T23:59:59') < new Date();
}

function resolveKanbanInsertIndex(
  columnCards: KanbanCard[],
  cardId: string,
  fromColumnId: string,
  toColumnId: string,
  rawIndex: number,
): number {
  const bounded = Math.max(0, Math.min(rawIndex, columnCards.length));
  if (fromColumnId !== toColumnId) {
    const targetWithoutCard = columnCards.filter((card) => card.id !== cardId);
    return Math.max(0, Math.min(bounded, targetWithoutCard.length));
  }

  const sourceIndex = columnCards.findIndex((card) => card.id === cardId);
  if (sourceIndex < 0) return bounded;

  let insertIndex = bounded;
  if (insertIndex > sourceIndex) insertIndex -= 1;
  return Math.max(0, Math.min(insertIndex, columnCards.length - 1));
}

/**
 * Converte índice visual (lista filtrada) para índice na coluna completa,
 * ancorando pelos cards vizinhos visíveis.
 */
function mapFilteredDropIndexToFullIndex(
  fullCards: KanbanCard[],
  visibleCards: KanbanCard[],
  visualIndex: number,
): number {
  if (fullCards.length === 0) return 0;
  if (visibleCards.length === 0) return fullCards.length;

  const boundedVisual = Math.max(0, Math.min(visualIndex, visibleCards.length));
  if (boundedVisual <= 0) {
    const firstId = visibleCards[0]?.id;
    if (!firstId) return 0;
    const idx = fullCards.findIndex((card) => card.id === firstId);
    return idx < 0 ? 0 : idx;
  }

  if (boundedVisual >= visibleCards.length) {
    const lastId = visibleCards[visibleCards.length - 1]?.id;
    if (!lastId) return fullCards.length;
    const idx = fullCards.findIndex((card) => card.id === lastId);
    return idx < 0 ? fullCards.length : idx + 1;
  }

  const anchorId = visibleCards[boundedVisual]?.id;
  if (!anchorId) return fullCards.length;
  const idx = fullCards.findIndex((card) => card.id === anchorId);
  return idx < 0 ? fullCards.length : idx;
}

/**
 * Índice visual do drop. Sempre preferimos o overIndex do último dragOver
 * (é o slot da linha vermelha). O drop no container da coluna recalcula pelo Y
 * e frequentemente manda o card pro fim da lista.
 */
function resolveKanbanVisualDropIndex(
  dropIndex: number | undefined,
  overColumnId: string | null,
  overIndex: number | null,
  targetColumnId: string,
  filteredCardCount: number,
): number {
  if (overColumnId === targetColumnId && overIndex != null) {
    return Math.max(0, Math.min(overIndex, filteredCardCount));
  }
  return Math.max(0, Math.min(dropIndex ?? filteredCardCount, filteredCardCount));
}

/** Índice de drop a partir do Y do ponteiro — evita mandar pro fim da coluna. */
function resolveCardDropIndexFromClientY(
  columnRoot: HTMLElement,
  clientY: number,
): number {
  const cardEls = columnRoot.querySelectorAll<HTMLElement>('[data-kanban-card-id]');
  if (cardEls.length === 0) return 0;
  for (let i = 0; i < cardEls.length; i += 1) {
    const rect = cardEls[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return i;
  }
  return cardEls.length;
}

function moveCardInBoardCache(
  board: KanbanBoard | undefined,
  cardId: string,
  fromColumnId: string,
  toColumnId: string,
  targetIndex?: number,
): KanbanBoard | undefined {
  if (!board) return board;

  const fromColumn = board.columns.find((col) => col.id === fromColumnId);
  const toColumn = board.columns.find((col) => col.id === toColumnId);
  if (!fromColumn || !toColumn) return board;

  const sourceIndex = fromColumn.cards.findIndex((card) => card.id === cardId);
  if (sourceIndex < 0) return board;

  const movedCard = fromColumn.cards[sourceIndex];
  const fromCards = fromColumn.cards.filter((card) => card.id !== cardId);

  const insertIndex = resolveKanbanInsertIndex(
    fromColumnId === toColumnId ? fromColumn.cards : toColumn.cards,
    cardId,
    fromColumnId,
    toColumnId,
    targetIndex ?? toColumn.cards.length,
  );

  const toCardsWithoutMoved =
    fromColumnId === toColumnId ? fromCards : toColumn.cards.filter((card) => card.id !== cardId);
  const toCards = [
    ...toCardsWithoutMoved.slice(0, insertIndex),
    movedCard,
    ...toCardsWithoutMoved.slice(insertIndex),
  ];

  return {
    ...board,
    columns: board.columns.map((col) => {
      if (fromColumnId === toColumnId && col.id === fromColumnId) {
        return { ...col, cards: toCards };
      }
      if (col.id === fromColumnId) return { ...col, cards: fromCards };
      if (col.id === toColumnId) return { ...col, cards: toCards };
      return col;
    }),
  };
}

type KanbanColumnSortMode = 'created_desc' | 'created_asc' | 'title_asc';

const KANBAN_COLUMN_SORT_OPTIONS: {
  mode: KanbanColumnSortMode;
  label: string;
}[] = [
  { mode: 'created_desc', label: 'Data de criação (mais recente primeiro)' },
  { mode: 'created_asc', label: 'Data de criação (mais antigo primeiro)' },
  { mode: 'title_asc', label: 'Nome do cartão (em ordem alfabética)' },
];

function sortKanbanColumnCards(cards: KanbanCard[], mode: KanbanColumnSortMode): KanbanCard[] {
  const next = [...cards];
  if (mode === 'created_desc') {
    next.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  } else if (mode === 'created_asc') {
    next.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  } else {
    next.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' }));
  }
  return next;
}

function replaceColumnCardsInBoardCache(
  board: KanbanBoard | undefined,
  columnId: string,
  cards: KanbanCard[],
): KanbanBoard | undefined {
  if (!board) return board;
  return {
    ...board,
    columns: board.columns.map((col) => (col.id === columnId ? { ...col, cards } : col)),
  };
}

const KANBAN_REORDER_MS = 380;

type KanbanReorderIdAttr = 'data-kanban-card-id' | 'data-kanban-column-id';
type KanbanReorderClass = 'kanban-card-reordering' | 'kanban-column-reordering';

function kanbanPrefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function captureKanbanReorderRects(
  container: HTMLElement,
  idAttribute: KanbanReorderIdAttr,
): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  container.querySelectorAll(`[${idAttribute}]`).forEach((node) => {
    if (node instanceof HTMLElement) {
      const id = node.getAttribute(idAttribute);
      if (id) map.set(id, node.getBoundingClientRect());
    }
  });
  return map;
}

function animateKanbanReorder(
  container: HTMLElement,
  beforeRects: Map<string, DOMRect>,
  idAttribute: KanbanReorderIdAttr,
  reorderingClass: KanbanReorderClass,
): void {
  if (kanbanPrefersReducedMotion()) return;

  container.querySelectorAll(`[${idAttribute}]`).forEach((node) => {
    const el = node as HTMLElement;
    const id = el.getAttribute(idAttribute);
    if (!id) return;

    const first = beforeRects.get(id);
    if (!first) return;

    const last = el.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    el.classList.add(reorderingClass);
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.style.transition = 'none';

    const cleanup = () => {
      el.classList.remove(reorderingClass);
      el.style.transition = '';
      el.style.transform = '';
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `transform ${KANBAN_REORDER_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        el.style.transform = '';
        el.addEventListener('transitionend', cleanup, { once: true });
        window.setTimeout(cleanup, KANBAN_REORDER_MS + 80);
      });
    });
  });
}

function scheduleKanbanReorderAnimation(
  container: HTMLElement | null,
  beforeRects: Map<string, DOMRect>,
  idAttribute: KanbanReorderIdAttr,
  reorderingClass: KanbanReorderClass,
): void {
  if (!container || kanbanPrefersReducedMotion()) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      animateKanbanReorder(container, beforeRects, idAttribute, reorderingClass);
    });
  });
}

function resolveColumnInsertIndex(
  boardColumns: KanbanColumn[],
  columnId: string,
  rawIndex: number,
): number {
  const bounded = Math.max(0, Math.min(rawIndex, boardColumns.length));
  const sourceIndex = boardColumns.findIndex((col) => col.id === columnId);
  if (sourceIndex < 0) return bounded;

  let insertIndex = bounded;
  if (insertIndex > sourceIndex) insertIndex -= 1;
  return Math.max(0, Math.min(insertIndex, boardColumns.length - 1));
}

function setKanbanColumnDragGhost(
  e: React.DragEvent,
  ghostRef: React.MutableRefObject<HTMLElement | null>,
) {
  const columnEl = e.currentTarget;
  if (!(columnEl instanceof HTMLElement)) return;

  ghostRef.current?.remove();
  const ghost = columnEl.cloneNode(true) as HTMLElement;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.classList.add('kanban-column-drag-ghost');
  ghost.style.position = 'fixed';
  ghost.style.top = '-10000px';
  ghost.style.left = '-10000px';
  ghost.style.width = `${columnEl.offsetWidth}px`;
  ghost.style.zIndex = '9999';
  document.body.appendChild(ghost);
  ghostRef.current = ghost;
  e.dataTransfer.setDragImage(ghost, 48, 36);
}

function shouldStartColumnDrag(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[data-kanban-card]')) return false;
  if (target.closest('button')) return false;
  return true;
}

function resolveColumnDropIndex(
  columnIndex: number,
  clientX: number,
  rect: DOMRect,
): number {
  const before = clientX < rect.left + rect.width / 2;
  return before ? columnIndex : columnIndex + 1;
}

/** Índice de inserção a partir da posição X no board (cobre gaps entre colunas). */
function resolveColumnDropIndexFromBoard(
  clientX: number,
  boardEl: HTMLElement,
  draggingColumnId?: string | null,
): number {
  const slots = Array.from(
    boardEl.querySelectorAll<HTMLElement>('[data-kanban-column-id]'),
  );
  if (slots.length === 0) return 0;

  for (let i = 0; i < slots.length; i++) {
    const slotId = slots[i].getAttribute('data-kanban-column-id');
    const rect = slots[i].getBoundingClientRect();
    const mid = rect.left + rect.width / 2;

    if (slotId === draggingColumnId) {
      if (clientX < mid) return i;
      continue;
    }

    if (clientX < mid) return i;
  }
  return slots.length;
}

function moveColumnInBoardCache(
  board: KanbanBoard | undefined,
  columnId: string,
  rawIndex: number,
): KanbanBoard | undefined {
  if (!board) return board;

  const cols = [...board.columns];
  const sourceIndex = cols.findIndex((col) => col.id === columnId);
  if (sourceIndex < 0) return board;

  const insertIndex = resolveColumnInsertIndex(cols, columnId, rawIndex);
  if (insertIndex === sourceIndex) return board;

  const [moved] = cols.splice(sourceIndex, 1);
  cols.splice(insertIndex, 0, moved);
  return { ...board, columns: cols };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriorityIndicator({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 text-gray-500 dark:text-gray-400 shrink-0',
        className,
      )}
      title={cfg.label}
    >
      <KanbanPriorityBars priority={priority} />
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
        {cfg.label}
      </span>
    </div>
  );
}

function CardActivityCounts({ card }: { card: KanbanCard }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 text-xs text-gray-500 dark:text-gray-400">
      <span className="inline-flex shrink-0 items-center gap-1 font-medium text-gray-600 dark:text-gray-300">
        <Paperclip className="h-3.5 w-3.5" />
        {card.attachments}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 font-medium text-gray-600 dark:text-gray-300">
        <MessageSquare className="h-3.5 w-3.5" />
        {card.comments}
      </span>
    </div>
  );
}

function CardMetaRow({ card }: { card: KanbanCard }) {
  const dateLabel = formatKanbanCardEndDate(card.endDate);
  const hasDate = !!dateLabel;
  const hasTasks = card.checklistEnabled && card.totalTasks > 0;

  return (
    <div className="mb-3 flex min-w-0 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 text-xs text-gray-500 dark:text-gray-400">
        {hasDate && (
          <>
            <span className="inline-flex min-w-0 items-center gap-1 font-medium text-gray-600 dark:text-gray-300">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{dateLabel}</span>
            </span>
            {hasTasks && (
              <span
                className="h-3.5 w-px shrink-0 bg-gray-300 dark:bg-gray-600"
                aria-hidden
              />
            )}
          </>
        )}
        {hasTasks && <CardActivityCounts card={card} />}
      </div>

      <PriorityIndicator priority={card.priority} className="ml-auto" />
    </div>
  );
}

function KanbanBoardSkeleton() {
  const columns = [
    { cards: [0, 1], color: '#6B7280' },
    { cards: [0, 1, 2], color: '#14B8A6' },
    { cards: [0, 1], color: '#3B82F6' },
  ] as const;

  return (
    <>
      {columns.map((col, colIdx) => (
        <div
          key={colIdx}
          className={clsx(
            'relative flex w-[340px] flex-shrink-0 flex-col rounded-2xl',
            '[background-color:color-mix(in_srgb,var(--kanban-column-accent)_22%,#FFFFFF)]',
            'dark:[background-color:color-mix(in_srgb,var(--kanban-column-accent)_28%,rgb(31_41_55))]',
          )}
          style={getKanbanColumnSurfaceStyle(col.color)}
        >
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: col.color }}
              />
              <div className="h-4 w-20 animate-pulse rounded bg-black/10 dark:bg-white/15" />
              <div className="h-4 w-5 animate-pulse rounded bg-black/[0.07] dark:bg-white/10" />
            </div>
            <div className="flex items-center gap-1">
              <div className="h-7 w-7 animate-pulse rounded-lg bg-black/[0.07] dark:bg-white/10" />
              <div className="h-7 w-7 animate-pulse rounded-lg bg-black/[0.07] dark:bg-white/10" />
            </div>
          </div>

          <div className="flex flex-col gap-3 px-3 pb-3">
            {col.cards.map((cardIdx) => (
              <div
                key={cardIdx}
                className="rounded-2xl border border-transparent bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:bg-gray-800"
              >
                <div className="mb-3 flex gap-1">
                  <div className="h-2 w-10 animate-pulse rounded-sm bg-gray-200 dark:bg-gray-700" />
                  {cardIdx === 0 ? (
                    <div className="h-2 w-8 animate-pulse rounded-sm bg-gray-200/80 dark:bg-gray-700/80" />
                  ) : null}
                </div>
                <div className="mb-3 space-y-2">
                  <div className="h-3.5 w-[88%] animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-3.5 w-[62%] animate-pulse rounded bg-gray-200/80 dark:bg-gray-700/70" />
                </div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="h-3 w-20 animate-pulse rounded bg-gray-100 dark:bg-gray-700/60" />
                  <div className="h-3 w-14 animate-pulse rounded bg-gray-100 dark:bg-gray-700/60" />
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-700/80">
                  <div className="flex gap-3">
                    <div className="h-3 w-8 animate-pulse rounded bg-gray-100 dark:bg-gray-700/50" />
                    <div className="h-3 w-8 animate-pulse rounded bg-gray-100 dark:bg-gray-700/50" />
                  </div>
                  <div className="flex -space-x-1.5">
                    <div className="h-7 w-7 animate-pulse rounded-full bg-gray-200 ring-2 ring-white dark:bg-gray-700 dark:ring-gray-800" />
                    <div className="h-7 w-7 animate-pulse rounded-full bg-gray-200/80 ring-2 ring-white dark:bg-gray-700/80 dark:ring-gray-800" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="px-3 pb-3">
            <div className="h-10 w-full animate-pulse rounded-xl bg-black/[0.06] dark:bg-white/10" />
          </div>
        </div>
      ))}

      <div className="flex h-[220px] w-[340px] flex-shrink-0 flex-col items-center justify-center gap-2 self-start rounded-2xl border-2 border-dashed border-gray-300/80 dark:border-gray-600">
        <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="h-3.5 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    </>
  );
}

function ProgressRing({ value }: { value: number }) {
  const size = 22;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <div className="flex items-center gap-1.5">
      <svg width={size} height={size} className="-rotate-90 flex-shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#FEE2E2"
          strokeWidth={stroke}
          className="dark:stroke-red-900/40"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#DC2626"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="min-w-[2.25rem] text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200">
        {value}%
      </span>
    </div>
  );
}

function CardLabelPill({
  color,
  text,
  expanded,
  onToggle,
}: {
  color: string;
  text: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const showTooltip = useCallback(() => {
    if (expanded) return;
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
    });
    setTooltipVisible(true);
  }, [expanded]);

  const hideTooltip = useCallback(() => {
    setTooltipVisible(false);
  }, []);

  useEffect(() => {
    if (expanded) setTooltipVisible(false);
  }, [expanded]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onToggle();
        }}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        className={clsx(
          'inline-flex shrink-0 items-center overflow-hidden rounded-sm text-left',
          'transition-[max-width,height,padding,filter] duration-200 ease-out',
          'hover:brightness-[0.82] hover:saturate-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
          expanded ? 'h-5 max-w-[9rem] px-2' : 'h-2 max-w-[2.5rem] px-0',
        )}
        style={{
          backgroundColor: color,
          width: 'max-content',
          minWidth: '2.5rem',
        }}
        aria-expanded={expanded}
        aria-label={text || 'Etiqueta'}
      >
        <span
          className={clsx(
            'block max-w-full truncate whitespace-nowrap text-[11px] font-semibold leading-none',
            'transition-opacity duration-200 ease-out',
            expanded ? 'opacity-100' : 'opacity-0',
          )}
          style={{ color: getKanbanLabelTextColor(color) }}
          aria-hidden={!expanded}
        >
          {text || 'Sem nome'}
        </span>
      </button>
      {tooltipVisible &&
        !expanded &&
        text &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: 'translate(-50%, -100%)',
              zIndex: 9999,
            }}
            className="pointer-events-none max-w-[14rem] whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-lg dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}

function CardLabelsRow({
  labels,
  labelPresets,
}: {
  labels: KanbanCard['labels'];
  labelPresets?: readonly KanbanLabelPreset[];
}) {
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const normalized = normalizeKanbanLabels(labels, labelPresets);

  useEffect(() => {
    if (!expanded) return;
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      const el = rowRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && el.contains(target)) return;
      setExpanded(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [expanded]);

  if (normalized.length === 0) return null;

  return (
    <div ref={rowRef} className="mb-2 flex flex-wrap gap-1">
      {normalized.map((l) => (
        <CardLabelPill
          key={`${l.color}-${l.text}`}
          color={l.color}
          text={l.text}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
        />
      ))}
    </div>
  );
}

function getCardMembers(card: KanbanCard) {
  if (card.members && card.members.length > 0) return card.members;
  if (card.assignee && card.assignee !== 'Sem responsável') {
    return [
      {
        userId: card.assigneeUserId ?? card.assignee,
        name: card.assignee,
        profilePhotoUrl: card.assigneeProfilePhotoUrl ?? null,
        avatarColor: card.assigneeColor,
      },
    ];
  }
  return [];
}

function CardMemberAvatars({ card }: { card: KanbanCard }) {
  const list = getCardMembers(card);
  const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);

  if (list.length === 0) return null;

  const visible = list.slice(0, 4);

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((m, index) => {
        const isHovered = hoveredUserId === m.userId;
        return (
          <div
            key={m.userId}
            className="relative"
            style={{
              zIndex: isHovered ? visible.length + 10 : visible.length - index,
            }}
            onMouseEnter={() => setHoveredUserId(m.userId)}
            onMouseLeave={() => setHoveredUserId(null)}
          >
            <KanbanUserAvatar
              name={m.name}
              profilePhotoUrl={m.profilePhotoUrl}
              colorKey={m.userId}
              colorClass={m.avatarColor}
              size="sm"
              showNativeTitle={false}
              className="ring-2 ring-white shadow-sm transition-transform duration-150 dark:ring-gray-800"
            />
            {isHovered ? (
              <div
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 shadow-lg dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                {m.name}
              </div>
            ) : null}
          </div>
        );
      })}
      {list.length > 4 && (
        <div
          className="relative flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-700 ring-2 ring-white dark:bg-gray-600 dark:text-gray-200 dark:ring-gray-800"
          style={{ zIndex: 0 }}
        >
          +{list.length - 4}
        </div>
      )}
    </div>
  );
}

// ─── Card Component ───────────────────────────────────────────────────────────

function kanbanCardBoardSnapshot(card: KanbanCard): string {
  return [
    card.id,
    card.title,
    card.description ?? '',
    card.priority,
    card.progress,
    card.completedTasks,
    card.totalTasks,
    card.comments,
    card.attachments,
    card.endDate ?? '',
    card.startDate ?? '',
    card.completedAt ?? '',
    card.labels.map((l) => `${l.color}:${l.text}`).join(','),
    (card.members ?? []).map((m) => m.userId).join(','),
    card.assignee,
  ].join('|');
}

type KanbanCardViewMode = 'classic' | 'checklist';

const KANBAN_CARD_VIEW_MODE_KEY = 'kanban:cardViewMode';

function readKanbanCardViewMode(): KanbanCardViewMode {
  if (typeof window === 'undefined') return 'classic';
  try {
    return localStorage.getItem(KANBAN_CARD_VIEW_MODE_KEY) === 'checklist'
      ? 'checklist'
      : 'classic';
  } catch {
    return 'classic';
  }
}

interface KanbanCardItemProps {
  card: KanbanCard;
  columnId: string;
  labelPresets?: readonly KanbanLabelPreset[];
  readOnly?: boolean;
  cardViewMode?: KanbanCardViewMode;
  onToggleCardComplete?: (card: KanbanCard) => void;
  onArchiveCard?: (card: KanbanCard, columnId: string) => void;
  onEdit: (card: KanbanCard, columnId: string) => void;
  onMove: (card: KanbanCard, columnId: string) => void;
  onCopy: (card: KanbanCard, columnId: string) => void;
  onDelete: (cardId: string, columnId: string) => void;
  onPrefetch?: (cardId: string) => void;
  onDragStart: (e: React.DragEvent, cardId: string, columnId: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

function KanbanCardItem({
  card,
  columnId,
  labelPresets,
  readOnly = false,
  cardViewMode = 'classic',
  onToggleCardComplete,
  onArchiveCard,
  onEdit,
  onMove,
  onCopy,
  onDelete,
  onPrefetch,
  onDragStart,
  onDragEnd,
  isDragging,
}: KanbanCardItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [suppressHoverPad, setSuppressHoverPad] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const completeBtnRef = useRef<HTMLButtonElement>(null);
  const suppressClickRef = useRef(false);
  const { fire: firePaperConfetti, host: paperConfettiHost } = usePaperConfetti();
  const { celebrating, trigger: triggerCelebrate } = useCelebratePulse();
  const isCompleted = Boolean(card.completedAt);
  const showCompleteCheck = true;
  const showArchiveAction =
    isCompleted && !readOnly && Boolean(onArchiveCard);
  const titleIndented =
    showCompleteCheck && (isCompleted || (hovered && !suppressHoverPad));
  const showCompleteBall =
    showCompleteCheck && (isCompleted || (hovered && !suppressHoverPad));

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleCardClick() {
    if (suppressClickRef.current) return;
    onEdit(card, columnId);
  }

  return (
    <div
      data-kanban-card
      data-kanban-card-id={card.id}
      draggable={!readOnly}
      onDragStart={
        readOnly
          ? undefined
          : (e) => {
              e.stopPropagation();
              suppressClickRef.current = true;
              onDragStart(e, card.id, columnId);
            }
      }
      onDragEnd={
        readOnly
          ? undefined
          : () => {
              onDragEnd();
              window.setTimeout(() => {
                suppressClickRef.current = false;
              }, 150);
            }
      }
      onMouseEnter={() => {
        setHovered(true);
        onPrefetch?.(card.id);
      }}
      onMouseLeave={() => {
        setHovered(false);
        setSuppressHoverPad(false);
      }}
      onFocus={() => onPrefetch?.(card.id)}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      role="button"
      tabIndex={0}
      className={clsx(
        'group relative rounded-2xl border border-transparent bg-white p-4 dark:bg-gray-800',
        menuOpen && 'z-30',
        'cursor-pointer select-none shadow-[0_1px_3px_rgba(0,0,0,0.08)]',
        'transition-[border-color,filter] duration-200 ease-out',
        'motion-reduce:transition-none',
        'active:cursor-grabbing',
        isDragging
          ? 'z-10 opacity-50'
          : [
              'hover:border-gray-200/80 hover:brightness-[0.985]',
              'dark:hover:border-gray-600/70 dark:hover:brightness-110',
            ],
      )}
    >
      {paperConfettiHost}
      {!readOnly && (
        <div
          className={clsx(
            'absolute top-3 right-3 z-[2] flex items-center gap-1 transition-opacity duration-150',
            menuOpen
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100',
          )}
          ref={menuRef}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="rounded-md p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <MoreHorizontal className="w-4 h-4 text-gray-400" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-50 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(card, columnId); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Edit3 className="w-4 h-4" /> Editar
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onMove(card, columnId); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <ArrowRightLeft className="w-4 h-4" /> Mover
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onCopy(card, columnId); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Copy className="w-4 h-4" /> Copiar
              </button>
              {showArchiveAction ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onArchiveCard?.(card, columnId);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <Archive className="w-4 h-4" /> Arquivar
                </button>
              ) : null}
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(card.id, columnId); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" /> Excluir
              </button>
            </div>
          )}
        </div>
      )}

      <div className="relative z-[1]">
      {card.labels.length > 0 && (
        <CardLabelsRow labels={card.labels} labelPresets={labelPresets} />
      )}

      <div
        className={clsx(
          'relative mb-1.5 pr-6 motion-reduce:transition-none',
          'transition-[padding] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
          titleIndented ? 'pl-[26px]' : 'pl-0',
        )}
      >
        {showCompleteCheck ? (
          <button
            ref={completeBtnRef}
            type="button"
            disabled={readOnly || !onToggleCardComplete}
            title={isCompleted ? 'Marcar como pendente' : 'Marcar como concluído'}
            aria-label={isCompleted ? 'Marcar como pendente' : 'Marcar como concluído'}
            onClick={(e) => {
              e.stopPropagation();
              if (isCompleted) setSuppressHoverPad(true);
              else {
                setSuppressHoverPad(false);
                triggerCelebrate();
                firePaperConfetti(originFromElement(completeBtnRef.current), 48);
              }
              onToggleCardComplete?.(card);
            }}
            className={clsx(
              'absolute left-0 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px]',
              'transition-[opacity,transform,border-color,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
              'motion-reduce:transition-none',
              celebrating && 'kanban-complete-celebrate',
              isCompleted
                ? 'scale-100 border-[#61BD4F] bg-[#61BD4F] text-white opacity-100'
                : [
                    'border-gray-400 bg-transparent',
                    showCompleteBall
                      ? 'scale-100 opacity-100'
                      : 'scale-90 opacity-0',
                    'hover:border-[#61BD4F]',
                    'dark:border-gray-500 dark:hover:border-[#61BD4F]',
                  ],
              (readOnly || !onToggleCardComplete) && 'cursor-default',
            )}
          >
            {isCompleted ? (
              <Check
                className={clsx(
                  'h-2.5 w-2.5 stroke-[3]',
                  celebrating && 'kanban-complete-check-pop',
                )}
                aria-hidden
              />
            ) : null}
          </button>
        ) : null}
        <h4
          className={clsx(
            'min-w-0 text-[15px] font-semibold leading-snug',
            'transition-colors duration-200 ease-out',
            isCompleted && showCompleteCheck
              ? 'text-gray-500 dark:text-gray-400'
              : 'text-gray-900 dark:text-gray-100',
          )}
        >
          {card.title.trim() ? (
            card.title
          ) : (
            <span className="font-medium text-gray-400 dark:text-gray-500">Sem título</span>
          )}
        </h4>
      </div>

      {card.description?.trim() ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate mb-3">
          {card.description.trim()}
        </p>
      ) : null}

      <CardMetaRow card={card} />

      <div className="min-h-[2.25rem] border-t border-gray-100 dark:border-gray-700/80 pt-3 flex items-center justify-between gap-2">
        {card.checklistEnabled && card.totalTasks > 0 ? (
          <>
            <ProgressRing value={card.progress} />
            <span className="flex flex-1 items-center justify-center gap-1.5 text-xs tabular-nums text-gray-500 dark:text-gray-400 whitespace-nowrap">
              <ListChecks className="h-3.5 w-3.5 shrink-0" />
              {card.completedTasks}/{card.totalTasks} Tasks
            </span>
            <CardMemberAvatars card={card} />
          </>
        ) : (
          <>
            <CardActivityCounts card={card} />
            <CardMemberAvatars card={card} />
          </>
        )}
      </div>
      </div>
    </div>
  );
}

const KanbanCardItemMemo = React.memo(
  KanbanCardItem,
  (prev, next) =>
    prev.columnId === next.columnId &&
    prev.isDragging === next.isDragging &&
    prev.readOnly === next.readOnly &&
    prev.cardViewMode === next.cardViewMode &&
    prev.onToggleCardComplete === next.onToggleCardComplete &&
    prev.onArchiveCard === next.onArchiveCard &&
    prev.labelPresets === next.labelPresets &&
    kanbanCardBoardSnapshot(prev.card) === kanbanCardBoardSnapshot(next.card),
);

function KanbanDropLine({ active }: { active: boolean }) {
  return (
    <div
      className={clsx(
        'pointer-events-none absolute inset-x-3 z-[3] h-0.5 -translate-y-1/2 rounded-full bg-red-500/90 transition-opacity duration-150',
        active && 'kanban-card-drop-gutter-line opacity-100',
        !active && 'scale-x-0 opacity-0',
      )}
      aria-hidden
    />
  );
}

function KanbanColumnDropGutter({
  active,
  onDragOver,
  onDrop,
}: {
  active: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className="relative z-[3] w-8 shrink-0 self-stretch min-h-[200px] -mx-4"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragOver(e);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(e);
      }}
    >
      <div
        className={clsx(
          'pointer-events-none absolute inset-y-6 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-red-500/90 transition-opacity duration-200',
          active && 'kanban-column-drop-gutter-line opacity-100',
          !active && 'scale-y-0 opacity-0',
        )}
      />
    </div>
  );
}

// ─── Column Component ─────────────────────────────────────────────────────────

interface KanbanColumnProps {
  column: KanbanColumn;
  labelPresets?: readonly KanbanLabelPreset[];
  dragState: DragState;
  isColumnDragging?: boolean;
  isColumnDragActive?: boolean;
  /** Desliga só o DnD de cards (ex.: com filtro/busca ativos). */
  disableCardDnD?: boolean;
  readOnly?: boolean;
  onAddCard: (columnId: string, insertAt: 'top' | 'bottom') => void;
  onEditCard: (card: KanbanCard, columnId: string) => void;
  onMoveCard: (card: KanbanCard, columnId: string) => void;
  onCopyCard: (card: KanbanCard, columnId: string) => void;
  onDeleteCard: (cardId: string, columnId: string) => void;
  onPrefetchCard?: (cardId: string) => void;
  cardViewMode?: KanbanCardViewMode;
  onToggleCardComplete?: (card: KanbanCard) => void;
  onArchiveCard?: (card: KanbanCard, columnId: string) => void;
  onColumnDragStart?: (e: React.DragEvent, columnId: string) => void;
  onColumnDragEnd?: () => void;
  onDragStart: (e: React.DragEvent, cardId: string, columnId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, columnId: string, index?: number) => void;
  onDrop: (e: React.DragEvent, columnId: string, index?: number) => void;
  onEditColumn: (column: KanbanColumn) => void;
  onDeleteColumn: (columnId: string) => void;
  onSortColumn: (columnId: string, mode: KanbanColumnSortMode) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function KanbanColumnComponent({
  column,
  labelPresets,
  dragState,
  isColumnDragging = false,
  isColumnDragActive = false,
  disableCardDnD = false,
  readOnly = false,
  onAddCard,
  onEditCard,
  onMoveCard,
  onCopyCard,
  onDeleteCard,
  onPrefetchCard,
  cardViewMode = 'classic',
  onToggleCardComplete,
  onArchiveCard,
  onColumnDragStart,
  onColumnDragEnd,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onEditColumn,
  onDeleteColumn,
  onSortColumn,
  collapsed = false,
  onToggleCollapse,
}: KanbanColumnProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<'main' | 'sort'>('main');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [visibleCount, setVisibleCount] = useState(KANBAN_COLUMN_VISIBLE_BATCH);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const columnRootRef = useRef<HTMLDivElement>(null);
  const cardsScrollRef = useRef<HTMLDivElement>(null);
  const isTarget = dragState.overColumnId === column.id;
  const overIndex = isTarget ? dragState.overIndex : null;
  const cardDnDDisabled = readOnly || isColumnDragActive || disableCardDnD;
  const isChecklistView = cardViewMode === 'checklist';
  const visibleCards = column.cards.slice(0, visibleCount);
  const hasMoreCards = column.cards.length > visibleCount;

  const loadMoreCards = useCallback(() => {
    setVisibleCount((current) =>
      Math.min(current + KANBAN_COLUMN_VISIBLE_BATCH, column.cards.length),
    );
  }, [column.cards.length]);

  const updateBottomFade = useCallback(() => {
    const el = cardsScrollRef.current;
    if (!el || !isChecklistView) {
      setShowBottomFade(false);
      return;
    }
    const canScroll = el.scrollHeight > el.clientHeight + 2;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 6;
    setShowBottomFade(canScroll && !atBottom);
  }, [isChecklistView]);

  useEffect(() => {
    const id = requestAnimationFrame(() => updateBottomFade());
    return () => cancelAnimationFrame(id);
  }, [updateBottomFade, visibleCards.length, column.cards.length, hasMoreCards]);

  useEffect(() => {
    const el = cardsScrollRef.current;
    if (!el || !isChecklistView) return;
    const onScroll = () => {
      updateBottomFade();
      if (column.cards.length <= visibleCount) return;
      // Evita carregar tudo de uma vez quando ainda não há overflow.
      if (el.scrollHeight <= el.clientHeight + 4) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 96) {
        loadMoreCards();
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => updateBottomFade());
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [updateBottomFade, isChecklistView, column.cards.length, visibleCount, loadMoreCards]);

  // Preenche a altura da coluna na visão checklist sem montar todos os cards de uma vez.
  useEffect(() => {
    if (!isChecklistView || !hasMoreCards) return;
    const el = cardsScrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      if (el.scrollHeight <= el.clientHeight + 4) {
        loadMoreCards();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [isChecklistView, hasMoreCards, visibleCount, loadMoreCards]);

  function resolveColumnCardDropIndex(clientY: number): number {
    if (!columnRootRef.current) return visibleCards.length;
    return resolveCardDropIndexFromClientY(columnRootRef.current, clientY);
  }

  useEffect(() => {
    setVisibleCount(KANBAN_COLUMN_VISIBLE_BATCH);
  }, [column.id, cardViewMode]);

  useEffect(() => {
    if (!menuOpen) setMenuView('main');
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuBtnRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-kanban-column-menu]')) return;
      setMenuOpen(false);
    }
    function handleReposition() {
      const rect = menuBtnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = menuView === 'sort' ? 300 : 176;
      const menuHeight = menuView === 'sort' ? 220 : 188;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < menuHeight + 8 && rect.top > menuHeight + 8;
      setMenuStyle({
        position: 'fixed',
        left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
        top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
        width: menuWidth,
        zIndex: 9999,
      });
    }
    handleReposition();
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [menuOpen, menuView]);

  if (collapsed) {
    const isCollapsedDropTarget =
      isTarget && !!dragState.draggingCardId && !isColumnDragActive;

    return (
      <div
        data-kanban-column
        draggable={!!onColumnDragStart}
        onDragStart={
          onColumnDragStart
            ? (e) => {
                if (!shouldStartColumnDrag(e.target)) {
                  e.preventDefault();
                  return;
                }
                onColumnDragStart(e, column.id);
              }
            : undefined
        }
        onDragEnd={onColumnDragEnd}
        className={clsx(
          'group/collapsed relative flex flex-col items-center w-[52px] flex-shrink-0 self-start h-auto',
          'rounded-2xl',
          '[background-color:color-mix(in_srgb,var(--kanban-column-accent)_22%,#FFFFFF)]',
          'dark:[background-color:color-mix(in_srgb,var(--kanban-column-accent)_28%,rgb(31_41_55))]',
          'hover:brightness-[1.03] dark:hover:brightness-110',
          'transition-[opacity,filter,background-color] duration-200 ease-out motion-reduce:transition-none',
          onColumnDragStart && 'cursor-grab active:cursor-grabbing',
          isColumnDragging && 'kanban-column-dragging',
          isCollapsedDropTarget &&
            'ring-2 ring-red-500/90 dark:ring-red-400/80 ring-inset',
        )}
        style={getKanbanColumnSurfaceStyle(column.color)}
        onDragOver={
          readOnly || isColumnDragActive
            ? undefined
            : (e) => onDragOver(e, column.id, 0)
        }
        onDrop={
          readOnly || isColumnDragActive
            ? undefined
            : (e) => onDrop(e, column.id, 0)
        }
      >
        <div className="flex flex-col items-center w-full pt-3 pb-2 select-none">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-gray-400"
            title="Expandir lista"
            aria-label="Expandir lista"
          >
            <Maximize2 className="w-[18px] h-[18px] rotate-45" strokeWidth={2} />
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          title={`Expandir ${column.title}`}
          className="flex items-start justify-center w-full px-2 py-2 select-none"
        >
          <span className="[writing-mode:vertical-lr] [text-orientation:mixed] text-[15px] font-semibold leading-relaxed text-gray-900 dark:text-gray-100 whitespace-normal break-normal">
            {column.title}
            <span className="inline-block ps-3 font-medium tabular-nums text-gray-600 dark:text-gray-300">
              {column.cards.length}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleCollapse}
          title={`Expandir ${column.title}`}
          aria-label={`Expandir ${column.title}`}
          className="flex w-full flex-col items-center justify-center pb-4 pt-2 select-none"
        >
          <span
            className="w-2.5 h-2.5 rounded-full ring-2 ring-white/70 dark:ring-black/20"
            style={{ backgroundColor: column.color }}
          />
        </button>
      </div>
    );
  }

  return (
    <div
      data-kanban-column
      draggable={!!onColumnDragStart}
      onDragStart={
        onColumnDragStart
          ? (e) => {
              if (!shouldStartColumnDrag(e.target)) {
                e.preventDefault();
                return;
              }
              onColumnDragStart(e, column.id);
            }
          : undefined
      }
      onDragEnd={onColumnDragEnd}
      className={clsx(
        'relative flex w-[340px] flex-shrink-0 flex-col rounded-2xl',
        isChecklistView && 'h-full max-h-full min-h-0 overflow-hidden',
        '[background-color:color-mix(in_srgb,var(--kanban-column-accent)_22%,#FFFFFF)]',
        'dark:[background-color:color-mix(in_srgb,var(--kanban-column-accent)_28%,rgb(31_41_55))]',
        'transition-[opacity,box-shadow,background-color] duration-200 ease-out motion-reduce:transition-none',
        onColumnDragStart && 'cursor-grab active:cursor-grabbing [&_[data-kanban-card]]:cursor-pointer',
        isColumnDragging && 'kanban-column-dragging',
      )}
      style={getKanbanColumnSurfaceStyle(column.color)}
      ref={columnRootRef}
      onDragOver={
        readOnly || isColumnDragActive
          ? undefined
          : (e) => {
              e.preventDefault();
              onDragOver(e, column.id, resolveColumnCardDropIndex(e.clientY));
            }
      }
      onDrop={
        readOnly || isColumnDragActive
          ? undefined
          : (e) => {
              e.preventDefault();
              e.stopPropagation();
              // Preferir o slot da linha vermelha (overIndex); Y no container manda pro fim.
              const fromHover =
                dragState.overColumnId === column.id && dragState.overIndex != null
                  ? dragState.overIndex
                  : resolveColumnCardDropIndex(e.clientY);
              onDrop(e, column.id, fromHover);
            }
      }
    >
      <div
        className={clsx(
          'flex items-center justify-between px-4 pt-4 pb-2 select-none',
          isChecklistView && 'shrink-0',
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: column.color }}
          />
          <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 truncate">
            {column.title}
          </h3>
          <span className="text-[15px] font-medium text-gray-600 dark:text-gray-300 tabular-nums">
            {column.cards.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/80 dark:hover:bg-gray-700 transition-colors"
              title="Recolher lista"
              aria-label="Recolher lista"
            >
              <Minimize2 className="w-[18px] h-[18px] rotate-45" strokeWidth={2} />
            </button>
          ) : null}
          {!readOnly && (
          <div className="relative">
            <button
              ref={menuBtnRef}
              type="button"
              aria-label="Menu da coluna"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => {
                if (menuOpen) {
                  setMenuOpen(false);
                  return;
                }
                const rect = menuBtnRef.current?.getBoundingClientRect();
                if (!rect) return;
                const menuWidth = 176;
                const menuHeight = 188;
                const spaceBelow = window.innerHeight - rect.bottom;
                const openUp = spaceBelow < menuHeight + 8 && rect.top > menuHeight + 8;
                setMenuView('main');
                setMenuStyle({
                  position: 'fixed',
                  left: Math.max(
                    8,
                    Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
                  ),
                  top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
                  width: menuWidth,
                  zIndex: 9999,
                });
                setMenuOpen(true);
              }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/80 dark:hover:bg-gray-700 transition-colors"
            >
              <MoreHorizontal className="w-[18px] h-[18px]" />
            </button>
            {menuOpen &&
              typeof document !== 'undefined' &&
              createPortal(
                <div
                  data-kanban-column-menu
                  role="menu"
                  style={menuStyle}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {menuView === 'main' ? (
                    <div className="py-1">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onAddCard(column.id, 'top');
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Plus className="h-4 w-4" /> Adicionar card
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onEditColumn(column);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Edit3 className="h-4 w-4" /> Editar coluna
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setMenuView('sort')}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <ArrowUpDown className="h-4 w-4" /> Ordenar lista
                      </button>
                      <hr className="my-1 border-gray-200 dark:border-gray-700" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onDeleteColumn(column.id);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" /> Excluir coluna
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-1 border-b border-gray-200 px-1 py-1.5 dark:border-gray-700">
                        <button
                          type="button"
                          onClick={() => setMenuView('main')}
                          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                          aria-label="Voltar"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <p className="flex-1 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                          Ordenar lista
                        </p>
                        <button
                          type="button"
                          onClick={() => setMenuOpen(false)}
                          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                          aria-label="Fechar"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="py-1">
                        {KANBAN_COLUMN_SORT_OPTIONS.map((option) => (
                          <button
                            key={option.mode}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuOpen(false);
                              onSortColumn(column.id, option.mode);
                            }}
                            className="w-full px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>,
                document.body,
              )}
          </div>
          )}
        </div>
      </div>

      <div
        className={clsx(
          isChecklistView && 'relative flex min-h-0 flex-1 flex-col overflow-hidden',
        )}
      >
        <div
          ref={cardsScrollRef}
          className={clsx(
            isChecklistView
              ? 'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain scrollbar-hide px-3 pt-2 pb-4'
              : 'flex flex-col px-3 pt-2 pb-3',
            isChecklistView &&
              showBottomFade &&
              '[mask-image:linear-gradient(to_bottom,black_0%,black_calc(100%-3.25rem),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_calc(100%-3.25rem),transparent_100%)]',
          )}
        >
        {visibleCards.map((card, index) => {
          const showLineBefore =
            !cardDnDDisabled &&
            !!dragState.draggingCardId &&
            dragState.overColumnId === column.id &&
            overIndex === index;
          const showLineAfter =
            !cardDnDDisabled &&
            !!dragState.draggingCardId &&
            dragState.overColumnId === column.id &&
            overIndex === index + 1 &&
            index === visibleCards.length - 1;

          return (
            <div
              key={card.id}
              // py-1 no lugar de gap: o vão entre cards também é área de drop (sem zona morta).
              className={clsx('relative shrink-0', index === 0 ? 'pb-1' : 'py-1')}
              onDragOver={
                cardDnDDisabled
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const middleY = rect.top + rect.height / 2;
                      const dropIndex = e.clientY < middleY ? index : index + 1;
                      onDragOver(e, column.id, dropIndex);
                    }
              }
              onDrop={
                cardDnDDisabled
                  ? undefined
                  : (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const middleY = rect.top + rect.height / 2;
                      const dropIndex = e.clientY < middleY ? index : index + 1;
                      onDrop(e, column.id, dropIndex);
                    }
              }
            >
              {/* Linha de drop no meio do vão — não ocupa altura nem empurra cards. */}
              <div
                className={clsx(
                  'pointer-events-none absolute inset-x-0 z-[3]',
                  index === 0 ? '-top-1' : 'top-0',
                )}
              >
                <KanbanDropLine active={showLineBefore} />
              </div>
              <KanbanCardItemMemo
                card={card}
                columnId={column.id}
                labelPresets={labelPresets}
                readOnly={readOnly}
                cardViewMode={cardViewMode}
                onToggleCardComplete={onToggleCardComplete}
                onArchiveCard={onArchiveCard}
                onEdit={onEditCard}
                onMove={onMoveCard}
                onCopy={onCopyCard}
                onDelete={onDeleteCard}
                onPrefetch={onPrefetchCard}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                isDragging={dragState.draggingCardId === card.id}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3]">
                <KanbanDropLine active={showLineAfter} />
              </div>
            </div>
          );
        })}
        {hasMoreCards && (
          <button
            type="button"
            onClick={loadMoreCards}
            className="mt-1 w-full shrink-0 rounded-xl border border-gray-200/80 bg-white/70 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-white hover:text-gray-900 dark:border-gray-600 dark:bg-gray-800/50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            Ver mais ({column.cards.length - visibleCount})
          </button>
        )}
        {column.cards.length === 0 && !cardDnDDisabled && (
          <div
            className={clsx('relative min-h-[12px]', isChecklistView && 'flex-1')}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDragOver(e, column.id, 0);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDrop(e, column.id, 0);
            }}
          >
            {!!dragState.draggingCardId &&
              dragState.overColumnId === column.id &&
              overIndex === 0 && (
                <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[3]">
                  <KanbanDropLine active />
                </div>
              )}
          </div>
        )}
        {!readOnly && !hasMoreCards && !isChecklistView && (
          <button
            type="button"
            onClick={() => onAddCard(column.id, 'bottom')}
            className={clsx(
              'flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left text-sm font-medium transition-colors',
              'text-gray-500 hover:bg-white/80 hover:text-gray-800',
              'dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-200',
              column.cards.length === 0 ? 'shrink-0' : 'mt-1',
            )}
          >
            <Plus className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={2} />
            Adicionar card
          </button>
        )}
        </div>
      </div>
      {!readOnly && !hasMoreCards && isChecklistView && (
        <div className="shrink-0 px-3 pb-3 pt-1">
          <button
            type="button"
            onClick={() => onAddCard(column.id, 'bottom')}
            className={clsx(
              'flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left text-sm font-medium transition-colors',
              'text-gray-500 hover:bg-white/80 hover:text-gray-800',
              'dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-200',
            )}
          >
            <Plus className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={2} />
            Adicionar card
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Column Modal ─────────────────────────────────────────────────────────────

interface ColumnModalProps {
  mode: 'create' | 'edit';
  initial?: KanbanColumn;
  onClose: () => void;
  onSave: (title: string, color: string, limit: number | undefined, id?: string) => void | Promise<void>;
  saving?: boolean;
}

function ColumnModal({ mode, initial, onClose, onSave, saving }: ColumnModalProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [color, setColor] = useState(initial?.color ?? '#6B7280');
  const [limit, setLimit] = useState<string>(initial?.limit ? String(initial.limit) : '');

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="sm"
      title={mode === 'create' ? 'Nova coluna' : 'Editar coluna'}
      closeOnOverlayClick={!saving}
    >
      <div className="space-y-4">
        <div>
          <label className={kanbanLabel}>Nome *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nome da coluna..."
            className={kanbanInput}
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
            Selecionar uma cor
          </p>
          <KanbanLabelColorMapInline color={color} onChange={setColor} />
        </div>
        <div>
          <label className={kanbanLabel}>Limite de cards (opcional)</label>
          <input
            type="number"
            min={0}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="Ex: 10"
            className={kanbanInputNumber}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={saving}
            className="!bg-red-600 hover:!bg-red-700 !text-white border-transparent focus-visible:ring-red-500"
            onClick={async () => {
              if (!title.trim()) {
                toast.error('Nome é obrigatório');
                return;
              }
              await onSave(title.trim(), color, limit ? parseInt(limit, 10) : undefined, initial?.id);
            }}
          >
            {mode === 'create' ? 'Criar coluna' : 'Salvar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Mover / Copiar cartão ────────────────────────────────────────────────────

interface CardColumnActionModalProps {
  mode: 'move' | 'copy';
  cardTitle: string;
  currentColumnId: string;
  columns: KanbanColumn[];
  onClose: () => void;
  onConfirm: (columnId: string, title?: string) => void;
}

function CardColumnActionModal({
  mode,
  cardTitle,
  currentColumnId,
  columns,
  onClose,
  onConfirm,
}: CardColumnActionModalProps) {
  const [columnId, setColumnId] = useState(currentColumnId);
  const [title, setTitle] = useState(cardTitle);
  const [submitting, setSubmitting] = useState(false);

  const columnOptions = useMemo(
    () =>
      columns.map((column) => ({
        value: column.id,
        label: column.title,
        searchText: column.title,
      })),
    [columns],
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="sm"
      title={mode === 'move' ? 'Mover cartão' : 'Copiar cartão'}
      closeOnOverlayClick={!submitting}
    >
      <div className="space-y-4">
        {mode === 'copy' ? (
          <div>
            <label className={kanbanLabel}>Nome</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nome do cartão..."
              className={kanbanInput}
            />
          </div>
        ) : null}
        <div>
          <label className={kanbanLabel}>Lista</label>
          <StringSingleSelectDropdown
            value={columnId}
            onChange={setColumnId}
            options={columnOptions}
            allowEmpty={false}
            placeholder="Selecione a coluna..."
          />
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-2 dark:border-gray-700">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={submitting}
            className="!bg-red-600 hover:!bg-red-700 !text-white border-transparent focus-visible:ring-red-500"
            onClick={() => {
              if (submitting) return;
              if (!columnId) {
                toast.error('Selecione uma coluna');
                return;
              }
              if (mode === 'copy' && !title.trim()) {
                toast.error('Nome é obrigatório');
                return;
              }
              setSubmitting(true);
              onConfirm(columnId, mode === 'copy' ? title.trim() : undefined);
            }}
          >
            {mode === 'move' ? 'Mover' : 'Copiar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Drag State ───────────────────────────────────────────────────────────────

interface DragState {
  draggingCardId: string | null;
  fromColumnId: string | null;
  overColumnId: string | null;
  overIndex: number | null;
}

interface ColumnDragState {
  draggingColumnId: string | null;
  overIndex: number | null;
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ columns }: { columns: KanbanColumn[] }) {
  const total = columns.reduce((s, c) => s + c.cards.length, 0);
  const done = columns.find((c) => c.title === 'Completed')?.cards.length ?? 0;
  const overdue = columns.flatMap((c) => c.cards).filter((card) => isOverdue(card.endDate)).length;
  const inProgress = columns.find((c) => c.title === 'Active')?.cards.length ?? 0;

  const stats = [
    { label: 'Total de Cards', value: total, icon: <LayoutGrid className="w-4 h-4" />, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700' },
    { label: 'Em Andamento', value: inProgress, icon: <Loader className="w-4 h-4" />, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Concluídos', value: done, icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Atrasados', value: overdue, icon: <AlertCircle className="w-4 h-4" />, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      {stats.map((s) => (
        <div key={s.label} className={clsx('flex items-center gap-3 px-4 py-3 rounded-xl', s.bg)}>
          <span className={s.color}>{s.icon}</span>
          <div>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-none">{s.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Board picker row actions ─────────────────────────────────────────────────

function KanbanBoardRowActions({
  board,
  active,
  isAdministrator,
  onShare,
  onEditName,
  onDeleteBoard,
  onClosePicker,
}: {
  board: KanbanBoardSummary;
  active: boolean;
  isAdministrator?: boolean;
  onShare: (board: KanbanBoardSummary) => void;
  onEditName: (board: KanbanBoardSummary) => void;
  onDeleteBoard: (board: KanbanBoardSummary) => void;
  onClosePicker: () => void;
}) {
  const canManage = Boolean(board.isCustom && board.isOwner && board.id);
  const canDelete = Boolean(
    board.isCustom && board.id && (board.isOwner || isAdministrator),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-kanban-board-row-menu]')) return;
      setMenuOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpen]);

  const triggerClass = clsx(
    'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
    active
      ? 'text-red-500/80 hover:bg-red-100/70 hover:text-red-600 dark:text-red-300/80 dark:hover:bg-red-900/40 dark:hover:text-red-200'
      : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200',
  );

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canManage && !canDelete) return;
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;

    const menuWidth = 176;
    const menuHeight = canManage ? 140 : 56;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + 8 && rect.top > menuHeight + 8;

    setMenuStyle({
      position: 'fixed',
      left: Math.max(8, rect.right - menuWidth),
      top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
      width: menuWidth,
      zIndex: 9999,
    });
    setMenuOpen((v) => !v);
  };

  if (!canManage && !canDelete) {
    return <span className="inline-block h-8 w-8 shrink-0" aria-hidden />;
  }

  const runMenuAction = (action: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    action();
  };

  const menu =
    menuOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            data-kanban-board-row-menu
            role="menu"
            style={menuStyle}
            className="overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {canManage ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onMouseDown={runMenuAction(() => {
                    onShare(board);
                    onClosePicker();
                  })}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Users className="h-4 w-4 shrink-0" />
                  Compartilhar
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onMouseDown={runMenuAction(() => {
                    onEditName(board);
                    onClosePicker();
                  })}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Edit3 className="h-4 w-4 shrink-0" />
                  Editar
                </button>
                <hr className="my-1 border-gray-200 dark:border-gray-700" />
              </>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                role="menuitem"
                onMouseDown={runMenuAction(() => {
                  onDeleteBoard(board);
                  onClosePicker();
                })}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                Excluir
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title="Opções do quadro"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={openMenu}
        className={triggerClass}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function KanbanBoardPicker({
  boards,
  currentDepartmentKey,
  defaultDepartmentKey,
  canCreateBoard,
  isAdministrator,
  currentBoardLabel,
  onSelect,
  onSetDefault,
  onCreateBoard,
  onShare,
  onEditName,
  onDeleteBoard,
}: {
  boards: KanbanBoardSummary[];
  currentDepartmentKey?: string;
  defaultDepartmentKey?: string | null;
  canCreateBoard?: boolean;
  isAdministrator?: boolean;
  /** Nome exibido no botão (fallback se o quadro ainda não estiver na lista). */
  currentBoardLabel?: string | null;
  onSelect: (departmentKey: string) => void;
  onSetDefault: (departmentKey: string) => void;
  onCreateBoard: () => void;
  onShare: (board: KanbanBoardSummary) => void;
  onEditName: (board: KanbanBoardSummary) => void;
  onDeleteBoard: (board: KanbanBoardSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const currentBoardName =
    currentBoardLabel?.trim() ||
    boards.find((b) => b.departmentKey === currentDepartmentKey)?.department ||
    'Quadros';

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-kanban-board-row-menu]')) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Quadro atual: ${currentBoardName}`}
        title={currentBoardName}
        className="inline-flex h-9 max-w-[min(18rem,calc(100vw-8rem))] items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
      >
        <LayoutGrid className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
        <span className="min-w-0 truncate">{currentBoardName}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[16rem] w-max max-w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
          <div className="max-h-72 overflow-y-auto overscroll-contain p-1.5">
            {boards.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
                Nenhum quadro disponível.
              </p>
            ) : (
              <div className="space-y-1">
              {boards.map((b) => {
                const active = b.departmentKey === currentDepartmentKey;
                const isDefault = defaultDepartmentKey === b.departmentKey;
                return (
                  <div
                    key={b.id || b.departmentKey}
                    className={clsx(
                      'flex min-h-10 items-center rounded-lg px-2 transition-colors',
                      active
                        ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60',
                    )}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setOpen(false);
                        if (!active) onSelect(b.departmentKey);
                      }}
                      className={clsx(
                        'flex-1 whitespace-nowrap py-2 pr-2 text-left text-sm',
                        active && 'font-medium',
                      )}
                    >
                      {b.department}
                    </button>
                    <div className="flex shrink-0 items-center">
                      <KanbanBoardRowActions
                        board={b}
                        active={active}
                        isAdministrator={isAdministrator}
                        onShare={onShare}
                        onEditName={onEditName}
                        onDeleteBoard={onDeleteBoard}
                        onClosePicker={() => setOpen(false)}
                      />
                      <button
                        type="button"
                        title={isDefault ? 'Quadro padrão' : 'Definir como padrão'}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isDefault) onSetDefault(b.departmentKey);
                        }}
                        className={clsx(
                          'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                          isDefault
                            ? 'text-amber-500 dark:text-amber-400'
                            : active
                              ? 'text-red-400/70 hover:bg-red-100/70 hover:text-amber-500 dark:text-red-300/70 dark:hover:bg-red-900/40 dark:hover:text-amber-400'
                              : 'text-gray-400 hover:bg-gray-100 hover:text-amber-500 dark:hover:bg-gray-700 dark:hover:text-amber-400',
                        )}
                      >
                        <Star className={clsx('h-4 w-4', isDefault && 'fill-current')} />
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>
            )}
          </div>
          {canCreateBoard !== false ? (
          <div className="border-t border-gray-100 p-2 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreateBoard();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <Plus className="h-4 w-4 shrink-0" />
              Novo Quadro
            </button>
          </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function KanbanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const departmentKeyParam = searchParams?.get('departmentKey') ?? null;
  const legacyListParam =
    searchParams?.get('list') === '1' || searchParams?.get('list') === 'true';

  const {
    isAdministrator,
    canViewKanbanValues,
    isLoading: loadingPerms,
    user: meUser,
  } = usePermissions();

  const quickDefaultBoardKey =
    meUser?.id && !departmentKeyParam ? getKanbanDefaultBoard(meUser.id) : null;

  const { data: boardsList, isLoading: loadingBoardsList } = useQuery({
    queryKey: ['kanban-boards'],
    queryFn: fetchKanbanBoards,
    enabled: !!meUser,
    staleTime: 3 * 60 * 1000,
  });

  const [defaultBoardRev, setDefaultBoardRev] = useState(0);

  const defaultDepartmentKey = useMemo(() => {
    if (!meUser?.id || !boardsList?.length) return null;
    void defaultBoardRev;
    return resolveKanbanDefaultBoard(meUser.id, boardsList);
  }, [meUser?.id, boardsList, defaultBoardRev]);

  /** Chave estável do quadro — evita buscar pelo setor do usuário antes do redirect. */
  const boardScopeKey =
    departmentKeyParam ?? defaultDepartmentKey ?? quickDefaultBoardKey ?? null;
  const boardsListReady = boardsList !== undefined && !loadingBoardsList;
  /** Sem chave explícita, ainda busca o quadro do setor (`/kanban/board` cria se preciso). */
  const canLoadBoard = !!meUser && (!!boardScopeKey || boardsListReady);
  const kanbanBoardQueryKey = ['kanban-board', boardScopeKey ?? 'own'] as const;

  const setAsDefaultBoard = useCallback(
    (departmentKey: string) => {
      if (!meUser?.id || !boardsList?.length) return;
      const ownDeptKey = boardsList.find((b) => b.isOwnDepartment)?.departmentKey;
      if (departmentKey === ownDeptKey) {
        clearKanbanDefaultBoard(meUser.id);
      } else {
        saveKanbanDefaultBoard(meUser.id, departmentKey);
      }
      setDefaultBoardRev((n) => n + 1);
      toast.success('Este quadro abrirá por padrão ao entrar em Tasks');
    },
    [meUser?.id, boardsList],
  );

  useEffect(() => {
    if (legacyListParam) {
      router.replace('/ponto/kanban');
    }
  }, [legacyListParam, router]);

  useEffect(() => {
    if (!meUser || loadingBoardsList || boardsList === undefined) return;
    if (departmentKeyParam || legacyListParam) return;

    const targetKey = resolveKanbanDefaultBoard(meUser.id, boardsList);
    if (targetKey) {
      router.replace(`/ponto/kanban?departmentKey=${encodeURIComponent(targetKey)}`);
    }
  }, [
    meUser,
    loadingBoardsList,
    boardsList,
    departmentKeyParam,
    legacyListParam,
    router,
  ]);

  useEffect(() => {
    if (!meUser || !boardsList || departmentKeyParam) return;
    const targetKey = resolveKanbanDefaultBoard(meUser.id, boardsList);
    if (!targetKey) return;
    void queryClient.prefetchQuery({
      queryKey: ['kanban-board', targetKey] as const,
      queryFn: async () => {
        const data = await fetchKanbanBoard(targetKey);
        writeKanbanBoardCache(targetKey, data);
        return data;
      },
      staleTime: 3 * 60 * 1000,
    });
  }, [meUser, boardsList, departmentKeyParam, queryClient]);

  const [createBoardOpen, setCreateBoardOpen] = useState(false);
  const [creatingBoard, setCreatingBoard] = useState(false);

  useEffect(() => {
    const viewParam = searchParams?.get('view');
    if (viewParam === 'planner' || viewParam === 'tasks') {
      const qs = viewParam === 'tasks' ? '?view=tasks' : '';
      router.replace(`/ponto/agenda${qs}`);
      return;
    }
    const googleFlag = searchParams?.get('googleCalendar');
    if (googleFlag === 'connected' || googleFlag === 'error') {
      const reason = searchParams?.get('reason');
      const params = new URLSearchParams();
      params.set('googleCalendar', googleFlag);
      if (reason) params.set('reason', reason);
      router.replace(`/ponto/agenda?${params.toString()}`);
    }
  }, [searchParams, router]);
  const [renameBoardTarget, setRenameBoardTarget] = useState<{
    boardId: string;
    name: string;
  } | null>(null);
  const [renamingBoard, setRenamingBoard] = useState(false);
  const [boardDeleteTarget, setBoardDeleteTarget] = useState<KanbanBoardSummary | null>(null);
  const [deletingBoard, setDeletingBoard] = useState(false);
  const [shareTarget, setShareTarget] = useState<{
    boardId: string;
    boardName: string;
  } | null>(null);

  const { data: board, isLoading: loadingBoard, isError: boardError } = useQuery({
    queryKey: kanbanBoardQueryKey,
    queryFn: async () => {
      const data = await fetchKanbanBoard(boardScopeKey || undefined);
      if (data.departmentKey) writeKanbanBoardCache(data.departmentKey, data);
      return data;
    },
    enabled: canLoadBoard,
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: (previousData, previousQuery) => {
      if (
        previousQuery &&
        Array.isArray(previousQuery.queryKey) &&
        previousQuery.queryKey[1] === boardScopeKey &&
        previousData
      ) {
        return previousData;
      }
      return boardScopeKey ? readKanbanBoardCache(boardScopeKey) : undefined;
    },
  });

  useEffect(() => {
    if (!board?.departmentKey || departmentKeyParam || legacyListParam) return;
    router.replace(
      `/ponto/kanban?departmentKey=${encodeURIComponent(board.departmentKey)}`,
    );
    if (boardsListReady && (boardsList?.length ?? 0) === 0) {
      void queryClient.invalidateQueries({ queryKey: ['kanban-boards'] });
    }
  }, [
    board?.departmentKey,
    departmentKeyParam,
    legacyListParam,
    boardsListReady,
    boardsList?.length,
    queryClient,
    router,
  ]);

  const boardReadOnly = board?.canWrite === false;

  useDocumentTitle(
    board?.department ? `Tasks - ${board.department}` : 'Tasks'
  );

  const openBoard = useCallback(
    (departmentKey: string) => {
      router.push(`/ponto/kanban?departmentKey=${encodeURIComponent(departmentKey)}`);
    },
    [router],
  );

  const handleCreateBoard = useCallback(
    async (name: string) => {
      setCreatingBoard(true);
      try {
        const created = await createKanbanBoard(name);
        await queryClient.invalidateQueries({ queryKey: ['kanban-boards'] });
        setCreateBoardOpen(false);
        toast.success('Quadro criado');
        openBoard(created.departmentKey);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Erro ao criar quadro';
        toast.error(msg);
      } finally {
        setCreatingBoard(false);
      }
    },
    [openBoard, queryClient],
  );

  const handleRenameBoard = useCallback(
    async (name: string) => {
      if (!renameBoardTarget) return;
      setRenamingBoard(true);
      try {
        await updateKanbanBoard(renameBoardTarget.boardId, name);
        await queryClient.invalidateQueries({ queryKey: ['kanban-boards'] });
        await queryClient.invalidateQueries({ queryKey: kanbanBoardQueryKey });
        setRenameBoardTarget(null);
        toast.success('Nome do quadro atualizado');
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Erro ao renomear quadro';
        toast.error(msg);
      } finally {
        setRenamingBoard(false);
      }
    },
    [queryClient, kanbanBoardQueryKey, renameBoardTarget],
  );

  const handleDeleteBoard = useCallback(async () => {
    if (!boardDeleteTarget?.id || !meUser) return;
    setDeletingBoard(true);
    try {
      await deleteKanbanBoard(boardDeleteTarget.id);
      if (getKanbanDefaultBoard(meUser.id) === boardDeleteTarget.departmentKey) {
        clearKanbanDefaultBoard(meUser.id);
      }
      const remaining = (boardsList ?? []).filter(
        (b) => b.departmentKey !== boardDeleteTarget.departmentKey,
      );
      await queryClient.invalidateQueries({ queryKey: ['kanban-boards'] });
      setBoardDeleteTarget(null);
      toast.success('Quadro excluído');
      if (departmentKeyParam === boardDeleteTarget.departmentKey) {
        const nextKey = resolveKanbanDefaultBoard(meUser.id, remaining);
        if (nextKey) openBoard(nextKey);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Erro ao excluir quadro';
      toast.error(msg);
    } finally {
      setDeletingBoard(false);
    }
  }, [boardDeleteTarget, meUser, boardsList, queryClient, departmentKeyParam, openBoard]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const columns = board?.columns ?? [];
  const boardLabelPresets = getKanbanLabelPalette(board?.labelPresets);
  const labelFilterAllValues = boardLabelPresets.map((p) => p.color);

  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchExpanded = searchOpen || search.trim().length > 0;
  const [cardViewMode, setCardViewMode] = useState<KanbanCardViewMode>(() => readKanbanCardViewMode());
  const [filterPriorities, setFilterPriorities] = useState<string[]>([]);
  const [filterLabelColors, setFilterLabelColors] = useState<string[]>([]);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const hasActiveKanbanFilters =
    isMultiselectFilterActive(filterPriorities, KANBAN_PRIORITY_ALL_VALUES) ||
    isMultiselectFilterActive(filterLabelColors, labelFilterAllValues);
  const [savingColumn, setSavingColumn] = useState(false);

  const [cardModal, setCardModal] = useState<
    | { mode: 'create'; columnId: string; insertAt: 'top' | 'bottom' }
    | {
        mode: 'detail';
        cardId: string;
        columnId: string;
        initialCard: KanbanCard;
        initialColumn?: { title: string; color: string };
      }
    | null
  >(null);
  const [colModal, setColModal] = useState<{ mode: 'create' | 'edit'; column?: KanbanColumn } | null>(null);
  const [labelSettingsOpen, setLabelSettingsOpen] = useState(false);
  const [labelSettingsHeader, setLabelSettingsHeader] = useState<{
    title: string;
    showBack: boolean;
    onBack?: () => void;
  }>({ title: 'Etiquetas', showBack: false });
  const [exportingBoard, setExportingBoard] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [archivedModalOpen, setArchivedModalOpen] = useState(false);
  const [boardToolsOpen, setBoardToolsOpen] = useState(false);
  const boardToolsRef = useRef<HTMLDivElement>(null);
  const [unarchivingCardId, setUnarchivingCardId] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importPayload, setImportPayload] = useState<unknown>(null);
  const [importReplace, setImportReplace] = useState(true);
  const [importingBoard, setImportingBoard] = useState(false);
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!searchExpanded) return;
    const id = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [searchExpanded]);

  useEffect(() => {
    if (!boardToolsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!boardToolsRef.current?.contains(e.target as Node)) {
        setBoardToolsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBoardToolsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [boardToolsOpen]);

  const handleExportTrello = async () => {
    if (!boardScopeKey && !board) {
      toast.error('Aguarde o quadro carregar para exportar');
      return;
    }
    setExportingBoard(true);
    try {
      const { filename, payload } = await exportKanbanBoardTrello(
        boardScopeKey || board?.departmentKey || undefined,
      );
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Quadro exportado (JSON compatível com Trello)');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao exportar quadro');
    } finally {
      setExportingBoard(false);
    }
  };

  const handleImportFileChosen = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.lists) || !Array.isArray(parsed.cards)) {
        toast.error('Arquivo inválido: precisa ser export Trello/Gennesis (lists + cards)');
        setImportPayload(null);
        setImportFileName('');
        return;
      }
      setImportPayload(parsed);
      setImportFileName(file.name);
      toast.success('Arquivo carregado — confira e confirme a importação');
    } catch {
      toast.error('Não foi possível ler o JSON');
      setImportPayload(null);
      setImportFileName('');
    }
  };

  const handleConfirmImport = async () => {
    if (!importPayload) {
      toast.error('Selecione um arquivo JSON');
      return;
    }
    if (importReplace) {
      const ok = window.confirm(
        'Isso vai APAGAR todas as colunas e cards deste quadro e substituir pelo arquivo. Continuar?',
      );
      if (!ok) return;
    }
    setImportingBoard(true);
    setImportProgress(6);
    const tick = window.setInterval(() => {
      setImportProgress((prev) => {
        const current = prev ?? 0;
        if (current >= 90) return current;
        return Math.min(90, current + 4 + Math.random() * 8);
      });
    }, 350);
    toast.loading('Importando… pode levar alguns minutos em arquivos grandes.', {
      id: 'kanban-trello-import',
    });
    try {
      const result = await importKanbanBoardTrello({
        board: importPayload,
        departmentKey: boardScopeKey || board?.departmentKey || undefined,
        replace: importReplace,
      });
      setImportProgress(100);
      toast.success(
        `Importado: ${result.columnsCreated} coluna(s), ${result.cardsCreated} card(s)`,
        { id: 'kanban-trello-import' },
      );
      await new Promise((r) => window.setTimeout(r, 280));
      setImportModalOpen(false);
      setImportPayload(null);
      setImportFileName('');
      await queryClient.invalidateQueries({ queryKey: ['kanban-board'] });
      await queryClient.invalidateQueries({ queryKey: ['kanban-boards'] });
    } catch (err: any) {
      const status = err?.response?.status;
      const apiMsg = err?.response?.data?.message;
      let message = 'Erro ao importar';
      if (err?.code === 'ECONNABORTED' || /timeout/i.test(String(err?.message || ''))) {
        message =
          'A importação demorou demais e foi interrompida. Tente de novo; arquivos muito grandes podem levar alguns minutos.';
      } else if (status === 413) {
        message = 'Arquivo JSON grande demais para o servidor. Tente um export menor.';
      } else if (apiMsg) {
        message = apiMsg;
      } else if (err?.message) {
        message = err.message;
      }
      toast.error(message, { id: 'kanban-trello-import' });
    } finally {
      window.clearInterval(tick);
      setImportingBoard(false);
      setImportProgress(null);
    }
  };
  const [savingLabelPresets, setSavingLabelPresets] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'card'; cardId: string; columnId: string } | { type: 'column'; columnId: string } | null>(null);
  const [cardColumnAction, setCardColumnAction] = useState<
    | { mode: 'move'; cardId: string; columnId: string; title: string }
    | { mode: 'copy'; cardId: string; columnId: string; title: string }
    | null
  >(null);

  const [dragState, setDragState] = useState<DragState>({
    draggingCardId: null,
    fromColumnId: null,
    overColumnId: null,
    overIndex: null,
  });
  const [columnDrag, setColumnDrag] = useState<ColumnDragState>({
    draggingColumnId: null,
    overIndex: null,
  });
  const dragRef = useRef(dragState);
  const columnDragRef = useRef(columnDrag);
  const cardDragOverRafRef = useRef<number | null>(null);
  const pendingCardDragOverRef = useRef<{ columnId: string; index: number | null } | null>(null);
  const prefetchCardTimerRef = useRef<Map<string, number>>(new Map());
  const columnDropHandledRef = useRef(false);
  const columnDragIdRef = useRef<string | null>(null);
  const columnDragOverIndexRef = useRef<number | null>(null);
  const columnDragGhostRef = useRef<HTMLElement | null>(null);
  const [collapsedColumnIds, setCollapsedColumnIds] = useState<Set<string>>(() => new Set());

  /** Atualiza state + ref na hora — drop não pode ler overColumnId stale do useEffect. */
  const setDragStateSync = useCallback(
    (next: DragState | ((prev: DragState) => DragState)) => {
      const resolved = typeof next === 'function' ? next(dragRef.current) : next;
      dragRef.current = resolved;
      setDragState(resolved);
    },
    [],
  );

  useEffect(() => {
    setCollapsedColumnIds(readKanbanCollapsedColumns(boardScopeKey));
  }, [boardScopeKey]);

  const toggleColumnCollapsed = useCallback(
    (columnId: string) => {
      setCollapsedColumnIds((prev) => {
        const next = new Set(prev);
        if (next.has(columnId)) next.delete(columnId);
        else next.add(columnId);
        writeKanbanCollapsedColumns(boardScopeKey, next);
        return next;
      });
    },
    [boardScopeKey],
  );
  const boardCardsRef = useRef<HTMLDivElement>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  /** Gerações de mutação otimista — rollback antigo não sobrescreve ação mais nova. */
  const boardMutationGenRef = useRef(0);
  const cardMoveSeqRef = useRef<Record<string, number>>({});
  const isKanbanDragging = Boolean(dragState.draggingCardId || columnDrag.draggingColumnId);
  useKanbanDragScrollAssist(isKanbanDragging, boardScrollRef);
  useRightClickPanScroll(boardScrollRef);
  // Shift+roda (e gesto horizontal do trackpad) sobre a coluna → scroll X do board
  useEffect(() => {
    const board = boardScrollRef.current;
    if (!board) return;

    const onWheel = (e: WheelEvent) => {
      if (board.scrollWidth <= board.clientWidth + 1) return;

      const shiftHorizontal = e.shiftKey && (e.deltaY !== 0 || e.deltaX !== 0);
      const trackpadHorizontal =
        !e.shiftKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) && e.deltaX !== 0;
      if (!shiftHorizontal && !trackpadHorizontal) return;

      e.preventDefault();
      board.scrollLeft += e.shiftKey
        ? e.deltaY !== 0
          ? e.deltaY
          : e.deltaX
        : e.deltaX;
    };

    board.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => board.removeEventListener('wheel', onWheel, true);
  }, []);
  useEffect(() => {
    columnDragRef.current = columnDrag;
  }, [columnDrag]);

  const refreshBoard = useCallback(
    () => queryClient.refetchQueries({ queryKey: kanbanBoardQueryKey }),
    [queryClient, kanbanBoardQueryKey],
  );

  const beginBoardMutation = useCallback(() => ++boardMutationGenRef.current, []);

  const rollbackBoardMutation = useCallback(
    (gen: number, previousBoard: KanbanBoard | undefined) => {
      // Outra mutação estrutural já rodou — reconcilia com o servidor.
      if (gen !== boardMutationGenRef.current) {
        void refreshBoard();
        return;
      }
      if (previousBoard === undefined) {
        void refreshBoard();
        return;
      }
      // Restaura ordem/colunas do snapshot, mas preserva campos editados depois (título etc.).
      const current = queryClient.getQueryData<KanbanBoard>(kanbanBoardQueryKey);
      const fieldsById = new Map<string, KanbanCard>();
      if (current) {
        for (const col of current.columns) {
          for (const card of col.cards) fieldsById.set(card.id, card);
        }
      }
      const restored: KanbanBoard = {
        ...previousBoard,
        columns: previousBoard.columns.map((col) => ({
          ...col,
          cards: col.cards.map((card) => {
            const latest = fieldsById.get(card.id);
            if (!latest) return card;
            return {
              ...card,
              ...latest,
              checklistItems: latest.checklistItems ?? card.checklistItems,
            };
          }),
        })),
      };
      queryClient.setQueryData(kanbanBoardQueryKey, restored);
      if (boardScopeKey) writeKanbanBoardCache(boardScopeKey, restored);
    },
    [queryClient, kanbanBoardQueryKey, boardScopeKey, refreshBoard],
  );

  const patchBoardCard = useCallback(
    (targetCardId: string, patch: KanbanBoardCardChecklistPatch) => {
      queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
        patchCardInBoardCache(old, targetCardId, patch),
      );
    },
    [queryClient, kanbanBoardQueryKey],
  );

  const setCardViewModePersist = useCallback((mode: KanbanCardViewMode) => {
    setCardViewMode(mode);
    try {
      localStorage.setItem(KANBAN_CARD_VIEW_MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

  const handleToggleCardComplete = useCallback(
    async (card: KanbanCard) => {
      if (boardReadOnly || isOptimisticKanbanCardId(card.id)) return;
      const nextCompletedAt = card.completedAt ? null : new Date().toISOString();
      const previousCompletedAt = card.completedAt ?? null;
      queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((col) => ({
            ...col,
            cards: col.cards.map((c) =>
              c.id === card.id ? { ...c, completedAt: nextCompletedAt } : c,
            ),
          })),
        };
      });
      try {
        const updated = await updateKanbanCard(card.id, { completedAt: nextCompletedAt });
        queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            columns: old.columns.map((col) => ({
              ...col,
              cards: col.cards.map((c) =>
                c.id === card.id
                  ? { ...c, completedAt: updated.completedAt ?? nextCompletedAt }
                  : c,
              ),
            })),
          };
        });
      } catch {
        queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) => {
          if (!old) return old;
          return {
            ...old,
            columns: old.columns.map((col) => ({
              ...col,
              cards: col.cards.map((c) =>
                c.id === card.id ? { ...c, completedAt: previousCompletedAt } : c,
              ),
            })),
          };
        });
        toast.error('Não foi possível atualizar o status do card');
      }
    },
    [boardReadOnly, queryClient, kanbanBoardQueryKey],
  );

  const handleArchiveCard = useCallback(
    async (card: KanbanCard, _columnId: string) => {
      if (boardReadOnly || isOptimisticKanbanCardId(card.id)) return;
      const previousBoard = queryClient.getQueryData<KanbanBoard>(kanbanBoardQueryKey);
      const mutationGen = beginBoardMutation();
      queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
        removeCardFromBoardCache(old, card.id),
      );
      setCardModal((prev) =>
        prev?.mode === 'detail' && prev.cardId === card.id ? null : prev,
      );
      toast.success('Cartão arquivado — abra Arquivados para ver de novo', { duration: 2500 });
      try {
        await updateKanbanCard(card.id, { archivedAt: new Date().toISOString() });
        void queryClient.invalidateQueries({
          queryKey: ['kanban-archived', boardScopeKey ?? 'own'],
        });
      } catch {
        rollbackBoardMutation(mutationGen, previousBoard);
        toast.error('Erro ao arquivar cartão');
      }
    },
    [
      beginBoardMutation,
      boardReadOnly,
      boardScopeKey,
      kanbanBoardQueryKey,
      queryClient,
      rollbackBoardMutation,
    ],
  );

  const {
    data: archivedCards = [],
    isLoading: loadingArchived,
    isFetching: fetchingArchived,
  } = useQuery({
    queryKey: ['kanban-archived', boardScopeKey ?? 'own'] as const,
    queryFn: () => fetchKanbanArchivedCards(boardScopeKey || undefined),
    enabled: archivedModalOpen && canLoadBoard,
    staleTime: 30_000,
  });

  const handleUnarchiveCard = useCallback(
    async (card: KanbanArchivedCard) => {
      if (boardReadOnly) return;
      setUnarchivingCardId(card.id);
      try {
        const updated = await updateKanbanCard(card.id, { archivedAt: null });
        const restored: KanbanCard = {
          ...card,
          ...updated,
          completedAt: updated.completedAt ?? card.completedAt ?? null,
        };
        queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
          insertCardIntoBoardCache(old, card.columnId, restored, true),
        );
        queryClient.setQueryData<KanbanArchivedCard[]>(
          ['kanban-archived', boardScopeKey ?? 'own'],
          (old) => (old ?? []).filter((c) => c.id !== card.id),
        );
        toast.success('Cartão restaurado no quadro');
      } catch {
        toast.error('Erro ao desarquivar cartão');
      } finally {
        setUnarchivingCardId(null);
      }
    },
    [boardReadOnly, boardScopeKey, kanbanBoardQueryKey, queryClient],
  );

  const handleBoardCardSync = useCallback(
    (card: KanbanCard, columnId: string) => {
      // Só atualiza campos no lugar atual — não bumpa mutation gen (isso forçava
      // refresh/rollback do move e fazia o card voltar ou pular de posição).
      queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) => {
        const next = syncCardOnBoardCache(old, card, columnId);
        if (next && boardScopeKey) writeKanbanBoardCacheDebounced(boardScopeKey, next);
        return next;
      });
    },
    [queryClient, kanbanBoardQueryKey, boardScopeKey],
  );

  const prefetchKanbanCard = useCallback(
    (cardId: string) => {
      if (isOptimisticKanbanCardId(cardId)) return;
      const existing = prefetchCardTimerRef.current.get(cardId);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        prefetchCardTimerRef.current.delete(cardId);
        void queryClient.prefetchQuery({
          queryKey: kanbanCardQueryKey(cardId),
          queryFn: () => fetchKanbanCard(cardId),
          staleTime: 3 * 60 * 1000,
        });
      }, 280);
      prefetchCardTimerRef.current.set(cardId, timer);
    },
    [queryClient],
  );

  const handleBoardCardCreated = useCallback(
    (
      card: KanbanCard,
      options: {
        columnId: string;
        insertAt: 'top' | 'bottom';
        replaceTempId?: string;
        removeTempId?: string;
      },
    ) => {
      queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) => {
        let next = old;
        if (options.removeTempId) {
          next = removeCardFromBoardCache(old, options.removeTempId);
        } else if (options.replaceTempId) {
          const replaced = replaceCardInBoardCache(old, options.replaceTempId, card);
          if (replaced) next = replaced;
        } else {
          next = insertCardIntoBoardCache(old, options.columnId, card, options.insertAt === 'top');
        }
        if (next && boardScopeKey) writeKanbanBoardCache(boardScopeKey, next);
        return next;
      });

      if (options.replaceTempId) {
        setCardModal((prev) =>
          prev?.mode === 'detail' && prev.cardId === options.replaceTempId
            ? { ...prev, cardId: card.id, initialCard: card }
            : prev,
        );
        prefetchKanbanCard(card.id);
      }

      if (options.removeTempId) {
        setCardModal((prev) =>
          prev?.mode === 'detail' && prev.cardId === options.removeTempId ? null : prev,
        );
      }
    },
    [queryClient, kanbanBoardQueryKey, boardScopeKey, prefetchKanbanCard],
  );

  function openCreateCardDetail(card: KanbanCard, columnId: string) {
    const column = columns.find((col) => col.id === columnId);
    const initialColumn = column
      ? { title: column.title, color: column.color }
      : undefined;
    seedKanbanCardCacheFromBoard(queryClient, card, columnId, initialColumn);
    prefetchKanbanCard(card.id);
    setCardModal({
      mode: 'detail',
      cardId: card.id,
      columnId,
      initialCard: card,
      initialColumn,
    });
  }

  const handleDragStart = useCallback((e: React.DragEvent, cardId: string, columnId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    columnDragIdRef.current = null;
    columnDragOverIndexRef.current = null;
    setColumnDrag({ draggingColumnId: null, overIndex: null });
    setDragStateSync({
      draggingCardId: cardId,
      fromColumnId: columnId,
      overColumnId: null,
      overIndex: null,
    });
  }, [setDragStateSync]);

  const handleDragEnd = useCallback(() => {
    setDragStateSync({
      draggingCardId: null,
      fromColumnId: null,
      overColumnId: null,
      overIndex: null,
    });
  }, [setDragStateSync]);

  const handleColumnDragStart = useCallback(
    (e: React.DragEvent, columnId: string) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', columnId);
      e.stopPropagation();
      setKanbanColumnDragGhost(e, columnDragGhostRef);
      columnDropHandledRef.current = false;
      columnDragIdRef.current = columnId;
      columnDragOverIndexRef.current = null;
      setDragStateSync({
        draggingCardId: null,
        fromColumnId: null,
        overColumnId: null,
        overIndex: null,
      });
      setColumnDrag({ draggingColumnId: columnId, overIndex: null });
    },
    [setDragStateSync],
  );

  const handleColumnDragEnd = useCallback(() => {
    columnDragGhostRef.current?.remove();
    columnDragGhostRef.current = null;
    window.setTimeout(() => {
      if (!columnDropHandledRef.current) {
        columnDragIdRef.current = null;
        columnDragOverIndexRef.current = null;
        setColumnDrag({ draggingColumnId: null, overIndex: null });
      }
      columnDropHandledRef.current = false;
    }, 0);
  }, []);

  const handleColumnDragOver = useCallback((e: React.DragEvent, index: number) => {
    if (!columnDragIdRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    columnDragOverIndexRef.current = index;
    setColumnDrag((prev) =>
      prev.overIndex === index ? prev : { ...prev, overIndex: index },
    );
  }, []);

  const handleBoardColumnDragOver = useCallback((e: React.DragEvent) => {
    if (!columnDragIdRef.current || !boardCardsRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const index = resolveColumnDropIndexFromBoard(
      e.clientX,
      boardCardsRef.current,
      columnDragIdRef.current,
    );
    columnDragOverIndexRef.current = index;
    setColumnDrag((prev) =>
      prev.overIndex === index ? prev : { ...prev, overIndex: index },
    );
  }, []);

  const handleColumnDrop = useCallback(
    async (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      columnDropHandledRef.current = true;
      const draggingColumnId = columnDragIdRef.current;
      const overIndex = columnDragOverIndexRef.current ?? columnDragRef.current.overIndex;
      columnDragIdRef.current = null;
      columnDragOverIndexRef.current = null;
      setColumnDrag({ draggingColumnId: null, overIndex: null });
      if (!draggingColumnId) return;

      const rawIndex = targetIndex ?? overIndex ?? columns.length;
      const desiredPosition = resolveColumnInsertIndex(columns, draggingColumnId, rawIndex);
      const currentIndex = columns.findIndex((col) => col.id === draggingColumnId);
      if (currentIndex === desiredPosition) return;

      const previousBoard = queryClient.getQueryData<KanbanBoard>(kanbanBoardQueryKey);
      const mutationGen = beginBoardMutation();
      const beforeColumnRects = boardCardsRef.current
        ? captureKanbanReorderRects(boardCardsRef.current, 'data-kanban-column-id')
        : new Map<string, DOMRect>();

      queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
        moveColumnInBoardCache(old, draggingColumnId, rawIndex),
      );
      scheduleKanbanReorderAnimation(
        boardCardsRef.current,
        beforeColumnRects,
        'data-kanban-column-id',
        'kanban-column-reordering',
      );

      try {
        await updateKanbanColumn(draggingColumnId, { position: desiredPosition });
        toast.success('Coluna movida!', { duration: 1500 });
      } catch {
        rollbackBoardMutation(mutationGen, previousBoard);
        toast.error('Não foi possível mover a coluna');
      }
    },
    [columns, queryClient, kanbanBoardQueryKey, beginBoardMutation, rollbackBoardMutation],
  );

  const handleBoardColumnDrop = useCallback(
    (e: React.DragEvent) => {
      if (!columnDragIdRef.current || !boardCardsRef.current) return;
      if (columnDropHandledRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const index = resolveColumnDropIndexFromBoard(
        e.clientX,
        boardCardsRef.current,
        columnDragIdRef.current,
      );
      void handleColumnDrop(e, index);
    },
    [handleColumnDrop],
  );

  const handleDragOver = useCallback((e: React.DragEvent, columnId: string, index?: number) => {
    if (columnDragRef.current.draggingColumnId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    pendingCardDragOverRef.current = { columnId, index: index ?? null };
    if (cardDragOverRafRef.current != null) return;
    cardDragOverRafRef.current = window.requestAnimationFrame(() => {
      cardDragOverRafRef.current = null;
      const next = pendingCardDragOverRef.current;
      if (!next) return;
      setDragStateSync((prev) =>
        prev.overColumnId === next.columnId && prev.overIndex === next.index
          ? prev
          : { ...prev, overColumnId: next.columnId, overIndex: next.index },
      );
    });
  }, [setDragStateSync]);

  const handleDrop = useCallback(
    async (e: React.DragEvent, dropColumnId: string, dropIndex?: number) => {
      e.preventDefault();
      e.stopPropagation();
      if (columnDragRef.current.draggingColumnId) return;

      // Índice/coluna do elemento onde soltou — overIndex vem do último dragOver (slot real).
      const { draggingCardId, fromColumnId, overColumnId, overIndex } = dragRef.current;
      setDragStateSync({
        draggingCardId: null,
        fromColumnId: null,
        overColumnId: null,
        overIndex: null,
      });
      if (!draggingCardId || !fromColumnId) return;

      const targetColumnId = dropColumnId;
      // Sempre ler o board atual do cache — `columns` do render pode estar stale.
      const boardNow =
        queryClient.getQueryData<KanbanBoard>(kanbanBoardQueryKey) ??
        (boardScopeKey ? readKanbanBoardCache(boardScopeKey) : undefined);
      const targetColumn = boardNow?.columns.find((col) => col.id === targetColumnId);
      if (!targetColumn) return;

      // Índice vem da lista filtrada — mapeia para a coluna completa.
      const filteredCards = targetColumn.cards.filter((card) => {
        const matchSearch =
          !search ||
          card.title.toLowerCase().includes(search.toLowerCase()) ||
          card.description.toLowerCase().includes(search.toLowerCase()) ||
          card.assignee.toLowerCase().includes(search.toLowerCase());
        const matchPriority =
          multiselectFilterShowsAll(filterPriorities, KANBAN_PRIORITY_ALL_VALUES) ||
          filterPriorities.includes(card.priority);
        const matchLabel =
          multiselectFilterShowsAll(filterLabelColors, labelFilterAllValues) ||
          normalizeKanbanLabels(card.labels, boardLabelPresets).some((l) =>
            filterLabelColors.some(
              (c) => l.color.trim().toLowerCase() === c.trim().toLowerCase(),
            ),
          );
        return matchSearch && matchPriority && matchLabel;
      });

      const visualDropIndex = resolveKanbanVisualDropIndex(
        dropIndex,
        overColumnId,
        overIndex,
        targetColumnId,
        filteredCards.length,
      );
      const rawDropIndex = mapFilteredDropIndexToFullIndex(
        targetColumn.cards,
        filteredCards,
        visualDropIndex,
      );
      const desiredPosition = resolveKanbanInsertIndex(
        targetColumn.cards,
        draggingCardId,
        fromColumnId,
        targetColumnId,
        rawDropIndex,
      );

      const currentIndex = targetColumn.cards.findIndex((card) => card.id === draggingCardId);
      if (fromColumnId === targetColumnId && currentIndex === desiredPosition) {
        return;
      }

      const previousBoard = queryClient.getQueryData<KanbanBoard>(kanbanBoardQueryKey);
      const mutationGen = beginBoardMutation();
      const moveSeq = (cardMoveSeqRef.current[draggingCardId] ?? 0) + 1;
      cardMoveSeqRef.current[draggingCardId] = moveSeq;
      const beforeRects = boardCardsRef.current
        ? captureKanbanReorderRects(boardCardsRef.current, 'data-kanban-card-id')
        : new Map<string, DOMRect>();

      queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) => {
        const next = moveCardInBoardCache(
          old,
          draggingCardId,
          fromColumnId,
          targetColumnId,
          rawDropIndex,
        );
        if (next && boardScopeKey) writeKanbanBoardCache(boardScopeKey, next);
        return next;
      });
      scheduleKanbanReorderAnimation(
        boardCardsRef.current,
        beforeRects,
        'data-kanban-card-id',
        'kanban-card-reordering',
      );

      void (async () => {
        try {
          // Sempre manda columnId — evita gravar só position na coluna antiga.
          await moveKanbanCard(draggingCardId, {
            columnId: targetColumnId,
            position: desiredPosition,
          });
          if (cardMoveSeqRef.current[draggingCardId] !== moveSeq) return;
          toast.success('Card movido!', { duration: 1500 });
        } catch {
          if (cardMoveSeqRef.current[draggingCardId] !== moveSeq) return;
          rollbackBoardMutation(mutationGen, previousBoard);
          toast.error('Não foi possível salvar a posição do card');
        }
      })();
    },
    [
      search,
      filterPriorities,
      filterLabelColors,
      labelFilterAllValues,
      boardLabelPresets,
      queryClient,
      kanbanBoardQueryKey,
      boardScopeKey,
      beginBoardMutation,
      rollbackBoardMutation,
      setDragStateSync,
    ],
  );

  function openCreateCard(columnId: string, insertAt: 'top' | 'bottom') {
    setCardModal({ mode: 'create', columnId, insertAt });
  }

  function openEditCard(card: KanbanCard, columnId: string) {
    const column = columns.find((col) => col.id === columnId);
    const initialColumn = column
      ? { title: column.title, color: column.color }
      : undefined;
    seedKanbanCardCacheFromBoard(queryClient, card, columnId, initialColumn);
    prefetchKanbanCard(card.id);
    setCardModal({
      mode: 'detail',
      cardId: card.id,
      columnId,
      initialCard: card,
      initialColumn,
    });
  }

  function handleDeleteCard(cardId: string, columnId: string) {
    setDeleteConfirm({ type: 'card', cardId, columnId });
  }

  function openMoveCard(card: KanbanCard, columnId: string) {
    setCardColumnAction({
      mode: 'move',
      cardId: card.id,
      columnId,
      title: card.title,
    });
  }

  function openCopyCard(card: KanbanCard, columnId: string) {
    setCardColumnAction({
      mode: 'copy',
      cardId: card.id,
      columnId,
      title: card.title,
    });
  }

  function confirmCardColumnAction(targetColumnId: string, title?: string) {
    if (!cardColumnAction) return;
    const action = cardColumnAction;
    setCardColumnAction(null);

    const previousBoard = queryClient.getQueryData<KanbanBoard>(kanbanBoardQueryKey);
    const mutationGen = beginBoardMutation();

    if (action.mode === 'move') {
      const moveSeq = (cardMoveSeqRef.current[action.cardId] ?? 0) + 1;
      cardMoveSeqRef.current[action.cardId] = moveSeq;
      queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) => {
        const next = moveCardInBoardCache(old, action.cardId, action.columnId, targetColumnId, 0);
        if (next && boardScopeKey) writeKanbanBoardCache(boardScopeKey, next);
        return next;
      });

      void (async () => {
        try {
          await moveKanbanCard(action.cardId, {
            columnId: targetColumnId,
            position: 0,
          });
          if (cardMoveSeqRef.current[action.cardId] !== moveSeq) return;
          toast.success('Card movido!', { duration: 2000 });
        } catch {
          if (cardMoveSeqRef.current[action.cardId] !== moveSeq) return;
          rollbackBoardMutation(mutationGen, previousBoard);
          toast.error('Não foi possível mover o card. A posição foi restaurada.');
        }
      })();
      return;
    }

    const copyTitle = title?.trim() || action.title;
    const tempId = `optimistic-copy-${action.cardId}-${Date.now()}`;
    const sourceCard = previousBoard?.columns
      .find((col) => col.id === action.columnId)
      ?.cards.find((card) => card.id === action.cardId);

    if (sourceCard) {
      const optimistic = buildOptimisticCardCopy(sourceCard, copyTitle, tempId);
      queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
        insertCardIntoBoardCache(old, targetColumnId, optimistic, true),
      );
    }

    toast.success('Card copiado!', { duration: 2000 });

    void (async () => {
      try {
        const created = await duplicateKanbanCard(action.cardId, {
          columnId: targetColumnId,
          title,
        });
        queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) => {
          const withoutTemp = removeCardFromBoardCache(old, tempId);
          return insertCardIntoBoardCache(withoutTemp, targetColumnId, created, true) ?? withoutTemp;
        });
      } catch {
        rollbackBoardMutation(mutationGen, previousBoard);
        if (previousBoard === undefined) {
          queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
            removeCardFromBoardCache(old, tempId),
          );
        }
        toast.error('Não foi possível copiar o card. Tente novamente.');
      }
    })();
    return;
  }

  async function confirmDeleteCard() {
    if (deleteConfirm?.type !== 'card') return;
    const { cardId } = deleteConfirm;
    const previousBoard = queryClient.getQueryData<KanbanBoard>(kanbanBoardQueryKey);
    const mutationGen = beginBoardMutation();

    setDeleteConfirm(null);
    queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
      removeCardFromBoardCache(old, cardId),
    );
    toast.success('Card removido', { duration: 2000 });

    if (isOptimisticKanbanCardId(cardId)) {
      return;
    }

    void (async () => {
      try {
        await deleteKanbanCard(cardId);
      } catch {
        rollbackBoardMutation(mutationGen, previousBoard);
        toast.error('Erro ao remover card');
      }
    })();
  }

  function handleSaveColumn(title: string, color: string, limit: number | undefined, id?: string) {
    if (colModal?.mode === 'create') {
      const tempId = `optimistic-column-${Date.now()}`;
      const optimistic = buildOptimisticKanbanColumn(title, color, tempId, limit);
      const previousBoard = queryClient.getQueryData<KanbanBoard>(kanbanBoardQueryKey);
      const mutationGen = beginBoardMutation();

      setColModal(null);
      queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
        insertColumnIntoBoardCache(old, optimistic, true),
      );
      toast.success('Coluna criada!', { duration: 2000 });

      void (async () => {
        try {
          const created = await createKanbanColumn({
            title,
            color,
            cardLimit: limit,
            boardId: board?.id,
          });
          queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) => {
            const withoutTemp = removeColumnFromBoardCache(old, tempId);
            return insertColumnIntoBoardCache(withoutTemp, created, true) ?? withoutTemp;
          });
        } catch {
          rollbackBoardMutation(mutationGen, previousBoard);
          if (previousBoard === undefined) {
            queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
              removeColumnFromBoardCache(old, tempId),
            );
          }
          toast.error('Erro ao salvar coluna');
        }
      })();
      return;
    }

    if (!id) return;

    const previousBoard = queryClient.getQueryData<KanbanBoard>(kanbanBoardQueryKey);
    const mutationGen = beginBoardMutation();
    setColModal(null);
    queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
      patchColumnInBoardCache(old, id, { title, color, limit }),
    );
    toast.success('Coluna atualizada!', { duration: 2000 });

    void (async () => {
      try {
        const updated = await updateKanbanColumn(id, {
          title,
          color,
          cardLimit: limit ?? null,
        });
        queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
          patchColumnInBoardCache(old, id, {
            title: updated.title,
            color: updated.color,
            limit: updated.limit,
          }),
        );
      } catch {
        rollbackBoardMutation(mutationGen, previousBoard);
        toast.error('Erro ao salvar coluna');
      }
    })();
  }

  function handleDeleteColumn(columnId: string) {
    setDeleteConfirm({ type: 'column', columnId });
  }

  const handleSortColumn = useCallback(
    (columnId: string, mode: KanbanColumnSortMode) => {
      const currentBoard = queryClient.getQueryData<KanbanBoard>(kanbanBoardQueryKey);
      const column = currentBoard?.columns.find((col) => col.id === columnId);
      if (!column || column.cards.length < 2) {
        toast.success('Lista ordenada', { duration: 1500 });
        return;
      }

      const sortedCards = sortKanbanColumnCards(column.cards, mode);
      const unchanged = sortedCards.every((card, index) => card.id === column.cards[index]?.id);
      if (unchanged) {
        toast.success('Lista já está nessa ordem', { duration: 1500 });
        return;
      }

      const previousBoard = currentBoard;
      const mutationGen = beginBoardMutation();
      const beforeRects = boardCardsRef.current
        ? captureKanbanReorderRects(boardCardsRef.current, 'data-kanban-card-id')
        : new Map<string, DOMRect>();

      queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
        replaceColumnCardsInBoardCache(old, columnId, sortedCards),
      );
      scheduleKanbanReorderAnimation(
        boardCardsRef.current,
        beforeRects,
        'data-kanban-card-id',
        'kanban-card-reordering',
      );
      toast.success('Lista ordenada', { duration: 1500 });

      void (async () => {
        try {
          for (let index = 0; index < sortedCards.length; index += 1) {
            const card = sortedCards[index];
            if (isOptimisticKanbanCardId(card.id)) continue;
            await moveKanbanCard(card.id, { columnId, position: index });
          }
        } catch {
          rollbackBoardMutation(mutationGen, previousBoard);
          toast.error('Não foi possível salvar a ordenação');
        }
      })();
    },
    [queryClient, kanbanBoardQueryKey, beginBoardMutation, rollbackBoardMutation],
  );

  function confirmDeleteColumn() {
    if (deleteConfirm?.type !== 'column') return;
    const { columnId } = deleteConfirm;
    const previousBoard = queryClient.getQueryData<KanbanBoard>(kanbanBoardQueryKey);
    const mutationGen = beginBoardMutation();

    setDeleteConfirm(null);
    setCollapsedColumnIds((prev) => {
      if (!prev.has(columnId)) return prev;
      const next = new Set(prev);
      next.delete(columnId);
      writeKanbanCollapsedColumns(boardScopeKey, next);
      return next;
    });
    queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (old) =>
      removeColumnFromBoardCache(old, columnId),
    );
    toast.success('Coluna removida', { duration: 2000 });

    void (async () => {
      try {
        await deleteKanbanColumn(columnId);
      } catch {
        rollbackBoardMutation(mutationGen, previousBoard);
        toast.error('Erro ao remover coluna');
      }
    })();
  }

  const priorityFilterOptions = KANBAN_PRIORITY_ALL_VALUES.map((p) => ({
    value: p,
    label: PRIORITY_CONFIG[p].label,
  }));
  const labelFilterOptions = boardLabelPresets.map((preset) => ({
    value: preset.color,
    label: preset.name,
    swatchColor: preset.color,
  }));

  const filteredColumns = useMemo(
    () =>
      columns.map((col) => ({
        ...col,
        cards: col.cards.filter((card) => {
          const matchSearch =
            !search ||
            card.title.toLowerCase().includes(search.toLowerCase()) ||
            card.description.toLowerCase().includes(search.toLowerCase()) ||
            card.assignee.toLowerCase().includes(search.toLowerCase());
          const matchPriority =
            multiselectFilterShowsAll(filterPriorities, KANBAN_PRIORITY_ALL_VALUES) ||
            filterPriorities.includes(card.priority);
          const matchLabel =
            multiselectFilterShowsAll(filterLabelColors, labelFilterAllValues) ||
            normalizeKanbanLabels(card.labels, boardLabelPresets).some((l) =>
              filterLabelColors.some(
                (c) => l.color.trim().toLowerCase() === c.trim().toLowerCase(),
              ),
            );
          return matchSearch && matchPriority && matchLabel;
        }),
      })),
    [
      columns,
      search,
      filterPriorities,
      filterLabelColors,
      labelFilterAllValues,
      boardLabelPresets,
    ],
  );

  if (!meUser && loadingPerms) {
    return <Loading message="Carregando Tasks..." fullScreen size="lg" />;
  }

  if (!meUser) {
    return <Loading message="Verificando sessão..." fullScreen size="lg" />;
  }

  const user = meUser;
  const showBoardSkeleton = !board && !boardError;
  const isChecklistBoard = cardViewMode === 'checklist';

  if (boardError && !board) {
    return (
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="px-4 py-12 text-center text-gray-600 dark:text-gray-400">
          Não foi possível carregar o quadro. Tente atualizar a página.
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <div
        className={clsx(
          'flex flex-col gap-3 -mx-2 sm:-mx-4',
          isChecklistBoard &&
            'mb-[-1rem] h-[calc(100dvh-5rem)] overflow-hidden lg:mb-[-2rem] lg:h-[calc(100dvh-6rem)]',
        )}
      >
        {/* ── Toolbar ── */}
        <div className="flex-shrink-0 px-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Esquerda: visão + quadros */}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SegmentedControl
                value={cardViewMode}
                onChange={setCardViewModePersist}
                aria-label="Versão de visualização dos cards"
                options={[
                  {
                    value: 'classic',
                    title: 'Versão clássica',
                    ariaLabel: 'Versão clássica',
                    label: <Columns className="h-4 w-4" />,
                  },
                  {
                    value: 'checklist',
                    title: 'Versão nova',
                    ariaLabel: 'Versão nova',
                    label: <List className="h-4 w-4" />,
                  },
                ]}
              />
              <KanbanBoardPicker
                boards={boardsList ?? []}
                currentDepartmentKey={board?.departmentKey}
                currentBoardLabel={board?.department}
                defaultDepartmentKey={defaultDepartmentKey}
                canCreateBoard={!isAdministrator}
                isAdministrator={isAdministrator}
                onSelect={openBoard}
                onSetDefault={setAsDefaultBoard}
                onCreateBoard={() => setCreateBoardOpen(true)}
                onShare={(b) =>
                  setShareTarget({ boardId: b.id, boardName: b.department })
                }
                onEditName={(b) =>
                  setRenameBoardTarget({ boardId: b.id, name: b.department })
                }
                onDeleteBoard={setBoardDeleteTarget}
              />
              {boardReadOnly ? (
                <span
                  title="Somente leitura"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400"
                >
                  <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Somente leitura
                </span>
              ) : null}
            </div>

            {/* Direita: busca + filtro + mais opções */}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {/* Search — colapsável com animação de largura */}
              <div
                className={clsx(
                  'relative h-9 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900',
                  'transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  searchExpanded ? 'w-[min(100%,280px)] sm:w-[280px]' : 'w-9',
                )}
              >
                <button
                  type="button"
                  tabIndex={searchExpanded ? -1 : 0}
                  aria-hidden={searchExpanded}
                  onClick={() => setSearchOpen(true)}
                  className={clsx(
                    'absolute inset-0 z-10 inline-flex items-center justify-center text-gray-500 outline-none transition-opacity duration-200 focus:ring-0 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100',
                    'hover:bg-gray-50 dark:hover:bg-gray-800',
                    searchExpanded ? 'pointer-events-none opacity-0' : 'opacity-100',
                  )}
                  title="Pesquisar cards"
                  aria-label="Pesquisar cards"
                >
                  <Search className="h-4 w-4" />
                </button>

                <div
                  className={clsx(
                    'absolute inset-0 transition-opacity duration-200',
                    searchExpanded
                      ? 'opacity-100 delay-75'
                      : 'pointer-events-none opacity-0',
                  )}
                >
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onBlur={() => {
                      if (!search.trim()) setSearchOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        if (search) {
                          setSearch('');
                        } else {
                          setSearchOpen(false);
                        }
                      }
                    }}
                    placeholder="Pesquisar cards..."
                    tabIndex={searchExpanded ? 0 : -1}
                    className="h-full w-full bg-transparent py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 outline-none focus:ring-0 dark:text-gray-100"
                    aria-label="Pesquisar cards"
                  />
                  {search ? (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSearch('');
                        searchInputRef.current?.focus();
                      }}
                      aria-label="Limpar busca"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 outline-none transition-colors hover:bg-gray-100 hover:text-gray-600 focus:ring-0 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(true)}
                className={clsx(
                  'relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors outline-none focus:ring-0',
                  hasActiveKanbanFilters
                    ? 'border-gray-200 bg-white font-medium text-red-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-red-400 dark:hover:bg-gray-800'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
                )}
                aria-label="Abrir filtro"
                title={hasActiveKanbanFilters ? 'Filtro (ativo)' : 'Filtro'}
              >
                <Filter className="h-4 w-4" />
                {hasActiveKanbanFilters && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                )}
              </button>
              <div ref={boardToolsRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setBoardToolsOpen((v) => !v)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  title="Mais opções"
                  aria-label="Mais opções"
                  aria-expanded={boardToolsOpen}
                  aria-haspopup="menu"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {boardToolsOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-40 mt-1.5 min-w-[220px] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setBoardToolsOpen(false);
                        setArchivedModalOpen(true);
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <Archive className="h-4 w-4 shrink-0 text-gray-500" />
                      Cartões arquivados
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={exportingBoard || showBoardSkeleton || !board}
                      onClick={() => {
                        setBoardToolsOpen(false);
                        void handleExportTrello();
                      }}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <Download className="h-4 w-4 shrink-0 text-gray-500" />
                      {exportingBoard ? 'Exportando…' : 'Exportar'}
                    </button>
                    {!boardReadOnly && (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={showBoardSkeleton || !board}
                          onClick={() => {
                            setBoardToolsOpen(false);
                            setImportModalOpen(true);
                            setImportPayload(null);
                            setImportFileName('');
                            setImportReplace(true);
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <Upload className="h-4 w-4 shrink-0 text-gray-500" />
                          Importar
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setBoardToolsOpen(false);
                            setLabelSettingsHeader({ title: 'Etiquetas', showBack: false });
                            setLabelSettingsOpen(true);
                          }}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <Tag className="h-4 w-4 shrink-0 text-gray-500" />
                          Etiquetas
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Board ── */}
        <div
          ref={boardScrollRef}
          className={clsx(
            'app-thin-scroll overflow-x-auto bg-transparent px-4',
            isChecklistBoard
              ? 'min-h-0 flex-1 overflow-y-hidden pb-5'
              : 'pb-4',
          )}
        >
          <div
            ref={boardCardsRef}
            className={clsx(
              'flex gap-5',
              isChecklistBoard
                ? 'h-full min-h-0 items-stretch'
                : 'items-start',
            )}
            style={{ minWidth: 'max-content' }}
            onDragOver={
              boardReadOnly || showBoardSkeleton ? undefined : handleBoardColumnDragOver
            }
            onDrop={boardReadOnly || showBoardSkeleton ? undefined : handleBoardColumnDrop}
          >
            {showBoardSkeleton ? (
              <KanbanBoardSkeleton />
            ) : (
              filteredColumns.map((column, columnIndex) => (
              <React.Fragment key={column.id}>
                {!boardReadOnly &&
                  columnDrag.draggingColumnId &&
                  columnDrag.overIndex === columnIndex && (
                  <KanbanColumnDropGutter
                    active
                    onDragOver={(e) => handleColumnDragOver(e, columnIndex)}
                    onDrop={(e) => handleColumnDrop(e, columnIndex)}
                  />
                )}
                <div
                  data-kanban-column-id={column.id}
                  className={clsx(
                    'kanban-column-slot flex shrink-0',
                    isChecklistBoard && 'h-full min-h-0',
                  )}
                  onDragOver={
                    boardReadOnly || !columnDrag.draggingColumnId
                      ? undefined
                      : handleBoardColumnDragOver
                  }
                  onDrop={
                    boardReadOnly || !columnDrag.draggingColumnId
                      ? undefined
                      : handleBoardColumnDrop
                  }
                  onDragOverCapture={
                    boardReadOnly
                      ? undefined
                      : (e) => {
                          if (!columnDragIdRef.current) return;
                          e.preventDefault();
                          handleBoardColumnDragOver(e);
                        }
                  }
                  onDropCapture={
                    boardReadOnly
                      ? undefined
                      : (e) => {
                          if (!columnDragIdRef.current) return;
                          e.preventDefault();
                          e.stopPropagation();
                          void handleBoardColumnDrop(e);
                        }
                  }
                >
                  <KanbanColumnComponent
                    column={column}
                    labelPresets={boardLabelPresets}
                    dragState={dragState}
                    isColumnDragging={columnDrag.draggingColumnId === column.id}
                    isColumnDragActive={!!columnDrag.draggingColumnId}
                    readOnly={boardReadOnly}
                    onAddCard={openCreateCard}
                    onEditCard={openEditCard}
                    onMoveCard={openMoveCard}
                    onCopyCard={openCopyCard}
                    onDeleteCard={handleDeleteCard}
                    onPrefetchCard={prefetchKanbanCard}
                    cardViewMode={cardViewMode}
                    onToggleCardComplete={
                      boardReadOnly ? undefined : handleToggleCardComplete
                    }
                    onArchiveCard={
                      boardReadOnly ? undefined : handleArchiveCard
                    }
                    onColumnDragStart={boardReadOnly ? undefined : handleColumnDragStart}
                    onColumnDragEnd={handleColumnDragEnd}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onEditColumn={(col) => setColModal({ mode: 'edit', column: col })}
                    onDeleteColumn={handleDeleteColumn}
                    onSortColumn={handleSortColumn}
                    collapsed={collapsedColumnIds.has(column.id)}
                    onToggleCollapse={() => toggleColumnCollapsed(column.id)}
                  />
                </div>
              </React.Fragment>
            ))
            )}
            {!showBoardSkeleton && !boardReadOnly &&
              columnDrag.draggingColumnId &&
              columnDrag.overIndex === filteredColumns.length && (
              <KanbanColumnDropGutter
                active
                onDragOver={(e) => handleColumnDragOver(e, filteredColumns.length)}
                onDrop={(e) => handleColumnDrop(e, filteredColumns.length)}
              />
            )}

            {!showBoardSkeleton && !boardReadOnly && (
              <button
                type="button"
                onClick={() => setColModal({ mode: 'create' })}
                className="group flex w-[340px] flex-shrink-0 flex-col items-center justify-center gap-2 self-start rounded-2xl border-2 border-dashed border-gray-300/80 py-8 text-gray-400 transition-all hover:border-gray-400 hover:bg-white/50 hover:text-gray-600 dark:border-gray-600 dark:hover:bg-gray-800/40 dark:hover:text-gray-300 dark:text-gray-500"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 transition-colors group-hover:bg-red-50 dark:group-hover:bg-red-900/20">
                  <Plus className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium">Nova Coluna</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <Modal
        isOpen={isFiltersModalOpen}
        onClose={() => setIsFiltersModalOpen(false)}
        title="Filtros"
        size="md"
      >
        <div className="space-y-4">
          <MultiSelectSearchDropdown
            label="Prioridade"
            options={priorityFilterOptions}
            selected={filterPriorities}
            onChange={setFilterPriorities}
            placeholder="Todas as prioridades"
            searchPlaceholder="Pesquisar prioridade..."
            emptyOptionsMessage="Nenhuma prioridade disponível."
            emptySearchMessage="Nenhuma prioridade encontrada."
            icon={<Flag className="h-4 w-4" aria-hidden />}
            menuInline
            noFocusRing
          />
          <MultiSelectSearchDropdown
            label="Etiquetas"
            options={labelFilterOptions}
            selected={filterLabelColors}
            onChange={setFilterLabelColors}
            placeholder="Todas as etiquetas"
            searchPlaceholder="Pesquisar etiqueta..."
            emptyOptionsMessage="Nenhuma etiqueta configurada neste setor."
            emptySearchMessage="Nenhuma etiqueta encontrada."
            icon={<Tag className="h-4 w-4" aria-hidden />}
            menuInline
            noFocusRing
          />
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setFilterPriorities([]);
                setFilterLabelColors([]);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 outline-none transition-colors hover:bg-gray-50 focus:ring-0 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Limpar filtros
            </button>
            <button
              type="button"
              onClick={() => setIsFiltersModalOpen(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 outline-none transition-colors hover:bg-red-100 focus:ring-0 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
            >
              Aplicar
            </button>
          </div>
        </div>
      </Modal>

      {archivedModalOpen && (
        <Modal
          isOpen
          onClose={() => setArchivedModalOpen(false)}
          size="md"
          title="Cartões arquivados"
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Cards arquivados somem do quadro, mas ficam aqui. Restaure para colocá-los de volta na
              coluna original.
            </p>
            {loadingArchived || fetchingArchived ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando…
              </div>
            ) : archivedCards.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhum cartão arquivado neste quadro.
              </p>
            ) : (
              <ul className="max-h-[min(60vh,420px)] space-y-2 overflow-y-auto pr-1">
                {archivedCards.map((card) => (
                  <li
                    key={card.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {card.title.trim() || 'Sem título'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                        Coluna: {card.columnTitle}
                        {card.archivedAt
                          ? ` · ${new Date(card.archivedAt).toLocaleString('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}`
                          : null}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={boardReadOnly || unarchivingCardId === card.id}
                      onClick={() => {
                        void handleUnarchiveCard(card);
                      }}
                      className="shrink-0"
                    >
                      {unarchivingCardId === card.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        'Restaurar'
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Modal>
      )}

      {importModalOpen && (
        <Modal
          isOpen
          onClose={() => {
            if (importingBoard) return;
            setImportModalOpen(false);
          }}
          size="sm"
          title="Importar quadro"
          closeOnOverlayClick={!importingBoard}
        >
          <div className="space-y-4">
            {importingBoard && importProgress != null ? (
              <div className="space-y-5 py-6">
                <p className="text-center text-sm font-medium text-gray-800 dark:text-gray-200">
                  Importando quadro…
                </p>
                <div className="w-full space-y-2">
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                    <span>Progresso</span>
                    <span className="tabular-nums font-semibold text-gray-800 dark:text-gray-100">
                      {Math.round(importProgress)}%
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-red-600 transition-all duration-150 ease-out"
                      style={{ width: `${Math.min(100, importProgress)}%` }}
                    />
                  </div>
                </div>
                <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                  Aguarde, não feche esta página.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  Importe um JSON exportado do Trello ou pelo botão Exportar deste Tasks.
                </p>

                <input
                  ref={importFileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    void handleImportFileChosen(e.target.files?.[0] || null);
                    e.target.value = '';
                  }}
                />

                <button
                  type="button"
                  onClick={() => importFileRef.current?.click()}
                  className={clsx(
                    'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors',
                    importFileName
                      ? 'border-red-300 bg-red-50/60 dark:border-red-800/50 dark:bg-red-950/20'
                      : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-800/60',
                  )}
                >
                  <span
                    className={clsx(
                      'flex h-10 w-10 items-center justify-center rounded-full',
                      importFileName
                        ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
                    )}
                  >
                    <Upload className="h-5 w-5" />
                  </span>
                  <span className="max-w-full break-all px-2 text-sm font-medium text-gray-800 dark:text-gray-100">
                    {importFileName || 'Selecionar arquivo .json'}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {importFileName ? 'Clique para trocar o arquivo' : 'Clique para escolher'}
                  </span>
                </button>

                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={importReplace}
                    onChange={(e) => setImportReplace(e.target.checked)}
                    className="sr-only"
                  />
                  <span className="shrink-0">
                    <CheckboxIndicator checked={importReplace} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">
                      Substituir o quadro atual
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                      Apaga colunas e cards existentes antes de importar.
                    </span>
                  </span>
                </label>

                <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setImportModalOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={!importPayload}
                    className="!border-transparent !bg-red-600 !text-white hover:!bg-red-700 focus-visible:ring-red-500"
                    onClick={() => void handleConfirmImport()}
                  >
                    Importar
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {labelSettingsOpen && board && (
        <Modal
          isOpen
          elevated
          onClose={() => {
            if (savingLabelPresets) return;
            setLabelSettingsOpen(false);
            setLabelSettingsHeader({ title: 'Etiquetas', showBack: false });
          }}
          size="sm"
          title={
            <div className="relative flex w-full items-center justify-center">
              {labelSettingsHeader.showBack ? (
                <button
                  type="button"
                  onClick={() => labelSettingsHeader.onBack?.()}
                  className="absolute left-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  aria-label="Voltar"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : null}
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {labelSettingsHeader.title}
              </h3>
            </div>
          }
          closeOnOverlayClick={!savingLabelPresets}
          contentClassName="!pt-4"
        >
          <KanbanCardLabelsPanel
            variant="board"
            labels={[]}
            labelPresets={boardLabelPresets}
            onHeaderChange={setLabelSettingsHeader}
            onClose={() => {
              setLabelSettingsOpen(false);
              setLabelSettingsHeader({ title: 'Etiquetas', showBack: false });
            }}
            onSave={() => undefined}
            onPresetsChange={async (presets, options) => {
              setSavingLabelPresets(true);
              try {
                const updated = await updateKanbanBoardLabelPresets(
                  presets,
                  departmentKeyParam ?? undefined,
                  options,
                );
                queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (prev) => {
                  const next = remapLabelsInBoardCache(prev, updated, options?.colorRemaps);
                  if (next && boardScopeKey) writeKanbanBoardCache(boardScopeKey, next);
                  return next;
                });
              } catch (err: unknown) {
                const msg =
                  err && typeof err === 'object' && 'response' in err
                    ? (err as { response?: { data?: { message?: string } } }).response?.data
                        ?.message
                    : null;
                toast.error(msg || 'Não foi possível salvar as etiquetas');
                throw err;
              } finally {
                setSavingLabelPresets(false);
              }
            }}
          />
        </Modal>
      )}

      {cardModal && (
        <KanbanCardModal
          key={
            cardModal.mode === 'detail'
              ? cardModal.cardId
              : `create-${cardModal.columnId}-${cardModal.insertAt}`
          }
          mode={cardModal.mode}
          cardId={cardModal.mode === 'detail' ? cardModal.cardId : undefined}
          columnId={cardModal.columnId}
          initialCard={cardModal.mode === 'detail' ? cardModal.initialCard : undefined}
          initialColumn={cardModal.mode === 'detail' ? cardModal.initialColumn : undefined}
          labelPresets={[...boardLabelPresets]}
          onLabelPresetsChange={async (presets, options) => {
            const updated = await updateKanbanBoardLabelPresets(
              presets,
              departmentKeyParam ?? undefined,
              options,
            );
            queryClient.setQueryData<KanbanBoard>(kanbanBoardQueryKey, (prev) => {
              const next = remapLabelsInBoardCache(prev, updated, options?.colorRemaps);
              if (next && boardScopeKey) writeKanbanBoardCache(boardScopeKey, next);
              return next;
            });
          }}
          currentUserId={meUser?.id}
          currentUser={
            meUser
              ? {
                  id: meUser.id,
                  name: meUser.name,
                  email: meUser.email ?? '',
                  profilePhotoUrl: meUser.profilePhotoUrl ?? null,
                }
              : null
          }
          canViewKanbanValues={canViewKanbanValues}
          createInsertAt={cardModal.mode === 'create' ? cardModal.insertAt : undefined}
          onClose={() => setCardModal(null)}
          onBoardRefresh={refreshBoard}
          onBoardCardCreated={handleBoardCardCreated}
          onBoardCardPatch={patchBoardCard}
          onBoardCardSync={handleBoardCardSync}
          onCreateOpenDetail={openCreateCardDetail}
          showCompleteCheck
          completeCheckDisabled={boardReadOnly}
        />
      )}

      {colModal && (
        <ColumnModal
          mode={colModal.mode}
          initial={colModal.column}
          onClose={() => setColModal(null)}
          onSave={handleSaveColumn}
          saving={savingColumn}
        />
      )}

      {cardColumnAction && (
        <CardColumnActionModal
          key={`${cardColumnAction.mode}-${cardColumnAction.cardId}`}
          mode={cardColumnAction.mode}
          cardTitle={cardColumnAction.title}
          currentColumnId={cardColumnAction.columnId}
          columns={columns}
          onClose={() => setCardColumnAction(null)}
          onConfirm={confirmCardColumnAction}
        />
      )}

      {deleteConfirm && (
        <Modal
          isOpen
          onClose={() => setDeleteConfirm(null)}
          size="sm"
          confirmBeforeClose={false}
      title="Confirmar exclusão"
        >
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            {deleteConfirm.type === 'card'
              ? 'Excluir este card permanentemente? Esta ação não pode ser desfeita.'
              : 'Excluir a coluna e todos os cards dentro dela? Esta ação não pode ser desfeita.'}
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="error"
              onClick={deleteConfirm.type === 'card' ? confirmDeleteCard : confirmDeleteColumn}
            >
              Excluir
            </Button>
          </div>
        </Modal>
      )}

      <KanbanCreateBoardModal
        isOpen={createBoardOpen}
        onClose={() => setCreateBoardOpen(false)}
        onSubmit={handleCreateBoard}
        saving={creatingBoard}
      />

      <KanbanCreateBoardModal
        isOpen={!!renameBoardTarget}
        onClose={() => !renamingBoard && setRenameBoardTarget(null)}
        onSubmit={handleRenameBoard}
        saving={renamingBoard}
        title="Renomear quadro"
        submitLabel="Salvar"
        initialName={renameBoardTarget?.name ?? ''}
        hint=""
      />

      {boardDeleteTarget && (
        <Modal
          isOpen
          onClose={() => !deletingBoard && setBoardDeleteTarget(null)}
          size="sm"
          confirmBeforeClose={false}
      title="Excluir quadro"
        >
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
            Excluir o quadro <strong>{boardDeleteTarget.department}</strong> permanentemente?
            Todas as colunas e cards serão removidos. Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBoardDeleteTarget(null)}
              disabled={deletingBoard}
            >
              Cancelar
            </Button>
            <Button type="button" variant="error" onClick={handleDeleteBoard} disabled={deletingBoard}>
              {deletingBoard ? 'Excluindo…' : 'Excluir quadro'}
            </Button>
          </div>
        </Modal>
      )}

      {shareTarget && (
        <KanbanBoardShareModal
          isOpen
          onClose={() => setShareTarget(null)}
          boardId={shareTarget.boardId}
          boardName={shareTarget.boardName}
          currentUserId={meUser?.id}
          ownerUser={
            meUser
              ? {
                  id: meUser.id,
                  name: meUser.name,
                  email: meUser.email ?? '',
                  profilePhotoUrl: meUser.profilePhotoUrl ?? null,
                }
              : null
          }
        />
      )}
    </MainLayout>
  );
}

/** Next.js exige Suspense em volta de `useSearchParams` na geração estática. */
export default function KanbanPageWithSuspense() {
  return (
    <Suspense fallback={<Loading />}>
      <KanbanPage />
    </Suspense>
  );
}
