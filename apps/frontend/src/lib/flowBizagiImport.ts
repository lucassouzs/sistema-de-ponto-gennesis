import type { Node } from '@xyflow/react';
import { SIZED_IMPORT_NODE_TYPES } from './flowBpmnImportConstants';

type Box = { x: number; y: number; width: number; height: number };

export type BizagiElementColors = {
  fillColor?: string;
  accentColor?: string;
};

function localName(el: Element): string {
  return el.localName.replace(/^[^:]+:/, '');
}

function normalizeColor(value: string | null | undefined): string | undefined {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed.toLowerCase() === 'transparent' || trimmed.toLowerCase() === 'white') {
    return undefined;
  }
  return trimmed;
}

/** Lê bgColor/borderColor das extensões Bizagi por id de elemento. */
export function extractBizagiColorMap(xml: string): Map<string, BizagiElementColors> {
  const map = new Map<string, BizagiElementColors>();
  if (typeof DOMParser === 'undefined') return map;

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) return map;

  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    const id = el.getAttribute('id');
    if (!id) continue;

    let fillColor: string | undefined;
    let accentColor: string | undefined;

    for (const prop of Array.from(el.getElementsByTagName('*'))) {
      if (localName(prop) !== 'BizagiProperty') continue;
      const name = prop.getAttribute('name');
      const value = normalizeColor(prop.getAttribute('value'));
      if (!value) continue;
      if (name === 'bgColor') fillColor = value;
      if (name === 'borderColor') accentColor = value;
    }

    if (fillColor || accentColor) {
      map.set(id, { fillColor, accentColor });
    }
  }

  return map;
}

export function readTextAnnotationContent(el: Element): string {
  for (const child of Array.from(el.children)) {
    if (localName(child) === 'text') {
      return child.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    }
  }
  return el.getAttribute('text')?.replace(/\s+/g, ' ').trim() ?? '';
}

/** Pool Bizagi vazio (ex.: "Processo principal") — sem nós de fluxo dentro dos bounds. */
export function participantHasFlowNodes(
  participantBox: Box,
  nodeBoxes: Array<{ id: string; box: Box; type: string }>,
): boolean {
  return nodeBoxes.some(({ box, type }) => {
    if (type === 'bpmn:Participant' || type === 'bpmn:Lane') return false;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    return (
      cx >= participantBox.x &&
      cx <= participantBox.x + participantBox.width &&
      cy >= participantBox.y &&
      cy <= participantBox.y + participantBox.height
    );
  });
}

/** Preserva width/height exatos do diagrama BPMN (Bizagi usa caixas estreitas ~90px). */
export function normalizeImportedRectStyle(
  mappedType: string,
  width: number,
  height: number,
): { width: number; height: number } | undefined {
  if (!SIZED_IMPORT_NODE_TYPES.has(mappedType)) return undefined;

  return {
    width: Math.round(Math.max(width, 1)),
    height: Math.round(Math.max(height, 1)),
  };
}

export function buildImportedFlowNodeData(
  bpmnType: string,
  label: string,
  colors?: BizagiElementColors,
): Record<string, unknown> {
  const localType = bpmnType.replace(/^bpmn:/i, '').toLowerCase();
  return {
    label,
    importedBpmn: true,
    ...(localType === 'callactivity' ? { isCallActivity: true } : {}),
    ...(colors?.fillColor ? { fillColor: colors.fillColor } : {}),
    ...(colors?.accentColor ? { accentColor: colors.accentColor } : {}),
  };
}

export function applyBizagiColorsToNodes(
  nodes: Node[],
  colorMap: Map<string, BizagiElementColors>,
): Node[] {
  if (colorMap.size === 0) return nodes;

  return nodes.map((node) => {
    const colors = colorMap.get(node.id);
    if (!colors) return node;

    const data = (node.data ?? {}) as Record<string, unknown>;
    return {
      ...node,
      data: {
        ...data,
        ...(colors.fillColor ? { fillColor: colors.fillColor } : {}),
        ...(colors.accentColor ? { accentColor: colors.accentColor } : {}),
      },
    };
  });
}
