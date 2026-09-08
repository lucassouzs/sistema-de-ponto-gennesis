const MAX_CONTEXT_CHARS = 28_000;
const MAX_CONTEXT_CHARS_RETRY = 14_000;
const MAX_QA_EXCERPT_CHARS = 5_000;
const MAX_QA_RESUMO_CHARS = 2_500;
const MAX_QA_TABELAS_CHARS = 3_500;
const MAX_STORED_TEXT_CHARS = 400_000;

const DOMAIN_KEYWORDS = [
  'habilit',
  'document',
  'imped',
  'certame',
  'qualifica',
  'exig',
  'jurid',
  'fiscal',
  'trabalh',
  'econ',
  'tecnic',
  'licit',
  'contrat',
  'propost',
  'vigenc',
  'valor',
  'objeto',
  'modalidade',
  'referencia',
  'item',
  'anexo',
  'lote',
  'area',
  'tabela',
  'quantitat',
  'planilha',
  'metrag',
  'dimens',
];

export type DocumentoIndice = {
  documentoId: string;
  nome: string;
  texto: string;
  tabelas?: string;
  extraidoEm: string;
};

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function extractSearchTerms(question: string): string[] {
  const normalized = normalizeForSearch(question);
  const numbers = question.match(/\d{2,}/g) ?? [];
  const words = normalized.split(/\s+/).filter((w) => w.length >= 3);
  const extras: string[] = [];
  if (/lote/.test(normalized)) extras.push('lote');
  if (/area|área|m²|m2|metrag/.test(normalized)) extras.push('area', 'm2', 'm²');
  if (/tabela|quadro|planilha|quantitat/.test(normalized)) extras.push('tabela', 'lote', 'item');
  return [...new Set([...numbers, ...words, ...extras])];
}

function needsTableOrKeywordSearch(question: string): boolean {
  const q = normalizeForSearch(question);
  return (
    /\d{2,}/.test(question) ||
    /lote|area|tabela|m²|m2|quantitat|planilha|metrag|dimens|508|unidade/.test(q)
  );
}

