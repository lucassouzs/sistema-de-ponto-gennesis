export type AnchorSide = 'left' | 'right' | 'top' | 'bottom';
export type Point = { x: number; y: number };

export const FLOW_EDGE_ROUTE_OFFSET = 18;
export const FLOW_EDGE_SPREAD_GAP = 14;

/** Handle React Flow: h-2.5/w-2.5 (10px). */
export const FLOW_HANDLE_RADIUS = 5;

/** Sem recuo no destino — linha e ponta no centro do handle, igual à saída. */
export const FLOW_HANDLE_END_INSET = 0;

/** Encurta o fim do traçado antes do markerEnd (inset 0 = ponta no centro do handle). */
export function trimPathEndForHandle(points: Point[], inset = FLOW_HANDLE_END_INSET): Point[] {
  if (points.length < 2 || inset <= 0) return points;

  const working = points.map((point) => ({ ...point }));

  // Micro-degrau final (2–8px) impede recuo — funde com o trecho anterior.
  while (working.length >= 3) {
    const a = working[working.length - 2]!;
    const b = working[working.length - 1]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) >= inset + 2) break;
    working.pop();
  }

  const lastIndex = working.length - 1;
  const prev = working[lastIndex - 1]!;
  const end = working[lastIndex]!;
  const dx = end.x - prev.x;
  const dy = end.y - prev.y;
  const length = Math.hypot(dx, dy);
  if (length <= inset) return working;

  working[lastIndex] = {
    x: end.x - (dx / length) * inset,
    y: end.y - (dy / length) * inset,
  };
  return working;
}

function segmentMatchesSide(dx: number, dy: number, side: AnchorSide): boolean {
  if (Math.hypot(dx, dy) < 0.5) return false;
  switch (side) {
    case 'top':
      return dy > 0 && Math.abs(dx) <= Math.abs(dy);
    case 'bottom':
      return dy < 0 && Math.abs(dx) <= Math.abs(dy);
    case 'left':
      return dx > 0 && Math.abs(dy) <= Math.abs(dx);
    case 'right':
      return dx < 0 && Math.abs(dy) <= Math.abs(dx);
    default:
      return false;
  }
}

/** Garante que o último trecho aponta para dentro do handle de destino (seta na direção certa). */
export function fixTargetApproach(points: Point[], toSide: AnchorSide): Point[] {
  if (points.length < 2) return points;

  const end = points.at(-1)!;
  const prev = points.at(-2)!;
  if (segmentMatchesSide(end.x - prev.x, end.y - prev.y, toSide)) return points;

  const approach = moveFromSide(end, toSide, FLOW_EDGE_ROUTE_OFFSET);
  const head = points.slice(0, -2);
  return simplifyCollinear([...head, approach, end]);
}

/** Garante que o primeiro trecho sai na direção correta do handle de origem. */
export function fixSourceDeparture(points: Point[], fromSide: AnchorSide): Point[] {
  if (points.length < 2) return points;

  const start = points[0]!;
  const next = points[1]!;
  const outward =
    fromSide === 'right'
      ? 'right'
      : fromSide === 'left'
        ? 'left'
        : fromSide === 'bottom'
          ? 'bottom'
          : 'top';

  const dx = next.x - start.x;
  const dy = next.y - start.y;
  const matches =
    outward === 'right'
      ? dx > 0 && Math.abs(dy) <= Math.abs(dx)
      : outward === 'left'
        ? dx < 0 && Math.abs(dy) <= Math.abs(dx)
        : outward === 'bottom'
          ? dy > 0 && Math.abs(dx) <= Math.abs(dy)
          : dy < 0 && Math.abs(dx) <= Math.abs(dy);

  if (matches) return points;

  const stub = moveFromSide(start, fromSide, FLOW_EDGE_ROUTE_OFFSET);
  const tail = points.slice(2);
  return simplifyCollinear([start, stub, ...tail]);
}

function moveFromSide(point: Point, side: AnchorSide, distance: number): Point {
  switch (side) {
    case 'left':
      return { x: point.x - distance, y: point.y };
    case 'right':
      return { x: point.x + distance, y: point.y };
    case 'top':
      return { x: point.x, y: point.y - distance };
    case 'bottom':
      return { x: point.x, y: point.y + distance };
    default:
      return point;
  }
}

function isHorizontalSide(side: AnchorSide): boolean {
  return side === 'left' || side === 'right';
}

function applySpread(point: Point, side: AnchorSide, spread: number): Point {
  if (spread === 0) return point;
  if (isHorizontalSide(side)) {
    return { x: point.x, y: point.y + spread };
  }
  return { x: point.x + spread, y: point.y };
}

