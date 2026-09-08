export const FLOW_SEQUENCEFLOW_MARKER_ID = 'flow-sequenceflow-end';
export const FLOW_SEQUENCEFLOW_MARKER_URL = `url(#${FLOW_SEQUENCEFLOW_MARKER_ID})`;

export const FLOW_SEQUENCEFLOW_MARKER_STROKE_LIGHT = '#333333';
export const FLOW_SEQUENCEFLOW_MARKER_STROKE_DARK = '#ffffff';

export function resolveFlowMarkerEnd(markerEnd: unknown): string {
  if (typeof markerEnd === 'string' && markerEnd.includes('url(')) {
    return markerEnd;
  }
  return FLOW_SEQUENCEFLOW_MARKER_URL;
}

export function isSystemDarkTheme(): boolean {
  return (
    document.documentElement.classList.contains('dark') ||
    document.body.classList.contains('dark') ||
    document.documentElement.getAttribute('data-theme') === 'dark'
  );
}

const MARKER_PATH = 'M 0 5 L 10 10 L 0 15 Z';
const MARKER_REF_X = '10';

/** Garante `<defs>` com marker de sequenceFlow no SVG do canvas (React Flow). */
export function ensureSequenceFlowMarkerDefs(container: ParentNode): void {
  const svg =
    container.querySelector('.react-flow__edges svg') ??
    container.querySelector('.react-flow__viewport svg');
  if (!svg) return;

  const isDark = isSystemDarkTheme();
  const stroke = isDark ? FLOW_SEQUENCEFLOW_MARKER_STROKE_DARK : FLOW_SEQUENCEFLOW_MARKER_STROKE_LIGHT;

  const NS = 'http://www.w3.org/2000/svg';
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  let marker = defs.querySelector(`#${FLOW_SEQUENCEFLOW_MARKER_ID}`);
  if (!marker) {
    marker = document.createElementNS(NS, 'marker');
    marker.setAttribute('id', FLOW_SEQUENCEFLOW_MARKER_ID);
    marker.setAttribute('viewBox', '0 0 20 20');
    marker.setAttribute('refX', MARKER_REF_X);
    marker.setAttribute('refY', '10');
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '10');
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('markerUnits', 'userSpaceOnUse');
    marker.setAttribute('class', 'react-flow__arrowhead');

    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', MARKER_PATH);
    path.setAttribute('class', 'flow-sequenceflow-end-marker');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    marker.appendChild(path);
    defs.appendChild(marker);
  }

  const path = marker.querySelector('.flow-sequenceflow-end-marker');
  if (path) {
    path.setAttribute('stroke', stroke);
    path.setAttribute('fill', stroke);
    path.setAttribute('stroke-width', '1');
  }
}
