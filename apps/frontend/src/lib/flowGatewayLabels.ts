import type { Edge, Node } from '@xyflow/react';
import { GATEWAY_DIAMOND_SIZE, getGatewayDiamondAnchor, isGatewayNodeType } from './flowGatewayAnchors';
import {
  buildManhattanWaypoints,
  buildOrthogonalPathFromRoutePoints,
  inferEdgeHandlesFromGeometry,
  type AnchorSide,
  type Point,
} from './flowEdgeRouting';
import { buildNodeMap, getAbsolutePosition, getLaneSize, getProcessNodeSize, LANE_NODE_TYPE } from './flowLaneHierarchy';
import { normalizeFlowEdge, type FlowEdgeData } from './flowEdge';
import { resolveNodeLabel } from './flowNodeDefaults';

const LABEL_OFFSET_ABOVE = 22;
const LABEL_OFFSET_RIGHT = 18;
const LABEL_STAGGER_Y = 8;
const OVERLAP_PADDING = 15;
/** Rótulos importados do BPMN XML além desta distância da rota são recalculados. */
export const FLOW_EDGE_LABEL_MAX_DRIFT = 220;

function clampNearPoint(point: Point, anchor: Point, maxDist = FLOW_EDGE_LABEL_MAX_DRIFT): Point {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxDist) return point;
  const scale = maxDist / dist;
  return { x: anchor.x + dx * scale, y: anchor.y + dy * scale };
}

function isStaleLabelPosition(saved: Point | undefined, anchor: Point | null): boolean {
  if (!saved || !anchor) return true;
  return Math.hypot(saved.x - anchor.x, saved.y - anchor.y) > FLOW_EDGE_LABEL_MAX_DRIFT;
}

const EVENT_SHAPE_SIZE = 48;
const EXTERNAL_LABEL_GAP = 4;

function isProcessNode(node: Node): boolean {
  const type = String(node.type ?? '');
  return type !== LANE_NODE_TYPE && type !== 'bpmnText' && !node.id.startsWith('ai-panel-');
}

function isExternalLabelNode(type: string): boolean {
  return (
    type === 'bpmnStart' ||
    type === 'bpmnEnd' ||
    type === 'bpmnGateway' ||
    type === 'bpmnParallelGateway'
  );
}

type Rect = { x: number; y: number; width: number; height: number };

function nodeBox(node: Node, nodeMap: Map<string, Node>): Rect {
  const abs = getAbsolutePosition(node, nodeMap);
  const size = getProcessNodeSize(node);
  return { x: abs.x, y: abs.y, width: size.width, height: size.height };
}

function nodeShapeHeight(type: string): number {
  return isGatewayNodeType(type) ? GATEWAY_DIAMOND_SIZE : EVENT_SHAPE_SIZE;
}

/** Corpo da forma (círculo/losango/caixa) — sem o rótulo externo. */
function nodeShapeRect(node: Node, nodeMap: Map<string, Node>): Rect {
  const box = nodeBox(node, nodeMap);
  const type = String(node.type ?? '');
  if (isExternalLabelNode(type)) {
    const shapeH = nodeShapeHeight(type);
    return {
      x: box.x + (box.width - (isGatewayNodeType(type) ? GATEWAY_DIAMOND_SIZE : EVENT_SHAPE_SIZE)) / 2,
      y: box.y,
      width: isGatewayNodeType(type) ? GATEWAY_DIAMOND_SIZE : EVENT_SHAPE_SIZE,
      height: shapeH,
    };
  }
  return box;
}

function estimateTextRect(label: string, center: Point, maxWidth = 220): Rect {
  const charWidth = 7;
  const lineHeight = 16;
  const width = Math.min(maxWidth, Math.max(40, label.length * charWidth + 16));
  const charsPerLine = Math.max(1, Math.floor((width - 16) / charWidth));
  const lines = Math.max(1, Math.ceil(label.length / charsPerLine));
  const height = lines * lineHeight + 8;
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  };
}

/** Retângulo do rótulo a partir do centro — usado na exportação PNG/BPMN. */
export function estimateLabelTextBounds(label: string, center: Point, maxWidth = 220): Rect {
  return estimateTextRect(label, center, maxWidth);
}

