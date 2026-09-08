import type { Edge, Node } from '@xyflow/react';
import { LANE_HEADER_WIDTH } from '@/components/flow/BpmnNodes';
import {
  attachNodeToLane,
  buildNodeMap,
  findContainingLane,
  getAbsolutePosition,
  getLaneSize,
  getProcessNodeSize,
  LANE_NODE_TYPE,
  syncLaneHierarchy,
} from './flowLaneHierarchy';
import { resolveNodeLabel } from './flowNodeDefaults';
import { POOL_NODE_TYPE } from './flowPoolHierarchy';

const POOL_X = 40;
const NODE_START_X = LANE_HEADER_WIDTH + 32;
/** Espaço entre caixas — alinhado ao encaixe manual do editor */
const NODE_GAP_X = 72;
const AI_NODE_GAP_X = 96;
const MAX_NODES_PER_ROW = 5;
const ROW_INDENT_X = 48;
const ROW_HEIGHT_STEP = 76;
const LANE_PADDING_TOP = 24;
const LANE_PADDING_BOTTOM = 16;
const LANE_END_PADDING = 32;
const MIN_POOL_WIDTH = 360;
const AI_MIN_POOL_WIDTH = 640;
const LANE_HEIGHT_WITH_NODES = 108;
const AI_MIN_LANE_HEIGHT = 152;
const LANE_HEIGHT_EMPTY = 88;

function isProcessNode(node: Node): boolean {
  const type = String(node.type ?? '');
  return type !== LANE_NODE_TYPE && type !== 'bpmnText';
}

function orderNodesInLane(laneNodes: Node[], edges: Edge[]): Node[] {
  if (laneNodes.length <= 1) return laneNodes;

  const ids = new Set(laneNodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>();
  const globalIncoming = new Map<string, number>();

  laneNodes.forEach((node) => {
    outgoing.set(node.id, []);
    globalIncoming.set(node.id, 0);
  });

  for (const edge of edges) {
    if (ids.has(edge.source) && ids.has(edge.target)) {
      outgoing.get(edge.source)?.push(edge.target);
    }
    if (ids.has(edge.target)) {
      globalIncoming.set(edge.target, (globalIncoming.get(edge.target) ?? 0) + 1);
    }
  }

  const starts = laneNodes.filter(
    (node) =>
      node.type === 'bpmnStart' ||
      ((globalIncoming.get(node.id) ?? 0) === 0 && node.type !== 'bpmnEnd'),
  );
  const queue = starts.length > 0 ? [...starts] : [laneNodes[0]!];
  const visited = new Set<string>();
  const ordered: Node[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);
    ordered.push(current);
    for (const nextId of outgoing.get(current.id) ?? []) {
      const next = laneNodes.find((node) => node.id === nextId);
      if (next && !visited.has(next.id)) queue.push(next);
    }
  }

  const unvisited = laneNodes
    .filter((node) => !visited.has(node.id))
    .sort((a, b) => {
      const rank = (node: Node) => {
        if (node.type === 'bpmnEnd') return 2;
        if (node.type === 'bpmnStart') return 0;
        return 1;
      };
      return rank(a) - rank(b);
    });
  ordered.push(...unvisited);

  const startsOnly = ordered.filter((node) => node.type === 'bpmnStart');
  const endsOnly = ordered.filter((node) => node.type === 'bpmnEnd');
  const middle = ordered.filter((node) => node.type !== 'bpmnStart' && node.type !== 'bpmnEnd');
  return [...startsOnly, ...middle, ...endsOnly];
}

