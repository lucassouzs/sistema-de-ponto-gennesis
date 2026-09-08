'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { NodeToolbar, Position, useNodeId, useReactFlow, useStore } from '@xyflow/react';
import { MoreHorizontal, Paintbrush, Trash2, Wrench } from 'lucide-react';
import type { BpmnNodeType } from '@/lib/flowTypes';
import { FLOW_NODE_COLOR_PRESETS, getDefaultLabelForType, getDefaultNodeData } from '@/lib/flowNodeDefaults';
import {
  FLOW_PREVIEW_EDGE_ID,
  FLOW_PREVIEW_NODE_ID,
  applyAppendToNodes,
  buildAppendedFlowNodeFields,
  getAppendPlacement,
  nextFlowNodeId,
  stripPreviewElements,
} from '@/lib/flowAppend';
import { buildForwardFlowEdge } from '@/lib/flowEdge';
import { syncLaneHierarchy } from '@/lib/flowLaneHierarchy';
import { useFlowHistoryCommit, useFlowConnectionDragActive } from '@/contexts/FlowHistoryContext';
import { requestNodeLabelEdit } from './FlowInlineLabel';

type AppendOption = {
  type: BpmnNodeType;
  title: string;
};

const APPEND_OPTIONS: AppendOption[] = [
  { type: 'bpmnEnd', title: 'Adicionar fim' },
  { type: 'bpmnGateway', title: 'Adicionar decisão' },
  { type: 'bpmnTask', title: 'Adicionar tarefa' },
  { type: 'bpmnStart', title: 'Adicionar início' },
  { type: 'bpmnDocument', title: 'Adicionar documento' },
  { type: 'bpmnParallelGateway', title: 'Adicionar paralelo' },
];

const MORE_APPEND_OPTIONS: AppendOption[] = [{ type: 'bpmnData', title: 'Adicionar dados' }];

type Props = {
  selected?: boolean;
};