/** Busca linha a linha — ideal para lotes, códigos numéricos e tabelas. */
export function buildKeywordLineContext(
  indice: DocumentoIndice[],
  question: string,
  maxTotalChars = MAX_QA_EXCERPT_CHARS
): string {
  const terms = extractSearchTerms(question);
  if (terms.length === 0) return '';

  type Hit = { nome: string; line: string; score: number };
  const hits: Hit[] = [];

  for (const doc of indice) {
    const sources = [
      { content: doc.tabelas ?? '', boost: 3 },
      { content: doc.texto, boost: 1 },
    ];

    for (const source of sources) {
      if (!source.content.trim()) continue;
      for (const rawLine of source.content.split('\n')) {
        const line = rawLine.trim();
        if (line.length < 3) continue;
        const norm = normalizeForSearch(line);
        let score = 0;
        for (const term of terms) {
          if (norm.includes(term)) {
            score += /^\d+$/.test(term) ? 8 * source.boost : 3 * source.boost;
          }
        }
        if (score > 0) hits.push({ nome: doc.nome, line, score });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);

  const parts: string[] = [];
  let used = 0;
  for (const hit of hits) {
    const chunk = `[${hit.nome}] ${hit.line}\n`;
    if (used + chunk.length > maxTotalChars) break;
    parts.push(chunk);
    used += chunk.length;
  }

  return parts.join('').trim();
}

function scoreParagraph(paragraph: string, question: string): number {
  const p = normalizeForSearch(paragraph);
  const numbers = question.match(/\d{2,}/g) ?? [];
  const words = normalizeForSearch(question)
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  let score = 0;
  for (const num of numbers) {
    if (p.includes(num)) score += 8;
  }
  for (const word of words) {
    if (p.includes(word)) score += 3;
  }
  for (const kw of DOMAIN_KEYWORDS) {
    if (p.includes(kw)) score += 1;
  }
  if (/^\d+(\.\d+)*[\s.)-]/.test(paragraph.trim())) score += 1;
  if (/\|/.test(paragraph)) score += 2;
  return score;
}

function splitParagraphs(text: string): string[] {
  const parts: string[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const trimmed = block.trim();
    if (trimmed.length > 25) {
      parts.push(trimmed);
    }
    for (const line of block.split('\n')) {
      const l = line.trim();
      if (l.length > 15 && (/\s{2,}|\|/.test(line) || TABLE_LINE_HINT.test(l))) {
        parts.push(l.replace(/\s{2,}/g, ' | '));
      }
    }
  }
  return [...new Set(parts)];
}

const TABLE_LINE_HINT =
  /lote|item|area|área|m²|valor|quantidade|\d{2,}.*\d{2,}/i;

export function buildRelevantDocumentContext(
  indice: DocumentoIndice[],
  question: string,
  maxTotalChars = MAX_CONTEXT_CHARS
): string {
  if (indice.length === 0) return '';

  if (needsTableOrKeywordSearch(question)) {
    const keywordCtx = buildKeywordLineContext(indice, question, maxTotalChars);
    if (keywordCtx.length > 200) return keywordCtx;
  }

  type Scored = { nome: string; paragraph: string; score: number };
  const sections: Scored[] = [];

  for (const doc of indice) {
    const combined = [doc.tabelas, doc.texto].filter(Boolean).join('\n\n');
    for (const paragraph of splitParagraphs(combined)) {
      sections.push({
        nome: doc.nome,
        paragraph,
        score: scoreParagraph(paragraph, question),
      });
    }
  }

  sections.sort((a, b) => b.score - a.score);

  const parts: string[] = [];
  let used = 0;
  const minFill = Math.floor(maxTotalChars * 0.35);

  for (const section of sections) {
    if (section.score <= 0 && used >= minFill) continue;

    const chunk = `### ${section.nome}\n${section.paragraph}\n\n`;
    if (used + chunk.length > maxTotalChars) break;
    parts.push(chunk);
    used += chunk.length;
  }

  if (parts.length === 0) {
    const perDoc = Math.floor(maxTotalChars / indice.length);
    for (const doc of indice) {
      const combined = [doc.tabelas, doc.texto].filter(Boolean).join('\n\n');
      parts.push(`### ${doc.nome}\n${combined.slice(0, perDoc)}\n\n`);
    }
  }

  return parts.join('').trim();
}

export type QaContextInput = {
  resumoDocumentos?: string | null;
  tabelasDocumentos?: string | null;
  ultimaExtracao?: unknown;
  indiceDocumentos?: DocumentoIndice[];
};

/** Monta contexto enxuto para Q&A — evita estourar o limite TPM da Anthropic. */
export function buildQaInstructionContext(
  pergunta: string,
  analise: QaContextInput
): { body: string; error?: string } {
  const indice = analise.indiceDocumentos ?? [];
  const tabelasFull =
    analise.tabelasDocumentos?.trim() || mergeTabelasFromIndice(indice) || '';

  const resumoRaw =
    analise.resumoDocumentos?.trim() ||
    (analise.ultimaExtracao
      ? `Dados extraídos:\n${JSON.stringify(analise.ultimaExtracao, null, 2)}`
      : '');

  if (!resumoRaw && !tabelasFull && indice.length === 0) {
    return {
      body: '',
      error:
        'Análise salva sem conteúdo suficiente. Clique em **Analisar documentos (IA)** novamente para reprocessar incluindo tabelas.',
    };
  }

  const trechos = buildRelevantDocumentContext(indice, pergunta, MAX_QA_EXCERPT_CHARS);

  let tabelasCtx = buildKeywordLineContext(indice, pergunta, MAX_QA_TABELAS_CHARS);
  if (tabelasCtx.length < 80 && tabelasFull) {
    const fromSaved = buildKeywordLineContext(
      [
        {
          documentoId: 'tabelas-salvas',
          nome: 'Tabelas salvas',
          texto: '',
          tabelas: tabelasFull,
          extraidoEm: '',
        },
      ],
      pergunta,
      MAX_QA_TABELAS_CHARS
    );
    tabelasCtx = fromSaved.length >= 80 ? fromSaved : tabelasFull.slice(0, MAX_QA_TABELAS_CHARS);
  }

  const resumo = resumoRaw.slice(0, MAX_QA_RESUMO_CHARS);
  const parts: string[] = [];
  if (resumo) parts.push(`## Resumo salvo da licitação\n${resumo}`);
  if (tabelasCtx) parts.push(`## Tabelas e quadros\n${tabelasCtx}`);
  if (trechos) parts.push(`## Trechos relevantes\n${trechos}`);

  const body = parts.join('\n\n').trim();
  console.info(
    `[licitacaoDocumentContext] Q&A contexto ~${body.length} chars (resumo=${resumo.length}, tabelas=${tabelasCtx.length}, trechos=${trechos.length})`
  );

  return { body };
}

export function mergeTabelasFromIndice(indice: DocumentoIndice[]): string {
  return indice
    .map((d) => (d.tabelas?.trim() ? `### ${d.nome}\n${d.tabelas}` : ''))
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MAX_STORED_TEXT_CHARS);
}

export function formatAnthropicErrorForUser(error?: string | null): string {
  if (!error?.trim()) {
    return 'Não foi possível obter resposta. Execute **Analisar documentos (IA)** novamente ou aguarde 1 minuto e tente outra vez.';
  }

  const lower = error.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('429')) {
    return 'Limite de tokens por minuto da API Claude atingido. O sistema tentará novamente automaticamente; se persistir, aguarde 1 minuto ou solicite aumento de limite no console da Anthropic.';
  }
  if (lower.includes('abort') || lower.includes('tempo esgotado')) {
    return 'A análise demorou demais. Tente uma pergunta mais específica ou aguarde e tente novamente.';
  }
  if (lower.includes('invalid') && lower.includes('api key')) {
    return 'Chave da API Claude inválida ou expirada. Verifique ANTHROPIC_API_KEY no servidor.';
  }

  return error.length > 350 ? `${error.slice(0, 350)}…` : error;
}

export function isRateLimitError(message?: string | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes('429') || m.includes('rate limit');
}

export { MAX_CONTEXT_CHARS, MAX_CONTEXT_CHARS_RETRY, MAX_QA_EXCERPT_CHARS, MAX_STORED_TEXT_CHARS };
