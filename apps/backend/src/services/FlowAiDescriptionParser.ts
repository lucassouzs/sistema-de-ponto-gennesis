import type { FlowAiResult, FlowEdgeInput, FlowLaneInput, FlowNodeInput } from './flowAiTypes';
import { descriptionImpliesMultipleLanes } from './flowAiLogicNormalize';

export function countExpectedSteps(description: string): number {
  const lineNumbered = [...description.matchAll(/^\s*\d+[\).\-\s]+(.+)/gm)];
  if (lineNumbered.length >= 2) return lineNumbered.length;

  const inlineNumbered = [...description.matchAll(/(?:^|[\s;])(\d+)[\).\-\s]+/g)];
  if (inlineNumbered.length >= 2) return inlineNumbered.length;

  return description
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 3 && !/^processo\s+(?:de\s+)?/i.test(line)).length;
}

export function isCompleteEnough(result: FlowAiResult, description: string): boolean {
  const processNodes = result.nodes.filter(
    (node) => node.type !== 'bpmnLane' && !node.id.startsWith('ai-panel-'),
  );
  const nodeIds = new Set(processNodes.map((node) => node.id));
  const validEdges = (result.edges ?? []).filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );

  if (processNodes.length < 3 || validEdges.length < 2) return false;

  const expected = countExpectedSteps(description);
  const minNodes = expected >= 4 ? Math.max(4, Math.ceil(expected * 0.55)) : 3;
  if (expected >= 3 && processNodes.length < minNodes) return false;

  const hasStart = processNodes.some((node) => node.type === 'bpmnStart');
  const hasEnd = processNodes.some((node) => node.type === 'bpmnEnd');
  if (expected >= 3 && (!hasStart || !hasEnd)) return false;

  const needsGateway = /(\?|se\s+n[aã]o|se\s+sim|aprov|decis)/i.test(description);
  const hasGateway = processNodes.some(
    (node) => node.type === 'bpmnGateway' || node.type === 'bpmnParallelGateway',
  );
  if (needsGateway && expected >= 4 && !hasGateway) return false;

  return true;
}

export function extractProcessName(description: string): string {
  const explicit = description.match(/(?:processo|fluxo)\s+(?:de\s+)?([^\n.:]+)/i);
  if (explicit?.[1]?.trim()) return explicit[1].trim().slice(0, 120);

  const firstLine = description
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line.length > 2);
  if (firstLine && !/^\d+[\).\-\s]/.test(firstLine)) {
    return firstLine.slice(0, 120);
  }

  return 'Fluxo gerado';
}

type StepLine = {
  role: string;
  text: string;
  isGateway: boolean;
  gatewayLabel: string;
  branchNo?: string;
  branchYes?: string;
};

function slugLaneId(role: string, index: number): string {
  const slug = role
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return slug ? `lane-${slug}` : `lane-${index + 1}`;
}

