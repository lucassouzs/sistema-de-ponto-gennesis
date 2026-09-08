import type { FlowAiResult, FlowEdgeInput, FlowLaneInput, FlowNodeInput } from './flowAiTypes';
import {
  buildFlowFromDescription,
  extractProcessName,
  isCompleteEnough,
} from './FlowAiDescriptionParser';

export const AI_POOL = {
  poolX: 40,
  laneWidth: 1800,
  laneHeight: 200,
  minLaneHeight: 200,
  minPoolWidth: 1800,
  headerHeight: 48,
  nodeStartX: 96,
  nodeGapX: 120,
  minVerticalGap: 50,
  maxNodesPerRow: 5,
  rowHeight: 114,
  lanePaddingTop: 24,
} as const;

function nodeHeight(type: string): number {
  switch (type) {
    case 'bpmnStart':
    case 'bpmnEnd':
      return 72;
    case 'bpmnGateway':
    case 'bpmnParallelGateway':
      return 80;
    default:
      return 64;
  }
}

function nodeWidth(type: string): number {
  switch (type) {
    case 'bpmnStart':
    case 'bpmnEnd':
      return 48;
    case 'bpmnGateway':
    case 'bpmnParallelGateway':
      return 56;
    default:
      return 140;
  }
}

function truncateLabel(label: string, max = 38): string {
  const clean = String(label || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function laneRowCount(nodeCount: number): number {
  return Math.max(1, Math.ceil(nodeCount / AI_POOL.maxNodesPerRow));
}

function computeLaneHeight(rowCount: number): number {
  const computed = AI_POOL.lanePaddingTop + rowCount * AI_POOL.rowHeight + 24;
  return Math.max(AI_POOL.minLaneHeight, computed);
}

function defaultLabelForType(type: string, fallback = ''): string {
  const trimmed = String(fallback ?? '').trim();
  if (trimmed) return trimmed;
  switch (type) {
    case 'bpmnStart':
      return 'Início';
    case 'bpmnEnd':
      return 'Fim';
    case 'bpmnGateway':
      return 'Decisão?';
    case 'bpmnParallelGateway':
      return 'Paralelo?';
    case 'bpmnDocument':
      return 'Documento';
    case 'bpmnData':
      return 'Dados';
    default:
      return 'Executar tarefa';
  }
}

function ensureNodeLabel(node: FlowNodeInput): FlowNodeInput {
  const label = truncateLabel(defaultLabelForType(node.type, node.label));
  return { ...node, label };
}

function inferGatewayBranchLabel(
  targetLabel: string,
  index: number,
  defaults: string[],
): string {
  const normalized = targetLabel.toLowerCase();
  if (
    normalized.includes('casa') ||
    normalized.includes('ficar') ||
    normalized.includes('cancel') ||
    normalized.includes('reprova') ||
    normalized.includes('rejeit') ||
    normalized.includes('não vou') ||
    normalized.includes('nao vou')
  ) {
    return 'Não';
  }
  if (
    normalized.includes('trabalho') ||
    normalized.includes('chegar') ||
    normalized.includes('ônibus') ||
    normalized.includes('onibus') ||
    normalized.includes('aprova') ||
    normalized.includes('seguir')
  ) {
    return 'Sim';
  }
  return defaults[index] ?? `Saída ${index + 1}`;
}

function ensureGatewayEdgeLabels(nodes: FlowNodeInput[], edges: FlowEdgeInput[]): FlowEdgeInput[] {
  const gatewayIds = new Set(
    nodes
      .filter((node) => node.type === 'bpmnGateway' || node.type === 'bpmnParallelGateway')
      .map((node) => node.id),
  );
  if (gatewayIds.size === 0) return edges;

  const nodeLabelById = new Map(nodes.map((node) => [node.id, String(node.label ?? '').trim()]));
  const outgoingByGateway = new Map<string, FlowEdgeInput[]>();
  for (const edge of edges) {
    if (!gatewayIds.has(edge.source)) continue;
    outgoingByGateway.set(edge.source, [...(outgoingByGateway.get(edge.source) ?? []), edge]);
  }

  const defaultLabels = ['Sim', 'Não', 'Opção A', 'Opção B', 'Opção C'];

  return edges.map((edge) => {
    if (!gatewayIds.has(edge.source) || String(edge.label ?? '').trim()) return edge;
    const outgoing = outgoingByGateway.get(edge.source) ?? [];
    const index = outgoing.findIndex((item) => item.id === edge.id);
    const targetLabel = nodeLabelById.get(edge.target) ?? '';
    return {
      ...edge,
      label: inferGatewayBranchLabel(targetLabel, index, defaultLabels),
    };
  });
}

function centerYInLane(laneY: number, type: string, row: number): number {
  const rowBase = laneY + AI_POOL.lanePaddingTop + row * AI_POOL.rowHeight;
  const nh = nodeHeight(type);
  return rowBase + Math.max(8, (AI_POOL.rowHeight - nh) / 2);
}

function ensureLanes(result: FlowAiResult): FlowLaneInput[] {
  if (result.lanes.length > 0) {
    return result.lanes.map((lane) => ({
      ...lane,
      label: lane.label || formatLaneLabel(lane.id),
    }));
  }

  const laneIds = new Map<string, string>();
  for (const node of result.nodes) {
    if (node.type === 'bpmnLane') continue;
    const id = node.laneId ?? 'lane-1';
    if (!laneIds.has(id)) {
      laneIds.set(id, node.laneId ? id.replace(/^lane-?/i, 'Setor ') : 'Processo');
    }
  }

  if (laneIds.size === 0) {
    return [{ id: 'lane-1', label: 'Processo', y: AI_POOL.headerHeight, height: AI_POOL.laneHeight }];
  }

  return Array.from(laneIds.keys()).map((id) => ({
    id,
    label: formatLaneLabel(id),
    y: AI_POOL.headerHeight,
    height: AI_POOL.laneHeight,
  }));
}

function formatLaneLabel(laneId: string): string {
  if (laneId.startsWith('lane-')) {
    return (
      laneId
        .replace(/^lane-?/i, '')
        .replace(/-/g, ' ')
        .trim() || 'Processo'
    );
  }
  return laneId;
}

function orderNodesInLane(
  laneId: string,
  nodes: FlowNodeInput[],
  edges: FlowEdgeInput[],
): FlowNodeInput[] {
  const inLane = nodes.filter((n) => (n.laneId ?? 'lane-1') === laneId);
  if (inLane.length <= 1) return inLane;

  const ids = new Set(inLane.map((n) => n.id));
  const outgoing = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();

  for (const id of ids) {
    outgoing.set(id, []);
    incomingCount.set(id, 0);
  }

  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    outgoing.get(edge.source)?.push(edge.target);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  const starts = inLane.filter(
    (n) => n.type === 'bpmnStart' || (incomingCount.get(n.id) ?? 0) === 0,
  );
  const queue = [...starts];
  const visited = new Set<string>();
  const ordered: FlowNodeInput[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id)) continue;
    visited.add(current.id);
    ordered.push(current);
    for (const nextId of outgoing.get(current.id) ?? []) {
      const next = inLane.find((n) => n.id === nextId);
      if (next && !visited.has(next.id)) queue.push(next);
    }
  }

  for (const node of inLane) {
    if (!visited.has(node.id)) ordered.push(node);
  }

  return ordered;
}

