import type { LogicElement, LogicFlow, ProcessLogic } from './bpmnLayoutEngine';
import { normalizeProcessLogic } from './flowAiLogicNormalize';

const VALID_ELEMENT_TYPES = new Set<LogicElement['type']>([
  'startEvent',
  'endEvent',
  'task',
  'exclusiveGateway',
]);

function stripMarkdownFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeElementType(value: unknown): LogicElement['type'] | null {
  const type = asString(value);
  if (VALID_ELEMENT_TYPES.has(type as LogicElement['type'])) {
    return type as LogicElement['type'];
  }
  return null;
}

function mapElements(raw: unknown, lanes: string[]): LogicElement[] {
  if (!Array.isArray(raw)) return [];

  const defaultLane = lanes[0] ?? 'Processo';
  const laneSet = new Set(lanes);
  const elements: LogicElement[] = [];

  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const type = normalizeElementType(record.type);
    if (!type) continue;

    const id = asString(record.id, `el_${index + 1}`);
    const rawName = asString(record.name, type === 'startEvent' ? 'Início' : type === 'endEvent' ? 'Fim' : 'Tarefa');
    const name =
      type === 'exclusiveGateway' && rawName.length > 72
        ? 'Decisão?'
        : rawName.length > 56
          ? `${rawName.slice(0, 55)}…`
          : rawName;
    let lane = asString(record.lane, defaultLane);
    if (!laneSet.has(lane)) lane = defaultLane;

    elements.push({ id, type, name, lane });
  }

  return elements;
}

function mapFlows(raw: unknown): LogicFlow[] {
  if (!Array.isArray(raw)) return [];

  const flows: LogicFlow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const from = asString(record.from, asString(record.source));
    const to = asString(record.to, asString(record.target));
    if (!from || !to) continue;

    const label = asString(record.label, asString(record.name));
    flows.push(label ? { from, to, label } : { from, to });
  }

  return flows;
}

function mapLanes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  const lanes: string[] = [];
  for (const [index, item] of raw.entries()) {
    if (typeof item === 'string') {
      const label = item.trim();
      if (label) lanes.push(label);
      continue;
    }
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const label = asString(record.label, asString(record.name, `Raia ${index + 1}`));
      if (label) lanes.push(label);
    }
  }

  return lanes;
}

export function isUsableProcessLogic(logic: ProcessLogic): boolean {
  if (logic.elements.length < 2) return false;
  if (logic.flows.length < 1) return false;
  if (logic.lanes.length === 0) return false;

  const ids = new Set(logic.elements.map((el) => el.id));
  const validFlows = logic.flows.filter((flow) => ids.has(flow.from) && ids.has(flow.to));
  return validFlows.length >= 1;
}

/** Parseia o JSON de lógica (sem coordenadas) retornado pela IA. */
export function parseProcessLogicRaw(raw: string): ProcessLogic | null {
  const cleaned = stripMarkdownFences(raw);
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const lanes = mapLanes(parsed.lanes);
    const elements = mapElements(parsed.elements ?? parsed.nodes, lanes.length > 0 ? lanes : ['Processo']);
    const flows = mapFlows(parsed.flows ?? parsed.edges);

    if (elements.length === 0) return null;

    const resolvedLanes =
      lanes.length > 0
        ? lanes
        : Array.from(new Set(elements.map((el) => el.lane).filter(Boolean)));

    const logic: ProcessLogic = {
      processName: asString(parsed.processName, asString(parsed.name, 'Fluxo gerado')).slice(0, 120),
      lanes: resolvedLanes.length > 0 ? resolvedLanes : ['Processo'],
      elements,
      flows,
    };

    if (!isUsableProcessLogic(logic)) return null;
    return logic;
  } catch {
    return null;
  }
}
