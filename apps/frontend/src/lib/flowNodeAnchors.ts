import type { Edge, InternalNode, Node } from '@xyflow/react';
import { EVENT_NODE_SIZE, TASK_NODE_HEIGHT, TASK_NODE_WIDTH } from '@/components/flow/BpmnNodes';
import {
  GATEWAY_DIAMOND_SIZE,
  getGatewayDiamondAnchor,
  isGatewayNodeType,
} from './flowGatewayAnchors';
import {
  inferEdgeHandlesFromGeometry,
  inferOppositeRfHandle,
  ensureRfHandleId,
  rfHandleId,
  anchorSideFromHandleId,
  bothEdgeHandlesDefined,
  resolveConnectionSides,
  FLOW_HANDLE_RADIUS,
  type AnchorSide,
} from './flowEdgeRouting';
import { getAbsolutePosition, getProcessNodeSize, buildNodeMap } from './flowLaneHierarchy';

export { buildNodeMap };

/** nodeLookup traz positionAbsolute ao vivo — nodeMap do store pode atrasar durante drag. */
export function buildLiveNodeMap(
  nodes: Node[],
  nodeLookup: Map<string, InternalNode>,
): Map<string, Node> {
  return new Map(
    nodes.map((node) => {
      const abs = nodeLookup.get(node.id)?.internals.positionAbsolute;
      if (!abs) return [node.id, node] as const;

      if (!node.parentId) {
        return [node.id, { ...node, position: { x: abs.x, y: abs.y } }] as const;
      }

      const parentAbs = node.parentId
        ? nodeLookup.get(node.parentId)?.internals.positionAbsolute
        : undefined;
      if (!parentAbs) return [node.id, node] as const;

      return [
        node.id,
        {
          ...node,
          position: {
            x: abs.x - parentAbs.x,
            y: abs.y - parentAbs.y,
          },
        },
      ] as const;
    }),
  );
}

type Rect = { x: number; y: number; width: number; height: number };

function isEventNodeType(type: string): boolean {
  return type === 'bpmnStart' || type === 'bpmnEnd';
}

function isCanvasTaskType(type: string): boolean {
  return type === 'bpmnTask' || type === 'bpmnDocument' || type === 'bpmnData';
}

function readRectangularNodeSize(node: Node, fallback: { width: number; height: number }): {
  width: number;
  height: number;
} {
  const style = node.style as { width?: number; height?: number } | undefined;
  const width = positiveSize(
    style?.width ?? node.width ?? node.measured?.width,
    fallback.width,
  );
  const height = positiveSize(
    style?.height ?? node.height ?? node.measured?.height,
    fallback.height,
  );
  return { width, height };
}

/** Onde a horizontal y=lineY cruza a borda do círculo (início/fim). */
export function getEventCircleBorderAtLineY(
  rect: Rect,
  side: 'left' | 'right',
  lineY: number,
): { x: number; y: number } {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const r = rect.width / 2;
  const dy = lineY - cy;

  if (Math.abs(dy) <= r - 0.5) {
    const dx = Math.sqrt(r * r - dy * dy);
    return side === 'right' ? { x: cx + dx, y: lineY } : { x: cx - dx, y: lineY };
  }

  const dyClamped = Math.max(-r + 0.5, Math.min(r - 0.5, dy));
  const dx = Math.sqrt(r * r - dyClamped * dyClamped);
  const y = cy + dyClamped;
  return side === 'right' ? { x: cx + dx, y } : { x: cx - dx, y };
}

/** Onde a vertical x=lineX cruza a borda do círculo (início/fim). */
export function getEventCircleBorderAtLineX(
  rect: Rect,
  side: 'top' | 'bottom',
  lineX: number,
): { x: number; y: number } {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const r = rect.width / 2;
  const dx = lineX - cx;

  if (Math.abs(dx) <= r - 0.5) {
    const dy = Math.sqrt(r * r - dx * dx);
    return side === 'bottom' ? { x: lineX, y: cy + dy } : { x: lineX, y: cy - dy };
  }

  const dxClamped = Math.max(-r + 0.5, Math.min(r - 0.5, dx));
  const dy = Math.sqrt(r * r - dxClamped * dxClamped);
  const x = cx + dxClamped;
  return side === 'bottom' ? { x, y: cy + dy } : { x, y: cy - dy };
}

