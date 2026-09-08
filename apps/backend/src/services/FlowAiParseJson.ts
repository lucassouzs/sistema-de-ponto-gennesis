import type { FlowAiResult, FlowEdgeInput, FlowLaneInput, FlowNodeInput } from './flowAiTypes';
import { normalizeFlowAiResult } from './FlowAiLayout';

const VALID_NODE_TYPES = new Set([
  'bpmnStart',
  'bpmnEnd',
  'bpmnTask',
  'bpmnGateway',
  'bpmnParallelGateway',
  'bpmnDocument',
  'bpmnData',
]);

function stripMarkdownFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function slugId(value: string, index: number): string {
  const base = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return base ? `${base}-${index}` : `node-${index}`;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function mapLanes(raw: unknown): FlowLaneInput[] {
  if (!Array.isArray(raw)) return [];

  const lanes: FlowLaneInput[] = [];
  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== 'object') continue;
    const lane = item as Record<string, unknown>;
    const label = asString(lane.label, asString(lane.name, `Raia ${index + 1}`));
    lanes.push({
      id: asString(lane.id, slugId(label, index)),
      label,
      y: 0,
      height: 200,
    });
  }
  return lanes;
}

function mapNodes(raw: unknown, lanes: FlowLaneInput[]): FlowNodeInput[] {
  if (!Array.isArray(raw)) return [];

  const defaultLaneId = lanes[0]?.id ?? 'lane-1';
  const nodes: FlowNodeInput[] = [];

  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== 'object') continue;
    const node = item as Record<string, unknown>;
    const type = asString(node.type, 'bpmnTask');
    if (!VALID_NODE_TYPES.has(type)) continue;

    const label = asString(node.label, asString(node.name, 'Tarefa'));
    nodes.push({
      id: asString(node.id, slugId(label, index)),
      type,
      label,
      x: 0,
      y: 0,
      laneId: asString(node.laneId, asString(node.lane, defaultLaneId)),
    });
  }

  return nodes;
}

function mapEdges(raw: unknown): FlowEdgeInput[] {
  if (!Array.isArray(raw)) return [];

  const edges: FlowEdgeInput[] = [];
  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== 'object') continue;
    const edge = item as Record<string, unknown>;
    const source = asString(edge.source, asString(edge.sourceRef));
    const target = asString(edge.target, asString(edge.targetRef));
    if (!source || !target) continue;

    const label = asString(edge.label, asString(edge.name));
    const mapped: FlowEdgeInput = {
      id: asString(edge.id, `e-${index + 1}`),
      source,
      target,
    };
    if (label) mapped.label = label;
    edges.push(mapped);
  }

  return edges;
}

export function isUsableFlowResult(result: FlowAiResult): boolean {
  const processNodes = result.nodes.filter((node) => node.type !== 'bpmnLane');
  if (processNodes.length < 3) return false;
  if (result.edges.length < 2) return false;
  const nodeIds = new Set(processNodes.map((node) => node.id));
  const validEdges = result.edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );
  return validEdges.length >= 2;
}

export function parseAiJsonRaw(raw: string): FlowAiResult | null {
  const cleaned = stripMarkdownFences(raw);
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const lanes = mapLanes(parsed.lanes);
    const nodes = mapNodes(parsed.nodes, lanes);
    const edges = mapEdges(parsed.edges);

    if (nodes.length === 0) return null;

    return {
      name: asString(parsed.name, 'Fluxo gerado').slice(0, 120),
      description: asString(parsed.description).slice(0, 500) || undefined,
      nodes,
      edges,
      lanes,
      reply: 'Fluxograma BPMN gerado com sucesso.',
    };
  } catch {
    return null;
  }
}

export function parseAiJson(raw: string): FlowAiResult | null {
  const result = parseAiJsonRaw(raw);
  if (!result || !isUsableFlowResult(result)) return null;
  return normalizeFlowAiResult(result);
}
