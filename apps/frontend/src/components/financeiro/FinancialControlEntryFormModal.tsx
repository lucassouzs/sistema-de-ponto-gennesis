'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import api from '@/lib/api';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  MONTHS_PT,
  STATUS_OPTIONS,
  buildInitialForm,
  entryToForm,
  formToPayload,
  type EntryFormState,
  type FinancialControlEntry,
} from '@/lib/financialControlEntry';
import {
  FINANCIAL_CONTROL_CONSORCIO_OPTIONS,
  FINANCIAL_CONTROL_OC_DEFAULT_CONSORCIO,
  buildQuickLaunchPayload,
  financialControlSupplierSelectOption,
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

type SupplierOption = {
  id: string;
  name: string;
  tradeName?: string | null;
  code?: string | null;
  isActive?: boolean;
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
    const formatted = number.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    onChange(formatted);
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
          className={`w-10 h-6 rounded-full transition-colors ${isYes ? 'bg-red-600' : 'bg-gray-300 dark:bg-gray-600'}`}
        />
        <div
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            isYes ? 'translate-x-4' : ''
          }`}
        />
      </div>
      <span className="text-sm text-gray-700 dark:text-gray-300">{isYes ? 'Sim' : 'Não'}</span>
    </label>
  );
}

export type FinancialControlEntryFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Formulário inicial (criação). Ignorado se `editingEntry` estiver definido. */
  initialForm?: EntryFormState;
  editingEntry?: FinancialControlEntry | null;
  /** Impede alterar o número da OC (abertura a partir da OC). */
  lockOcNumber?: boolean;
  title?: string;
  onSuccess?: () => void;
  /** Resumo automático sem campos editáveis (lançamento a partir da OC). */
  simplifiedFromOc?: boolean;
};

export function FinancialControlEntryFormModal({
  isOpen,
  onClose,
  initialForm,
  editingEntry = null,
  lockOcNumber = false,
  title,
  onSuccess,
  simplifiedFromOc = false,
}: FinancialControlEntryFormModalProps) {
  const queryClient = useQueryClient();
  const now = new Date();
  const [form, setForm] = useState<EntryFormState>(() =>
    initialForm ?? buildInitialForm(now.getMonth() + 1, now.getFullYear())
  );
  const [interestValue, setInterestValue] = useState('');
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
    if (editingEntry) {
      setForm(entryToForm(editingEntry));
    } else if (initialForm) {
      setForm(
        showQuickLaunch
          ? { ...initialForm, consorcio: FINANCIAL_CONTROL_OC_DEFAULT_CONSORCIO }
          : initialForm
      );
    } else {
      setForm(
        buildInitialForm(
          now.getMonth() + 1,
          now.getFullYear(),
          showQuickLaunch ? FINANCIAL_CONTROL_OC_DEFAULT_CONSORCIO : ''
        )
      );
    }
  }, [isOpen, editingEntry, initialForm, showQuickLaunch]);

  const createMutation = useMutation({
    mutationFn: async (payload: ReturnType<typeof formToPayload>) => {
      const res = await api.post('/financial-control', payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Lançamento criado com sucesso');
      // Só refresca queries de vínculo OC (aba Pagamento); lista mensal fica stale sem forçar refetch.
      void queryClient.invalidateQueries({ queryKey: ['financial-control-by-oc'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-control-has-entry'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-control-batch-by-oc'] });
      void queryClient.invalidateQueries({
        queryKey: ['financial-control'],
        refetchType: 'active',
      });
      onSuccess?.();
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      toast.error(err?.response?.data?.message || err?.message || 'Erro ao criar lançamento');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ReturnType<typeof formToPayload> }) => {
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
      onSuccess?.();
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      toast.error(err?.response?.data?.message || err?.message || 'Erro ao atualizar lançamento');
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formForPayload =
      showQuickLaunch && !editingEntry
        ? { ...form, consorcio: FINANCIAL_CONTROL_OC_DEFAULT_CONSORCIO }
        : form;
    if (!editingEntry && formForPayload.consorcio !== 'brasilia' && formForPayload.consorcio !== 'hub') {
      toast.error('Selecione o consórcio do lançamento');
      return;
    }
    try {
      const payload =
        showQuickLaunch && !editingEntry
          ? buildQuickLaunchPayload(formForPayload, interestValue)
          : formToPayload(formForPayload);
      if (editingEntry) {
        updateMutation.mutate({ id: editingEntry.id, payload });
      } else {
        createMutation.mutate(payload);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o lançamento');
    }
  };

  const modalTitle = title ?? (editingEntry ? 'Editar Lançamento' : 'Novo Lançamento');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size={showQuickLaunch ? 'md' : 'xl'}>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <StringSingleSelectDropdown
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v as EntryFormState['status'] })}
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
              placeholder="Informe a O.S."
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div className="sm:col-span-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Fornecedor
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
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              NF
            </label>
            <input
              type="text"
              value={form.nfNumber}
              onChange={(e) => setForm({ ...form, nfNumber: e.target.value })}
              placeholder="Informe a NF"
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
              placeholder="Informe a parcela"
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
              readOnly={lockOcNumber}
              autoComplete="off"
              className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white ${
                lockOcNumber ? 'bg-gray-100 dark:bg-gray-700/60 cursor-not-allowed' : ''
              }`}
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Data de Vencimento
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Data de Pagamento
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Valor Original
            </label>
            <CurrencyInput
              value={form.originalValue}
              onChange={(v) => setForm({ ...form, originalValue: v })}
            />
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
            placeholder="Observações adicionais (opcional)"
            rows={3}
            autoComplete="off"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-gray-800 dark:text-white resize-y"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Anexar arquivos
          </label>
          <FinancialControlAttachmentsField
            files={form.attachments || []}
            uploading={uploadingAttachments}
            onFilesSelect={async (files) => {
              if (!files.length) return;
              setUploadingAttachments(true);
              try {
                const uploaded = await uploadFinancialControlAttachments(files);
                setForm((prev) => ({
                  ...prev,
                  attachments: [...(prev.attachments || []), ...uploaded],
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
                attachments: (prev.attachments || []).filter((_, i) => i !== index),
              }))
            }
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
