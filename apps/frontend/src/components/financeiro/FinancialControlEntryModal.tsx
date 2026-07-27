'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import api from '@/lib/api';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  FINANCIAL_CONTROL_CONSORCIO_OPTIONS,
  MONTHS_PT,
  STATUS_OPTIONS,
  type EntryFormState,
  type FinancialControlConsorcio,
  type FinancialControlEntry,
  type FinancialControlStatus,
  buildFinancialEntryPayload,
  buildInitialForm,
  buildQuickLaunchPayload,
  entryToForm,
} from '@/components/financeiro/financialControlEntry';
import { FinancialControlOcQuickLaunch } from '@/components/financeiro/FinancialControlOcQuickLaunch';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';

const MONTH_SELECT_OPTIONS = labeledToSelectOptions(
  MONTHS_PT.map((label, idx) => ({ value: String(idx + 1), label }))
);
const STATUS_SELECT_OPTIONS = labeledToSelectOptions(STATUS_OPTIONS);

export type FinancialControlEntryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  editingEntry?: FinancialControlEntry | null;
  /** Mescla campos ao abrir para criar (ex.: dados da OC). */
  initialValues?: Partial<EntryFormState>;
  defaultPaymentMonth?: number;
  defaultPaymentYear?: number;
  /** Consórcio pré-selecionado ao criar (ex.: aba ativa). */
  defaultConsorcio?: FinancialControlConsorcio;
  /** Resumo automático sem campos editáveis (lançamento a partir da OC). */
  simplifiedFromOc?: boolean;
};

function CurrencyInput({
  value,
  onChange,
  placeholder = '0,00',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      onChange('');
      return;
    }
    const number = parseInt(digits, 10) / 100;
    onChange(
      number.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  };

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400 pointer-events-none">
        R$
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white text-right tabular-nums"
      />
    </div>
  );
}

