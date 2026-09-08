import type { Connection, Edge, InternalNode, Node } from '@xyflow/react';
import type { StepPathOptions } from '@xyflow/system';
import type { CSSProperties } from 'react';
import { FLOW_SEQUENCEFLOW_MARKER_URL } from './flowArrowMarkers';
import { isPreviewId } from './flowAppend';
import { inferEdgeHandlesFromGeometry, inferOppositeHandle, inferOppositeRfHandle, ensureRfHandleId, rfHandleId, anchorSideFromHandleId, type AnchorSide, type Point } from './flowEdgeRouting';
import { buildNodeMap, getAbsolutePosition, getProcessNodeSize } from './flowLaneHierarchy';
import { inferNearestHandleFromPointer } from './flowNodeAnchors';
import { isStructuralFlowNode } from './flowPoolHierarchy';

/** Linha em degraus (90°), estilo BPMN clássico */
export const FLOW_EDGE_TYPE = 'step';

export type FlowEdgeLabelPosition = { x: number; y: number };

export type FlowEdgeData = {
  label?: string;
  editLabel?: boolean;
  labelPosition?: FlowEdgeLabelPosition;
  /** Pontos intermediários — arraste para moldar a rota da seta */
  routePoints?: FlowEdgeLabelPosition[];
  /** Linha tracejada BPMN (anotação ↔ tarefa) — sem seta preenchida */
  isAssociation?: boolean;
  /** Conexão manual handle→handle — nunca re-inferir lados */
  handlesPinned?: boolean;
};

export type FlowStepEdge = Edge<FlowEdgeData, typeof FLOW_EDGE_TYPE> & {
  pathOptions?: StepPathOptions;
};

export const FLOW_ASSOCIATION_EDGE_CLASS = 'flow-bpmn-association';

/** Contraste no tema claro (slate-600) */
export const FLOW_EDGE_STROKE = '#475569';
/** Contraste no tema escuro (slate-200) — aplicado via CSS no canvas */
export const FLOW_EDGE_STROKE_DARK = '#e2e8f0';
export const FLOW_EDGE_STROKE_WIDTH = 2.25;

/** Seta preenchida — URL estável registrada em FlowSequenceFlowMarkerDefs */
export const FLOW_ARROW_MARKER = FLOW_SEQUENCEFLOW_MARKER_URL;

export const FLOW_EDGE_PATH_OPTIONS = {
  borderRadius: 0,
  /** 0 evita segundo segmento horizontal paralelo (linha “fantasma” ao lado da seta) */
  offset: 0,
};

export function buildFlowEdge(params: {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
  className?: string;
  style?: CSSProperties;
  sourceHandle?: string;
  targetHandle?: string;
}): FlowStepEdge {
  return {
    id: params.id,
    source: params.source,
    target: params.target,
    label: params.label,
    animated: params.animated,
    className: params.className,
    type: FLOW_EDGE_TYPE,
    markerEnd: FLOW_ARROW_MARKER,
    pathOptions: FLOW_EDGE_PATH_OPTIONS,
    sourceHandle: params.sourceHandle,
    targetHandle: params.targetHandle,
    style: {
      strokeWidth: FLOW_EDGE_STROKE_WIDTH,
      stroke: FLOW_EDGE_STROKE,
      ...params.style,
    },
  };
}

/** Seta da frente para frente (esquerda→direita) — padrão ao encadear passos no canvas. */
export function buildForwardFlowEdge(
  params: Omit<Parameters<typeof buildFlowEdge>[0], 'sourceHandle' | 'targetHandle'>,
): Edge {
  return buildFlowEdge({
    ...params,
    sourceHandle: rfHandleId('source', 'right'),
    targetHandle: rfHandleId('target', 'left'),
  });
}

export function buildAssociationEdge(params: {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  routePoints?: FlowEdgeLabelPosition[];
}): FlowStepEdge {
  return {
    id: params.id,
    source: params.source,
    target: params.target,
    type: FLOW_EDGE_TYPE,
    markerEnd: undefined,
    className: FLOW_ASSOCIATION_EDGE_CLASS,
    pathOptions: FLOW_EDGE_PATH_OPTIONS,
    sourceHandle: params.sourceHandle,
    targetHandle: params.targetHandle,
    selectable: true,
    style: {
      strokeWidth: 1.5,
      stroke: FLOW_EDGE_STROKE,
      strokeDasharray: '6 4',
    },
    data: {
      isAssociation: true,
      ...(params.routePoints?.length ? { routePoints: params.routePoints } : {}),
    },
  };
}

