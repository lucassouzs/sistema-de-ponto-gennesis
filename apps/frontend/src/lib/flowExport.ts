import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { buildNodeMap, getAbsolutePosition, getLaneSize, LANE_NODE_TYPE, POOL_HEADER_WIDTH, POOL_NODE_TYPE, syncLaneHierarchy, findContainingLane } from './flowLaneHierarchy';
import { resolveNodeLabel } from './flowNodeDefaults';
import { normalizeFlowEdge } from './flowEdge';
import type { FlowEdgeData } from './flowEdge';
import { ensureFlowEdges } from './flowCanvas';
import { stripPreviewElements } from './flowAppend';
import {
  buildManhattanWaypoints,
  buildOrthogonalPathFromRoutePoints,
  computeEdgeSpreadOffsets,
  type AnchorSide,
  type Point,
} from './flowEdgeRouting';
import { looksLikeBpmnXml, parseBpmnXmlWithFallback } from './flowBpmnImport';
import { parseBpmnViaModeler } from './flowBpmnJsImport';
import { GATEWAY_DIAMOND_SIZE, getGatewayDiamondAnchor, isGatewayNodeType } from './flowGatewayAnchors';
import {
  estimateLabelTextBounds,
  getExternalNodeLabelCenter,
  isExternalLabelNodeType,
  resolveEdgeLabelCenter,
} from './flowGatewayLabels';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function sanitizeFilename(name: string, ext: string): string {
  const base = (name || 'diagram').trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 80);
  return `${base || 'diagram'}.${ext}`;
}

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isConnectableNode(node: Node): boolean {
  const type = String(node.type ?? '');
  return type !== LANE_NODE_TYPE && type !== POOL_NODE_TYPE && type !== 'bpmnText';
}

/** Tamanho só da forma (sem rótulo externo) — bpmn-js posiciona o texto fora do dc:Bounds. */
const EXPORT_SHAPE_ONLY: Record<string, { width: number; height: number }> = {
  bpmnStart: { width: 48, height: 48 },
  bpmnEnd: { width: 48, height: 48 },
  bpmnGateway: { width: GATEWAY_DIAMOND_SIZE, height: GATEWAY_DIAMOND_SIZE },
  bpmnParallelGateway: { width: GATEWAY_DIAMOND_SIZE, height: GATEWAY_DIAMOND_SIZE },
};

function resolveExportNodeSize(node: Node, domEl: HTMLElement | null): { width: number; height: number } {
  const type = String(node.type ?? '');
  const shapeOnly = EXPORT_SHAPE_ONLY[type];
  if (shapeOnly) return shapeOnly;

  const style = node.style as { width?: number; height?: number } | undefined;
  if (style?.width && style?.height) {
    return { width: Math.round(Number(style.width)), height: Math.round(Number(style.height)) };
  }

  if (domEl && domEl.offsetWidth > 0 && domEl.offsetHeight > 0) {
    return { width: domEl.offsetWidth, height: domEl.offsetHeight };
  }

  return getNodeDimensions(node);
}

function getNodeDimensions(node: Node): { width: number; height: number } {
  const style = node.style as { width?: number; height?: number } | undefined;
  if (style?.width && style?.height) {
    return { width: Number(style.width), height: Number(style.height) };
  }
  switch (node.type) {
    case 'bpmnStart':
    case 'bpmnEnd':
      return { width: 48, height: 48 };
    case 'bpmnGateway':
    case 'bpmnParallelGateway':
      return { width: GATEWAY_DIAMOND_SIZE, height: GATEWAY_DIAMOND_SIZE };
    case 'bpmnLane':
      return { width: 1200, height: 160 };
    default:
      return { width: 140, height: 64 };
  }
}

function getNodeLabel(node: Node): string {
  return resolveNodeLabel(node);
}

type ExportNodeMetrics = {
  node: Node;
  width: number;
  height: number;
  x: number;
  y: number;
};

