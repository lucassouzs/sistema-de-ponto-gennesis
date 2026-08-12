'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Loader2, Minus, Paperclip, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  adjustCurrency,
  currencyDigitsToFormatted,
  emptyFichaDemandaForm,
  recordToForm,
  validateFichaDemandaForm,
  type FichaDemandaApprovalFormState,
  type FichaDemandaApprovalRecord,
} from '@/lib/fichaDemandaApproval';

interface UserOption {
  id: string;
  name: string;
}

interface ContractOption {
  id: string;
  name: string;
  number: string;
}

interface PleitoObraOption {
  id: string;
  location: string | null;
  serviceDescription: string;
}

const fieldClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-500';

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
      {children}
      {required ? <span className="text-red-500"> *</span> : null}
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="border-b border-gray-200 pb-2 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
      {children}
    </h4>
  );
}

function CurrencyStepperInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
      <div className="relative min-w-0 flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
          R$
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(currencyDigitsToFormatted(e.target.value))}
          placeholder="0,00"
          autoComplete="off"
          className="w-full bg-transparent py-2 pl-9 pr-3 text-right text-sm tabular-nums text-gray-900 focus:outline-none dark:text-gray-100"
        />
      </div>
      <div className="flex border-l border-gray-300 dark:border-gray-600">
        <button
          type="button"
          onClick={() => onChange(adjustCurrency(value, -100))}
          className="px-3 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          aria-label="Diminuir valor"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onChange(adjustCurrency(value, 100))}
          className="border-l border-gray-300 px-3 text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          aria-label="Aumentar valor"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SubSection({
  title,
  addLabel,
  onAdd,
  children,
}: {
  title: string;
  addLabel: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <SectionTitle>{title}</SectionTitle>
      {children}
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-2.5 text-sm font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 dark:border-gray-600 dark:text-red-400 dark:hover:border-red-800/60 dark:hover:bg-red-950/20"
      >
        <Plus className="h-4 w-4 shrink-0" />
        {addLabel}
      </button>
    </div>
  );
}

export type FichaDemandaApprovalFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  editingRecord?: FichaDemandaApprovalRecord | null;
  onSave: (form: FichaDemandaApprovalFormState) => void;
  isSaving?: boolean;
};

