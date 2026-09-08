import type { LogicElement, LogicFlow, ProcessLogic } from './bpmnLayoutEngine';
import { applyLaneStrategy, resolveLaneStrategy, isPhaseLikeLaneName } from './flowAiLaneHeuristics';

const CORPORATE_ROLE_PATTERN =
  /\b(rh|ti|dp|gestor|colaborador|compras|financeiro|engenharia|auditoria|fiscal|logística|logistica|suprimentos)\b/i;

/** Usuário citou setores/raias distintos — aí sim usar múltiplas lanes. */
export function descriptionImpliesMultipleLanes(description: string): boolean {
  const text = description.trim();
  if (!text) return false;
  if (/(?:^|\n)\s*[^:\n]{2,40}:\s*\S/m.test(text)) return true;
  if (/\bpor setor\b|\bpor área\b|\bpor departamento\b/i.test(text)) return true;

  if (text.includes(',')) {
    const segments = text.split(/,\s*/).filter(Boolean);
    if (segments.length >= 2) {
      const actorSegments = segments.filter((segment) => {
        const actor = segment.match(/^([A-Za-zÀ-ú][\wÀ-ú]*)\s+/)?.[1] ?? '';
        return actor.length >= 2 && !isPhaseLikeLaneName(actor);
      });
      if (actorSegments.length >= 2) return true;
    }
  }

  const roleHits = text.match(new RegExp(CORPORATE_ROLE_PATTERN.source, 'gi')) ?? [];
  const uniqueRoles = new Set(roleHits.map((r) => r.toLowerCase()));
  return uniqueRoles.size >= 2;
}

function truncate(label: string, max: number): string {
  const clean = label.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function isMetaGatewayName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    /quero que|crie um bpmn|criar um bpmn|fluxograma|consegue\?|diagrama para/.test(n) ||
    n.length > 55
  );
}

function inferDecisionQuestion(description: string): string | null {
  const body = description.toLowerCase();
  if (/trabalhar|trabalho/.test(body) && (/casa|ficar em casa/.test(body) || /fico em casa/.test(body))) {
    return 'Vai ao trabalho?';
  }
  const ask = description.match(/(?:pergunto|decido|escolho)\s+(?:se\s+)?(.+?)(?:,\s*se\s+sim|[.?!]|$)/i)?.[1];
  if (ask) {
    const q = ask.replace(/\s+ou\s+n[aã]o.*$/i, '').trim();
    if (q.length > 3) return truncate(q.endsWith('?') ? q : `${q}?`, 40);
  }
  return null;
}

function normalizeElementName(type: LogicElement['type'], name: string, description = ''): string {
  const clean = name.trim();
  if (type === 'exclusiveGateway') {
    if (!clean || isMetaGatewayName(clean)) {
      return inferDecisionQuestion(description) ?? 'Decisão?';
    }
    if (clean.length > 72) return inferDecisionQuestion(description) ?? 'Decisão?';
    return truncate(clean, 40);
  }
  if (type === 'startEvent') return truncate(clean || 'Início', 32);
  if (type === 'endEvent') return truncate(clean || 'Fim', 32);
  return truncate(clean || 'Tarefa', 56);
}

function ensureStartAndEnd(logic: ProcessLogic): ProcessLogic {
  const elements = [...logic.elements];
  const flows = [...logic.flows];
  const lane = logic.lanes[0] ?? 'Processo';
  const ids = new Set(elements.map((el) => el.id));

  const hasStart = elements.some((el) => el.type === 'startEvent');

  if (!hasStart) {
    const firstTarget = flows.find((f) => ids.has(f.to))?.to;
    const startId = 'start1';
    elements.unshift({ id: startId, type: 'startEvent', name: 'Início', lane });
    if (firstTarget) {
      flows.unshift({ from: startId, to: firstTarget });
    }
  }

  return { ...logic, elements, flows };
}

/** Ajusta lógica da IA para layout estilo justflow (uma raia quando couber). */
export function normalizeProcessLogic(logic: ProcessLogic, description = ''): ProcessLogic {
  let { processName, lanes, elements, flows } = logic;

  elements = elements.map((el) => ({
    ...el,
    name: normalizeElementName(el.type, el.name, description),
  }));

  const laneStrategy = resolveLaneStrategy(
    description,
    { processName, lanes, elements, flows },
    descriptionImpliesMultipleLanes,
  );
  ({ lanes, elements } = applyLaneStrategy({ processName, lanes, elements, flows }, laneStrategy));

  const normalized = ensureStartAndEnd({ processName, lanes, elements, flows });

  return {
    ...normalized,
    processName: truncate(processName || lanes[0] || 'Fluxo gerado', 80),
  };
}

export function buildLogicReply(logic: ProcessLogic, userNotices: string[] = []): string {
  const tasks = logic.elements.filter((el) => el.type === 'task');
  const gateways = logic.elements.filter((el) => el.type === 'exclusiveGateway');
  const ends = logic.elements.filter((el) => el.type === 'endEvent');

  const parts: string[] = [
    `Diagrama **${logic.processName}** gerado com ${logic.elements.length} elementos em ${logic.lanes.length} raia(s).`,
  ];

  if (tasks.length > 0) {
    parts.push(`Passos: ${tasks.map((t) => t.name).join(' → ')}.`);
  }
  if (gateways.length > 0) {
    parts.push(`Decisão: ${gateways.map((g) => g.name).join('; ')}.`);
  }
  if (ends.length > 1) {
    parts.push(`Desfechos: ${ends.map((e) => e.name).join(', ')}.`);
  }

  for (const notice of userNotices) {
    parts.push(notice);
  }

  return parts.join(' ');
}
