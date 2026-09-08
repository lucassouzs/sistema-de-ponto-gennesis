import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { buildFlowBpmnXml, sanitizeFilename, estimateExportDiagramSize } from './flowExport';
import { createBpmnModeler, type BpmnModelerInstance } from './flowBpmnModelerExport';
import { stripPreviewElements } from './flowAppend';

const PNG_SCALE = 2;
const EXPORT_PADDING = 40;

type ViewBoxRect = { x: number; y: number; width: number; height: number };

type BpmnCanvasService = {
  zoom(type: string): void;
  viewbox(): ViewBoxRect;
  getContainer(): HTMLElement;
  getRootElement(): { id: string };
};

type BpmnElementRegistry = {
  get(id: string): DiagramElement | undefined;
  forEach(callback: (element: DiagramElement) => void): void;
};

type DiagramElement = {
  id: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  waypoints?: Array<{ x: number; y: number }>;
  labelTarget?: unknown;
};

const HIDDEN_MODELER_MIN_WIDTH = 1400;
const HIDDEN_MODELER_MIN_HEIGHT = 900;

export type PngExportTheme = {
  isDark: boolean;
  bgColor: string;
  textColor: string;
  strokeColor: string;
  shapeFill: string;
  shapeBorder: string;
  laneHeaderFill: string;
};

const LIGHT_FILLS = new Set(['#ffffff', '#fff', 'white', '#f0f0f0']);
const DARK_STROKES = new Set(['#000000', '#000', 'black', '#333333', '#333', '#222222', '#222']);

/** Branco/cinza padrão do bpmn-js — não inclui cores customizadas (bioc) do editor. */
function isDefaultBpmnFill(value: string): boolean {
  const normalized = normalizeColor(value);
  if (!normalized || normalized === 'none' || normalized === 'transparent') return false;
  if (LIGHT_FILLS.has(normalized)) return true;
  const rgb = parseColorToRgb(normalized);
  if (!rgb) return false;
  // Só branco quase puro; pastéis (#dcfce7, #dbeafe…) ficam de fora.
  return relativeLuminance(rgb) >= 0.97;
}

function isDarkStroke(value: string): boolean {
  const normalized = normalizeColor(value);
  if (!normalized || normalized === 'none' || normalized === 'transparent') return false;
  if (DARK_STROKES.has(normalized)) return true;
  const rgb = parseColorToRgb(normalized);
  return rgb !== null && relativeLuminance(rgb) <= 0.25;
}

function setThemedFill(el: SVGElement, theme: PngExportTheme, raw: string): void {
  const normalized = normalizeColor(raw);
  if (!isDefaultBpmnFill(normalized)) return;
  const next =
    normalized === '#f0f0f0' || normalized === 'rgb(240, 240, 240)'
      ? theme.laneHeaderFill
      : theme.shapeFill;
  el.setAttribute('fill', next);
  (el as unknown as HTMLElement).style.fill = next;
}

function setThemedStroke(el: SVGElement, theme: PngExportTheme, raw: string): void {
  if (!isDarkStroke(raw)) return;
  el.setAttribute('stroke', theme.strokeColor);
  (el as unknown as HTMLElement).style.stroke = theme.strokeColor;
}

export function isSystemDarkTheme(): boolean {
  return (
    document.documentElement.classList.contains('dark') ||
    document.body.classList.contains('dark') ||
    document.documentElement.getAttribute('data-theme') === 'dark'
  );
}

function isTransparentColor(value: string): boolean {
  const v = normalizeColor(value);
  if (!v || v === 'transparent') return true;
  const match = v.match(/rgba?\(([^)]+)\)/);
  if (match) {
    const parts = match[1]!.split(',').map((p) => Number.parseFloat(p.trim()));
    if (parts.length >= 4 && parts[3] === 0) return true;
  }
  return false;
}

function toThemeResult(color: string): { color: string; isDark: boolean } | null {
  const rgb = parseColorToRgb(color);
  if (!rgb) return null;
  return { color, isDark: relativeLuminance(rgb) < 0.5 };
}

/**
 * Lê a cor de fundo REAL renderizada no canvas do editor no momento da exportação.
 * Prioriza a variável CSS --flow-canvas-bg (fonte de verdade do fundo do canvas);
 * se não houver, sobe na árvore até achar um elemento com fundo não transparente.
 */
