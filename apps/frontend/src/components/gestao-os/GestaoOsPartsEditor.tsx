'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { GestaoOsPartLine } from '@/app/ponto/sistema-gestao-os/gestaoOsTypes';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import { GESTAO_OS_FORM_LABEL_CLS } from '@/components/gestao-os/GestaoOsModalUi';

function newPart(): GestaoOsPartLine {
  return {
    id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    supplier: null,
    quantity: 1,
    unitCost: null,
    expectedAt: null,
    notes: null
  };
}

export function GestaoOsPartsEditor({
  parts,
  onChange,
  readOnly = false
}: {
  parts: GestaoOsPartLine[];
  onChange: (next: GestaoOsPartLine[]) => void;
  readOnly?: boolean;
}) {
  const total = parts.reduce(
    (sum, p) => sum + (p.unitCost ?? 0) * (Number(p.quantity) || 0),
    0
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className={GESTAO_OS_FORM_LABEL_CLS}>Peças / materiais</label>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => onChange([...parts, newPart()])}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar peça
          </button>
        ) : null}
      </div>

      {parts.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma peça informada.</p>
      ) : (
        <div className="space-y-3">
          {parts.map((part, idx) => (
            <div
              key={part.id}
              className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-6"
            >
              <div className="sm:col-span-2">
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Peça</label>
                <input
                  className={FORM_FIELD_INPUT_CLS}
                  value={part.name}
                  disabled={readOnly}
                  onChange={(e) => {
                    const next = [...parts];
                    next[idx] = { ...part, name: e.target.value };
                    onChange(next);
                  }}
                  placeholder="Ex.: filtro de ar"
                />
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Fornecedor</label>
                <input
                  className={FORM_FIELD_INPUT_CLS}
                  value={part.supplier ?? ''}
                  disabled={readOnly}
                  onChange={(e) => {
                    const next = [...parts];
                    next[idx] = { ...part, supplier: e.target.value || null };
                    onChange(next);
                  }}
                />
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Qtd</label>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  className={FORM_FIELD_INPUT_CLS}
                  value={part.quantity}
                  disabled={readOnly}
                  onChange={(e) => {
                    const next = [...parts];
                    next[idx] = { ...part, quantity: Number(e.target.value) || 1 };
                    onChange(next);
                  }}
                />
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Custo unit. (R$)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={FORM_FIELD_INPUT_CLS}
                  value={part.unitCost ?? ''}
                  disabled={readOnly}
                  onChange={(e) => {
                    const next = [...parts];
                    next[idx] = {
                      ...part,
                      unitCost: e.target.value === '' ? null : Number(e.target.value)
                    };
                    onChange(next);
                  }}
                />
              </div>
              <div>
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Previsão</label>
                <div className="flex gap-1">
                  <input
                    type="date"
                    className={FORM_FIELD_INPUT_CLS}
                    value={
                      part.expectedAt
                        ? new Date(part.expectedAt).toISOString().slice(0, 10)
                        : ''
                    }
                    disabled={readOnly}
                    onChange={(e) => {
                      const next = [...parts];
                      next[idx] = {
                        ...part,
                        expectedAt: e.target.value
                          ? new Date(`${e.target.value}T12:00:00`).toISOString()
                          : null
                      };
                      onChange(next);
                    }}
                  />
                  {!readOnly ? (
                    <button
                      type="button"
                      aria-label="Remover peça"
                      onClick={() => onChange(parts.filter((_, i) => i !== idx))}
                      className="rounded-md p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Total:{' '}
            {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
      )}
    </div>
  );
}
