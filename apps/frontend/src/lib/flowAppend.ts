import type { Edge, Node } from '@xyflow/react';
import { TASK_NODE_HEIGHT, TASK_NODE_WIDTH } from '@/components/flow/BpmnNodes';
import type { BpmnNodeType } from './flowTypes';
import { getAbsolutePosition, buildNodeMap } from './flowLaneHierarchy';
import {
  alignEventNodesToFlowRow,
  getEventCircleBorderAtLineY,
  getShapeBorderAnchorAtAbs,
  normalizeCanvasTaskDimensions,
  readNodeShapeRect,
  readNodeShapeRectAtAbs,
} from './flowNodeAnchors';

export const FLOW_PREVIEW_NODE_ID = '__flow_preview_node__';
export const FLOW_PREVIEW_EDGE_ID = '__flow_preview_edge__';

const APPEND_GAP = 72;
const CIRCLE_SIZE = 48;

export type AppendPlacement = {
  position: { x: number; y: number };
  /** Ajuste em position.y do nó origem para alinhar início/fim à faixa do fluxo */
  sourceAdjustY?: number;
};

function getDefaultAppendNodeSize(type: string): { width: number; height: number } {
  switch (type) {
    case 'bpmnStart':
    case 'bpmnEnd':
      return { width: CIRCLE_SIZE, height: CIRCLE_SIZE };
    case 'bpmnGateway':
    case 'bpmnParallelGateway':
      return { width: 56, height: 56 };
    case 'bpmnLane':
      return { width: 1200, height: 120 };
    case 'bpmnText':
      return { width: 120, height: 36 };
    case 'bpmnTask':
      return { width: TASK_NODE_WIDTH, height: TASK_NODE_HEIGHT };
    default:
      return { width: TASK_NODE_WIDTH, height: TASK_NODE_HEIGHT };
  }
}

function isEventNodeType(type: string): boolean {
  return type === 'bpmnStart' || type === 'bpmnEnd';
}

function isCanvasTaskType(type: string): boolean {
  return type === 'bpmnTask' || type === 'bpmnDocument' || type === 'bpmnData';
}

/** Dimensões explícitas ao encadear — bate com a caixa visual e as âncoras. */
export function buildAppendedFlowNodeFields(
  type: BpmnNodeType,
): Pick<Node, 'width' | 'height' | 'style'> | Record<string, never> {
  if (!isCanvasTaskType(type)) return {};

  const size = getDefaultAppendNodeSize(type);
  return {
    width: size.width,
    height: size.height,
    style: { width: size.width, height: size.height },
  };
}

/** Faixa Y horizontal do fluxo ao encadear à direita (centro vertical alinhado). */
function resolveAppendFlowRowY(
  sourceNode: Node,
  nodeMap: Map<string, Node>,
  sourceRect: { x: number; y: number; width: number; height: number },
  edges: Array<{ source: string; target: string }>,
): number {
  const srcCx = sourceRect.x + sourceRect.width / 2;
  const sourceCenterY = sourceRect.y + sourceRect.height / 2;

  for (const edge of edges) {
    if (edge.source !== sourceNode.id) continue;
    const target = nodeMap.get(edge.target);
    if (!target || isPreviewId(target.id)) continue;
    const targetRect = readNodeShapeRect(target, nodeMap);
    if (targetRect.x + targetRect.width / 2 > srcCx + 4) {
      return targetRect.y + targetRect.height / 2;
    }
  }

  return sourceCenterY;
}

export function getAppendPlacement(
  sourceNode: Node,
  targetType: BpmnNodeType,
  allNodes?: Node[],
  sourcePositionAbsolute?: { x: number; y: number },
  edges: Array<{ source: string; target: string }> = [],
): AppendPlacement {
  const nodeMap = allNodes ? buildNodeMap(allNodes) : buildNodeMap([sourceNode]);
  const abs = sourcePositionAbsolute ?? getAbsolutePosition(sourceNode, nodeMap);
  const sourceRect = readNodeShapeRectAtAbs(sourceNode, abs);
  const sourceType = String(sourceNode.type ?? '');
  const sourceCenterY = sourceRect.y + sourceRect.height / 2;

  const flowRowY = resolveAppendFlowRowY(sourceNode, nodeMap, sourceRect, edges);
  const targetSize = getDefaultAppendNodeSize(targetType);

  const sourceExit = isEventNodeType(sourceType)
    ? getEventCircleBorderAtLineY(sourceRect, 'right', flowRowY)
    : (() => {
        const anchor = getShapeBorderAnchorAtAbs(sourceNode, abs, 'right');
        return { x: anchor.x, y: flowRowY };
      })();

  const absPosition = {
    x: sourceExit.x + APPEND_GAP,
    y: flowRowY - targetSize.height / 2,
  };

  let position = absPosition;
  if (sourceNode.parentId) {
    const parent = nodeMap.get(sourceNode.parentId);
    if (parent) {
      const parentAbs = getAbsolutePosition(parent, nodeMap);
      position = {
        x: absPosition.x - parentAbs.x,
        y: absPosition.y - parentAbs.y,
      };
    }
  }

  let sourceAdjustY: number | undefined;
  if (isEventNodeType(sourceType) && Math.abs(sourceCenterY - flowRowY) >= 1) {
    sourceAdjustY = flowRowY - sourceCenterY;
  }

  return { position, sourceAdjustY };
}

export function getAppendPosition(
  sourceNode: Node,
  targetType: BpmnNodeType,
  allNodes?: Node[],
  sourcePositionAbsolute?: { x: number; y: number },
  edges: Array<{ source: string; target: string }> = [],
): { x: number; y: number } {
  return getAppendPlacement(sourceNode, targetType, allNodes, sourcePositionAbsolute, edges).position;
}

/** Posiciona o próximo nó e alinha início/fim ao fluxo — use ao encadear pelo botão +. */
export function applyAppendToNodes(
  nodes: Node[],
  edges: Edge[],
  sourceNodeId: string,
  newNode: Node,
  sourceAdjustY?: number,
): Node[] {
  let next = nodes.map((node) => {
    if (node.id === sourceNodeId && sourceAdjustY !== undefined) {
      return { ...node, position: { ...node.position, y: node.position.y + sourceAdjustY } };
    }
    return node;
  });

  next = [...next, newNode];
  next = normalizeCanvasTaskDimensions(next);
  return alignEventNodesToFlowRow(next, edges).nodes;
}

export function nextFlowNodeId(type: BpmnNodeType): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function isPreviewId(id: string): boolean {
  return id === FLOW_PREVIEW_NODE_ID || id === FLOW_PREVIEW_EDGE_ID;
}

export function stripPreviewElements<T extends { id: string }>(items: T[]): T[] {
  return items.filter((item) => !isPreviewId(item.id));
}
