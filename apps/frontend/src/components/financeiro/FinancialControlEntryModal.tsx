'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import api from '@/lib/api';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  FINANCIAL_CONTROL_CONSORCIO_LABELS,
  FINANCIAL_CONTROL_CONSORCIO_OPTIONS,
  FINANCIAL_CONTROL_OC_DEFAULT_CONSORCIO,
  MONTHS_PT,
  STATUS_OPTIONS,
  type EntryFormState,
  type FinancialControlEntry,
  type FinancialControlStatus,
  buildFinancialEntryPayload,
  buildInitialForm,
  buildQuickLaunchPayload,
  entryToForm,
  financialControlSupplierSelectOption,
  parseCurrencyInput,
} from '@/components/financeiro/financialControlEntry';
import { FinancialControlOcQuickLaunch } from '@/components/financeiro/FinancialControlOcQuickLaunch';
import {
  FinancialControlAttachmentsField,
  uploadFinancialControlAttachments,
} from '@/components/financeiro/FinancialControlAttachmentsField';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';

const MONTH_SELECT_OPTIONS = labeledToSelectOptions(
  MONTHS_PT.map((label, idx) => ({ value: String(idx + 1), label }))
);
const STATUS_SELECT_OPTIONS = labeledToSelectOptions(STATUS_OPTIONS);

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_SELECT_OPTIONS = labeledToSelectOptions(
  Array.from({ length: 11 }, (_, i) => {
    const year = CURRENT_YEAR - 5 + i;
    return { value: String(year), label: String(year) };
  }).reverse()
);

const labelCls = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';
const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white';

type SupplierOption = {
  id: string;
  name: string;
  tradeName?: string | null;
  code?: string | null;
  isActive?: boolean;
};

