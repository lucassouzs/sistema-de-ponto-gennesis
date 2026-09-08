import type { CSSProperties } from 'react';

export interface KanbanCardLabel {
  color: string;
  text: string;
}

export type KanbanLabelPreset = {
  color: string;
  name: string;
};

/** Paleta global usada como fallback quando o setor ainda não configurou etiquetas. */
export const DEFAULT_KANBAN_LABEL_PRESETS: readonly KanbanLabelPreset[] = [
  { color: '#FF78CB', name: 'DP/RH' },
  { color: '#00C2E0', name: 'Sistema' },
  { color: '#FF9F1A', name: 'Engenharia' },
  { color: '#F2D600', name: 'Suprimentos' },
  { color: '#C377E0', name: 'Contratos e Licitações' },
  { color: '#51E898', name: 'Projetos' },
  { color: '#EB5A46', name: 'Diretoria/Auditoria' },
  { color: '#344563', name: 'Geral' },
];

/** @deprecated Use getKanbanLabelPalette(boardPresets) */
export const KANBAN_LABEL_PALETTE = DEFAULT_KANBAN_LABEL_PRESETS;

const LEGACY_DP_LABEL_COLOR = '#ff78cb';

export function getKanbanLabelPalette(
  presets?: readonly KanbanLabelPreset[] | null,
): readonly KanbanLabelPreset[] {
  return presets?.length ? presets : DEFAULT_KANBAN_LABEL_PRESETS;
}

export function getKanbanLabelPreset(
  color: string,
  presets?: readonly KanbanLabelPreset[] | null,
): KanbanLabelPreset | undefined {
  const normalized = color.trim().toLowerCase();
  return getKanbanLabelPalette(presets).find(
    (preset) => preset.color.toLowerCase() === normalized,
  );
}

export function getKanbanLabelNameForColor(
  color: string,
  presets?: readonly KanbanLabelPreset[] | null,
): string | undefined {
  return getKanbanLabelPreset(color, presets)?.name;
}

export function normalizeKanbanLabels(
  labels: KanbanCardLabel[],
  presets?: readonly KanbanLabelPreset[] | null,
): KanbanCardLabel[] {
  const palette = getKanbanLabelPalette(presets);

  return labels.map((label) => {
    const colorKey = label.color.trim().toLowerCase();

    if (colorKey === LEGACY_DP_LABEL_COLOR && label.text.trim().toUpperCase() === 'DP') {
      const dpPreset = palette.find((p) => p.name === 'DP/RH');
      if (dpPreset) return { color: dpPreset.color, text: dpPreset.name };
    }

    const byColor = getKanbanLabelPreset(label.color, palette);
    if (byColor) return { color: byColor.color, text: byColor.name };

    // Preset recolorido: a cor antiga some da paleta — casa pelo nome da etiqueta.
    const byName = palette.find(
      (p) => p.name.trim().toLowerCase() === label.text.trim().toLowerCase(),
    );
    if (byName) return { color: byName.color, text: byName.name };

    return label;
  });
}

export function labelKey(label: KanbanCardLabel): string {
  return `${label.color}:${label.text}`;
}

/**
 * Mapa de cores das etiquetas (grade 5×6), alinhado ao visual tipo Trello
 * usado no fluxo de criar/editar etiqueta.
 */
export const KANBAN_LABEL_COLOR_MAP: readonly string[] = [
  '#1F845A',
  '#946F00',
  '#C25100',
  '#C9372C',
  '#6E5DC6',
  '#4BCE97',
  '#F5CD47',
  '#FEA362',
  '#F87168',
  '#9F8FEF',
  '#7EE2B8',
  '#F8E6A0',
  '#FDD0A2',
  '#FD9891',
  '#DFD8FD',
  '#0C66E4',
  '#1D7A8C',
  '#216E4E',
  '#AE2E24',
  '#44546F',
  '#579DFF',
  '#60C6D2',
  '#94C748',
  '#E774BB',
  '#8590A2',
  '#CCE0FF',
  '#C6EDFB',
  '#BAF3DB',
  '#FDD0EC',
  '#DCDFE4',
];

export const KANBAN_LABEL_COLOR_NONE = '#6B7280';

function parseLabelHex(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.length === 6
        ? raw
        : null;
  if (!full || !/^[0-9A-Fa-f]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function channelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function mixChannel(from: number, to: number, amount: number): number {
  return Math.round(from + (to - from) * amount);
}

/**
 * Cor do texto da etiqueta conforme o fundo (estilo Trello):
 * fundo claro → tom escuro da mesma cor; fundo escuro → tom claro.
 */
export function getKanbanLabelTextColor(background: string): string {
  const rgb = parseLabelHex(background);
  if (!rgb) return '#FFFFFF';

  const luminance =
    0.2126 * channelToLinear(rgb.r) +
    0.7152 * channelToLinear(rgb.g) +
    0.0722 * channelToLinear(rgb.b);

  if (luminance > 0.48) {
    return (
      '#' +
      [mixChannel(rgb.r, 0, 0.68), mixChannel(rgb.g, 0, 0.68), mixChannel(rgb.b, 0, 0.68)]
        .map((c) => c.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    );
  }

  return (
    '#' +
    [mixChannel(rgb.r, 255, 0.82), mixChannel(rgb.g, 255, 0.82), mixChannel(rgb.b, 255, 0.82)]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/** Estilo de superfície da coluna (tint da cor da bolinha). */
export function getKanbanColumnSurfaceStyle(
  color: string | null | undefined,
): CSSProperties {
  const accent = (color || '#6B7280').trim() || '#6B7280';
  return {
    ['--kanban-column-accent']: accent,
  } as CSSProperties;
}

