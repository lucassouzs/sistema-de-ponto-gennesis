import type { LogicElement, LogicFlow, ProcessLogic } from './bpmnLayoutEngine';
import { isPhaseLikeLaneName } from './flowAiLaneHeuristics';
import {
  parseActorCommaSteps,
  tryParseLoopGatewayFlow,
} from './flowNaturalLanguageParser';

export type LogicAutoFixKind =
  | 'gateway_labels'
  | 'gateway_name'
  | 'orphan_end_event'
  | 'element_lane';

export type LogicAutoFix = {
  kind: LogicAutoFixKind;
  /** Mensagem visível ao usuário no chat (quando aplicável). */
  userMessage?: string;
  detail?: string;
};

export type LoopExpectation = {
  targetPhrase: string;
  targetElementId?: string;
  targetElementName?: string;
};

export type LogicValidationResult = {
  errors: string[];
  warnings: string[];
  fixes: LogicAutoFix[];
  loopExpectations: LoopExpectation[];
};

const META_GATEWAY_PATTERN =
  /quero que|crie um bpmn|criar um bpmn|bpmn para|fluxograma|consegue\?|diagrama para/i;

const LOOP_RETURN_PATTERN =
  /(?:volta(?:r)?\s+(?:para|ao|à|a)|retorna(?:r)?\s+(?:para|ao|à|a)|reprocess(?:ar|a)\s+(?:em|no|na))\s+([^,.;\n]+)/gi;

