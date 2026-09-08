'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { cardsFilterSummaryLabel } from './controleNfsCardsFilter';
import {
  createControleNfsCardsFilterPreset,
  loadControleNfsCardsFilterPresets,
  saveControleNfsCardsFilterPresets,
  type ControleNfsCardsFilterPreset
} from './controleNfsCardsFilterStorage';
import type { ControleNfsCardsFilterState } from './controleNfsTypes';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

type ControleNfsFiltrosSalvosPanelProps = {
  filterDraft: ControleNfsCardsFilterState;
  onLoadDraft: (draft: ControleNfsCardsFilterState) => void;
  disabled?: boolean;
};

export function ControleNfsFiltrosSalvosPanel({
  filterDraft,
  onLoadDraft,
  disabled = false
}: ControleNfsFiltrosSalvosPanelProps) {
  const [presets, setPresets] = useState<ControleNfsCardsFilterPreset[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [saveName, setSaveName] = useState('');

  useEffect(() => {
    setPresets(loadControleNfsCardsFilterPresets());
  }, []);

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedId) ?? null,
    [presets, selectedId]
  );

  const presetSelectOptions = useMemo(
    () => labeledToSelectOptions(presets.map((preset) => ({ value: preset.id, label: preset.name }))),
    [presets]
  );

  const persistPresets = (next: ControleNfsCardsFilterPreset[]) => {
    setPresets(next);
    saveControleNfsCardsFilterPresets(next);
  };

  const handleLoad = () => {
    if (!selectedPreset) return;
    onLoadDraft({ ...selectedPreset.filter });
    setSaveName(selectedPreset.name);
  };

  const handleSave = () => {
    const name = saveName.trim();
    if (!name || filterDraft.tabKeys.length === 0) return;

    const existingByName = presets.find(
      (preset) => preset.name.localeCompare(name, 'pt-BR', { sensitivity: 'accent' }) === 0
    );
    const existingById = presets.find((preset) => preset.id === selectedId);

    if (existingByName && existingByName.id !== selectedId) {
      const ok = window.confirm(
        `O filtro "${existingByName.name}" já existe. Deseja substituir a configuração salva?`
      );
      if (!ok) return;
      persistPresets(
        presets.map((preset) =>
          preset.id === existingByName.id ? { ...preset, name, filter: { ...filterDraft } } : preset
        )
      );
      setSelectedId(existingByName.id);
      return;
    }

    if (existingById) {
      persistPresets(
        presets.map((preset) =>
          preset.id === existingById.id ? { ...preset, name, filter: { ...filterDraft } } : preset
        )
      );
      return;
    }

    const preset = createControleNfsCardsFilterPreset(name, filterDraft);
    persistPresets([preset, ...presets]);
    setSelectedId(preset.id);
  };

  const handleDelete = () => {
    if (!selectedPreset) return;
    if (!window.confirm(`Excluir o filtro salvo "${selectedPreset.name}"?`)) return;
    persistPresets(presets.filter((preset) => preset.id !== selectedPreset.id));
    setSelectedId('');
    setSaveName('');
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
      <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Filtros salvos</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="controle-nfs-filtro-salvo-select"
            className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            Selecionar filtro
          </label>
          <StringSingleSelectDropdown
            value={selectedId}
            onChange={(id) => {
              setSelectedId(id);
              const preset = presets.find((item) => item.id === id);
              if (preset) setSaveName(preset.name);
            }}
            options={presetSelectOptions}
            disabled={disabled || presets.length === 0}
            placeholder={
              presets.length === 0 ? 'Nenhum filtro salvo ainda' : 'Escolha um filtro…'
            }
            className="w-full"
          />
          {selectedPreset ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {cardsFilterSummaryLabel(selectedPreset.filter)}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleLoad}
          disabled={disabled || !selectedPreset}
          className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        >
          Carregar
        </button>

        <button
          type="button"
          onClick={handleDelete}
          disabled={disabled || !selectedPreset}
          title="Excluir filtro selecionado"
          aria-label="Excluir filtro selecionado"
          className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-red-800 dark:hover:bg-red-950/30 dark:hover:text-red-300"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-gray-200 pt-3 dark:border-gray-700 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="controle-nfs-filtro-salvo-nome"
            className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            Nome para salvar
          </label>
          <input
            id="controle-nfs-filtro-salvo-nome"
            type="text"
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
            maxLength={80}
            disabled={disabled}
            placeholder="Ex.: TJGO — 2024"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={disabled || !saveName.trim() || filterDraft.tabKeys.length === 0}
          className="inline-flex h-[42px] shrink-0 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-4 w-4" aria-hidden />
          {presets.some(
            (preset) =>
              preset.name.localeCompare(saveName.trim(), 'pt-BR', { sensitivity: 'accent' }) === 0
          )
            ? 'Atualizar filtro'
            : 'Salvar filtro atual'}
        </button>
      </div>
    </div>
  );
}
