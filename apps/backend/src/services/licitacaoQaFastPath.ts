import type { LicitacaoCamposExtraidos } from './licitacaoFieldExtraction';

export type LicitacaoConversaCached = {
  pergunta: string;
  resposta: string;
};

function normalizeQuestion(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[?!.,;:]+$/g, '')
    .replace(/\s+/g, ' ');
}

export function findCachedConversaAnswer(
  pergunta: string,
  conversas: LicitacaoConversaCached[] | undefined
): string | null {
  const norm = normalizeQuestion(pergunta);
  if (!norm || !conversas?.length) return null;

  for (let i = conversas.length - 1; i >= 0; i -= 1) {
    const c = conversas[i];
    if (normalizeQuestion(c.pergunta) === norm && c.resposta?.trim()) {
      return c.resposta.trim();
    }
  }
  return null;
}

type FieldRule = {
  field: keyof Omit<LicitacaoCamposExtraidos, 'origem' | 'valorEstimadoNumerico'>;
  label: string;
  patterns: RegExp[];
};

const FIELD_RULES: FieldRule[] = [
  {
    field: 'objeto',
    label: 'Objeto',
    patterns: [
      /^qual\s+(e|é)\s+o\s+objeto/,
      /\bobjeto\s+(da\s+)?licitac/,
      /o\s+que\s+(e|é|sera|será)\s+licitado/,
      /descricao\s+do\s+objeto/,
    ],
  },
  {
    field: 'valorEstimado',
    label: 'Valor estimado',
    patterns: [
      /^qual\s+o\s+valor\s+estimado/,
      /\bvalor\s+estimado\b/,
      /\bvalor\s+global\b/,
      /^quanto\s+(custa|vale|e|é)/,
    ],
  },
  {
    field: 'vigenciaContrato',
    label: 'Vigência do contrato',
    patterns: [/^qual\s+a\s+vigencia/, /\bvigencia\s+do\s+contrato\b/, /\bprazo\s+contratual\b/],
  },
  {
    field: 'modalidade',
    label: 'Modalidade',
    patterns: [/^qual\s+a\s+modalidade/, /\bmodalidade\s+(da\s+)?licitac/],
  },
  {
    field: 'numeroProcesso',
    label: 'Número do processo',
    patterns: [/^qual\s+o\s+numero\s+do\s+processo/, /\bnumero\s+do\s+processo\b/, /\bn[ºo°]\s*processo\b/],
  },
  {
    field: 'orgao',
    label: 'Órgão licitante',
    patterns: [/^qual\s+o\s+orgao/, /\borgao\s+licitante\b/, /\bentidade\s+contratante\b/],
  },
  {
    field: 'prazoExecucao',
    label: 'Prazo de execução',
    patterns: [/^qual\s+o\s+prazo\s+de\s+execucao/, /\bprazo\s+de\s+execucao\b/],
  },
  {
    field: 'formaJulgamento',
    label: 'Forma de julgamento',
    patterns: [
      /^qual\s+a\s+forma\s+de\s+julgamento/,
      /\bforma\s+de\s+julgamento\b/,
      /\bcriterio\s+de\s+julgamento\b/,
    ],
  },
  {
    field: 'permiteConsorcio',
    label: 'Permite consórcio',
    patterns: [/^permite\s+consorcio/, /\bconsorcio\b/, /\bparticipacao\s+em\s+consorcio\b/],
  },
  {
    field: 'formaDisputa',
    label: 'Forma de disputa',
    patterns: [/^qual\s+a\s+forma\s+de\s+disputa/, /\bforma\s+de\s+disputa\b/, /\bmodo\s+de\s+disputa\b/],
  },
  {
    field: 'descricaoImovel',
    label: 'Descrição do imóvel',
    patterns: [
      /^qual\s+a\s+descricao\s+do\s+imovel/,
      /\bdescricao\s+do\s+imovel\b/,
      /\bendereco\s+do\s+imovel\b/,
    ],
  },
];

function formatFieldAnswer(label: string, value: string): string {
  return `**${label}:**\n\n${value.trim()}`;
}

export function tryAnswerFromExtracao(
  pergunta: string,
  extracao: Partial<LicitacaoCamposExtraidos> | null | undefined
): string | null {
  if (!extracao) return null;

  const norm = normalizeQuestion(pergunta);
  if (!norm) return null;

  for (const rule of FIELD_RULES) {
    if (!rule.patterns.some((re) => re.test(norm))) continue;
    const value = extracao[rule.field];
    if (typeof value === 'string' && value.trim()) {
      return formatFieldAnswer(rule.label, value);
    }
  }

  return null;
}

const RESUMO_SECTION_RULES: Array<{ label: string; titles: string[]; patterns: RegExp[] }> = [
  {
    label: 'Documentos de habilitação',
    titles: ['documentos de habilitação', 'documentos de habilitacao', 'habilitação', 'habilitacao'],
    patterns: [/\bhabilitac/, /\bdocumentos?\s+exigidos?\b/],
  },
  {
    label: 'Impedimentos e vedações',
    titles: ['impedimentos', 'vedações', 'vedacoes'],
    patterns: [/\bimpediment/, /\bvedac/],
  },
  {
    label: 'Critérios de julgamento',
    titles: ['critérios de julgamento', 'criterios de julgamento', 'critério de julgamento'],
    patterns: [/\bcriterio(s)?\s+de\s+julgamento\b/],
  },
];

function extractMarkdownSection(md: string, titles: string[]): string | null {
  for (const title of titles) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      `(?:^|\\n)#{1,3}\\s*${escaped}[^\\n]*\\n+([\\s\\S]*?)(?=\\n#{1,3}\\s|$)`,
      'i'
    );
    const match = md.match(re);
    const content = match?.[1]?.trim();
    if (content) return content.replace(/\n{3,}/g, '\n\n').slice(0, 3000);
  }
  return null;
}

export function tryAnswerFromResumo(pergunta: string, resumo: string | null | undefined): string | null {
  if (!resumo?.trim()) return null;

  const norm = normalizeQuestion(pergunta);
  if (!norm) return null;

  for (const rule of RESUMO_SECTION_RULES) {
    if (!rule.patterns.some((re) => re.test(norm))) continue;
    const section = extractMarkdownSection(resumo, rule.titles);
    if (section) return formatFieldAnswer(rule.label, section);
  }

  return null;
}

export function tryFastPathAnswer(
  pergunta: string,
  options: {
    conversas?: LicitacaoConversaCached[];
    extracao?: Partial<LicitacaoCamposExtraidos> | null;
    resumoDocumentos?: string | null;
  }
): string | null {
  return (
    findCachedConversaAnswer(pergunta, options.conversas) ??
    tryAnswerFromExtracao(pergunta, options.extracao) ??
    tryAnswerFromResumo(pergunta, options.resumoDocumentos)
  );
}