export function simplifyCollinear(points: Point[]): Point[] {
  if (points.length <= 2) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = out[out.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    const collinear =
      (prev.x === curr.x && curr.x === next.x) || (prev.y === curr.y && curr.y === next.y);
    if (!collinear) out.push(curr);
  }
  out.push(points[points.length - 1]);
  return out;
}

function pushUniquePathPoint(points: Point[], point: Point): void {
  const last = points[points.length - 1];
  if (!last || last.x !== point.x || last.y !== point.y) {
    points.push({ x: Math.round(point.x), y: Math.round(point.y) });
  }
}

/** Insere um canto ortogonal entre dois pontos que não compartilham eixo. */
function appendOrthogonalSegment(points: Point[], from: Point, to: Point): void {
  const fromR = { x: Math.round(from.x), y: Math.round(from.y) };
  const toR = { x: Math.round(to.x), y: Math.round(to.y) };
  if (fromR.x === toR.x || fromR.y === toR.y) {
    pushUniquePathPoint(points, toR);
    return;
  }

  const viaHorizontalFirst = { x: toR.x, y: fromR.y };
  const viaVerticalFirst = { x: fromR.x, y: toR.y };
  const costHorizontal =
    Math.abs(fromR.x - viaHorizontalFirst.x) + Math.abs(viaHorizontalFirst.y - toR.y);
  const costVertical =
    Math.abs(fromR.y - viaVerticalFirst.y) + Math.abs(viaVerticalFirst.x - toR.x);

  if (costHorizontal <= costVertical) {
    pushUniquePathPoint(points, viaHorizontalFirst);
  } else {
    pushUniquePathPoint(points, viaVerticalFirst);
  }
  pushUniquePathPoint(points, toR);
}

/** Conecta origem → routePoints → destino só com segmentos horizontais/verticais. */
export function buildOrthogonalPathFromRoutePoints(
  start: Point,
  routePoints: Point[],
  end: Point,
): Point[] {
  const points: Point[] = [{ x: Math.round(start.x), y: Math.round(start.y) }];
  let cursor = points[0]!;

  for (const raw of routePoints) {
    const next = { x: Math.round(raw.x), y: Math.round(raw.y) };
    appendOrthogonalSegment(points, cursor, next);
    cursor = points[points.length - 1]!;
  }

  appendOrthogonalSegment(points, cursor, end);
  return simplifyCollinear(points);
}

/** Roteamento Manhattan completo — evita linhas diagonais e sobreposição básica. */
export function buildManhattanWaypoints(
  from: Point,
  to: Point,
  fromSide: AnchorSide,
  toSide: AnchorSide,
  offset = FLOW_EDGE_ROUTE_OFFSET,
  spread = 0,
): Point[] {
  const start = applySpread({ ...from }, fromSide, spread);
  const end = applySpread({ ...to }, toSide, spread);
  let p1 = moveFromSide(start, fromSide, offset);
  let p2 = moveFromSide(end, toSide, offset);

  if (isHorizontalSide(fromSide)) {
    p1 = { ...p1, y: p1.y + spread };
    p2 = { ...p2, y: p2.y + spread };
  } else {
    p1 = { ...p1, x: p1.x + spread };
    p2 = { ...p2, x: p2.x + spread };
  }

  const points: Point[] = [start, p1];
  const fromH = isHorizontalSide(fromSide);
  const toH = isHorizontalSide(toSide);

  if (fromH && toH) {
    if (fromSide === 'right' && toSide === 'left' && p2.x > p1.x + 4) {
      const midX = Math.round((p1.x + p2.x) / 2);
      points.push({ x: midX, y: p1.y }, { x: midX, y: p2.y });
    } else if (fromSide === 'left' && toSide === 'right' && p2.x < p1.x - 4) {
      const midX = Math.round((p1.x + p2.x) / 2);
      points.push({ x: midX, y: p1.y }, { x: midX, y: p2.y });
    } else {
      const bump = offset * 2;
      const midX =
        fromSide === 'right'
          ? Math.max(p1.x, p2.x) + bump
          : Math.min(p1.x, p2.x) - bump;
      points.push({ x: midX, y: p1.y }, { x: midX, y: p2.y });
    }
  } else if (!fromH && !toH) {
    if (fromSide === 'bottom' && toSide === 'top' && p2.y < p1.y - 4) {
      if (Math.abs(p1.x - p2.x) <= 72) {
        const laneX = Math.max(p1.x, p2.x) + offset * 2;
        points.push({ x: laneX, y: p1.y }, { x: laneX, y: p2.y }, { x: p2.x, y: p2.y });
      } else {
        points.push({ x: p1.x, y: p2.y }, { x: p2.x, y: p2.y });
      }
    } else if (fromSide === 'bottom' && toSide === 'top' && p2.y > p1.y + 4) {
      points.push({ x: p1.x, y: p2.y }, { x: p2.x, y: p2.y });
    } else if (fromSide === 'top' && toSide === 'bottom' && p2.y < p1.y - 4) {
      points.push({ x: p1.x, y: p2.y }, { x: p2.x, y: p2.y });
    } else if (fromSide === 'top' && toSide === 'bottom' && p2.y > p1.y + 4) {
      points.push({ x: p1.x, y: p2.y }, { x: p2.x, y: p2.y });
    } else {
      const bump = offset * 2;
      const midY =
        fromSide === 'bottom'
          ? Math.max(p1.y, p2.y) + bump
          : Math.min(p1.y, p2.y) - bump;
      points.push({ x: p1.x, y: midY }, { x: p2.x, y: midY });
    }
  } else if (fromH) {
    points.push({ x: p2.x, y: p1.y });
  } else {
    points.push({ x: p1.x, y: p2.y });
  }

  points.push(p2, end);
  const simplified = simplifyCollinear(points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })));
  if (simplified.length >= 2) {
    simplified[0] = { x: Math.round(from.x), y: Math.round(from.y) };
    simplified[simplified.length - 1] = { x: Math.round(to.x), y: Math.round(to.y) };
  }
  return simplified;
}

