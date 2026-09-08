import type { Position as RFPosition } from '@xyflow/react';
import {
  buildManhattanWaypoints,
  buildOrthogonalPathFromRoutePoints,
  fixSourceDeparture,
  fixTargetApproach,
  bothEdgeHandlesDefined,
  resolveConnectionSides,
  trimPathEndForHandle,
  type AnchorSide,
  type Point,
} from './flowEdgeRouting';

/** Mesma linha visual quando direita→esquerda (ou vice-versa) com leve diferença de altura. */
const ALIGN_TOLERANCE = 56;

function shouldStraightenHorizontal(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  fromSide: AnchorSide,
  toSide: AnchorSide,
): boolean {
  if (fromSide === 'right' && toSide === 'left' && targetX > sourceX + 4) return true;
  if (fromSide === 'left' && toSide === 'right' && targetX < sourceX - 4) return true;
  return false;
}

function shouldStraightenVertical(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  fromSide: AnchorSide,
  toSide: AnchorSide,
): boolean {
  if (Math.abs(sourceX - targetX) > ALIGN_TOLERANCE) return false;
  if (fromSide === 'bottom' && toSide === 'top' && targetY > sourceY + 4) return true;
  if (fromSide === 'top' && toSide === 'bottom' && targetY < sourceY - 4) return true;
  return false;
}

function isAxisAlignedStraight(a: Point, b: Point): boolean {
  return a.x === b.x || a.y === b.y;
}

function buildAlignedHorizontalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): Point[] {
  const sx = Math.round(sourceX);
  const sy = Math.round(sourceY);
  const tx = Math.round(targetX);
  const ty = Math.round(targetY);

  if (sy === ty) {
    return [
      { x: sx, y: sy },
      { x: tx, y: ty },
    ];
  }

  return [
    { x: sx, y: sy },
    { x: tx, y: sy },
    { x: tx, y: ty },
  ];
}

function buildAlignedVerticalPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): Point[] {
  const sx = Math.round(sourceX);
  const sy = Math.round(sourceY);
  const tx = Math.round(targetX);
  const ty = Math.round(targetY);

  if (Math.abs(sx - tx) <= ALIGN_TOLERANCE) {
    return [
      { x: sx, y: sy },
      { x: tx, y: ty },
    ];
  }

  return [
    { x: sx, y: sy },
    { x: sx, y: ty },
    { x: tx, y: ty },
  ];
}

function pointsToPath(points: Point[]): string {
  if (points.length === 0) return '';
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${Math.round(point.x)} ${Math.round(point.y)}`)
    .join(' ');
}

function labelPointOnPath(points: Point[]): Point {
  if (points.length <= 2) {
    const a = points[0] ?? { x: 0, y: 0 };
    const b = points[1] ?? a;
    return { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
  }
  const mid = points[Math.floor(points.length / 2)]!;
  return { x: mid.x, y: mid.y };
}

function buildPathResult(
  anchorPoints: Point[],
  routePointHandles: Point[] = [],
  sides?: { fromSide: AnchorSide; toSide: AnchorSide },
): { path: string; labelX: number; labelY: number; handles: Point[]; points: Point[] } {
  let pathPoints = anchorPoints;
  const start = anchorPoints[0];
  const end = anchorPoints[anchorPoints.length - 1];
  const isStraightEdge =
    pathPoints.length === 2 && isAxisAlignedStraight(pathPoints[0]!, pathPoints[1]!);
  if (sides && !isStraightEdge) {
    pathPoints = fixSourceDeparture(pathPoints, sides.fromSide);
    pathPoints = fixTargetApproach(pathPoints, sides.toSide);
  }
  if (start) pathPoints[0] = { x: Math.round(start.x), y: Math.round(start.y) };
  if (end) pathPoints[pathPoints.length - 1] = { x: Math.round(end.x), y: Math.round(end.y) };
  pathPoints = trimPathEndForHandle(pathPoints);
  const path = pointsToPath(pathPoints);
  const label = labelPointOnPath(pathPoints);
  const handles =
    routePointHandles.length > 0 ? routePointHandles : pathPoints.slice(1, -1);
  return { path, labelX: label.x, labelY: label.y, handles, points: pathPoints };
}

export function buildFlowStepPath(params: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  /** Lados já resolvidos pelo pipeline — preferidos quando informados */
  fromSide?: AnchorSide;
  toSide?: AnchorSide;
  sourcePosition?: RFPosition;
  targetPosition?: RFPosition;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  routePoints?: Point[];
  spread?: number;
}): { path: string; labelX: number; labelY: number; handles: Point[]; points: Point[] } {
  const sides =
    params.fromSide && params.toSide
      ? { fromSide: params.fromSide, toSide: params.toSide }
      : resolveConnectionSides({
          sourceHandle: params.sourceHandle,
          targetHandle: params.targetHandle,
          ...(bothEdgeHandlesDefined(params.sourceHandle, params.targetHandle)
            ? {}
            : {
                sourcePosition: params.sourcePosition,
                targetPosition: params.targetPosition,
              }),
        });

  const { fromSide, toSide } = sides;

  if (params.routePoints && params.routePoints.length > 0) {
    const sx = Math.round(params.sourceX);
    const sy = Math.round(params.sourceY);
    const tx = Math.round(params.targetX);
    const ty = Math.round(params.targetY);
    const straightHorizontal = shouldStraightenHorizontal(sx, sy, tx, ty, fromSide, toSide);
    const straightVertical = shouldStraightenVertical(sx, sy, tx, ty, fromSide, toSide);
    if (!straightHorizontal && !straightVertical) {
      const anchorPoints = buildOrthogonalPathFromRoutePoints(
        { x: params.sourceX, y: params.sourceY },
        params.routePoints,
        { x: params.targetX, y: params.targetY },
      );
      return buildPathResult(anchorPoints);
    }
  }

  const sourceX = Math.round(params.sourceX);
  const sourceY = Math.round(params.sourceY);
  const targetX = Math.round(params.targetX);
  const targetY = Math.round(params.targetY);

  if (
    shouldStraightenHorizontal(
      sourceX,
      sourceY,
      targetX,
      targetY,
      fromSide,
      toSide,
    )
  ) {
    return buildPathResult(
      buildAlignedHorizontalPath(sourceX, sourceY, targetX, targetY),
      [],
      { fromSide, toSide },
    );
  }

  if (
    shouldStraightenVertical(
      sourceX,
      sourceY,
      targetX,
      targetY,
      fromSide,
      toSide,
    )
  ) {
    return buildPathResult(
      buildAlignedVerticalPath(sourceX, sourceY, targetX, targetY),
      [],
      { fromSide, toSide },
    );
  }

  return buildPathResult(
    buildManhattanWaypoints(
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      fromSide,
      toSide,
      undefined,
      params.spread ?? 0,
    ),
    [],
    { fromSide, toSide },
  );
}