function readCanvasBackground(): { color: string; isDark: boolean } | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;

  const canvas = document.querySelector('.flow-editor-canvas');
  if (canvas) {
    const styles = window.getComputedStyle(canvas);

    // 1. Variável CSS que define o fundo do canvas (sempre reflete o tema atual).
    const varBg = styles.getPropertyValue('--flow-canvas-bg').trim();
    if (varBg && !isTransparentColor(varBg)) {
      const result = toThemeResult(varBg);
      if (result) return result;
    }

    // 2. Fundo pintado diretamente no elemento do canvas.
    if (!isTransparentColor(styles.backgroundColor)) {
      const result = toThemeResult(styles.backgroundColor);
      if (result) return result;
    }
  }

  // 3. Fallback: primeiro ancestral com fundo não transparente.
  let node: Element | null =
    canvas ??
    document.querySelector('.react-flow__pane') ??
    document.querySelector('.react-flow');
  while (node) {
    const bg = window.getComputedStyle(node).backgroundColor;
    if (!isTransparentColor(bg)) {
      const result = toThemeResult(bg);
      if (result) return result;
    }
    node = node.parentElement;
  }
  return null;
}

/** Cores alinhadas ao canvas (.flow-editor-canvas) no tema atual. */
export function getPngExportTheme(isDarkOverride?: boolean): PngExportTheme {
  const isDark =
    isDarkOverride ?? readCanvasBackground()?.isDark ?? isSystemDarkTheme();

  if (isDark) {
    const bgColor = '#0f172a';
    return {
      isDark: true,
      bgColor,
      textColor: '#f1f5f9',
      strokeColor: '#e2e8f0',
      shapeFill: '#1e293b',
      shapeBorder: '#cbd5e1',
      laneHeaderFill: '#0f172a',
    };
  }

  const bgColor = '#ffffff';
  return {
    isDark: false,
    bgColor,
    textColor: '#000000',
    strokeColor: '#000000',
    shapeFill: '#ffffff',
    shapeBorder: '#000000',
    laneHeaderFill: '#f0f0f0',
  };
}

/** @deprecated Use getPngExportTheme() */
export function getPngExportThemeColors() {
  const theme = getPngExportTheme();
  return {
    isDark: theme.isDark,
    bgColor: theme.bgColor,
    textColor: theme.textColor,
    strokeColor: theme.strokeColor,
    shapeColor: theme.shapeFill,
  };
}

function buildBpmnExportStyles(theme: PngExportTheme): string {
  return `
.djs-container .djs-element .djs-visual > :not(text) {
  stroke-width: 1.5px !important;
}
.djs-container text,
.djs-container .djs-label tspan {
  fill: ${theme.textColor} !important;
  font-family: Arial, sans-serif !important;
  font-size: 11px !important;
  font-weight: 700 !important;
}
.djs-container .djs-connection .djs-visual path {
  stroke: ${theme.strokeColor} !important;
  stroke-width: 1.5px !important;
}
`;
}

