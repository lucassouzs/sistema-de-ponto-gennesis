import type { LogicElement, LogicFlow, ProcessLogic } from './bpmnLayoutEngine';
import { normalizeProcessLogic } from './flowAiLogicNormalize';
import { normalizeRoleName } from './FlowAiDescriptionParser';
import { isActorLikeLaneName } from './flowAiLaneHeuristics';

export type ActorCommaStep = { actor: string; action: string };

function truncate(label: string, max: number): string {
  const clean = label.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function capitalizeFirst(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Remove pedido meta ("quero que crie um bpmn...", "consegue?"). */
export function stripMetaRequest(text: string): string {
  let body = text.trim();
  body = body.replace(
    /^.*?(?:crie|criar|fazer|monte|gerar|model(?:e|ar))\s+(?:um\s+)?(?:bpmn|fluxo|fluxograma|diagrama)[^.?!]*[.?!,]?\s*/i,
    '',
  );
  body = body.replace(/^[^?!]*consegue\?[,\s]*/i, '');
  body = body.replace(/^[^,]*?\b(?:do meu|da minha|desde o meu)\b[^,]*,\s*/i, '');
  return body.trim();
}

export function extractProcessTitle(description: string): string {
  const raw = description.trim();
  const range = raw.match(
    /(?:do meu|da minha|desde o meu)\s+(.+?)\s+at[eé]\s+(?:chegar no|chegar ao|ir ao|ir para o)\s+(.+?)(?:[,.?!]|$)/i,
  );
  if (range?.[1] && range?.[2]) {
    return capitalizeFirst(`${range[1].trim()} até ${range[2].trim()}`);
  }

  const explicit = raw.match(/(?:processo|fluxo)\s+(?:de\s+)?([^\n.:,]+)/i);
  if (explicit?.[1]?.trim()) return capitalizeFirst(explicit[1].trim());

  if (/acordar|rotina|manh[aã]/i.test(raw)) return 'Rotina Matinal';
  if (/chamado/i.test(raw)) return 'Abertura de chamado';
  if (/implementa|desenvolvimento|qa testa/i.test(raw)) return 'Ciclo de desenvolvimento';

  return 'Processo';
}

function hasLoopOrBranchClauses(text: string): boolean {
  return /\bse\s+reprova\b|\bse\s+aprova\b|\bse\s+sim\b|\bse\s+n[aã]o\b|volta\s+para|retorna\s+para|;\s*se\s+/i.test(
    text,
  );
}

function parseActorCommaStepsFragment(fragment: string): ActorCommaStep[] | null {
  const parts = fragment
    .split(/,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 1) return null;

  const steps: ActorCommaStep[] = [];
  for (const part of parts) {
    const match = part.match(/^([A-Za-zÀ-ú][\wÀ-ú]*)\s+(.+)$/);
    if (!match?.[1] || !match[2]) return null;

    const actor = normalizeRoleName(match[1]);
    const action = capitalizeFirst(match[2].trim());
    if (!isActorLikeLaneName(actor)) return null;

    steps.push({ actor, action });
  }
  return steps.length > 0 ? steps : null;
}

export type ParsedLoopGatewayFlow = {
  processName: string;
  steps: ActorCommaStep[];
  rejectLabel: string;
  returnTargetPhrase: string;
  approveLabel: string;
  approveEndName: string;
  gatewayQuestion: string;
};

/** "Dev implementa, QA testa; se reprova volta para X; se aprova encerra" */
export function tryParseLoopGatewayFlow(description: string): ParsedLoopGatewayFlow | null {
  const body = stripMetaRequest(description);
  const match = body.match(
    /^(.+?)\s*;\s*se\s+reprova\s+volta\s+para\s+(.+?)\s*;\s*se\s+aprova\s+(.+)$/i,
  );
  if (!match?.[1] || !match[2] || !match[3]) return null;

  const steps = parseActorCommaStepsFragment(match[1]);
  if (!steps || steps.length < 1) return null;

  const approveRaw = match[3].trim().replace(/[.?!]+$/, '');
  const approveEndName =
    /^encerra?$/i.test(approveRaw) ? 'Entrega aprovada' : capitalizeFirst(approveRaw);

  return {
    processName: extractProcessTitle(description),
    steps,
    rejectLabel: 'Reprovar',
    returnTargetPhrase: match[2].trim(),
    approveLabel: 'Aprovar',
    approveEndName,
    gatewayQuestion: 'Aprovado?',
  };
}

export function buildProcessLogicFromLoopGateway(description: string): ProcessLogic | null {
  const parsed = tryParseLoopGatewayFlow(description);
  if (!parsed) return null;

  const lanes = [...new Set(parsed.steps.map((step) => step.actor))];
  const elements: LogicElement[] = [];
  const flows: LogicFlow[] = [];

  const startId = 'start1';
  const first = parsed.steps[0]!;
  elements.push({
    id: startId,
    type: 'startEvent',
    name: first.action,
    lane: first.actor,
  });

  let prevId = startId;
  for (let i = 1; i < parsed.steps.length; i += 1) {
    const step = parsed.steps[i]!;
    const taskId = i === 1 ? 't_qa' : `t${i}`;
    elements.push({
      id: taskId,
      type: 'task',
      name: step.action,
      lane: step.actor,
    });
    flows.push({ from: prevId, to: taskId });
    prevId = taskId;
  }

  const devTaskId =
    elements.find(
      (el) =>
        (el.type === 'task' || el.type === 'startEvent') &&
        /desenvolvimento|dev/i.test(el.lane),
    )?.id ?? startId;

  const gatewayId = 'g1';
  const lastLane = parsed.steps[parsed.steps.length - 1]!.actor;
  elements.push({
    id: gatewayId,
    type: 'exclusiveGateway',
    name: parsed.gatewayQuestion,
    lane: lastLane,
  });
  flows.push({ from: prevId, to: gatewayId });

  const endId = 'end1';
  elements.push({
    id: endId,
    type: 'endEvent',
    name: parsed.approveEndName,
    lane: lastLane,
  });
  flows.push({ from: gatewayId, to: endId, label: parsed.approveLabel });
  flows.push({ from: gatewayId, to: devTaskId, label: parsed.rejectLabel });

  return normalizeProcessLogic(
    {
      processName: parsed.processName,
      lanes,
      elements,
      flows,
    },
    description,
  );
}

/**
 * "Cliente abre chamado, Atendente triagem, QA testa" → passos por executor.
 * Cada segmento: Papel + ação (primeira palavra = raia).
 */
export function parseActorCommaSteps(description: string): ActorCommaStep[] | null {
  const body = stripMetaRequest(description);
  if (hasLoopOrBranchClauses(body)) return null;
  if (!body.includes(',')) return null;

  const steps = parseActorCommaStepsFragment(body);
  if (!steps || new Set(steps.map((step) => step.actor)).size < 2) return null;
  return steps;
}

export function buildProcessLogicFromActorCommaList(description: string): ProcessLogic | null {
  const steps = parseActorCommaSteps(description);
  if (!steps || steps.length < 2) return null;

  const lanes = [...new Set(steps.map((step) => step.actor))];
  const elements: LogicElement[] = [];
  const flows: LogicFlow[] = [];

  const startId = 'start1';
  elements.push({
    id: startId,
    type: 'startEvent',
    name: steps[0]!.action,
    lane: steps[0]!.actor,
  });

  let prevId = startId;
  for (let i = 1; i < steps.length; i += 1) {
    const step = steps[i]!;
    const taskId = `t${i}`;
    elements.push({
      id: taskId,
      type: 'task',
      name: step.action,
      lane: step.actor,
    });
    flows.push({ from: prevId, to: taskId });
    prevId = taskId;
  }

  const endId = 'end1';
  const last = steps[steps.length - 1]!;
  elements.push({
    id: endId,
    type: 'endEvent',
    name: 'Concluído',
    lane: last.actor,
  });
  flows.push({ from: prevId, to: endId });

  return normalizeProcessLogic(
    {
      processName: extractProcessTitle(description),
      lanes,
      elements,
      flows,
    },
    description,
  );
}

function cleanActionPhrase(phrase: string): string {
  return capitalizeFirst(
    phrase
      .replace(/^(?:depois de|ai depois|aí depois|e depois|então|eu|aí)\s+/i, '')
      .replace(/\s+(?:e|ou)\s+me pergunto.*$/i, '')
      .replace(/\s+me pergunto.*$/i, '')
      .replace(/\s+se\s+(?:eu\s+)?(?:vou|vai).*$/i, '')
      .trim(),
  );
}

function toTaskLabel(phrase: string): string {
  const t = cleanActionPhrase(phrase);
  const lower = t.toLowerCase();
  const verbMap: Record<string, string> = {
    choro: 'Chorar',
    levanto: 'Levantar da cama',
    acordar: 'Acordar',
    'pego onibus': 'Pegar ônibus',
    'pego ônibus': 'Pegar ônibus',
    'fico em casa': 'Ficar em casa',
  };
  if (verbMap[lower]) return verbMap[lower];
  return t;
}

function inferGatewayQuestion(fragment: string, fullText: string): string {
  if (/trabalhar|trabalho/i.test(fragment) || /trabalhar|trabalho/i.test(fullText)) {
    return 'Vai ao trabalho?';
  }
  const ask = fragment.match(/(?:pergunto|decido|escolho)\s+(?:se\s+)?(.+)/i)?.[1];
  if (ask) {
    const q = ask.replace(/\s+ou\s+n[aã]o.*$/i, '').trim();
    if (q.length > 3) return truncate(q.endsWith('?') ? q : `${q}?`, 40);
  }
  return 'Decisão?';
}

function splitSequentialPart(part: string): string[] {
  const chunks = part
    .split(/\s*,\s*(?=depois de|ai depois|aí depois|e depois|então|eu\s)/i)
    .map((c) => c.trim())
    .filter(Boolean);

  if (chunks.length > 1) return chunks.map(toTaskLabel);

  const euSplit = part
    .split(/\s*,\s*eu\s+/i)
    .map((c, i) => (i === 0 ? toTaskLabel(c) : toTaskLabel(`eu ${c}`)));
  if (euSplit.length > 1) return euSplit.filter(Boolean);

  return [toTaskLabel(part)];
}

type ParsedBranch = { label: string; steps: string[] };

/** Interpreta texto livre estilo conversa → passos sequenciais + ramos Sim/Não. */
export function tryParseNaturalLanguageFlow(description: string): {
  processName: string;
  sequential: string[];
  gatewayQuestion: string;
  branchYes: ParsedBranch;
  branchNo: ParsedBranch;
} | null {
  const body = stripMetaRequest(description);
  if (!body || body.length < 12) return null;

  const branchSplit = body.split(/,\s*se\s+sim[,\s:]+/i);
  if (branchSplit.length < 2) return null;

  const beforeBranches = branchSplit[0]!.trim();
  const rest = branchSplit[1]!.trim();
  const noSplit = rest.split(/,\s*se\s+n[aã]o[,\s:]+/i);
  if (noSplit.length < 2) return null;

  const yesRaw = noSplit[0]!.trim();
  const noRaw = noSplit[1]!.replace(/[.?!]+$/, '').trim();
  if (!yesRaw || !noRaw) return null;

  const sequential = splitSequentialPart(beforeBranches);
  if (sequential.length === 0) return null;

  const lastIdx = sequential.length - 1;
  const last = sequential[lastIdx]!;
  const gatewayQuestion = inferGatewayQuestion(last, body);

  if (/pergunto|decido|trabalhar|trabalho ou/i.test(last)) {
    sequential[lastIdx] = toTaskLabel(
      last.replace(/(?:e\s+)?me pergunto.*$/i, '').replace(/\s+se\s+.*$/i, ''),
    );
    if (!sequential[lastIdx]) sequential.pop();
  }

  const yesSteps = (() => {
    const chegoSplit = yesRaw.split(/\s+e chego (?:no|ao)\s+/i);
    if (chegoSplit.length === 2 && chegoSplit[0] && chegoSplit[1]) {
      return [toTaskLabel(chegoSplit[0]), capitalizeFirst(`Chegar no ${chegoSplit[1].trim()}`)];
    }
    return yesRaw.split(/\s*,\s*(?:e|depois|então)\s+/i).map(toTaskLabel).filter(Boolean);
  })();
  const noSteps = [toTaskLabel(noRaw)];

  return {
    processName: extractProcessTitle(description),
    sequential,
    gatewayQuestion,
    branchYes: { label: 'Sim', steps: yesSteps.length ? yesSteps : [toTaskLabel(yesRaw)] },
    branchNo: { label: 'Não', steps: noSteps },
  };
}

export function buildProcessLogicFromNaturalLanguage(description: string): ProcessLogic | null {
  const fromLoop = buildProcessLogicFromLoopGateway(description);
  if (fromLoop) return fromLoop;

  const fromActors = buildProcessLogicFromActorCommaList(description);
  if (fromActors) return fromActors;

  const parsed = tryParseNaturalLanguageFlow(description);
  if (!parsed) return null;

  const lane = truncate(parsed.processName, 48);
  const elements: LogicElement[] = [];
  const flows: LogicFlow[] = [];

  let seq = 0;
  const nextId = (prefix: string) => `${prefix}${++seq}`;

  const startId = nextId('start');
  elements.push({
    id: startId,
    type: 'startEvent',
    name: parsed.sequential[0] ?? 'Início',
    lane,
  });

  let prevId = startId;
  const middleSteps = parsed.sequential.slice(1);
  for (const step of middleSteps) {
    const taskId = nextId('t');
    elements.push({ id: taskId, type: 'task', name: step, lane });
    flows.push({ from: prevId, to: taskId });
    prevId = taskId;
  }

  const gatewayId = nextId('g');
  elements.push({
    id: gatewayId,
    type: 'exclusiveGateway',
    name: parsed.gatewayQuestion,
    lane,
  });
  flows.push({ from: prevId, to: gatewayId });

  const attachBranch = (branch: ParsedBranch, label: 'Sim' | 'Não') => {
    let cursor = gatewayId;
    let flowLabel: string | undefined = label;
    const steps = [...branch.steps];

    for (let i = 0; i < steps.length; i += 1) {
      const isLast = i === steps.length - 1;
      if (isLast) {
        const endId = nextId('end');
        elements.push({
          id: endId,
          type: 'endEvent',
          name: steps[i]!,
          lane,
        });
        flows.push({ from: cursor, to: endId, ...(flowLabel ? { label: flowLabel } : {}) });
      } else {
        const taskId = nextId('t');
        elements.push({ id: taskId, type: 'task', name: steps[i]!, lane });
        flows.push({ from: cursor, to: taskId, ...(flowLabel ? { label: flowLabel } : {}) });
        flowLabel = undefined;
        cursor = taskId;
      }
    }
  };

  attachBranch(parsed.branchYes, 'Sim');
  attachBranch(parsed.branchNo, 'Não');

  return normalizeProcessLogic(
    { processName: parsed.processName, lanes: [lane], elements, flows },
    description,
  );
}

/** Texto limpo + passos numerados para orientar a Claude. */
export function prepareDescriptionForAi(description: string): string {
  const loopFlow = tryParseLoopGatewayFlow(description);
  if (loopFlow) {
    const lines = [
      `Processo: ${loopFlow.processName}`,
      ...loopFlow.steps.map((step, index) => `${index + 1}. [${step.actor}] ${step.action}`),
      `${loopFlow.steps.length + 1}. ${loopFlow.gatewayQuestion}`,
      `- ${loopFlow.approveLabel}: ${loopFlow.approveEndName}`,
      `- ${loopFlow.rejectLabel}: volta para ${loopFlow.returnTargetPhrase} (flow para id da tarefa de Desenvolvimento, NÃO endEvent)`,
    ];
    return `${lines.join('\n')}\n\nDescrição original:\n${description}`;
  }

  const actorSteps = parseActorCommaSteps(description);
  if (actorSteps && actorSteps.length >= 2) {
    const lines = [
      `Processo: ${extractProcessTitle(description)}`,
      'Raias (uma por executor):',
      ...actorSteps.map((step, index) => `${index + 1}. [${step.actor}] ${step.action}`),
    ];
    return `${lines.join('\n')}\n\nDescrição original:\n${description}`;
  }

  const parsed = tryParseNaturalLanguageFlow(description);
  if (!parsed) return description;

  const lines = [
    `Processo: ${parsed.processName}`,
    ...parsed.sequential.map((step, i) => `${i + 1}. ${step}`),
    `${parsed.sequential.length + 1}. ${parsed.gatewayQuestion}`,
    `- Sim: ${parsed.branchYes.steps.join(' → ')}`,
    `- Não: ${parsed.branchNo.steps.join(' → ')}`,
  ];
  return `${lines.join('\n')}\n\nDescrição original:\n${description}`;
}
