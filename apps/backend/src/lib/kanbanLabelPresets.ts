export type KanbanCardLabelDto = { color: string; text: string };

export type KanbanLabelPresetDto = {
  color: string;
  name: string;
};

export const DEFAULT_KANBAN_LABEL_PRESETS: KanbanLabelPresetDto[] = [
  { color: '#FF78CB', name: 'DP/RH' },
  { color: '#00C2E0', name: 'Sistema' },
  { color: '#FF9F1A', name: 'Engenharia' },
  { color: '#F2D600', name: 'Suprimentos' },
  { color: '#C377E0', name: 'Contratos e Licitações' },
  { color: '#51E898', name: 'Projetos' },
  { color: '#EB5A46', name: 'Diretoria/Auditoria' },
  { color: '#344563', name: 'Geral' },
];

const HEX_COLOR = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const MAX_PRESETS = 24;
const LEGACY_DP_LABEL_COLOR = '#ff78cb';

function normalizeHexColor(color: string): string {
  const trimmed = color.trim();
  if (!HEX_COLOR.test(trimmed)) {
    throw new Error('Cor de etiqueta inválida (use formato #RRGGBB)');
  }
  if (trimmed.length === 4) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return trimmed.toUpperCase();
}

export function parseKanbanLabelPresets(raw: unknown): KanbanLabelPresetDto[] {
  if (!Array.isArray(raw)) return [];
  const out: KanbanLabelPresetDto[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const colorRaw = (item as { color?: unknown }).color;
    const nameRaw = (item as { name?: unknown }).name;
    if (typeof colorRaw !== 'string' || typeof nameRaw !== 'string') continue;

    let color: string;
    try {
      color = normalizeHexColor(colorRaw);
    } catch {
      continue;
    }
    if (seen.has(color)) continue;
    seen.add(color);

    let name = nameRaw.trim().slice(0, 80);
    if (name.toLowerCase() === 'editavel') name = 'Geral';
    if (!name) continue;

    out.push({ color, name });
    if (out.length >= MAX_PRESETS) break;
  }

  return out;
}

export function resolveKanbanLabelPresets(raw: unknown): KanbanLabelPresetDto[] {
  const parsed = parseKanbanLabelPresets(raw);
  return parsed.length > 0 ? parsed : [...DEFAULT_KANBAN_LABEL_PRESETS];
}

export function validateKanbanLabelPresetsInput(presets: unknown): KanbanLabelPresetDto[] {
  if (!Array.isArray(presets)) {
    throw new Error('Lista de etiquetas inválida');
  }
  if (presets.length === 0) {
    throw new Error('O setor precisa ter ao menos uma etiqueta');
  }
  if (presets.length > MAX_PRESETS) {
    throw new Error(`Máximo de ${MAX_PRESETS} etiquetas por setor`);
  }

  const parsed = parseKanbanLabelPresets(presets);
  if (parsed.length !== presets.length) {
    throw new Error('Verifique cores (#RRGGBB) e nomes de todas as etiquetas');
  }
  if (parsed.length === 0) {
    throw new Error('O setor precisa ter ao menos uma etiqueta');
  }

  return parsed;
}

function getPresetForColor(
  color: string,
  presets: KanbanLabelPresetDto[],
): KanbanLabelPresetDto | undefined {
  const key = color.trim().toLowerCase();
  return presets.find((p) => p.color.toLowerCase() === key);
}

export function normalizeCardLabelsAgainstPresets(
  labels: KanbanCardLabelDto[],
  presets: KanbanLabelPresetDto[],
): KanbanCardLabelDto[] {
  return labels.map((label) => {
    const colorKey = label.color.trim().toLowerCase();

    if (colorKey === LEGACY_DP_LABEL_COLOR && label.text.trim().toUpperCase() === 'DP') {
      const dpPreset = presets.find((p) => p.name === 'DP/RH');
      if (dpPreset) return { color: dpPreset.color, text: dpPreset.name };
    }

    const preset = getPresetForColor(label.color, presets);
    if (preset) return { color: preset.color, text: preset.name };

    const byName = presets.find(
      (p) => p.name.trim().toLowerCase() === label.text.trim().toLowerCase(),
    );
    if (byName) return { color: byName.color, text: byName.name };

    return label;
  });
}

export function validateCardLabelsForBoard(
  labels: KanbanCardLabelDto[] | undefined,
  presets: KanbanLabelPresetDto[],
): KanbanCardLabelDto[] | undefined {
  if (labels === undefined) return undefined;

  const normalized = normalizeCardLabelsAgainstPresets(labels, presets);
  const allowed = new Set(presets.map((p) => p.color.toLowerCase()));

  // Cores fora do setor são ignoradas (não derruba o save do card).
  return normalized.filter((label) => allowed.has(label.color.toLowerCase()));
}

export type KanbanLabelColorRemap = { from: string; to: string };

/** Detecta troca de cor de preset pelo mesmo nome (case-insensitive). */
export function detectLabelColorRemapsByName(
  oldPresets: KanbanLabelPresetDto[],
  newPresets: KanbanLabelPresetDto[],
): KanbanLabelColorRemap[] {
  const remaps: KanbanLabelColorRemap[] = [];
  const newByName = new Map(
    newPresets.map((p) => [p.name.trim().toLowerCase(), p] as const),
  );

  for (const old of oldPresets) {
    const colorKept = newPresets.some(
      (p) => p.color.toLowerCase() === old.color.toLowerCase(),
    );
    if (colorKept) continue;

    const match = newByName.get(old.name.trim().toLowerCase());
    if (!match) continue;
    if (match.color.toLowerCase() === old.color.toLowerCase()) continue;

    remaps.push({ from: old.color, to: match.color });
  }

  return remaps;
}

export function parseLabelColorRemapsInput(raw: unknown): KanbanLabelColorRemap[] {
  if (!Array.isArray(raw)) return [];
  const out: KanbanLabelColorRemap[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const fromRaw = (item as { from?: unknown }).from;
    const toRaw = (item as { to?: unknown }).to;
    if (typeof fromRaw !== 'string' || typeof toRaw !== 'string') continue;

    let from: string;
    let to: string;
    try {
      from = normalizeHexColor(fromRaw);
      to = normalizeHexColor(toRaw);
    } catch {
      continue;
    }
    if (from.toLowerCase() === to.toLowerCase()) continue;
    const key = from.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from, to });
  }

  return out;
}

export function mergeLabelColorRemaps(
  ...groups: KanbanLabelColorRemap[][]
): KanbanLabelColorRemap[] {
  const map = new Map<string, string>();
  for (const group of groups) {
    for (const r of group) {
      map.set(r.from.toLowerCase(), r.to);
    }
  }
  return [...map.entries()].map(([from, to]) => ({ from, to }));
}

export function applyLabelColorRemaps(
  labels: KanbanCardLabelDto[],
  remaps: KanbanLabelColorRemap[],
  presets: KanbanLabelPresetDto[],
): KanbanCardLabelDto[] {
  if (remaps.length === 0) {
    return normalizeCardLabelsAgainstPresets(labels, presets);
  }

  const remapMap = new Map(remaps.map((r) => [r.from.toLowerCase(), r.to] as const));
  const next = labels.map((label) => {
    const to = remapMap.get(label.color.trim().toLowerCase());
    if (!to) return label;
    const preset = getPresetForColor(to, presets);
    return { color: to, text: preset?.name ?? label.text };
  });

  return normalizeCardLabelsAgainstPresets(next, presets);
}