function computeRelativeXPositions(
  lanes: Node[],
  nodesByLane: Map<string, Node[]>,
  edges: Edge[],
  processNodes: Node[],
  nodeGapX: number,
  maxNodesPerRow: number,
): { relativeXById: Map<string, number>; maxContentRight: number } {
  const relativeXById = new Map<string, number>();
  let maxContentRight = NODE_START_X;
  const passes = Math.max(4, lanes.length + 1);

  for (let pass = 0; pass < passes; pass += 1) {
    for (const lane of lanes) {
      const laneNodes = orderNodesInLane(nodesByLane.get(lane.id) ?? [], edges);
      if (laneNodes.length === 0) continue;
      const rows = splitNodesIntoRows(laneNodes, maxNodesPerRow);

      rows.forEach((row, rowIndex) => {
        let laneCursor = NODE_START_X + (rowIndex > 0 ? ROW_INDENT_X : 0);

        for (const node of row) {
          let x = laneCursor;

          for (const edge of edges) {
            if (edge.target !== node.id) continue;
            const sourceX = relativeXById.get(edge.source);
            if (sourceX === undefined) continue;
            const sourceNode = processNodes.find((item) => item.id === edge.source);
            const sourceWidth = sourceNode ? getProcessNodeSize(sourceNode).width : 140;
            x = Math.max(x, sourceX + sourceWidth + nodeGapX);
          }

          const size = getProcessNodeSize(node);
          const prev = relativeXById.get(node.id);
          const nextX = prev === undefined ? x : Math.max(prev, x);
          relativeXById.set(node.id, nextX);
          laneCursor = nextX + size.width + nodeGapX;
          maxContentRight = Math.max(maxContentRight, nextX + size.width);
        }
      });
    }
  }

  return { relativeXById, maxContentRight };
}

/** Alinha colunas em conexões verticais entre raias (gateway → tarefa abaixo/acima). */
function alignCrossLaneColumns(
  relativeXById: Map<string, number>,
  nodesByLane: Map<string, Node[]>,
  lanes: Node[],
  edges: Edge[],
  processNodes: Node[],
): void {
  const laneIndexById = new Map(lanes.map((lane, index) => [lane.id, index]));

  for (const edge of edges) {
    const source = processNodes.find((node) => node.id === edge.source);
    const target = processNodes.find((node) => node.id === edge.target);
    if (!source || !target) continue;

    const srcLaneId = findLaneIdForNode(nodesByLane, source.id);
    const tgtLaneId = findLaneIdForNode(nodesByLane, target.id);
    if (!srcLaneId || !tgtLaneId || srcLaneId === tgtLaneId) continue;

    const srcIdx = laneIndexById.get(srcLaneId) ?? 0;
    const tgtIdx = laneIndexById.get(tgtLaneId) ?? 0;
    if (srcIdx === tgtIdx) continue;

    const crossLaneIncoming = edges.filter((item) => {
      if (item.target !== target.id) return false;
      const fromLane = findLaneIdForNode(nodesByLane, item.source);
      return fromLane !== null && fromLane !== tgtLaneId;
    });
    if (crossLaneIncoming.length > 1) continue;

    const srcX = relativeXById.get(source.id);
    if (srcX === undefined) continue;

    const srcSize = getProcessNodeSize(source);
    const tgtSize = getProcessNodeSize(target);
    const alignedX = Math.round(srcX + srcSize.width / 2 - tgtSize.width / 2);
    const prev = relativeXById.get(target.id);
    relativeXById.set(target.id, prev === undefined ? alignedX : Math.max(prev, alignedX));
  }
}

function laneHeightFor(
  nodeCount: number,
  rowCount = 1,
  minLaneHeight = LANE_HEIGHT_WITH_NODES,
  rowHeightStep = ROW_HEIGHT_STEP,
): number {
  if (nodeCount === 0) return Math.max(LANE_HEIGHT_EMPTY, minLaneHeight);
  if (rowCount > 1) {
    return Math.max(
      minLaneHeight,
      LANE_PADDING_TOP + rowCount * rowHeightStep + LANE_PADDING_BOTTOM,
    );
  }
  return Math.max(minLaneHeight, LANE_PADDING_TOP + 80 + LANE_PADDING_BOTTOM);
}

function splitNodesIntoRows(nodes: Node[], maxPerRow: number): Node[][] {
  if (nodes.length <= maxPerRow) return [nodes];
  const rows: Node[][] = [];
  for (let index = 0; index < nodes.length; index += maxPerRow) {
    rows.push(nodes.slice(index, index + maxPerRow));
  }
  return rows;
}

export type FlowLayoutOptions = {
  nodeGapX?: number;
  maxNodesPerRow?: number;
  minLaneHeight?: number;
  minPoolWidth?: number;
  rowHeightStep?: number;
};

export const FLOW_AI_LAYOUT_OPTIONS: FlowLayoutOptions = {
  nodeGapX: AI_NODE_GAP_X,
  maxNodesPerRow: MAX_NODES_PER_ROW,
  minLaneHeight: AI_MIN_LANE_HEIGHT,
  minPoolWidth: AI_MIN_POOL_WIDTH,
  rowHeightStep: 96,
};

