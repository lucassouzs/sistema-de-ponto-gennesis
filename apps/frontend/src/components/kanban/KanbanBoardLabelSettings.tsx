'use client';

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { kanbanInput } from './kanbanFormStyles';
import {
  DEFAULT_KANBAN_LABEL_PRESETS,
  type KanbanLabelPreset,
} from './kanbanLabels';
import { expandShortLabelHex, KanbanLabelColorPicker } from './KanbanLabelColorPicker';

export interface KanbanBoardLabelSettingsProps {
  initialPresets: KanbanLabelPreset[];
  departmentLabel: string;
  saving?: boolean;
  onClose: () => void;
  onSave: (presets: KanbanLabelPreset[]) => void | Promise<void>;
}

function clonePresets(presets: KanbanLabelPreset[]): KanbanLabelPreset[] {
  return presets.map((p) => ({ color: p.color, name: p.name }));
}

function LabelColorField({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <KanbanLabelColorPicker color={color} onChange={onChange} />
      <input
        type="text"
        value={color}
        onChange={(e) => {
          let v = e.target.value.toUpperCase().replace(/[^#0-9A-F]/g, '');
          if (!v.startsWith('#')) v = `#${v.replace(/^#/, '')}`;
          if (v.length <= 7) onChange(v);
        }}
        onBlur={() => {
          if (/^#([0-9A-F]{3}|[0-9A-F]{6})$/.test(color)) {
            onChange(expandShortLabelHex(color));
          }
        }}
        className="w-[4.75rem] rounded-lg border border-gray-200 bg-white px-2 py-2.5 text-center text-xs font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
        maxLength={7}
        spellCheck={false}
        aria-label="Código da cor"
      />
    </div>
  );
}

export function KanbanBoardLabelSettings({
  initialPresets,
  departmentLabel,
  saving,
  onClose,
  onSave,
}: KanbanBoardLabelSettingsProps) {
  const [presets, setPresets] = useState<KanbanLabelPreset[]>(() =>
    clonePresets(initialPresets.length > 0 ? initialPresets : [...DEFAULT_KANBAN_LABEL_PRESETS]),
  );
  const [error, setError] = useState<string | null>(null);

  function updateAt(index: number, patch: Partial<KanbanLabelPreset>) {
    setPresets((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    setError(null);
  }

  function removeAt(index: number) {
    if (presets.length <= 1) {
      setError('O setor precisa ter ao menos uma etiqueta');
      return;
    }
    setPresets((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  }

  function addPreset() {
    if (presets.length >= 24) {
      setError('Máximo de 24 etiquetas por setor');
      return;
    }
    setPresets((prev) => [...prev, { color: '#6B7280', name: 'Nova etiqueta' }]);
    setError(null);
  }

  async function handleSave() {
    const trimmed = presets.map((p) => ({
      color: p.color.trim(),
      name: p.name.trim(),
    }));

    if (trimmed.some((p) => !p.name)) {
      setError('Todas as etiquetas precisam de um nome');
      return;
    }
    if (trimmed.some((p) => !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(p.color))) {
      setError('Use cores no formato #RRGGBB');
      return;
    }

    const seen = new Set<string>();
    for (const p of trimmed) {
      const key = expandShortLabelHex(p.color).toLowerCase();
      if (seen.has(key)) {
        setError('Não repita a mesma cor em duas etiquetas');
        return;
      }
      seen.add(key);
    }

    await Promise.resolve(
      onSave(trimmed.map((p) => ({ color: expandShortLabelHex(p.color), name: p.name }))),
    );
    onClose();
  }

  return (
    <div className="w-full min-w-[300px]">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Defina cor e nome de cada etiqueta do quadro de{' '}
        <span className="font-medium text-gray-900 dark:text-gray-100">{departmentLabel}</span>.
      </p>

      <div className="space-y-2 max-h-[min(52vh,420px)] overflow-y-auto pr-1 mb-4">
        {presets.map((preset, index) => (
          <div
            key={`label-row-${index}`}
            className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 p-2.5"
          >
            <LabelColorField
              color={preset.color}
              onChange={(nextColor) => updateAt(index, { color: nextColor })}
            />
            <input
              type="text"
              value={preset.name}
              onChange={(e) => updateAt(index, { name: e.target.value })}
              className={clsx(kanbanInput, 'flex-1 min-w-0 py-2.5')}
              placeholder="Nome da etiqueta"
              maxLength={80}
              aria-label="Nome padrão"
            />
            <button
              type="button"
              onClick={() => removeAt(index)}
              className={clsx(
                'shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors',
                presets.length <= 1 && 'opacity-40 cursor-not-allowed',
              )}
              title="Remover etiqueta"
              disabled={presets.length <= 1}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 mb-3" role="alert">
          {error}
        </p>
      )}

      <div className="mb-4">
        <button
          type="button"
          onClick={addPreset}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <Plus className="w-4 h-4" />
          Adicionar
        </button>
      </div>

      <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar etiquetas'}
        </button>
      </div>
    </div>
  );
}
