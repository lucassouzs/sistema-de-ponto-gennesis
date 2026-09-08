import { parseJsonObject } from './AnthropicDocumentService';

export type LicitacaoCamposExtraidos = {
  objeto?: string | null;
  valorEstimado?: string | null;
  valorEstimadoNumerico?: number | null;
  vigenciaContrato?: string | null;
  dataInicioContrato?: string | null;
  dataFimContrato?: string | null;
  numeroProcesso?: string | null;
  orgao?: string | null;
  modalidade?: string | null;
  prazoExecucao?: string | null;
  formaJulgamento?: string | null;
  permiteConsorcio?: string | null;
  formaDisputa?: string | null;
  descricaoImovel?: string | null;
  observacoes?: string | null;
  confianca?: string | null;
  origem: 'ia' | 'indisponivel';
};

const NESTED_KEYS = ['campos', 'dados', 'fields', 'extracao', 'informacoes', 'informações'];

const FIELD_ALIASES: Record<keyof Omit<LicitacaoCamposExtraidos, 'origem'>, string[]> = {
  objeto: ['objeto', 'objetoLicitacao', 'objeto_licitacao', 'descricaoObjeto', 'descricao_objeto'],
  valorEstimado: ['valorEstimado', 'valor_estimado', 'valorGlobal', 'valor_global', 'valorLicitacao'],
  valorEstimadoNumerico: ['valorEstimadoNumerico', 'valor_estimado_numerico'],
  vigenciaContrato: ['vigenciaContrato', 'vigencia_contrato', 'vigencia', 'prazoVigencia'],
  dataInicioContrato: ['dataInicioContrato', 'data_inicio_contrato', 'inicioContrato'],
  dataFimContrato: ['dataFimContrato', 'data_fim_contrato', 'fimContrato'],
  numeroProcesso: ['numeroProcesso', 'numero_processo', 'processo', 'numeroDoProcesso'],
  orgao: ['orgao', 'órgão', 'orgaoLicitante', 'orgao_licitante', 'entidade'],
  modalidade: ['modalidade', 'modalidadeLicitacao'],
  prazoExecucao: ['prazoExecucao', 'prazo_execucao', 'prazo'],
  formaJulgamento: [
    'formaJulgamento',
    'forma_julgamento',
    'formasJulgamento',
    'criterioJulgamento',
    'critérioJulgamento',
    'criterio_julgamento',
  ],
  permiteConsorcio: ['permiteConsorcio', 'permite_consorcio', 'consorcio', 'consórcio'],
  formaDisputa: ['formaDisputa', 'forma_disputa', 'modoDisputa', 'modo_disputa'],
  descricaoImovel: [
    'descricaoImovel',
    'descricao_imovel',
    'descriçãoImovel',
    'descricao_do_imovel',
    'descrição_do_imóvel',
  ],
  observacoes: ['observacoes', 'observações', 'observacao'],
  confianca: ['confianca', 'confiança', 'confidence'],
};

const RESUMO_SECTIONS: Record<
  keyof Omit<LicitacaoCamposExtraidos, 'origem' | 'valorEstimadoNumerico'>,
  string[]
> = {
  objeto: ['objeto', 'objeto da licitação', 'objeto da licitacao', 'descrição do objeto'],
  valorEstimado: ['valor estimado', 'valor global', 'valor da licitação', 'valores', 'orçamento'],
  vigenciaContrato: ['vigência do contrato', 'vigencia do contrato', 'vigência', 'vigencia', 'prazo de vigência'],
  dataInicioContrato: ['data de início', 'data inicio', 'início do contrato'],
  dataFimContrato: ['data de término', 'data de termino', 'fim do contrato'],
  numeroProcesso: ['número do processo', 'numero do processo', 'nº processo', 'processo licitatório'],
  orgao: ['órgão licitante', 'orgao licitante', 'órgão', 'orgao', 'entidade'],
  modalidade: ['modalidade', 'modalidade de licitação'],
  prazoExecucao: ['prazo de execução', 'prazo de execucao', 'prazo'],
  formaJulgamento: [
    'forma de julgamento',
    'formas de julgamento',
    'critério de julgamento',
    'criterio de julgamento',
    'julgamento das propostas',
  ],
  permiteConsorcio: [
    'permite consórcio',
    'permite consorcio',
    'consórcio',
    'consorcio',
    'participação em consórcio',
  ],
  formaDisputa: [
    'forma de disputa',
    'modo de disputa',
    'disputa',
    'modo de lances',
    'sessão pública',
  ],
  descricaoImovel: [
    'descrição do imóvel',
    'descricao do imovel',
    'imóvel',
    'imovel',
    'endereço do imóvel',
    'local de execução',
    'local da prestação',
    'endereço da sede',
  ],
  observacoes: ['observações', 'observacoes', 'observações gerais'],
  confianca: ['confiança', 'confianca'],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickScalar(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed && trimmed.toLowerCase() !== 'null' ? trimmed : null;
  }
  if (typeof value === 'number' && !Number.isNaN(value)) return String(value);
  return null;
}

