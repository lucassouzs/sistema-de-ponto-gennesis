import ELK from 'elkjs/lib/elk.bundled.js';
import type { Edge, Node } from '@xyflow/react';
import { LANE_HEADER_WIDTH } from '@/components/flow/BpmnNodes';
import { FLOW_AI_LAYOUT_OPTIONS, organizeFlowLayout } from './flowAutoLayout';
import {
  buildNodeMap,
  findContainingLane,
  getAbsolutePosition,
  getLaneSize,
  getProcessNodeSize,
  getStackedLaneGroup,
  LANE_NODE_TYPE,
  MIN_LANE_WIDTH,
  syncLaneHierarchy,
} from './flowLaneHierarchy';
import { applyDefaultColorsToImportedNodes } from './flowNodeDefaults';
import { cleanEdgesForRouting, finalizeDiagramEdges } from './flowDiagramFinalize';
import { finalizeBpmnImport } from './flowBpmnImportFinalize';
import { normalizeFlowEdge } from './flowEdge';

const MIN_GAP = 40;
const AI_MIN_GAP = 96;
const POOL_X = 40;
const LANE_END_PADDING = 40;

type SmartColor = { fill: string; stroke: string };

function isProcessNode(node: Node): boolean {
  const type = String(node.type ?? '');
  return type !== LANE_NODE_TYPE && type !== 'bpmnText' && !node.id.startsWith('ai-panel-');
}

function resolveLaneForNode(node: Node, lanes: Node[], nodeMap: Map<string, Node>): Node | null {
  if (node.parentId) {
    return lanes.find((lane) => lane.id === node.parentId) ?? null;
  }
  return findContainingLane(node, lanes, nodeMap);
}

function laneVerticalCenter(lane: Node, nodeHeight: number): number {
  const laneSize = getLaneSize(lane);
  return lane.position.y + (laneSize.height - nodeHeight) / 2;
}

function setLaneDimensions(lane: Node, width: number, height: number): Node {
  return {
    ...lane,
    width,
    height,
    style: { ...(lane.style as object), width, height },
  };
}

/** Expande largura das raias empilhadas para caber o conteúdo após o layout. */
export function fitLanesToContent(nodes: Node[], minWidth = MIN_LANE_WIDTH): Node[] {
  const lanes = nodes.filter((node) => node.type === LANE_NODE_TYPE);
  if (lanes.length === 0) return nodes;

  const nodeMap = buildNodeMap(nodes);
  const laneWidthById = new Map<string, number>();

  for (const lane of lanes) {
    const group = getStackedLaneGroup(lanes, lane.id, nodes);
    const groupIds = new Set(group.map((item) => item.id));
    let maxRelativeRight = LANE_HEADER_WIDTH + 32;

    for (const node of nodes) {
      if (!isProcessNode(node)) continue;
      const owner = resolveLaneForNode(node, lanes, nodeMap);
      if (!owner || !groupIds.has(owner.id)) continue;

      const ownerAbs = getAbsolutePosition(owner, nodeMap);
      const abs = getAbsolutePosition(node, nodeMap);
      const size = getProcessNodeSize(node);
      const relativeRight = abs.x + size.width - ownerAbs.x;
      maxRelativeRight = Math.max(maxRelativeRight, relativeRight);
    }

    const targetWidth = Math.max(minWidth, maxRelativeRight + LANE_END_PADDING);
    groupIds.forEach((laneId) => {
      laneWidthById.set(laneId, Math.max(laneWidthById.get(laneId) ?? 0, targetWidth));
    });
  }

  return nodes.map((node) => {
    if (node.type !== LANE_NODE_TYPE) return node;
    const width = laneWidthById.get(node.id) ?? getLaneSize(node).width;
    return setLaneDimensions(node, width, getLaneSize(node).height);
  });
}

function detachProcessNodes(nodes: Node[]): Node[] {
  const nodeMap = buildNodeMap(nodes);
  return nodes.map((node) => {
    if (!isProcessNode(node)) return node;
    const abs = getAbsolutePosition(node, nodeMap);
    const next = { ...node, position: abs, zIndex: 1 } as Node;
    delete next.parentId;
    delete next.extent;
    return next;
  });
}

function applyAbsolutePositions(nodes: Node[], positions: Map<string, { x: number; y: number }>): Node[] {
  return nodes.map((node) => {
    if (!isProcessNode(node)) return node;
    const pos = positions.get(node.id);
    if (!pos) return node;
    const next = { ...node, position: pos, zIndex: 1 } as Node;
    delete next.parentId;
    delete next.extent;
    return next;
  });
}

/** Auto-layout pós-IA: ELK apenas quando não há raias; com raias preserva posições da IA. */
export async function applyElkAutoLayout(nodes: Node[], edges: Edge[]): Promise<Node[]> {
  const lanes = nodes.filter((node) => node.type === LANE_NODE_TYPE);
  if (lanes.length > 0) {
    return nodes;
  }

  return applyElkLayoutWithoutLanes(nodes, edges);
}

