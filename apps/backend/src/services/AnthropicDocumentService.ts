import * as XLSX from 'xlsx';
import { buildDocumentTextForAi } from './documentTextExtractor';
import { isRateLimitError } from './licitacaoDocumentContext';

const DEFAULT_LICITACOES_MODEL = 'claude-sonnet-4-6';
/** Haiku tem limite TPM bem maior que Sonnet no tier padrão da Anthropic (~50k vs ~10k). */
const DEFAULT_LICITACOES_MODEL_QA = 'claude-haiku-4-5';
const PDF_BETA_HEADER = 'pdfs-2024-09-25';

/** Limites de saída — respostas menores consomem menos tokens. */
export const LICITACOES_MAX_TOKENS_QA = 1024;
export const LICITACOES_MAX_TOKENS_ANALISE = 4096;
export const LICITACOES_MAX_TOKENS_PDF = 4096;

export type AnthropicCallResult = {
  text: string | null;
  error?: string;
};

let lastAnthropicError: string | null = null;

export function getLastAnthropicError(): string | null {
  return lastAnthropicError;
}

function setAnthropicError(message: string): void {
  lastAnthropicError = message;
  console.error('[AnthropicDocument]', message);
}

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'document';
      source: { type: 'base64'; media_type: 'application/pdf'; data: string };
    }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string };
    };

export type DocumentInput = {
  buffer: Buffer;
  mimeType: string;
  name: string;
};

export type DocumentContentMode = 'auto' | 'text' | 'pdf';

export function isAnthropicConfigured(): boolean {
  const flag = String(process.env.LICITACOES_ANTHROPIC_ENABLED ?? process.env.GENNECY_ANTHROPIC_ENABLED ?? '').trim();
  if (flag === '0' || flag.toLowerCase() === 'false') return false;
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}


/** Perguntas com cache salvo — Haiku por padrão (TPM maior e mais barato). */
export function anthropicModelForLicitacaoQa(): string {
  return (
    process.env.LICITACOES_ANTHROPIC_MODEL_QA?.trim() ||
    process.env.LICITACOES_ANTHROPIC_MODEL?.trim() ||
    DEFAULT_LICITACOES_MODEL_QA
  );
}

/** Análise única dos documentos — Haiku por padrão; override via env se precisar mais precisão. */
export function anthropicModelForLicitacaoAnalise(): string {
  return (
    process.env.LICITACOES_ANTHROPIC_MODEL_ANALISE?.trim() ||
    process.env.LICITACOES_ANTHROPIC_MODEL?.trim() ||
    DEFAULT_LICITACOES_MODEL
  );
}

export type AnthropicTextOptions = {
  model?: string;
  maxTokens?: number;
};

function normalizeMime(mimeType: string, fileName: string): string {
  const m = (mimeType || '').toLowerCase().trim();
  if (m) return m;
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'txt') return 'text/plain';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'xls') return 'application/vnd.ms-excel';
  return 'application/octet-stream';
}

function xlsxBufferToText(buffer: Buffer, name: string): string {
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const parts: string[] = [`Planilha: ${name}`];
    for (const sheetName of wb.SheetNames.slice(0, 5)) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      parts.push(`\n--- Aba: ${sheetName} ---\n${csv.slice(0, 50_000)}`);
    }
    return parts.join('\n').slice(0, 120_000);
  } catch {
    return `[Não foi possível ler a planilha ${name}]`;
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rateLimitRetryWaitMs(): number {
  const raw = Number(process.env.LICITACOES_ANTHROPIC_RATE_LIMIT_WAIT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 65_000;
}

function rateLimitMaxRetries(): number {
  const raw = Number(process.env.LICITACOES_ANTHROPIC_RATE_LIMIT_RETRIES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 3;
}

/** Serializa chamadas à API para evitar estourar TPM com requisições simultâneas. */
let anthropicAnalysisQueue: Promise<unknown> = Promise.resolve();
let anthropicQaQueue: Promise<unknown> = Promise.resolve();

export function enqueueAnthropicCall<T>(fn: () => Promise<T>): Promise<T> {
  const run = anthropicAnalysisQueue.then(() => fn());
  anthropicAnalysisQueue = run.catch(() => undefined);
  return run;
}

/** Fila separada para perguntas — não espera análise de documentos terminar. */
export function enqueueAnthropicQaCall<T>(fn: () => Promise<T>): Promise<T> {
  const run = anthropicQaQueue.then(() => fn());
  anthropicQaQueue = run.catch(() => undefined);
  return run;
}

async function withRateLimitRetry(
  label: string,
  fn: () => Promise<AnthropicCallResult>,
  options?: { maxRetries?: number; waitMs?: number }
): Promise<AnthropicCallResult> {
  let result = await fn();
  let attempts = 0;
  const maxRetries = options?.maxRetries ?? rateLimitMaxRetries();
  const waitMs = options?.waitMs ?? rateLimitRetryWaitMs();

  while (!result.text && isRateLimitError(result.error) && attempts < maxRetries) {
    attempts += 1;
    console.warn(
      `[AnthropicDocument] ${label} rate limit — aguardando ${Math.round(waitMs / 1000)}s (tentativa ${attempts}/${maxRetries})`
    );
    await delay(waitMs);
    result = await fn();
  }

  return result;
}

export function isTransientAnthropicError(message?: string | null): boolean {
  if (!message) return false;
  if (isRateLimitError(message)) return false;
  const m = message.toLowerCase();
  return (
    m.includes('429') ||
    m.includes('529') ||
    m.includes('503') ||
    m.includes('502') ||
    m.includes('overloaded') ||
    m.includes('rate limit') ||
    m.includes('temporarily')
  );
}

function extractTextFromAnthropicResponse(data: {
  content?: Array<{ type: string; text?: string }>;
}): string | null {
  const parts =
    data.content
      ?.filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text!.trim()) ?? [];
  const text = parts.join('\n\n').trim();
  return text || null;
}
function buildAnthropicHeaders(content: AnthropicContentBlock[]): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY?.trim() ?? '',
    'anthropic-version': '2023-06-01',
  };
  if (content.some((block) => block.type === 'document')) {
    headers['anthropic-beta'] = PDF_BETA_HEADER;
  }
  return headers;
}

