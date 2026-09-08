import type { Node, NodeChange } from '@xyflow/react';
import { LANE_HEADER_WIDTH, MIN_LANE_HEIGHT, TASK_NODE_HEIGHT, TASK_NODE_WIDTH } from '@/components/flow/BpmnNodes';
import { GATEWAY_DIAMOND_SIZE } from '@/lib/flowGatewayAnchors';
import { ensureNodeLabels } from '@/lib/flowNodeDefaults';
import { ensurePoolHierarchy, isStructuralFlowNode, POOL_NODE_TYPE } from '@/lib/flowPoolHierarchy';

export const LANE_NODE_TYPE = 'bpmnLane';
export { POOL_NODE_TYPE, POOL_HEADER_WIDTH } from '@/lib/flowPoolHierarchy';

export const MIN_LANE_WIDTH = 360;
export { MIN_LANE_HEIGHT } from '@/components/flow/BpmnNodes';

export function getLaneSize(lane: Node): { width: number; height: number } {
  const style = lane.style as { width?: number; height?: number } | undefined;
  return {
    width: Number(lane.width ?? style?.width ?? 1200),
    height: Number(lane.height ?? style?.height ?? 120),
  };
}

function setLaneDimensions(lane: Node, width: number, height: number): Node {
  return {
    ...lane,
    width,
    height,
    style: { ...(lane.style as object), width, height },
  };
}

export function getProcessNodeSize(node: Node): { width: number; height: number } {
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
    default:
      return { width: TASK_NODE_WIDTH, height: TASK_NODE_HEIGHT };
  }
}

export function buildNodeMap(nodes: Node[]): Map<string, Node> {
  return new Map(nodes.map((node) => [node.id, node]));
}

export function getAbsolutePosition(node: Node, nodeMap?: Map<string, Node>): { x: number; y: number } {
  if (!node.parentId) {
    return { x: node.position.x, y: node.position.y };
  }

  const map = nodeMap ?? buildNodeMap([node]);
  const parent = map.get(node.parentId);
  if (!parent) {
    return { x: node.position.x, y: node.position.y };
  }

  const parentAbs = getAbsolutePosition(parent, map);
  return {
    x: parentAbs.x + node.position.x,
    y: parentAbs.y + node.position.y,
  };
}

export function findContainingLane(node: Node, lanes: Node[], nodeMap: Map<string, Node>): Node | null {
  const abs = getAbsolutePosition(node, nodeMap);
  const { width, height } = getProcessNodeSize(node);
  const centerX = abs.x + width / 2;
  const centerY = abs.y + height / 2;

  let match: Node | null = null;
  let smallestArea = Number.POSITIVE_INFINITY;

  for (const lane of lanes) {
    const laneSize = getLaneSize(lane);
    const laneAbs = getAbsolutePosition(lane, nodeMap);
    const lx = laneAbs.x;
    const ly = laneAbs.y;

    if (
      centerX >= lx &&
      centerX <= lx + laneSize.width &&
      centerY >= ly &&
      centerY <= ly + laneSize.height
    ) {
      const area = laneSize.width * laneSize.height;
      if (area < smallestArea) {
        smallestArea = area;
        match = lane;
      }
    }
  }

  return match;
}

function laneChildExtent(lane: Node): [[number, number], [number, number]] {
  const { width, height } = getLaneSize(lane);
  return [
    [LANE_HEADER_WIDTH, 0],
    [width, height],
  ];
}

/** Mantido para referência de bounds; não aplicamos extent nos nós para permitir arrastar entre raias. */
export function getLaneChildExtent(lane: Node): [[number, number], [number, number]] {
  return laneChildExtent(lane);
}

const POOL_X_EPS = 6;
const LANE_STACK_GAP_EPS = 8;

function areLanesVerticallyStacked(upper: Node, lower: Node, nodeMap: Map<string, Node>): boolean {
  const upperHeight = getLaneSize(upper).height;

  if ((upper.parentId ?? null) === (lower.parentId ?? null) && upper.parentId) {
    const gap = lower.position.y - (upper.position.y + upperHeight);
    return gap >= -2 && gap <= LANE_STACK_GAP_EPS;
  }

  const upperAbs = getAbsolutePosition(upper, nodeMap);
  const lowerAbs = getAbsolutePosition(lower, nodeMap);
  const gap = lowerAbs.y - (upperAbs.y + upperHeight);
  return gap >= -2 && gap <= LANE_STACK_GAP_EPS;
}