function nodeLabelCenter(node: Node, nodeMap: Map<string, Node>, offset: Point): Point | null {
  const type = String(node.type ?? '');
  if (!isExternalLabelNode(type)) return null;

  const box = nodeBox(node, nodeMap);
  const label = resolveNodeLabel(node);
  const shapeH = nodeShapeHeight(type);
  const labelRect = estimateTextRect(label, { x: 0, y: 0 });
  return {
    x: box.x + box.width / 2 + offset.x,
    y: box.y + shapeH + EXTERNAL_LABEL_GAP + labelRect.height / 2 + offset.y,
  };
}

/** Centro do rótulo externo (gateway/evento) — respeita labelOffset do editor. */
export function getExternalNodeLabelCenter(
  node: Node,
  nodeMap: Map<string, Node>,
): Point | null {
  const type = String(node.type ?? '');
  if (!isExternalLabelNode(type)) return null;
  const offset = ((node.data ?? {}) as { labelOffset?: Point }).labelOffset ?? { x: 0, y: 0 };
  return nodeLabelCenter(node, nodeMap, offset);
}

export function isExternalLabelNodeType(type: string): boolean {
  return isExternalLabelNode(type);
}

/** Centro do rótulo de conexão — usa labelPosition salvo ou posição padrão na rota. */
export function resolveEdgeLabelCenter(edge: Edge, waypoints: Point[]): Point | null {
  const label = typeof edge.label === 'string' ? edge.label.trim() : '';
  if (!label || waypoints.length < 2) return null;
  const data = (edge.data ?? {}) as FlowEdgeData;
  if (data.labelPosition) return data.labelPosition;
  return labelPositionForConnection(waypoints, label);
}

function getRectAnchor(box: Rect, side: AnchorSide): Point {
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

function connectionWaypoints(
  source: Node,
  target: Node,
  nodeMap: Map<string, Node>,
  edge?: Edge,
): Point[] {
  const sourceBox = nodeBox(source, nodeMap);
  const targetBox = nodeBox(target, nodeMap);
  const handles = inferEdgeHandlesFromGeometry(sourceBox, targetBox);

  const fromSide = (edge?.sourceHandle ?? handles.sourceHandle ?? 'right') as AnchorSide;
  const toSide = (edge?.targetHandle ?? handles.targetHandle ?? 'left') as AnchorSide;

  const fromPoint = isGatewayNodeType(String(source.type))
    ? getGatewayDiamondAnchor(sourceBox, fromSide)
    : getRectAnchor(sourceBox, fromSide);

  const toPoint = isGatewayNodeType(String(target.type))
    ? getGatewayDiamondAnchor(targetBox, toSide)
    : getRectAnchor(targetBox, toSide);

  const routePoints = edge ? ((edge.data ?? {}) as FlowEdgeData).routePoints : undefined;
  if (Array.isArray(routePoints) && routePoints.length > 0) {
    return buildOrthogonalPathFromRoutePoints(fromPoint, routePoints, toPoint);
  }

  return buildManhattanWaypoints(fromPoint, toPoint, fromSide, toSide);
}

function midpointOnPath(waypoints: Point[]): Point {
  if (waypoints.length === 0) return { x: 0, y: 0 };
  if (waypoints.length === 1) return waypoints[0]!;

  let total = 0;
  const segments: Array<{ start: Point; end: Point; length: number }> = [];

  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const start = waypoints[index]!;
    const end = waypoints[index + 1]!;
    const length = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
    segments.push({ start, end, length });
    total += length;
  }

  const half = total / 2;
  let walked = 0;

  for (const segment of segments) {
    if (walked + segment.length >= half) {
      const remain = half - walked;
      const horizontal = segment.start.y === segment.end.y;
      if (horizontal) {
        const dir = segment.end.x >= segment.start.x ? 1 : -1;
        return { x: segment.start.x + dir * remain, y: segment.start.y };
      }
      const dir = segment.end.y >= segment.start.y ? 1 : -1;
      return { x: segment.start.x, y: segment.start.y + dir * remain };
    }
    walked += segment.length;
  }

  return waypoints[Math.floor(waypoints.length / 2)]!;
}

