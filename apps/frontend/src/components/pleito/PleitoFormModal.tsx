'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
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
  currencyChange,
  type PleitoFormData
} from '@/lib/pleitoForm';
import {
  budgetStatusPillClass,
  executionStatusPillClass,
  pleitoStatusSelectBase
} from '@/lib/pleitoStatusStyles';

function Input({
  label,
  name,
  form,
  setForm,
  type = 'text',
  textarea = false,
  step
}: {
  label: string;
  name: string;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  type?: string;
  textarea?: boolean;
  step?: string;
}) {
  const base = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm';
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      {textarea ? (
        <textarea rows={3} value={form[name] || ''} onChange={(e) => setForm({ ...form, [name]: e.target.value })} className={base} />
      ) : (
        <input type={type} step={step} value={form[name] || ''} onChange={(e) => setForm({ ...form, [name]: e.target.value })} className={base} />
      )}
    </div>
  );
}

interface PleitoFormModalProps {
  contractId: string;
  contractDisplay?: string; // Ex: "Contrato X - nº 123" (pré-preenchido, não editável)
  /** Dados do pleito vindos da API (mesmo formato esperado por `pleitoToForm`). */
  pleitoToEdit?: PleitoFormData & { id: string };
  onClose: () => void;
  onSuccess: () => void;
}

export function PleitoFormModal({ contractId, contractDisplay, pleitoToEdit, onClose, onSuccess }: PleitoFormModalProps) {
  const isEdit = !!pleitoToEdit;
  const [form, setForm] = useState(() => (pleitoToEdit ? pleitoToForm(pleitoToEdit) : emptyForm()));
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        toast.success('Ordem de Serviço atualizado com sucesso!');
      } else {
        await api.post(`/contracts/${contractId}/pleitos`, payload);
        toast.success('Ordem de Serviço cadastrado com sucesso!');
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erro ao salvar');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b bg-white dark:bg-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{isEdit ? 'Editar Ordem de Serviço' : 'Novo Ordem de Serviço'}</h3>
          <button onClick={onClose} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-6">
          {contractDisplay && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Contrato</label>
              <div className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 text-sm cursor-not-allowed">
                {contractDisplay}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Campo definido automaticamente pelo contrato em que está inserindo</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Mês de criação</label>
                <select
                  value={form.creationMonth || ''}
                  onChange={(e) => setForm({ ...form, creationMonth: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                >
                  <option value="">Selecione</option>
                  {MESES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ano</label>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={form.creationYear || ''}
                  onChange={(e) => setForm({ ...form, creationYear: e.target.value })}
                  placeholder="Ano"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                />
              </div>
            </div>
            <Input label="Data início" name="startDate" form={form} setForm={setForm} type="date" />
            <Input label="Data término" name="endDate" form={form} setForm={setForm} type="date" />
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status orçamento</label>
              <select
                value={form.budgetStatus || ''}
                onChange={(e) => setForm({ ...form, budgetStatus: e.target.value })}
                className={
                  form.budgetStatus && form.budgetStatus !== ''
                    ? `${pleitoStatusSelectBase} ${
                        form.budgetStatus === OUTRO_STATUS
                          ? budgetStatusPillClass(form.budgetStatusCustom || null)
                          : budgetStatusPillClass(form.budgetStatus)
                      }`
                    : 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm'
                }
              >
                <option value="">Selecione</option>
                {STATUS_ORCAMENTO_OPCOES.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
                <option value={OUTRO_STATUS}>Outro (cadastrar novo)</option>
              </select>
              {form.budgetStatus === OUTRO_STATUS && (
                <input
                  type="text"
                  value={form.budgetStatusCustom || ''}
                  onChange={(e) => setForm({ ...form, budgetStatusCustom: e.target.value })}
                  placeholder="Digite o novo status"
                  className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                />
              )}
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nº pasta</label>
              <input
                type="number"
                min={0}
                value={form.folderNumber || ''}
                onChange={(e) => setForm({ ...form, folderNumber: e.target.value })}
                placeholder="Nº"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
              />
            </div>
            <Input label="Lote" name="lot" form={form} setForm={setForm} />
            <Input label="OS / SE" name="divSe" form={form} setForm={setForm} />
            <Input label="Local" name="location" form={form} setForm={setForm} />
            <Input label="Unidade" name="unit" form={form} setForm={setForm} />
            <div className="md:col-span-2 lg:col-span-3">
              <Input label="Descrição do serviço *" name="serviceDescription" form={form} setForm={setForm} textarea />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Orçamento (somente leitura — valor mais atual)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium text-sm">R$</span>
                <div className="w-full pl-12 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 text-sm">
                  {getLatestBudgetFromForm(form) || '-'}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status execução</label>
              <select
                value={form.executionStatus || ''}
                onChange={(e) => setForm({ ...form, executionStatus: e.target.value })}
                className={
                  form.executionStatus && form.executionStatus !== ''
                    ? `${pleitoStatusSelectBase} ${executionStatusPillClass(form.executionStatus)}`
                    : 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm'
                }
              >
                <option value="">Selecione</option>
                {STATUS_EXECUCAO_OPCOES.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 col-span-full">
              Acumulado faturado, Status faturamento (%) e Pendente faturamento são calculados automaticamente conforme o faturamento cadastrado para esta OS.
            </p>
            {[
              { key: 'budgetAmount1', label: 'Orçamento R01' },
              { key: 'budgetAmount2', label: 'Orçamento R02' },
              { key: 'budgetAmount3', label: 'Orçamento R03' },
              { key: 'budgetAmount4', label: 'Orçamento R04' }
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium text-sm">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form[key] || ''}
                    onChange={currencyChange(form, setForm, key)}
                    placeholder="0,00"
                    className="w-full pl-12 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">RVI</label>
              <select
                value={form.pv || ''}
                onChange={(e) => setForm({ ...form, pv: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
              >
                <option value="">Selecione</option>
                {RVI_RVF_OPCOES.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">RVF</label>
              <select
                value={form.ipi || ''}
                onChange={(e) => setForm({ ...form, ipi: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
              >
                <option value="">Selecione</option>
                {RVI_RVF_OPCOES.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
            <Input label="Feedback Relatorios" name="reportsBilling" form={form} setForm={setForm} />
            <Input label="Engenheiro" name="engineer" form={form} setForm={setForm} />
            <Input label="Encarregado" name="supervisor" form={form} setForm={setForm} />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50">
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
