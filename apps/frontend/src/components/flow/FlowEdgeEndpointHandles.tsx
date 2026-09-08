'use client';

import React, { useRef, useState } from 'react';
import { Position, reconnectEdge, useReactFlow } from '@xyflow/react';
import { useFlowHistoryInteraction } from '@/contexts/FlowHistoryContext';
import { normalizeFlowEdge, type FlowEdgeData } from '@/lib/flowEdge';
import { LANE_NODE_TYPE } from '@/lib/flowLaneHierarchy';
import type { Point } from '@/lib/flowEdgeRouting';

type Props = {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePoint: Point;
  targetPoint: Point;
  sourcePosition: Position;
  targetPosition: Position;
};

type Side = 'left' | 'right' | 'top' | 'bottom';
type EndKind = 'source' | 'target';

type NodeHit = { id: string; x: number; y: number; w: number; h: number };

const SNAP_DISTANCE = 56;
const HANDLE_OFFSET = 10;

function offsetFromSide(point: Point, position: Position, distance: number): Point {
  switch (position) {
    case Position.Left:
      return { x: point.x - distance, y: point.y };
    case Position.Right:
      return { x: point.x + distance, y: point.y };
    case Position.Top:
      return { x: point.x, y: point.y - distance };
    case Position.Bottom:
      return { x: point.x, y: point.y + distance };
    default:
      return point;
  }
}

function distanceToRect(point: Point, hit: NodeHit): number {
  const dx = Math.max(hit.x - point.x, 0, point.x - (hit.x + hit.w));
  const dy = Math.max(hit.y - point.y, 0, point.y - (hit.y + hit.h));
  return Math.hypot(dx, dy);
}

/**
 * Bolinhas verdes nas pontas da seta — arraste para reconectar a outro lado
 * ou elemento (como no bpmn.io). Ficam levemente fora da forma para serem
 * fáceis de pegar sem conflitar com os handles dos nós.
 */
export function FlowEdgeEndpointHandles({
  edgeId,
  sourceNodeId,
  targetNodeId,
  sourcePoint,
  targetPoint,
  sourcePosition,
  targetPosition,
}: Props) {
  const rf = useReactFlow();
  const { beginInteraction, endInteraction } = useFlowHistoryInteraction();
  const [dragEnd, setDragEnd] = useState<EndKind | null>(null);
  const [dragPos, setDragPos] = useState<Point | null>(null);
  const activeRef = useRef<EndKind | null>(null);

  const nodeGeometry = (id: string): NodeHit | null => {
    const node = rf.getNode(id);
    if (!node) return null;
    const internal = rf.getInternalNode(id);
    const abs = internal?.internals?.positionAbsolute ?? node.position;
    const w = internal?.measured?.width ?? node.measured?.width ?? (node.width as number) ?? 0;
    const h = internal?.measured?.height ?? node.measured?.height ?? (node.height as number) ?? 0;
    if (!w || !h) return null;
    return { id, x: abs.x, y: abs.y, w, h };
  };

  const findNearestNode = (point: Point): NodeHit | null => {
    const candidates = rf
      .getNodes()
      .filter((node) => node.type !== LANE_NODE_TYPE)
      .map((node) => nodeGeometry(node.id))
      .filter((hit): hit is NodeHit => Boolean(hit));

    const inside = candidates.filter(
      (hit) =>
        point.x >= hit.x &&
        point.x <= hit.x + hit.w &&
        point.y >= hit.y &&
        point.y <= hit.y + hit.h,
    );
    if (inside.length > 0) {
      inside.sort((a, b) => a.w * a.h - b.w * b.h);
      return inside[0]!;
    }

    let best: NodeHit | null = null;
    let bestDist = SNAP_DISTANCE;
    for (const hit of candidates) {
      const dist = distanceToRect(point, hit);
      if (dist < bestDist) {
        best = hit;
        bestDist = dist;
      }
    }
    return best;
  };

  const nearestSide = (hit: NodeHit, point: Point): Side => {
    const relX = (point.x - hit.x) / hit.w;
    const relY = (point.y - hit.y) / hit.h;
    const distances: Array<{ side: Side; dist: number }> = [
      { side: 'left', dist: relX },
      { side: 'right', dist: 1 - relX },
      { side: 'top', dist: relY },
      { side: 'bottom', dist: 1 - relY },
    ];
    distances.sort((a, b) => a.dist - b.dist);
    return distances[0]!.side;
  };

  const reconnect = (end: EndKind, nodeId: string, side: Side) => {
    const edge = rf.getEdge(edgeId);
    if (!edge) return;

    const connection =
      end === 'source'
        ? {
            source: nodeId,
            target: edge.target,
            sourceHandle: side,
            targetHandle: edge.targetHandle ?? null,
          }
        : {
            source: edge.source,
            target: nodeId,
            sourceHandle: edge.sourceHandle ?? null,
            targetHandle: side,
          };

    rf.setEdges((edges) => {
      const reconnected = reconnectEdge(edge, connection, edges).map((item) => {
        if (item.id !== edgeId) return item;
        const data = { ...(item.data as FlowEdgeData) };
        delete data.routePoints;
        return normalizeFlowEdge({ ...item, selected: true, data });
      });
      return reconnected;
    });
    rf.setNodes((nodes) => nodes.map((node) => (node.selected ? { ...node, selected: false } : node)));
  };

  const beginDrag = (end: EndKind) => (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    beginInteraction();
    activeRef.current = end;
    setDragEnd(end);
    setDragPos(rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!activeRef.current) return;
    event.stopPropagation();
    setDragPos(rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const end = activeRef.current;
    activeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (end) {
      const pointer = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const fallbackNodeId = end === 'source' ? sourceNodeId : targetNodeId;
      const hit = findNearestNode(pointer) ?? nodeGeometry(fallbackNodeId);
      if (hit) reconnect(end, hit.id, nearestSide(hit, pointer));
    }

    endInteraction();

    setDragEnd(null);
    setDragPos(null);
  };

  const renderHandle = (end: EndKind, base: Point, position: Position) => {
    const anchor = offsetFromSide(base, position, HANDLE_OFFSET);
    const pos = dragEnd === end && dragPos ? dragPos : anchor;
    const active = dragEnd === end;

    return (
      <div
        key={`${edgeId}-endpoint-${end}`}
        className="nodrag nopan pointer-events-auto absolute z-[60]"
        style={{ transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)` }}
      >
        <div
          title="Arraste para reconectar (outro lado ou outro elemento)"
          aria-label={end === 'source' ? 'Ponta de origem da seta' : 'Ponta de destino da seta'}
          onPointerDown={beginDrag(end)}
          onPointerMove={handleMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`flex h-5 w-5 items-center justify-center rounded-full border-2 border-emerald-500 bg-white shadow-lg hover:scale-110 dark:bg-slate-900 ${
            active ? 'cursor-grabbing ring-2 ring-emerald-400/70' : 'cursor-grab'
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
        </div>
      </div>
    );
  };

  return (
    <>
      {renderHandle('source', sourcePoint, sourcePosition)}
      {renderHandle('target', targetPoint, targetPosition)}
    </>
  );
}