function truncate(label: string, max: number): string {
  const clean = label.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function normalizeLabel(label: string | undefined): string {
  return (label ?? '').trim().toLowerCase();
}

function buildOutgoingMap(flows: LogicFlow[]): Map<string, LogicFlow[]> {
  const outgoing = new Map<string, LogicFlow[]>();
  for (const flow of flows) {
    outgoing.set(flow.from, [...(outgoing.get(flow.from) ?? []), flow]);
  }
  return outgoing;
}

function isMetaGatewayName(name: string): boolean {
  const n = name.trim();
  return META_GATEWAY_PATTERN.test(n) || n.length > 48;
}

/** Detecta menções explícitas de retorno/volta no texto do usuário. */
export function extractLoopExpectations(description: string): LoopExpectation[] {
  const expectations: LoopExpectation[] = [];
  const text = description.trim();
  if (!text) return expectations;

  for (const match of text.matchAll(LOOP_RETURN_PATTERN)) {
    const phrase = match[1]?.trim().replace(/\s+(?:e|ou|para|até)\s+.*$/i, '').trim();
    if (phrase && phrase.length >= 3) {
      expectations.push({ targetPhrase: phrase });
    }
  }

  const seen = new Set<string>();
  return expectations.filter((item) => {
    const key = item.targetPhrase.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveLoopTarget(
  phrase: string,
  elements: LogicElement[],
): LogicElement | undefined {
  const candidates = elements.filter(
    (el) =>
      el.type !== 'endEvent' &&
      !el.name.includes(';') &&
      !/\bse reprova\b|\bse aprova\b/i.test(el.name),
  );
  const normalized = phrase.toLowerCase();

  const laneMatch = candidates.find((el) =>
    normalized.includes(el.lane.toLowerCase()) || el.lane.toLowerCase().includes(normalized.split(/\s+/)[0] ?? ''),
  );
  if (laneMatch) return laneMatch;

  const exact = candidates.find((el) => el.name.toLowerCase() === normalized);
  if (exact) return exact;

  const tokens = normalized.split(/\s+/).filter((t) => t.length > 3);
  if (tokens.length === 0) return undefined;

  let best: LogicElement | undefined;
  let bestScore = 0;
  for (const el of candidates) {
    const name = el.name.toLowerCase();
    const lane = el.lane.toLowerCase();
    const score =
      tokens.filter((token) => name.includes(token) || lane.includes(token)).length;
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return bestScore > 0 ? best : undefined;
}

function hasReturnFlowFromGateway(logic: ProcessLogic, targetId: string): boolean {
  const gatewayIds = new Set(
    logic.elements.filter((el) => el.type === 'exclusiveGateway').map((el) => el.id),
  );
  const endIds = new Set(
    logic.elements.filter((el) => el.type === 'endEvent').map((el) => el.id),
  );

  return logic.flows.some(
    (flow) =>
      flow.to === targetId &&
      gatewayIds.has(flow.from) &&
      !endIds.has(flow.from),
  );
}

function inferGatewayFlowLabel(
  logic: ProcessLogic,
  flow: LogicFlow,
  indexInOutgoing: number,
): string {
  if (flow.label?.trim()) return flow.label.trim();
  const target = logic.elements.find((el) => el.id === flow.to);
  const targetName = (target?.name ?? '').toLowerCase();
  if (
    targetName.includes('casa') ||
    targetName.includes('ficar') ||
    targetName.includes('cancel') ||
    targetName.includes('reprova') ||
    targetName.includes('rejeit')
  ) {
    return 'Não';
  }
  if (
    targetName.includes('trabalho') ||
    targetName.includes('aprova') ||
    targetName.includes('seguir') ||
    targetName.includes('chegar')
  ) {
    return 'Sim';
  }
  return ['Sim', 'Não', 'Opção A', 'Opção B'][indexInOutgoing] ?? `Saída ${indexInOutgoing + 1}`;
}

function looksLikeRawDescriptionText(value: string, description: string): boolean {
  const clean = value.trim();
  if (/\bse reprova\b|\bse aprova\b|volta\s+para/i.test(clean)) return true;
  if (clean.includes(';')) return true;
  if (!clean.includes(',') || clean.length < 36) return false;
  const descStart = description.trim().slice(0, 32).toLowerCase();
  return clean.toLowerCase().startsWith(descStart);
}

function validateDescriptionCoverage(
  logic: ProcessLogic,
  description: string,
  errors: string[],
): void {
  const actorSteps = parseActorCommaSteps(description);
  const loopParsed = tryParseLoopGatewayFlow(description);

  if (loopParsed) {
    if (!logic.elements.some((el) => el.type === 'exclusiveGateway')) {
      errors.push(
        'Texto menciona reprova/aprova com retorno, mas não há gateway de decisão no diagrama.',
      );
    }
    const stepElements = logic.elements.filter(
      (el) => el.type === 'task' || el.type === 'startEvent',
    );
    if (stepElements.length < loopParsed.steps.length) {
      errors.push(
        `Esperados ${loopParsed.steps.length} passos antes da decisão, encontrados ${stepElements.length}.`,
      );
    }
  } else if (actorSteps && actorSteps.length >= 2) {
    const expectedLanes = new Set(actorSteps.map((step) => step.actor)).size;
    const stepElements = logic.elements.filter(
      (el) => el.type === 'task' || el.type === 'startEvent',
    );

    if (logic.lanes.length < expectedLanes) {
      errors.push(
        `Esperadas ${expectedLanes} raias (${[...new Set(actorSteps.map((s) => s.actor))].join(', ')}), mas o diagrama tem ${logic.lanes.length}.`,
      );
    }
    if (stepElements.length < actorSteps.length) {
      errors.push(
        `Esperados ${actorSteps.length} passos do processo, mas só há ${stepElements.length} (tarefas/início).`,
      );
    }
  }

  const tasks = logic.elements.filter((el) => el.type === 'task');
  const gateways = logic.elements.filter((el) => el.type === 'exclusiveGateway');
  const processSteps = logic.elements.filter((el) =>
    ['task', 'startEvent', 'exclusiveGateway'].includes(el.type),
  );

  if (processSteps.length < 2 && description.trim().length > 24) {
    errors.push(
      'Diagrama muito pobre: menos de 2 passos de processo para a descrição informada.',
    );
  }

  if (tasks.length === 0 && gateways.length === 0 && description.trim().length > 20) {
    errors.push('Nenhuma tarefa intermediária — o fluxo não representa os passos descritos.');
  }

  for (const el of logic.elements) {
    if (looksLikeRawDescriptionText(el.name, description)) {
      errors.push(
        `O elemento "${truncate(el.name, 32)}" parece conter o texto bruto do pedido, não um passo modelado.`,
      );
    }
  }

  for (const lane of logic.lanes) {
    if (looksLikeRawDescriptionText(lane, description)) {
      errors.push(
        `A raia "${truncate(lane, 32)}" parece conter o texto bruto do pedido — use um papel por raia.`,
      );
    }
  }
}

/** Valida estrutura lógica antes de gerar XML. */
export function validateProcessLogic(
  logic: ProcessLogic,
  description = '',
): LogicValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fixes: LogicAutoFix[] = [];
  const loopExpectations = extractLoopExpectations(description);

  validateDescriptionCoverage(logic, description, errors);

  const outgoing = buildOutgoingMap(logic.flows);
  const ids = new Set(logic.elements.map((el) => el.id));
  const endIds = new Set(logic.elements.filter((el) => el.type === 'endEvent').map((el) => el.id));

  for (const flow of logic.flows) {
    if (!ids.has(flow.from) || !ids.has(flow.to)) {
      errors.push(`Conexão inválida: ${flow.from} → ${flow.to} (id inexistente).`);
    }
  }

  for (const lane of logic.lanes) {
    if (isPhaseLikeLaneName(lane)) {
      errors.push(`Raia "${lane}" parece fase/etapa — raias devem ser quem executa, não fases.`);
    }
  }

  for (const el of logic.elements) {
    if (!logic.lanes.includes(el.lane)) {
      warnings.push(`Elemento "${el.name}" referencia raia "${el.lane}" ausente em lanes.`);
      fixes.push({ kind: 'element_lane', detail: el.id });
    }
  }

  const gateways = logic.elements.filter((el) => el.type === 'exclusiveGateway');
  for (const gateway of gateways) {
    if (isMetaGatewayName(gateway.name)) {
      errors.push(
        `Gateway "${truncate(gateway.name, 40)}" usa texto inválido (meta-prompt ou > 48 caracteres).`,
      );
      fixes.push({ kind: 'gateway_name', detail: gateway.id });
    }

    const outs = outgoing.get(gateway.id) ?? [];
    if (outs.length < 2) {
      errors.push(`Gateway "${gateway.name}" precisa de no mínimo 2 saídas (tem ${outs.length}).`);
    } else {
      const labels = outs.map((flow) => normalizeLabel(flow.label));
      const distinct = new Set(labels.filter(Boolean));
      if (distinct.size < outs.length) {
        errors.push(`Gateway "${gateway.name}" tem saídas com labels duplicados ou vazios.`);
        fixes.push({ kind: 'gateway_labels', detail: gateway.id });
      } else if (outs.some((flow) => !flow.label?.trim())) {
        fixes.push({ kind: 'gateway_labels', detail: gateway.id });
      }
    }
  }

  const tasks = logic.elements.filter((el) => el.type === 'task');
  for (const task of tasks) {
    const outs = outgoing.get(task.id) ?? [];
    if (outs.length === 0) {
      errors.push(`Tarefa "${task.name}" não tem saída.`);
    } else if (outs.length === 1 && endIds.has(outs[0]!.to)) {
      // única saída para endEvent — OK
    } else if (outs.every((flow) => endIds.has(flow.to)) && outs.length >= 1) {
      // todas saídas vão para fim — OK
    }
  }

  for (const expectation of loopExpectations) {
    const target = resolveLoopTarget(expectation.targetPhrase, logic.elements);
    expectation.targetElementId = target?.id;
    expectation.targetElementName = target?.name;

    if (!target) {
      errors.push(
        `Texto pede retorno para "${expectation.targetPhrase}", mas nenhum elemento correspondente foi encontrado.`,
      );
      continue;
    }

    const hasBackEdge = hasReturnFlowFromGateway(logic, target.id);
    if (!hasBackEdge) {
      errors.push(
        `Falta conexão de retorno do gateway para "${target.name}" (mencionado: "${expectation.targetPhrase}").`,
      );
    }

    const returnFromEnd = logic.flows.some(
      (flow) => flow.to === target.id && endIds.has(flow.from),
    );
    if (returnFromEnd) {
      errors.push(
        `Retorno para "${target.name}" não pode partir de um evento de fim — use tarefa ou gateway.`,
      );
    }
  }

  const starts = logic.elements.filter((el) => el.type === 'startEvent');
  const ends = logic.elements.filter((el) => el.type === 'endEvent');
  if (starts.length === 0) errors.push('Nenhum evento de início no diagrama.');
  if (ends.length === 0) errors.push('Nenhum evento de fim no diagrama.');

  return { errors, warnings, fixes, loopExpectations };
}

function inferDecisionQuestion(description: string): string {
  const body = description.toLowerCase();
  if (/trabalhar|trabalho/.test(body) && /casa|ficar em casa/.test(body)) {
    return 'Vai ao trabalho?';
  }
  const ask = description.match(
    /(?:pergunto|decido|escolho)\s+(?:se\s+)?(.+?)(?:,\s*se\s+sim|[.?!]|$)/i,
  )?.[1];
  if (ask) {
    const q = ask.replace(/\s+ou\s+n[aã]o.*$/i, '').trim();
    if (q.length > 3) return truncate(q.endsWith('?') ? q : `${q}?`, 40);
  }
  return 'Decisão?';
}

/** Correções determinísticas seguras antes de re-prompt ou fallback. */
export function applyAutoFixes(
  logic: ProcessLogic,
  validation: LogicValidationResult,
  description = '',
): { logic: ProcessLogic; applied: LogicAutoFix[] } {
  if (validation.fixes.length === 0) {
    return { logic, applied: [] };
  }

  let elements = [...logic.elements];
  let flows = [...logic.flows];
  const applied: LogicAutoFix[] = [];
  const fixKinds = new Set(validation.fixes.map((fix) => `${fix.kind}:${fix.detail ?? ''}`));

  if ([...fixKinds].some((key) => key.startsWith('gateway_name:'))) {
    elements = elements.map((el) => {
      if (el.type !== 'exclusiveGateway' || !isMetaGatewayName(el.name)) return el;
      applied.push({
        kind: 'gateway_name',
        userMessage: `Ajustamos o rótulo do gateway para uma pergunta curta.`,
        detail: el.id,
      });
      return { ...el, name: inferDecisionQuestion(description) };
    });
  }

  const gatewaysNeedingLabels = new Set(
    validation.fixes.filter((fix) => fix.kind === 'gateway_labels').map((fix) => fix.detail),
  );
  if (gatewaysNeedingLabels.size > 0) {
    flows = flows.map((flow) => flow);
    const outgoing = buildOutgoingMap(flows);
    flows = flows.map((flow) => {
      if (!gatewaysNeedingLabels.has(flow.from)) return flow;
      const outs = outgoing.get(flow.from) ?? [];
      const index = outs.findIndex((item) => item.from === flow.from && item.to === flow.to);
      if (flow.label?.trim()) return flow;
      const label = inferGatewayFlowLabel({ ...logic, elements, flows }, flow, index);
      return { ...flow, label };
    });
    applied.push({
      kind: 'gateway_labels',
      userMessage: 'Completamos labels faltantes nas saídas de decisão.',
    });
  }

  const laneSet = new Set(logic.lanes);
  const fallbackLane = logic.lanes[0] ?? 'Processo';
  if (validation.fixes.some((fix) => fix.kind === 'element_lane')) {
    elements = elements.map((el) =>
      laneSet.has(el.lane) ? el : { ...el, lane: fallbackLane },
    );
    applied.push({ kind: 'element_lane', detail: 'remapped' });
  }

  return {
    logic: { ...logic, elements, flows },
    applied,
  };
}

/** Adiciona endEvent para tarefas/gateways terminais — sempre com mensagem ao usuário. */
export function applyOrphanEndEventFixes(logic: ProcessLogic): {
  logic: ProcessLogic;
  userMessages: string[];
} {
  const elements = [...logic.elements];
  const flows = [...logic.flows];
  const userMessages: string[] = [];
  const ids = new Set(elements.map((el) => el.id));

  const terminalIds = elements.filter(
    (el) =>
      (el.type === 'task' || el.type === 'exclusiveGateway') &&
      !(buildOutgoingMap(flows).get(el.id)?.length),
  );

  for (const el of terminalIds) {
    const endId = `end_${el.id}`;
    if (ids.has(endId)) continue;
    elements.push({
      id: endId,
      type: 'endEvent',
      name: el.type === 'task' ? `Fim — ${truncate(el.name, 24)}` : 'Fim',
      lane: el.lane,
    });
    flows.push({ from: el.id, to: endId });
    userMessages.push(`Adicionamos um fim automático para a tarefa "${el.name}".`);
  }

  return {
    logic: { ...logic, elements, flows },
    userMessages,
  };
}

export function buildLogicCorrectionPrompt(
  description: string,
  logic: ProcessLogic,
  validation: LogicValidationResult,
): string {
  const elementSummary = logic.elements
    .map((el) => `- ${el.id} (${el.type}): "${el.name}" [${el.lane}]`)
    .join('\n');
  const flowSummary = logic.flows
    .map((flow) => {
      const label = flow.label ? ` label="${flow.label}"` : '';
      return `- ${flow.from} → ${flow.to}${label}`;
    })
    .join('\n');

  const loopHints =
    validation.loopExpectations.length > 0
      ? validation.loopExpectations
          .map((item) => {
            const target = item.targetElementId
              ? `${item.targetElementId} ("${item.targetElementName}")`
              : `"${item.targetPhrase}"`;
            return `- Criar flow de retorno apontando para ${target} (nunca para endEvent).`;
          })
          .join('\n')
      : '';

  return [
    'O JSON BPMN abaixo tem erros estruturais. Corrija TODOS e devolva APENAS JSON válido (mesmo schema).',
    '',
    'Erros:',
    ...validation.errors.map((line) => `- ${line}`),
    '',
    ...(loopHints ? ['Loops esperados:', loopHints, ''] : []),
    'Pedido original do usuário:',
    description,
    '',
    'Elementos atuais:',
    elementSummary,
    '',
    'Flows atuais:',
    flowSummary,
    '',
    'Regras:',
    '- Gateway: mínimo 2 saídas com labels distintos; name ≤ 40 chars; nunca texto do pedido inteiro.',
    '- Toda task precisa de saída (idealmente para endEvent ou próximo passo).',
    '- Raia = quem executa; fases vão no name da task, não em lanes.',
    '- "Volta para X" = flow.to deve ser o id existente de X, não endEvent.',
  ].join('\n');
}

export function hasBlockingErrors(validation: LogicValidationResult): boolean {
  return validation.errors.length > 0;
}
