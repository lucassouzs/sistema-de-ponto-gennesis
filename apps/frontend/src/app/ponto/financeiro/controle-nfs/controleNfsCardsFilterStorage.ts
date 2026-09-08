import type { ControleNfsCardsFilterState } from './controleNfsTypes';

export type ControleNfsCardsFilterPreset = {
  id: string;
  name: string;
  filter: ControleNfsCardsFilterState;
  createdAt: string;
};

const STORAGE_KEY = 'controle-nfs-cards-filter-presets-v2';

function normalizeFilterState(value: unknown): ControleNfsCardsFilterState | null {
  if (typeof value !== 'object' || value == null) return null;
  const filter = value as Record<string, unknown>;
  if (!Array.isArray(filter.tabKeys)) return null;

  if (
    typeof filter.emissaoDateFrom === 'string' &&
    typeof filter.emissaoDateTo === 'string' &&
    typeof filter.recebimentoDateFrom === 'string' &&
    typeof filter.recebimentoDateTo === 'string'
  ) {
    return {
      tabKeys: [...(filter.tabKeys as string[])],
      emissaoDateFrom: filter.emissaoDateFrom,
      emissaoDateTo: filter.emissaoDateTo,
      recebimentoDateFrom: filter.recebimentoDateFrom,
      recebimentoDateTo: filter.recebimentoDateTo
    };
  }

  const legacyFrom = typeof filter.dateFrom === 'string' ? filter.dateFrom : '';
  const legacyTo = typeof filter.dateTo === 'string' ? filter.dateTo : '';
  const legacyBasis = filter.dateBasis === 'recebimento' ? 'recebimento' : 'emissao';

  return {
    tabKeys: [...(filter.tabKeys as string[])],
    emissaoDateFrom: legacyBasis === 'emissao' ? legacyFrom : '',
    emissaoDateTo: legacyBasis === 'emissao' ? legacyTo : '',
    recebimentoDateFrom: legacyBasis === 'recebimento' ? legacyFrom : '',
    recebimentoDateTo: legacyBasis === 'recebimento' ? legacyTo : ''
  };
}

export function loadControleNfsCardsFilterPresets(): ControleNfsCardsFilterPreset[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
        if (typeof item !== 'object' || item == null) return null;
        const preset = item as ControleNfsCardsFilterPreset;
        if (typeof preset.id !== 'string' || typeof preset.name !== 'string') return null;
        const filter = normalizeFilterState(preset.filter);
        if (!filter) return null;
        return { ...preset, filter };
      })
      .filter((item): item is ControleNfsCardsFilterPreset => item != null);
  } catch {
    return [];
  }
}

export function saveControleNfsCardsFilterPresets(
  presets: ControleNfsCardsFilterPreset[]
): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function createControleNfsCardsFilterPreset(
  name: string,
  filter: ControleNfsCardsFilterState
): ControleNfsCardsFilterPreset {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    filter: {
      tabKeys: [...filter.tabKeys],
      emissaoDateFrom: filter.emissaoDateFrom,
      emissaoDateTo: filter.emissaoDateTo,
      recebimentoDateFrom: filter.recebimentoDateFrom,
      recebimentoDateTo: filter.recebimentoDateTo
    },
    createdAt: new Date().toISOString()
  };
}
