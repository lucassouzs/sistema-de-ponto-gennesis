'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useNodeId, useReactFlow } from '@xyflow/react';
import { getDefaultLabelForType } from '@/lib/flowNodeDefaults';

type Props = {
  label: string;
  fallback?: string;
  className?: string;
  inputClassName?: string;
  vertical?: boolean;
};

export function FlowInlineLabel({
  label,
  fallback = 'Sem título',
  className = '',
  inputClassName = '',
  vertical = false,
}: Props) {
  const nodeId = useNodeId();
  const { getNode, setNodes } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  const node = nodeId ? getNode(nodeId) : undefined;
  const wantsEdit = Boolean((node?.data as { editLabel?: boolean } | undefined)?.editLabel);

  useEffect(() => {
    setDraft(label);
  }, [label]);

  useEffect(() => {
    if (!wantsEdit || !nodeId) return;
    setEditing(true);
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const nextData = { ...(n.data as Record<string, unknown>) };
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

  const commit = () => {
    if (!nodeId) return;
    const next = draft.trim() || fallback;
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label: next } } : n)),
    );
    setDraft(next);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(label);
    setEditing(false);
  };

  const baseInputClass =
    'nodrag nopan rounded border border-blue-400 bg-white px-1.5 py-0.5 text-xs font-bold text-gray-800 outline-none ring-2 ring-blue-400/30 dark:border-blue-500 dark:bg-slate-800 dark:text-gray-100';

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={`${baseInputClass} ${inputClassName}`}
        style={
          vertical
            ? { writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: 120 }
            : { minWidth: 72, maxWidth: 160 }
        }
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      title="Duplo clique para editar"
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
      className={`cursor-text select-none font-bold ${className}`}
      style={vertical ? { writingMode: 'vertical-rl', transform: 'rotate(180deg)' } : undefined}
    >
      {String(label ?? '').trim() || fallback}
    </span>
  );
}

export function requestNodeLabelEdit(nodeId: string, setNodes: ReturnType<typeof useReactFlow>['setNodes']) {
  setNodes((nds) =>
    nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, editLabel: true } } : n)),
  );
}

export function getNodeLabelFallback(nodeType: string | undefined): string {
  return getDefaultLabelForType(nodeType ?? 'bpmnTask');
}
