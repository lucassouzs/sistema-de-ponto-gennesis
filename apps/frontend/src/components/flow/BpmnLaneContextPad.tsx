'use client';

import React, { useState } from 'react';
import { NodeToolbar, Position, useNodeId, useReactFlow, type Node } from '@xyflow/react';
import { ArrowDown, ArrowUp, Paintbrush, Trash2, Wrench } from 'lucide-react';
import type { BpmnNodeType } from '@/lib/flowTypes';
import { FLOW_NODE_COLOR_PRESETS, getDefaultLabelForType, getDefaultNodeData } from '@/lib/flowNodeDefaults';
import { nextFlowNodeId } from '@/lib/flowAppend';
import { attachNodeToLane, buildNodeMap, deleteLaneWithChildren, getAbsolutePosition, getLaneSize, syncLaneHierarchy } from '@/lib/flowLaneHierarchy';
import { useFlowHistoryCommit } from '@/contexts/FlowHistoryContext';
import { getDefaultNodeSize } from './BpmnNodes';
import { requestNodeLabelEdit } from './FlowInlineLabel';

const LANE_HEADER_WIDTH = 32;

type Props = {
  selected?: boolean;
};

function PadButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
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

function LaneBelowIcon() {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="h-2.5 w-6 border border-slate-500 bg-white dark:bg-slate-700" />
      <div className="h-2.5 w-6 border border-slate-400 bg-slate-100 dark:bg-slate-600" />
    </div>
  );
}

function LaneAboveIcon() {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="h-2.5 w-6 border border-slate-400 bg-slate-100 dark:bg-slate-600" />
      <div className="h-2.5 w-6 border border-slate-500 bg-white dark:bg-slate-700" />
    </div>
  );
}

function LaneTaskIcon() {
  return (
    <div className="relative h-4 w-7 border border-slate-500 bg-white dark:bg-slate-700">
      <div className="absolute left-2 top-1 h-2 w-3 rounded-sm border border-slate-400 bg-slate-50 dark:bg-slate-600" />
    </div>
  );
}

function getInsertPositionInLane(lane: Node, type: BpmnNodeType, allNodes: Node[]) {
  const nodeMap = buildNodeMap(allNodes);
  const laneAbs = getAbsolutePosition(lane, nodeMap);
  const { height } = getLaneSize(lane);
  const size = getDefaultNodeSize(type);
  return {
    x: laneAbs.x + LANE_HEADER_WIDTH + 48,
    y: laneAbs.y + Math.max(12, (height - size.height) / 2),
  };
}

