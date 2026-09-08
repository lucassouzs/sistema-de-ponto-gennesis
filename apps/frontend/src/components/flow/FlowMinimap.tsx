'use client';

import React from 'react';
import { MiniMap } from '@xyflow/react';

/** Minimapa no canto superior direito, abaixo da barra de arquivos — não cobre os fluxos ao rolar para baixo. */
export function FlowMinimap() {
  return (
    <MiniMap
      position="top-right"
      zoomable
      pannable
      className="flow-minimap-dock !m-0 overflow-hidden rounded border border-gray-200 !bg-white shadow-md dark:border-gray-700 dark:!bg-slate-900 dark:shadow-lg"
      style={{
        top: 56,
        right: 12,
        width: 132,
        height: 88,
      }}
    />
  );
}