function normalizeColor(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function parseColorToRgb(value: string | null | undefined): [number, number, number] | null {
  const v = normalizeColor(value);
  if (!v || v === 'none' || v === 'transparent') return null;
  if (v === 'white') return [255, 255, 255];
  if (v === 'black') return [0, 0, 0];

  if (v.startsWith('#')) {
    let hex = v.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    if (hex.length !== 6) return null;
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return [r, g, b];
  }

  const match = v.match(/rgba?\(([^)]+)\)/);
  if (match) {
    const parts = match[1]!.split(',').map((p) => Number.parseFloat(p.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => !Number.isNaN(n))) {
      return [parts[0]!, parts[1]!, parts[2]!];
    }
  }

  return null;
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Escolhe texto escuro/claro conforme a luminância do preenchimento da forma. */
function pickReadableTextColor(fill: string | null | undefined, theme: PngExportTheme): string {
  const rgb = parseColorToRgb(fill);
  if (!rgb) return theme.textColor;
  return relativeLuminance(rgb) > 0.55 ? '#111827' : '#f8fafc';
}

function resolveShapeFill(visual: Element): string | null {
  const gfx = visual.querySelector('rect, circle, ellipse, polygon, path');
  if (!gfx) return null;
  const attrFill = gfx.getAttribute('fill');
  const styleFill = (gfx as unknown as HTMLElement).style?.fill;
  return styleFill || attrFill || null;
}

function applyTextColor(text: Element, color: string): void {
  text.setAttribute('fill', color);
  (text as unknown as HTMLElement).style.fill = color;
  text.querySelectorAll('tspan').forEach((tspan) => {
    tspan.setAttribute('fill', color);
    (tspan as unknown as HTMLElement).style.fill = color;
  });
}

/** Corrige rótulos embutidos (tasks): usa cor de texto que contrasta com o fill da forma. */
function applyReadableShapeLabelColors(clonedSvg: SVGSVGElement, theme: PngExportTheme): void {
  clonedSvg.querySelectorAll('.djs-element.djs-shape').forEach((shapeEl) => {
    const visual = shapeEl.querySelector(':scope > .djs-visual');
    if (!visual) return;

    const texts = Array.from(visual.querySelectorAll('text'));
    if (texts.length === 0) return;

    const fill = resolveShapeFill(visual);
    if (!fill) return;

    const color = pickReadableTextColor(fill, theme);
    texts.forEach((text) => applyTextColor(text, color));
  });
}

function isTextNode(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  return tag === 'text' || tag === 'tspan';
}

/** Converte formas padrão do bpmn-js (branco/preto) para o tema escuro do canvas. */
function remapDefaultSvgColors(clonedSvg: SVGSVGElement, theme: PngExportTheme): void {
  if (!theme.isDark) return;

  clonedSvg.querySelectorAll<SVGElement>('[fill]').forEach((el) => {
    // O fill do texto é tratado separadamente; remapear aqui deixaria o
    // texto claro escuro (invisível sobre formas escuras).
    if (isTextNode(el)) return;
    setThemedFill(el, theme, el.getAttribute('fill') ?? '');
  });

  clonedSvg.querySelectorAll<SVGElement>('[stroke]').forEach((el) => {
    setThemedStroke(el, theme, el.getAttribute('stroke') ?? '');
  });

  clonedSvg.querySelectorAll<SVGElement>('*').forEach((el) => {
    const htmlEl = el as unknown as HTMLElement;
    if (htmlEl.style?.fill && !isTextNode(el)) {
      setThemedFill(el, theme, htmlEl.style.fill);
    }
    if (htmlEl.style?.stroke) {
      setThemedStroke(el, theme, htmlEl.style.stroke);
    }
  });

  clonedSvg.querySelectorAll<SVGElement>('marker path, marker polygon, marker polyline').forEach((el) => {
    const fill = el.getAttribute('fill');
    const stroke = el.getAttribute('stroke');
    if (fill && fill !== 'none') {
      if (isDefaultBpmnFill(fill)) {
        setThemedFill(el, theme, fill);
      } else if (isDarkStroke(fill)) {
        el.setAttribute('fill', theme.strokeColor);
        (el as unknown as HTMLElement).style.fill = theme.strokeColor;
      }
    }
    if (stroke && stroke !== 'none') {
      setThemedStroke(el, theme, stroke);
    }
  });
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function getDiagramBoundsFromRegistry(modeler: BpmnModelerInstance): ViewBoxRect | null {
  const registry = modeler.get<BpmnElementRegistry>('elementRegistry');
  const canvas = modeler.get<BpmnCanvasService>('canvas');
  const root = canvas.getRootElement();

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const include = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  registry.forEach((element) => {
    if (!element || element.id === root.id) return;

    if (element.labelTarget) {
      if (typeof element.x === 'number' && typeof element.y === 'number') {
        include(element.x, element.y);
        include(
          element.x + (element.width ?? 100),
          element.y + (element.height ?? 24),
        );
      }
      return;
    }

    if (typeof element.x === 'number' && typeof element.y === 'number') {
      include(element.x, element.y);
      include(
        element.x + (element.width ?? 100),
        element.y + (element.height ?? 80),
      );
    }

    element.waypoints?.forEach((point) => include(point.x, point.y));
  });

  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) {
    return null;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function stripViewportTransforms(clonedSvg: SVGSVGElement): void {
  clonedSvg.querySelectorAll('.viewport, .viewport > g').forEach((el) => {
    el.removeAttribute('transform');
  });
  clonedSvg.removeAttribute('width');
  clonedSvg.removeAttribute('height');
}

/** Copia estilos computados do SVG renderizado para o clone (preserva markers e cores). */
function inlineSvgComputedStyles(sourceSvg: SVGSVGElement, clonedSvg: SVGSVGElement): void {
  const sourceNodes = [sourceSvg, ...Array.from(sourceSvg.querySelectorAll('*'))];
  const cloneNodes = [clonedSvg, ...Array.from(clonedSvg.querySelectorAll('*'))];

  cloneNodes.forEach((cloneEl, index) => {
    const sourceEl = sourceNodes[index];
    if (!(cloneEl instanceof SVGElement) || !(sourceEl instanceof SVGElement)) return;

    const computed = window.getComputedStyle(sourceEl);
    const target = cloneEl as unknown as HTMLElement;

    if (computed.stroke && computed.stroke !== 'none') {
      target.style.stroke = computed.stroke;
    }
    if (computed.fill && computed.fill !== 'none') {
      target.style.fill = computed.fill;
    }
    if (computed.strokeWidth) {
      target.style.strokeWidth = computed.strokeWidth;
    }
    if (computed.opacity && computed.opacity !== '1') {
      target.style.opacity = computed.opacity;
    }
    if (computed.markerEnd && computed.markerEnd !== 'none') {
      cloneEl.setAttribute('marker-end', computed.markerEnd);
    }
    if (computed.markerStart && computed.markerStart !== 'none') {
      cloneEl.setAttribute('marker-start', computed.markerStart);
    }
  });
}

function findExternalNodeLabelGroups(svg: SVGSVGElement, connectionIds: Set<string>): SVGGElement[] {
  const groups: SVGGElement[] = [];

  svg.querySelectorAll('.djs-element.djs-label').forEach((el) => {
    if (!(el instanceof SVGGElement)) return;
    const elementId = el.getAttribute('data-element-id') ?? '';
    const baseId = elementId.replace(/_label$/i, '');
    if (connectionIds.has(baseId)) return;
    groups.push(el);
  });

  return groups;
}

/** Rótulos externos de evento/gateway ficam acima das linhas — sem mover Sim/Não das conexões. */
function promoteExternalLabelsForExport(
  sourceSvg: SVGSVGElement,
  clonedSvg: SVGSVGElement,
  connectionIds: Set<string>,
): void {
  const sourceGroups = findExternalNodeLabelGroups(sourceSvg, connectionIds);
  const topLayer =
    (clonedSvg.querySelector('.viewport') as SVGGElement | null) ??
    (clonedSvg.querySelector('g') as SVGGElement | null) ??
    clonedSvg;

  for (const sourceGroup of sourceGroups) {
    const elementId = sourceGroup.getAttribute('data-element-id');
    if (!elementId) continue;

    const cloneGroup = clonedSvg.querySelector(
      `[data-element-id="${CSS.escape(elementId)}"]`,
    );
    if (!(cloneGroup instanceof SVGGElement) || !topLayer) continue;

    const ctm = sourceGroup.getCTM();
    if (!ctm) continue;

    cloneGroup.setAttribute('transform', `translate(${Math.round(ctm.e)}, ${Math.round(ctm.f)})`);
    topLayer.appendChild(cloneGroup);
  }
}

function prepareClonedSvg(
  sourceSvg: SVGSVGElement,
  viewBox: ViewBoxRect,
  theme: PngExportTheme,
  connectionIds: Set<string> = new Set(),
): SVGSVGElement {
  const clonedSvg = sourceSvg.cloneNode(true) as SVGSVGElement;
  inlineSvgComputedStyles(sourceSvg, clonedSvg);
  promoteExternalLabelsForExport(sourceSvg, clonedSvg, connectionIds);
  stripViewportTransforms(clonedSvg);
  remapDefaultSvgColors(clonedSvg, theme);
  applyReadableShapeLabelColors(clonedSvg, theme);

  const pad = EXPORT_PADDING;
  const width = Math.ceil(viewBox.width + pad);
  const height = Math.ceil(viewBox.height + pad);

  clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clonedSvg.setAttribute('width', String(width));
  clonedSvg.setAttribute('height', String(height));
  clonedSvg.setAttribute(
    'viewBox',
    `${viewBox.x - pad / 2} ${viewBox.y - pad / 2} ${viewBox.width + pad} ${viewBox.height + pad}`,
  );

  return clonedSvg;
}

/** Converte SVG do DOM renderizado (com defs/markers) em PNG. */
export function downloadPngFromDomSvg(
  sourceSvg: SVGSVGElement,
  filename: string,
  viewBox: ViewBoxRect,
  theme: PngExportTheme = getPngExportTheme(),
  connectionIds: Set<string> = new Set(),
): Promise<void> {
  const clonedSvg = prepareClonedSvg(sourceSvg, viewBox, theme, connectionIds);
  const exportWidth = Number(clonedSvg.getAttribute('width') ?? 800);
  const exportHeight = Number(clonedSvg.getAttribute('height') ?? 600);

  const svgString = new XMLSerializer().serializeToString(clonedSvg);

  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = exportWidth * PNG_SCALE;
        canvas.height = exportHeight * PNG_SCALE;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D não disponível');
        }

        ctx.scale(PNG_SCALE, PNG_SCALE);
        ctx.fillStyle = theme.bgColor;
        ctx.fillRect(0, 0, exportWidth, exportHeight);
        ctx.drawImage(img, 0, 0, exportWidth, exportHeight);

        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        resolve();
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Erro ao carregar SVG como imagem'));
    };

    img.src = url;
  });
}

