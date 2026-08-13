'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import {
  MESES,
  STATUS_ORCAMENTO_OPCOES,
  OUTRO_STATUS,
  STATUS_EXECUCAO_OPCOES,
  RVI_RVF_OPCOES,
  emptyForm,
  pleitoToForm,
  formToPayload,
  getLatestBudgetFromForm,
  parseBudgetToNumber,
  currencyChange,
  type PleitoFormData,
} from '@/lib/pleitoForm';
import {
  budgetStatusPillClass,
  executionStatusPillClass,
} from '@/lib/pleitoStatusStyles';

const OS_FORM_LABEL_CLS =
  'mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400';

const CREATION_MONTH_SELECT_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Selecione' },
  ...MESES.map((m) => ({ value: m.value, label: m.label })),
]);
const CREATION_YEAR_BASE = new Date().getFullYear();
const CREATION_YEAR_RANGE = Array.from({ length: 16 }, (_, i) => CREATION_YEAR_BASE - 6 + i);
const CREATION_YEAR_SELECT_OPTIONS = labeledToSelectOptions(
  CREATION_YEAR_RANGE.map((y) => ({ value: String(y), label: String(y) }))
);
const BUDGET_STATUS_SELECT_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Selecione' },
  ...STATUS_ORCAMENTO_OPCOES.map((op) => ({ value: op, label: op })),
  { value: OUTRO_STATUS, label: 'Outro (cadastrar novo)' },
]);
const EXECUTION_STATUS_SELECT_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Selecione' },
  ...STATUS_EXECUCAO_OPCOES.map((op) => ({ value: op, label: op })),
]);
const RVI_RVF_SELECT_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Selecione' },
  ...RVI_RVF_OPCOES.map((op) => ({ value: op, label: op })),
]);

const BUDGET_REVISION_FIELDS = [
  { key: 'budgetAmount2', label: 'Orçamento R02' },
  { key: 'budgetAmount3', label: 'Orçamento R03' },
  { key: 'budgetAmount4', label: 'Orçamento R04' },
] as const;

function countFilledBudgetRevisions(f: Record<string, string>): number {
  let lastFilled = 0;
  for (let i = 0; i < BUDGET_REVISION_FIELDS.length; i++) {
    if (parseBudgetToNumber(f[BUDGET_REVISION_FIELDS[i].key] || '') !== 0) {
      lastFilled = i + 1;
    }
  }
  return lastFilled;
}

function OsFormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="mb-4 border-b border-gray-200 pb-3 dark:border-gray-700">
        <h4 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">
          {title}
        </h4>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {description}
          </p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  form,
  setForm,
  type = 'text',
  textarea = false,
  required = false,
  className = '',
}: {
  label: string;
  name: string;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  type?: string;
  textarea?: boolean;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className={OS_FORM_LABEL_CLS}>
        {label}
        {required ? ' *' : ''}
      </label>
      {textarea ? (
        <textarea
          rows={3}
          value={form[name] || ''}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
          className={FORM_FIELD_TEXTAREA_CLS}
          required={required}
        />
      ) : (
        <input
          type={type}
          value={form[name] || ''}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
          className={FORM_FIELD_INPUT_CLS}
          required={required}
        />
      )}
    </div>
  );
}

interface PleitoFormModalProps {
  contractId: string;
  pleitoToEdit?: PleitoFormData & { id: string };
  onClose: () => void;
  onSuccess: () => void;
}