function pickNumber(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(/[^\d,.-]/g, '').replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

export function flattenLicitacaoParsed(parsed: Record<string, unknown>): Record<string, unknown> {
  let flat: Record<string, unknown> = { ...parsed };

  for (const key of NESTED_KEYS) {
    const nested = flat[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      flat = { ...(nested as Record<string, unknown>), ...flat };
    }
  }

  return flat;
}

export function buildExtracaoFromParsed(
  parsed: Record<string, unknown> | null,
  origem: 'ia' | 'indisponivel' = 'ia'
): LicitacaoCamposExtraidos {
  const flat = flattenLicitacaoParsed(parsed ?? {});

  const pick = (field: keyof typeof FIELD_ALIASES): string | null => {
    for (const key of FIELD_ALIASES[field]) {
      const value = pickScalar(flat[key]);
      if (value) return value;
    }
    return null;
  };

  return {
    objeto: pick('objeto'),
    valorEstimado: pick('valorEstimado'),
    valorEstimadoNumerico: pickNumber(flat.valorEstimadoNumerico ?? flat.valor_estimado_numerico),
    vigenciaContrato: pick('vigenciaContrato'),
    dataInicioContrato: pick('dataInicioContrato'),
    dataFimContrato: pick('dataFimContrato'),
    numeroProcesso: pick('numeroProcesso'),
    orgao: pick('orgao'),
    modalidade: pick('modalidade'),
    prazoExecucao: pick('prazoExecucao'),
    formaJulgamento: pick('formaJulgamento'),
    permiteConsorcio: pick('permiteConsorcio'),
    formaDisputa: pick('formaDisputa'),
    descricaoImovel: pick('descricaoImovel'),
    observacoes: pick('observacoes'),
    confianca: pick('confianca'),
    origem,
  };
}

export function hasMainLicitacaoFields(extracao: LicitacaoCamposExtraidos): boolean {
  return Boolean(
    extracao.objeto?.trim() ||
      extracao.valorEstimado?.trim() ||
      extracao.vigenciaContrato?.trim() ||
      extracao.numeroProcesso?.trim() ||
      extracao.orgao?.trim() ||
      extracao.modalidade?.trim()
  );
}

function extractMarkdownSection(md: string, titles: string[]): string | null {
  for (const title of titles) {
    const re = new RegExp(
      `(?:^|\\n)#{1,3}\\s*${escapeRegExp(title)}[^\\n]*\\n+([\\s\\S]*?)(?=\\n#{1,3}\\s|$)`,
      'i'
    );
    const match = md.match(re);
    const content = match?.[1]?.trim();
    if (content) return content.replace(/\n{3,}/g, '\n\n').slice(0, 4000);
  }
  return null;
}

function extractLabeledLine(md: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(
      `(?:^|\\n|\\*\\*)\\s*${escapeRegExp(label)}\\s*\\*\\*?\\s*[:\\-–—]\\s*([^\\n]+)`,
      'i'
    );
    const match = md.match(re);
    const line = match?.[1]?.trim();
    if (line && line.length >= 2) return line.slice(0, 2000);
  }
  return null;
}

type SupplementaryField = 'formaJulgamento' | 'permiteConsorcio' | 'formaDisputa' | 'descricaoImovel';

