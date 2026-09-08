'use client';

import { FLOW_SEQUENCEFLOW_MARKER_ID } from '@/lib/flowArrowMarkers';

/** Markers SVG estáveis para pontas de sequenceFlow — referenciados via url(#id) nas arestas. */
export function FlowSequenceFlowMarkerDefs() {
  return (
    <svg
      aria-hidden
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <defs>
        <marker
          id={FLOW_SEQUENCEFLOW_MARKER_ID}
          className="react-flow__arrowhead"
          viewBox="0 0 20 20"
          refX={10}
          refY="10"
          markerWidth="10"
          markerHeight="10"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            className="flow-sequenceflow-end-marker"
            d="M 0 5 L 10 10 L 0 15 Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </marker>
      </defs>
    </svg>
  );
}
