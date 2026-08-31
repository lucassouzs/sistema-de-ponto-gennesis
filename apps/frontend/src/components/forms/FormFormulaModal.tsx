'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import {
  FORM_FORMULA_OP_LABELS,
  filterFormulaSourceQuestions,
  formulaResultFormat,
  questionHasFormula,
} from '@/lib/formFormula';
import type {
  FormFieldFormula,
  FormFieldFormulaOp,
  FormQuestion,
} from '@/components/forms/formStructureTypes';

type Props = {
  isOpen: boolean;
  question: FormQuestion | null;
  allQuestions: FormQuestion[];
  onClose: () => void;
  onSave: (formula: FormFieldFormula | null) => void;
};

const FORMULA_OP_OPTIONS = (Object.keys(FORM_FORMULA_OP_LABELS) as FormFieldFormulaOp[]).map(
  (key) => ({
    value: key,
    label: FORM_FORMULA_OP_LABELS[key],
  }),
);

export function FormFormulaModal({
  isOpen,
  question,
  allQuestions,
  onClose,
  onSave,
}: Props) {
  const [op, setOp] = useState<FormFieldFormulaOp>('sum');
  const [sourceIds, setSourceIds] = useState<string[]>(['', '']);

  const sourceOptions = useMemo(
    () =>
      filterFormulaSourceQuestions(question, allQuestions).map((q) => ({
        value: q.id,
        label: q.title?.trim() || 'Campo sem título',
      })),
    [allQuestions, question],
  );

  const allowedSourceIds = useMemo(
    () => new Set(sourceOptions.map((opt) => opt.value)),
    [sourceOptions],
  );

  useEffect(() => {
    if (!isOpen || !question) return;
    const f = question.formula;
    setOp(f?.op ?? 'sum');
    if (f?.sourceIds?.length) {
      const sanitized = f.sourceIds.filter((id) => allowedSourceIds.has(id));
      setSourceIds(
        f.op === 'sum' || f.op === 'multiply'
          ? sanitized.length
            ? [...sanitized, '']
            : ['', '']
          : sanitized.length >= 2
            ? sanitized.slice(0, 2)
            : [sanitized[0] ?? '', ''],
      );
    } else {
      setSourceIds(['', '']);
    }
  }, [isOpen, question, allowedSourceIds]);

  const needsTwoFields = op === 'subtract' || op === 'divide';
  const canAddMore = op === 'sum' || op === 'multiply';
  const validSources =
    sourceIds.filter((id) => id && allowedSourceIds.has(id)).length >=
    (needsTwoFields ? 2 : 1);

  const handleSave = () => {
    const ids = sourceIds
      .map((id) => id.trim())
      .filter((id) => id && allowedSourceIds.has(id));
    if (needsTwoFields && ids.length < 2) return;
    if (!needsTwoFields && ids.length < 1) return;
    onSave({
      op,
      sourceIds: needsTwoFields ? ids.slice(0, 2) : ids,
      resultFormat: question ? formulaResultFormat(question) : 'number',
    });
    onClose();
  };

  const fieldLabel =
    question?.type === 'valor'
      ? 'valor (R$)'
      : question?.type === 'percent'
        ? 'porcentagem (%)'
        : 'número';

  const emptySourcesMessage =
    question?.type === 'valor'
      ? 'Adicione outros campos de valor (R$) antes de configurar a fórmula.'
      : question?.type === 'number'
        ? 'Adicione outros campos de número antes de configurar a fórmula.'
        : 'Adicione outros campos de número, valor ou porcentagem antes de configurar a fórmula.';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configurar fórmula" size="md">
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-indigo-100 bg-indigo-50/80 px-4 py-3 dark:border-indigo-900/50 dark:bg-indigo-950/30">
          <Calculator className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <p className="text-sm text-indigo-900 dark:text-indigo-100">
            Este campo de {fieldLabel} será calculado automaticamente com base nos campos
            selecionados e não poderá ser editado no preenchimento.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Operação
          </label>
          <StringSingleSelectDropdown
            value={op}
            onChange={(next) => {
              const operation = next as FormFieldFormulaOp;
              setOp(operation);
              if (operation === 'subtract' || operation === 'divide') {
                setSourceIds((prev) => [prev[0] ?? '', prev[1] ?? '']);
              }
            }}
            options={FORMULA_OP_OPTIONS}
            allowEmpty={false}
            disableSearch
            matchTriggerWidth
          />
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Campos de origem</p>
          {sourceOptions.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">{emptySourcesMessage}</p>
          ) : (
            sourceIds.map((sourceId, index) => (
              <div key={`src-${index}`} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-gray-500">
                  {needsTwoFields ? (index === 0 ? 'De' : 'Para') : `Campo ${index + 1}`}
                </span>
                <StringSingleSelectDropdown
                  value={sourceId}
                  onChange={(next) => {
                    const updated = [...sourceIds];
                    updated[index] = next;
                    setSourceIds(updated);
                  }}
                  options={sourceOptions}
                  placeholder="Selecionar campo…"
                  emptyOptionLabel="Selecionar campo…"
                  emptyOptionsMessage="Nenhum campo disponível."
                  matchTriggerWidth
                  disableSearch={sourceOptions.length <= 8}
                  className="min-w-0 flex-1"
                />
                {canAddMore && index === sourceIds.length - 1 && sourceIds.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setSourceIds((prev) => prev.slice(0, -1))}
                    className="shrink-0 text-xs font-medium text-red-600 hover:underline"
                  >
                    Remover
                  </button>
                ) : null}
              </div>
            ))
          )}
          {canAddMore && sourceOptions.length > 0 ? (
            <button
              type="button"
              onClick={() => setSourceIds((prev) => [...prev, ''])}
              className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
            >
              + Adicionar campo
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          {questionHasFormula(question) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="!border-red-200 !text-red-600 hover:!bg-red-50"
              onClick={() => {
                onSave(null);
                onClose();
              }}
            >
              Remover fórmula
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="!bg-red-600 hover:!bg-red-700 active:!bg-red-800"
              disabled={!validSources}
              onClick={handleSave}
            >
              Salvar fórmula
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