function findModelerSvg(root: ParentNode): SVGSVGElement | null {
  return root.querySelector('.djs-container svg') ?? root.querySelector('svg');
}

async function captureModelerDomToPng(
  modeler: BpmnModelerInstance,
  processName: string,
  theme: PngExportTheme,
  connectionIds: Set<string> = new Set(),
): Promise<void> {
  const canvas = modeler.get<BpmnCanvasService>('canvas');
  canvas.zoom('fit-viewport');
  await waitForPaint();

  const domSvg = findModelerSvg(canvas.getContainer());
  if (!domSvg) {
    throw new Error('SVG do canvas BPMN não encontrado');
  }

  const viewBox =
    getDiagramBoundsFromRegistry(modeler) ?? canvas.viewbox();

  if (!viewBox.width || !viewBox.height) {
    throw new Error('Não foi possível calcular o tamanho do diagrama');
  }

  await downloadPngFromDomSvg(
    domSvg,
    sanitizeFilename(processName || 'processo', 'png'),
    viewBox,
    theme,
    connectionIds,
  );
}

function createHiddenModelerHost(width: number, height: number, theme: PngExportTheme): HTMLDivElement {
  const container = document.createElement('div');
  container.style.cssText = [
    'position:fixed',
    'left:-9999px',
    'top:0',
    `width:${Math.max(HIDDEN_MODELER_MIN_WIDTH, width)}px`,
    `height:${Math.max(HIDDEN_MODELER_MIN_HEIGHT, height)}px`,
    `background:${theme.bgColor}`,
    'opacity:0',
    'pointer-events:none',
    'overflow:hidden',
  ].join(';');

  const styleEl = document.createElement('style');
  styleEl.textContent = buildBpmnExportStyles(theme);
  container.appendChild(styleEl);

  const canvasHost = document.createElement('div');
  canvasHost.style.cssText = 'width:100%;height:100%';
  canvasHost.dataset.bpmnExportHost = 'true';
  container.appendChild(canvasHost);

  document.body.appendChild(container);
  return container;
}