export function normalizeFlowAiResult(result: FlowAiResult): FlowAiResult {
  const processNodes = result.nodes
    .filter((n) => n.type !== 'bpmnLane' && !n.id.startsWith('ai-panel-'))
    .map(ensureNodeLabel);

  const lanes = ensureLanes({ ...result, nodes: processNodes });
  const edges = ensureGatewayEdgeLabels(processNodes, result.edges ?? []);

  const relativeXById = new Map<string, number>();
  let maxContentRight: number = AI_POOL.nodeStartX;

  lanes.forEach((lane) => {
    const ordered = orderNodesInLane(lane.id, processNodes, edges);
    let laneCursor: number = AI_POOL.nodeStartX;

    ordered.forEach((node) => {
      let x: number = laneCursor;
      for (const edge of edges) {
        if (edge.target !== node.id) continue;
        const sourceX = relativeXById.get(edge.source);
        if (sourceX === undefined) continue;
        const sourceNode = processNodes.find((item) => item.id === edge.source);
        const sourceWidth = sourceNode ? nodeWidth(sourceNode.type) : 140;
        x = Math.max(x, sourceX + sourceWidth + AI_POOL.nodeGapX);
      }

      relativeXById.set(node.id, x);
      const width = node.type === 'bpmnStart' || node.type === 'bpmnEnd' ? 48 : node.type.includes('Gateway') ? 56 : 140;
      laneCursor = x + width + AI_POOL.nodeGapX;
      maxContentRight = Math.max(maxContentRight, x + width);
    });
  });

  const laneIndexById = new Map(lanes.map((lane, index) => [lane.id, index]));
  for (const edge of edges) {
    const source = processNodes.find((node) => node.id === edge.source);
    const target = processNodes.find((node) => node.id === edge.target);
    if (!source || !target || !source.laneId || !target.laneId || source.laneId === target.laneId) {
      continue;
    }

    const srcIdx = laneIndexById.get(source.laneId) ?? 0;
    const tgtIdx = laneIndexById.get(target.laneId) ?? 0;
    if (srcIdx === tgtIdx) continue;

    const srcX = relativeXById.get(source.id);
    if (srcX === undefined) continue;

    const srcWidth = nodeWidth(source.type);
    const tgtWidth = nodeWidth(target.type);
    const alignedX = Math.round(srcX + srcWidth / 2 - tgtWidth / 2);
    const prev = relativeXById.get(target.id);
    relativeXById.set(target.id, prev === undefined ? alignedX : Math.max(prev, alignedX));
    maxContentRight = Math.max(maxContentRight, (relativeXById.get(target.id) ?? 0) + tgtWidth);
  }

  const poolWidth = Math.max(AI_POOL.minPoolWidth, maxContentRight + 40);
  const positioned: FlowNodeInput[] = [];
  let currentY = AI_POOL.headerHeight;

  lanes.forEach((lane) => {
    const ordered = orderNodesInLane(lane.id, processNodes, edges);
    const laneHeight =
      ordered.length > 0 ? computeLaneHeight(laneRowCount(ordered.length)) : AI_POOL.laneHeight;

    lane.y = currentY;
    lane.height = laneHeight;

    ordered.forEach((node) => {
      const x = relativeXById.get(node.id) ?? AI_POOL.nodeStartX;
      positioned.push({
        ...node,
        laneId: lane.id,
        x,
        y: centerYInLane(currentY, node.type, 0),
      });
    });

    currentY += laneHeight;
  });

  const normalizedLanes = lanes.map((lane) => ({
    ...lane,
    height: Math.max(AI_POOL.minLaneHeight, lane.height ?? AI_POOL.laneHeight),
    width: poolWidth,
  }));

  return {
    ...result,
    lanes: normalizedLanes,
    nodes: positioned,
    edges,
    description: result.description ? truncateLabel(result.description, 280) : undefined,
  };
}