const SUPPLEMENTARY_TEXT_RULES: Array<{
  field: SupplementaryField;
  patterns: RegExp[];
}> = [
  {
    field: 'formaJulgamento',
    patterns: [
      /forma\s+de\s+julgamento\s*[:\-–—]\s*([^\n.;]{3,300})/i,
      /crit[eé]rio\s+de\s+julgamento\s*[:\-–—]\s*([^\n.;]{3,300})/i,
      /julgamento\s+(?:das?\s+propostas?\s+)?(?:ser[aá]|ser|dar-se-á)\s+(?:por|pelo|pela)\s+([^\n.;]{3,200})/i,
      /(?:ser[aá]\s+adotad[ao])\s+o\s+(?:crit[eé]rio|modo)\s+(?:de\s+)?julgamento\s+(?:por|de)\s+([^\n.;]{3,200})/i,
      /\b(menor\s+pre[cç]o|t[eé]cnica\s+e\s+pre[cç]o|maior\s+desconto|melhor\s+t[eé]cnica|maior\s+lance)\b/i,
    ],
  },
  {
    field: 'permiteConsorcio',
    patterns: [
      /(?:permite|permitid[ao]|vedad[ao]|n[aã]o\s+permite|é\s+vedad[ao])[^\n]{0,100}cons[oó]rci[^\n]{0,200}/i,
      /cons[oó]rci[^\n]{0,80}(?:permite|permitid|vedad|proibid|n[aã]o\s+ser[aá])/i,
      /participa[cç][aã]o\s+(?:em\s+)?cons[oó]rci[^\n]{0,200}/i,
      /formação\s+de\s+cons[oó]rci[^\n]{0,200}/i,
    ],
  },
  {
    field: 'formaDisputa',
    patterns: [
      /forma\s+de\s+disputa\s*[:\-–—]\s*([^\n.;]{3,300})/i,
      /modo\s+de\s+disputa\s*[:\-–—]\s*([^\n.;]{3,300})/i,
      /disputa\s+(?:ser[aá]|dar-se-á)\s+(?:na\s+)?forma\s+([^\n.;]{3,200})/i,
      /disputa\s+(?:na\s+)?forma\s+([^\n.;]{3,200})/i,
      /modo\s+de\s+lances?\s*[:\-–—]\s*([^\n.;]{3,200})/i,
      /(?:preg[aã]o|concorr[eê]ncia|licita[cç][aã]o)\s+eletr[oô]nic[^\n]{0,120}/i,
      /sess[aã]o\s+p[uú]blica\s+eletr[oô]nic[^\n]{0,120}/i,
    ],
  },
  {
    field: 'descricaoImovel',
    patterns: [
      /descri[cç][aã]o\s+do\s+im[oó]vel\s*[:\-–—]\s*([^\n]{10,600})/i,
      /endere[cç]o\s+(?:do\s+)?(?:im[oó]vel|empreendimento|pr[eé]dio|sede)\s*[:\-–—]\s*([^\n]{10,500})/i,
      /local\s+(?:de\s+execu[cç][aã]o|da\s+presta[cç][aã]o(?:\s+do\s+servi[cç]o)?)\s*[:\-–—]\s*([^\n]{10,500})/i,
      /im[oó]vel\s+(?:situado|localizado)\s+(?:na|no|em)\s+([^\n]{10,400})/i,
    ],
  },
];

function extractFirstPatternMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const match = text.match(re);
    if (!match) continue;
    const captured = (match[1] ?? match[0])?.replace(/\s+/g, ' ').trim();
    if (captured && captured.length >= 3) return captured.slice(0, 2000);
  }
  return null;
}

export function fillExtracaoFromText(
  extracao: LicitacaoCamposExtraidos,
  text: string | null | undefined
): LicitacaoCamposExtraidos {
  if (!text?.trim()) return extracao;

  const normalized = text.replace(/\r\n/g, '\n');
  const filled = { ...extracao };

  for (const rule of SUPPLEMENTARY_TEXT_RULES) {
    const current = filled[rule.field];
    if (typeof current === 'string' && current.trim()) continue;
    const found = extractFirstPatternMatch(normalized, rule.patterns);
    if (found) filled[rule.field] = found;
  }

  if (
    !filled.formaDisputa?.trim() &&
    typeof filled.modalidade === 'string' &&
    /eletr[oô]nic/i.test(filled.modalidade)
  ) {
    filled.formaDisputa = 'Disputa em ambiente eletrônico';
  }

  return filled;
}

export function fillExtracaoFromResumo(
  extracao: LicitacaoCamposExtraidos,
  resumoDocumentos: string | null | undefined
): LicitacaoCamposExtraidos {
  if (!resumoDocumentos?.trim()) return extracao;

  const filled = { ...extracao };
  for (const [field, titles] of Object.entries(RESUMO_SECTIONS) as Array<
    [keyof typeof RESUMO_SECTIONS, string[]]
  >) {
    const current = filled[field];
    if (typeof current === 'string' && current.trim()) continue;
    const fromResumo = extractMarkdownSection(resumoDocumentos, titles);
    if (fromResumo) {
      (filled as Record<string, unknown>)[field] = fromResumo;
      continue;
    }
    const fromLabel = extractLabeledLine(resumoDocumentos, titles);
    if (fromLabel) {
      (filled as Record<string, unknown>)[field] = fromLabel;
    }
  }

  return fillExtracaoFromText(filled, resumoDocumentos);
}