export function PleitoFormModal({
  contractId,
  pleitoToEdit,
  onClose,
  onSuccess,
}: PleitoFormModalProps) {
  const isEdit = !!pleitoToEdit;
  const [form, setForm] = useState(() => (pleitoToEdit ? pleitoToForm(pleitoToEdit) : emptyForm()));
  const [visibleBudgetRevisions, setVisibleBudgetRevisions] = useState(() =>
    countFilledBudgetRevisions(pleitoToEdit ? pleitoToForm(pleitoToEdit) : emptyForm())
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const closeForm = useCallback(() => {
    onClose();
  }, [onClose]);

  const { requestClose, confirmUi } = useModalCloseConfirm(closeForm);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.classList.remove('modal-open');
    };
  }, [requestClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.serviceDescription.trim()) {
      toast.error('Descrição do serviço é obrigatória');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = formToPayload(form, contractId);
      if (isEdit && pleitoToEdit) {
        await api.patch(`/pleitos/${pleitoToEdit.id}`, payload);
        toast.success('Ordem de serviço atualizada com sucesso!');
      } else {
        await api.post(`/contracts/${contractId}/pleitos`, payload);
        toast.success('Ordem de serviço cadastrada com sucesso!');
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Erro ao salvar'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-black/50" onClick={requestClose} aria-hidden />
      <div
        className="relative my-auto flex max-h-[min(92dvh,calc(100dvh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="os-form-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-2">
          <h3
            id="os-form-modal-title"
            className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            {isEdit ? 'Editar Ordem de Serviço' : 'Nova Ordem de Serviço'}
          </h3>
          <button
            type="button"
            onClick={requestClose}
            className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={submit}
          className="flex min-h-0 flex-1 flex-col [&_*:focus]:outline-none [&_*:focus]:ring-0 [&_*:focus-visible]:outline-none [&_*:focus-visible]:ring-0"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <OsFormSection title="Identificação e datas">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex gap-3">
                  <div className="min-w-0 flex-1">
                    <label className={OS_FORM_LABEL_CLS}>Mês de criação</label>
                    <StringSingleSelectDropdown
                      value={form.creationMonth || ''}
                      onChange={(v) => setForm({ ...form, creationMonth: v })}
                      options={CREATION_MONTH_SELECT_OPTIONS}
                      allowEmpty={false}
                    />
                  </div>
                  <div className="w-32 shrink-0">
                    <label className={OS_FORM_LABEL_CLS}>Ano</label>
                    <StringSingleSelectDropdown
                      value={form.creationYear || ''}
                      onChange={(v) => setForm({ ...form, creationYear: v })}
                      options={
                        form.creationYear &&
                        !CREATION_YEAR_RANGE.includes(Number(form.creationYear))
                          ? labeledToSelectOptions([
                              { value: form.creationYear, label: form.creationYear },
                              ...CREATION_YEAR_RANGE.map((y) => ({
                                value: String(y),
                                label: String(y),
                              })),
                            ])
                          : CREATION_YEAR_SELECT_OPTIONS
                      }
                      allowEmpty={false}
                    />
                  </div>
                </div>
                <div>
                  <label className={OS_FORM_LABEL_CLS}>Data início</label>
                  <DatePickerField
                    value={form.startDate || ''}
                    onChange={(startDate) => setForm({ ...form, startDate })}
                    placeholder="dd/mm/aaaa"
                    noFocusRing
                    aria-label="Data início"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className={OS_FORM_LABEL_CLS}>Data término</label>
                  <DatePickerField
                    value={form.endDate || ''}
                    onChange={(endDate) => setForm({ ...form, endDate })}
                    placeholder="dd/mm/aaaa"
                    noFocusRing
                    aria-label="Data término"
                    className="w-full"
                  />
                </div>
                <Field label="OS / SE" name="divSe" form={form} setForm={setForm} />
                <div>
                  <label className={OS_FORM_LABEL_CLS}>Nº pasta</label>
                  <input
                    type="number"
                    min={0}
                    value={form.folderNumber || ''}
                    onChange={(e) => setForm({ ...form, folderNumber: e.target.value })}
                    placeholder="Nº"
                    className={FORM_FIELD_INPUT_CLS}
                  />
                </div>
                <Field label="Lote" name="lot" form={form} setForm={setForm} />
              </div>
            </OsFormSection>

            <OsFormSection title="Serviço e local">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field
                  label="Descrição do serviço"
                  name="serviceDescription"
                  form={form}
                  setForm={setForm}
                  textarea
                  required
                  className="md:col-span-2"
                />
                <Field label="Local" name="location" form={form} setForm={setForm} />
                <Field label="Unidade" name="unit" form={form} setForm={setForm} />
              </div>
            </OsFormSection>

            <OsFormSection
              title="Orçamento e status"
              description="Acumulado faturado, status de faturamento (%) e pendente são calculados automaticamente conforme o faturamento cadastrado para esta OS."
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={OS_FORM_LABEL_CLS}>Status orçamento</label>
                  <StringSingleSelectDropdown
                    value={form.budgetStatus || ''}
                    onChange={(v) => setForm({ ...form, budgetStatus: v })}
                    options={BUDGET_STATUS_SELECT_OPTIONS}
                    allowEmpty={false}
                    className={
                      form.budgetStatus && form.budgetStatus !== ''
                        ? form.budgetStatus === OUTRO_STATUS
                          ? budgetStatusPillClass(form.budgetStatusCustom || null)
                          : budgetStatusPillClass(form.budgetStatus)
                        : ''
                    }
                  />
                  {form.budgetStatus === OUTRO_STATUS ? (
                    <input
                      type="text"
                      value={form.budgetStatusCustom || ''}
                      onChange={(e) => setForm({ ...form, budgetStatusCustom: e.target.value })}
                      placeholder="Digite o novo status"
                      className={`mt-2 ${FORM_FIELD_INPUT_CLS}`}
                    />
                  ) : null}
                </div>
                <div>
                  <label className={OS_FORM_LABEL_CLS}>Status execução</label>
                  <StringSingleSelectDropdown
                    value={form.executionStatus || ''}
                    onChange={(v) => setForm({ ...form, executionStatus: v })}
                    options={EXECUTION_STATUS_SELECT_OPTIONS}
                    allowEmpty={false}
                    className={
                      form.executionStatus && form.executionStatus !== ''
                        ? executionStatusPillClass(form.executionStatus)
                        : ''
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={OS_FORM_LABEL_CLS}>Orçamento</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 dark:text-gray-400">
                      R$
                    </span>
                    <div className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-300">
                      {getLatestBudgetFromForm(form) || '—'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={OS_FORM_LABEL_CLS}>Orçamento R01</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 dark:text-gray-400">
                      R$
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.budgetAmount1 || ''}
                      onChange={currencyChange(form, setForm, 'budgetAmount1')}
                      placeholder="0,00"
                      className={`${FORM_FIELD_INPUT_CLS} pl-10`}
                    />
                  </div>
                </div>

                {BUDGET_REVISION_FIELDS.slice(0, visibleBudgetRevisions).map(({ key, label }, index) => (
                  <div key={key}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {label}
                      </label>
                      {index === visibleBudgetRevisions - 1 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setForm((prev) => ({ ...prev, [key]: '' }));
                            setVisibleBudgetRevisions((n) => Math.max(0, n - 1));
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          aria-label={`Remover ${label}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remover
                        </button>
                      ) : null}
                    </div>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 dark:text-gray-400">
                        R$
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form[key] || ''}
                        onChange={currencyChange(form, setForm, key)}
                        placeholder="0,00"
                        className={`${FORM_FIELD_INPUT_CLS} pl-10`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {visibleBudgetRevisions < BUDGET_REVISION_FIELDS.length ? (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleBudgetRevisions((n) => Math.min(BUDGET_REVISION_FIELDS.length, n + 1))
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-700/40"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar {BUDGET_REVISION_FIELDS[visibleBudgetRevisions].label}
                </button>
              ) : null}
            </OsFormSection>

            <OsFormSection title="Equipe e relatórios">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={OS_FORM_LABEL_CLS}>RVI</label>
                  <StringSingleSelectDropdown
                    value={form.pv || ''}
                    onChange={(v) => setForm({ ...form, pv: v })}
                    options={RVI_RVF_SELECT_OPTIONS}
                    allowEmpty={false}
                  />
                </div>
                <div>
                  <label className={OS_FORM_LABEL_CLS}>RVF</label>
                  <StringSingleSelectDropdown
                    value={form.ipi || ''}
                    onChange={(v) => setForm({ ...form, ipi: v })}
                    options={RVI_RVF_SELECT_OPTIONS}
                    allowEmpty={false}
                  />
                </div>
                <Field
                  label="Feedback Relatórios"
                  name="reportsBilling"
                  form={form}
                  setForm={setForm}
                  className="md:col-span-2"
                />
                <Field label="Engenheiro" name="engineer" form={form} setForm={setForm} />
                <Field label="Encarregado" name="supervisor" form={form} setForm={setForm} />
              </div>
            </OsFormSection>
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700">
            <button
              type="button"
              onClick={requestClose}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
            >
              {isSubmitting ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar Ordem de Serviço'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(
    <>
      {modalContent}
      {confirmUi}
    </>,
    document.body
  );
}