export function buildFallbackFromSteps(description: string): FlowAiResult {
  if (isEquipmentPurchaseDescription(description)) {
    return buildEquipmentPurchaseFlow(extractProcessName(description));
  }

  const built = buildFlowFromDescription(description);
  if (built.nodes.length === 0) {
    built.nodes.push(
      { id: 'start', type: 'bpmnStart', label: 'Início', x: 0, y: 0, laneId: built.lanes[0]?.id ?? 'lane-1' },
      { id: 't-1', type: 'bpmnTask', label: 'Executar processo', x: 0, y: 0, laneId: built.lanes[0]?.id ?? 'lane-1' },
      { id: 'end-main', type: 'bpmnEnd', label: 'Fim', x: 0, y: 0, laneId: built.lanes[0]?.id ?? 'lane-1' },
    );
    built.edges.push(
      { id: 'e-1', source: 'start', target: 't-1' },
      { id: 'e-2', source: 't-1', target: 'end-main' },
    );
    if (built.lanes.length === 0) {
      built.lanes.push({ id: 'lane-1', label: 'Processo', y: 0, height: 200 });
    }
  }

  return normalizeFlowAiResult({
    name: built.name,
    description: description.slice(0, 500),
    nodes: built.nodes,
    edges: built.edges,
    lanes: built.lanes,
    reply: 'Fluxograma BPMN gerado com sucesso.',
  });
}