export function BpmnLaneContextPad({ selected }: Props) {
  const nodeId = useNodeId();
  const { getNode, getNodes, setNodes } = useReactFlow();
  const commitBeforeMutation = useFlowHistoryCommit();
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  if (!nodeId) return null;

  const lane = getNode(nodeId);
  if (!lane) return null;

  const { width, height } = getLaneSize(lane);
  const currentFill = String((lane.data as { fillColor?: string })?.fillColor ?? '');
  const currentBorder = String((lane.data as { accentColor?: string })?.accentColor ?? '');

  const addLaneRelative = (direction: 'above' | 'below') => {
    commitBeforeMutation();
    const newId = nextFlowNodeId('bpmnLane');
    const offsetY = direction === 'below' ? height : -height;
    setNodes((nds) =>
      syncLaneHierarchy([
        ...nds.map((n) => ({ ...n, selected: false })),
        {
          id: newId,
          type: 'bpmnLane',
          parentId: lane.parentId,
          position: { x: lane.position.x, y: lane.position.y + offsetY },
          data: { label: getDefaultLabelForType('bpmnLane') },
          style: { width, height },
          zIndex: 0,
          selected: true,
        },
      ]),
    );
  };

  const addElementInLane = (type: BpmnNodeType) => {
    commitBeforeMutation();
    const newId = nextFlowNodeId(type);
    const absolute = getInsertPositionInLane(lane, type, getNodes());
    const child = attachNodeToLane(
      {
        id: newId,
        type,
        position: absolute,
        data: getDefaultNodeData(type),
        selected: true,
      },
      lane,
      absolute,
    );

    setNodes((nds) =>
      syncLaneHierarchy([...nds.map((n) => ({ ...n, selected: false })), child]),
    );
  };

  const renameLane = () => {
    if (!nodeId) return;
    requestNodeLabelEdit(nodeId, setNodes);
  };

  const deleteLane = () => {
    if (!nodeId) return;
    commitBeforeMutation();
    setNodes((nds) => deleteLaneWithChildren(nds, nodeId));
  };

  const applyLaneColor = (fill: string, border: string) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, fillColor: fill, accentColor: border } } : n)),
    );
    setColorPickerOpen(false);
  };

  const clearLaneColor = () => {
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

  const stackAllLanes = () => {
    const lanes = getNodes()
      .filter((n) => n.type === 'bpmnLane')
      .sort((a, b) => a.position.y - b.position.y);
    if (lanes.length < 2) return;

    const baseX = lanes[0].position.x;
    let cursorY = lanes[0].position.y;
    const positions = new Map<string, { x: number; y: number }>();

    for (const lane of lanes) {
      positions.set(lane.id, { x: baseX, y: cursorY });
      cursorY += getLaneSize(lane).height;
    }

    setNodes((nds) =>
      syncLaneHierarchy(
        nds.map((n) => {
          const pos = positions.get(n.id);
          return pos ? { ...n, position: pos } : n;
        }),
      ),
    );
  };

  const alignLanesTop = () => {
    const lanes = getNodes().filter((n) => n.type === 'bpmnLane');
    if (lanes.length < 2) return;
    const minY = Math.min(...lanes.map((l) => l.position.y));
    setNodes((nds) =>
      syncLaneHierarchy(
        nds.map((n) => (n.type === 'bpmnLane' ? { ...n, position: { ...n.position, y: minY } } : n)),
      ),
    );
  };

  return (
    <NodeToolbar isVisible={Boolean(selected)} position={Position.Right} offset={12} align="start">
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-600 dark:bg-slate-900">
          <PadButton title="Adicionar raia abaixo" onClick={() => addLaneRelative('below')}>
            <LaneBelowIcon />
          </PadButton>
          <PadButton title="Adicionar raia acima" onClick={() => addLaneRelative('above')}>
            <LaneAboveIcon />
          </PadButton>
          <PadButton title="Adicionar tarefa na raia" onClick={() => addElementInLane('bpmnTask')}>
            <LaneTaskIcon />
          </PadButton>

          <PadButton title="Adicionar início na raia" onClick={() => addElementInLane('bpmnStart')}>
            <div className="h-3.5 w-3.5 rounded-full border-2 border-emerald-500" />
          </PadButton>
          <PadButton title="Adicionar decisão na raia" onClick={() => addElementInLane('bpmnGateway')}>
            <div className="flex h-3.5 w-3.5 rotate-45 items-center justify-center border-2 border-amber-500 bg-amber-50 text-[8px] font-bold leading-none text-amber-600 dark:bg-amber-950/40">
              <span className="-rotate-45">×</span>
            </div>
          </PadButton>
          <PadButton title="Adicionar fim na raia" onClick={() => addElementInLane('bpmnEnd')}>
            <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-rose-600 p-0.5">
              <div className="h-full w-full rounded-full border border-rose-600" />
            </div>
          </PadButton>

          <PadButton title="Renomear raia" onClick={renameLane}>
            <Wrench className="h-4 w-4 text-slate-600 dark:text-slate-300" />
          </PadButton>
          <PadButton title="Excluir raia" onClick={deleteLane}>
            <Trash2 className="h-4 w-4 text-rose-600" />
          </PadButton>
          <PadButton
            title="Alterar cor da raia"
            active={colorPickerOpen}
            onClick={() => setColorPickerOpen((v) => !v)}
          >
            <Paintbrush className="h-4 w-4 text-violet-600" />
          </PadButton>
        </div>

        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-600 dark:bg-slate-900">
          <PadButton title="Alinhar raias em sequência" onClick={stackAllLanes}>
            <ArrowDown className="h-4 w-4 text-slate-600 dark:text-slate-300" />
          </PadButton>
          <PadButton title="Alinhar raias pelo topo" onClick={alignLanesTop}>
            <ArrowUp className="h-4 w-4 text-slate-600 dark:text-slate-300" />
          </PadButton>
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
                      applyLaneColor(preset.fill, preset.border);
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
                  clearLaneColor();
                }}
                className="mt-2 w-full rounded px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Restaurar cor padrão
              </button>
            )}
          </div>
        )}

        <p className="rounded bg-white/90 px-2 py-0.5 text-[10px] text-slate-500 shadow dark:bg-slate-900/90">
          Duplo clique no nome para editar • Raia: faixa esquerda • Pool: faixa externa esquerda
        </p>
      </div>
    </NodeToolbar>
  );
}