function findLaneIdForNode(nodesByLane: Map<string, Node[]>, nodeId: string): string | null {
  for (const [laneId, laneNodes] of Array.from(nodesByLane.entries())) {
    if (laneNodes.some((node) => node.id === nodeId)) return laneId;
  }
  return null;
}

/** Coloca cada Fim na raia e coluna do predecessor mais à direita — evita seta longa subindo raias. */
function optimizeEndEventPlacement(
  nodesByLane: Map<string, Node[]>,
  edges: Edge[],
  relativeXById: Map<string, number>,
  processNodes: Node[],
  nodeGapX: number,
): number {
  let maxContentRight = NODE_START_X;

  for (const node of processNodes) {
    const x = relativeXById.get(node.id);
    if (x === undefined) continue;
    maxContentRight = Math.max(maxContentRight, x + getProcessNodeSize(node).width);
  }

  for (const endNode of processNodes.filter((node) => node.type === 'bpmnEnd')) {
    const incoming = edges.filter((edge) => edge.target === endNode.id);
    if (incoming.length === 0) continue;

    const endLabel = resolveNodeLabel(endNode).toLowerCase();
    if (/reprov|rejeit|negad|cancel/.test(endLabel)) continue;

    let primarySource: Node | null = null;
    let primaryX = Number.NEGATIVE_INFINITY;

    for (const edge of incoming) {
      const source = processNodes.find((node) => node.id === edge.source);
      if (!source) continue;
      const sourceLabel = resolveNodeLabel(source).toLowerCase();
      if (/reprov|rejeit|cancel/.test(sourceLabel)) continue;
      const sourceX = relativeXById.get(source.id) ?? NODE_START_X;
      if (sourceX >= primaryX) {
        primaryX = sourceX;
        primarySource = source;
      }
    }

    if (!primarySource) continue;

    const sourceLaneId = findLaneIdForNode(nodesByLane, primarySource.id);
    if (!sourceLaneId) continue;

    const sourceWidth = getProcessNodeSize(primarySource).width;
    const endX = primaryX + sourceWidth + nodeGapX;
    relativeXById.set(endNode.id, endX);

    for (const [laneId, laneNodes] of Array.from(nodesByLane.entries())) {
      const filtered = laneNodes.filter((node) => node.id !== endNode.id);
      if (filtered.length !== laneNodes.length) {
        nodesByLane.set(laneId, filtered);
      }
    }
    nodesByLane.set(sourceLaneId, [...(nodesByLane.get(sourceLaneId) ?? []), endNode]);

    maxContentRight = Math.max(maxContentRight, endX + getProcessNodeSize(endNode).width);
  }

  return maxContentRight;
}

/** Nós fora da raia (ex.: Fim arrastado para baixo) entram na raia do predecessor/sucessor. */
function assignOrphansToLanes(
  orphanNodes: Node[],
  nodesByLane: Map<string, Node[]>,
  lanes: Node[],
  edges: Edge[],
): Node[] {
  if (orphanNodes.length === 0) return [];

  const nodeLaneId = new Map<string, string>();
  for (const [laneId, laneNodes] of Array.from(nodesByLane.entries())) {
    for (const node of laneNodes) {
      nodeLaneId.set(node.id, laneId);
    }
  }

  const remaining = [...orphanNodes];
  let changed = true;

  while (changed && remaining.length > 0) {
    changed = false;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const node = remaining[i]!;
      let laneId: string | null = null;

      for (const edge of edges) {
        if (edge.target !== node.id) continue;
        const fromLane = nodeLaneId.get(edge.source);
        if (fromLane) {
          laneId = fromLane;
          break;
        }
      }

      if (!laneId) {
        for (const edge of edges) {
          if (edge.source !== node.id) continue;
          const toLane = nodeLaneId.get(edge.target);
          if (toLane) {
            laneId = toLane;
            break;
          }
        }
      }

      if (!laneId && lanes.length === 1) {
        laneId = lanes[0]!.id;
      }

      if (laneId) {
        nodesByLane.set(laneId, [...(nodesByLane.get(laneId) ?? []), node]);
        nodeLaneId.set(node.id, laneId);
        remaining.splice(i, 1);
        changed = true;
      }
    }
  }

  return remaining;
}