async function applyElkLayoutWithoutLanes(nodes: Node[], edges: Edge[]): Promise<Node[]> {
  const processNodes = nodes.filter(isProcessNode);
  if (processNodes.length === 0) return nodes;

  const lanes = nodes.filter((node) => node.type === LANE_NODE_TYPE);
  const nodeMap = buildNodeMap(nodes);
  const laneByNodeId = new Map(
    processNodes.map((node) => [node.id, resolveLaneForNode(node, lanes, nodeMap)]),
  );

  const processIds = new Set(processNodes.map((node) => node.id));
  const elk = new ELK();

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '50',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: processNodes.map((node) => {
      const size = getProcessNodeSize(node);
      return { id: node.id, width: size.width, height: size.height };
    }),
    edges: edges
      .filter((edge) => processIds.has(edge.source) && processIds.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
  };

  try {
    const layout = await elk.layout(graph);
    const positions = new Map<string, { x: number; y: number }>();

    for (const child of layout.children ?? []) {
      if (!child.id || child.x == null || child.y == null) continue;

      const node = processNodes.find((item) => item.id === child.id);
      if (!node) continue;

      const size = getProcessNodeSize(node);
      const lane = laneByNodeId.get(node.id);
      const x = POOL_X + LANE_HEADER_WIDTH + child.x;
      const y = lane ? laneVerticalCenter(lane, size.height) : POOL_X + child.y;

      positions.set(child.id, { x, y });
    }

    const structural = nodes.filter((node) => !isProcessNode(node));
    const positioned = applyAbsolutePositions(detachProcessNodes(nodes), positions);
    const merged = [
      ...structural.filter((node) => node.type === LANE_NODE_TYPE),
      ...positioned.filter(isProcessNode),
      ...structural.filter((node) => node.type !== LANE_NODE_TYPE),
    ];

    return syncLaneHierarchy(fitLanesToContent(merged));
  } catch (error) {
    console.error('Erro no auto-layout:', error);
    return nodes;
  }
}

/** Corrige sobreposições dentro de cada raia, sem deslocar nós para fora do pool. */
export function fixFlowSpacingWithinLanes(nodes: Node[], minGap = MIN_GAP): Node[] {
  const lanes = nodes.filter((node) => node.type === LANE_NODE_TYPE);
  if (lanes.length === 0) return nodes;

  const detached = detachProcessNodes(nodes);
  const nodeMap = buildNodeMap(detached);
  const positions = new Map<string, { x: number; y: number }>();

  for (const lane of lanes) {
    const laneAbs = getAbsolutePosition(lane, nodeMap);
    const laneSize = getLaneSize(lane);
    const shapes = detached
      .filter(isProcessNode)
      .filter((node) => resolveLaneForNode(node, lanes, nodeMap)?.id === lane.id)
      .map((node) => {
        const abs = getAbsolutePosition(node, nodeMap);
        return { node, x: abs.x, y: abs.y };
      })
      .sort((a, b) => a.x - b.x || a.y - b.y);

    for (let i = 0; i < shapes.length; i += 1) {
      for (let j = i + 1; j < shapes.length; j += 1) {
        const shapeA = shapes[i]!;
        const shapeB = shapes[j]!;
        const sizeA = getProcessNodeSize(shapeA.node);
        const sizeB = getProcessNodeSize(shapeB.node);
        const overlapX = shapeA.x + sizeA.width + minGap - shapeB.x;
        const overlapY = shapeA.y + sizeA.height + minGap - shapeB.y;
        if (overlapX > 0 && overlapY > 0) {
          shapeB.x += overlapX;
        }
      }
    }

    for (const shape of shapes) {
      const size = getProcessNodeSize(shape.node);
      const minX = laneAbs.x + LANE_HEADER_WIDTH + 8;
      const maxX = laneAbs.x + laneSize.width - size.width - 8;
      positions.set(shape.node.id, {
        x: Math.min(Math.max(shape.x, minX), maxX),
        y: shape.y,
      });
    }
  }

  for (const node of detached.filter(isProcessNode)) {
    if (!positions.has(node.id)) {
      const abs = getAbsolutePosition(node, nodeMap);
      positions.set(node.id, { x: abs.x, y: abs.y });
    }
  }

  const structural = detached.filter((node) => !isProcessNode(node));
  const merged = [
    ...structural.filter((node) => node.type === LANE_NODE_TYPE),
    ...applyAbsolutePositions(detached, positions).filter(isProcessNode),
    ...structural.filter((node) => node.type !== LANE_NODE_TYPE),
  ];

  return syncLaneHierarchy(fitLanesToContent(merged));
}

