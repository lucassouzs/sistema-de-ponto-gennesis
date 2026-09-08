'use client';

import React from 'react';
import { Panel, useReactFlow } from '@xyflow/react';
import { Hand, Minus, Plus } from 'lucide-react';
import { getFlowPaletteLeftOffset } from './FlowShapePalette';

function FitViewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden className="text-gray-600 dark:text-gray-300">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.25" />
      <path stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" d="M8 2.5V5M8 11v2.5M2.5 8H5M11 8h2.5" />
    </svg>
  );
}

function ZoomButton({
  title,
  onClick,
  active = false,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-10 w-10 items-center justify-center transition-colors ${
        active
          ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:hover:bg-blue-950/70'
          : 'bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:active:bg-gray-600'
      }`}
    >
      {children}
    </button>
  );
}

type Props = {
  paletteOpen: boolean;
  handToolActive: boolean;
  onToggleHandTool: () => void;
};

export function FlowZoomControls({
  paletteOpen,
  handToolActive,
  onToggleHandTool,
}: Props) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <Panel
      position="bottom-left"
      className="!m-0 !p-0"
      style={{
        left: getFlowPaletteLeftOffset(paletteOpen),
        bottom: 12,
        transition: 'left 200ms ease-out',
      }}
    >
      <div className="overflow-hidden rounded border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800 dark:shadow-lg">
        <ZoomButton
          title={handToolActive ? 'Ferramenta de mão ativa (H)' : 'Ferramenta de mão — navegar no canvas (H)'}
          onClick={onToggleHandTool}
          active={handToolActive}
        >
          <Hand className="h-[18px] w-[18px] stroke-[1.75]" />
        </ZoomButton>
        <div className="h-px bg-gray-200 dark:bg-gray-700" />
        <ZoomButton title="Ajustar à tela" onClick={() => fitView({ padding: 0.25, duration: 200 })}>
          <FitViewIcon />
        </ZoomButton>
        <div className="h-px bg-gray-200 dark:bg-gray-700" />
        <ZoomButton title="Aumentar zoom" onClick={() => zoomIn({ duration: 150 })}>
          <Plus className="h-[18px] w-[18px] stroke-[1.75]" />
        </ZoomButton>
        <div className="h-px bg-gray-200 dark:bg-gray-700" />
        <ZoomButton title="Diminuir zoom" onClick={() => zoomOut({ duration: 150 })}>
          <Minus className="h-[18px] w-[18px] stroke-[1.75]" />
        </ZoomButton>
      </div>
    </Panel>
  );
}