/** Achata pool/raias para coordenadas absolutas antes de reorganizar o layout. */
function flattenForLayout(nodes: Node[]): Node[] {
  const nodeMap = buildNodeMap(nodes);
  return nodes
    .filter((node) => node.type !== POOL_NODE_TYPE)
    .map((node) => {
      if (node.type === LANE_NODE_TYPE || isProcessNode(node)) {
        const abs = getAbsolutePosition(node, nodeMap);
        const next = { ...node, position: abs, zIndex: node.type === LANE_NODE_TYPE ? 0 : 1 } as Node;
        delete next.parentId;
        delete next.extent;
        return next;
      }
      return node;
    });
}

/** Reorganiza o diagrama em escada compacta: uma linha por raia, sem espaços vazios enormes. */
export function organizeFlowLayout(
  nodes: Node[],
  edges: Edge[],
  options?: FlowLayoutOptions,
): Node[] {
  const preMap = buildNodeMap(nodes);
  const preLanes = nodes.filter((node) => node.type === LANE_NODE_TYPE);
  const preservedLaneByNodeId = new Map<string, string>();

  for (const node of nodes.filter(isProcessNode)) {
    if (node.parentId && preLanes.some((lane) => lane.id === node.parentId)) {
      preservedLaneByNodeId.set(node.id, node.parentId);
      continue;
    }
    const lane = findContainingLane(node, preLanes, preMap);
    if (lane) preservedLaneByNodeId.set(node.id, lane.id);
  }

  nodes = flattenForLayout(nodes);
  const nodeGapX = options?.nodeGapX ?? NODE_GAP_X;
  const maxNodesPerRow = options?.maxNodesPerRow ?? Number.POSITIVE_INFINITY;
  const minPoolWidth = options?.minPoolWidth ?? MIN_POOL_WIDTH;
  const minLaneHeight = options?.minLaneHeight ?? LANE_HEIGHT_WITH_NODES;
  const rowHeightStep = options?.rowHeightStep ?? ROW_HEIGHT_STEP;
  const processNodes = nodes.filter(isProcessNode);
  if (processNodes.length === 0) return nodes;

  const nodeMap = buildNodeMap(nodes);

  const lanes = nodes
    .filter((node) => node.type === LANE_NODE_TYPE)
    .sort((a, b) => {
      const aAbs = getAbsolutePosition(a, nodeMap);
      const bAbs = getAbsolutePosition(b, nodeMap);
      return aAbs.y - bAbs.y || aAbs.x - bAbs.x;
    });

  if (lanes.length === 0) {
    const sorted = orderNodesInLane(processNodes, edges);
    let x = NODE_START_X;
    const y = 80;
    const placed = sorted.map((node) => {
      const size = getProcessNodeSize(node);
      const positioned = {
        ...node,
        position: { x: POOL_X + x, y: y + (64 - size.height) / 2 },
        parentId: undefined,
        extent: undefined,
      };
      x += size.width + NODE_GAP_X;
      return positioned;
    });
    return syncLaneHierarchy([...nodes.filter((node) => !isProcessNode(node)), ...placed]);
  }

  const nodesByLane = new Map<string, Node[]>();
  const orphanNodes: Node[] = [];

  for (const node of processNodes) {
    const preservedLaneId = preservedLaneByNodeId.get(node.id);
    const lane =
      (preservedLaneId ? lanes.find((item) => item.id === preservedLaneId) : null) ??
      findContainingLane(node, lanes, nodeMap);

    if (lane) {
      nodesByLane.set(lane.id, [...(nodesByLane.get(lane.id) ?? []), node]);
    } else {
      orphanNodes.push(node);
    }
  }

  const stillOrphan = assignOrphansToLanes(orphanNodes, nodesByLane, lanes, edges);

  const activeLanes = lanes.filter((lane) => (nodesByLane.get(lane.id) ?? []).length > 0);
  if (activeLanes.length === 0) {
    return syncLaneHierarchy(nodes);
  }

  const { relativeXById } = computeRelativeXPositions(
    activeLanes,
    nodesByLane,
    edges,
    processNodes,
    nodeGapX,
    maxNodesPerRow,
  );

  alignCrossLaneColumns(relativeXById, nodesByLane, activeLanes, edges, processNodes);
  for (const lane of activeLanes) {
    const laneNodes = orderNodesInLane(nodesByLane.get(lane.id) ?? [], edges);
    let laneCursor = NODE_START_X;
    for (const node of laneNodes) {
      let x = laneCursor;
      for (const edge of edges) {
        if (edge.target !== node.id) continue;
        const sourceX = relativeXById.get(edge.source);
        if (sourceX === undefined) continue;
        const sourceNode = processNodes.find((item) => item.id === edge.source);
        const sourceWidth = sourceNode ? getProcessNodeSize(sourceNode).width : 140;
        x = Math.max(x, sourceX + sourceWidth + nodeGapX);
      }
      const size = getProcessNodeSize(node);
      const prev = relativeXById.get(node.id);
      relativeXById.set(node.id, prev === undefined ? x : Math.max(prev, x));
      laneCursor = (relativeXById.get(node.id) ?? x) + size.width + nodeGapX;
    }
  }

  const maxContentRight = optimizeEndEventPlacement(
    nodesByLane,
    edges,
    relativeXById,
    processNodes,
    nodeGapX,
  );

  const poolWidth = Math.max(minPoolWidth, maxContentRight + LANE_END_PADDING);
  const firstLaneAbs = getAbsolutePosition(activeLanes[0]!, buildNodeMap(nodes));
  const laneOriginX = POOL_X;
  let currentY = Math.max(80, firstLaneAbs.y);
  const nextLanes: Node[] = [];
  const nextProcess: Node[] = [];

  for (const lane of activeLanes) {
    const laneNodes = orderNodesInLane(nodesByLane.get(lane.id) ?? [], edges);
    const rows = splitNodesIntoRows(laneNodes, maxNodesPerRow);
    const laneHeight = laneHeightFor(laneNodes.length, rows.length, minLaneHeight, rowHeightStep);
    const laneShell: Node = {
      ...lane,
      parentId: undefined,
      position: { x: laneOriginX, y: currentY },
      style: {
        ...(lane.style as object),
        width: poolWidth,
        height: laneHeight,
      },
    };

    rows.forEach((row, rowIndex) => {
      const rowBaseY =
        LANE_PADDING_TOP +
        (rows.length === 1
          ? (laneHeight - LANE_PADDING_TOP - LANE_PADDING_BOTTOM) / 2
          : rowIndex * rowHeightStep + rowHeightStep / 2);

      for (const node of row) {
        const size = getProcessNodeSize(node);
        const x = relativeXById.get(node.id) ?? NODE_START_X + (rowIndex > 0 ? ROW_INDENT_X : 0);
        const y = rowBaseY - size.height / 2;

        nextProcess.push(
          attachNodeToLane(node, laneShell, {
            x: laneOriginX + x,
            y: currentY + y,
          }),
        );
      }
    });

    nextLanes.push(laneShell);
    currentY += laneHeight;
  }

  for (const node of stillOrphan) {
    const size = getProcessNodeSize(node);
    nextProcess.push({
      ...node,
      position: {
        x: laneOriginX + NODE_START_X,
        y: currentY + LANE_PADDING_TOP,
      },
      parentId: undefined,
      extent: undefined,
    });
  }

  const placedIds = new Set(nextProcess.map((node) => node.id));
  for (const node of processNodes) {
    if (placedIds.has(node.id)) continue;
    const preservedLaneId = preservedLaneByNodeId.get(node.id);
    const laneShell =
      nextLanes.find((lane) => lane.id === preservedLaneId) ??
      nextLanes[0];
    if (!laneShell) continue;
    const laneHeight = getLaneSize(laneShell).height;
    const size = getProcessNodeSize(node);
    const x = relativeXById.get(node.id) ?? NODE_START_X;
    const centerY =
      LANE_PADDING_TOP + (laneHeight - LANE_PADDING_TOP - LANE_PADDING_BOTTOM) / 2;
    nextProcess.push(
      attachNodeToLane(node, laneShell, {
        x: laneOriginX + x,
        y: laneShell.position.y + centerY - size.height / 2,
      }),
    );
    placedIds.add(node.id);
  }

  const staticNodes = nodes.filter((node) => {
    const type = String(node.type ?? '');
    return type !== LANE_NODE_TYPE && type !== POOL_NODE_TYPE && !isProcessNode(node);
  });
  return syncLaneHierarchy([...nextLanes, ...nextProcess, ...staticNodes]);
}
