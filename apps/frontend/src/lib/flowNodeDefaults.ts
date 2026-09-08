import type { CSSProperties } from 'react';
import type { BpmnNodeType } from './flowTypes';

export type FlowNodeColorPreset = {
  fill: string;
  border: string;
  label: string;
};

/** Paleta do pincel — preenchimento claro + borda mais escura */
export const FLOW_NODE_COLOR_PRESETS: FlowNodeColorPreset[] = [
  { fill: '#ffffff', border: '#334155', label: 'Branco' },
  { fill: '#dbeafe', border: '#2563eb', label: 'Azul' },
  { fill: '#ffedd5', border: '#c2410c', label: 'Laranja' },
  { fill: '#dcfce7', border: '#16a34a', label: 'Verde' },
  { fill: '#ffe4e6', border: '#dc2626', label: 'Rosa' },
  { fill: '#f3e8ff', border: '#9333ea', label: 'Roxo' },
];

/** Cores padrão ao criar uma forma nova (paleta / context pad / duplo clique). */
export const FLOW_DEFAULT_NODE_COLORS: Record<
  BpmnNodeType,
  { fillColor?: string; accentColor?: string }
> = {
  bpmnStart: { fillColor: '#dcfce7', accentColor: '#16a34a' },
  bpmnEnd: { fillColor: '#ffe4e6', accentColor: '#dc2626' },
  bpmnTask: { fillColor: '#dbeafe', accentColor: '#000000' },
  bpmnGateway: { fillColor: '#ffedd5', accentColor: '#000000' },
  bpmnParallelGateway: { fillColor: '#f3e8ff', accentColor: '#000000' },
  bpmnDocument: { fillColor: '#ffffff', accentColor: '#000000' },
  bpmnData: { fillColor: '#eef2ff', accentColor: '#4f46e5' },
  bpmnText: {},
  bpmnLane: {},
  bpmnPool: {},
};

export function getDefaultNodeStyle(type: BpmnNodeType | string): {
  fillColor?: string;
  accentColor?: string;
} {
  return FLOW_DEFAULT_NODE_COLORS[type as BpmnNodeType] ?? {};
}

export function getDefaultNodeData(type: BpmnNodeType | string, label?: string) {
  return {
    label: String(label ?? '').trim() || getDefaultLabelForType(type),
    ...getDefaultNodeStyle(type),
  };
}

/** Aplica cores padrão da paleta em nós importados que ainda não têm fill/borda customizados. */
export function applyDefaultColorsToImportedNodes<T extends { type?: string; data?: unknown }>(
  nodes: T[],
): T[] {
  return nodes.map((node) => {
    const type = String(node.type ?? '');
    const defaults = getDefaultNodeStyle(type);
    if (!defaults.fillColor && !defaults.accentColor) return node;

    const current =
      typeof node.data === 'object' && node.data ? (node.data as Record<string, unknown>) : {};

    const hasFill = Boolean(String(current.fillColor ?? '').trim());
    const hasBorder = Boolean(String(current.accentColor ?? '').trim());
    if (hasFill && hasBorder) return node;

    return {
      ...node,
      data: {
        ...defaults,
        ...current,
      },
    };
  });
}

export function getDefaultLabelForType(type: BpmnNodeType | string): string {
  switch (type) {
    case 'bpmnStart':
      return 'Início';
    case 'bpmnEnd':
      return 'Fim';
    case 'bpmnTask':
      return 'Tarefa';
    case 'bpmnGateway':
      return 'Decisão';
    case 'bpmnParallelGateway':
      return 'Paralelo';
    case 'bpmnDocument':
      return 'Documento';
    case 'bpmnData':
      return 'Dados';
    case 'bpmnText':
      return 'Texto';
    case 'bpmnLane':
      return 'Raia';
    case 'bpmnPool':
      return 'Participante';
    default:
      return 'Elemento';
  }
}

export function resolveNodeLabel(node: { type?: string; data?: unknown }): string {
  const raw = String((node.data as { label?: unknown } | undefined)?.label ?? '').trim();
  if (raw) return raw;
  return getDefaultLabelForType(String(node.type ?? 'bpmnTask'));
}

export function ensureNodeLabels<T extends { type?: string; data?: unknown }>(nodes: T[]): T[] {
  return nodes.map((node) => {
    const label = resolveNodeLabel(node);
    const current = String((node.data as { label?: unknown } | undefined)?.label ?? '').trim();
    if (current === label) return node;
    return {
      ...node,
      data: { ...(typeof node.data === 'object' && node.data ? node.data : {}), label },
    };
  });
}

export function getAccentBorderClass(accentColor?: string, fallback = 'border-slate-300 dark:border-slate-600'): string {
  if (!accentColor) return fallback;
  return 'border-[var(--node-accent)]';
}

export function nodeAccentStyle(accentColor?: string, fillColor?: string): CSSProperties | undefined {
  const style: CSSProperties & { '--node-accent'?: string } = {};
  if (accentColor) {
    style.borderColor = accentColor;
    style['--node-accent'] = accentColor;
  }
  if (fillColor) style.backgroundColor = fillColor;
  return Object.keys(style).length ? style : undefined;
}
