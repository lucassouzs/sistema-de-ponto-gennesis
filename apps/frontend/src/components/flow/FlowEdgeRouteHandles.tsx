'use client';

import React, { useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useFlowHistoryCommit, useFlowHistoryInteraction } from '@/contexts/FlowHistoryContext';
import type { FlowEdgeData } from '@/lib/flowEdge';
import type { Point } from '@/lib/flowEdgeRouting';

type Props = {
  edgeId: string;
  /** Lista completa de pontos do traçado (inclui origem e destino). */
  points: Point[];
  routePoints?: Point[];
};

export function FlowEdgeRouteHandles({ edgeId, points, routePoints }: Props) {
  const { setEdges, screenToFlowPosition } = useReactFlow();
  const commitBeforeMutation = useFlowHistoryCommit();
  const { beginInteraction, endInteraction } = useFlowHistoryInteraction();
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const dragOriginRef = useRef<{ pointerX: number; pointerY: number; point: Point } | null>(null);

  if (points.length < 2) return null;

  const intermediates: Point[] = routePoints?.length ? routePoints : points.slice(1, -1);

  const saveRoutePoints = (nextPoints: Point[]) => {
    setEdges((edges) =>
      edges.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              data: {
                ...(edge.data as FlowEdgeData),
                routePoints: nextPoints,
              },
            }
          : edge,
      ),
    );
  };

  const beginDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    index: number,
    startPoint: Point,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    beginInteraction();
    const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    dragOriginRef.current = {
      pointerX: pointer.x,
      pointerY: pointer.y,
      point: { ...startPoint },
    };
    setDraggingIndex(index);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMove = (event: React.PointerEvent<HTMLButtonElement>, index: number) => {
    if (draggingIndex !== index || !dragOriginRef.current) return;
    event.stopPropagation();
    const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const dx = pointer.x - dragOriginRef.current.pointerX;
    const dy = pointer.y - dragOriginRef.current.pointerY;
    const base = [...intermediates];
    base[index] = {
      x: dragOriginRef.current.point.x + dx,
      y: dragOriginRef.current.point.y + dy,
    };
    saveRoutePoints(base);
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const wasDragging = draggingIndex !== null;
    dragOriginRef.current = null;
    setDraggingIndex(null);
    if (wasDragging) endInteraction();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const removePoint = (index: number) => {
    if (!routePoints?.length) return;
    commitBeforeMutation();
    const base = [...intermediates];
    base.splice(index, 1);
    saveRoutePoints(base);
  };

  return (
    <>
      {intermediates.map((point, index) => (
        <div
          key={`${edgeId}-bend-${index}`}
          className="nodrag nopan pointer-events-auto absolute z-50"
          style={{ transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)` }}
        >
          <button
            type="button"
            title="Arraste para mover • duplo-clique para remover"
            aria-label="Mover dobra da seta"
            className={`h-3 w-3 rounded-full border-2 border-blue-500 bg-white shadow-md hover:scale-110 active:cursor-grabbing dark:bg-slate-900 ${
              draggingIndex === index ? 'cursor-grabbing ring-2 ring-blue-400/60' : 'cursor-grab'
            }`}
            onPointerDown={(event) => beginDrag(event, index, point)}
            onPointerMove={(event) => handleMove(event, index)}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              removePoint(index);
            }}
          />
        </div>
      ))}
    </>
  );
}
