import { getSmoothStepPath } from '@xyflow/react';
import type { Position } from '@xyflow/react';
import { FLOW_EDGE_PATH_OPTIONS } from './flowEdge';
import { simplifyCollinear, type Point } from './flowEdgeRouting';

function pushUnique(points: Point[], x: number, y: number): void {
  const last = points[points.length - 1];
  if (!last || last.x !== x || last.y !== y) {
    points.push({ x, y });
  }
}

/** Converte path SVG (M/L) em waypoints ortogonais para BPMN DI. */
export function parseSvgOrthogonalPath(pathD: string): Point[] {
  const tokens = pathD.match(/[MLHVCSQTAZ]|-?\d*\.?\d+/gi) ?? [];
  const points: Point[] = [];
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    if (/^[MLHVCSQTAZ]$/i.test(token)) {
      cmd = token.toUpperCase();
      i += 1;
      continue;
    }

    if (cmd === 'M' || cmd === 'L') {
      const x = Math.round(parseFloat(tokens[i]));
      const y = Math.round(parseFloat(tokens[i + 1]));
      i += 2;
      pushUnique(points, x, y);
      cx = x;
      cy = y;
      if (cmd === 'M') cmd = 'L';
      continue;
    }

    if (cmd === 'H') {
      const x = Math.round(parseFloat(tokens[i]));
      i += 1;
      pushUnique(points, x, cy);
      cx = x;
      continue;
    }

    if (cmd === 'V') {
      const y = Math.round(parseFloat(tokens[i]));
      i += 1;
      pushUnique(points, cx, y);
      cy = y;
      continue;
    }

    i += 1;
  }

  return simplifyCollinear(points);
}

function simplifyOrthogonalCorners(raw: Point[]): Point[] {
  if (raw.length < 2) return raw;
  const corners: Point[] = [raw[0]];

  for (let index = 1; index < raw.length - 1; index += 1) {
    const prev = corners[corners.length - 1];
    const curr = raw[index];
    const next = raw[index + 1];
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    if ((dx1 !== 0 || dy1 !== 0) && (dx2 !== 0 || dy2 !== 0) && dx1 * dy2 - dy1 * dx2 !== 0) {
      corners.push(curr);
    }
  }

  corners.push(raw[raw.length - 1]);
  return simplifyCollinear(corners);
}

export function extractWaypointsFromPathElement(pathEl: SVGPathElement): Point[] {
  const fromAttr = parseSvgOrthogonalPath(pathEl.getAttribute('d') ?? '');
  if (fromAttr.length >= 2) return fromAttr;

  const total = pathEl.getTotalLength();
  if (total <= 0) return [];

  const sampled: Point[] = [];
  const step = 3;
  for (let length = 0; length <= total; length += step) {
    const point = pathEl.getPointAtLength(length);
    sampled.push({ x: Math.round(point.x), y: Math.round(point.y) });
  }

  const end = pathEl.getPointAtLength(total);
  pushUnique(sampled, Math.round(end.x), Math.round(end.y));
  return simplifyOrthogonalCorners(sampled);
}

export function extractEdgeWaypointsFromCanvas(edgeId: string, canvasRoot: Element | null): Point[] | null {
  if (!canvasRoot) return null;

  const pathEl = canvasRoot.querySelector(
    `.react-flow__edge[data-id="${CSS.escape(edgeId)}"] .react-flow__edge-path`,
  ) as SVGPathElement | null;

  if (!pathEl) return null;
  const points = extractWaypointsFromPathElement(pathEl);
  return points.length >= 2 ? points : null;
}

export function buildSmoothStepWaypoints(
  sourceX: number,
  sourceY: number,
  sourcePosition: Position,
  targetX: number,
  targetY: number,
  targetPosition: Position,
): Point[] {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: FLOW_EDGE_PATH_OPTIONS.borderRadius,
    offset: FLOW_EDGE_PATH_OPTIONS.offset,
  });
  const points = parseSvgOrthogonalPath(path);
  return points.length >= 2 ? points : [];
}
