'use client';

import { useEffect, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import {
  defaultTableColumn,
  syncTableColumnTitles,
} from '@/lib/formTable';
import type {
  FormTableColumn,
  FormTableColumnAlign,
  FormTableColumnType,
} from '@/components/forms/formStructureTypes';

type Props = {
  isOpen: boolean;
  columns: FormTableColumn[];
  onClose: () => void;
  onSave: (columns: FormTableColumn[]) => void;
};

const COLUMN_TYPES: { value: FormTableColumnType; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'valor', label: 'Valor (R$)' },
  { value: 'percent', label: 'Porcentagem (%)' },
];

const ALIGN_OPTIONS: {
  value: FormTableColumnAlign;
  label: string;
  Icon: typeof AlignLeft;
}[] = [
  { value: 'left', label: 'Esquerda', Icon: AlignLeft },
  { value: 'center', label: 'Centro', Icon: AlignCenter },
  { value: 'right', label: 'Direita', Icon: AlignRight },
];

function AlignToggle({
  value,
  onChange,
}: {
  value: FormTableColumnAlign;
  onChange: (align: FormTableColumnAlign) => void;
}) {
  return (
    <div className="flex items-center rounded-lg border border-gray-200 p-0.5 dark:border-gray-600">
      {ALIGN_OPTIONS.map(({ value: align, label, Icon }) => {
        const active = value === align;
        return (
          <button
            key={align}
            type="button"
            title={label}
            onClick={() => onChange(align)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              active
                ? 'bg-gray-800 text-white dark:bg-gray-100 dark:text-gray-900'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

export function FormTableColumnsModal({ isOpen, columns, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<FormTableColumn[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(columns.length ? columns.map((col) => ({ ...col })) : [defaultTableColumn('Coluna 1')]);
  }, [isOpen, columns]);

  const updateColumn = (index: number, patch: Partial<FormTableColumn>) => {
    setDraft((prev) => prev.map((col, i) => (i === index ? { ...col, ...patch } : col)));
  };

  const handleSave = () => {
    const cleaned = draft
      .map((col) => ({
        ...col,
        title: col.title.trim() || 'Coluna',
      }))
      .filter((col) => col.title);
    onSave(cleaned.length ? cleaned : [defaultTableColumn('Coluna 1')]);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Colunas da tabela" size="lg" confirmBeforeClose>
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Defina o título, tipo de dado, alinhamento e destaque de cada coluna.
        </p>

        <div className="space-y-3">
          {draft.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-400 dark:border-gray-600">
              Nenhuma coluna ainda
            </p>
          ) : (
            draft.map((col, index) => (
              <div
                key={col.id}
                className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-900/40"
              >
                <div className="mb-3 flex items-center gap-2">
                  <GripVertical className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Coluna {index + 1}
                  </span>
                  <button
                    type="button"
                    title="Remover coluna"
                    onClick={() => setDraft((prev) => prev.filter((_, i) => i !== index))}
                    className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Título
                    </label>
                    <input
                      type="text"
                      value={col.title}
                      onChange={(e) => updateColumn(index, { title: e.target.value })}
                      placeholder={`Coluna ${index + 1}`}
                      className={FORM_FIELD_INPUT_CLS}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Tipo
                    </label>
                    <StringSingleSelectDropdown
                      value={col.type ?? 'text'}
                      onChange={(value) =>
                        updateColumn(index, { type: value as FormTableColumnType })
                      }
                      options={COLUMN_TYPES.map((opt) => ({
                        value: opt.value,
                        label: opt.label,
                      }))}
                      allowEmpty={false}
                      disableSearch
                      matchTriggerWidth
                      triggerClassName="min-w-[9rem]"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Alinhamento
                    </label>
                    <AlignToggle
                      value={col.align ?? 'left'}
                      onChange={(align) => updateColumn(index, { align })}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => updateColumn(index, { bold: !col.bold })}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      col.bold
                        ? 'border-gray-800 bg-gray-800 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                        : 'border-gray-200 text-gray-600 hover:bg-white dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Bold className="h-4 w-4" />
                    Negrito no cabeçalho
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() =>
              setDraft((prev) => [...prev, defaultTableColumn(`Coluna ${prev.length + 1}`)])
            }
          >
            Adicionar coluna
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="!bg-red-600 hover:!bg-red-700 active:!bg-red-800"
              onClick={handleSave}
            >
              Salvar colunas
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function tableColumnsToSavePayload(columns: FormTableColumn[]) {
  return {
    tableColumns: columns,
    options: syncTableColumnTitles(columns),
  };
}