function collectAbsoluteNodeMetrics(
  processNodes: Node[],
  allNodesForHierarchy: Node[],
  canvasRoot: Element | null,
  rf: ReactFlowInstance | null = null,
): Map<string, ExportNodeMetrics> {
  const nodeMap = buildNodeMap(allNodesForHierarchy);
  const map = new Map<string, ExportNodeMetrics>();

  for (const node of processNodes) {
    if (!isConnectableNode(node)) continue;

    let x = node.position.x;
    let y = node.position.y;

    if (rf) {
      const internal = rf.getInternalNode(node.id);
      const abs = internal?.internals?.positionAbsolute;
      if (abs) {
        x = abs.x;
        y = abs.y;
      } else {
        const fallback = getAbsolutePosition(node, nodeMap);
        x = fallback.x;
        y = fallback.y;
      }
    } else {
      const fallback = getAbsolutePosition(node, nodeMap);
      x = fallback.x;
      y = fallback.y;
    }

    const el = canvasRoot?.querySelector(`.react-flow__node[data-id="${CSS.escape(node.id)}"]`);
    const domEl = el instanceof HTMLElement ? el : null;
    const { width, height } = resolveExportNodeSize(node, domEl);

    map.set(node.id, { node, width, height, x, y });
  }

  return map;
}

function getMetricsCenter(metrics: ExportNodeMetrics): Point {
  return { x: metrics.x + metrics.width / 2, y: metrics.y + metrics.height / 2 };
}

function getMetricsAnchor(metrics: ExportNodeMetrics, side: AnchorSide): Point {
  const type = String(metrics.node.type ?? '');
  if (isGatewayNodeType(type)) {
    const diamondHeight = Math.min(metrics.height, GATEWAY_DIAMOND_SIZE);
    const diamondWidth = Math.min(metrics.width, GATEWAY_DIAMOND_SIZE);
    return getGatewayDiamondAnchor(
      { x: metrics.x, y: metrics.y, width: diamondWidth, height: diamondHeight },
      side,
    );
  }

  switch (side) {
    case 'left':
      return { x: metrics.x, y: metrics.y + metrics.height / 2 };
    case 'right':
      return { x: metrics.x + metrics.width, y: metrics.y + metrics.height / 2 };
    case 'top':
      return { x: metrics.x + metrics.width / 2, y: metrics.y };
    case 'bottom':
      return { x: metrics.x + metrics.width / 2, y: metrics.y + metrics.height };
    default:
      return getMetricsCenter(metrics);
  }
}

function pickEdgeAnchorsFromMetrics(
  source: ExportNodeMetrics,
  target: ExportNodeMetrics,
  edge: Edge,
): { from: Point; to: Point; fromSide: AnchorSide; toSide: AnchorSide } {
  const sourceCenter = getMetricsCenter(source);
  const targetCenter = getMetricsCenter(target);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  let fromSide: AnchorSide;
  let toSide: AnchorSide;

  if (edge.sourceHandle || edge.targetHandle) {
    fromSide = sideFromHandle(
      edge.sourceHandle,
      Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top',
    );
    toSide = sideFromHandle(
      edge.targetHandle,
      Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'left' : 'right') : dy >= 0 ? 'top' : 'bottom',
    );
  } else if (Math.abs(dx) >= Math.abs(dy)) {
    fromSide = dx >= 0 ? 'right' : 'left';
    toSide = dx >= 0 ? 'left' : 'right';
  } else {
    fromSide = dy >= 0 ? 'bottom' : 'top';
    toSide = dy >= 0 ? 'top' : 'bottom';
  }

  return {
    from: getMetricsAnchor(source, fromSide),
    to: getMetricsAnchor(target, toSide),
    fromSide,
    toSide,
  };
}

function sideFromHandle(handleId: string | null | undefined, fallback: AnchorSide): AnchorSide {
  if (!handleId) return fallback;
  const handle = handleId.toLowerCase();
  if (handle.includes('top')) return 'top';
  if (handle.includes('bottom')) return 'bottom';
  if (handle.includes('left')) return 'left';
  if (handle.includes('right')) return 'right';
  return fallback;
}

function pickEdgeAnchors(
  source: ExportNodeMetrics,
  target: ExportNodeMetrics,
  edge: Edge,
): { from: Point; to: Point; fromSide: AnchorSide; toSide: AnchorSide } {
  return pickEdgeAnchorsFromMetrics(source, target, edge);
}