export function mergeExtracaoPreferFilled(
  primary: LicitacaoCamposExtraidos,
  secondary: LicitacaoCamposExtraidos
): LicitacaoCamposExtraidos {
  const keys = [
    'objeto',
    'valorEstimado',
    'valorEstimadoNumerico',
    'vigenciaContrato',
    'dataInicioContrato',
    'dataFimContrato',
    'numeroProcesso',
    'orgao',
    'modalidade',
    'prazoExecucao',
    'formaJulgamento',
    'permiteConsorcio',
    'formaDisputa',
    'descricaoImovel',
    'observacoes',
    'confianca',
  ] as const;

  const merged: LicitacaoCamposExtraidos = { ...primary, origem: primary.origem };
  for (const key of keys) {
    const a = primary[key];
    const b = secondary[key];
    if ((a == null || (typeof a === 'string' && !a.trim())) && b != null) {
      (merged as Record<string, unknown>)[key] = b;
    }
  }
  return merged;
}

export function parseLicitacaoResponse(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw?.trim()) return null;

  let text = raw.trim();
  const closedFence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (closedFence?.[1]) {
    text = closedFence[1].trim();
  } else {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\n_\([^)]+\)_\s*$/, '').trim();
  }

  const fromBalanced = parseJsonObject(text) ?? parseJsonObject(raw.trim());
  if (fromBalanced) return fromBalanced;

  const fromRepair = tryParseTruncatedJsonObject(text);
  if (fromRepair) return fromRepair;

  return extractFieldsFromPartialJson(text);
}

function tryParseTruncatedJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  if (start < 0) return null;

  let slice = text.slice(start).replace(/\n_\([^)]+\)_\s*$/, '').trim();
  slice = slice.replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/s, '').replace(/,\s*"[^"]*"\s*:\s*[^,}\]]*$/s, '');

  for (const suffix of ['"}', '"}]', '"}]}', '"}}', '}}', '}', '']) {
    try {
      let candidate = slice + suffix;
      if (!candidate.endsWith('}')) candidate += '}';
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* try next suffix */
    }
  }
  return null;
}

const JSON_FIELD_NAMES = [
  'objeto',
  'valorEstimado',
  'vigenciaContrato',
  'dataInicioContrato',
  'dataFimContrato',
  'numeroProcesso',
  'orgao',
  'modalidade',
  'prazoExecucao',
  'formaJulgamento',
  'permiteConsorcio',
  'formaDisputa',
  'descricaoImovel',
  'observacoes',
  'confianca',
  'resumoDocumentos',
  'tabelasDocumentos',
] as const;

function unescapeJsonString(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function extractJsonStringField(text: string, field: string): string | null {
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 's');
  const match = text.match(re);
  if (match?.[1]) return unescapeJsonString(match[1]).trim() || null;
  return null;
}

function extractFieldsFromPartialJson(text: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  let found = 0;

  for (const field of JSON_FIELD_NAMES) {
    const nullRe = new RegExp(`"${field}"\\s*:\\s*null\\b`, 'i');
    if (nullRe.test(text)) {
      result[field] = null;
      found++;
      continue;
    }
    const str = extractJsonStringField(text, field);
    if (str) {
      result[field] = str;
      found++;
    }
  }

  return found > 0 ? result : null;
}

export function resolveExtracaoFromAiResponse(
  raw: string | null | undefined,
  partial: LicitacaoCamposExtraidos = buildExtracaoFromParsed(null)
): LicitacaoCamposExtraidos {
  if (!raw?.trim()) return partial;

  const parsed = parseLicitacaoResponse(raw);
  let extracao = parsed
    ? mergeExtracaoPreferFilled(partial, buildExtracaoFromParsed(parsed))
    : { ...partial };

  if (!hasMainLicitacaoFields(extracao)) {
    extracao = repairExtracaoFromRespostaBruta(extracao, raw);
  }

  const reparsed = parseLicitacaoResponse(raw);
  const resumo =
    typeof reparsed?.resumoDocumentos === 'string' ? reparsed.resumoDocumentos : null;
  extracao = fillExtracaoFromResumo(extracao, resumo);
  extracao = fillExtracaoFromText(extracao, [raw, resumo].filter(Boolean).join('\n\n'));

  return extracao;
}

export function repairExtracaoFromRespostaBruta(
  extracao: LicitacaoCamposExtraidos,
  respostaBruta?: string | null
): LicitacaoCamposExtraidos {
  if (!respostaBruta?.trim() || hasMainLicitacaoFields(extracao)) return extracao;
  const parsed = parseLicitacaoResponse(respostaBruta);
  if (!parsed) return extracao;
  const repaired = mergeExtracaoPreferFilled(extracao, buildExtracaoFromParsed(parsed));
  const resumoText =
    typeof parsed.resumoDocumentos === 'string' ? parsed.resumoDocumentos : null;
  return fillExtracaoFromText(
    fillExtracaoFromResumo(repaired, resumoText),
    [respostaBruta, resumoText].filter(Boolean).join('\n\n')
  );
}
