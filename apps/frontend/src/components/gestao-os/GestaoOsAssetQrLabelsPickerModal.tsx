'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Checkbox } from '@/components/ui/Checkbox';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';

export type GestaoOsQrLabelPickAsset = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  buildingName: string;
  sectorName: string;
  placeName: string;
};

export type GestaoOsQrLabelPick = {
  id: string;
  quantity: number;
};

type GestaoOsAssetQrLabelsPickerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  assets: GestaoOsQrLabelPickAsset[];
  initialSelectedIds?: string[];
  downloading?: boolean;
  onConfirm: (picks: GestaoOsQrLabelPick[]) => void;
};

export function GestaoOsAssetQrLabelsPickerModal({
  isOpen,
  onClose,
  assets,
  initialSelectedIds = [],
  downloading = false,
  onConfirm
}: GestaoOsAssetQrLabelsPickerModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const next = new Set(initialSelectedIds.filter((id) => assets.some((asset) => asset.id === id)));
    setSelected(next);
    setQtyById(Object.fromEntries(assets.map((asset) => [asset.id, 1])));
    setQuery('');
  }, [isOpen, assets, initialSelectedIds]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((asset) =>
      [asset.name, asset.code, asset.category, asset.placeName, asset.sectorName, asset.buildingName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [assets, query]);

  const allVisibleSelected = visible.length > 0 && visible.every((asset) => selected.has(asset.id));
  const totalLabels = [...selected].reduce((sum, id) => sum + (qtyById[id] || 1), 0);

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const asset of visible) next.delete(asset.id);
      } else {
        for (const asset of visible) next.add(asset.id);
      }
      return next;
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Baixar etiquetas PDF" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Marque os ativos e informe quantas etiquetas de cada um. O PDF baixa para você imprimir e
          colar no equipamento.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar ativos..."
            className={`${FORM_FIELD_INPUT_CLS} h-10 min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={toggleAllVisible}
            className="h-10 shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {allVisibleSelected ? 'Limpar visíveis' : 'Selecionar visíveis'}
          </button>
        </div>
        <div className="max-h-[50vh] divide-y divide-gray-200 overflow-y-auto rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">Nenhum ativo encontrado.</p>
          ) : (
            visible.map((asset) => (
              <div key={asset.id} className="flex items-center gap-3 px-3 py-2.5">
                <Checkbox
                  checked={selected.has(asset.id)}
                  onChange={(checked) => toggle(asset.id, checked)}
                  label={
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        {asset.name}
                      </span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                        {[asset.code, asset.category, `${asset.buildingName} › ${asset.placeName}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  }
                  className="min-w-0 flex-1"
                />
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  Qtd
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={qtyById[asset.id] ?? 1}
                    onChange={(e) => {
                      const n = Math.min(20, Math.max(1, Number(e.target.value) || 1));
                      setQtyById((prev) => ({ ...prev, [asset.id]: n }));
                      if (!selected.has(asset.id)) toggle(asset.id, true);
                    }}
                    className={`${FORM_FIELD_INPUT_CLS} h-9 w-16 px-2 text-center tabular-nums`}
                  />
                </label>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {selected.size} ativo(s) · {totalLabels} etiqueta(s)
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={downloading || selected.size === 0}
              onClick={() =>
                onConfirm(
                  [...selected].map((id) => ({
                    id,
                    quantity: Math.min(20, Math.max(1, qtyById[id] || 1))
                  }))
                )
              }
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {downloading ? 'Gerando PDF…' : 'Baixar PDF'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