function positiveSize(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getRectAnchor(box: Rect, side: AnchorSide): { x: number; y: number } {
  switch (side) {
    case 'top':
      return { x: box.x + box.width / 2, y: box.y };
    case 'bottom':
      return { x: box.x + box.width / 2, y: box.y + box.height };
    case 'left':
      return { x: box.x, y: box.y + box.height / 2 };
    case 'right':
    default:
      return { x: box.x + box.width, y: box.y + box.height / 2 };
  }
}

export function readNodeShapeRect(
  node: Node | InternalNode,
  nodeMap: Map<string, Node>,
  nodeLookup?: Map<string, InternalNode>,
): Rect {
  const plain = node as Node;
  const internalNode = 'internals' in node ? (node as InternalNode) : null;
  const internal = internalNode?.internals;
  const lookupAbs = nodeLookup?.get(plain.id)?.internals.positionAbsolute;
  const absFromStore = getAbsolutePosition(plain, nodeMap);
  const abs = lookupAbs ?? internal?.positionAbsolute ?? absFromStore;
  const type = String(plain.type ?? '');

  if (isGatewayNodeType(type)) {
    return { x: abs.x, y: abs.y, width: GATEWAY_DIAMOND_SIZE, height: GATEWAY_DIAMOND_SIZE };
  }

  if (type === 'bpmnStart' || type === 'bpmnEnd') {
    return { x: abs.x, y: abs.y, width: EVENT_NODE_SIZE, height: EVENT_NODE_SIZE };
  }

  const fallback = getProcessNodeSize(plain);
  const style = plain.style as { width?: number; height?: number } | undefined;
  const sized =
    isCanvasTaskType(type) && (style?.width || style?.height || plain.width || plain.height)
      ? readRectangularNodeSize(plain, fallback)
      : null;
  const width = positiveSize(
    sized?.width ??
      internalNode?.measured?.width ??
      internal?.bounds?.width ??
      plain.measured?.width ??
      style?.width ??
      plain.width,
    fallback.width,
  );
  const height = positiveSize(
    sized?.height ??
      internalNode?.measured?.height ??
      internal?.bounds?.height ??
      plain.measured?.height ??
      style?.height ??
      plain.height,
    fallback.height,
  );

  return { x: abs.x, y: abs.y, width, height };
}

/** Ponto na borda da forma BPMN (círculo, losango ou retângulo). */
export function getShapeBorderAnchor(
  node: Node | InternalNode,
  nodeMap: Map<string, Node>,
  side: AnchorSide,
  nodeLookup?: Map<string, InternalNode>,
): { x: number; y: number } {
  const rect = readNodeShapeRect(node, nodeMap, nodeLookup);
  const type = String((node as Node).type ?? '');

  if (isGatewayNodeType(type)) {
    return getGatewayDiamondAnchor(rect, side);
  }

  if (isEventNodeType(type)) {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    if (side === 'right' || side === 'left') {
      return getEventCircleBorderAtLineY(rect, side, cy);
    }
    if (side === 'top' || side === 'bottom') {
      return getEventCircleBorderAtLineX(rect, side, cx);
    }
  }

  return getRectAnchor(rect, side);
}

function sideFromHandlePosition(position: unknown): AnchorSide | null {
  const value = String(position ?? '').toLowerCase();
  if (value === 'top' || value === 'right' || value === 'bottom' || value === 'left') {
    return value as AnchorSide;
  }
  return null;
}

type MeasuredHandleBound = {
  id?: string | null;
  position: unknown;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

function boundsMatchStoredHandle(
  boundId: string | null | undefined,
  storedHandle: string | null | undefined,
): boolean {
  if (!boundId || !storedHandle) return false;
  if (boundId === storedHandle) return true;
  const boundSide = anchorSideFromHandleId(boundId);
  const storedSide = anchorSideFromHandleId(storedHandle);
  return boundSide !== null && boundSide === storedSide;
}

/** Centro relativo ao nó — só por id quando informado; senão pelo lado. */
function resolveHandleCenterRelative(
  bounds: MeasuredHandleBound[],
  handleId: string | null | undefined,
  side: AnchorSide,
): { x: number; y: number } | null {
  const trimmedId = handleId?.trim();

  if (trimmedId) {
    const byId = bounds.filter((item) => boundsMatchStoredHandle(item.id, trimmedId));
    if (byId.length > 0) {
      let sumX = 0;
      let sumY = 0;
      for (const handle of byId) {
        const hw = handle.width ?? FLOW_HANDLE_RADIUS * 2;
        const hh = handle.height ?? FLOW_HANDLE_RADIUS * 2;
        sumX += handle.x + hw / 2;
        sumY += handle.y + hh / 2;
      }
      return { x: sumX / byId.length, y: sumY / byId.length };
    }
  }

  const bySide = bounds.filter((item) => sideFromHandlePosition(item.position) === side);
  if (bySide.length === 0) return null;

  let sumX = 0;
  let sumY = 0;
  for (const handle of bySide) {
    const hw = handle.width ?? FLOW_HANDLE_RADIUS * 2;
    const hh = handle.height ?? FLOW_HANDLE_RADIUS * 2;
    sumX += handle.x + hw / 2;
    sumY += handle.y + hh / 2;
  }
  return { x: sumX / bySide.length, y: sumY / bySide.length };
}

/** Mesma posição das bolinhas visíveis (centro do handle medido pelo React Flow). */
export function getNodeHandleAnchor(
  node: Node | InternalNode,
  nodeMap: Map<string, Node>,
  nodeLookup: Map<string, InternalNode> | undefined,
  handleId: string | null | undefined,
  side: AnchorSide,
): { x: number; y: number } {
  const effectiveSide = anchorSideFromHandleId(handleId) ?? side;
  const plain = node as Node;
  const lookupNode = nodeLookup?.get(plain.id) ?? (node as InternalNode);
  const abs = lookupNode.internals?.positionAbsolute;
  const handleBounds = lookupNode.internals?.handleBounds;
  const bounds = [
    ...(handleBounds?.source ?? []),
    ...(handleBounds?.target ?? []),
  ];

  if (abs && bounds.length > 0) {
    const center = resolveHandleCenterRelative(bounds, handleId, effectiveSide);
    if (center) {
      return { x: abs.x + center.x, y: abs.y + center.y };
    }
  }

  const type = String(plain.type ?? '');
  if (isEventNodeType(type) || isGatewayNodeType(type)) {
    return getShapeBorderAnchor(node, nodeMap, effectiveSide, nodeLookup);
  }

  return getRectAnchor(readNodeShapeRect(node, nodeMap, nodeLookup), effectiveSide);
}

/** Mesma lógica de borda, com origem absoluta já resolvida (positionAbsolute do React Flow). */
export function readNodeShapeRectAtAbs(node: Node, abs: { x: number; y: number }): Rect {
  const type = String(node.type ?? '');

  if (isGatewayNodeType(type)) {
    return { x: abs.x, y: abs.y, width: GATEWAY_DIAMOND_SIZE, height: GATEWAY_DIAMOND_SIZE };
  }
  if (type === 'bpmnStart' || type === 'bpmnEnd') {
    return { x: abs.x, y: abs.y, width: EVENT_NODE_SIZE, height: EVENT_NODE_SIZE };
  }

  const fallback = getProcessNodeSize(node);
  const sized = isCanvasTaskType(type)
    ? readRectangularNodeSize(node, fallback)
    : {
        width: positiveSize(node.measured?.width ?? node.width, fallback.width),
        height: positiveSize(node.measured?.height ?? node.height, fallback.height),
      };
  return {
    x: abs.x,
    y: abs.y,
    width: sized.width,
    height: sized.height,
  };
}

export function getShapeBorderAnchorAtAbs(
  node: Node,
  abs: { x: number; y: number },
  side: AnchorSide,
): { x: number; y: number } {
  const type = String(node.type ?? '');
  const rect = readNodeShapeRectAtAbs(node, abs);

  if (isGatewayNodeType(type)) {
    return getGatewayDiamondAnchor(rect, side);
  }

  return getRectAnchor(rect, side);
}

const HANDLE_SIDES: AnchorSide[] = ['top', 'right', 'bottom', 'left'];

function handleDistanceSq(
  node: Node,
  nodeMap: Map<string, Node>,
  nodeLookup: Map<string, InternalNode> | undefined,
  side: AnchorSide,
  pointer: { x: number; y: number },
): number {
  const anchor = getNodeHandleAnchor(node, nodeMap, nodeLookup, side, side);
  const dx = pointer.x - anchor.x;
  const dy = pointer.y - anchor.y;
  return dx * dx + dy * dy;
}

/** Handle (bolinha) mais próximo do ponteiro — distância pura, sem viés geométrico. */
export function inferNearestHandleFromPointer(
  node: Node,
  nodeMap: Map<string, Node>,
  nodeLookup: Map<string, InternalNode> | undefined,
  pointer: { x: number; y: number },
): AnchorSide {
  let bestSide: AnchorSide = 'left';
  let bestDist = Infinity;

  for (const side of HANDLE_SIDES) {
    const dist = handleDistanceSq(node, nodeMap, nodeLookup, side, pointer);
    if (dist < bestDist) {
      bestDist = dist;
      bestSide = side;
    }
  }

  return bestSide;
}

/** Handles salvos na edge — só infere quando ambos ausentes; nunca sobrescreve manual. */
export function resolveLiveEdgeHandles(
  sourceId: string,
  targetId: string,
  nodeMap: Map<string, Node>,
  nodeLookup: Map<string, InternalNode>,
  storedSourceHandle?: string | null,
  storedTargetHandle?: string | null,
): { sourceHandle: string; targetHandle: string } {
  const src = storedSourceHandle?.trim() || null;
  const tgt = storedTargetHandle?.trim() || null;

  if (src && tgt) {
    return {
      sourceHandle: ensureRfHandleId(src, 'source') ?? src,
      targetHandle: ensureRfHandleId(tgt, 'target') ?? tgt,
    };
  }

  if (src) {
    const sourceHandle = ensureRfHandleId(src, 'source') ?? src;
    return { sourceHandle, targetHandle: inferOppositeRfHandle(sourceHandle, 'target') };
  }

  if (tgt) {
    const targetHandle = ensureRfHandleId(tgt, 'target') ?? tgt;
    return { sourceHandle: inferOppositeRfHandle(targetHandle, 'source'), targetHandle: tgt };
  }

  const sourceNode = nodeLookup.get(sourceId);
  const targetNode = nodeLookup.get(targetId);
  if (!sourceNode || !targetNode) {
    return { sourceHandle: rfHandleId('source', 'right'), targetHandle: rfHandleId('target', 'left') };
  }

  const sourceRect = readNodeShapeRect(sourceNode, nodeMap, nodeLookup);
  const targetRect = readNodeShapeRect(targetNode, nodeMap, nodeLookup);
  const inferred = inferEdgeHandlesFromGeometry(sourceRect, targetRect);

  return {
    sourceHandle: rfHandleId('source', (inferred.sourceHandle ?? 'right') as AnchorSide),
    targetHandle: rfHandleId('target', (inferred.targetHandle ?? 'left') as AnchorSide),
  };
}

/** Âncoras na borda — coordenadas exatas do handle escolhido. */
export function resolveFlowEdgeAnchors(params: {
  sourceNode: Node | InternalNode;
  targetNode: Node | InternalNode;
  nodeMap: Map<string, Node>;
  nodeLookup?: Map<string, InternalNode>;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  sourcePosition?: string | null;
  targetPosition?: string | null;
}): {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  fromSide: AnchorSide;
  toSide: AnchorSide;
} {
  const bothDefined = bothEdgeHandlesDefined(params.sourceHandle, params.targetHandle);

  const { fromSide, toSide } = resolveConnectionSides({
    sourceHandle: params.sourceHandle,
    targetHandle: params.targetHandle,
    ...(bothDefined
      ? {}
      : {
          sourcePosition: params.sourcePosition,
          targetPosition: params.targetPosition,
        }),
  });

  const sourceRect = readNodeShapeRect(params.sourceNode, params.nodeMap, params.nodeLookup);
  const targetRect = readNodeShapeRect(params.targetNode, params.nodeMap, params.nodeLookup);

  const sourceType = String((params.sourceNode as Node).type ?? '');
  const targetType = String((params.targetNode as Node).type ?? '');

  const tgtCx = targetRect.x + targetRect.width / 2;
  const srcCx = sourceRect.x + sourceRect.width / 2;
  const sourceIsEvent = isEventNodeType(sourceType);
  const targetIsEvent = isEventNodeType(targetType);
  const isForwardHorizontal =
    fromSide === 'right' && toSide === 'left' && tgtCx > srcCx + 4;
  const isVerticalHandles = fromSide === 'bottom' && toSide === 'top';

  let sourceAnchor = getNodeHandleAnchor(
    params.sourceNode,
    params.nodeMap,
    params.nodeLookup,
    params.sourceHandle,
    fromSide,
  );
  let targetAnchor = getNodeHandleAnchor(
    params.targetNode,
    params.nodeMap,
    params.nodeLookup,
    params.targetHandle,
    toSide,
  );

  // Ajuste de círculo BPMN — só quando handles não foram escolhidos manualmente (ambos ausentes).
  if (!bothDefined && isForwardHorizontal && (sourceIsEvent || targetIsEvent)) {
    const lineY = sourceIsEvent
      ? targetAnchor.y
      : targetIsEvent
        ? sourceAnchor.y
        : sourceAnchor.y;

    if (sourceIsEvent) {
      sourceAnchor = getEventCircleBorderAtLineY(sourceRect, 'right', lineY);
    }
    if (targetIsEvent) {
      targetAnchor = getEventCircleBorderAtLineY(targetRect, 'left', lineY);
    }
  } else if (!bothDefined && isVerticalHandles && (sourceIsEvent || targetIsEvent)) {
    const lineX = sourceIsEvent
      ? targetAnchor.x
      : targetIsEvent
        ? sourceAnchor.x
        : sourceAnchor.x;

    if (sourceIsEvent) {
      sourceAnchor = getEventCircleBorderAtLineX(sourceRect, 'bottom', lineX);
    }
    if (targetIsEvent) {
      targetAnchor = getEventCircleBorderAtLineX(targetRect, 'top', lineX);
    }
  }

  return {
    sourceX: sourceAnchor.x,
    sourceY: sourceAnchor.y,
    targetX: targetAnchor.x,
    targetY: targetAnchor.y,
    fromSide,
    toSide,
  };
}

/** Alinha início/fim na faixa Y do destino à direita (corrige círculo abaixo/acima do fluxo). */
export function alignEventNodesToFlowRow(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; aligned: number } {
  const next = nodes.map((node) => ({ ...node, position: { ...node.position } }));
  let aligned = 0;

  for (const node of next) {
    if (!isEventNodeType(String(node.type ?? ''))) continue;

    const outgoing = edges.filter((edge) => edge.source === node.id);
    if (outgoing.length === 0) continue;

    const nodeMap = buildNodeMap(next);
    let deltaY: number | null = null;

    for (const edge of outgoing) {
      const target = next.find((item) => item.id === edge.target);
      if (!target) continue;

      const sourceRect = readNodeShapeRect(node, nodeMap);
      const targetRect = readNodeShapeRect(target, nodeMap);
      const tgtCx = targetRect.x + targetRect.width / 2;
      const srcCx = sourceRect.x + sourceRect.width / 2;
      if (tgtCx <= srcCx + 4) continue;

      const dy = targetRect.y + targetRect.height / 2 - (sourceRect.y + sourceRect.height / 2);
      if (Math.abs(dy) < 1) continue;
      if (deltaY === null || Math.abs(dy) > Math.abs(deltaY)) deltaY = dy;
    }

    if (deltaY !== null && Math.abs(deltaY) >= 1) {
      node.position = { ...node.position, y: node.position.y + deltaY };
      aligned += 1;
    }
  }

  return { nodes: next, aligned };
}

/** Garante 150×64 em tarefas criadas no canvas (âncoras = caixa visual). */
export function normalizeCanvasTaskDimensions(nodes: Node[]): Node[] {
  return nodes.map((node) => {
    if (!isCanvasTaskType(String(node.type ?? ''))) return node;
    const data = node.data as { importedBpmn?: boolean } | undefined;
    if (data?.importedBpmn) return node;

    const style = node.style as { width?: number; height?: number } | undefined;
    if (
      style?.width === TASK_NODE_WIDTH &&
      style?.height === TASK_NODE_HEIGHT &&
      node.width === TASK_NODE_WIDTH &&
      node.height === TASK_NODE_HEIGHT
    ) {
      return node;
    }

    return {
      ...node,
      width: TASK_NODE_WIDTH,
      height: TASK_NODE_HEIGHT,
      style: { ...(node.style as object), width: TASK_NODE_WIDTH, height: TASK_NODE_HEIGHT },
    };
  });
}
