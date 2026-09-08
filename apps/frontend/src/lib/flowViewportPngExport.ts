import {
  getNodesBounds,
  getViewportForBounds,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import { toPng } from 'html-to-image';
import { sanitizeFilename } from './flowExport';
import { getPngExportTheme } from './flowPngExport';
import { stripPreviewElements } from './flowAppend';

const EXPORT_PADDING = 48;
/** Margem extra para pontas de seta (marker-end) fora do path. */
const EDGE_MARKER_MARGIN = 20;

type ExportRect = { x: number; y: number; width: number; height: number };

function mergeExportRects(a: ExportRect, b: ExportRect): ExportRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

function expandExportRect(rect: ExportRect, margin: number): ExportRect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

/** Pontos absolutos do atributo `d` (M/L) — mesma base usada em buildFlowStepPath. */
function forEachPathPoint(d: string, onPoint: (x: number, y: number) => void): void {
  const re = /[ML]\s*([-+]?[\d.]+)[,\s]+([-+]?[\d.]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(d)) !== null) {
    const x = Number.parseFloat(match[1]!);
    const y = Number.parseFloat(match[2]!);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      onPoint(x, y);
    }
  }
}

/** Mede arestas pelo `d` do path (coordenadas do fluxo), não pelo getBBox (local ao grupo SVG). */
function measureEdgePathBounds(viewport: HTMLElement): ExportRect | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let hasPoint = false;

  viewport.querySelectorAll<SVGPathElement>('.react-flow__edge-path').forEach((path) => {
    forEachPathPoint(path.getAttribute('d') ?? '', (x, y) => {
      hasPoint = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
  });

  if (!hasPoint) return null;

  return expandExportRect(
    { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    EDGE_MARKER_MARGIN,
  );
}

function resolveNodeBounds(nodes: Node[], rf: ReactFlowInstance | null): ExportRect {
  const visibleNodes = stripPreviewElements(nodes).filter((node) => !node.hidden);
  if (visibleNodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return rf?.getNodesBounds ? rf.getNodesBounds(visibleNodes) : getNodesBounds(visibleNodes);
}

/** Caixa do diagrama: nós + caminhos das setas (evita cortar linhas ortogonais). */
export function resolveDiagramExportBounds(
  viewport: HTMLElement,
  nodes: Node[],
  rf: ReactFlowInstance | null = null,
): ExportRect {
  const nodeBounds = resolveNodeBounds(nodes, rf);
  const edgeBounds = measureEdgePathBounds(viewport);

  if (edgeBounds) {
    return mergeExportRects(nodeBounds, edgeBounds);
  }
  return nodeBounds;
}

function resolvePngPixelRatio(): number {
  if (typeof window === 'undefined') return 3;
  return Math.min(4, Math.max(3, window.devicePixelRatio || 2));
}

const HIDE_ON_EXPORT_SELECTORS = [
  '.react-flow__nodesselection',
  '.react-flow__selection',
  '.react-flow__resize-control',
  '.react-flow__node-resizer',
  '.react-flow__node-toolbar',
  '.react-flow__edgeupdater',
  '.react-flow__edgeupdater-source',
  '.react-flow__edgeupdater-target',
  '.react-flow__handle',
];

function hideExportArtifacts(viewport: HTMLElement): () => void {
  const hidden: Array<{ el: HTMLElement; prev: string }> = [];

  const conceal = (selector: string) => {
    viewport.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      hidden.push({ el, prev: el.style.visibility });
      el.style.visibility = 'hidden';
    });
  };

  for (const selector of HIDE_ON_EXPORT_SELECTORS) {
    conceal(selector);
  }

  viewport.querySelectorAll<HTMLElement>('.react-flow__node.selected').forEach((el) => {
    el.classList.add('flow-exporting-node');
  });

  return () => {
    hidden.forEach(({ el, prev }) => {
      el.style.visibility = prev;
    });
    viewport.querySelectorAll<HTMLElement>('.flow-exporting-node').forEach((el) => {
      el.classList.remove('flow-exporting-node');
    });
  };
}

/** Captura o canvas React Flow exatamente como aparece na tela — linhas nítidas, sem re-render BPMN. */
export async function exportReactFlowViewportToPng(
  wrapperEl: HTMLElement,
  processName: string,
  nodes: Node[],
  isDark?: boolean,
  rf: ReactFlowInstance | null = null,
): Promise<void> {
  const viewport = wrapperEl.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!viewport) {
    throw new Error('Viewport do canvas não encontrado');
  }

  const nodesBounds = resolveDiagramExportBounds(viewport, nodes, rf);
  if (!nodesBounds.width || !nodesBounds.height) {
    throw new Error('Diagrama vazio para exportar');
  }

  const pixelRatio = resolvePngPixelRatio();
  const imageWidth = Math.ceil(nodesBounds.width + EXPORT_PADDING * 2);
  const imageHeight = Math.ceil(nodesBounds.height + EXPORT_PADDING * 2);
  const fittedViewport = getViewportForBounds(
    nodesBounds,
    imageWidth,
    imageHeight,
    0.1,
    4,
    `${EXPORT_PADDING}px`,
  );

  const theme = getPngExportTheme(isDark);
  const restoreArtifacts = hideExportArtifacts(viewport);

  try {
    const dataUrl = await toPng(viewport, {
      backgroundColor: theme.bgColor,
      pixelRatio,
      width: imageWidth,
      height: imageHeight,
      cacheBust: true,
      style: {
        width: `${imageWidth}px`,
        height: `${imageHeight}px`,
        transform: `translate(${fittedViewport.x}px, ${fittedViewport.y}px) scale(${fittedViewport.zoom})`,
      },
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        const blocked = [
          'react-flow__minimap',
          'react-flow__controls',
          'react-flow__panel',
          'react-flow__attribution',
        ];
        return !blocked.some((cls) => node.classList?.contains(cls));
      },
    });

    const link = document.createElement('a');
    link.download = sanitizeFilename(processName || 'processo', 'png');
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    restoreArtifacts();
  }
}
