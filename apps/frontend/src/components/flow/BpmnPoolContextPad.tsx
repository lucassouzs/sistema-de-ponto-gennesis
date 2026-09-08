'use client';

import React from 'react';
import { NodeToolbar, Position, useNodeId, useReactFlow } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { useFlowHistoryCommit } from '@/contexts/FlowHistoryContext';
import { deletePoolWithContents } from '@/lib/flowPoolHierarchy';

type Props = {
  selected?: boolean;
};

export function BpmnPoolContextPad({ selected }: Props) {
  const nodeId = useNodeId();
  const { setNodes } = useReactFlow();
  const commitBeforeMutation = useFlowHistoryCommit();

  if (!nodeId) return null;

  const deletePool = () => {
    commitBeforeMutation();
    setNodes((nodes) => deletePoolWithContents(nodes, nodeId));
  };

  return (
    <NodeToolbar isVisible={Boolean(selected)} position={Position.Right} offset={12} align="start">
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-600 dark:bg-slate-900">
        <button
          type="button"
          title="Excluir pool e raias"
          onClick={(event) => {
            event.stopPropagation();
            deletePool();
          }}
          className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          <Trash2 className="h-4 w-4 text-rose-600" />
        </button>
      </div>
      <p className="mt-1 rounded bg-white/90 px-2 py-0.5 text-[10px] text-slate-500 shadow dark:bg-slate-900/90">
        Exclui o participante (pool) e todas as raias dentro dele
      </p>
    </NodeToolbar>
  );
}