/** Fluxo determinístico — compra de equipamento (9 passos por setor). */
export function buildEquipmentPurchaseFlow(name = 'Processo de Compra de Equipamento'): FlowAiResult {
  const lanes: FlowLaneInput[] = [
    { id: 'lane-colaborador', label: 'Colaborador', y: 0, height: 200 },
    { id: 'lane-gestor', label: 'Gestor', y: 0, height: 200 },
    { id: 'lane-ti', label: 'TI', y: 0, height: 200 },
    { id: 'lane-compras', label: 'Compras', y: 0, height: 200 },
    { id: 'lane-financeiro', label: 'Financeiro', y: 0, height: 200 },
  ];

  const nodes: FlowNodeInput[] = [
    { id: 'start', type: 'bpmnStart', label: 'Início', laneId: 'lane-colaborador', x: 0, y: 0 },
    {
      id: 't-solicitar',
      type: 'bpmnTask',
      label: 'Solicitar compra de equipamento',
      laneId: 'lane-colaborador',
      x: 0,
      y: 0,
    },
    { id: 'g-gestor', type: 'bpmnGateway', label: 'Gestor aprova?', laneId: 'lane-gestor', x: 0, y: 0 },
    {
      id: 't-reprovar-gestor',
      type: 'bpmnTask',
      label: 'Reprovar solicitação',
      laneId: 'lane-gestor',
      x: 0,
      y: 0,
    },
    {
      id: 'end-reprov-gestor',
      type: 'bpmnEnd',
      label: 'Fim - Reprovado pelo Gestor',
      laneId: 'lane-gestor',
      x: 0,
      y: 0,
    },
    {
      id: 'g-ti-estoque',
      type: 'bpmnGateway',
      label: 'Equipamento disponível em estoque?',
      laneId: 'lane-ti',
      x: 0,
      y: 0,
    },
    {
      id: 't-separar',
      type: 'bpmnTask',
      label: 'Separar equipamento do estoque',
      laneId: 'lane-ti',
      x: 0,
      y: 0,
    },
    {
      id: 't-configurar',
      type: 'bpmnTask',
      label: 'Configurar equipamento',
      laneId: 'lane-ti',
      x: 0,
      y: 0,
    },
    {
      id: 't-entregar',
      type: 'bpmnTask',
      label: 'Entregar equipamento ao colaborador',
      laneId: 'lane-ti',
      x: 0,
      y: 0,
    },
    {
      id: 'end-ok',
      type: 'bpmnEnd',
      label: 'Fim - Equipamento entregue',
      laneId: 'lane-ti',
      x: 0,
      y: 0,
    },
    {
      id: 't-cotar',
      type: 'bpmnTask',
      label: 'Cotar fornecedores',
      laneId: 'lane-compras',
      x: 0,
      y: 0,
    },
    {
      id: 't-receber',
      type: 'bpmnTask',
      label: 'Receber equipamento',
      laneId: 'lane-compras',
      x: 0,
      y: 0,
    },
    {
      id: 'g-financeiro',
      type: 'bpmnGateway',
      label: 'Financeiro aprova orçamento?',
      laneId: 'lane-financeiro',
      x: 0,
      y: 0,
    },
    {
      id: 't-reprovar-fin',
      type: 'bpmnTask',
      label: 'Reprovar orçamento',
      laneId: 'lane-financeiro',
      x: 0,
      y: 0,
    },
    {
      id: 'end-reprov-fin',
      type: 'bpmnEnd',
      label: 'Fim - Reprovado pelo Financeiro',
      laneId: 'lane-financeiro',
      x: 0,
      y: 0,
    },
    {
      id: 't-gerar-pedido',
      type: 'bpmnTask',
      label: 'Gerar pedido de compra',
      laneId: 'lane-financeiro',
      x: 0,
      y: 0,
    },
  ];

  const edges: FlowEdgeInput[] = [
    { id: 'e1', source: 'start', target: 't-solicitar' },
    { id: 'e2', source: 't-solicitar', target: 'g-gestor' },
    { id: 'e3', source: 'g-gestor', target: 't-reprovar-gestor', label: 'Não' },
    { id: 'e4', source: 't-reprovar-gestor', target: 'end-reprov-gestor' },
    { id: 'e5', source: 'g-gestor', target: 'g-ti-estoque', label: 'Sim' },
    { id: 'e6', source: 'g-ti-estoque', target: 't-separar', label: 'Sim' },
    { id: 'e7', source: 'g-ti-estoque', target: 't-cotar', label: 'Não' },
    { id: 'e8', source: 't-separar', target: 't-configurar' },
    { id: 'e9', source: 't-cotar', target: 'g-financeiro' },
    { id: 'e10', source: 'g-financeiro', target: 't-reprovar-fin', label: 'Não' },
    { id: 'e11', source: 't-reprovar-fin', target: 'end-reprov-fin' },
    { id: 'e12', source: 'g-financeiro', target: 't-gerar-pedido', label: 'Sim' },
    { id: 'e13', source: 't-gerar-pedido', target: 't-receber' },
    { id: 'e14', source: 't-receber', target: 't-configurar' },
    { id: 'e15', source: 't-configurar', target: 't-entregar' },
    { id: 'e16', source: 't-entregar', target: 'end-ok' },
  ];

  return normalizeFlowAiResult({
    name,
    nodes,
    edges,
    lanes,
    reply: 'Fluxograma BPMN gerado com sucesso.',
  });
}

function isEquipmentPurchaseDescription(description: string): boolean {
  const lower = description.toLowerCase();
  return (
    (/compra/.test(lower) && /equipamento/.test(lower)) ||
    (/solicita/.test(lower) && /gestor/.test(lower) && /ti/.test(lower) && /compras/.test(lower))
  );
}

export { isCompleteEnough, inferRoleFromStep, normalizeRoleName } from './FlowAiDescriptionParser';