/** Raias coladas no mesmo pool (mesmo X, empilhadas verticalmente). */
export function getStackedLaneGroup(lanes: Node[], laneId: string, allNodes?: Node[]): Node[] {
  const nodeMap = allNodes ? buildNodeMap(allNodes) : buildNodeMap(lanes);
  const target = lanes.find((lane) => lane.id === laneId);
  if (!target) return [];

  const targetParent = target.parentId ?? null;
  const scoped = lanes.filter((lane) => (lane.parentId ?? null) === targetParent);

  const targetAbs = getAbsolutePosition(target, nodeMap);
  const sameColumn = scoped
    .filter((lane) => {
      const abs = getAbsolutePosition(lane, nodeMap);
      return Math.abs(abs.x - targetAbs.x) <= POOL_X_EPS;
    })
    .sort((a, b) => {
      if (targetParent) return a.position.y - b.position.y;
      return getAbsolutePosition(a, nodeMap).y - getAbsolutePosition(b, nodeMap).y;
    });

  const targetIndex = sameColumn.findIndex((lane) => lane.id === laneId);
  if (targetIndex < 0) return [target];

  let start = targetIndex;
  let end = targetIndex;

  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    if (!areLanesVerticallyStacked(sameColumn[index]!, sameColumn[index + 1]!, nodeMap)) break;
    start = index;
  }

  for (let index = targetIndex + 1; index < sameColumn.length; index += 1) {
    if (!areLanesVerticallyStacked(sameColumn[index - 1]!, sameColumn[index]!, nodeMap)) break;
    end = index;
  }

  const group = sameColumn.slice(start, end + 1);
  return group.length > 1 ? group : [target];
}

/** Redimensiona raia: largura sincronizada no pool empilhado; altura individual com raias de baixo ajustadas. */
export function applyLaneDimensionChange(
  nodes: Node[],
  resizedLaneId: string,
  dimensions: { width: number; height: number },
): Node[] {
  const lanes = nodes.filter((node) => node.type === LANE_NODE_TYPE);
  const resizedLane = lanes.find((lane) => lane.id === resizedLaneId);
  if (!resizedLane) return nodes;

  const newWidth = Math.max(MIN_LANE_WIDTH, Math.round(dimensions.width));
  const newHeight = Math.max(MIN_LANE_HEIGHT, Math.round(dimensions.height));
  const group = getStackedLaneGroup(lanes, resizedLaneId, nodes);
  const groupIds = new Set(group.map((lane) => lane.id));
  const sortedGroup = [...group].sort((a, b) => a.position.y - b.position.y);
  const resizedIndex = sortedGroup.findIndex((lane) => lane.id === resizedLaneId);
  const heightDelta = newHeight - getLaneSize(resizedLane).height;
  const syncWidth = group.length > 1;

  let next = nodes.map((node) => {
    if (!groupIds.has(node.id)) return node;

    if (node.id === resizedLaneId) {
      return setLaneDimensions(node, newWidth, newHeight);
    }

    const laneWidth = syncWidth ? newWidth : getLaneSize(node).width;
    return setLaneDimensions(node, laneWidth, getLaneSize(node).height);
  });

  if (syncWidth && resizedIndex >= 0 && heightDelta !== 0) {
    const belowIds = new Set(sortedGroup.slice(resizedIndex + 1).map((lane) => lane.id));
    next = next.map((node) => {
      if (!belowIds.has(node.id)) return node;
      return {
        ...node,
        position: { ...node.position, y: node.position.y + heightDelta },
      };
    });
  }

  return fitPoolsToLanes(next);
}

