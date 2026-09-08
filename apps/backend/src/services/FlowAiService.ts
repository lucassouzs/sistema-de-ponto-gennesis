import type { FlowAiResult, FlowNodeInput, FlowValidationMeta } from './flowAiTypes';
import { isCompleteEnough } from './FlowAiDescriptionParser';
import { buildFallbackFromSteps, normalizeFlowAiResult } from './FlowAiLayout';
import { parseAiJsonRaw } from './FlowAiParseJson';
import { buildBpmnXmlFromLogic, type ProcessLogic } from './bpmnLayoutEngine';
import { parseProcessLogicRaw } from './flowAiProcessLogic';
import { buildLogicReply } from './flowAiLogicNormalize';
import { buildProcessLogicFromDescription } from './flowDescriptionToLogic';
import { prepareDescriptionForAi, buildProcessLogicFromNaturalLanguage } from './flowNaturalLanguageParser';
import { BPMN_AI_JSON_SYSTEM } from './flowAiSystemPrompt';
import { runValidatedLogicPipeline } from './flowAiPipeline';
import { buildLogicCorrectionPrompt } from './flowLogicValidate';

export type { FlowNodeInput, FlowEdgeInput, FlowLaneInput, FlowAiResult } from './flowAiTypes';
export {
  AI_POOL,
  normalizeFlowAiResult,
  buildFallbackFromSteps,
  buildEquipmentPurchaseFlow,
} from './FlowAiLayout';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MAX_CLAUDE_ATTEMPTS = 2;

function stripMarkdownFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json|xml|bpmn)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function extractAiXml(raw: string): string | null {
  const cleaned = stripMarkdownFences(raw);
  const xmlDecl = cleaned.match(/<\?xml[\s\S]*<\/definitions>/i);
  if (xmlDecl) return xmlDecl[0];
  const definitions = cleaned.match(/<(?:[\w]+:)?definitions[\s\S]*<\/(?:[\w]+:)?definitions>/i);
  if (definitions) return definitions[0];
  return null;
}

function extractProcessNameFromXml(xml: string): string {
  const participant = xml.match(/<participant[^>]*\sname="([^"]+)"/i);
  if (participant?.[1]?.trim()) return participant[1].trim().slice(0, 120);
  const process = xml.match(/<process[^>]*\sname="([^"]+)"/i);
  if (process?.[1]?.trim()) return process[1].trim().slice(0, 120);
  return 'Fluxo gerado';
}

const PROCESS_RENAME_PATTERN =
  /renome|mude o t[íi]tulo|mude o nome|troque o nome|altere o (?:nome|t[íi]tulo)/i;

/** Usuário pediu explicitamente para renomear o processo. */
export function wantsProcessRename(description: string): boolean {
  return PROCESS_RENAME_PATTERN.test(description.trim());
}

export type ResolveGeneratedFlowOptions = {
  isRefinement?: boolean;
  currentProcessName?: string;
};

function applyProcessNamePreservation(
  result: FlowAiResult,
  description: string,
  options?: ResolveGeneratedFlowOptions,
): FlowAiResult {
  const currentName = options?.currentProcessName?.trim();
  if (!options?.isRefinement || !currentName || wantsProcessRename(description)) {
    return result;
  }
  return { ...result, name: currentName };
}

function emptyAiResult(overrides: Partial<FlowAiResult> = {}): FlowAiResult {
  return {
    name: 'Fluxo gerado',
    nodes: [],
    edges: [],
    lanes: [],
    reply: 'Fluxograma gerado com sucesso.',
    ...overrides,
  };
}

function parseAiXml(raw: string): FlowAiResult | null {
  const xml = extractAiXml(raw);
  if (!xml) return null;
  return emptyAiResult({
    name: extractProcessNameFromXml(xml),
    xml,
    reply: 'Fluxograma BPMN gerado com sucesso.',
  });
}

export function countProcessNodes(result: FlowAiResult): number {
  return result.nodes.filter(
    (node) => node.type !== 'bpmnLane' && !node.id.startsWith('ai-panel-'),
  ).length;
}

