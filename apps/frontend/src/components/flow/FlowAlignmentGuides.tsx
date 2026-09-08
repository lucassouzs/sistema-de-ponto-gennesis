'use client';

import React from 'react';
import { useStore } from '@xyflow/react';
import type { FlowAlignmentGuide } from '@/lib/flowNodeSnap';

type Props = {
  guides: FlowAlignmentGuide[];
};

/** Linhas tracejadas azuis quando formas encaixam no alinhamento. */
export function FlowAlignmentGuides({ guides }: Props) {
  const transform = useStore((state) => state.transform);

  if (guides.length === 0) return null;

  const [tx, ty, zoom] = transform;
  const strokeWidth = 1 / Math.max(zoom, 0.05);
  const dash = `${6 / Math.max(zoom, 0.05)} ${4 / Math.max(zoom, 0.05)}`;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ zIndex: 4 }}
    >
      <g transform={`translate(${tx}, ${ty}) scale(${zoom})`}>
        {guides.map((guide, index) =>
          guide.axis === 'x' ? (
            <line
              key={`v-${guide.position}-${index}`}
              x1={guide.position}
              y1={guide.start}
              x2={guide.position}
              y2={guide.end}
              stroke="#3b82f6"
              strokeWidth={strokeWidth}
              strokeDasharray={dash}
              opacity={0.85}
            />
          ) : (
            <line
              key={`h-${guide.position}-${index}`}
              x1={guide.start}
              y1={guide.position}
              x2={guide.end}
              y2={guide.position}
              stroke="#3b82f6"
              strokeWidth={strokeWidth}
              strokeDasharray={dash}
              opacity={0.85}
            />
          ),
        )}
      </g>
    </svg>
  );
}