export function normalizeRoleName(raw: string): string {
  const trimmed = raw.trim();
  if (/^gestor\s+direto$/i.test(trimmed)) return 'Gestor Direto';
  if (/^rh$/i.test(trimmed)) return 'RH';
  if (/^ti$/i.test(trimmed)) return 'TI';
  if (/^dp$/i.test(trimmed)) return 'DP';
  if (/^qa$/i.test(trimmed)) return 'QA';
  if (/^dev$/i.test(trimmed)) return 'Desenvolvimento';
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function inferRoleFromStep(step: string, index: number): string {
  const lower = step.toLowerCase();
  const prefixMatch = lower.match(
    /^(colaborador|gestor\s+direto|gestor|ti|compras|financeiro|rh|dp|logística|logistica|suprimentos|engenharia|auditoria|fiscal)\b/,
  );
  if (prefixMatch?.[1]) {
    return normalizeRoleName(prefixMatch[1]);
  }
  if (/colaborador|novo colaborador|solicita/.test(lower) && index === 0) return 'Colaborador';
  if (/engenh|projeto|obra|técnic/.test(lower)) return 'Engenharia';
  if (/compr|cotac|fornec|suprim|recebe o equipamento/.test(lower)) return 'Compras';
  if (/aprova|gestor|diret|alçada|integração|integracao|apresentar a equipe/.test(lower)) {
    return 'Gestor Direto';
  }
  if (/financ|pagamento|fatur|boleto|orçamento/.test(lower)) return 'Financeiro';
  if (/auditor|fiscal|nf|nota/.test(lower)) return 'Auditoria / Fiscal';
  if (/\bti\b|acesso|equipamento|notebook|credenciais|configura|sistema/.test(lower)) return 'TI';
  if (/rh|admissional|document|cadastr|treinamento|ficha|onboarding/.test(lower)) return 'RH';
  return index === 0 ? 'Colaborador' : `Setor ${index + 1}`;
}

function truncateLabel(label: string, max = 48): string {
  const clean = String(label || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function similarStep(a: string, b: string): boolean {
  const na = a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const nb = b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (na.length < 8 || nb.length < 8) return na === nb;
  return na.includes(nb.slice(0, 18)) || nb.includes(na.slice(0, 18));
}

function isTitleLine(line: string): boolean {
  const text = line.trim();
  if (!text || /^\d+[\).\-\s]/.test(text)) return false;
  return /^(processo|fluxo|onboarding)\s+(?:de\s+)?/i.test(text) && !/[:,?]/.test(text);
}

function parseStepLines(description: string): StepLine[] {
  const rawLines = description.split(/\n+/);
  const steps: string[] = [];

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed || isTitleLine(trimmed)) continue;

    if (/^\s*\d+[\).\-\s]/.test(trimmed)) {
      steps.push(trimmed.replace(/^\s*\d+[\).\-\s]+/, '').trim());
      continue;
    }

    const inlineParts = trimmed
      .split(/(?=(?:^|\s)\d+[\).\-\s]+)/)
      .map((part) => part.replace(/^\s*\d+[\).\-\s]+/, '').trim())
      .filter((part) => part.length > 1);

    if (inlineParts.length > 1) {
      steps.push(...inlineParts);
    } else if (trimmed.length > 1) {
      steps.push(trimmed);
    }
  }

  const roleOrder: string[] = [];

  return steps.map((text, index) => {
    const roleMatch = text.match(/^([^:]{2,48}):\s*(.+)$/);
    let role = roleMatch ? normalizeRoleName(roleMatch[1]) : inferRoleFromStep(text, roleOrder.length);
    const stepText = roleMatch ? roleMatch[2].trim() : text;

    if (/^(fim|end)$/i.test(stepText) && roleOrder.length > 0) {
      role = roleOrder[roleOrder.length - 1] ?? role;
    }

    if (!roleOrder.includes(role)) roleOrder.push(role);

    const branchNo = stepText.match(/se\s+n[aã]o[,\s:]+([^.;]+)/i)?.[1]?.trim();
    const branchYes = stepText.match(/se\s+sim[,\s:]+([^.;]+)/i)?.[1]?.trim();
    const isGateway = /\?/.test(stepText) || Boolean(branchNo && branchYes);

    let gatewayLabel = stepText;
    if (isGateway) {
      gatewayLabel = stepText.includes('?')
        ? `${stepText.split('?')[0]?.trim()}?`
        : `${stepText.split(/se\s+n/i)[0]?.trim()}?`;
    }

    return {
      role,
      text: stepText,
      isGateway,
      gatewayLabel: truncateLabel(gatewayLabel),
      branchNo: branchNo ? truncateLabel(branchNo) : undefined,
      branchYes: branchYes ? truncateLabel(branchYes) : undefined,
    };
  });
}