function labelPositionForConnection(waypoints: Point[], label: string): Point {
  const mid = midpointOnPath(waypoints);
  const horizontalSpan =
    waypoints.length >= 2 &&
    waypoints.some(
      (point, index) =>
        index > 0 && point.y === waypoints[index - 1]!.y && point.x !== waypoints[index - 1]!.x,
    );

  const normalized = label.toLowerCase();
  let x = mid.x + 10;
  let y = mid.y;

  if (horizontalSpan) {
    y = mid.y - LABEL_OFFSET_ABOVE;
  } else {
    x = mid.x + LABEL_OFFSET_RIGHT;
  }

  if (normalized === 'sim') {
    y -= LABEL_STAGGER_Y;
  } else if (normalized === 'não' || normalized === 'nao') {
    y += LABEL_STAGGER_Y;
    x += 6;
  }

  return { x, y };
}

function rectsOverlap(a: Rect, b: Rect, padding: number): boolean {
  return (
    a.x < b.x + b.width + padding &&
    a.x + a.width + padding > b.x &&
    a.y < b.y + b.height + padding &&
    a.y + a.height + padding > b.y
  );
}

function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function pushLabelOutsideShape(center: Point, label: string, shape: Rect, padding: number): Point {
  const rect = estimateTextRect(label, center);
  if (!rectsOverlap(rect, shape, padding)) return center;

  const labelHalfW = rect.width / 2;
  const labelHalfH = rect.height / 2;
  const shapeRight = shape.x + shape.width + padding;
  const shapeLeft = shape.x - padding;
  const shapeBottom = shape.y + shape.height + padding;
  const shapeTop = shape.y - padding;

  const candidates: Point[] = [
    { x: shapeRight + labelHalfW, y: center.y },
    { x: shapeLeft - labelHalfW, y: center.y },
    { x: center.x, y: shapeTop - labelHalfH },
    { x: center.x, y: shapeBottom + labelHalfH },
  ];

  let best = center;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const testRect = estimateTextRect(label, candidate);
    if (rectsOverlap(testRect, shape, padding)) continue;
    const dist = Math.hypot(candidate.x - center.x, candidate.y - center.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  if (bestDist < Number.POSITIVE_INFINITY) return best;

  // Fallback: empurra para cima da forma
  return { x: center.x, y: shapeTop - labelHalfH };
}

function getShapeObstacles(nodes: Node[], nodeMap: Map<string, Node>): Rect[] {
  return nodes.filter(isProcessNode).map((node) => nodeShapeRect(node, nodeMap));
}

function labelOverlapsAnyShape(label: string, center: Point, shapes: Rect[], padding = OVERLAP_PADDING): boolean {
  const rect = estimateTextRect(label, center);
  return shapes.some((shape) => rectsOverlap(rect, shape, padding));
}

/** Garante que o rótulo da conexão fique fora das caixas (tasks, losangos, círculos). */
function resolveLabelPositionClearOfShapes(
  label: string,
  preferred: Point,
  shapes: Rect[],
  maxPasses = 6,
): Point {
  let center = { ...preferred };
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let moved = false;
    for (const shape of shapes) {
      const next = pushLabelOutsideShape(center, label, shape, OVERLAP_PADDING);
      if (next.x !== center.x || next.y !== center.y) {
        center = next;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return center;
}

function getStackedPoolBounds(nodes: Node[], nodeMap: Map<string, Node>): Rect | null {
  const lanes = nodes.filter((node) => node.type === LANE_NODE_TYPE);
  if (lanes.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const lane of lanes) {
    const abs = getAbsolutePosition(lane, nodeMap);
    const size = getLaneSize(lane);
    minX = Math.min(minX, abs.x);
    minY = Math.min(minY, abs.y);
    maxX = Math.max(maxX, abs.x + size.width);
    maxY = Math.max(maxY, abs.y + size.height);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function clampLabelInPoolBounds(center: Point, label: string, bounds: Rect | null): Point {
  if (!bounds) return center;

  const rect = estimateTextRect(label, center);
  const pad = 10;
  const halfW = rect.width / 2;
  const halfH = rect.height / 2;
  const minX = bounds.x + pad + halfW;
  const maxX = bounds.x + bounds.width - pad - halfW;
  const minY = bounds.y + pad + halfH;
  const maxY = bounds.y + bounds.height - pad - halfH;

  if (minX > maxX || minY > maxY) return center;

  return {
    x: Math.min(Math.max(center.x, minX), maxX),
    y: Math.min(Math.max(center.y, minY), maxY),
  };
}

function isLabelOutsidePool(center: Point, label: string, bounds: Rect | null, pad = 10): boolean {
  if (!bounds) return false;
  const rect = estimateTextRect(label, center);
  return (
    rect.x < bounds.x + pad ||
    rect.y < bounds.y + pad ||
    rect.x + rect.width > bounds.x + bounds.width - pad ||
    rect.y + rect.height > bounds.y + bounds.height - pad
  );
}

function resolveEdgeLabelPosition(
  label: string,
  preferred: Point,
  shapes: Rect[],
  poolBounds: Rect | null,
): Point {
  const cleared = resolveLabelPositionClearOfShapes(label, preferred, shapes);
  const near = clampNearPoint(cleared, preferred);
  return clampLabelInPoolBounds(near, label, poolBounds);
}

/** Logs de diagnóstico (equivalente React Flow ao elementRegistry do bpmn-js). */
export function inspectFlowDiagramDiagnostics(nodes: Node[], edges: Edge[]): void {
  const nodeMap = buildNodeMap(nodes);
  const incomingByTarget = new Map<string, Edge[]>();
  for (const edge of edges) {
    const list = incomingByTarget.get(edge.target) ?? [];
    list.push(edge);
    incomingByTarget.set(edge.target, list);
  }

  const orphanEnds = nodes.filter(
    (n) => n.type === 'bpmnEnd' && !(incomingByTarget.get(n.id)?.length),
  );

  console.log(
    'Elementos órfãos:',
    orphanEnds.map((n) => ({
      id: n.id,
      type: 'bpmn:EndEvent',
      label: resolveNodeLabel(n),
      x: n.position?.x,
      y: n.position?.y,
      incoming: incomingByTarget.get(n.id)?.length ?? 0,
    })),
  );

  const gateway = nodes.find(
    (n) =>
      (n.type === 'bpmnGateway' || n.type === 'bpmnParallelGateway') &&
      resolveNodeLabel(n).toLowerCase().includes('substitu'),
  );

  if (gateway) {
    const offset = ((gateway.data ?? {}) as NodeDataWithLabelOffset).labelOffset ?? { x: 0, y: 0 };
    const labelCenter = nodeLabelCenter(gateway, nodeMap, offset);
    console.log('Gateway "Produto será substituído ou devolvido?":', {
      id: gateway.id,
      shape: { x: gateway.position?.x, y: gateway.position?.y },
      labelCenter,
      labelOffset: offset,
    });
  }

  for (const edge of edges) {
    const label = typeof edge.label === 'string' ? edge.label.trim() : '';
    if (!label.toLowerCase().includes('devolv')) continue;
    const lp = ((edge.data ?? {}) as FlowEdgeData).labelPosition;
    console.log('Conexão "Devolvido":', {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      labelPosition: lp,
    });
    if (gateway && lp) {
      const offset = ((gateway.data ?? {}) as NodeDataWithLabelOffset).labelOffset ?? { x: 0, y: 0 };
      const gwLabel = nodeLabelCenter(gateway, nodeMap, offset);
      console.log('Comparação gateway vs label Devolvido:', {
        gatewayShape: { x: gateway.position?.x, y: gateway.position?.y },
        gatewayLabelCenter: gwLabel,
        labelDevolvido: lp,
        mesmaPosicaoXY: gateway.position?.x === lp.x && gateway.position?.y === lp.y,
        distanciaShape: Math.hypot((gateway.position?.x ?? 0) - lp.x, (gateway.position?.y ?? 0) - lp.y),
        distanciaLabelGateway: gwLabel
          ? Math.hypot(gwLabel.x - lp.x, gwLabel.y - lp.y)
          : null,
      });
    }
  }
}

type NodeDataWithLabelOffset = {
  label?: string;
  labelOffset?: Point;
};

function defaultEdgeLabelPosition(edge: Edge, nodeMap: Map<string, Node>): Point | null {
  const label = typeof edge.label === 'string' ? edge.label.trim() : '';
  if (!label) return null;

  const source = nodeMap.get(edge.source);
  const target = nodeMap.get(edge.target);
  if (!source || !target || !isProcessNode(source) || !isProcessNode(target)) return null;

  return labelPositionForConnection(connectionWaypoints(source, target, nodeMap, edge), label);
}

/** Posiciona rótulos de conexão importados/fora das caixas — só tasks têm texto interno. */
export function placeImportedEdgeLabels(nodes: Node[], edges: Edge[]): Edge[] {
  const nodeMap = buildNodeMap(nodes);
  const shapes = getShapeObstacles(nodes, nodeMap);
  const poolBounds = getStackedPoolBounds(nodes, nodeMap);

  return edges.map((edge) => {
    const data = (edge.data ?? {}) as FlowEdgeData;
    if (data.isAssociation) return edge;

    const label = typeof edge.label === 'string' ? edge.label.trim() : '';
    if (!label) return edge;

    const fallback = defaultEdgeLabelPosition(edge, nodeMap);
    const preferred =
      fallback && !isStaleLabelPosition(data.labelPosition, fallback)
        ? (data.labelPosition ?? fallback)
        : fallback;
    if (!preferred) return edge;

    const center = resolveEdgeLabelPosition(label, preferred, shapes, poolBounds);
    if (
      data.labelPosition &&
      data.labelPosition.x === center.x &&
      data.labelPosition.y === center.y
    ) {
      return edge;
    }

    return normalizeFlowEdge({
      ...edge,
      label,
      data: { ...data, label, labelPosition: center },
    });
  });
}

/** Reposiciona rótulos Sim/Não (e demais labels) ao longo das conexões. */
export function fixGatewayLabels(nodes: Node[], edges: Edge[]): Edge[] {
  const nodeMap = buildNodeMap(nodes);
  const poolBounds = getStackedPoolBounds(nodes, nodeMap);

  return edges.map((edge) => {
    const label = typeof edge.label === 'string' ? edge.label.trim() : '';
    if (!label) return edge;

    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target || !isProcessNode(source) || !isProcessNode(target)) return edge;

    const waypoints = connectionWaypoints(source, target, nodeMap, edge);
    const anchor = labelPositionForConnection(waypoints, label);
    const labelPosition = resolveEdgeLabelPosition(label, anchor, getShapeObstacles(nodes, nodeMap), poolBounds);
    const data = (edge.data ?? {}) as FlowEdgeData;

    return normalizeFlowEdge({
      ...edge,
      label,
      data: {
        ...data,
        label,
        labelPosition,
      },
    });
  });
}

/**
 * Ajuste fino: move SOMENTE rótulos de conexão (Sim/Não/etc.) que sobrepõem shapes.
 * Não altera posição de tasks, gateways, eventos ou raias. Sem auto-layout/ELK.
 */
export function fixOverlappingLabels(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[]; movedCount: number } {
  const nodeMap = buildNodeMap(nodes);
  const shapes = getShapeObstacles(nodes, nodeMap);
  const poolBounds = getStackedPoolBounds(nodes, nodeMap);

  let movedCount = 0;

  const nextEdges = edges.map((edge) => {
    const label = typeof edge.label === 'string' ? edge.label.trim() : '';
    if (!label) return edge;

    const data = (edge.data ?? {}) as FlowEdgeData;
    const fallback = defaultEdgeLabelPosition(edge, nodeMap);
    const origin =
      fallback && !isStaleLabelPosition(data.labelPosition, fallback)
        ? (data.labelPosition ?? fallback)
        : fallback;
    if (!origin) return edge;

    const overlaps = labelOverlapsAnyShape(label, origin, shapes);
    const outsidePool = isLabelOutsidePool(origin, label, poolBounds);
    const stale = isStaleLabelPosition(data.labelPosition, fallback);

    if (!overlaps && !outsidePool) {
      if (stale && fallback) {
        const clamped = clampLabelInPoolBounds(fallback, label, poolBounds);
        movedCount += 1;
        return normalizeFlowEdge({
          ...edge,
          label,
          data: { ...data, label, labelPosition: clamped },
        });
      }
      return edge;
    }

    const preferred = outsidePool && fallback ? fallback : origin;
    const center = resolveEdgeLabelPosition(label, preferred, shapes, poolBounds);
    if (center.x === origin.x && center.y === origin.y) {
      return edge;
    }

    movedCount += 1;
    return normalizeFlowEdge({
      ...edge,
      label,
      data: { ...data, label, labelPosition: center },
    });
  });

  return { nodes, edges: nextEdges, movedCount };
}