function resolveExportEdge(
  edge: Edge,
  metricsById: Map<string, ExportNodeMetrics>,
): { source: ExportNodeMetrics; target: ExportNodeMetrics } | null {
  const source = metricsById.get(edge.source);
  const target = metricsById.get(edge.target);
  if (!source || !target || !isConnectableNode(source.node) || !isConnectableNode(target.node)) return null;
  return { source, target };
}

function buildEdgeWaypoints(
  edge: Edge,
  metricsById: Map<string, ExportNodeMetrics>,
  _rf: ReactFlowInstance | null,
  _canvasRoot: Element | null,
  spread = 0,
): Point[] {
  const resolved = resolveExportEdge(edge, metricsById);
  if (!resolved) return [];

  const { from, to, fromSide, toSide } = pickEdgeAnchors(resolved.source, resolved.target, edge);
  const routePoints = ((edge.data ?? {}) as FlowEdgeData).routePoints;

  if (Array.isArray(routePoints) && routePoints.length > 0) {
    return buildOrthogonalPathFromRoutePoints(from, routePoints, to);
  }

  return buildManhattanWaypoints(from, to, fromSide, toSide, undefined, spread);
}

function buildAllEdgeSpreadOffsets(
  edges: Edge[],
  metricsById: Map<string, ExportNodeMetrics>,
): Map<string, number> {
  return computeEdgeSpreadOffsets(edges, (edgeId, end) => {
    const edge = edges.find((item) => item.id === edgeId);
    if (!edge) return null;
    const resolved = resolveExportEdge(edge, metricsById);
    if (!resolved) return null;
    const { fromSide, toSide } = pickEdgeAnchors(resolved.source, resolved.target, edge);
    return end === 'source' ? fromSide : toSide;
  });
}

const BPMN_NS = {
  bpmn: 'http://www.omg.org/spec/BPMN/20100524/MODEL',
  bpmndi: 'http://www.omg.org/spec/BPMN/20100524/DI',
  dc: 'http://www.omg.org/spec/DD/20100524/DC',
  di: 'http://www.omg.org/spec/DD/20100524/DI',
  bioc: 'http://bpmn.io/schema/bpmn/biocolor/1.0',
};

type LaneExportMetrics = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  childNodeIds: string[];
  fillColor?: string;
  accentColor?: string;
};

function collectLaneExportMetrics(
  allNodes: Node[],
  canvasRoot: Element | null,
  rf: ReactFlowInstance | null,
): LaneExportMetrics[] {
  const nodeMap = buildNodeMap(allNodes);
  const lanes = allNodes
    .filter((node) => node.type === LANE_NODE_TYPE)
    .sort((a, b) => a.position.y - b.position.y);

  return lanes.map((lane) => {
    let x = lane.position.x;
    let y = lane.position.y;
    if (rf) {
      const internal = rf.getInternalNode(lane.id);
      const abs = internal?.internals?.positionAbsolute;
      if (abs) {
        x = abs.x;
        y = abs.y;
      }
    }

    const fallback = getLaneSize(lane);
    let width = fallback.width;
    let height = fallback.height;
    const el = canvasRoot?.querySelector(`.react-flow__node[data-id="${CSS.escape(lane.id)}"]`);
    if (el instanceof HTMLElement) {
      width = el.offsetWidth || width;
      height = el.offsetHeight || height;
    }

    const childNodeIds = allNodes
      .filter((node) => {
        if (!isConnectableNode(node)) return false;
        if (node.parentId === lane.id) return true;
        const abs = getAbsolutePosition(node, nodeMap);
        return findContainingLane(
          { ...node, parentId: undefined, extent: undefined, position: abs },
          [lane],
          nodeMap,
        )?.id === lane.id;
      })
      .map((node) => node.id);

    return {
      id: lane.id,
      label: getNodeLabel(lane),
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      childNodeIds,
      fillColor: colorFromNodeData(lane, 'fillColor'),
      accentColor: colorFromNodeData(lane, 'accentColor'),
    };
  });
}

