import type { Edge, Node } from '@xyflow/react';
import type { FlowAiResult, FlowAiEdge, FlowAiNode, FlowAiLane } from './flowTypes';
import { buildFlowEdge, connectableNodeIds, hasDefinedEdgeHandles, inferMissingEdgeHandles, normalizeFlowEdge, pinDefinedEdgeHandles, sanitizeFlowEdges } from './flowEdge';
import { LANE_DEFAULT_HEIGHT } from '@/components/flow/BpmnNodes';
import { placeImportedEdgeLabels } from './flowGatewayLabels';
import { resolveNodeLabel, getDefaultLabelForType } from './flowNodeDefaults';
import { buildNodeMap, getAbsolutePosition, syncLaneHierarchy } from './flowLaneHierarchy';
import { isStructuralFlowNode } from './flowPoolHierarchy';

function findLaneIdForNode(node: FlowAiNode, lanes: FlowAiLane[]): string {
  if (node.laneId) return node.laneId;
  const lane = lanes.find((l) => node.y >= l.y && node.y < l.y + l.height);
  return lane?.id ?? `lane-y-${Math.round(node.y / 120)}`;
}

export function inferFlowEdgesFromLayout(
  nodes: FlowAiNode[],
  lanes: FlowAiLane[] = [],
): FlowAiEdge[] {
  if (nodes.length < 2) return [];

  const laneOrder =
    lanes.length > 0
      ? [...lanes].sort((a, b) => a.y - b.y)
      : [{ id: 'lane-default', label: 'Processo', y: 0, height: 9999 }];

  const nodesByLane = new Map<string, FlowAiNode[]>();
  for (const node of nodes) {
    const laneId = findLaneIdForNode(node, laneOrder);
    const list = nodesByLane.get(laneId) ?? [];
    list.push(node);
    nodesByLane.set(laneId, list);
  }

  const edges: FlowAiEdge[] = [];
  const edgeKeys = new Set<string>();

  const addEdge = (source: string, target: string) => {
    if (source === target) return;
    const key = `${source}->${target}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ id: `inferred-${source}-${target}`, source, target });
  };

  for (const lane of laneOrder) {
    const laneNodes = [...(nodesByLane.get(lane.id) ?? [])].sort((a, b) => a.x - b.x || a.y - b.y);
    for (let i = 0; i < laneNodes.length - 1; i += 1) {
      addEdge(laneNodes[i].id, laneNodes[i + 1].id);
    }
  }

  for (let i = 0; i < laneOrder.length - 1; i += 1) {
    const current = [...(nodesByLane.get(laneOrder[i].id) ?? [])].sort((a, b) => a.x - b.x);
    const next = [...(nodesByLane.get(laneOrder[i + 1].id) ?? [])].sort((a, b) => a.x - b.x);
    if (current.length > 0 && next.length > 0) {
      addEdge(current[current.length - 1].id, next[0].id);
    }
  }

  return edges;
}

function inferFlowEdgesFromCanvasNodes(nodes: Node[]): Edge[] {
  const lanes = nodes.filter((n) => n.type === 'bpmnLane');
  const processNodes = nodes.filter((n) => !isStructuralFlowNode(String(n.type ?? '')) && String(n.type ?? '') !== 'bpmnText');
  if (processNodes.length < 2) return [];

  const aiNodes: FlowAiNode[] = processNodes.map((n) => {
    const nodeMap = buildNodeMap(nodes);
    const abs = getAbsolutePosition(n, nodeMap);
    return {
      id: n.id,
      type: String(n.type ?? 'bpmnTask'),
      label: String((n.data as { label?: string })?.label ?? ''),
      x: abs.x,
      y: abs.y,
      laneId: assignCanvasNodeLaneId(n, lanes, nodeMap),
    };
  });

  const laneInputs: FlowAiLane[] = lanes.map((lane) => ({
    id: lane.id,
    label: String((lane.data as { label?: string })?.label ?? 'Raia'),
    y: lane.position.y,
    height: Number((lane.style as { height?: number })?.height ?? 160),
  }));

  return inferFlowEdgesFromLayout(aiNodes, laneInputs).map((edge) =>
    buildFlowEdge({ id: edge.id, source: edge.source, target: edge.target, label: edge.label || undefined }),
  );
}

function assignCanvasNodeLaneId(node: Node, lanes: Node[], nodeMap: Map<string, Node>): string | null {
  if (node.parentId && lanes.some((lane) => lane.id === node.parentId)) {
    return node.parentId;
  }

  const abs = getAbsolutePosition(node, nodeMap);
  const centerY = abs.y + 32;
  for (const lane of lanes) {
    const height = Number((lane.style as { height?: number })?.height ?? 160);
    const width = Number((lane.style as { width?: number })?.width ?? 1800);
    if (
      abs.x >= lane.position.x &&
      abs.x <= lane.position.x + width &&
      centerY >= lane.position.y &&
      centerY <= lane.position.y + height
    ) {
      return lane.id;
    }
  }
  return null;
}

export function ensureFlowEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const repaired = repairFlowEdges(nodes, edges);
  if (repaired.length > 0) return repaired;
  return inferFlowEdgesFromCanvasNodes(nodes);
}

/** Importação BPMN: preserva só as conexões do arquivo (sem inferir setas extras). */
export function mergeImportedFlowEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const repaired = repairFlowEdges(nodes, edges).map(normalizeFlowEdge);
  if (repaired.length === 0) return [];
  return placeImportedEdgeLabels(nodes, repaired);
}

function repairAiEdges(nodes: FlowAiResult['nodes'], edges: FlowAiEdge[]): FlowAiEdge[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const labelToId = new Map<string, string>();

  for (const node of nodes) {
    const label = node.label.trim().toLowerCase();
    if (label) labelToId.set(label, node.id);
  }

  const resolveRef = (ref: string): string => {
    if (nodeIds.has(ref)) return ref;
    const trimmed = String(ref).trim();
    const byLabel = labelToId.get(trimmed.toLowerCase());
    if (byLabel) return byLabel;
    const partial = nodes.find(
      (n) => n.id === trimmed || n.id.endsWith(trimmed) || trimmed.endsWith(n.id),
    );
    return partial?.id ?? ref;
  };

  return edges
    .map((edge) => ({
      ...edge,
      source: resolveRef(edge.source),
      target: resolveRef(edge.target),
    }))
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
}

export function repairFlowEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const processNodes = nodes.filter((n) => !isStructuralFlowNode(String(n.type ?? '')) && String(n.type ?? '') !== 'bpmnText');
  const nodeIds = connectableNodeIds(nodes);
  const labelToId = new Map<string, string>();

  for (const node of processNodes) {
    const label = String((node.data as { label?: string })?.label ?? '').trim().toLowerCase();
    if (label) labelToId.set(label, node.id);
  }

  const resolveRef = (ref: string): string => {
    if (nodeIds.has(ref)) return ref;
    const trimmed = String(ref).trim();
    const byLabel = labelToId.get(trimmed.toLowerCase());
    if (byLabel) return byLabel;
    const partial = processNodes.find(
      (n) => n.id === trimmed || n.id.endsWith(trimmed) || trimmed.endsWith(n.id),
    );
    return partial?.id ?? ref;
  };

  return edges
    .map((edge) => {
      const source = resolveRef(edge.source);
      const target = resolveRef(edge.target);
      if (source === edge.source && target === edge.target) return edge;
      return { ...edge, source, target };
    })
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => (hasDefinedEdgeHandles(edge) ? edge : inferMissingEdgeHandles(edge, nodes)));
}

const GATEWAY_NODE_TYPES = new Set(['bpmnGateway', 'bpmnParallelGateway']);
const TASK_NODE_TYPES = new Set(['bpmnTask', 'bpmnDocument', 'bpmnData']);

/** Conecta tarefas sem saída ao evento de fim mais provável (comum em diagramas gerados pela IA). */
export function inferMissingTaskOutputs(nodes: Node[], edges: Edge[]): Edge[] {
  const processNodes = nodes.filter(
    (n) => !isStructuralFlowNode(String(n.type ?? '')) && String(n.type ?? '') !== 'bpmnText',
  );
  const endNodes = processNodes.filter((n) => n.type === 'bpmnEnd');
  if (endNodes.length === 0) return edges;

  const outgoing = new Set(edges.map((edge) => edge.source));
  const keys = new Set(edges.map((edge) => `${edge.source}\0${edge.target}`));
  const nodeMap = buildNodeMap(nodes);
  const extra: Edge[] = [];

  for (const node of processNodes) {
    const type = String(node.type ?? '');
    if (type === 'bpmnStart' || type === 'bpmnEnd' || GATEWAY_NODE_TYPES.has(type)) continue;
    if (!TASK_NODE_TYPES.has(type)) continue;
    if (outgoing.has(node.id)) continue;

    const abs = getAbsolutePosition(node, nodeMap);
    const label = resolveNodeLabel(node).toLowerCase();

    let candidates = endNodes.map((end) => ({
      end,
      abs: getAbsolutePosition(end, nodeMap),
      label: resolveNodeLabel(end).toLowerCase(),
    }));

    if (/entreg|configur|finaliz|conclu/.test(label)) {
      const deliveryEnds = candidates.filter(
        (item) => /entrega|fim|final|conclu|direta/.test(item.label) && item.abs.x >= abs.x - 120,
      );
      if (deliveryEnds.length > 0) candidates = deliveryEnds;
    }

    candidates.sort((a, b) => {
      const dy = Math.abs(a.abs.y - abs.y) - Math.abs(b.abs.y - abs.y);
      if (Math.abs(dy) > 24) return dy;
      return a.abs.x - b.abs.x;
    });

    const target =
      candidates.find((item) => item.abs.x >= abs.x - 80)?.end ?? candidates[0]?.end;
    if (!target) continue;

    const key = `${node.id}\0${target.id}`;
    if (keys.has(key)) continue;
    keys.add(key);
    extra.push(
      buildFlowEdge({
        id: `inferred-out-${node.id}-${target.id}`,
        source: node.id,
        target: target.id,
      }),
    );
    outgoing.add(node.id);
  }

  return extra.length > 0 ? [...edges, ...extra] : edges;
}

export function aiResultToFlowElements(result: FlowAiResult): { nodes: Node[]; edges: Edge[] } {
  const processOnly = result.nodes.filter((n) => !n.id.startsWith('ai-panel-'));
  const maxNodeX = processOnly.reduce((max, node) => Math.max(max, node.x + 180), 0);
  const defaultLaneWidth = Math.max(2000, maxNodeX + 48);

  const laneNodes: Node[] = (result.lanes ?? []).map((lane) => ({
    id: lane.id,
    type: 'bpmnLane',
    position: { x: 40, y: lane.y },
    data: { label: lane.label },
    style: {
      width: Math.max(2000, defaultLaneWidth),
      height: Math.max(200, lane.height ?? LANE_DEFAULT_HEIGHT),
    },
    draggable: true,
    selectable: true,
    zIndex: 0,
  }));

  const laneById = new Map(laneNodes.map((lane) => [lane.id, lane]));

  const processNodes: Node[] = processOnly.map((node) => {
    const lane = node.laneId ? laneById.get(node.laneId) : null;
    const base = {
      id: node.id,
      type: node.type,
      data: {
        label: node.label?.trim() || getDefaultLabelForType(node.type),
      },
      zIndex: node.id.startsWith('ai-panel-') ? 2 : 1,
    };

    if (lane) {
      return {
        ...base,
        parentId: lane.id,
        position: {
          // Backend envia x relativo à raia e y absoluto no canvas.
          x: node.x,
          y: node.y - lane.position.y,
        },
      };
    }

    return {
      ...base,
      position: { x: node.x, y: node.y },
    };
  });

  const edges: Edge[] = (() => {
    const repaired = repairAiEdges(processOnly, result.edges);
    const source = repaired.length > 0 ? repaired : inferFlowEdgesFromLayout(processOnly, result.lanes ?? []);
    return source.map((edge) =>
      buildFlowEdge({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label || undefined,
      }),
    );
  })();

  return { nodes: syncLaneHierarchy([...laneNodes, ...processNodes]), edges };
}

export function parseStoredFlow(rawNodes: unknown, rawEdges: unknown): { nodes: Node[]; edges: Edge[] } {
  const nodes = syncLaneHierarchy(Array.isArray(rawNodes) ? (rawNodes as Node[]) : []);
  const rawEdgeList = Array.isArray(rawEdges) ? (rawEdges as Edge[]).map(normalizeFlowEdge) : [];
  const repaired = repairFlowEdges(nodes, rawEdgeList);
  const edges = pinDefinedEdgeHandles(sanitizeFlowEdges(nodes, repaired));
  return { nodes, edges };
}