/** Converte arquivo em blocos de conteúdo para a API Messages da Anthropic. */
export function buildAnthropicBlocksFromDocument(doc: DocumentInput): AnthropicContentBlock[] {
  const mime = normalizeMime(doc.mimeType, doc.name);
  const base64 = doc.buffer.toString('base64');

  if (mime === 'application/pdf') {
    return [
      { type: 'text', text: `Documento: ${doc.name}` },
      {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      },
    ];
  }

  if (mime.startsWith('image/')) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
    const mediaType = allowed.find((t) => mime === t) ?? 'image/png';
    return [
      { type: 'text', text: `Imagem: ${doc.name}` },
      {
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      },
    ];
  }

  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    doc.name.toLowerCase().endsWith('.xlsx') ||
    doc.name.toLowerCase().endsWith('.xls')
  ) {
    return [{ type: 'text', text: xlsxBufferToText(doc.buffer, doc.name) }];
  }

  if (mime.startsWith('text/') || doc.name.toLowerCase().endsWith('.txt')) {
    const text = doc.buffer.toString('utf8').slice(0, 120_000);
    return [{ type: 'text', text: `Arquivo ${doc.name}:\n\n${text}` }];
  }

  return [
    {
      type: 'text',
      text: `[Arquivo "${doc.name}" (${mime}) não suportado para leitura automática. Envie PDF ou imagem para melhor resultado.]`,
    },
  ];
}

async function buildContentBlocksForDocuments(
  documents: DocumentInput[],
  mode: DocumentContentMode
): Promise<{ blocks: AnthropicContentBlock[]; usedPdf: boolean }> {
  const blocks: AnthropicContentBlock[] = [];
  let usedPdf = false;

  for (const doc of documents) {
    const mime = normalizeMime(doc.mimeType, doc.name);
    const preferText = mode === 'text' || mode === 'auto';
    const forcePdf = mode === 'pdf';

    if (!forcePdf && preferText && (mime === 'application/pdf' || mime.startsWith('text/'))) {
      const textContent = await buildDocumentTextForAi(doc);
      if (textContent) {
        const combined = [textContent.texto, textContent.tabelas].filter(Boolean).join('\n\n');
        blocks.push({ type: 'text', text: `Documento: ${doc.name}\n\n${combined}` });
        continue;
      }
    }

    const docBlocks = buildAnthropicBlocksFromDocument(doc);
    blocks.push(...docBlocks);
    if (docBlocks.some((block) => block.type === 'document')) {
      usedPdf = true;
    }
  }

  return { blocks, usedPdf };
}

export async function callAnthropicWithDocuments(
  system: string,
  instruction: string,
  documents: DocumentInput[],
  timeoutMs = 180_000
): Promise<string | null> {
  const result = await callAnthropicWithDocumentsDetailed(system, instruction, documents, timeoutMs);
  return result.text;
}