function computePoolBounds(lanes: LaneExportMetrics[]): { x: number; y: number; width: number; height: number } | null {
  if (lanes.length === 0) return null;
  const minX = Math.min(...lanes.map((lane) => lane.x));
  const minY = Math.min(...lanes.map((lane) => lane.y));
  const maxX = Math.max(...lanes.map((lane) => lane.x + lane.width));
  const maxY = Math.max(...lanes.map((lane) => lane.y + lane.height));
  return {
    x: minX - POOL_HEADER_WIDTH,
    y: minY,
    width: POOL_HEADER_WIDTH + (maxX - minX),
    height: maxY - minY,
  };
}

function resolvePoolExportBounds(
  allNodes: Node[],
  laneMetrics: LaneExportMetrics[],
  canvasRoot: Element | null,
  rf: ReactFlowInstance | null,
): { x: number; y: number; width: number; height: number } | null {
  const pools = allNodes.filter((node) => node.type === POOL_NODE_TYPE);
  if (pools.length === 0) return computePoolBounds(laneMetrics);

  const nodeMap = buildNodeMap(allNodes);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const pool of pools) {
    const abs = getAbsolutePosition(pool, nodeMap);
    let width = getLaneSize(pool).width;
    let height = getLaneSize(pool).height;
    if (rf) {
      const internal = rf.getInternalNode(pool.id);
      const size = internal?.measured;
      if (size?.width && size?.height) {
        width = size.width;
        height = size.height;
      }
    }
    const el = canvasRoot?.querySelector(`.react-flow__node[data-id="${CSS.escape(pool.id)}"]`);
    if (el instanceof HTMLElement) {
      width = el.offsetWidth || width;
      height = el.offsetHeight || height;
    }
    minX = Math.min(minX, abs.x);
    minY = Math.min(minY, abs.y);
    maxX = Math.max(maxX, abs.x + width);
    maxY = Math.max(maxY, abs.y + height);
  }

  if (!Number.isFinite(minX)) return computePoolBounds(laneMetrics);
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
  };
}

/** Estima o tamanho do diagrama para dimensionar o modeler oculto na exportação PNG. */
export function estimateExportDiagramSize(
  nodes: Node[],
  rf: ReactFlowInstance | null,
): { width: number; height: number } {
  const allNodes = stripPreviewElements(nodes);
  const processNodes = allNodes.filter((node) => node.type !== LANE_NODE_TYPE && node.type !== POOL_NODE_TYPE);
  const canvasRoot =
    document.querySelector('.flow-editor-canvas') ?? document.querySelector('.react-flow');
  const metricsById = collectAbsoluteNodeMetrics(processNodes, allNodes, canvasRoot, rf);
  const laneMetrics = collectLaneExportMetrics(allNodes, canvasRoot, rf);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const includeRect = (x: number, y: number, width: number, height: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  };

  laneMetrics.forEach((lane) => includeRect(lane.x, lane.y, lane.width, lane.height));
  metricsById.forEach((metrics) =>
    includeRect(metrics.x, metrics.y, metrics.width, metrics.height),
  );

  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) {
    return { width: 1400, height: 900 };
  }

  return {
    width: Math.ceil(maxX - minX + 120),
    height: Math.ceil(maxY - minY + 120),
  };
}

function bpmnElementTag(type: string): { tag: string; diKind: string } | null {
  switch (type) {
    case 'bpmnStart':
      return { tag: 'startEvent', diKind: 'startEvent' };
    case 'bpmnEnd':
      return { tag: 'endEvent', diKind: 'endEvent' };
    case 'bpmnGateway':
      return { tag: 'exclusiveGateway', diKind: 'gateway' };
    case 'bpmnParallelGateway':
      return { tag: 'parallelGateway', diKind: 'gateway' };
    case 'bpmnLane':
      return null;
    case 'bpmnText':
      return null;
    default:
      return { tag: 'task', diKind: 'activity' };
  }
}

function colorFromNodeData(node: Node, key: 'fillColor' | 'accentColor'): string | undefined {
  const data = (node.data ?? {}) as { fillColor?: unknown; accentColor?: unknown };
  const value = String(data[key] ?? '').trim();
  return value || undefined;
}