export type FinancialControlEntryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  editingEntry?: FinancialControlEntry | null;
  /** Mescla campos ao abrir para criar (ex.: dados da OC). */
  initialValues?: Partial<EntryFormState>;
  defaultPaymentMonth?: number;
  defaultPaymentYear?: number;
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
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
        R$
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={`${inputCls} pl-9 text-right tabular-nums`}
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
      <div className="flex h-[42px] items-center gap-2">
        <span className="inline-flex items-center rounded-lg bg-yellow-100 px-3 py-1.5 text-sm font-medium uppercase text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange('Não')}
          className="text-xs text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Limpar
        </button>
      </div>
    );
  }

  const isYes = normalized === 'sim';

  return (
    <label className="group flex h-[42px] cursor-pointer select-none items-center gap-3">
      <div className="relative">
        <input
          type="checkbox"
          checked={isYes}
          onChange={(e) => onChange(e.target.checked ? 'Sim' : 'Não')}
          className="sr-only"
        />
        <div
          className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all duration-200 ${
            isYes
              ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
              : 'border-gray-300 bg-white group-hover:border-red-500 dark:border-gray-600 dark:bg-gray-800 dark:group-hover:border-red-400'
          }`}
        >
          {isYes && (
            <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  simplifiedFromOc = false,
}: FinancialControlEntryModalProps) {
  const queryClient = useQueryClient();
  const now = new Date();
  const [form, setForm] = useState<EntryFormState>(() =>
    buildInitialForm(
      defaultPaymentMonth ?? now.getMonth() + 1,
      defaultPaymentYear ?? now.getFullYear()
    )
  );
  const [interestValue, setInterestValue] = useState('');
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);

  const showQuickLaunch = simplifiedFromOc && !editingEntry;

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', 'financial-control-entry'],
    queryFn: async () => {
      const res = await api.get('/suppliers', { params: { limit: 2000 } });
      return (res.data?.data || []) as SupplierOption[];
    },
    enabled: isOpen && !showQuickLaunch,
    staleTime: 60_000,
  });

  const supplierOptions = useMemo(() => {
    const active = suppliers.filter((s) => s.isActive !== false);
    const opts = active.map((s) => financialControlSupplierSelectOption(s));
    const current = form.supplierName.trim();
    if (current && !opts.some((o) => o.value === current)) {
      opts.unshift({ value: current, label: current, searchText: current });
    }
    return opts;
  }, [suppliers, form.supplierName]);

  useEffect(() => {
    if (!isOpen) return;
    setInterestValue('');
    setConfirmCreateOpen(false);
    if (editingEntry) {
      setForm(entryToForm(editingEntry));
      return;
    }
    const month = defaultPaymentMonth ?? now.getMonth() + 1;
    const year = defaultPaymentYear ?? now.getFullYear();
    setForm({
      ...buildInitialForm(month, year),
      ...initialValues,
      attachments: initialValues?.attachments ?? [],
      consorcio: showQuickLaunch
        ? FINANCIAL_CONTROL_OC_DEFAULT_CONSORCIO
        : (initialValues?.consorcio ?? ''),
    });
  }, [isOpen, editingEntry, initialValues, defaultPaymentMonth, defaultPaymentYear, showQuickLaunch]);

  const createMutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof buildFinancialEntryPayload>) => {
      const res = await api.post('/financial-control', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Lançamento criado com sucesso');
      setConfirmCreateOpen(false);
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
  const selectedConsorcioLabel =
    form.consorcio === 'brasilia' || form.consorcio === 'hub'
      ? FINANCIAL_CONTROL_CONSORCIO_LABELS[form.consorcio]
      : null;

  const validateRequiredFields = (): string | null => {
    if (form.consorcio !== 'brasilia' && form.consorcio !== 'hub') {
      return 'Selecione o consórcio do lançamento';
    }
    if (!form.paymentMonth || form.paymentMonth < 1 || form.paymentMonth > 12) {
      return 'Selecione o mês';
    }
    if (!form.paymentYear || form.paymentYear < 2000 || form.paymentYear > 2100) {
      return 'Informe o ano';
    }
    if (!form.status) {
      return 'Selecione o status';
    }
    if (!form.osCode.trim()) {
      return 'Informe a O.S.';
    }
    if (!form.supplierName.trim()) {
      return 'Selecione o fornecedor';
    }
    if (!form.nfNumber.trim()) {
      return 'Informe a NF';
    }
    if (!form.parcelNumber.trim()) {
      return 'Informe a parcela';
    }
    if (!form.ocNumber.trim()) {
      return 'Informe a O.C.';
    }
    if (!form.emissionDate) {
      return 'Informe a data de emissão';
    }
    if (!form.dueDate) {
      return 'Informe a data de vencimento';
    }
    if (!form.paidDate) {
      return 'Informe a data de pagamento';
    }
    if (parseCurrencyInput(form.originalValue) == null) {
      return 'Informe o valor original';
    }
    if (parseCurrencyInput(form.finalValue) == null) {
      return 'Informe o valor final';
    }
    return null;
  };

  const submitPayload = () => {
    try {
      const formForPayload =
        showQuickLaunch && !editingEntry
          ? { ...form, consorcio: FINANCIAL_CONTROL_OC_DEFAULT_CONSORCIO }
          : form;
      const payload =
        showQuickLaunch && !editingEntry
          ? buildQuickLaunchPayload(formForPayload, interestValue)
          : buildFinancialEntryPayload(formForPayload);
      if (editingEntry) {
        updateMutation.mutate({ id: editingEntry.id, payload });
      } else {
        createMutation.mutate(payload);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o lançamento');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showQuickLaunch) {
      const validationError = validateRequiredFields();
      if (validationError) {
        toast.error(validationError);
        return;
      }
    }
    if (editingEntry) {
      submitPayload();
      return;
    }
    setConfirmCreateOpen(true);
  };

  return (
    <>
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
          <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
            <input type="text" name="prevent-autofill" autoComplete="off" className="hidden" tabIndex={-1} />

            <div>
              <label className={labelCls}>
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={labelCls}>
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
                <label className={labelCls}>
                  Ano <span className="text-red-500">*</span>
                </label>
                <StringSingleSelectDropdown
                  value={String(form.paymentYear || '')}
                  onChange={(v) => setForm({ ...form, paymentYear: parseInt(v, 10) })}
                  options={
                    form.paymentYear &&
                    !YEAR_SELECT_OPTIONS.some((opt) => opt.value === String(form.paymentYear))
                      ? [
                          {
                            value: String(form.paymentYear),
                            label: String(form.paymentYear),
                          },
                          ...YEAR_SELECT_OPTIONS,
                        ]
                      : YEAR_SELECT_OPTIONS
                  }
                  allowEmpty={false}
                  disableSearch
                />
              </div>
              <div>
                <label className={labelCls}>
                  Status <span className="text-red-500">*</span>
                </label>
                <StringSingleSelectDropdown
                  value={form.status}
                  onChange={(v) => setForm({ ...form, status: v as FinancialControlStatus })}
                  options={STATUS_SELECT_OPTIONS}
                  allowEmpty={false}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={labelCls}>
                  O.S. <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={form.osCode}
                  onChange={(e) => setForm({ ...form, osCode: e.target.value })}
                  placeholder="Informe a O.S."
                  autoComplete="off"
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>
                  Fornecedor <span className="text-red-500">*</span>
                </label>
                <SingleSelectSearchDropdown
                  value={form.supplierName}
                  onChange={(supplierName) => setForm({ ...form, supplierName })}
                  options={supplierOptions}
                  placeholder="Selecione o fornecedor"
                  searchPlaceholder="Pesquisar fornecedor..."
                  emptyOptionsMessage="Nenhum fornecedor cadastrado."
                  emptySearchMessage="Nenhum fornecedor encontrado."
                  allowEmpty={false}
                  noFocusRing
                  className="w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <label className={labelCls}>
                  NF <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={form.nfNumber}
                  onChange={(e) => setForm({ ...form, nfNumber: e.target.value })}
                  placeholder="Informe a NF"
                  autoComplete="off"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>
                  Parcela <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={form.parcelNumber}
                  onChange={(e) => setForm({ ...form, parcelNumber: e.target.value })}
                  placeholder="Informe a parcela"
                  autoComplete="off"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>
                  O.C. <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={form.ocNumber}
                  onChange={(e) => setForm({ ...form, ocNumber: e.target.value })}
                  placeholder="Informe a O.C."
                  autoComplete="off"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Boleto</label>
                <BoletoToggle value={form.boleto} onChange={(v) => setForm({ ...form, boleto: v })} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={labelCls}>
                  Data de Emissão <span className="text-red-500">*</span>
                </label>
                <DatePickerField
                  value={form.emissionDate}
                  onChange={(emissionDate) => setForm({ ...form, emissionDate })}
                  placeholder="dd/mm/aaaa"
                  noFocusRing
                  aria-label="Data de Emissão"
                  className="w-full"
                />
              </div>
              <div>
                <label className={labelCls}>
                  Data de Vencimento <span className="text-red-500">*</span>
                </label>
                <DatePickerField
                  value={form.dueDate}
                  onChange={(dueDate) => setForm({ ...form, dueDate })}
                  placeholder="dd/mm/aaaa"
                  noFocusRing
                  aria-label="Data de Vencimento"
                  className="w-full"
                />
              </div>
              <div>
                <label className={labelCls}>
                  Data de Pagamento <span className="text-red-500">*</span>
                </label>
                <DatePickerField
                  value={form.paidDate}
                  onChange={(paidDate) => setForm({ ...form, paidDate })}
                  placeholder="dd/mm/aaaa"
                  noFocusRing
                  aria-label="Data de Pagamento"
                  className="w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>
                  Valor Original <span className="text-red-500">*</span>
                </label>
                <CurrencyInput
                  value={form.originalValue}
                  onChange={(v) => setForm({ ...form, originalValue: v })}
                />
              </div>
              <div>
                <label className={labelCls}>
                  Valor Final <span className="text-red-500">*</span>
                </label>
                <CurrencyInput
                  value={form.finalValue}
                  onChange={(v) => setForm({ ...form, finalValue: v })}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Observação</label>
              <textarea
                value={form.receivedNote}
                onChange={(e) => setForm({ ...form, receivedNote: e.target.value })}
                placeholder="Observações adicionais (opcional)"
                rows={3}
                autoComplete="off"
                className={`${inputCls} resize-y`}
              />
            </div>

            <div>
              <label className={labelCls}>Anexar arquivos</label>
              <FinancialControlAttachmentsField
                files={form.attachments}
                uploading={uploadingAttachments}
                disabled={isSaving}
                onFilesSelect={async (files) => {
                  if (!files.length) return;
                  setUploadingAttachments(true);
                  try {
                    const uploaded = await uploadFinancialControlAttachments(files);
                    setForm((prev) => ({
                      ...prev,
                      attachments: [...prev.attachments, ...uploaded],
                    }));
                    toast.success(
                      uploaded.length > 1 ? `${uploaded.length} arquivos enviados` : 'Arquivo enviado'
                    );
                  } catch (e: unknown) {
                    const err = e as { response?: { data?: { message?: string } }; message?: string };
                    toast.error(err.response?.data?.message || err.message || 'Não foi possível enviar o arquivo');
                  } finally {
                    setUploadingAttachments(false);
                  }
                }}
                onRemove={(index) =>
                  setForm((prev) => ({
                    ...prev,
                    attachments: prev.attachments.filter((_, i) => i !== index),
                  }))
                }
              />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingEntry ? 'Salvar alterações' : 'Criar lançamento'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        isOpen={confirmCreateOpen}
        onClose={() => {
          if (!createMutation.isPending) setConfirmCreateOpen(false);
        }}
        confirmBeforeClose={false}
      title="Confirmar lançamento"
        size="sm"
        elevated
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Deseja mesmo criar o lançamento para{' '}
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {selectedConsorcioLabel}
            </span>
            ?
          </p>
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-2 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setConfirmCreateOpen(false)}
              disabled={createMutation.isPending}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-60 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submitPayload}
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