export function computeEdgeSpreadOffsets(
  edges: Array<{ id: string; source: string; target: string; sourceHandle?: string | null }>,
  resolveSide: (edgeId: string, end: 'source' | 'target') => AnchorSide | null,
): Map<string, number> {
  const offsets = new Map<string, number>();

  const spreadGroup = (key: string, edgeIds: string[]) => {
    if (edgeIds.length <= 1) return;
    edgeIds.forEach((id, index) => {
      const existing = offsets.get(id) ?? 0;
      const spread = (index - (edgeIds.length - 1) / 2) * FLOW_EDGE_SPREAD_GAP;
      offsets.set(id, existing + spread);
    });
  };

  const bySource = new Map<string, string[]>();
  const byTarget = new Map<string, string[]>();

  for (const edge of edges) {
    const fromSide = resolveSide(edge.id, 'source');
    const toSide = resolveSide(edge.id, 'target');
    if (fromSide) {
      const key = `${edge.source}:${fromSide}`;
      bySource.set(key, [...(bySource.get(key) ?? []), edge.id]);
    }
    if (toSide) {
      const key = `${edge.target}:${toSide}`;
      byTarget.set(key, [...(byTarget.get(key) ?? []), edge.id]);
    }
  }

  bySource.forEach((ids, key) => spreadGroup(key, ids));
  byTarget.forEach((ids, key) => spreadGroup(key, ids));

  return offsets;
}

