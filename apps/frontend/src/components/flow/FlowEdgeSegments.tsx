'use client';

import React, { useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useFlowHistoryInteraction } from '@/contexts/FlowHistoryContext';
import type { FlowEdgeData } from '@/lib/flowEdge';
import type { Point } from '@/lib/flowEdgeRouting';

type Props = {
  edgeId: string;
  selected: boolean;
  /** Lista completa de pontos do traçado (inclui origem e destino). */
  points: Point[];
  routePoints?: Point[];
};

type DragState = {
  pointerX: number;
  pointerY: number;
  segIndex: number;
  started: boolean;
  committed: boolean;
  mode?: 'translate' | 'move';
  leftInter?: number;
  rightInter?: number;
  origLeft?: Point;
  origRight?: Point;
  moveIndex?: number;
  origPoint?: Point;
};

/** Espessura (em unidades de fluxo) da faixa clicável sobre cada trecho da seta. */
const SEGMENT_HIT_UNSELECTED = 22;
const SEGMENT_HIT_SELECTED = 24;
/** Movimento mínimo (em unidades de fluxo) para virar "arraste" em vez de clique. */
const DRAG_THRESHOLD = 4;

/**
 * Faixas invisíveis sobre a seta (camada HTML acima dos nós, via EdgeLabelRenderer)
 * para clicar/selecionar e arrastar qualquer trecho e reformatar o caminho — como
 * no bpmn.io. Ficam sempre presentes para que raias/pools grandes não impeçam a
 * seleção da seta.
 */
export function FlowEdgeSegments({ edgeId, selected, points, routePoints }: Props) {
  const { setEdges, setNodes, screenToFlowPosition } = useReactFlow();
  const { beginInteraction, endInteraction } = useFlowHistoryInteraction();
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

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

  const selectThisEdge = () => {
    setEdges((edges) =>
      edges.map((edge) => ({ ...edge, selected: edge.id === edgeId })),
    );
    setNodes((nodes) => nodes.map((node) => (node.selected ? { ...node, selected: false } : node)));
    document.querySelector<HTMLElement>('.flow-editor-canvas')?.focus();
  };

  const beginDrag = (segIndex: number) => (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();

    if (!selected) selectThisEdge();

    const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    dragRef.current = {
      pointerX: pointer.x,
      pointerY: pointer.y,
      segIndex,
      started: false,
      committed: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const initDrag = (drag: DragState) => {
    const lastIdx = points.length - 1;
    const leftIdx = drag.segIndex;
    const rightIdx = drag.segIndex + 1;
    const leftInter = leftIdx >= 1 && leftIdx <= lastIdx - 1 ? leftIdx - 1 : undefined;
    const rightInter = rightIdx >= 1 && rightIdx <= lastIdx - 1 ? rightIdx - 1 : undefined;

    beginInteraction();
    drag.committed = true;

    if (leftInter !== undefined && rightInter !== undefined) {
      // Trecho entre duas dobras: move o segmento inteiro.
      drag.mode = 'translate';
      drag.leftInter = leftInter;
      drag.rightInter = rightInter;
      drag.origLeft = { ...intermediates[leftInter]! };
      drag.origRight = { ...intermediates[rightInter]! };
    } else {
      // Trecho preso a uma ponta fixa: cria uma dobra no ponto agarrado.
      const base = [...intermediates];
      base.splice(drag.segIndex, 0, { x: drag.pointerX, y: drag.pointerY });
      saveRoutePoints(base);
      drag.mode = 'move';
      drag.moveIndex = drag.segIndex;
      drag.origPoint = { x: drag.pointerX, y: drag.pointerY };
    }
    drag.started = true;
    setDragging(true);
  };

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.stopPropagation();

    const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const dx = pointer.x - drag.pointerX;
    const dy = pointer.y - drag.pointerY;

    if (!drag.started) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      initDrag(drag);
    }

    const base = [...intermediates];
    if (drag.mode === 'translate') {
      base[drag.leftInter!] = { x: drag.origLeft!.x + dx, y: drag.origLeft!.y + dy };
      base[drag.rightInter!] = { x: drag.origRight!.x + dx, y: drag.origRight!.y + dy };
    } else {
      base[drag.moveIndex!] = { x: drag.origPoint!.x + dx, y: drag.origPoint!.y + dy };
    }
    saveRoutePoints(base);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const wasDragging = dragRef.current?.started ?? false;
    dragRef.current = null;
    setDragging(false);
    if (wasDragging) endInteraction();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const segments = [points[0]!, ...intermediates, points[points.length - 1]!];
  const thickness = selected ? SEGMENT_HIT_SELECTED : SEGMENT_HIT_UNSELECTED;
  const segmentCount = segments.length - 1;

  return (
    <>
      {segments.slice(0, -1).map((start, index) => {
        // Primeiro e último trecho: pontas ficam com FlowEdgeEndpointHandles.
        if (selected && (index === 0 || index === segmentCount - 1)) return null;

        const end = segments[index + 1]!;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (length < 1) return null;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const isEndpoint = index === 0 || index === segmentCount - 1;

        return (
          <div
            key={`${edgeId}-seg-${index}`}
            className="flow-edge-segment nodrag nopan pointer-events-auto absolute z-[5]"
            style={{
              left: 0,
              top: 0,
              width: length,
              height: thickness,
              transformOrigin: '0 0',
              transform: `translate(${start.x}px, ${start.y}px) rotate(${angle}deg) translateY(${-thickness / 2}px)`,
              cursor: dragging ? 'grabbing' : selected && !isEndpoint ? 'move' : 'pointer',
              background: 'transparent',
            }}
            onPointerDown={(event) => {
              if (isEndpoint) {
                event.stopPropagation();
                event.preventDefault();
                if (!selected) selectThisEdge();
                return;
              }
              beginDrag(index)(event);
            }}
            onPointerMove={isEndpoint ? undefined : handleMove}
            onPointerUp={isEndpoint ? undefined : endDrag}
            onPointerCancel={isEndpoint ? undefined : endDrag}
          />
        );
      })}
    </>
  );
}