/** Monta fluxo BPMN a partir de lista numerada — funciona para qualquer processo por setor. */
export function buildFlowFromDescription(description: string): {
  name: string;
  nodes: FlowNodeInput[];
  edges: FlowEdgeInput[];
  lanes: FlowLaneInput[];
} {
  const lines = parseStepLines(description);
  if (lines.length === 0) {
    return {
      name: extractProcessName(description),
      nodes: [],
      edges: [],
      lanes: [],
    };
  }

  const roleOrder: string[] = [];
  for (const line of lines) {
    if (!roleOrder.includes(line.role)) roleOrder.push(line.role);
  }

  const processTitle = extractProcessName(description);
  const useSingleLane = !descriptionImpliesMultipleLanes(description);

  const lanes: FlowLaneInput[] = useSingleLane
    ? [{ id: 'lane-main', label: processTitle || 'Processo', y: 0, height: 280 }]
    : roleOrder.map((role, index) => ({
        id: slugLaneId(role, index),
        label: role,
        y: 0,
        height: 200,
      }));

  const laneIdForRole = (role: string): string =>
    useSingleLane
      ? 'lane-main'
      : (lanes.find((lane) => lane.label === role)?.id ?? lanes[0]!.id);

  const nodes: FlowNodeInput[] = [];
  const edges: FlowEdgeInput[] = [];
  let prevId: string | null = null;
  let pendingSimFrom: string | null = null;
  let edgeNum = 0;

  const addEdge = (source: string, target: string, label?: string) => {
    edges.push({
      id: `e-${++edgeNum}`,
      source,
      target,
      ...(label ? { label } : {}),
    });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const laneId = laneIdForRole(line.role);
    const nextLine = lines[i + 1];

    if (line.isGateway) {
      const gatewayId = `g-${i + 1}`;
      nodes.push({
        id: gatewayId,
        type: 'bpmnGateway',
        label: line.gatewayLabel,
        laneId,
        x: 0,
        y: 0,
      });
      if (prevId) addEdge(prevId, gatewayId);

      if (line.branchNo) {
        const noTaskId = `t-no-${i + 1}`;
        nodes.push({
          id: noTaskId,
          type: 'bpmnTask',
          label: line.branchNo,
          laneId,
          x: 0,
          y: 0,
        });
        addEdge(gatewayId, noTaskId, 'Não');

        const isTerminalReject = /reprov|cancel|encerr|indefer/i.test(line.branchNo);
        if (isTerminalReject) {
          const endNoId = `end-no-${i + 1}`;
          nodes.push({
            id: endNoId,
            type: 'bpmnEnd',
            label: 'Fim',
            laneId,
            x: 0,
            y: 0,
          });
          addEdge(noTaskId, endNoId);
        } else {
          addEdge(noTaskId, gatewayId);
        }
      }

      const simContinuesOnNext =
        nextLine &&
        (!line.branchYes || similarStep(line.branchYes, nextLine.text) || similarStep(nextLine.text, line.branchYes ?? ''));

      if (simContinuesOnNext) {
        pendingSimFrom = gatewayId;
        prevId = null;
        continue;
      }

      if (line.branchYes) {
        const yesTaskId = `t-yes-${i + 1}`;
        nodes.push({
          id: yesTaskId,
          type: 'bpmnTask',
          label: line.branchYes,
          laneId,
          x: 0,
          y: 0,
        });
        addEdge(gatewayId, yesTaskId, 'Sim');
        prevId = yesTaskId;
        continue;
      }

      prevId = gatewayId;
      continue;
    }

    const isExplicitEnd = /^(fim|end|finaliza|encerra)/i.test(line.text);
    const isExplicitStart = /^(início|inicio|start)$/i.test(line.text);
    const noStartYet = !nodes.some((node) => node.type === 'bpmnStart');
    let type = isExplicitEnd ? 'bpmnEnd' : isExplicitStart ? 'bpmnStart' : 'bpmnTask';
    if (type === 'bpmnTask' && noStartYet && !line.isGateway) {
      type = 'bpmnStart';
    }
    const nodeId = type === 'bpmnStart' ? 'start' : type === 'bpmnEnd' ? `end-${i + 1}` : `t-${i + 1}`;
    const label =
      type === 'bpmnEnd'
        ? truncateLabel(line.text.replace(/^(fim|end)\s*[-–:]?\s*/i, '') || 'Fim')
        : truncateLabel(line.text);

    nodes.push({ id: nodeId, type, label, laneId, x: 0, y: 0 });

    if (pendingSimFrom) {
      addEdge(pendingSimFrom, nodeId, 'Sim');
      pendingSimFrom = null;
    } else if (prevId) {
      addEdge(prevId, nodeId);
    }

    prevId = nodeId;
  }

  if (!nodes.some((node) => node.type === 'bpmnStart')) {
    const firstNode = nodes.find((node) => node.type !== 'bpmnEnd');
    const startLane = firstNode?.laneId ?? lanes[0]!.id;
    nodes.unshift({
      id: 'start',
      type: 'bpmnStart',
      label: 'Início',
      laneId: startLane,
      x: 0,
      y: 0,
    });
    if (firstNode) {
      edges.unshift({ id: `e-${++edgeNum}`, source: 'start', target: firstNode.id });
    }
  }

  if (!nodes.some((node) => node.type === 'bpmnEnd') && prevId) {
    const endId = 'end-main';
    const lastLane = nodes[nodes.length - 1]?.laneId ?? lanes[0]!.id;
    nodes.push({
      id: endId,
      type: 'bpmnEnd',
      label: 'Fim',
      laneId: lastLane,
      x: 0,
      y: 0,
    });
    addEdge(prevId, endId);
  }

  return {
    name: extractProcessName(description),
    nodes,
    edges,
    lanes,
  };
}