function BoletoToggle({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const normalized = (value || '').trim().toLowerCase();
  const isSpecialValue =
    normalized !== '' && normalized !== 'sim' && normalized !== 'não' && normalized !== 'nao';

  if (isSpecialValue) {
    return (
      <div className="flex items-center gap-2 h-[42px]">
        <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-sm font-medium uppercase">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange('Não')}
          className="text-xs text-gray-500 dark:text-gray-400 underline hover:text-gray-700 dark:hover:text-gray-200"
        >
          Limpar
        </button>
      </div>
    );
  }

  const isYes = normalized === 'sim';

  return (
    <label className="flex items-center gap-3 cursor-pointer group h-[42px] select-none">
      <div className="relative">
        <input
          type="checkbox"
          checked={isYes}
          onChange={(e) => onChange(e.target.checked ? 'Sim' : 'Não')}
          className="sr-only"
        />
        <div
          className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
            isYes
              ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
          }`}
        >
          {isYes && (
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{isYes ? 'Sim' : 'Não'}</span>
    </label>
  );
}

export function FinancialControlEntryModal({
  isOpen,
  onClose,
  editingEntry = null,
  initialValues,
  defaultPaymentMonth,
  defaultPaymentYear,
  defaultConsorcio = 'brasilia',
  simplifiedFromOc = false,
}: FinancialControlEntryModalProps) {
  const queryClient = useQueryClient();
  const now = new Date();
  const [form, setForm] = useState<EntryFormState>(() =>
    buildInitialForm(
      defaultPaymentMonth ?? now.getMonth() + 1,
      defaultPaymentYear ?? now.getFullYear(),
      defaultConsorcio
    )
  );
  const [interestValue, setInterestValue] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setInterestValue('');
    if (editingEntry) {
      setForm(entryToForm(editingEntry));
      return;
    }
    const month = defaultPaymentMonth ?? now.getMonth() + 1;
    const year = defaultPaymentYear ?? now.getFullYear();
    setForm({
      ...buildInitialForm(month, year, defaultConsorcio),
      ...initialValues,
      consorcio: initialValues?.consorcio ?? defaultConsorcio,
    });
  }, [isOpen, editingEntry, initialValues, defaultPaymentMonth, defaultPaymentYear, defaultConsorcio]);

  const createMutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof buildFinancialEntryPayload>) => {
      const res = await api.post('/financial-control', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Lançamento criado com sucesso');
      void queryClient.invalidateQueries({ queryKey: ['financial-control-by-oc'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-control-has-entry'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-control-batch-by-oc'] });
      void queryClient.invalidateQueries({
        queryKey: ['financial-control'],
        refetchType: 'active',
      });
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || 'Erro ao criar lançamento');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: ReturnType<typeof buildFinancialEntryPayload>;
    }) => {
      const res = await api.patch(`/financial-control/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Lançamento atualizado');
      void queryClient.invalidateQueries({ queryKey: ['financial-control-by-oc'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-control-has-entry'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-control-batch-by-oc'] });
      void queryClient.invalidateQueries({
        queryKey: ['financial-control'],
        refetchType: 'active',
      });
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message || 'Erro ao atualizar lançamento');
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const showQuickLaunch = simplifiedFromOc && !editingEntry;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload =
      showQuickLaunch && !editingEntry
        ? buildQuickLaunchPayload(form, interestValue)
        : buildFinancialEntryPayload(form);
    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingEntry ? 'Editar Lançamento' : 'Novo Lançamento'}
      size={showQuickLaunch ? 'md' : 'xl'}
      elevated
    >
      {showQuickLaunch ? (
        <FinancialControlOcQuickLaunch
          form={form}
          interestValue={interestValue}
          onInterestChange={setInterestValue}
          onClose={onClose}
          onSubmit={handleSubmit}
          isSaving={isSaving}
          submitLabel="Criar lançamento"
        />
      ) : (
      <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
        <input type="text" name="prevent-autofill" autoComplete="off" className="hidden" tabIndex={-1} />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Consórcio <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            {FINANCIAL_CONTROL_CONSORCIO_OPTIONS.map((opt) => (
              <ButtonSeg
                key={opt.value}
                active={form.consorcio === opt.value}
                onClick={() => setForm({ ...form, consorcio: opt.value })}
                label={opt.label}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Mês <span className="text-red-500">*</span>
            </label>
            <StringSingleSelectDropdown
              value={String(form.paymentMonth)}
              onChange={(v) => setForm({ ...form, paymentMonth: parseInt(v, 10) })}
              options={MONTH_SELECT_OPTIONS}
              allowEmpty={false}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Ano <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="number"
              min={2000}
              max={2100}
              value={form.paymentYear}
              onChange={(e) => setForm({ ...form, paymentYear: parseInt(e.target.value, 10) })}
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <StringSingleSelectDropdown
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v as FinancialControlStatus })}
              options={STATUS_SELECT_OPTIONS}
              allowEmpty={false}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">O.S.</label>
            <input
              type="text"
              value={form.osCode}
              onChange={(e) => setForm({ ...form, osCode: e.target.value })}
              placeholder="Ex.: ADM, IMP-20/SC-01"
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div className="sm:col-span-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nome do Fornecedor
            </label>
            <input
              type="text"
              value={form.supplierName}
              onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
              placeholder="Ex.: POTENCIAL SEGURADORA"
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Número da NF
            </label>
            <input
              type="text"
              value={form.nfNumber}
              onChange={(e) => setForm({ ...form, nfNumber: e.target.value })}
              placeholder="Ex.: 556713"
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Parcela
            </label>
            <input
              type="text"
              value={form.parcelNumber}
              onChange={(e) => setForm({ ...form, parcelNumber: e.target.value })}
              placeholder="Ex.: 2/2"
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">O.C.</label>
            <input
              type="text"
              value={form.ocNumber}
              onChange={(e) => setForm({ ...form, ocNumber: e.target.value })}
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div className="sm:col-span-2 flex items-end">
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Boleto</label>
              <BoletoToggle value={form.boleto} onChange={(v) => setForm({ ...form, boleto: v })} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Data de Emissão
            </label>
            <input
              type="date"
              value={form.emissionDate}
              onChange={(e) => setForm({ ...form, emissionDate: e.target.value })}
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Data de Vencimento
            </label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Data de Pagamento
            </label>
            <input
              type="date"
              value={form.paidDate}
              onChange={(e) => setForm({ ...form, paidDate: e.target.value })}
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor Original</label>
            <CurrencyInput value={form.originalValue} onChange={(v) => setForm({ ...form, originalValue: v })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor Final</label>
            <CurrencyInput value={form.finalValue} onChange={(v) => setForm({ ...form, finalValue: v })} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observação</label>
          <textarea
            value={form.receivedNote}
            onChange={(e) => setForm({ ...form, receivedNote: e.target.value })}
            placeholder="Ex.: PAGO TED, PAGO PIX, CANCELADO"
            rows={3}
            autoComplete="off"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white resize-y"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editingEntry ? 'Salvar alterações' : 'Criar lançamento'}
          </button>
        </div>
      </form>
      )}
    </Modal>
  );
}
