'use client';

import React from 'react';
import { useReactFlow } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { useFlowHistoryCommit } from '@/contexts/FlowHistoryContext';

type Props = {
  edgeId: string;
  x: number;
  y: number;
};

/** Botão flutuante para excluir a seta selecionada (camada HTML, acima dos nós). */
export function FlowEdgeToolbar({ edgeId, x, y }: Props) {
  const { setEdges } = useReactFlow();
  const commitBeforeMutation = useFlowHistoryCommit();

  const removeEdge = (event: React.MouseEvent | React.PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();
    commitBeforeMutation();
    setEdges((edges) => edges.filter((edge) => edge.id !== edgeId));
  };

  return (
    <div
      className="nodrag nopan pointer-events-auto absolute z-50"
      style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
    >
      <button
        type="button"
        title="Excluir seta"
        aria-label="Excluir seta"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={removeEdge}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-red-300 bg-white text-red-600 shadow-md hover:bg-red-50 hover:text-red-700 dark:border-red-500/60 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-slate-800"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