export function normalizeFlowEdge(edge: Edge): Edge {
  const data = (edge.data ?? {}) as FlowEdgeData;
  if (data.isAssociation || edge.className === FLOW_ASSOCIATION_EDGE_CLASS) {
    return {
      ...buildAssociationEdge({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: ensureRfHandleId(edge.sourceHandle, 'source') ?? undefined,
        targetHandle: ensureRfHandleId(edge.targetHandle, 'target') ?? undefined,
        routePoints: data.routePoints,
      }),
      selected: edge.selected,
      selectable: edge.selectable ?? true,
      zIndex: edge.zIndex ?? 8,
      data: {
        ...data,
        isAssociation: true,
        ...(Array.isArray(data.routePoints) ? { routePoints: data.routePoints } : {}),
      },
    };
  }

  return {
    ...buildFlowEdge({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: typeof edge.label === 'string' ? edge.label : undefined,
      animated: edge.animated,
      className: edge.className,
      style: edge.style as CSSProperties | undefined,
    }),
    sourceHandle: ensureRfHandleId(edge.sourceHandle, 'source') ?? undefined,
    targetHandle: ensureRfHandleId(edge.targetHandle, 'target') ?? undefined,
    // Preserva estado de interação (seleção, foco, z-index) — sem isso o clique
    // na seta nunca "grudava" e Delete não funcionava.
    selected: edge.selected,
    selectable: edge.selectable,
    zIndex: edge.zIndex,
    data: {
      ...data,
      ...(typeof edge.label === 'string' ? { label: edge.label } : {}),
      ...(Array.isArray(data.routePoints) ? { routePoints: data.routePoints } : {}),
      ...(edge.sourceHandle?.trim() && edge.targetHandle?.trim()
        ? { handlesPinned: true }
        : data.handlesPinned
          ? { handlesPinned: true }
          : {}),
    },
  };
}

/** Ambos os handles definidos (conexão manual ou importada com lados). */
export function hasDefinedEdgeHandles(edge: {
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: unknown;
}): boolean {
  const data = (edge.data ?? {}) as FlowEdgeData;
  if (data.handlesPinned) return true;
  return Boolean(edge.sourceHandle?.trim() && edge.targetHandle?.trim());
}


export function inferMissingEdgeHandles<T extends Connection | Edge>(
  edge: T,
  nodes: Node[],
): T {
  if (hasDefinedEdgeHandles(edge)) return edge;

  const src = edge.sourceHandle?.trim() || null;
  const tgt = edge.targetHandle?.trim() || null;

  if (src && tgt) {
    return {
      ...edge,
      sourceHandle: ensureRfHandleId(src, 'source') ?? src,
      targetHandle: ensureRfHandleId(tgt, 'target') ?? tgt,
    };
  }

  const nodeMap = buildNodeMap(nodes);
  const source = nodeMap.get(edge.source);
  const target = nodeMap.get(edge.target);
  if (!source || !target) return edge;

  // Só um handle definido — infere o complementar (ex.: right → left), sem forçar top/bottom.
  if (src && !tgt) {
    const sourceHandle = ensureRfHandleId(src, 'source') ?? src;
    return { ...edge, sourceHandle, targetHandle: inferOppositeRfHandle(sourceHandle, 'target') };
  }
  if (!src && tgt) {
    const targetHandle = ensureRfHandleId(tgt, 'target') ?? tgt;
    return { ...edge, sourceHandle: inferOppositeRfHandle(targetHandle, 'source'), targetHandle };
  }

  const srcAbs = getAbsolutePosition(source, nodeMap);
  const tgtAbs = getAbsolutePosition(target, nodeMap);
  const srcSize = getProcessNodeSize(source);
  const tgtSize = getProcessNodeSize(target);
  const inferred = inferEdgeHandlesFromGeometry(
    { x: srcAbs.x, y: srcAbs.y, width: srcSize.width, height: srcSize.height },
    { x: tgtAbs.x, y: tgtAbs.y, width: tgtSize.width, height: tgtSize.height },
  );

  return {
    ...edge,
    sourceHandle: rfHandleId('source', (inferred.sourceHandle as AnchorSide) ?? 'right'),
    targetHandle: rfHandleId('target', (inferred.targetHandle as AnchorSide) ?? 'left'),
  };
}