function biocAttrs(fillColor?: string, strokeColor?: string): string {
  const fill = fillColor ? ` bioc:fill="${escapeXml(fillColor)}"` : '';
  const stroke = strokeColor ? ` bioc:stroke="${escapeXml(strokeColor)}"` : '';
  return `${fill}${stroke}`;
}

function buildBpmnLabelXml(label: string, center: Point): string {
  const bounds = estimateLabelTextBounds(label, center);
  return `        <bpmndi:BPMNLabel>
          <dc:Bounds x="${Math.round(bounds.x)}" y="${Math.round(bounds.y)}" width="${Math.round(bounds.width)}" height="${Math.round(bounds.height)}"/>
        </bpmndi:BPMNLabel>`;
}

/** Lê o centro do rótulo inline renderizado no canvas (WYSIWYG na exportação). */
function parseFlowLabelCenterFromTransform(transform: string): Point | null {
  const match = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*$/);
  if (!match) return null;
  const x = Number.parseFloat(match[1]!);
  const y = Number.parseFloat(match[2]!);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function collectEdgeLabelCentersFromDom(
  edges: Edge[],
  canvasRoot: Element | null,
): Map<string, Point> {
  const map = new Map<string, Point>();
  if (!canvasRoot) return map;

  const scope = canvasRoot.closest('.react-flow') ?? canvasRoot;
  const edgeIds = new Set(edges.map((edge) => edge.id));

  scope.querySelectorAll<HTMLElement>('.flow-edge-inline-label[data-flow-edge-id]').forEach((el) => {
    const edgeId = el.getAttribute('data-flow-edge-id');
    if (!edgeId || !edgeIds.has(edgeId)) return;
    const center = parseFlowLabelCenterFromTransform(el.style.transform);
    if (center) map.set(edgeId, center);
  });

  return map;
}

