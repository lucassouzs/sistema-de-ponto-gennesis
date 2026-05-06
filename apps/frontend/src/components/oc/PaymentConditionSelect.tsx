'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export type PaymentConditionRow = {
  id: string;
  code: string;
  label: string;
  paymentType: string;
  parcelCount: number;
  parcelDueDays: unknown;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
};

export function normalizeParcelDueDaysClient(input: unknown): number[] {
  if (input == null) return [];
  if (Array.isArray(input)) {
    return input.map((x) => Math.round(Number(x))).filter((n) => Number.isFinite(n) && n >= 0);
  }
  return [];
}

/** Texto curto: "3 parcelas: 30, 60 e 90 dias" ou "30 dias" */
export function formatParcelSummary(parcelCount: number, parcelDueDays: unknown): string {
  const days = normalizeParcelDueDaysClient(parcelDueDays);
  if (!days.length) return '';
  if (parcelCount === 1 && days[0] === 0) return '';
  if (parcelCount === 1) return `${days[0]} dia${days[0] === 1 ? '' : 's'}`;
  const join =
    days.length === 2
      ? `${days[0]} e ${days[1]}`
      : days.length > 2
        ? `${days.slice(0, -1).join(', ')} e ${days[days.length - 1]}`
        : String(days[0]);
  return `${parcelCount} parcelas: ${join} dias`;
}

export function formatPaymentConditionDisplay(
  r: Pick<PaymentConditionRow, 'label' | 'parcelCount' | 'parcelDueDays'>
): string {
  const extra = formatParcelSummary(r.parcelCount ?? 1, r.parcelDueDays);
  return extra ? `${r.label} — ${extra}` : r.label;
}

type Props = {
  paymentType: 'AVISTA' | 'BOLETO';
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  showCreate?: boolean;
};

export function PaymentConditionSelect({
  paymentType,
  value,
  onChange,
  disabled,
  id,
  className,
  showCreate = true
}: Props) {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [modalParcelCount, setModalParcelCount] = useState(1);
  const [modalDayStrs, setModalDayStrs] = useState<string[]>(['30']);

  const { data, isLoading } = useQuery({
    queryKey: ['payment-conditions', paymentType],
    queryFn: async () => {
      const res = await api.get('/payment-conditions', {
        params: { paymentType, activeOnly: 'true' }
      });
      return (res.data?.data || []) as PaymentConditionRow[];
    }
  });

  useEffect(() => {
    if (!showModal) return;
    if (paymentType === 'AVISTA') {
      setModalParcelCount(1);
      setModalDayStrs(['0']);
    } else {
      setModalParcelCount(1);
      setModalDayStrs(['30']);
    }
  }, [showModal, paymentType]);

  const options = useMemo(() => {
    const rows = data || [];
    return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'pt-BR'));
  }, [data]);

  const syncModalDaysLength = (n: number, prev: string[]) => {
    const next = [...prev];
    while (next.length < n) next.push(next[next.length - 1] ?? '30');
    while (next.length > n) next.pop();
    return next;
  };

  const createMutation = useMutation({
    mutationFn: async (payload: { label: string; parcelCount: number; parcelDueDays: number[] }) => {
      const res = await api.post('/payment-conditions', { paymentType, ...payload });
      return res.data?.data as PaymentConditionRow;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ['payment-conditions'] });
      if (row?.code) onChange(row.code);
      setShowModal(false);
      setNewLabel('');
      toast.success('Condição criada');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Erro ao criar condição');
    }
  });

  const selectClass =
    className ||
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60';

  const submitModal = () => {
    if (!newLabel.trim()) {
      toast.error('Informe o nome da condição');
      return;
    }
    if (paymentType === 'AVISTA') {
      createMutation.mutate({ label: newLabel.trim(), parcelCount: 1, parcelDueDays: [0] });
      return;
    }
    const days = modalDayStrs.map((s) => {
      const t = s.trim().replace(',', '.');
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) return NaN;
      return Math.round(n);
    });
    if (days.some((n) => Number.isNaN(n))) {
      toast.error('Preencha cada prazo em dias com um número válido (≥ 0)');
      return;
    }
    if (days.length !== modalParcelCount) {
      toast.error('O número de prazos deve ser igual ao número de parcelas');
      return;
    }
    createMutation.mutate({
      label: newLabel.trim(),
      parcelCount: modalParcelCount,
      parcelDueDays: days
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || isLoading}
          className={`${selectClass} flex-1 min-w-0`}
        >
          {value && !options.some((o) => o.code === value) && (
            <option value={value}>{value} (legado)</option>
          )}
          {options.length === 0 && !isLoading ? (
            <option value="">Nenhuma condição — cadastre em Cadastros</option>
          ) : (
            options.map((o) => (
              <option key={o.id} value={o.code}>
                {formatPaymentConditionDisplay(o)}
              </option>
            ))
          )}
        </select>
        {showCreate && !disabled && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-500/40 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Nova condição
          </button>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Nova condição de pagamento</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Tipo: <strong>{paymentType === 'AVISTA' ? 'À vista' : 'Boleto'}</strong>
            </p>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nome da condição</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Ex: Boleto 3 parcelas"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 mb-4"
              autoFocus
            />

            {paymentType === 'BOLETO' && (
              <div className="space-y-3 mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Número de parcelas</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={modalParcelCount}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(60, Math.floor(Number(e.target.value)) || 1));
                    setModalParcelCount(n);
                    setModalDayStrs((prev) => syncModalDaysLength(n, prev));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">Prazo (dias) para cada parcela, na ordem (1ª, 2ª, 3ª…)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {modalDayStrs.map((d, idx) => (
                    <div key={idx}>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        Parcela {idx + 1} (dias)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={d}
                        onChange={(e) => {
                          const v = e.target.value;
                          setModalDayStrs((prev) => {
                            const copy = [...prev];
                            copy[idx] = v;
                            return copy;
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
                        placeholder="30"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {paymentType === 'AVISTA' && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">À vista: 1 parcela, prazo 0 dias (imediato).</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setNewLabel('');
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!newLabel.trim() || createMutation.isPending}
                onClick={submitModal}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mapa code → label para exibição (mescla com rótulos estáticos legados). */
export function buildPaymentConditionLabelMap(
  rows: PaymentConditionRow[] | undefined,
  staticLabels: Record<string, string>
): Record<string, string> {
  const m: Record<string, string> = { ...staticLabels };
  for (const r of rows || []) {
    m[r.code] = formatPaymentConditionDisplay(r);
  }
  return m;
}