export function FichaDemandaApprovalFormModal({
  isOpen,
  onClose,
  editingRecord = null,
  onSave,
  isSaving = false,
}: FichaDemandaApprovalFormModalProps) {
  const [form, setForm] = useState<FichaDemandaApprovalFormState>(() => emptyFichaDemandaForm());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const closeForm = useCallback(() => {
    onClose();
  }, [onClose]);

  const { requestClose, confirmUi } = useModalCloseConfirm(closeForm, { isParentOpen: isOpen });

  useEffect(() => {
    if (!isOpen) return;
    if (editingRecord) {
      setForm(recordToForm(editingRecord));
    } else {
      setForm(emptyFichaDemandaForm());
    }
  }, [isOpen, editingRecord]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [isOpen, isSaving, onClose]);

  const { data: usersData } = useQuery({
    queryKey: ['users-fd-approval'],
    queryFn: async () => {
      const res = await api.get('/users', { params: { limit: 500, page: 1 } });
      return res.data;
    },
    enabled: isOpen,
  });

  const { data: contractsData } = useQuery({
    queryKey: ['contracts-fd-approval'],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500, page: 1 } });
      return res.data;
    },
    enabled: isOpen,
  });

  const { data: pleitosData, isLoading: loadingObras } = useQuery({
    queryKey: ['pleitos-fd-approval', form.contratoId],
    queryFn: async () => {
      const res = await api.get('/pleitos', {
        params: { contractId: form.contratoId, limit: 500, page: 1 },
      });
      return res.data;
    },
    enabled: isOpen && !!form.contratoId,
  });

  const users = useMemo(() => {
    const rows = (usersData?.data || usersData?.users || []) as UserOption[];
    return rows.filter((u) => u.id && u.name);
  }, [usersData]);

  const contracts = useMemo(() => {
    return ((contractsData?.data || []) as ContractOption[]).filter((c) => c.id);
  }, [contractsData]);

  const obras = useMemo(() => {
    const pleitos = (pleitosData?.data || []) as PleitoObraOption[];
    const seen = new Set<string>();
    const options: string[] = [];
    for (const p of pleitos) {
      const label = (p.location || p.serviceDescription || '').trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      options.push(label);
    }
    return options;
  }, [pleitosData]);

  const solicitanteSelectOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: '', label: 'Selecione o solicitante' },
        ...users.map((u) => ({ value: u.id, label: u.name })),
      ]),
    [users]
  );

  const contratoSelectOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: '', label: 'Selecione o contrato' },
        ...contracts.map((c) => ({
          value: c.id,
          label: `${c.number} — ${c.name}`,
        })),
      ]),
    [contracts]
  );

  const obraSelectOptions = useMemo(() => {
    const emptyLabel = !form.contratoId
      ? 'Selecione um contrato primeiro'
      : loadingObras
        ? 'Carregando obras...'
        : 'Selecione a obra';
    return labeledToSelectOptions([
      { value: '', label: emptyLabel },
      ...obras.map((obra) => ({ value: obra, label: obra })),
    ]);
  }, [form.contratoId, loadingObras, obras]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateFichaDemandaForm(form);
    if (error) {
      toast.error(error);
      return;
    }
    onSave(form);
  };

  const handleAnexoFile = (file: File | null) => {
    if (!file) return;
    setForm((prev) => ({
      ...prev,
      anexos: [...prev.anexos, { id: crypto.randomUUID(), name: file.name, url: undefined }],
    }));
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" aria-hidden onClick={isSaving ? undefined : requestClose} />
      <div className="relative z-[1101] flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {editingRecord ? 'Editar Ficha de Demanda' : 'Nova Ficha de Demanda'}
            </h3>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
              Preencha os dados para registro e aprovação da FD
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={isSaving}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          id="ficha-demanda-approval-form"
          onSubmit={handleSubmit}
          className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
          autoComplete="off"
        >
          <div className="space-y-6">
            <div className="space-y-4">
              <SectionTitle>Dados do movimento</SectionTitle>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel required>Num. mov. RM</FieldLabel>
                  <input
                    type="text"
                    value={form.numMovRm}
                    onChange={(e) => setForm({ ...form, numMovRm: e.target.value })}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <FieldLabel required>ID mov. RM</FieldLabel>
                  <input
                    type="text"
                    value={form.idMovRm}
                    onChange={(e) => setForm({ ...form, idMovRm: e.target.value })}
                    className={fieldClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel required>Código do pedido</FieldLabel>
                  <input
                    type="text"
                    value={form.codigoPedido}
                    onChange={(e) => setForm({ ...form, codigoPedido: e.target.value })}
                    className={fieldClass}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <SectionTitle>Vínculos</SectionTitle>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <FieldLabel required>Solicitante</FieldLabel>
                  <StringSingleSelectDropdown
                    value={form.solicitanteId}
                    onChange={(v) => setForm({ ...form, solicitanteId: v })}
                    options={solicitanteSelectOptions}
                    allowEmpty={false}
                  />
                </div>
                <div>
                  <FieldLabel required>Contrato</FieldLabel>
                  <StringSingleSelectDropdown
                    value={form.contratoId}
                    onChange={(v) => setForm({ ...form, contratoId: v, obra: '' })}
                    options={contratoSelectOptions}
                    allowEmpty={false}
                  />
                </div>
                <div>
                  <FieldLabel required>Obra</FieldLabel>
                  <StringSingleSelectDropdown
                    value={form.obra}
                    onChange={(v) => setForm({ ...form, obra: v })}
                    options={obraSelectOptions}
                    disabled={!form.contratoId || loadingObras}
                    allowEmpty={false}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <SectionTitle>Valores e identificação</SectionTitle>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FieldLabel required>Cód. ficha de demanda</FieldLabel>
                  <input
                    type="text"
                    value={form.codFichaDemanda}
                    onChange={(e) => setForm({ ...form, codFichaDemanda: e.target.value })}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <FieldLabel required>Faturamento estimado</FieldLabel>
                  <CurrencyStepperInput
                    value={form.faturamentoEstimado}
                    onChange={(faturamentoEstimado) => setForm({ ...form, faturamentoEstimado })}
                  />
                </div>
                <div>
                  <FieldLabel required>Custo estimado</FieldLabel>
                  <CurrencyStepperInput
                    value={form.custoEstimado}
                    onChange={(custoEstimado) => setForm({ ...form, custoEstimado })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <SectionTitle>Informações adicionais</SectionTitle>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <FieldLabel required>Observação</FieldLabel>
                  <textarea
                    rows={3}
                    value={form.observacao}
                    onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                    className={fieldClass}
                    placeholder="Descreva observações relevantes para a aprovação"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Data e hora</FieldLabel>
                    <div className="relative">
                      <input type="text" readOnly value={form.dataHora} className={`${fieldClass} pr-10`} />
                      <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    </div>
                  </div>
                  <div>
                    <FieldLabel required>Polo</FieldLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {(['DF', 'GO'] as const).map((polo) => {
                        const selected = form.polo === polo;
                        return (
                          <button
                            key={polo}
                            type="button"
                            onClick={() => setForm({ ...form, polo })}
                            className={`rounded-lg border py-2.5 text-sm font-semibold transition-colors ${
                              selected
                                ? 'border-red-600 bg-red-600 text-white'
                                : 'border-gray-300 bg-white text-gray-900 hover:border-red-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
                            }`}
                          >
                            {polo}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <SubSection title="Anexos" addLabel="Adicionar anexo" onAdd={() => fileInputRef.current?.click()}>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  handleAnexoFile(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
              {form.anexos.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum anexo adicionado.</p>
              ) : (
                <ul className="space-y-2">
                  {form.anexos.map((anexo) => (
                    <li
                      key={anexo.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900/40"
                    >
                      <span className="flex min-w-0 items-center gap-2 truncate text-gray-800 dark:text-gray-200">
                        <Paperclip className="h-4 w-4 shrink-0 text-gray-400" />
                        {anexo.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            anexos: prev.anexos.filter((a) => a.id !== anexo.id),
                          }))
                        }
                        className="shrink-0 rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        aria-label="Remover anexo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SubSection>
          </div>

          <div className="mt-6 flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-800 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : editingRecord ? (
                'Salvar alterações'
              ) : (
                'Salvar ficha'
              )}
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