function mergeNotices(meta: FlowValidationMeta, notices: string[]): FlowValidationMeta {
  const combined = [...(meta.userNotices ?? []), ...notices];
  return {
    ...meta,
    userNotices: combined.length > 0 ? combined : undefined,
    autoFixed: meta.autoFixed || notices.length > 0,
  };
}

function buildResultFromLogic(
  logic: ProcessLogic,
  description: string,
  options: ResolveGeneratedFlowOptions | undefined,
  meta: FlowValidationMeta,
): FlowAiResult {
  const preservedName =
    options?.isRefinement &&
    options.currentProcessName?.trim() &&
    !wantsProcessRename(description)
      ? options.currentProcessName.trim()
      : undefined;

  let finalLogic = logic;
  if (preservedName) {
    finalLogic = { ...logic, processName: preservedName };
  }

  return applyProcessNamePreservation(
    emptyAiResult({
      name: preservedName ?? finalLogic.processName,
      xml: buildBpmnXmlFromLogic(finalLogic),
      reply: buildLogicReply(finalLogic, meta.userNotices ?? []),
      validationMeta: meta,
    }),
    description,
    options,
  );
}

function resolveDeterministicFallback(
  description: string,
  options: ResolveGeneratedFlowOptions | undefined,
  meta: FlowValidationMeta,
): FlowAiResult {
  console.log('[FlowAI] fallback determinístico');
  const fallbackMeta: FlowValidationMeta = {
    ...meta,
    usedFallback: true,
  };

  const deterministic =
    buildProcessLogicFromNaturalLanguage(description) ??
    buildProcessLogicFromDescription(description);

  if (deterministic) {
    const pipeline = runValidatedLogicPipeline(deterministic, description);
    const merged = mergeNotices(fallbackMeta, pipeline.meta.userNotices ?? []);
    return buildResultFromLogic(pipeline.logic, description, options, merged);
  }

  const stepsFallback = buildFallbackFromSteps(description);
  return applyProcessNamePreservation(
    {
      ...stepsFallback,
      reply: `${stepsFallback.reply} (estrutura alternativa por passos numerados)`,
      validationMeta: mergeNotices(fallbackMeta, [
        'Usamos estrutura alternativa porque a IA não passou na validação.',
      ]),
    },
    description,
    options,
  );
}

/** Tenta parse + validação com até 2 respostas do Claude; fallback determinístico se falhar. */
export function resolveGeneratedFlowWithRetry(
  description: string,
  aiTexts: Array<string | null>,
  options?: ResolveGeneratedFlowOptions,
): FlowAiResult {
  const meta: FlowValidationMeta = {
    attemptCount: aiTexts.filter(Boolean).length,
    userNotices: [],
  };

  for (let index = 0; index < aiTexts.length; index += 1) {
    const aiText = aiTexts[index];
    if (!aiText?.trim()) continue;

    const logic = parseProcessLogicRaw(aiText);
    if (!logic) continue;

    const pipeline = runValidatedLogicPipeline(logic, description);
    Object.assign(meta, {
      autoFixed: pipeline.meta.autoFixed || meta.autoFixed,
      userNotices: mergeNotices(meta, pipeline.meta.userNotices ?? []).userNotices,
    });

    if (pipeline.valid) {
      if (index > 0) meta.retried = true;
      console.log('[FlowAI] validação OK —', {
        attempt: index + 1,
        lanes: pipeline.logic.lanes.length,
        elements: pipeline.logic.elements.length,
      });
      return buildResultFromLogic(pipeline.logic, description, options, meta);
    }

    console.warn('[FlowAI] validação falhou —', {
      attempt: index + 1,
      errors: pipeline.validation.errors,
    });

    if (index === aiTexts.length - 1) {
      meta.userNotices = mergeNotices(meta, [
        'Usamos estrutura alternativa porque a IA não passou na validação após 2 tentativas.',
      ]).userNotices;
    }
  }

  const lastText = aiTexts.filter(Boolean).at(-1);
  if (lastText) {
    const legacy = resolveLegacyAiResponse(description, lastText, options, meta);
    if (legacy) return legacy;
  }

  return resolveDeterministicFallback(description, options, meta);
}