function fitPoolsToLanes(nodes: Node[]): Node[] {
  const pools = nodes.filter((node) => node.type === POOL_NODE_TYPE);

  return nodes.map((node) => {
    if (node.type !== POOL_NODE_TYPE) return node;

    const childLanes = nodes.filter(
      (item) => item.type === LANE_NODE_TYPE && item.parentId === node.id,
    );
    if (childLanes.length === 0) return node;

    let maxRight = 0;
    let maxBottom = 0;
    for (const lane of childLanes) {
      const size = getLaneSize(lane);
      maxRight = Math.max(maxRight, lane.position.x + size.width);
      maxBottom = Math.max(maxBottom, lane.position.y + size.height);
    }

    return setLaneDimensions(
      node,
      Math.max(maxRight, MIN_LANE_WIDTH),
      Math.max(maxBottom, MIN_LANE_HEIGHT),
    );
  });
}

/** @deprecated Use applyLaneDimensionChange */
export function applyStackedLaneWidth(nodes: Node[], resizedLaneId: string, newWidth: number): Node[] {
  const lane = nodes.find((node) => node.id === resizedLaneId);
  const height = lane ? getLaneSize(lane).height : 120;
  return applyLaneDimensionChange(nodes, resizedLaneId, { width: newWidth, height });
}

export function attachNodeToLane(
  node: Node,
  lane: Node,
  absolutePosition?: { x: number; y: number },
  nodeMap?: Map<string, Node>,
): Node {
  const map = nodeMap ?? buildNodeMap([node, lane]);
  const abs = absolutePosition ?? getAbsolutePosition(node, map);
  const laneAbs = getAbsolutePosition(lane, map);
  const attached: Node = {
    ...node,
    parentId: lane.id,
    position: {
      x: abs.x - laneAbs.x,
      y: abs.y - laneAbs.y,
    },
    zIndex: 1,
  };
  delete attached.extent;
  return attached;
}

export function detachNodeFromLane(node: Node, nodeMap: Map<string, Node>): Node {
  const abs = getAbsolutePosition(node, nodeMap);
  const next = { ...node, position: abs, zIndex: 1 } as Node;
  delete next.parentId;
  delete next.extent;
  return next;
}

export function syncLaneHierarchy(nodes: Node[]): Node[] {
  const withPools = ensurePoolHierarchy(nodes);
  const lanes = withPools.filter((n) => n.type === LANE_NODE_TYPE);
  if (lanes.length === 0) {
    const pools = withPools.filter((n) => n.type === POOL_NODE_TYPE);
    const rest = withPools.filter((n) => n.type !== POOL_NODE_TYPE);
    return ensureNodeLabels([
      ...pools.map((pool) => ({ ...pool, zIndex: -1, dragHandle: '.pool-drag-handle' })),
      ...rest,
    ]);
  }

  const nodeMap = buildNodeMap(withPools);
  const processNodes = withPools.filter((n) => !isStructuralFlowNode(String(n.type ?? '')));
  const attached = new Map<string, Node>();

  for (const lane of lanes) {
    attached.set(lane.id, { ...lane, zIndex: 0 });
  }

  for (const node of processNodes) {
    const abs = getAbsolutePosition(node, nodeMap);
    const lane = findContainingLane(
      { ...node, parentId: undefined, extent: undefined, position: abs },
      lanes,
      nodeMap,
    );

    if (lane) {
      attached.set(node.id, attachNodeToLane(node, lane, abs, nodeMap));
    } else {
      attached.set(node.id, detachNodeFromLane({ ...node, position: abs }, nodeMap));
    }
  }

  const pools = withPools.filter((n) => n.type === POOL_NODE_TYPE);
  const ordered: Node[] = [];

  for (const pool of [...pools].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)) {
    ordered.push({ ...pool, zIndex: -1 });

    const poolLanes = lanes
      .filter((lane) => lane.parentId === pool.id)
      .sort((a, b) => a.position.y - b.position.y);

    for (const lane of poolLanes) {
      const laneNode = attached.get(lane.id);
      if (laneNode) ordered.push(laneNode);

      const children = processNodes
        .filter((node) => attached.get(node.id)?.parentId === lane.id)
        .sort((a, b) => {
          const aPos = attached.get(a.id)!.position;
          const bPos = attached.get(b.id)!.position;
          return aPos.x - bPos.x || aPos.y - bPos.y;
        });

      for (const child of children) {
        const childNode = attached.get(child.id);
        if (childNode) ordered.push(childNode);
      }
    }
  }

  for (const lane of lanes.filter((item) => !item.parentId)) {
    const laneNode = attached.get(lane.id);
    if (laneNode && !ordered.some((item) => item.id === lane.id)) {
      ordered.push(laneNode);
      const children = processNodes.filter((node) => attached.get(node.id)?.parentId === lane.id);
      for (const child of children) {
        const childNode = attached.get(child.id);
        if (childNode) ordered.push(childNode);
      }
    }
  }

  for (const node of processNodes) {
    const next = attached.get(node.id);
    if (next && !next.parentId && !ordered.some((item) => item.id === next.id)) {
      ordered.push(next);
    }
  }

  return ensureNodeLabels(fitPoolsToLanes(ordered));
}

