'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useNodeId, useReactFlow } from '@xyflow/react';
import { useFlowHistoryCommit, useFlowHistoryInteraction } from '@/contexts/FlowHistoryContext';
import { getDefaultLabelForType } from '@/lib/flowNodeDefaults';

type NodeDataWithLabelOffset = {
  label?: string;
  labelOffset?: { x: number; y: number };
  editLabel?: boolean;
};

type Props = {
  label: string;
  nodeType?: string;
  className?: string;
};

/** Rótulo externo de gateway/evento — arrastável (labelOffset) e editável. */
export function FlowExternalNodeLabel({ label, nodeType, className = '' }: Props) {
  const nodeId = useNodeId();
  const { getNode, getZoom, setNodes } = useReactFlow();
  const commitBeforeMutation = useFlowHistoryCommit();
  const { beginInteraction, endInteraction } = useFlowHistoryInteraction();

  const fallback = getDefaultLabelForType(nodeType ?? 'bpmnGateway');
  const node = nodeId ? getNode(nodeId) : undefined;
  const nodeData = (node?.data ?? {}) as NodeDataWithLabelOffset;
  const savedOffset = nodeData.labelOffset ?? { x: 0, y: 0 };
  const wantsEdit = Boolean(nodeData.editLabel);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dragOriginRef = useRef<{
    clientX: number;
    clientY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const offset = dragOffset ?? savedOffset;
  const display = String(label ?? '').trim() || fallback;

  useEffect(() => {
    setDraft(label);
  }, [label]);

  useEffect(() => {
    if (!wantsEdit) return;
    setEditing(true);
    if (!nodeId) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const nextData = { ...(n.data as NodeDataWithLabelOffset) };
        delete nextData.editLabel;
        return { ...n, data: nextData };
      }),
    );
  }, [wantsEdit, nodeId, setNodes]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const saveOffset = (next: { x: number; y: number }) => {
    if (!nodeId) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...(n.data as NodeDataWithLabelOffset), labelOffset: next } }
          : n,
      ),
    );
  };

  const commitText = () => {
    if (!nodeId) return;
    const next = draft.trim() || fallback;
    if (next !== display) commitBeforeMutation();
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label: next } } : n)),
    );
    setDraft(next);
    setEditing(false);
  };

  const cancelText = () => {
    setDraft(label);
    setEditing(false);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (editing) return;
    event.stopPropagation();
    event.preventDefault();
    beginInteraction();
    dragOriginRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragging || !dragOriginRef.current) return;
    event.stopPropagation();
    const zoom = getZoom() || 1;
    const dx = (event.clientX - dragOriginRef.current.clientX) / zoom;
    const dy = (event.clientY - dragOriginRef.current.clientY) / zoom;
    setDragOffset({
      x: dragOriginRef.current.offsetX + dx,
      y: dragOriginRef.current.offsetY + dy,
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragging) return;
    event.stopPropagation();
    const next = dragOffset ?? savedOffset;
    if (next.x !== savedOffset.x || next.y !== savedOffset.y) {
      saveOffset(next);
    }
    dragOriginRef.current = null;
    setDragging(false);
    setDragOffset(null);
    endInteraction();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const baseInputClass =
    'nodrag nopan rounded border border-blue-400 bg-[var(--flow-edge-label-bg)] px-1.5 py-0.5 text-xs font-medium text-[var(--flow-label)] outline-none ring-2 ring-blue-400/30 shadow-sm';

  return (
    <div
      className="nodrag nopan pointer-events-auto"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      {editing ? (
        <textarea
          ref={inputRef}
          value={draft}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitText();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              cancelText();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={`${baseInputClass} min-w-[120px] max-w-[240px] resize-y`}
        />
      ) : (
        <span
          role="button"
          tabIndex={0}
          title="Arraste para mover • Duplo clique para editar"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              setEditing(true);
            }
          }}
          className={`block select-none text-center text-[12px] font-medium leading-snug ${
            dragging ? 'cursor-grabbing' : 'cursor-grab'
          } ${className}`}
        >
          {display}
        </span>
      )}
    </div>
  );
}
