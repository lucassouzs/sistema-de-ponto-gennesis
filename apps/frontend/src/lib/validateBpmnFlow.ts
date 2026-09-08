import type { Edge, Node } from '@xyflow/react';
import type { FlowAiEdge, FlowAiNode, FlowAiResult } from './flowTypes';
import { inferFlowEdgesFromLayout } from './flowCanvas';

export type FlowValidationResult = {
  errors: string[];
  warnings: string[];
};

const GATEWAY_TYPES = new Set(['bpmnGateway', 'bpmnParallelGateway']);
const TASK_TYPES = new Set(['bpmnTask', 'bpmnDocument', 'bpmnData']);
const STRUCTURAL_SKIP = new Set(['bpmnLane', 'bpmnPool', 'bpmnText']);

type FlowElement = {
  id: string;
  type?: string;
  label?: string;
  data?: { label?: string };
};

function elementLabel(element: FlowElement): string {
  const label = element.label?.trim() || element.data?.label?.trim();
  return label || element.id;
}

function isProcessShape(type: string | undefined): boolean {
  if (!type) return false;
  if (STRUCTURAL_SKIP.has(type)) return false;
  if (type.startsWith('ai-panel-')) return false;
  return true;
}

function buildAdjacency(edges: Array<{ source: string; target: string }>) {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const edge of edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  }

  return { outgoing, incoming };
}

function repairAiEdgesForValidation(nodes: FlowAiNode[], edges: FlowAiEdge[]): FlowAiEdge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
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
      (node) => node.id === trimmed || node.id.endsWith(trimmed) || trimmed.endsWith(node.id),
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

function resolveEdgesForValidation(result: FlowAiResult): FlowAiEdge[] {
  const processNodes = result.nodes.filter(
    (node) => node.type !== 'bpmnLane' && !node.id.startsWith('ai-panel-'),
  );
  const repaired = repairAiEdgesForValidation(processNodes, result.edges);
  if (repaired.length > 0) return repaired;
  return inferFlowEdgesFromLayout(processNodes, result.lanes ?? []);
}

export function validateBpmnFlow(
  nodes: FlowElement[],
  edges: Array<{ source: string; target: string }>,
): FlowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const processNodes = nodes.filter((node) => isProcessShape(String(node.type ?? '')));
  const { outgoing, incoming } = buildAdjacency(edges);

  const startEvents = processNodes.filter((node) => node.type === 'bpmnStart');
  if (startEvents.length === 0) {
    errors.push('Nenhum evento de início encontrado no diagrama.');
  }

  const endEvents = processNodes.filter((node) => node.type === 'bpmnEnd');
  if (endEvents.length === 0) {
    errors.push('Nenhum evento de fim encontrado no diagrama.');
  }

  const gateways = processNodes.filter((node) => GATEWAY_TYPES.has(String(node.type)));
  for (const gateway of gateways) {
    const outs = outgoing.get(gateway.id) ?? [];
    if (outs.length < 2) {
      warnings.push(
        `Gateway "${elementLabel(gateway)}" tem menos de 2 saídas.`,
      );
    }
  }

  for (const shape of processNodes) {
    const type = String(shape.type ?? '');
    if (type === 'bpmnStart' || type === 'bpmnEnd') continue;

    const ins = incoming.get(shape.id) ?? [];
    const outs = outgoing.get(shape.id) ?? [];
    if (ins.length === 0 && outs.length === 0) {
      warnings.push(`Elemento "${elementLabel(shape)}" está desconectado.`);
    }
  }

  const tasks = processNodes.filter((node) => TASK_TYPES.has(String(node.type)));
  const hasStart = startEvents.length > 0;
  const hasEnd = endEvents.length > 0;
  if (hasStart && hasEnd && tasks.length === 0 && processNodes.length <= 3) {
    errors.push('Nenhuma tarefa intermediária — o diagrama só tem início e fim.');
  }

  for (const task of tasks) {
    const outs = outgoing.get(task.id) ?? [];
    if (outs.length === 0) {
      warnings.push(`Tarefa "${elementLabel(task)}" não tem saída.`);
    }
  }

  return { errors, warnings };
}

export function validateBpmnFlowFromAi(result: FlowAiResult): FlowValidationResult {
  const processNodes = result.nodes.filter(
    (node) => node.type !== 'bpmnLane' && !node.id.startsWith('ai-panel-'),
  );
  const edges = resolveEdgesForValidation(result);
  return validateBpmnFlow(processNodes, edges);
}

export function validateBpmnFlowFromCanvas(nodes: Node[], edges: Edge[]): FlowValidationResult {
  const processNodes = nodes
    .filter((node) => isProcessShape(String(node.type ?? '')))
    .map((node) => ({
      id: node.id,
      type: String(node.type),
      data: node.data as { label?: string },
    }));

  const edgeList = edges.map((edge) => ({ source: edge.source, target: edge.target }));
  return validateBpmnFlow(processNodes, edgeList);
}

export function buildAiFixPrompt(validation: FlowValidationResult): string {
  const lines = [...validation.errors, ...validation.warnings];
  return [
    'O fluxograma BPMN gerado precisa ser corrigido. Resolva TODOS os problemas abaixo e devolva o diagrama completo:',
    '',
    ...lines.map((line) => `- ${line}`),
    '',
    'Regras obrigatórias:',
    '- Pelo menos um evento de início e um de fim',
    '- Gateways de decisão/paralelo com no mínimo 2 saídas',
    '- Nenhum elemento de processo desconectado',
    '- Toda tarefa deve ter ao menos uma saída',
    '- Manter raias (swimlanes) quando fizer sentido',
  ].join('\n');
}
