import type { Edge, Node } from '@xyflow/react';
import { nextFlowNodeId, stripPreviewElements } from './flowAppend';
import {
  buildNodeMap,
  getAbsolutePosition,
  getLaneSize,
  LANE_NODE_TYPE,
  syncLaneHierarchy,
} from './flowLaneHierarchy';
import { normalizeFlowEdge } from './flowEdge';
import { isStructuralFlowNode, POOL_NODE_TYPE } from './flowPoolHierarchy';
import type { BpmnNodeType } from './flowTypes';

const PASTE_OFFSET = 48;

export type FlowClipboardPayload = {
  kind: 'lane' | 'selection';
  nodes: Node[];
  edges: Edge[];
  anchor: { x: number; y: number };
};

function cloneNode(node: Node): Node {
  const next = structuredClone(node);
  next.selected = false;
  next.dragging = false;
  return next;
}

function cloneEdge(edge: Edge): Edge {
  const next = structuredClone(edge);
  next.selected = false;
  return next;
}

function isCopyableProcessNode(node: Node): boolean {
  const type = String(node.type ?? '');
  if (type.startsWith('ai-panel-')) return false;
  if (isStructuralFlowNode(type)) return false;
  return true;
}

function collectLaneNodeIds(nodes: Node[], laneId: string): Set<string> {
  const ids = new Set<string>([laneId]);
  for (const node of nodes) {
    if (node.parentId === laneId) ids.add(node.id);
  }
  return ids;
}

function computeAnchor(nodeMap: Map<string, Node>, nodeIds: Set<string>): { x: number; y: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;

  for (const id of nodeIds) {
    const node = nodeMap.get(id);
    if (!node) continue;
    const abs = getAbsolutePosition(node, nodeMap);
    minX = Math.min(minX, abs.x);
    minY = Math.min(minY, abs.y);
  }

  if (!Number.isFinite(minX)) return { x: 0, y: 0 };
  return { x: minX, y: minY };
}

function normalizeSelectionNodes(nodes: Node[], nodeIds: Set<string>): Node[] {
  const nodeMap = buildNodeMap(nodes);

  return nodes
    .filter((node) => nodeIds.has(node.id))
    .map((node) => {
      const cloned = cloneNode(node);
      if (cloned.parentId && !nodeIds.has(cloned.parentId)) {
        const abs = getAbsolutePosition(cloned, nodeMap);
        const detached: Node = { ...cloned, position: { x: abs.x, y: abs.y } };
        delete detached.parentId;
        delete detached.extent;
        return detached;
      }
      return cloned;
    });
}

function resolveNodeType(node: Node): BpmnNodeType {
  return (node.type ?? 'bpmnTask') as BpmnNodeType;
}

function nextMappedId(oldId: string, node: Node, idMap: Map<string, string>): string {
  const existing = idMap.get(oldId);
  if (existing) return existing;

  const nextId = nextFlowNodeId(resolveNodeType(node));
  idMap.set(oldId, nextId);
  return nextId;
}

/** Copia raia(s) selecionada(s) ou elemento(s) avulsos + conexões internas. */
export function copyFlowSelection(nodes: Node[], edges: Edge[]): FlowClipboardPayload | null {
  const cleanNodes = stripPreviewElements(nodes);
  const cleanEdges = stripPreviewElements(edges);
  const nodeMap = buildNodeMap(cleanNodes);

  const selectedLanes = cleanNodes.filter((node) => node.selected && node.type === LANE_NODE_TYPE);
  const nodeIds = new Set<string>();

  if (selectedLanes.length > 0) {
    for (const lane of selectedLanes) {
      for (const id of collectLaneNodeIds(cleanNodes, lane.id)) {
        nodeIds.add(id);
      }
    }
  } else {
    for (const node of cleanNodes) {
      if (!node.selected) continue;
      if (node.type === POOL_NODE_TYPE) continue;
      if (isCopyableProcessNode(node) || node.type === 'bpmnText') {
        nodeIds.add(node.id);
      }
    }
  }

  if (nodeIds.size === 0) {
    for (const edge of cleanEdges) {
      if (!edge.selected) continue;
      nodeIds.add(edge.source);
      nodeIds.add(edge.target);
    }
  }

  if (nodeIds.size === 0) return null;

  const copiedNodes =
    selectedLanes.length > 0
      ? cleanNodes.filter((node) => nodeIds.has(node.id)).map(cloneNode)
      : normalizeSelectionNodes(cleanNodes, nodeIds);

  const copiedEdges = cleanEdges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map(cloneEdge);

  return {
    kind: selectedLanes.length > 0 ? 'lane' : 'selection',
    nodes: copiedNodes,
    edges: copiedEdges,
    anchor: computeAnchor(nodeMap, nodeIds),
  };
}

function resolvePasteOffset(
  payload: FlowClipboardPayload,
  options?: { targetPosition?: { x: number; y: number }; pasteCount?: number },
): { x: number; y: number } {
  const pasteCount = Math.max(1, options?.pasteCount ?? 1);

  if (options?.targetPosition) {
    const base = {
      x: options.targetPosition.x - payload.anchor.x,
      y: options.targetPosition.y - payload.anchor.y,
    };
    const nudge = PASTE_OFFSET * (pasteCount - 1);
    return { x: base.x + nudge, y: base.y + nudge };
  }

  if (payload.kind === 'lane') {
    const lane = payload.nodes.find((node) => node.type === LANE_NODE_TYPE);
    if (lane) {
      return { x: 0, y: getLaneSize(lane).height * pasteCount };
    }
  }

  const step = PASTE_OFFSET * pasteCount;
  return { x: step, y: step };
}

/** Cola conteúdo copiado com novos ids; reposiciona e seleciona o resultado. */
export function pasteFlowClipboard(
  payload: FlowClipboardPayload,
  nodes: Node[],
  edges: Edge[],
  options?: { targetPosition?: { x: number; y: number }; pasteCount?: number },
): { nodes: Node[]; edges: Edge[] } {
  const offset = resolvePasteOffset(payload, options);
  const idMap = new Map<string, string>();
  const payloadMap = buildNodeMap(payload.nodes);
  const copiedNodeIds = new Set(payload.nodes.map((node) => node.id));

  const pastedNodes: Node[] = payload.nodes.map((node) => {
    const newId = nextMappedId(node.id, node, idMap);
    const type = String(node.type ?? '');

    if (type === LANE_NODE_TYPE) {
      return {
        ...node,
        id: newId,
        selected: true,
        dragging: false,
        position: {
          x: node.position.x + offset.x,
          y: node.position.y + offset.y,
        },
      };
    }

    if (node.parentId && copiedNodeIds.has(node.parentId)) {
      return {
        ...node,
        id: newId,
        parentId: idMap.get(node.parentId),
        selected: true,
        dragging: false,
        position: { ...node.position },
      };
    }

    const abs = getAbsolutePosition(node, payloadMap);
    return {
      ...node,
      id: newId,
      selected: true,
      dragging: false,
      position: {
        x: abs.x + offset.x,
        y: abs.y + offset.y,
      },
      parentId: undefined,
      extent: undefined,
    };
  });

  const pastedEdges = payload.edges.map((edge) =>
    normalizeFlowEdge({
      ...edge,
      id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
      selected: false,
    }),
  );

  const mergedNodes = syncLaneHierarchy([
    ...nodes.map((node) => ({ ...node, selected: false })),
    ...pastedNodes,
  ]);

  return {
    nodes: mergedNodes,
    edges: [...stripPreviewElements(edges), ...pastedEdges],
  };
}
