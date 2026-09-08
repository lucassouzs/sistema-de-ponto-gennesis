'use client';

import React, { useState } from 'react';
import { FLOW_SHAPE_CATALOG, type BpmnNodeType } from '@/lib/flowTypes';
import { FLOW_DND_TYPE } from './BpmnNodes';
/** Largura da paleta fechada (só ícones) — usada também para posicionar o zoom */
export const FLOW_PALETTE_COLLAPSED_WIDTH = 72;
export const FLOW_PALETTE_EXPANDED_WIDTH = 240;

export function getFlowPaletteLeftOffset(paletteOpen: boolean): number {
  return (paletteOpen ? FLOW_PALETTE_EXPANDED_WIDTH : FLOW_PALETTE_COLLAPSED_WIDTH) + 12;
}

type Props = {
  onShapeDoubleClick: (type: BpmnNodeType, label: string) => void;
  onOpenChange?: (open: boolean) => void;
};

export function FlowShapePalette({ onShapeDoubleClick, onOpenChange }: Props) {
  const [open, setOpen] = useState(false);

  const setPaletteOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <aside
      className={`absolute left-0 top-0 z-30 flex h-full flex-col overflow-hidden border-r border-gray-200 bg-white shadow-md transition-[width] duration-200 ease-out dark:border-gray-700 dark:bg-gray-900 ${
        open ? 'w-60' : 'w-[72px]'
      }`}
      onMouseEnter={() => setPaletteOpen(true)}
      onMouseLeave={() => setPaletteOpen(false)}
    >
      {open && (
        <div className="shrink-0 border-b border-gray-200 px-2 py-2.5 dark:border-gray-700">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Formas BPMN
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-1.5">
        {FLOW_SHAPE_CATALOG.map((shape) => (
          <div
            key={shape.type}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                FLOW_DND_TYPE,
                JSON.stringify({ type: shape.type, label: shape.label }),
              );
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              onShapeDoubleClick(shape.type, shape.label);
            }}
            className={`mb-1 flex cursor-grab select-none items-center rounded-lg hover:bg-gray-100 active:cursor-grabbing active:bg-gray-200 dark:hover:bg-gray-800 dark:active:bg-gray-700 ${
              open ? 'gap-2.5 px-2.5 py-2' : 'justify-center px-1.5 py-3'
            }`}
            title={shape.label}
          >
            <span className="flex shrink-0 items-center justify-center">
              <ShapePreview type={shape.type} />
            </span>
            <div
              className={`min-w-0 overflow-hidden transition-all duration-200 ${
                open ? 'max-w-[160px] opacity-100' : 'max-w-0 opacity-0'
              }`}
            >
              <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{shape.label}</p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function ShapePreview({ type }: { type: BpmnNodeType }) {
  if (type === 'bpmnStart') {
    return <div className="h-7 w-7 rounded-full border-[2.5px] border-emerald-500 bg-emerald-50" />;
  }
  if (type === 'bpmnEnd') {
    return (
      <div className="h-7 w-7 rounded-full border-[2.5px] border-rose-600 bg-rose-50 p-0.5">
        <div className="h-full w-full rounded-full border-2 border-rose-600" />
      </div>
    );
  }
  if (type === 'bpmnGateway') {
    return (
      <div className="flex h-6 w-6 rotate-45 items-center justify-center border-[2.5px] border-amber-400 bg-amber-50 text-[10px] font-bold leading-none text-amber-600">
        <span className="-rotate-45">×</span>
      </div>
    );
  }
  if (type === 'bpmnParallelGateway') {
    return (
      <div className="flex h-6 w-6 rotate-45 items-center justify-center border-[2.5px] border-violet-400 bg-violet-50 text-[10px] font-bold text-violet-600">
        +
      </div>
    );
  }
  if (type === 'bpmnDocument') {
    return (
      <div
        className="h-6 w-8 border-[2.5px] border-gray-400 bg-white dark:bg-gray-800"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 75%, 85% 100%, 0 100%)' }}
      />
    );
  }
  if (type === 'bpmnData') {
    return <div className="h-5 w-8 skew-x-[-12deg] border-[2.5px] border-indigo-400 bg-indigo-50" />;
  }
  if (type === 'bpmnLane') {
    return (
      <div className="flex h-5 w-10 overflow-hidden border border-slate-500 bg-white dark:bg-slate-800">
        <div className="h-full w-2 border-r border-slate-500 bg-slate-200 dark:bg-slate-700" />
      </div>
    );
  }
  if (type === 'bpmnText') {
    return (
      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">T</span>
    );
  }
  return <div className="h-6 w-10 rounded-md border-[2.5px] border-blue-400 bg-blue-50 dark:bg-blue-950/40" />;
}