/** Só infere targetHandle quando ausente — nunca sobrescreve handle escolhido no drop. */
export function refineConnectionTargetFromPointer<T extends Connection | Edge>(
  connection: T,
  nodes: Node[],
  pointer: Point,
  options?: {
    nodeLookup?: Map<string, InternalNode>;
    sourceNode?: Node;
  },
): T {
  const src = connection.sourceHandle?.trim() || null;
  const tgt = connection.targetHandle?.trim() || null;

  if (tgt) {
    return inferMissingEdgeHandles(
      { ...connection, sourceHandle: src, targetHandle: tgt },
      nodes,
    );
  }

  if (hasDefinedEdgeHandles(connection)) {
    return connection;
  }

  if (!connection.target) return inferMissingEdgeHandles(connection, nodes);

  const nodeMap = buildNodeMap(nodes);
  const target = nodeMap.get(connection.target);
  if (!target) return inferMissingEdgeHandles(connection, nodes);

  const targetHandle = inferNearestHandleFromPointer(
    target,
    nodeMap,
    options?.nodeLookup,
    pointer,
  );

  return inferMissingEdgeHandles({ ...connection, targetHandle }, nodes);
}

export function releaseEdgeRoutesForNodes(edges: Edge[], nodeIds: Set<string>): Edge[] {
  if (nodeIds.size === 0) return edges;

  let changed = false;
  const next = edges.map((edge) => {
    if (!nodeIds.has(edge.source) && !nodeIds.has(edge.target)) return edge;
    const data = (edge.data ?? {}) as FlowEdgeData;
    if (!Array.isArray(data.routePoints) || data.routePoints.length === 0) return edge;
    changed = true;
    const nextData = { ...data };
    delete nextData.routePoints;
    return normalizeFlowEdge({ ...edge, data: nextData });
  });

  return changed ? next : edges;
}

/** Após mover nós: limpa rotas salvas; só infere handles se ainda não existirem. */
export function syncEdgeHandlesForMovedNodes(
  nodes: Node[],
  edges: Edge[],
  movedNodeIds: Set<string>,
): Edge[] {
  if (movedNodeIds.size === 0) return edges;

  const nodeMap = buildNodeMap(nodes);
  let changed = false;

  const next = edges.map((edge) => {
    if (!movedNodeIds.has(edge.source) && !movedNodeIds.has(edge.target)) return edge;

    const data = (edge.data ?? {}) as FlowEdgeData;
    const nextData = { ...data };
    const hadRoute = Array.isArray(data.routePoints) && data.routePoints.length > 0;
    if (hadRoute) delete nextData.routePoints;

    if (hasDefinedEdgeHandles(edge)) {
      if (!hadRoute) return edge;
      changed = true;
      return normalizeFlowEdge({ ...edge, data: nextData });
    }

    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) return edge;

    const srcAbs = getAbsolutePosition(source, nodeMap);
    const tgtAbs = getAbsolutePosition(target, nodeMap);
    const srcSize = getProcessNodeSize(source);
    const tgtSize = getProcessNodeSize(target);
    const inferred = inferEdgeHandlesFromGeometry(
      { x: srcAbs.x, y: srcAbs.y, width: srcSize.width, height: srcSize.height },
      { x: tgtAbs.x, y: tgtAbs.y, width: tgtSize.width, height: tgtSize.height },
    );

    const nextSourceHandle = rfHandleId(
      'source',
      (inferred.sourceHandle ?? anchorSideFromHandleId(edge.sourceHandle) ?? 'right') as AnchorSide,
    );
    const nextTargetHandle = rfHandleId(
      'target',
      (inferred.targetHandle ?? anchorSideFromHandleId(edge.targetHandle) ?? 'left') as AnchorSide,
    );

    if (
      edge.sourceHandle === nextSourceHandle &&
      edge.targetHandle === nextTargetHandle &&
      !hadRoute
    ) {
      return edge;
    }

    changed = true;
    return normalizeFlowEdge({
      ...edge,
      sourceHandle: nextSourceHandle,
      targetHandle: nextTargetHandle,
      data: nextData,
    });
  });

  return changed ? next : edges;
}

/** Remove dobras salvas e recalcula handles — setas retas onde couber. */
export function straightenFlowEdges(
  nodes: Node[],
  edges: Edge[],
): { edges: Edge[]; straightenedCount: number } {
  let straightenedCount = 0;

  const next = edges.map((edge) => {
    const data = (edge.data ?? {}) as FlowEdgeData;
    const hadRoute = Array.isArray(data.routePoints) && data.routePoints.length > 0;
    const withHandles = inferMissingEdgeHandles(edge, nodes);
    const nextData = { ...(withHandles.data as FlowEdgeData) };
    delete nextData.routePoints;
    delete nextData.labelPosition;

    if (hadRoute) straightenedCount += 1;

    return normalizeFlowEdge({
      ...withHandles,
      data: nextData,
    });
  });

  return { edges: next, straightenedCount };
}