/** Corrige sobreposições mantendo espaçamento mínimo entre elementos (sem raias). */
export function fixFlowSpacing(nodes: Node[], minGap = MIN_GAP, minLaneWidth = MIN_LANE_WIDTH): Node[] {
  const shapes = nodes.filter(isProcessNode);
  if (shapes.length < 2) return nodes;

  const detached = detachProcessNodes(nodes);
  const nodeMap = buildNodeMap(detached);
  const absById = new Map(
    shapes.map((node) => {
      const abs = getAbsolutePosition(node, nodeMap);
      return [node.id, { x: abs.x, y: abs.y, node }];
    }),
  );

  const ordered = [...shapes];

  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const shapeA = absById.get(ordered[i]!.id);
      const shapeB = absById.get(ordered[j]!.id);
      if (!shapeA || !shapeB) continue;

      const sizeA = getProcessNodeSize(shapeA.node);
      const sizeB = getProcessNodeSize(shapeB.node);

      const overlapX = shapeA.x + sizeA.width + minGap - shapeB.x;
      const overlapY = shapeA.y + sizeA.height + minGap - shapeB.y;

      if (overlapX > 0 && overlapY > 0) {
        shapeB.x += overlapX;
        absById.set(shapeB.node.id, shapeB);
      }
    }
  }

  const positions = new Map<string, { x: number; y: number }>();
  absById.forEach((value, id) => {
    positions.set(id, { x: value.x, y: value.y });
  });

  const structural = detached.filter((node) => !isProcessNode(node));
  const merged = [
    ...structural.filter((node) => node.type === LANE_NODE_TYPE),
    ...applyAbsolutePositions(detached, positions).filter(isProcessNode),
    ...structural.filter((node) => node.type !== LANE_NODE_TYPE),
  ];

  return syncLaneHierarchy(fitLanesToContent(merged, minLaneWidth));
}

function resolveSmartColor(type: string, name: string): SmartColor | null {
  const normalized = name.toLowerCase();

  if (type === 'bpmnTask' || type === 'bpmnDocument' || type === 'bpmnData') {
    if (
      normalized.includes('reprovar') ||
      normalized.includes('cancelar') ||
      normalized.includes('rejeitar') ||
      normalized.includes('erro')
    ) {
      return { fill: '#fee2e2', stroke: '#dc2626' };
    }

    if (
      normalized.includes('enviar') ||
      normalized.includes('notificar') ||
      normalized.includes('calcular') ||
      normalized.includes('integrar') ||
      normalized.includes('sincronizar')
    ) {
      return { fill: '#dcfce7', stroke: '#16a34a' };
    }

    return { fill: '#dbeafe', stroke: '#2563eb' };
  }

  if (type === 'bpmnGateway' || type === 'bpmnParallelGateway') {
    return { fill: '#fce7f3', stroke: '#db2777' };
  }

  if (type === 'bpmnStart') {
    return { fill: '#dcfce7', stroke: '#15803d' };
  }

  if (type === 'bpmnEnd') {
    return { fill: '#fee2e2', stroke: '#b91c1c' };
  }

  return null;
}

/** Aplica cores por tipo de ação com base no nome do elemento. */
export function applySmartColors(nodes: Node[]): Node[] {
  return nodes.map((node) => {
    if (!isProcessNode(node)) return node;

    const label = String((node.data as { label?: string } | undefined)?.label ?? '');
    const color = resolveSmartColor(String(node.type ?? ''), label);
    if (!color) return node;

    return {
      ...node,
      data: {
        ...(typeof node.data === 'object' && node.data ? node.data : {}),
        fillColor: color.fill,
        accentColor: color.stroke,
      },
    };
  });
}

export type PostProcessAiFlowOptions = {
  /** Importação BPMN/XML já traz posições — não refazer layout completo. */
  fromXmlImport?: boolean;
  /** JSON/backend já posicionou nós — preserva layout, só cores e setas. */
  preserveLayout?: boolean;
  /** Mantém waypoints e rótulos do XML/importação (não re-rotear com bus horizontal). */
  preserveImportedGeometry?: boolean;
};

/** Pipeline pós-IA: reorganiza raias → cores → reparo de setas e rótulos. */
export async function postProcessAiFlow(
  nodes: Node[],
  edges: Edge[],
  options?: PostProcessAiFlowOptions,
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  if (options?.fromXmlImport) {
    return finalizeBpmnImport(nodes, edges);
  }

  const preserveGeometry = options?.preserveImportedGeometry === true;
  const hasLanes = nodes.some((node) => node.type === LANE_NODE_TYPE);
  const cleanEdges = preserveGeometry ? edges.map(normalizeFlowEdge) : cleanEdgesForRouting(edges);

  let nextNodes = nodes;

  if (hasLanes) {
    nextNodes = syncLaneHierarchy(nextNodes);
    if (!options?.preserveLayout) {
      nextNodes = organizeFlowLayout(nextNodes, cleanEdges, FLOW_AI_LAYOUT_OPTIONS);
    }
    nextNodes = fitLanesToContent(nextNodes);
  } else {
    nextNodes = await applyElkAutoLayout(nextNodes, cleanEdges);
    nextNodes = fixFlowSpacing(nextNodes, AI_MIN_GAP, FLOW_AI_LAYOUT_OPTIONS.minPoolWidth ?? 640);
  }

  nextNodes = applySmartColors(nextNodes);
  nextNodes = applyDefaultColorsToImportedNodes(nextNodes);

  const synced = syncLaneHierarchy(nextNodes);
  const { edges: finalEdges } = finalizeDiagramEdges(synced, cleanEdges, {
    preserveImportedGeometry: preserveGeometry,
  });

  return { nodes: synced, edges: finalEdges };
}