export async function callAnthropicWithDocumentsDetailed(
  system: string,
  instruction: string,
  documents: DocumentInput[],
  timeoutMs = 180_000,
  mode: DocumentContentMode = 'auto',
  options?: AnthropicTextOptions
): Promise<AnthropicCallResult> {
  lastAnthropicError = null;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { text: null, error: 'ANTHROPIC_API_KEY não configurada.' };
  }

  const model = options?.model ?? anthropicModelForLicitacaoAnalise();
  const maxTokens = options?.maxTokens ?? LICITACOES_MAX_TOKENS_PDF;

  const { blocks: documentBlocks, usedPdf } = await buildContentBlocksForDocuments(documents, mode);
  const content: AnthropicContentBlock[] = [{ type: 'text', text: instruction }, ...documentBlocks];

  console.info(
    `[AnthropicDocument] docs mode=${mode} model=${model} max_tokens=${maxTokens} pdf=${usedPdf}`
  );

  const maxAttempts = 3;
  let lastError: string | undefined;

  const execute = async (): Promise<AnthropicCallResult> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: buildAnthropicHeaders(content),
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: 'user', content }],
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          let detail = errText.slice(0, 500);
          try {
            const parsed = JSON.parse(errText) as { error?: { message?: string } };
            if (parsed.error?.message) detail = parsed.error.message;
          } catch {
            /* keep raw */
          }
          lastError = detail || `Erro ${res.status} na API Claude`;
          setAnthropicError(`API ${res.status}: ${detail}`);
          if (attempt < maxAttempts && isTransientAnthropicError(lastError)) {
            await delay(1500 * attempt);
            continue;
          }
          return { text: null, error: lastError };
        }

        const data = (await res.json()) as {
          content?: Array<{ type: string; text?: string }>;
          stop_reason?: string;
        };
        const text = extractTextFromAnthropicResponse(data);
        if (!text) {
          lastError = 'A API Claude não retornou texto na resposta.';
          return { text: null, error: lastError };
        }
        if (data.stop_reason === 'max_tokens') {
          return {
            text: `${text}\n\n_(Resposta truncada por limite de tamanho — peça detalhes de uma seção específica.)_`,
          };
        }
        return { text };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError =
          msg.includes('abort') || msg.includes('Abort')
            ? 'Tempo esgotado ao analisar os documentos. Tente com arquivos menores ou uma pergunta mais específica.'
            : msg;
        setAnthropicError(`request failed: ${lastError}`);
        if (attempt < maxAttempts && isTransientAnthropicError(lastError)) {
          await delay(1500 * attempt);
          continue;
        }
        return { text: null, error: lastError };
      } finally {
        clearTimeout(timer);
      }
    }

    return { text: null, error: lastError ?? 'Falha ao contactar a API Claude.' };
  };

  return enqueueAnthropicCall(() => withRateLimitRetry('docs', execute));
}

export async function callAnthropicText(
  system: string,
  user: string,
  timeoutMs = 90_000
): Promise<string | null> {
  const result = await callAnthropicTextDetailed(system, user, timeoutMs);
  return result.text;
}

export async function callAnthropicTextDetailed(
  system: string,
  user: string,
  timeoutMs = 90_000,
  options?: AnthropicTextOptions
): Promise<AnthropicCallResult> {
  lastAnthropicError = null;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { text: null, error: 'ANTHROPIC_API_KEY não configurada.' };
  }

  const model = options?.model ?? anthropicModelForLicitacaoQa();
  const maxTokens = options?.maxTokens ?? LICITACOES_MAX_TOKENS_QA;

  console.info(`[AnthropicDocument] text model=${model} max_tokens=${maxTokens}`);

  const execute = async (): Promise<AnthropicCallResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        let detail = errText.slice(0, 500);
        try {
          const parsed = JSON.parse(errText) as { error?: { message?: string } };
          if (parsed.error?.message) detail = parsed.error.message;
        } catch {
          /* keep raw */
        }
        setAnthropicError(`API ${res.status}: ${detail}`);
        return { text: null, error: detail || `Erro ${res.status} na API Claude` };
      }

      const data = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = extractTextFromAnthropicResponse(data);
      return { text, error: text ? undefined : 'Resposta vazia da API Claude.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAnthropicError(`request failed: ${msg}`);
      return { text: null, error: msg };
    } finally {
      clearTimeout(timer);
    }
  };

  return enqueueAnthropicQaCall(() =>
    withRateLimitRetry('text', execute, { maxRetries: 1, waitMs: 15_000 })
  );
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const candidates: string[] = [];

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim());
  candidates.push(trimmed);

  for (const candidate of candidates) {
    const direct = tryParseJsonRecord(candidate);
    if (direct) return direct;

    const balanced = extractBalancedJsonObject(candidate);
    if (balanced) {
      const parsed = tryParseJsonRecord(balanced);
      if (parsed) return parsed;
    }
  }

  return null;
}

function tryParseJsonRecord(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractBalancedJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}