function getModelerHost(container: HTMLDivElement): HTMLElement {
  return container.querySelector('[data-bpmn-export-host]') ?? container;
}

/** Renderiza BPMN em modeler oculto e exporta PNG a partir do SVG do DOM (markers preservados). */
export async function exportBpmnXmlToPng(
  bpmnXml: string,
  processName: string,
  diagramSize?: { width: number; height: number },
  isDark?: boolean,
  connectionIds: Set<string> = new Set(),
): Promise<void> {
  const theme = getPngExportTheme(isDark);
  const size = diagramSize ?? { width: HIDDEN_MODELER_MIN_WIDTH, height: HIDDEN_MODELER_MIN_HEIGHT };
  const container = createHiddenModelerHost(size.width, size.height, theme);

  try {
    const modeler = await createBpmnModeler(getModelerHost(container));
    await modeler.importXML(bpmnXml);
    await captureModelerDomToPng(modeler, processName, theme, connectionIds);
    modeler.destroy();
  } finally {
    container.remove();
  }
}

/** Exporta o canvas React Flow via BPMN XML + captura DOM do bpmn-js. */
export async function exportFlowCanvasToPng(
  processName: string,
  nodes: Node[],
  edges: Edge[],
  rf: ReactFlowInstance | null,
  isDark?: boolean,
): Promise<void> {
  const cleanNodes = stripPreviewElements(nodes);
  const cleanEdges = stripPreviewElements(edges);
  const diagramSize = estimateExportDiagramSize(cleanNodes, rf);
  const xml = buildFlowBpmnXml(processName, cleanNodes, cleanEdges, rf);
  const connectionIds = new Set(cleanEdges.map((edge) => edge.id));
  await exportBpmnXmlToPng(xml, processName, diagramSize, isDark, connectionIds);
}

export async function exportBpmnModelerToPng(
  modeler: BpmnModelerInstance,
  bpmnXml: string,
  processName: string,
): Promise<void> {
  const theme = getPngExportTheme();
  await modeler.importXML(bpmnXml);
  await captureModelerDomToPng(modeler, processName, theme);
}
