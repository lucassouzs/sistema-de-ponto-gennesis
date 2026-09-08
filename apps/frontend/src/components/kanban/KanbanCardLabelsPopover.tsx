'use client';

import React, { useMemo, useState } from 'react';
import { PenSquare, Plus, Search, X } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { CheckboxIndicator } from '@/components/ui/Checkbox';
import {
  getKanbanLabelPalette,
  getKanbanLabelTextColor,
  normalizeKanbanLabels,
  KANBAN_LABEL_COLOR_NONE,
  type KanbanCardLabel,
  type KanbanLabelPreset,
  labelKey,
} from './kanbanLabels';
import { KanbanLabelColorMapInline } from './KanbanLabelColorPicker';
import { normalizeSearchText } from '@/lib/normalizeSearchText';

export interface KanbanCardLabelsPanelProps {
  labels: KanbanCardLabel[];
  labelPresets?: readonly KanbanLabelPreset[];
  /**
   * `card` — selecionar etiquetas do card (checkbox + criar).
   * `board` — gerenciar etiquetas do setor (sem checkbox; criar/editar salva no setor).
   */
  variant?: 'card' | 'board';
  onClose: () => void;
  onSave: (labels: KanbanCardLabel[]) => void | Promise<void>;
  /** Persiste a lista de etiquetas do setor (criar/editar). */
  onPresetsChange?: (
    presets: KanbanLabelPreset[],
    options?: { colorRemaps?: Array<{ from: string; to: string }> },
  ) => void | Promise<void>;
  /** Atualiza o título do Modal pai (lista / criar / editar). */
  onHeaderChange?: (header: {
    title: string;
    showBack: boolean;
    onBack?: () => void;
  }) => void;
}

type PanelView = 'list' | 'create' | 'edit';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
    if (msg) return msg;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Conteúdo do painel de etiquetas (usar dentro de Modal). */