export function flowEdgeDefaults() {
  return {
    type: FLOW_EDGE_TYPE,
    markerEnd: FLOW_ARROW_MARKER,
    pathOptions: FLOW_EDGE_PATH_OPTIONS,
    style: { strokeWidth: FLOW_EDGE_STROKE_WIDTH, stroke: FLOW_EDGE_STROKE },
  };
}

const ROUTE_POINT_NODE_MARGIN = 56;

function nodeBounds(node: Node, nodeMap: Map<string, Node>) {
  const abs = getAbsolutePosition(node, nodeMap);
  const size = getProcessNodeSize(node);
  return { x: abs.x, y: abs.y, width: size.width, height: size.height };
}

function pointNearBounds(point: Point, bounds: ReturnType<typeof nodeBounds>, margin: number): boolean {
  return (
    point.x >= bounds.x - margin &&
    point.x <= bounds.x + bounds.width + margin &&
    point.y >= bounds.y - margin &&
    point.y <= bounds.y + bounds.height + margin
  );
}

/** Remove dobras salvas longe dos nós — evita trechos “fantasma” após mover elementos. */
function sanitizeEdgeRoutePoints(nodes: Node[], edge: Edge): Edge {
  const data = (edge.data ?? {}) as FlowEdgeData;
  const routePoints = data.routePoints;
  if (!Array.isArray(routePoints) || routePoints.length === 0) {
    return hasDefinedEdgeHandles(edge) ? edge : inferMissingEdgeHandles(edge, nodes);
  }

  const nodeMap = buildNodeMap(nodes);
  const source = nodeMap.get(edge.source);
  const target = nodeMap.get(edge.target);
  if (!source || !target) return edge;

  const sourceBounds = nodeBounds(source, nodeMap);
  const targetBounds = nodeBounds(target, nodeMap);
  const margin = ROUTE_POINT_NODE_MARGIN;

  const nearEndpoint = (point: Point) =>
    pointNearBounds(point, sourceBounds, margin) || pointNearBounds(point, targetBounds, margin);

  if (routePoints.some((point) => !nearEndpoint(point))) {
    const nextData = { ...data };
    delete nextData.routePoints;
    return hasDefinedEdgeHandles(edge)
      ? normalizeFlowEdge({ ...edge, data: nextData })
      : inferMissingEdgeHandles({ ...edge, data: nextData }, nodes);
  }

  return hasDefinedEdgeHandles(edge) ? edge : inferMissingEdgeHandles(edge, nodes);
}

/** Marca handlesPinned em edges que já têm sourceHandle + targetHandle (diagramas salvos). */
export function pinDefinedEdgeHandles(edges: Edge[]): Edge[] {
  return edges.map((edge) => {
    if (!hasDefinedEdgeHandles(edge)) return edge;
    const data = (edge.data ?? {}) as FlowEdgeData;
    if (data.handlesPinned) return edge;
    return normalizeFlowEdge({
      ...edge,
      data: { ...data, handlesPinned: true },
    });
  });
}

/** Remove setas inválidas, preview e rotas órfãs — usado ao carregar/reparar diagramas. */
export function sanitizeFlowEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const connectable = connectableNodeIds(nodes);

  return edges
    .filter((edge) => !isPreviewId(edge.id))
    .filter((edge) => connectable.has(edge.source) && connectable.has(edge.target))
    .map((edge) => {
      const data = (edge.data ?? {}) as FlowEdgeData;
      if (data.isAssociation) return inferMissingEdgeHandles(edge, nodes);
      return sanitizeEdgeRoutePoints(nodes, edge);
    })
    .map((edge) => normalizeFlowEdge(edge));
}

/** IDs de nós que podem ser ponta de conexão (inclui anotações de texto). */
export function connectableNodeIds(nodes: Node[]): Set<string> {
  return new Set(
    nodes
      .filter((node) => !isStructuralFlowNode(String(node.type ?? '')))
      .map((node) => node.id),
  );
}

export function validateImportedFlowEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const connectable = connectableNodeIds(nodes);

  return edges
    .filter((edge) => !isPreviewId(edge.id))
    .filter((edge) => connectable.has(edge.source) && connectable.has(edge.target))
    .map((edge) => inferMissingEdgeHandles(edge, nodes))
    .map((edge) => normalizeFlowEdge(edge));
}