export function inferSideFromPoint(
  rect: { x: number; y: number; width: number; height: number },
  point: Point,
): AnchorSide {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = point.x - cx;
  const dy = point.y - cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

export function anchorSideFromHandleId(handleId?: string | null): AnchorSide | null {
  if (!handleId) return null;
  const id = handleId.trim().toLowerCase();
  if (id === 'left' || id === 'right' || id === 'top' || id === 'bottom') {
    return id;
  }
  const prefixed = id.match(/^(?:source|target)[-_](top|right|bottom|left)$/);
  if (prefixed) {
    return prefixed[1] as AnchorSide;
  }
  return null;
}

/** Normaliza id do handle RF (ex.: target-left) → lado salvo na edge (left). */
export function normalizeEdgeHandleToSide(handleId?: string | null): string | null {
  return anchorSideFromHandleId(handleId);
}

/** Id do handle no React Flow a partir do lado salvo. */
export function rfHandleId(end: 'source' | 'target', side: AnchorSide): string {
  return `${end}-${side}`;
}

/** Converte id legado (ex.: left) → id RF (target-left). */
export function ensureRfHandleId(
  handleId: string | null | undefined,
  end: 'source' | 'target',
): string | null {
  if (!handleId?.trim()) return null;
  const trimmed = handleId.trim();
  const side = anchorSideFromHandleId(trimmed);
  if (!side) return trimmed;
  if (trimmed.includes('-')) return trimmed;
  return rfHandleId(end, side);
}

/** Lado oposto com prefixo source/target para a edge. */
export function inferOppositeRfHandle(handle: string, forEnd: 'source' | 'target'): string {
  const side = anchorSideFromHandleId(handle) ?? 'right';
  return rfHandleId(forEnd, inferOppositeHandle(side));
}

export function anchorSideFromFlowPosition(position?: string | null): AnchorSide | null {
  if (position === 'left' || position === 'right' || position === 'top' || position === 'bottom') {
    return position;
  }
  return null;
}

/** Ambos os handles BPMN válidos (top/right/bottom/left) estão definidos na edge. */
export function bothEdgeHandlesDefined(
  sourceHandle?: string | null,
  targetHandle?: string | null,
): boolean {
  return Boolean(
    anchorSideFromHandleId(sourceHandle?.trim() || null) &&
      anchorSideFromHandleId(targetHandle?.trim() || null),
  );
}

/**
 * Única fonte de verdade para fromSide/toSide.
 *
 * Regra absoluta:
 * - Ambos handles definidos → mapeamento direto (handle === side), ignora posição RF.
 * - Só um definido → o outro é o oposto (nunca geometria).
 * - Nenhum definido → sourcePosition/targetPosition do RF ou defaults.
 */
export function resolveConnectionSides(params: {
  sourceHandle?: string | null;
  targetHandle?: string | null;
  sourcePosition?: string | null;
  targetPosition?: string | null;
}): { fromSide: AnchorSide; toSide: AnchorSide } {
  const fromHandle = anchorSideFromHandleId(params.sourceHandle?.trim() || null);
  const toHandle = anchorSideFromHandleId(params.targetHandle?.trim() || null);

  if (fromHandle && toHandle) {
    return { fromSide: fromHandle, toSide: toHandle };
  }

  if (fromHandle) {
    return { fromSide: fromHandle, toSide: inferOppositeHandle(fromHandle) };
  }

  if (toHandle) {
    return { fromSide: inferOppositeHandle(toHandle), toSide: toHandle };
  }

  return {
    fromSide: anchorSideFromFlowPosition(params.sourcePosition) ?? 'right',
    toSide: anchorSideFromFlowPosition(params.targetPosition) ?? 'left',
  };
}

/** Converte lado BPMN em handles do React Flow (left=target, right/bottom=source). */
export function handlesFromAnchorSides(
  fromSide: AnchorSide,
  toSide: AnchorSide,
): { sourceHandle?: string; targetHandle?: string } {
  const sourceHandle =
    fromSide === 'bottom'
      ? 'bottom'
      : fromSide === 'top'
        ? 'top'
        : fromSide === 'left'
          ? 'left'
          : fromSide === 'right'
            ? 'right'
            : undefined;
  const targetHandle =
    toSide === 'top'
      ? 'top'
      : toSide === 'bottom'
        ? 'bottom'
        : toSide === 'left'
          ? 'left'
          : toSide === 'right'
            ? 'right'
            : undefined;
  return { sourceHandle, targetHandle };
}

/** Handle oposto — preenche só o lado que falta sem inferência vertical/horizontal forçada. */
export function inferOppositeHandle(handle: string): AnchorSide {
  switch (handle.trim()) {
    case 'left':
      return 'right';
    case 'right':
      return 'left';
    case 'top':
      return 'bottom';
    case 'bottom':
      return 'top';
    default:
      return 'left';
  }
}

export function inferEdgeHandlesFromGeometry(
  source: { x: number; y: number; width: number; height: number },
  target: { x: number; y: number; width: number; height: number },
  waypoints?: Point[],
): { sourceHandle?: string; targetHandle?: string } {
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  let fromSide: AnchorSide;
  let toSide: AnchorSide;

  if (waypoints && waypoints.length >= 2) {
    fromSide = inferSideFromPoint(source, waypoints[0]);
    toSide = inferSideFromPoint(target, waypoints[waypoints.length - 1]);
  } else {
    const srcBottom = source.y + source.height;
    const tgtTop = target.y;
    const tgtBottom = target.y + target.height;
    const srcTop = source.y;

    if (tgtTop >= srcBottom - 4) {
      fromSide = 'bottom';
      toSide = 'top';
    } else if (tgtBottom <= srcTop + 4) {
      fromSide = 'top';
      toSide = 'bottom';
    } else if (Math.abs(dx) >= Math.abs(dy)) {
      fromSide = dx >= 0 ? 'right' : 'left';
      toSide = dx >= 0 ? 'left' : 'right';
    } else {
      fromSide = dy >= 0 ? 'bottom' : 'top';
      toSide = dy >= 0 ? 'top' : 'bottom';
    }
  }

  return handlesFromAnchorSides(fromSide, toSide);
}