function ShapeButton({
  title,
  active,
  onClick,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={(e) => {
        e.stopPropagation();
        onMouseEnter?.();
      }}
      onMouseLeave={(e) => {
        e.stopPropagation();
        onMouseLeave?.();
      }}
      className={`flex h-8 w-8 items-center justify-center rounded border transition ${
        active
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-400/40 dark:bg-blue-950/40'
          : 'border-slate-200 bg-white hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function TransformPreview({ type }: { type: BpmnNodeType }) {
  if (type === 'bpmnStart') {
    return <div className="h-4 w-4 rounded-full border-2 border-emerald-500" />;
  }
  if (type === 'bpmnEnd') {
    return (
      <div className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-rose-600 p-0.5">
        <div className="h-full w-full rounded-full border border-rose-600" />
      </div>
    );
  }
  if (type === 'bpmnGateway') {
    return (
      <div className="flex h-3.5 w-3.5 rotate-45 items-center justify-center border-2 border-amber-500 bg-amber-50 text-[8px] font-bold leading-none text-amber-600 dark:bg-amber-950/40">
        <span className="-rotate-45">×</span>
      </div>
    );
  }
  if (type === 'bpmnParallelGateway') {
    return (
      <div className="flex h-3.5 w-3.5 rotate-45 items-center justify-center border-2 border-sky-500 bg-sky-50 text-[8px] font-bold text-sky-600 dark:bg-sky-950/40">
        +
      </div>
    );
  }
  if (type === 'bpmnDocument') {
    return (
      <div
        className="h-4 w-5 border-2 border-violet-500 bg-white dark:bg-slate-800"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 75%, 85% 100%, 0 100%)' }}
      />
    );
  }
  if (type === 'bpmnData') {
    return <div className="h-3.5 w-5 skew-x-[-12deg] border-2 border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40" />;
  }
  return <div className="h-3.5 w-6 rounded-md border-2 border-slate-500 bg-white dark:bg-slate-800" />;
}

export function BpmnNodeContextPad({ selected }: Props) {
  const nodeId = useNodeId();
  const { getNode, getNodes, getEdges, setNodes, setEdges, getInternalNode } = useReactFlow();
  const commitBeforeMutation = useFlowHistoryCommit();
  const connectionDragActive = useFlowConnectionDragActive();
  const [moreOpen, setMoreOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [hoverType, setHoverType] = useState<BpmnNodeType | null>(null);

  const clearPreview = useCallback(() => {
    setNodes((nds) => stripPreviewElements(nds));
    setEdges((eds) => stripPreviewElements(eds));
    setHoverType(null);
  }, [setNodes, setEdges]);

  const showPreview = useCallback(
    (type: BpmnNodeType) => {
      if (!nodeId) return;
      const node = getNode(nodeId);
      if (!node) return;

      const edges = stripPreviewElements(getEdges());
      const position = getAppendPlacement(
        node,
        type,
        getNodes(),
        getInternalNode(nodeId)?.internals.positionAbsolute,
        edges,
      ).position;
      setHoverType(type);

      setNodes((nds) => {
        const base = stripPreviewElements(nds);
        return [
          ...base,
          {
            id: FLOW_PREVIEW_NODE_ID,
            type,
            position,
            data: getDefaultNodeData(type),
            draggable: false,
            selectable: false,
            focusable: false,
            className: 'flow-append-preview-node',
            zIndex: 5,
          },
        ];
      });

      setEdges((eds) => {
        const base = stripPreviewElements(eds);
        return [
          ...base,
          buildForwardFlowEdge({
            id: FLOW_PREVIEW_EDGE_ID,
            source: nodeId,
            target: FLOW_PREVIEW_NODE_ID,
            animated: true,
            className: 'flow-append-preview-edge',
            style: { stroke: '#3b82f6', strokeWidth: 1.5 },
          }),
        ];
      });
    },
    [getNode, getNodes, getEdges, getInternalNode, nodeId, setEdges, setNodes],
  );

  useEffect(() => {
    if (!selected || connectionDragActive) {
      clearPreview();
      setMoreOpen(false);
      setColorPickerOpen(false);
    }
  }, [selected, connectionDragActive, clearPreview]);

  const sourceDragKey = useStore((state) => {
    if (!nodeId || !hoverType) return '';
    const n = state.nodes.find((item) => item.id === nodeId);
    if (!n) return '';
    return `${n.position.x},${n.position.y},${n.dragging ? 1 : 0}`;
  });

  useEffect(() => {
    if (!hoverType || !nodeId || !selected) return;
    showPreview(hoverType);
  }, [sourceDragKey, hoverType, nodeId, selected, showPreview]);

  if (!nodeId) return null;

  const node = getNode(nodeId);
  const showToolbar = Boolean(selected) && !connectionDragActive;

  const appendNode = (type: BpmnNodeType) => {
    if (!node) return;

    commitBeforeMutation();
    const newId = nextFlowNodeId(type);
    const edges = stripPreviewElements(getEdges());
    const { position, sourceAdjustY } = getAppendPlacement(
      node,
      type,
      getNodes(),
      getInternalNode(nodeId)?.internals.positionAbsolute,
      edges,
    );
    const label = getDefaultLabelForType(type);
    const newEdge = buildForwardFlowEdge({
      id: `e-${nodeId}-${newId}`,
      source: nodeId,
      target: newId,
    });
    const nextEdges = [...edges, newEdge];

    setNodes((nds) =>
      syncLaneHierarchy(
        applyAppendToNodes(
          stripPreviewElements(nds).map((n) => ({ ...n, selected: false })),
          nextEdges,
          nodeId,
          {
            id: newId,
            type,
            position,
            data: getDefaultNodeData(type, label),
            selected: true,
            zIndex: 1,
            ...buildAppendedFlowNodeFields(type),
          },
          sourceAdjustY,
        ),
      ),
    );

    setEdges(nextEdges);

    setMoreOpen(false);
    setHoverType(null);
  };

  const renameNode = () => {
    if (!nodeId) return;
    requestNodeLabelEdit(nodeId, setNodes);
  };

  const deleteNode = () => {
    clearPreview();
    commitBeforeMutation();
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
  };

  const currentFill = String((node?.data as { fillColor?: string })?.fillColor ?? '');
  const currentBorder = String((node?.data as { accentColor?: string })?.accentColor ?? '');

  const applyNodeColor = (fill: string, border: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, fillColor: fill, accentColor: border } } : n,
      ),
    );
    setColorPickerOpen(false);
  };

  const clearNodeColor = () => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const nextData = { ...(n.data as Record<string, unknown>) };
        delete nextData.fillColor;
        delete nextData.accentColor;
        return { ...n, data: nextData };
      }),
    );
    setColorPickerOpen(false);
  };

  return (
    <NodeToolbar isVisible={showToolbar} position={Position.Right} offset={12} align="start">
      <div className="flex flex-col gap-1" onMouseLeave={clearPreview}>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-600 dark:bg-slate-900">
          {APPEND_OPTIONS.map((item) => (
            <ShapeButton
              key={item.type}
              title={item.title}
              active={hoverType === item.type}
              onMouseEnter={() => showPreview(item.type)}
              onMouseLeave={() => {}}
              onClick={() => appendNode(item.type)}
            >
              <TransformPreview type={item.type} />
            </ShapeButton>
          ))}

          <div className="relative">
            <ShapeButton
              title="Mais formas"
              active={moreOpen || MORE_APPEND_OPTIONS.some((o) => o.type === hoverType)}
              onClick={() => setMoreOpen((v) => !v)}
              onMouseEnter={() => {
                if (MORE_APPEND_OPTIONS[0]) showPreview(MORE_APPEND_OPTIONS[0].type);
              }}
            >
              <MoreHorizontal className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </ShapeButton>
            {moreOpen && (
              <div className="absolute left-0 top-9 z-50 min-w-[150px] rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-600 dark:bg-slate-900">
                {MORE_APPEND_OPTIONS.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onMouseEnter={() => showPreview(item.type)}
                    onClick={(e) => {
                      e.stopPropagation();
                      appendNode(item.type);
                    }}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800 ${
                      hoverType === item.type ? 'bg-blue-50 dark:bg-blue-950/40' : ''
                    }`}
                  >
                    <TransformPreview type={item.type} />
                    {item.title}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ShapeButton title="Renomear elemento atual" onClick={renameNode}>
            <Wrench className="h-4 w-4 text-slate-600 dark:text-slate-300" />
          </ShapeButton>

          <ShapeButton title="Excluir elemento atual" onClick={deleteNode}>
            <Trash2 className="h-4 w-4 text-rose-600" />
          </ShapeButton>

          <ShapeButton
            title="Alterar cor do elemento"
            active={colorPickerOpen}
            onClick={() => {
              setColorPickerOpen((v) => !v);
              setMoreOpen(false);
            }}
          >
            <Paintbrush className="h-4 w-4 text-violet-600" />
          </ShapeButton>
        </div>

        {colorPickerOpen && (
          <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-600 dark:bg-slate-900">
            <div className="grid grid-cols-3 gap-2">
              {FLOW_NODE_COLOR_PRESETS.map((preset) => {
                const isActive = currentFill === preset.fill && currentBorder === preset.border;
                return (
                  <button
                    key={`${preset.fill}-${preset.border}`}
                    type="button"
                    title={preset.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      applyNodeColor(preset.fill, preset.border);
                    }}
                    className={`h-10 w-10 rounded-md border-2 transition hover:scale-105 ${
                      isActive ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900' : ''
                    }`}
                    style={{ backgroundColor: preset.fill, borderColor: preset.border }}
                  />
                );
              })}
            </div>
            {(currentFill || currentBorder) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearNodeColor();
                }}
                className="mt-2 w-full rounded px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Restaurar cor padrão
              </button>
            )}
          </div>
        )}
        <p className="rounded bg-white/90 px-2 py-0.5 text-[10px] text-slate-500 shadow dark:bg-slate-900/90">
          Duplo clique no nome para editar • Passe o mouse para ver o próximo passo
        </p>
      </div>
    </NodeToolbar>
  );
}