/** Remove pools que ficaram sem nenhuma raia filha. */
export function removeEmptyPools(nodes: Node[]): Node[] {
  return nodes.filter((node) => {
    if (node.type !== POOL_NODE_TYPE) return true;
    return nodes.some(
      (child) => child.type === LANE_NODE_TYPE && child.parentId === node.id,
    );
  });
}

export function deleteLaneWithChildren(nodes: Node[], laneId: string): Node[] {
  const filtered = nodes.filter((node) => node.id !== laneId && node.parentId !== laneId);
  return removeEmptyPools(filtered);
}

/**
 * Durante o arraste de uma raia empilhada, impede que irmãs do mesmo pool
 * recebam atualização de posição (ex.: seleção múltipla acidental).
 */
export function filterIndependentLanePositionChanges(
  nodes: Node[],
  changes: NodeChange[],
  primaryLaneId: string | null,
): NodeChange[] {
  if (!primaryLaneId) return changes;

  const lanes = nodes.filter((node) => node.type === LANE_NODE_TYPE);
  const group = getStackedLaneGroup(lanes, primaryLaneId, nodes);
  if (group.length <= 1) return changes;

  const groupIds = new Set(group.map((lane) => lane.id));
  const movingGroupLaneIds = changes.flatMap((change) => {
    if (change.type !== 'position' || change.dragging === false) return [];
    return groupIds.has(change.id) ? [change.id] : [];
  });

  if (movingGroupLaneIds.length <= 1) return changes;

  const blockedIds = new Set(movingGroupLaneIds.filter((id) => id !== primaryLaneId));
  if (blockedIds.size === 0) return changes;

  return changes.filter((change) => {
    if (change.type !== 'position') return true;
    return !blockedIds.has(change.id);
  });
}

/** Mantém irmãs empilhadas paradas enquanto só a raia arrastada se move. */
export function pinStackedLaneSiblingsDuringDrag(
  nodes: Node[],
  primaryLaneId: string,
  pinnedPositions: Map<string, { x: number; y: number }>,
): Node[] {
  return nodes.map((node) => {
    if (node.type !== LANE_NODE_TYPE || node.id === primaryLaneId) return node;
    const pinned = pinnedPositions.get(node.id);
    if (!pinned) return node;
    if (node.position.x === pinned.x && node.position.y === pinned.y) return node;
    return { ...node, position: pinned };
  });
}

export function snapshotStackedLanePositions(
  nodes: Node[],
  laneId: string,
): Map<string, { x: number; y: number }> {
  const lanes = nodes.filter((node) => node.type === LANE_NODE_TYPE);
  const group = getStackedLaneGroup(lanes, laneId, nodes);
  return new Map(group.map((lane) => [lane.id, { ...lane.position }]));
}

export function getSelectedLaneChildIds(nodes: Node[]): Set<string> {
  const selectedLaneIds = new Set(
    nodes.filter((node) => node.selected && node.type === LANE_NODE_TYPE).map((node) => node.id),
  );
  if (selectedLaneIds.size === 0) return new Set();

  return new Set(
    nodes
      .filter((node) => node.parentId && selectedLaneIds.has(node.parentId))
      .map((node) => node.id),
  );
}
