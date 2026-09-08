import { buildFlowFromDescription } from './FlowAiDescriptionParser';
import type { FlowNodeInput } from './flowAiTypes';
import type { LogicElement, LogicFlow, ProcessLogic } from './bpmnLayoutEngine';
import { normalizeProcessLogic } from './flowAiLogicNormalize';
import { buildProcessLogicFromNaturalLanguage } from './flowNaturalLanguageParser';

const NODE_TYPE_MAP: Record<string, LogicElement['type']> = {
  bpmnStart: 'startEvent',
  bpmnEnd: 'endEvent',
  bpmnTask: 'task',
  bpmnDocument: 'task',
  bpmnData: 'task',
  bpmnGateway: 'exclusiveGateway',
  bpmnParallelGateway: 'exclusiveGateway',
};

function toLogicElement(node: FlowNodeInput, laneLabel: string): LogicElement | null {
  const type = NODE_TYPE_MAP[String(node.type ?? '')];
  if (!type) return null;
  return {
    id: node.id,
    type,
    name: String(node.label ?? '').trim() || 'Tarefa',
    lane: laneLabel,
  };
}

/** Converte descrição → lógica BPMN (NL primeiro, depois parser legado). */
export function buildProcessLogicFromDescription(description: string): ProcessLogic | null {
  const fromNatural = buildProcessLogicFromNaturalLanguage(description);
  if (fromNatural) return fromNatural;

  const built = buildFlowFromDescription(description);
  if (built.nodes.length === 0) return null;

  const laneIdToLabel = new Map(built.lanes.map((lane) => [lane.id, lane.label]));
  const defaultLane = built.lanes[0]?.label ?? built.name ?? 'Processo';

  const elements: LogicElement[] = [];
  for (const node of built.nodes) {
    const laneLabel = laneIdToLabel.get(node.laneId ?? '') ?? defaultLane;
    const el = toLogicElement(node, laneLabel);
    if (el) elements.push(el);
  }

  if (elements.length === 0) return null;

  const flows: LogicFlow[] = built.edges.map((edge) => ({
    from: edge.source,
    to: edge.target,
    ...(edge.label?.trim() ? { label: edge.label.trim() } : {}),
  }));

  return normalizeProcessLogic(
    {
      processName: built.name,
      lanes: built.lanes.map((l) => l.label),
      elements,
      flows,
    },
    description,
  );
}
