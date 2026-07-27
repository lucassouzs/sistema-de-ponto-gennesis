'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import api from '@/lib/api';
import {
  formatCurrencyInputBrFromNumber,
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr
} from '@/lib/maskCurrencyBr';
import { getGastosContractAggregateKey } from './gastosOperacionaisContractOrder';
import type { ControleGeralTetoOrcamentarioEntry } from './tetoOrcamentario';

const MONTH_OPTIONS = [
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' }
];

function apiErrorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response &&
    error.response.data &&
    typeof error.response.data === 'object' &&
    'message' in error.response.data &&
    typeof (error.response.data as { message?: unknown }).message === 'string'
  ) {
    return (error.response.data as { message: string }).message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function monthLabel(month: number): string {
  return MONTH_OPTIONS.find((option) => option.value === String(month))?.label ?? String(month);
}

export type TetoOrcamentarioFormPrefill = {
  contractName?: string;
  year?: number;
  month?: number;
};

type ControleGeralTetoOrcamentarioModalProps = {
  isOpen: boolean;
  onClose: () => void;
  contractOptions: string[];
  entries: ControleGeralTetoOrcamentarioEntry[];
  prefill?: TetoOrcamentarioFormPrefill | null;
};

export function ControleGeralTetoOrcamentarioModal({
  isOpen,
  onClose,
  contractOptions,
  entries,
  prefill
}: ControleGeralTetoOrcamentarioModalProps) {
  const queryClient = useQueryClient();
  const now = new Date();
  const [contractName, setContractName] = useState('');
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [amountInput, setAmountInput] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const nextContract =
      prefill?.contractName?.trim() ||
      (contractOptions.length === 1 ? contractOptions[0] : '');
    const nextYear = prefill?.year ?? now.getFullYear();
    const nextMonth = prefill?.month ?? now.getMonth() + 1;
    setContractName(nextContract);
    setYear(String(nextYear));
    setMonth(String(nextMonth));

    const key = nextContract ? getGastosContractAggregateKey(nextContract) : '';
    const existing = entries.find(
      (entry) =>
        (getGastosContractAggregateKey(entry.contractName) || entry.contractKey) === key &&
        entry.year === nextYear &&
        entry.month === nextMonth
    );
    setAmountInput(
      existing ? formatCurrencyInputBrFromNumber(existing.amount) : ''
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir / mudar prefill
  }, [isOpen, prefill?.contractName, prefill?.year, prefill?.month]);

  useEffect(() => {
    if (!isOpen || !contractName.trim()) return;
    const yearNum = Number.parseInt(year, 10);
    const monthNum = Number.parseInt(month, 10);
    if (!Number.isFinite(yearNum) || !Number.isFinite(monthNum)) return;

    const key = getGastosContractAggregateKey(contractName);
    const existing = entries.find(
      (entry) =>
        (getGastosContractAggregateKey(entry.contractName) || entry.contractKey) === key &&
        entry.year === yearNum &&
        entry.month === monthNum
    );
    setAmountInput(existing ? formatCurrencyInputBrFromNumber(existing.amount) : '');
  }, [contractName, year, month, entries, isOpen]);

  const contractEntries = useMemo(() => {
    if (!contractName.trim()) return [] as ControleGeralTetoOrcamentarioEntry[];
    const key = getGastosContractAggregateKey(contractName);
    return entries
      .filter(
        (entry) =>
          (getGastosContractAggregateKey(entry.contractName) || entry.contractKey) === key
      )
      .slice()
      .sort((a, b) => b.year - a.year || b.month - a.month);
  }, [contractName, entries]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amount = parseCurrencyInputBr(amountInput);
      if (amount == null) {
        throw new Error('Informe o valor do teto orçamentário.');
      }
      const yearNum = Number.parseInt(year, 10);
      const monthNum = Number.parseInt(month, 10);
      if (!contractName.trim()) {
        throw new Error('Selecione o contrato.');
      }
      if (!Number.isFinite(yearNum) || yearNum < 2000 || yearNum > 2100) {
        throw new Error('Ano inválido.');
      }
      if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) {
        throw new Error('Mês inválido.');
      }

      const res = await api.put('/controle-geral/teto-orcamentario', {
        contractName: contractName.trim(),
        contractKey: getGastosContractAggregateKey(contractName),
        year: yearNum,
        month: monthNum,
        amount
      });
      return res.data;
    },
    onSuccess: async () => {
      toast.success('Teto orçamentário salvo.');
      await queryClient.invalidateQueries({ queryKey: ['controle-geral-teto-orcamentario'] });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, 'Não foi possível salvar o teto orçamentário.'));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/controle-geral/teto-orcamentario/${id}`);
    },
    onSuccess: async () => {
      toast.success('Teto orçamentário removido.');
      await queryClient.invalidateQueries({ queryKey: ['controle-geral-teto-orcamentario'] });
      setAmountInput('');
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, 'Não foi possível remover o teto.'));
    }
  });

  const yearOptions = useMemo(() => {
    const current = now.getFullYear();
    const years = new Set<number>();
    for (let y = current + 1; y >= current - 8; y -= 1) years.add(y);
    for (const entry of entries) years.add(entry.year);
    const yearNum = Number.parseInt(year, 10);
    if (Number.isFinite(yearNum)) years.add(yearNum);
    return Array.from(years)
      .sort((a, b) => b - a)
      .map((y) => ({ value: String(y), label: String(y) }));
  }, [entries, year]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Teto orçamentário mensal" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Cadastre o teto orçamentário de cada contrato por mês. O valor aparece na coluna do
          Controle Geral conforme o período filtrado.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Contrato
            </span>
            <StringSingleSelectDropdown
              value={contractName}
              onChange={setContractName}
              options={contractOptions}
              allowEmpty
              emptyOptionLabel="Selecione o contrato"
              placeholder="Selecione o contrato"
              searchPlaceholder="Buscar contrato…"
              emptyOptionsMessage="Nenhum contrato disponível."
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Mês
            </span>
            <StringSingleSelectDropdown
              value={month}
              onChange={setMonth}
              options={MONTH_OPTIONS}
              allowEmpty={false}
              placeholder="Mês"
              searchPlaceholder="Buscar mês…"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Ano
            </span>
            <StringSingleSelectDropdown
              value={year}
              onChange={setYear}
              options={yearOptions}
              allowEmpty={false}
              placeholder="Ano"
              searchPlaceholder="Buscar ano…"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Valor mensal
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={amountInput}
              onChange={(event) => setAmountInput(maskCurrencyInputBrOrEmpty(event.target.value))}
              placeholder="R$ 0,00"
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Fechar
          </button>
          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Salvar teto
          </button>
        </div>

        {contractEntries.length > 0 ? (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Cadastros deste contrato
            </div>
            <ul className="max-h-56 divide-y divide-gray-200 overflow-y-auto dark:divide-gray-700">
              {contractEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left text-gray-800 hover:text-red-700 dark:text-gray-200 dark:hover:text-red-300"
                    onClick={() => {
                      setYear(String(entry.year));
                      setMonth(String(entry.month));
                      setAmountInput(formatCurrencyInputBrFromNumber(entry.amount));
                    }}
                  >
                    <span className="font-medium">
                      {monthLabel(entry.month)}/{entry.year}
                    </span>
                    <span className="ml-2 tabular-nums text-gray-600 dark:text-gray-400">
                      {formatCurrency(entry.amount)}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remover teto de ${monthLabel(entry.month)}/${entry.year}?`
                        )
                      ) {
                        deleteMutation.mutate(entry.id);
                      }
                    }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                    aria-label={`Remover teto de ${monthLabel(entry.month)}/${entry.year}`}
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