export function KanbanCardLabelsPanel({
  labels: initialLabels,
  labelPresets,
  variant = 'card',
  onClose: _onClose,
  onSave,
  onPresetsChange,
  onHeaderChange,
}: KanbanCardLabelsPanelProps) {
  const isBoard = variant === 'board';
  const basePalette = getKanbanLabelPalette(labelPresets);
  const [extraPresets, setExtraPresets] = useState<KanbanLabelPreset[]>([]);
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const [labels, setLabels] = useState<KanbanCardLabel[]>(() =>
    normalizeKanbanLabels(initialLabels, basePalette),
  );
  const [query, setQuery] = useState('');
  const [view, setView] = useState<PanelView>('list');
  const [editingColor, setEditingColor] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState('#4BCE97');
  const [savingPreset, setSavingPreset] = useState(false);

  const palette = useMemo(() => {
    const seen = new Set(basePalette.map((p) => p.color.toLowerCase()));
    const extras = extraPresets.filter((p) => !seen.has(p.color.toLowerCase()));
    return [...basePalette, ...extras];
  }, [basePalette, extraPresets]);

  function displayName(preset: KanbanLabelPreset): string {
    return nameOverrides[preset.color] ?? preset.name;
  }

  function currentPresetsSnapshot(): KanbanLabelPreset[] {
    return palette.map((p) => ({ color: p.color, name: displayName(p) }));
  }

  function commitLabels(next: KanbanCardLabel[]) {
    if (isBoard) return;
    setLabels(next);
    void onSave(next);
  }

  function backToList() {
    setView('list');
    setEditingColor(null);
    setDraftName('');
    onHeaderChange?.({ title: 'Etiquetas', showBack: false });
  }

  function toggleColor(preset: KanbanLabelPreset) {
    const name = displayName(preset);
    const existing = labels.find((l) => l.color.toLowerCase() === preset.color.toLowerCase());
    if (existing) {
      commitLabels(labels.filter((l) => l.color.toLowerCase() !== preset.color.toLowerCase()));
    } else {
      commitLabels([...labels, { color: preset.color, text: name }]);
    }
  }

  function openCreate() {
    setView('create');
    setDraftName('');
    setDraftColor('#4BCE97');
    setEditingColor(null);
    onHeaderChange?.({
      title: 'Criar Etiqueta',
      showBack: true,
      onBack: backToList,
    });
  }

  function openEdit(preset: KanbanLabelPreset) {
    setView('edit');
    setEditingColor(preset.color);
    setDraftName(displayName(preset));
    setDraftColor(preset.color);
    onHeaderChange?.({
      title: 'Editar Etiqueta',
      showBack: true,
      onBack: backToList,
    });
  }

  async function persistPresets(
    nextPresets: KanbanLabelPreset[],
    options?: { colorRemaps?: Array<{ from: string; to: string }> },
  ) {
    if (!onPresetsChange) {
      setExtraPresets(
        nextPresets.filter(
          (p) => !basePalette.some((b) => b.color.toLowerCase() === p.color.toLowerCase()),
        ),
      );
      return;
    }
    setSavingPreset(true);
    try {
      await onPresetsChange(nextPresets, options);
    } finally {
      setSavingPreset(false);
    }
  }

  async function saveCreate() {
    const name = draftName.trim() || 'Nova etiqueta';
    const color = draftColor.trim() || KANBAN_LABEL_COLOR_NONE;
    const preset = { color, name };
    const snapshot = currentPresetsSnapshot();
    const nextPresets = snapshot.some((p) => p.color.toLowerCase() === color.toLowerCase())
      ? snapshot.map((p) => (p.color.toLowerCase() === color.toLowerCase() ? preset : p))
      : [...snapshot, preset];

    try {
      await persistPresets(nextPresets);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível criar a etiqueta no setor'));
      return;
    }

    setNameOverrides((prev) => ({ ...prev, [color]: name }));
    if (!onPresetsChange) {
      setExtraPresets((prev) =>
        prev.some((p) => p.color.toLowerCase() === color.toLowerCase())
          ? prev.map((p) => (p.color.toLowerCase() === color.toLowerCase() ? preset : p))
          : [...prev, preset],
      );
    }
    if (!isBoard) {
      const without = labels.filter((l) => l.color.toLowerCase() !== color.toLowerCase());
      commitLabels([...without, { color, text: name }]);
    }
    backToList();
  }

  async function saveEdit() {
    if (!editingColor) return;
    const name = draftName.trim() || 'Etiqueta';
    const nextColor = draftColor.trim() || editingColor;
    const snapshot = currentPresetsSnapshot();
    const nextPresets = snapshot.map((p) =>
      p.color.toLowerCase() === editingColor.toLowerCase()
        ? { color: nextColor, name }
        : p,
    );
    // Se a nova cor já existia em outro preset, remove o duplicado antigo
    const deduped: KanbanLabelPreset[] = [];
    const seen = new Set<string>();
    for (const p of nextPresets) {
      const key = p.color.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(p);
    }

    try {
      const colorChanged =
        nextColor.trim().toLowerCase() !== editingColor.trim().toLowerCase();
      await persistPresets(
        deduped,
        colorChanged
          ? { colorRemaps: [{ from: editingColor, to: nextColor }] }
          : undefined,
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar a etiqueta no setor'));
      return;
    }

    setNameOverrides((prev) => {
      const next = { ...prev };
      delete next[editingColor];
      next[nextColor] = name;
      return next;
    });
    if (!onPresetsChange) {
      setExtraPresets((prev) =>
        prev.map((p) =>
          p.color.toLowerCase() === editingColor.toLowerCase()
            ? { color: nextColor, name }
            : p,
        ),
      );
    }
    if (!isBoard) {
      commitLabels(
        labels.map((l) =>
          l.color.toLowerCase() === editingColor.toLowerCase()
            ? { color: nextColor, text: name }
            : l,
        ),
      );
    }
    backToList();
  }

  const filteredPalette = useMemo(() => {
    const q = normalizeSearchText(query);
    if (!q) return palette;
    return palette.filter((preset) => normalizeSearchText(displayName(preset)).includes(q));
  }, [palette, query, nameOverrides]);

  if (view === 'create' || view === 'edit') {
    const previewLabel = draftName.trim() || (view === 'create' ? '' : 'Etiqueta');

    return (
      <div className="w-full min-w-[280px]">
        <div className="-mx-6 -mt-4 mb-4 bg-gray-100 px-6 py-5 dark:bg-gray-900/70">
          <div
            className="mx-auto flex h-9 max-w-[16rem] items-center rounded-md px-3 text-sm font-semibold"
            style={{
              backgroundColor: draftColor,
              color: getKanbanLabelTextColor(draftColor),
            }}
          >
            <span className="truncate">{previewLabel}</span>
          </div>
        </div>

        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
          Título
        </label>
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Nome da etiqueta"
          className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          autoFocus
          disabled={savingPreset}
        />

        <div>
          <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
            Selecionar uma cor
          </p>
          <KanbanLabelColorMapInline color={draftColor} onChange={setDraftColor} />
        </div>

        <button
          type="button"
          onClick={() => setDraftColor(KANBAN_LABEL_COLOR_NONE)}
          disabled={savingPreset}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <X className="h-4 w-4 shrink-0" />
          Remover cor
        </button>

        <button
          type="button"
          onClick={() => void (view === 'create' ? saveCreate() : saveEdit())}
          disabled={savingPreset}
          className="mt-4 w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {savingPreset ? 'Salvando...' : view === 'create' ? 'Criar' : 'Salvar'}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full min-w-[260px]">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar etiquetas..."
          className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Etiquetas
      </p>

      <div className="mb-3 max-h-[min(50vh,20rem)] space-y-1.5 overflow-y-auto">
        {filteredPalette.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhuma etiqueta encontrada
          </p>
        ) : (
          filteredPalette.map((preset) => {
            const isOn = labels.some(
              (l) => l.color.toLowerCase() === preset.color.toLowerCase(),
            );
            const name = displayName(preset);

            return (
              <div key={preset.color} className="flex items-center gap-2">
                {!isBoard ? (
                  <CheckboxIndicator
                    checked={isOn}
                    asButton
                    onChange={() => toggleColor(preset)}
                    className="shrink-0"
                  />
                ) : null}
                <div
                  className="group relative flex h-10 min-w-0 flex-1 items-center overflow-hidden rounded-md"
                  style={{
                    backgroundColor: preset.color,
                    color: getKanbanLabelTextColor(preset.color),
                  }}
                >
                  <button
                    type="button"
                    onClick={() => (isBoard ? openEdit(preset) : toggleColor(preset))}
                    className={clsx(
                      'h-full min-w-0 flex-1 truncate px-3 pr-10 text-left text-sm font-semibold transition-[filter] duration-150',
                      'hover:brightness-[0.92] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/30',
                    )}
                    title={name}
                  >
                    {name}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(preset);
                    }}
                    className={clsx(
                      'absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md',
                      'opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus:opacity-100',
                      'hover:bg-black/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
                    )}
                    style={{ color: getKanbanLabelTextColor(preset.color) }}
                    title="Editar etiqueta"
                    aria-label={`Editar ${name}`}
                  >
                    <PenSquare className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button
        type="button"
        onClick={openCreate}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <Plus className="h-4 w-4 shrink-0" />
        Criar uma nova etiqueta
      </button>
    </div>
  );
}

export function KanbanLabelChips({
  labels,
  labelPresets,
  onClick,
}: {
  labels: KanbanCardLabel[];
  labelPresets?: readonly KanbanLabelPreset[];
  onClick?: () => void;
}) {
  const palette = getKanbanLabelPalette(labelPresets);
  const normalized = normalizeKanbanLabels(labels, palette);
  if (normalized.length === 0) return null;
  const chipClass =
    'inline-flex h-8 max-w-full items-center truncate rounded-md px-2.5 text-xs font-semibold';
  return (
    <>
      {normalized.map((l) =>
        onClick ? (
          <button
            key={labelKey(l)}
            type="button"
            onClick={onClick}
            className={`${chipClass} cursor-pointer transition-opacity hover:opacity-90`}
            style={{
              backgroundColor: l.color,
              color: getKanbanLabelTextColor(l.color),
            }}
            title={l.text}
          >
            {l.text}
          </button>
        ) : (
          <span
            key={labelKey(l)}
            className={chipClass}
            style={{
              backgroundColor: l.color,
              color: getKanbanLabelTextColor(l.color),
            }}
            title={l.text}
          >
            {l.text}
          </span>
        ),
      )}
    </>
  );
}