function resolveLegacyAiResponse(
  description: string,
  aiText: string,
  options: ResolveGeneratedFlowOptions | undefined,
  meta: FlowValidationMeta,
): FlowAiResult | null {
  const jsonResult = parseAiJsonRaw(aiText);
  if (jsonResult && isCompleteEnough(jsonResult, description)) {
    return applyProcessNamePreservation(
      { ...normalizeFlowAiResult(jsonResult), validationMeta: meta },
      description,
      options,
    );
  }

  const xmlResult = parseAiXml(aiText);
  if (xmlResult?.xml) {
    return applyProcessNamePreservation({ ...xmlResult, validationMeta: meta }, description, options);
  }

  return null;
}

/** Compatibilidade: uma única resposta da IA (sem retry externo). */
export function resolveGeneratedFlow(
  description: string,
  aiText: string | null,
  options?: ResolveGeneratedFlowOptions,
): FlowAiResult {
  if (!aiText?.trim()) {
    return resolveDeterministicFallback(description, options, { attemptCount: 0 });
  }
  return resolveGeneratedFlowWithRetry(description, [aiText], options);
}

async function callClaude(system: string, user: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[FlowAI] ANTHROPIC_API_KEY ausente — Claude não será chamado');
    return null;
  }
  const model = process.env.GENNECY_ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.warn('[FlowAI] Claude respondeu HTTP', res.status, errBody.slice(0, 400));
    return null;
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = data.content?.find((c) => c.type === 'text')?.text?.trim() ?? null;
  console.log('[FlowAI] Claude OK —', text ? `${text.length} caracteres` : 'resposta vazia');
  return text;
}

export class FlowAiService {
  async generateFromDescription(
    description: string,
    existingNodes?: FlowNodeInput[],
    currentProcessName?: string,
    existingEdges?: Array<{ source: string; target: string; label?: string | null }>,
  ): Promise<FlowAiResult> {
    const isRefinement = Boolean(existingNodes?.length);
    const processNameHint = currentProcessName?.trim()
      ? `\nNome atual do processo (não altere salvo pedido explícito de renomear): "${currentProcessName.trim()}"`
      : '';
    const edgesHint =
      isRefinement && existingEdges?.length
        ? `\nConexões atuais (preserve todas que já estão corretas):\n${JSON.stringify(existingEdges)}`
        : '';
    const userPrompt = isRefinement
      ? `Diagrama atual (referência — NÃO altere o que já está correto; aplique só o pedido abaixo):\n${JSON.stringify(existingNodes)}${edgesHint}${processNameHint}\n\nPedido do usuário:\n${prepareDescriptionForAi(description)}\n\nIMPORTANTE: Mantenha o mesmo processName, os mesmos ids e os mesmos flows dos elementos existentes. Inclua tudo que já existe e adicione apenas o necessário.`
      : prepareDescriptionForAi(description);

    console.log('[FlowAI] generateFromDescription —', {
      hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      userPromptPreview: userPrompt.slice(0, 120).replace(/\s+/g, ' '),
    });

    const aiTexts: Array<string | null> = [];
    const first = await callClaude(BPMN_AI_JSON_SYSTEM, userPrompt);
    aiTexts.push(first);

    if (first?.trim()) {
      const firstLogic = parseProcessLogicRaw(first);
      if (firstLogic) {
        const pipeline = runValidatedLogicPipeline(firstLogic, description);
        if (!pipeline.valid && MAX_CLAUDE_ATTEMPTS > 1) {
          console.log('[FlowAI] re-prompt correção (tentativa 2)');
          const correctionPrompt = buildLogicCorrectionPrompt(
            description,
            pipeline.logic,
            pipeline.validation,
          );
          const second = await callClaude(BPMN_AI_JSON_SYSTEM, correctionPrompt);
          aiTexts.push(second);
        }
      }
    }

    return resolveGeneratedFlowWithRetry(description, aiTexts, {
      isRefinement,
      currentProcessName: currentProcessName?.trim() || undefined,
    });
  }
}

export const flowAiService = new FlowAiService();