export function buildFlowBpmnXml(
  _diagramName: string,
  nodes: Node[],
  edges: Edge[],
  rf: ReactFlowInstance | null = null,
): string {
  const allNodes = stripPreviewElements(nodes);
  const processNodes = allNodes.filter((n) => n.type !== LANE_NODE_TYPE && n.type !== POOL_NODE_TYPE);
  const cleanEdges = ensureFlowEdges(processNodes, stripPreviewElements(edges).map(normalizeFlowEdge));
  const canvasRoot =
    document.querySelector('.flow-editor-canvas') ?? document.querySelector('.react-flow');
  const metricsById = collectAbsoluteNodeMetrics(processNodes, allNodes, canvasRoot, rf);
  const spreadByEdgeId = buildAllEdgeSpreadOffsets(cleanEdges, metricsById);
  const laneMetrics = collectLaneExportMetrics(allNodes, canvasRoot, rf);
  const domEdgeLabelCenters = collectEdgeLabelCentersFromDom(cleanEdges, canvasRoot);
  const hasSwimlanes = laneMetrics.length > 0;
  const poolBounds = resolvePoolExportBounds(allNodes, laneMetrics, canvasRoot, rf);
  const nodeMap = buildNodeMap(allNodes);
  const poolNodes = allNodes.filter((node) => node.type === POOL_NODE_TYPE);
  const participantLabel =
    poolNodes.length === 1 ? getNodeLabel(poolNodes[0]!) : poolNodes.length > 1 ? 'Processo' : '';
  const participantNameAttr = participantLabel ? ` name="${escapeXml(participantLabel)}"` : '';

  const processId = 'Process_1';
  const collaborationId = 'Collaboration_1';
  const participantId = 'Participant_1';
  const diagramId = 'BPMNDiagram_1';
  const planeId = 'BPMNPlane_1';
  const planeElement = hasSwimlanes ? collaborationId : processId;

  const collaborationXml = hasSwimlanes
    ? `  <bpmn:collaboration id="${collaborationId}">
    <bpmn:participant id="${participantId}" processRef="${processId}"${participantNameAttr}/>
  </bpmn:collaboration>`
    : '';

  const laneSetXml = hasSwimlanes
    ? `    <bpmn:laneSet id="LaneSet_1">
${laneMetrics
  .map((lane) => {
    const refs = lane.childNodeIds
      .map((nodeId) => `        <bpmn:flowNodeRef>${escapeXml(nodeId)}</bpmn:flowNodeRef>`)
      .join('\n');
    const nameAttr = lane.label ? ` name="${escapeXml(lane.label)}"` : '';
    return `      <bpmn:lane id="${escapeXml(lane.id)}"${nameAttr}>
${refs}
      </bpmn:lane>`;
  })
  .join('\n')}
    </bpmn:laneSet>`
    : '';

  const elements = processNodes
    .map((node) => {
      const mapped = bpmnElementTag(String(node.type ?? 'bpmnTask'));
      if (!mapped) return '';
      const label = escapeXml(getNodeLabel(node));
      const nameAttr = label ? ` name="${label}"` : '';
      return `    <bpmn:${mapped.tag} id="${escapeXml(node.id)}"${nameAttr}/>`;
    })
    .filter(Boolean)
    .join('\n');

  const flows = cleanEdges
    .map((edge) => {
      const label =
        typeof edge.label === 'string' && edge.label.trim()
          ? ` name="${escapeXml(edge.label.trim())}"`
          : '';
      return `    <bpmn:sequenceFlow id="${escapeXml(edge.id)}" sourceRef="${escapeXml(edge.source)}" targetRef="${escapeXml(edge.target)}"${label}/>`;
    })
    .join('\n');

  const poolShape =
    hasSwimlanes && poolBounds
      ? `      <bpmndi:BPMNShape bpmnElement="${participantId}" id="${participantId}_di" isHorizontal="true">
        <dc:Bounds x="${poolBounds.x}" y="${poolBounds.y}" width="${poolBounds.width}" height="${poolBounds.height}"/>
      </bpmndi:BPMNShape>`
      : '';

  const laneShapes = laneMetrics
    .map(
      (lane) => `      <bpmndi:BPMNShape bpmnElement="${escapeXml(lane.id)}" id="${escapeXml(lane.id)}_di" isHorizontal="true"${biocAttrs(
        lane.fillColor,
        lane.accentColor,
      )}>
        <dc:Bounds x="${lane.x}" y="${lane.y}" width="${lane.width}" height="${lane.height}"/>
      </bpmndi:BPMNShape>`,
    )
    .join('\n');

  const shapes = processNodes
    .map((node) => {
      const mapped = bpmnElementTag(String(node.type ?? 'bpmnTask'));
      if (!mapped) return '';
      const metrics = metricsById.get(node.id);
      const width = Math.round(metrics?.width ?? getNodeDimensions(node).width);
      const height = Math.round(metrics?.height ?? getNodeDimensions(node).height);
      const x = Math.round(metrics?.x ?? node.position.x);
      const y = Math.round(metrics?.y ?? node.position.y);
      const fillColor = colorFromNodeData(node, 'fillColor');
      const accentColor = colorFromNodeData(node, 'accentColor');
      const nodeType = String(node.type ?? '');
      const labelText = getNodeLabel(node);
      const labelCenter =
        isExternalLabelNodeType(nodeType) && labelText
          ? getExternalNodeLabelCenter(node, nodeMap)
          : null;
      const labelXml = labelCenter ? `${buildBpmnLabelXml(labelText, labelCenter)}\n` : '';
      return `      <bpmndi:BPMNShape bpmnElement="${escapeXml(node.id)}" id="${escapeXml(node.id)}_di"${biocAttrs(fillColor, accentColor)}>
        <dc:Bounds x="${x}" y="${y}" width="${width}" height="${height}"/>
${labelXml}      </bpmndi:BPMNShape>`;
    })
    .filter(Boolean)
    .join('\n');

  const edgeShapes = cleanEdges
    .map((edge) => {
      const waypoints = buildEdgeWaypoints(
        edge,
        metricsById,
        rf,
        canvasRoot,
        spreadByEdgeId.get(edge.id) ?? 0,
      );
      if (waypoints.length < 2) return '';
      const points = waypoints
        .map((point) => `        <di:waypoint x="${Math.round(point.x)}" y="${Math.round(point.y)}"/>`)
        .join('\n');
      const edgeLabel =
        typeof edge.label === 'string' && edge.label.trim()
          ? edge.label.trim()
          : String(((edge.data ?? {}) as FlowEdgeData).label ?? '').trim();
      const labelCenter = edgeLabel
        ? (domEdgeLabelCenters.get(edge.id) ?? resolveEdgeLabelCenter(edge, waypoints))
        : null;
      const labelXml = labelCenter ? `${buildBpmnLabelXml(edgeLabel, labelCenter)}\n` : '';
      return `      <bpmndi:BPMNEdge bpmnElement="${escapeXml(edge.id)}" id="${escapeXml(edge.id)}_di">
${points}
${labelXml}      </bpmndi:BPMNEdge>`;
    })
    .filter(Boolean)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="${BPMN_NS.bpmn}"
  xmlns:bpmndi="${BPMN_NS.bpmndi}"
  xmlns:dc="${BPMN_NS.dc}"
  xmlns:di="${BPMN_NS.di}"
  xmlns:bioc="${BPMN_NS.bioc}"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn"
  exporter="Gennesis Flow"
  exporterVersion="1.0">
${collaborationXml}
  <bpmn:process id="${processId}" isExecutable="false">
${laneSetXml}
${elements}
${flows}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="${diagramId}">
    <bpmndi:BPMNPlane bpmnElement="${planeElement}" id="${planeId}">
${poolShape}
${laneShapes}
${shapes}
${edgeShapes}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

export function exportFlowToBpmn(
  name: string,
  nodes: Node[],
  edges: Edge[],
  rf: ReactFlowInstance | null = null,
): void {
  const xml = buildFlowBpmnXml(name, nodes, edges, rf);
  downloadText(xml, sanitizeFilename(name, 'bpmn'), 'application/xml');
}

export type FlowImportPayload = {
  name?: string;
  nodes: Node[];
  edges: Edge[];
  viewport?: { x: number; y: number; zoom: number };
  importWarnings?: string[];
};

function parseNativeFlowJson(raw: unknown): FlowImportPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;

  if (Array.isArray(data.nodes) && Array.isArray(data.edges)) {
    return {
      name: typeof data.name === 'string' ? data.name : undefined,
      nodes: data.nodes as Node[],
      edges: (data.edges as Edge[]).map(normalizeFlowEdge),
      viewport: data.viewport as FlowImportPayload['viewport'],
    };
  }

  return null;
}

