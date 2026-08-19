'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { GestaoOsPartLine } from '@/app/ponto/sistema-gestao-os/gestaoOsTypes';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import { GESTAO_OS_FORM_LABEL_CLS } from '@/components/gestao-os/GestaoOsModalUi';
import api from '@/lib/api';

function isoToYmd(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ymdToIsoNoon(ymd: string): string | null {
  if (!ymd) return null;
  const d = new Date(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(5, 7)) - 1,
    Number(ymd.slice(8, 10)),
    12,
    0,
    0,
    0
  );
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function newPart(): GestaoOsPartLine {
  return {
    id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    supplier: null,
    quantity: 1,
    unitCost: null,
    expectedAt: null,
    notes: null,
    materialId: null,
    stockDeductedAt: null
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
  const { data: materials = [] } = useQuery({
    queryKey: ['gestao-os-stock-materials'],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: Array<{ id: string; name: string; code?: string | null }>;
      }>('/gestao-os/stock-materials');
      return res.data?.data ?? [];
    }
  });
  const materialOptions = labeledToSelectOptions(
    materials.map((m) => ({
      value: m.id,
      label: m.code ? `${m.name} (${m.code})` : m.name
    }))
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
              className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-2"
            >
              <div>
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
              <div className="sm:col-span-2">
                <label className={GESTAO_OS_FORM_LABEL_CLS}>Material do estoque</label>
                <StringSingleSelectDropdown
                  value={part.materialId ?? ''}
                  onChange={(v) => {
                    const next = [...parts];
                    const mat = materials.find((m) => m.id === v);
                    next[idx] = {
                      ...part,
                      materialId: v || null,
                      name: part.name || mat?.name || ''
                    };
                    onChange(next);
                  }}
                  options={materialOptions}
                  placeholder="Vincular ao estoque (opcional)"
                  emptyOptionLabel="Sem vínculo"
                  allowEmpty
                  disabled={readOnly}
                />
                <a
                  href={`/ponto/solicitar-materiais?q=${encodeURIComponent(part.name || '')}`}
                  className="mt-1 inline-block text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                >
                  Abrir requisição de material (RM)
                </a>
                {part.stockDeductedAt ? (
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                    Baixa no estoque registrada.
                  </p>
                ) : null}
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
                <DatePickerField
                  value={isoToYmd(part.expectedAt)}
                  onChange={(ymd) => {
                    const next = [...parts];
                    next[idx] = { ...part, expectedAt: ymdToIsoNoon(ymd) };
                    onChange(next);
                  }}
                  disabled={readOnly}
                  noFocusRing
                  aria-label="Previsão da peça"
                />
              </div>
              {!readOnly ? (
                <div className="flex items-end">
                  <button
                    type="button"
                    aria-label="Remover peça"
                    onClick={() => onChange(parts.filter((_, i) => i !== idx))}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-gray-600 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover
                  </button>
                </div>
              ) : null}
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
