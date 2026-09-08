import type { Node } from '@xyflow/react';
import { nextFlowNodeId } from '@/lib/flowAppend';
import { getDefaultLabelForType } from '@/lib/flowNodeDefaults';
import {
  buildNodeMap,
  getAbsolutePosition,
  getLaneSize,
  LANE_NODE_TYPE,
} from '@/lib/flowLaneHierarchy';

export const POOL_NODE_TYPE = 'bpmnPool';
export const POOL_HEADER_WIDTH = 32;

const POOL_X_EPS = 6;
const LANE_STACK_GAP_EPS = 8;

function areLanesStacked(upper: Node, lower: Node, nodeMap: Map<string, Node>): boolean {
  const sameParent = (upper.parentId ?? null) === (lower.parentId ?? null);
  const upperHeight = getLaneSize(upper).height;

  if (sameParent && upper.parentId) {
    const gap = lower.position.y - (upper.position.y + upperHeight);
    return gap >= -2 && gap <= LANE_STACK_GAP_EPS;
  }

  const upperAbs = getAbsolutePosition(upper, nodeMap);
  const lowerAbs = getAbsolutePosition(lower, nodeMap);
  const gap = lowerAbs.y - (upperAbs.y + upperHeight);
  return gap >= -2 && gap <= LANE_STACK_GAP_EPS;
}

function buildLaneStacks(lanes: Node[], nodeMap: Map<string, Node>): Node[][] {
  const remaining = new Set(lanes.map((lane) => lane.id));
  const sorted = [...lanes].sort(
    (a, b) => getAbsolutePosition(a, nodeMap).y - getAbsolutePosition(b, nodeMap).y,
  );
  const stacks: Node[][] = [];

  while (remaining.size > 0) {
    const seed = sorted.find((lane) => remaining.has(lane.id));
    if (!seed) break;

    const stack: Node[] = [seed];
    remaining.delete(seed.id);

    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const candidate of sorted) {
        if (!remaining.has(candidate.id)) continue;
        const top = stack[0]!;
        const bottom = stack[stack.length - 1]!;
        if (areLanesStacked(candidate, bottom, nodeMap)) {
          stack.push(candidate);
          remaining.delete(candidate.id);
          expanded = true;
        } else if (areLanesStacked(top, candidate, nodeMap)) {
          stack.unshift(candidate);
          remaining.delete(candidate.id);
          expanded = true;
        }
      }
    }

    stack.sort((a, b) => {
      if ((a.parentId ?? null) === (b.parentId ?? null) && a.parentId) {
        return a.position.y - b.position.y;
      }
      return getAbsolutePosition(a, nodeMap).y - getAbsolutePosition(b, nodeMap).y;
    });
    stacks.push(stack);
  }

  return stacks;
}

function computePoolLayout(lanes: Node[], nodeMap: Map<string, Node>) {
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

  return {
    x: minX - POOL_HEADER_WIDTH,
    y: minY,
    width: POOL_HEADER_WIDTH + (maxX - minX),
    height: maxY - minY,
  };
}

function resolvePoolId(stack: Node[], pools: Node[]): string {
  const parentIds = Array.from(
    new Set(stack.map((lane) => lane.parentId).filter((id): id is string => Boolean(id))),
  );
  if (parentIds.length === 1) {
    const poolId = parentIds[0]!;
    if (pools.some((pool) => pool.id === poolId)) return poolId;
  }
  return nextFlowNodeId('bpmnPool');
}

function setPoolDimensions(pool: Node, width: number, height: number): Node {
  return {
    ...pool,
    width,
    height,
    style: { ...(pool.style as object), width, height },
  };
}

/** Agrupa raias empilhadas em pools BPMN (participant) — pai visual e de arraste. */
export function ensurePoolHierarchy(nodes: Node[]): Node[] {
  const lanes = nodes.filter((node) => node.type === LANE_NODE_TYPE);
  if (lanes.length === 0) {
    const pools = nodes.filter((node) => node.type === POOL_NODE_TYPE);
    const others = nodes.filter((node) => node.type !== POOL_NODE_TYPE);
    if (pools.length > 0) {
      return [
        ...others,
        ...pools.map((pool) => ({
          ...pool,
          zIndex: -1,
          dragHandle: '.pool-drag-handle',
        })),
      ];
    }
    return others;
  }

  const nodeMap = buildNodeMap(nodes);
  const existingPools = nodes.filter((node) => node.type === POOL_NODE_TYPE);
  const others = nodes.filter((node) => node.type !== LANE_NODE_TYPE && node.type !== POOL_NODE_TYPE);
  const stacks = buildLaneStacks(lanes, nodeMap);

  const nextPools = new Map<string, Node>();
  const nextLanes = new Map<string, Node>();

  for (const stack of stacks) {
    const layout = computePoolLayout(stack, nodeMap);
    const poolId = resolvePoolId(stack, existingPools);
    const existingPool = existingPools.find((pool) => pool.id === poolId) ?? nextPools.get(poolId);

    const poolNode: Node = setPoolDimensions(
      {
        ...(existingPool ?? {
          id: poolId,
          type: POOL_NODE_TYPE,
          data: { label: getDefaultLabelForType('bpmnPool') },
          zIndex: -1,
          selectable: true,
          draggable: true,
        }),
        position: { x: layout.x, y: layout.y },
        dragHandle: '.pool-drag-handle',
      },
      layout.width,
      layout.height,
    );

    nextPools.set(poolId, poolNode);

    for (const lane of stack) {
      const abs = getAbsolutePosition(lane, nodeMap);
      nextLanes.set(lane.id, {
        ...lane,
        parentId: poolId,
        position: {
          x: abs.x - layout.x,
          y: abs.y - layout.y,
        },
        zIndex: 0,
        draggable: true,
        dragHandle: '.lane-drag-handle',
      });
    }
  }

  const usedPoolIds = new Set(nextPools.keys());
  const preservedPools = existingPools.filter((pool) => !usedPoolIds.has(pool.id));

  return [
    ...others,
    ...preservedPools,
    ...Array.from(nextPools.values()),
    ...Array.from(nextLanes.values()),
  ];
}

export function isStructuralFlowNode(type: string | undefined): boolean {
  return type === LANE_NODE_TYPE || type === POOL_NODE_TYPE;
}

/** Remove pool, raias filhas e elementos dentro delas. */
export function deletePoolWithContents(nodes: Node[], poolId: string): Node[] {
  const laneIds = new Set(
    nodes
      .filter((node) => node.type === LANE_NODE_TYPE && node.parentId === poolId)
      .map((node) => node.id),
  );

  return nodes.filter(
    (node) =>
      node.id !== poolId &&
      !laneIds.has(node.id) &&
      !(node.parentId && (laneIds.has(node.parentId) || node.parentId === poolId)),
  );
}
