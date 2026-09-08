'use client';

import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { fetchKanbanCardCost, type KanbanCardCost } from '@/lib/kanban';

function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatHours(h: number): string {
  return h.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPeriod(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CostInfoTooltip({ cost }: { cost: KanbanCardCost }) {
  return (
    <span className="group/info relative shrink-0">
      <button
        type="button"
        aria-describedby={`kanban-cost-info-${cost.periodStart}`}
        className={clsx(
          'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
          'text-gray-500 hover:bg-gray-200/80 hover:text-gray-700',
          'dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200',
        )}
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>
      <div
        id={`kanban-cost-info-${cost.periodStart}`}
        role="tooltip"
        className={clsx(
          'pointer-events-none absolute right-0 top-full z-[1200] mt-2 w-72 max-w-[calc(100vw-3rem)]',
          'rounded-lg border p-3 text-left shadow-lg',
          'border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800',
          'invisible opacity-0 transition-opacity duration-150',
          'group-hover/info:visible group-hover/info:opacity-100',
          'group-focus-within/info:visible group-focus-within/info:opacity-100',
        )}
      >
        <div className="space-y-2 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
          <p>
            Valor hora = (salário + periculosidade + insalubridade) ÷ {cost.monthlyWorkHours}h.
            Contagem: seg–qui 07:00–12:00 e 13:00–17:00; sex 07:00–12:00 e 13:00–16:00 (1h de
            almoço).
          </p>
          <p>
            Período (data de entrega): {formatPeriod(cost.periodStart)} →{' '}
            {formatPeriod(cost.periodEnd)}
          </p>
        </div>
      </div>
    </span>
  );
}

function CostContent({ cost }: { cost: KanbanCardCost }) {
  return (
    <div className="space-y-4">
      <div className="overflow-visible rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-900/50">
        <p className="text-xs text-gray-500 dark:text-gray-400">Total estimado</p>
        <div className="mt-1 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatMoney(cost.totalCost)}
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {formatHours(cost.hours)} h úteis
            </p>
          </div>
          <CostInfoTooltip cost={cost} />
        </div>
      </div>

      {cost.people.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {cost.people.map((p) => (
            <li
              key={p.userId || p.name}
              className="flex items-center justify-between gap-3 border-t border-gray-100 pt-2 first:border-0 first:pt-0 dark:border-gray-700"
            >
              <span className="truncate font-medium text-gray-800 dark:text-gray-200">
                {p.name}
              </span>
              {p.hasEmployeeRecord && p.hourlyRate != null && p.cost != null ? (
                <span className="shrink-0 text-right text-gray-600 dark:text-gray-300">
                  {formatMoney(p.cost)}
                  <span className="block text-xs text-gray-400">
                    {formatMoney(p.hourlyRate)}/h
                  </span>
                </span>
              ) : (
                <span className="shrink-0 text-amber-600 dark:text-amber-400">Sem cadastro</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Adicione membros ou responsável ao card para calcular o custo.
        </p>
      )}

      {cost.hasMissingSalary ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Parte do custo não foi calculada: funcionário sem vínculo ou salário no cadastro.
        </p>
      ) : null}
    </div>
  );
}

export interface KanbanCardCostModalProps {
  isOpen: boolean;
  elevated?: boolean;
  onClose: () => void;
  cardId: string;
}

export function KanbanCardCostModal({
  isOpen,
  elevated,
  onClose,
  cardId,
}: KanbanCardCostModalProps) {
  const { data: cost, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: ['kanban-card-cost', cardId],
    queryFn: () => fetchKanbanCardCost(cardId),
    enabled: isOpen,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (isOpen) void refetch();
  }, [isOpen, refetch]);

  useEffect(() => {
    if (!isError || !isOpen) return;
    const err = queryError as { response?: { data?: { message?: string; error?: string } } };
    const msg =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      'Não foi possível calcular o custo desta demanda';
    toast.error(msg);
    onClose();
  }, [isError, isOpen, onClose, queryError]);

  return (
    <Modal
      isOpen={isOpen}
      elevated={elevated}
      contentOverflowVisible
      onClose={onClose}
      size="sm"
      title="Custo da demanda"
    >
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : cost ? (
        <CostContent cost={cost} />
      ) : null}
    </Modal>
  );
}