export async function parseFlowImportFile(file: File): Promise<FlowImportPayload> {
  const text = await file.text();
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.json')) {
    try {
      const parsed = parseNativeFlowJson(JSON.parse(text));
      if (parsed) return parsed;
    } catch {
      if (!looksLikeBpmnXml(text)) {
        throw new Error('JSON inválido para fluxograma');
      }
    }
  }

  if (lower.endsWith('.bpmn') || lower.endsWith('.xml') || looksLikeBpmnXml(text)) {
    const modelerResult = await parseBpmnViaModeler(text);
    if (modelerResult.payload) {
      const warnings = modelerResult.warnings;
      return {
        ...modelerResult.payload,
        importWarnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    const { payload, warnings } = parseBpmnXmlWithFallback(text);
    if (payload) {
      return { ...payload, importWarnings: warnings.length > 0 ? warnings : undefined };
    }
    const detail = warnings[0] ?? 'Arquivo BPMN inválido ou vazio';
    throw new Error(detail);
  }

  throw new Error('Formato não suportado. Use .json ou .bpmn');
}

export function exportFlowToNativeJson(name: string, nodes: Node[], edges: Edge[], viewport?: unknown): void {
  const payload = {
    name,
    nodes: stripPreviewElements(nodes),
    edges: stripPreviewElements(edges).map(normalizeFlowEdge),
    viewport: viewport ?? null,
  };
  downloadText(JSON.stringify(payload, null, 2), sanitizeFilename(name, 'json'), 'application/json');
}
