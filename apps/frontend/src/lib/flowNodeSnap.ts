import type { Node, NodeChange, NodePositionChange } from '@xyflow/react';
import { isPreviewId } from '@/lib/flowAppend';
import {
  buildNodeMap,
  getAbsolutePosition,
  getProcessNodeSize,
  LANE_NODE_TYPE,
} from '@/lib/flowLaneHierarchy';
import { POOL_NODE_TYPE } from '@/lib/flowPoolHierarchy';

export const FLOW_ALIGN_SNAP_TOLERANCE = 12;
export const FLOW_GRID_SNAP = 8;

export type FlowAlignmentGuide = {
  axis: 'x' | 'y';
  position: number;
  start: number;
  end: number;
};

type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
};

function isSnapTarget(node: Node): boolean {
  if (node.type === LANE_NODE_TYPE || node.type === POOL_NODE_TYPE || node.type === 'bpmnText') {
    return false;
  }
  if (isPreviewId(node.id)) return false;
  return true;
}

function toBounds(abs: { x: number; y: number }, size: { width: number; height: number }): Bounds {
  return {
    left: abs.x,
    top: abs.y,
    right: abs.x + size.width,
    bottom: abs.y + size.height,
    centerX: abs.x + size.width / 2,
    centerY: abs.y + size.height / 2,
  };
}

function snapToGrid(value: number, step = FLOW_GRID_SNAP): number {
  return Math.round(value / step) * step;
}

function snapAxisWithMatch(
  bounds: Bounds,
  targetLines: number[],
  axis: 'x' | 'y',
  tolerance: number,
): { shift: number; matchedLine: number | null } {
  const anchors =
    axis === 'x'
      ? [bounds.left, bounds.centerX, bounds.right]
      : [bounds.top, bounds.centerY, bounds.bottom];

  let bestShift = 0;
  let bestDistance = tolerance + 1;
  let matchedLine: number | null = null;

  for (const line of targetLines) {
    for (const anchor of anchors) {
      const shift = line - anchor;
      const distance = Math.abs(shift);
      if (distance <= tolerance && distance < bestDistance) {
        bestDistance = distance;
        bestShift = shift;
        matchedLine = line;
      }
    }
  }

  return { shift: bestShift, matchedLine };
}

function guideExtent(bounds: Bounds, axis: 'x' | 'y', padding = 56): { start: number; end: number } {
  if (axis === 'x') {
    return { start: bounds.top - padding, end: bounds.bottom + padding };
  }
  return { start: bounds.left - padding, end: bounds.right + padding };
}

function collectAlignmentLines(nodes: Node[], nodeMap: Map<string, Node>, excludeIds: Set<string>): {
  xLines: number[];
  yLines: number[];
} {
  const xLines: number[] = [];
  const yLines: number[] = [];

  for (const node of nodes) {
    if (excludeIds.has(node.id) || !isSnapTarget(node)) continue;
    const abs = getAbsolutePosition(node, nodeMap);
    const size = getProcessNodeSize(node);
    const bounds = toBounds(abs, size);
    xLines.push(bounds.left, bounds.centerX, bounds.right);
    yLines.push(bounds.top, bounds.centerY, bounds.bottom);
  }

  return { xLines, yLines };
}

function absoluteToNodePosition(
  node: Node,
  abs: { x: number; y: number },
  nodeMap: Map<string, Node>,
): { x: number; y: number } {
  if (!node.parentId) return abs;
  const parent = nodeMap.get(node.parentId);
  if (!parent) return abs;
  const parentAbs = getAbsolutePosition(parent, nodeMap);
  return {
    x: abs.x - parentAbs.x,
    y: abs.y - parentAbs.y,
  };
}

export function snapNodePositionChangesWithGuides(
  nodes: Node[],
  changes: NodeChange[],
  tolerance = FLOW_ALIGN_SNAP_TOLERANCE,
): { changes: NodeChange[]; guides: FlowAlignmentGuide[] } {
  const movingIds = new Set(
    changes
      .filter(
        (change): change is NodePositionChange =>
          change.type === 'position' && Boolean(change.dragging) && Boolean(change.position),
      )
      .map((change) => change.id),
  );
  if (movingIds.size === 0) return { changes, guides: [] };

  const nodeMap = buildNodeMap(nodes);
  const { xLines, yLines } = collectAlignmentLines(nodes, nodeMap, movingIds);
  const guides: FlowAlignmentGuide[] = [];

  const nextChanges = changes.map((change) => {
    if (change.type !== 'position' || !change.position || !change.dragging) return change;

    const node = nodes.find((item) => item.id === change.id);
    if (!node || !isSnapTarget(node)) return change;

    const size = getProcessNodeSize(node);
    let abs = getAbsolutePosition({ ...node, position: change.position }, nodeMap);
    let bounds = toBounds(abs, size);

    let alignedX = false;
    let alignedY = false;

    if (xLines.length > 0) {
      const { shift, matchedLine } = snapAxisWithMatch(bounds, xLines, 'x', tolerance);
      if (shift !== 0 && matchedLine !== null) {
        abs.x += shift;
        alignedX = true;
        bounds = toBounds(abs, size);
        const span = guideExtent(bounds, 'x');
        guides.push({ axis: 'x', position: matchedLine, start: span.start, end: span.end });
      }
    }
    if (yLines.length > 0) {
      const { shift, matchedLine } = snapAxisWithMatch(bounds, yLines, 'y', tolerance);
      if (shift !== 0 && matchedLine !== null) {
        abs.y += shift;
        alignedY = true;
        bounds = toBounds(abs, size);
        const span = guideExtent(bounds, 'y');
        guides.push({ axis: 'y', position: matchedLine, start: span.start, end: span.end });
      }
    }

    if (!alignedX) abs.x = snapToGrid(abs.x);
    if (!alignedY) abs.y = snapToGrid(abs.y);

    return {
      ...change,
      position: absoluteToNodePosition(node, abs, nodeMap),
    };
  });

  return { changes: nextChanges, guides };
}

/** @deprecated Use snapNodePositionChangesWithGuides */
export function snapNodePositionChanges(
  nodes: Node[],
  changes: NodeChange[],
  tolerance = FLOW_ALIGN_SNAP_TOLERANCE,
): NodeChange[] {
  return snapNodePositionChangesWithGuides(nodes, changes, tolerance).changes;
}
