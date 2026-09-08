'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useFlowHistoryCommit, useFlowHistoryInteraction } from '@/contexts/FlowHistoryContext';
import type { FlowEdgeData } from '@/lib/flowEdge';
import { FLOW_EDGE_LABEL_MAX_DRIFT } from '@/lib/flowGatewayLabels';

type Props = {
  edgeId: string;
  label: string;
  defaultX: number;
  defaultY: number;
  selected?: boolean;
};

export function FlowEdgeInlineLabel({ edgeId, label, defaultX, defaultY, selected }: Props) {
  const { getEdge, setEdges, screenToFlowPosition } = useReactFlow();
  const commitBeforeMutation = useFlowHistoryCommit();
  const { beginInteraction, endInteraction } = useFlowHistoryInteraction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [dragging, setDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragOriginRef = useRef<{
    pointerFlowX: number;
    pointerFlowY: number;
    labelX: number;
    labelY: number;
  } | null>(null);

  const edge = getEdge(edgeId);
  const edgeData = (edge?.data ?? {}) as FlowEdgeData;
  const wantsEdit = Boolean(edgeData.editLabel);
  const savedPosition = edgeData.labelPosition;
  const savedIsValid =
    savedPosition &&
    Math.hypot(savedPosition.x - defaultX, savedPosition.y - defaultY) <= FLOW_EDGE_LABEL_MAX_DRIFT;

  const position =
    dragPosition ?? (savedIsValid ? savedPosition! : { x: defaultX, y: defaultY });

  useEffect(() => {
    setDraft(label);
  }, [label]);

  useEffect(() => {
    if (!wantsEdit) return;
    setEditing(true);
    setEdges((eds) =>
      eds.map((e) => {
        if (e.id !== edgeId) return e;
        const nextData = { ...(e.data as FlowEdgeData) };
        delete nextData.editLabel;
        return { ...e, data: nextData };
      }),
    );
  }, [wantsEdit, edgeId, setEdges]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commitText = () => {
    const next = draft.trim();
    if (next !== label.trim()) commitBeforeMutation();
    setEdges((eds) =>
      eds.map((e) =>
        e.id === edgeId
          ? {
              ...e,
              label: next || undefined,
              data: { ...(e.data as FlowEdgeData), label: next },
            }
          : e,
      ),
    );
    setDraft(next);
    setEditing(false);
  };

  const cancelText = () => {
    setDraft(label);
    setEditing(false);
  };

  const saveLabelPosition = (next: { x: number; y: number }) => {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === edgeId
          ? {
              ...e,
              data: { ...(e.data as FlowEdgeData), labelPosition: next },
            }
          : e,
      ),
    );
  };

  const onLabelPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (editing) return;
    event.stopPropagation();
    event.preventDefault();
    beginInteraction();
    const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    dragOriginRef.current = {
      pointerFlowX: pointer.x,
      pointerFlowY: pointer.y,
      labelX: position.x,
      labelY: position.y,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onLabelPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging || !dragOriginRef.current) return;
    event.stopPropagation();
    const pointer = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const dx = pointer.x - dragOriginRef.current.pointerFlowX;
    const dy = pointer.y - dragOriginRef.current.pointerFlowY;
    setDragPosition({
      x: dragOriginRef.current.labelX + dx,
      y: dragOriginRef.current.labelY + dy,
    });
  };

  const onLabelPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging) return;
    event.stopPropagation();
    if (dragPosition) saveLabelPosition(dragPosition);
    dragOriginRef.current = null;
    setDragging(false);
    setDragPosition(null);
    endInteraction();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const display = label.trim();
  const showPlaceholder = selected && !display && !editing;

  if (!editing && !display && !showPlaceholder) return null;

  const baseInputClass =
    'nodrag nopan rounded border border-blue-400 bg-[var(--flow-edge-label-bg)] px-1.5 py-0.5 text-xs font-bold text-[var(--flow-label)] outline-none ring-2 ring-blue-400/30 shadow-sm';

  const displayClass =
    'cursor-grab border-0 bg-transparent p-0 text-xs font-semibold text-[var(--flow-label)] shadow-none active:cursor-grabbing';

  return (
    <div
      className={`flow-edge-inline-label nodrag nopan pointer-events-auto absolute ${dragging ? 'z-50' : 'z-10'}`}
      data-flow-edge-id={edgeId}
      style={{ transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px)` }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              commitText();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              cancelText();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={`${baseInputClass} min-w-[48px] max-w-[140px]`}
          placeholder="Ex.: Sim"
        />
      ) : (
        <button
          type="button"
          title="Arraste para mover • Duplo clique para editar"
          onPointerDown={onLabelPointerDown}
          onPointerMove={onLabelPointerMove}
          onPointerUp={onLabelPointerUp}
          onPointerCancel={onLabelPointerUp}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (showPlaceholder) setEditing(true);
          }}
          className={`${displayClass} ${dragging ? 'opacity-80' : ''} ${
            showPlaceholder ? 'italic opacity-60' : ''
          }`}
        >
          {display || '+ texto'}
        </button>
      )}
    </div>
  );
}

export function requestEdgeLabelEdit(
  edgeId: string,
  setEdges: ReturnType<typeof useReactFlow>['setEdges'],
) {
  setEdges((eds) =>
    eds.map((e) =>
      e.id === edgeId ? { ...e, data: { ...(e.data as FlowEdgeData), editLabel: true } } : e,
    ),
  );
}
