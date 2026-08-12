import fs from 'fs';
import path from 'path';
import { backendUploadsRoot } from '../lib/uploads';
import { readPersistentUpload, savePersistentUpload } from '../lib/persistentUpload';
import { getPrisma } from '../lib/prisma';
import { buildLicitacaoTituloExibicao } from '../lib/licitacaoDisplay';
import { extractRegiaoKeyFromAnaliseJson, extractRegiaoLabelFromAnaliseJson } from '../lib/licitacaoRegiao';
import { extractEstadoFromAnaliseJson } from '../lib/licitacaoEstado';
import {
  anthropicModelForLicitacaoAnalise,
  anthropicModelForLicitacaoQa,
  callAnthropicTextDetailed,
  callAnthropicWithDocumentsDetailed,
  getLastAnthropicError,
  isAnthropicConfigured,
  LICITACOES_MAX_TOKENS_ANALISE,
  LICITACOES_MAX_TOKENS_QA,
  parseJsonObject,
  type DocumentInput,
} from './AnthropicDocumentService';
import { buildDocumentTextForAi } from './documentTextExtractor';
import {
  buildExtracaoFromParsed,
  fillExtracaoFromResumo,
  fillExtracaoFromText,
  hasMainLicitacaoFields,
  mergeExtracaoPreferFilled,
  parseLicitacaoResponse,
  repairExtracaoFromRespostaBruta,
  resolveExtracaoFromAiResponse,
  type LicitacaoCamposExtraidos,
} from './licitacaoFieldExtraction';
import {
  buildQaInstructionContext,
  buildRelevantDocumentContext,
  formatAnthropicErrorForUser,
  mergeTabelasFromIndice,
  MAX_CONTEXT_CHARS,
  MAX_STORED_TEXT_CHARS,
  type DocumentoIndice,
} from './licitacaoDocumentContext';
import { tryFastPathAnswer } from './licitacaoQaFastPath';
import { syncAllPendingAceitesToLicitacoes } from './licitacaoRegiaoAceiteLicitacaoSync';
import { unlinkAceitesFromDeletedLicitacao } from './licitacaoRegiaoAceiteStore';
import {
  licitacaoStoreAddDocumento,
  licitacaoStoreCreate,
  licitacaoStoreDelete,
  licitacaoStoreDeleteDocumento,
  licitacaoStoreFindDocumento,
  licitacaoStoreGetById,
  licitacaoStoreList,
  licitacaoStoreListDocumentos,
  licitacaoStoreUpdate,
  type LicitacaoArquivadaMotivo,
  type LicitacaoListFilters,
  isLicitacaoArquivadaMotivo,
} from './licitacaoStore';

const UPLOAD_SUBDIR = 'licitacoes';
const MAX_FILE_SIZE = 15 * 1024 * 1024;

const ANALISE_COMPLETA_SYSTEM = `Você é um assistente especializado em licitações públicas brasileiras.
Analise os trechos dos documentos fornecidos UMA ÚNICA VEZ e produza um JSON válido (sem markdown envolvendo o JSON).

REGRA OBRIGATÓRIA: preencha na RAIZ do JSON os campos objeto, valorEstimado, vigenciaContrato, numeroProcesso, orgao, modalidade, formaJulgamento, permiteConsorcio, formaDisputa e descricaoImovel com texto extraído dos documentos. Não deixe esses campos null se a informação existir no edital.

Formato (todos os campos na raiz, sem aninhar em "campos" ou "dados"):
{
  "objeto": "descrição do objeto da licitação",
  "valorEstimado": "valor em texto (ex.: R$ 1.500.000,00)",
  "valorEstimadoNumerico": null,
  "vigenciaContrato": "prazo de vigência do contrato em texto",
  "dataInicioContrato": "data ou null",
  "dataFimContrato": "data ou null",
  "numeroProcesso": "número do processo licitatório ou null",
  "orgao": "órgão licitante ou null",
  "modalidade": "modalidade ou null",
  "prazoExecucao": "prazo de execução ou null",
  "formaJulgamento": "OBRIGATÓRIO se constar no edital: menor preço, técnica e preço, maior desconto etc.",
  "permiteConsorcio": "OBRIGATÓRIO se constar no edital: sim/não e condições (ex.: vedada participação em consórcio)",
  "formaDisputa": "OBRIGATÓRIO se constar no edital: aberto, fechado, aberto e fechado, pregão eletrônico etc.",
  "descricaoImovel": "endereço/local de execução/descrição do imóvel quando constar; senão null",
  "observacoes": "outras informações relevantes ou null",
  "confianca": "alta|media|baixa",
  "resumoDocumentos": "resumo completo em Markdown com seções ## cobrindo: objeto, forma de julgamento, consórcio, forma de disputa, descrição do imóvel, documentos de habilitação, impedimentos/vedações, prazos, valores, critérios de julgamento, vigência, lotes e demais informações úteis para consultas futuras — use listas e parágrafos separados",
  "tabelasDocumentos": "TODAS as tabelas e quadros dos documentos em Markdown (use | coluna | formato), incluindo lotes, áreas (m²), valores, quantitativos, planilhas de preços e cronogramas — não omita nenhuma tabela"
}
Use null apenas quando a informação realmente não constiver nos documentos. Não invente dados.
O campo resumoDocumentos será reutilizado para responder perguntas posteriores sem reler os PDFs.`;

const QA_SYSTEM = `Você é um assistente especializado em licitações públicas brasileiras.
Responda perguntas com base APENAS no resumo e nos dados da análise já salva (fornecidos abaixo).
Não peça para reler documentos — use exclusivamente o material salvo.
Seja objetivo e indique quando a informação não consta na análise salva.
Responda em português do Brasil.

FORMATAÇÃO (Markdown):
- Resposta direta na primeira linha em **negrito**.
- Use listas curtas quando necessário; evite textos longos.
- Separe parágrafos com linha em branco.`;

export type LicitacaoExtracao = {
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

export type LicitacaoConversa = {
  pergunta: string;
  resposta: string;
  em: string;
};

export type LicitacaoOrigemRegiao = {
  regiaoKey?: string;
  regiaoLabel?: string;
  spreadsheetId?: string;
  rowKey?: string;
  aceiteId?: string;
  aceiteEm?: string;
  aceitePor?: string;
  aceitePorNome?: string;
  estado?: string | null;
  rowSnapshot?: Record<string, string> | null;
};

export type LicitacaoAnalisePersistida = {
  ultimaExtracao?: (LicitacaoExtracao & { extraidoEm?: string; respostaBruta?: string }) | null;
  historicoExtracoes: Array<LicitacaoExtracao & { extraidoEm: string; respostaBruta?: string }>;
  conversas: LicitacaoConversa[];
  indiceDocumentos?: DocumentoIndice[];
  resumoDocumentos?: string | null;
  tabelasDocumentos?: string | null;
  analisePronta?: boolean;
  analiseProntaEm?: string | null;
  responsavelAnalise?: string | null;
  responsavelAnaliseId?: string | null;
  responsavelAnaliseEm?: string | null;
  analiseUsuario?: string | null;
  analiseUsuarioAtualizadaEm?: string | null;
  checklistAnalise?: Record<string, { checked: boolean; comentario: string | null }>;
  linkNotebookLm?: string | null;
  naoSeHabilita?: boolean;
  naoSeHabilitaItens?: Array<{ id: string; title: string; isDone: boolean }>;
  analiseManualFinalizada?: boolean;
  analiseManualFinalizadaEm?: string | null;
  origemRegiao?: LicitacaoOrigemRegiao | null;
  arquivadaMotivo?: string | null;
  decisaoAnaliseFinal?: LicitacaoDecisaoAnaliseFinal | null;
  decisaoAnaliseFinalEm?: string | null;
  analiseFinalTexto?: string | null;
  analiseFinalTextoAtualizadaEm?: string | null;
};

export const LICITACAO_DECISAO_ANALISE_FINAL = [
  'participar',
  'participar_consorcio',
  'nao_participar',
] as const;

export type LicitacaoDecisaoAnaliseFinal = (typeof LICITACAO_DECISAO_ANALISE_FINAL)[number];

export function isLicitacaoDecisaoAnaliseFinal(
  value: unknown
): value is LicitacaoDecisaoAnaliseFinal {
  return (
    typeof value === 'string' &&
    (LICITACAO_DECISAO_ANALISE_FINAL as readonly string[]).includes(value)
  );
}

function documentIdsFingerprint(docIds: string[]): string {
  return [...docIds].sort().join('|');
}

function isAnaliseCacheValid(
  analise: LicitacaoAnalisePersistida,
  docsMeta: Array<{ id: string }>
): boolean {
  if (docsMeta.length === 0) return false;

  const cached = analise.indiceDocumentos ?? [];
  const idsMatch =
    cached.length > 0 &&
    documentIdsFingerprint(docsMeta.map((d) => d.id)) ===
      documentIdsFingerprint(cached.map((d) => d.documentoId));

  if (analise.analisePronta && analise.resumoDocumentos?.trim() && idsMatch) return true;
  if (idsMatch && analise.ultimaExtracao && (analise.historicoExtracoes?.length ?? 0) > 0) return true;
  if (analise.analisePronta && analise.resumoDocumentos?.trim()) return true;

  return false;
}

function serializeAnaliseJsonForClient(raw: unknown): LicitacaoAnalisePersistida {
  const analise = parseAnaliseJson(raw);
  return {
    ...analise,
    indiceDocumentos: (analise.indiceDocumentos ?? []).map((d) => ({
      documentoId: d.documentoId,
      nome: d.nome,
      extraidoEm: d.extraidoEm,
      texto: '',
      tabelas: d.tabelas ? '[tabelas salvas na análise]' : undefined,
    })),
  };
}

function analiseCacheInvalidada(): Partial<LicitacaoAnalisePersistida> {
  return {
    analisePronta: false,
    analiseProntaEm: null,
    resumoDocumentos: null,
    tabelasDocumentos: null,
    indiceDocumentos: [],
  };
}

function parseChecklistAnalise(
  raw: unknown
): Record<string, { checked: boolean; comentario: string | null }> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, { checked: boolean; comentario: string | null }> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    const o = val as { checked?: unknown; comentario?: unknown };
    out[key] = {
      checked: o.checked === true,
      comentario: typeof o.comentario === 'string' ? o.comentario : null,
    };
  }
  return Object.keys(out).length ? out : undefined;
}

function parseNaoSeHabilitaItens(
  raw: unknown
): Array<{ id: string; title: string; isDone: boolean }> {
  if (!Array.isArray(raw)) return [];
  const items: Array<{ id: string; title: string; isDone: boolean }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const o = entry as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    if (!id || !title) continue;
    items.push({ id, title, isDone: o.isDone === true });
  }
  return items;
}

function parseOrigemRegiao(raw: unknown): LicitacaoOrigemRegiao | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Partial<LicitacaoOrigemRegiao>;
  const rowSnapshot =
    o.rowSnapshot && typeof o.rowSnapshot === 'object' && !Array.isArray(o.rowSnapshot)
      ? (o.rowSnapshot as Record<string, string>)
      : null;
  return {
    regiaoKey: typeof o.regiaoKey === 'string' ? o.regiaoKey : undefined,
    regiaoLabel: typeof o.regiaoLabel === 'string' ? o.regiaoLabel : undefined,
    spreadsheetId: typeof o.spreadsheetId === 'string' ? o.spreadsheetId : undefined,
    rowKey: typeof o.rowKey === 'string' ? o.rowKey : undefined,
    aceiteId: typeof o.aceiteId === 'string' ? o.aceiteId : undefined,
    aceiteEm: typeof o.aceiteEm === 'string' ? o.aceiteEm : undefined,
    aceitePor: typeof o.aceitePor === 'string' ? o.aceitePor : undefined,
    aceitePorNome: typeof o.aceitePorNome === 'string' ? o.aceitePorNome : undefined,
    estado: typeof o.estado === 'string' ? o.estado : null,
    rowSnapshot,
  };
}

function parseAnaliseJson(raw: unknown): LicitacaoAnalisePersistida {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { historicoExtracoes: [], conversas: [] };
  }
  const o = raw as Partial<LicitacaoAnalisePersistida>;
  return {
    ultimaExtracao: o.ultimaExtracao ?? null,
    historicoExtracoes: Array.isArray(o.historicoExtracoes) ? o.historicoExtracoes : [],
    conversas: Array.isArray(o.conversas) ? o.conversas : [],
    indiceDocumentos: Array.isArray(o.indiceDocumentos) ? o.indiceDocumentos : [],
    resumoDocumentos: typeof o.resumoDocumentos === 'string' ? o.resumoDocumentos : null,
    tabelasDocumentos: typeof o.tabelasDocumentos === 'string' ? o.tabelasDocumentos : null,
    analisePronta: o.analisePronta === true,
    analiseProntaEm: typeof o.analiseProntaEm === 'string' ? o.analiseProntaEm : null,
    responsavelAnalise: typeof o.responsavelAnalise === 'string' ? o.responsavelAnalise : null,
    responsavelAnaliseId:
      typeof o.responsavelAnaliseId === 'string' ? o.responsavelAnaliseId : null,
    responsavelAnaliseEm:
      typeof o.responsavelAnaliseEm === 'string' ? o.responsavelAnaliseEm : null,
    analiseUsuario: typeof o.analiseUsuario === 'string' ? o.analiseUsuario : null,
    analiseUsuarioAtualizadaEm:
      typeof o.analiseUsuarioAtualizadaEm === 'string' ? o.analiseUsuarioAtualizadaEm : null,
    linkNotebookLm: typeof o.linkNotebookLm === 'string' ? o.linkNotebookLm : null,
    checklistAnalise: parseChecklistAnalise(o.checklistAnalise),
    naoSeHabilita: o.naoSeHabilita === true,
    naoSeHabilitaItens: parseNaoSeHabilitaItens(o.naoSeHabilitaItens),
    analiseManualFinalizada: o.analiseManualFinalizada === true,
    analiseManualFinalizadaEm:
      typeof o.analiseManualFinalizadaEm === 'string' ? o.analiseManualFinalizadaEm : null,
    origemRegiao: parseOrigemRegiao(o.origemRegiao),
    arquivadaMotivo:
      typeof o.arquivadaMotivo === 'string' && isLicitacaoArquivadaMotivo(o.arquivadaMotivo)
        ? o.arquivadaMotivo
        : null,
    decisaoAnaliseFinal: isLicitacaoDecisaoAnaliseFinal(o.decisaoAnaliseFinal)
      ? o.decisaoAnaliseFinal
      : null,
    decisaoAnaliseFinalEm:
      typeof o.decisaoAnaliseFinalEm === 'string' ? o.decisaoAnaliseFinalEm : null,
    analiseFinalTexto: typeof o.analiseFinalTexto === 'string' ? o.analiseFinalTexto : null,
    analiseFinalTextoAtualizadaEm:
      typeof o.analiseFinalTextoAtualizadaEm === 'string' ? o.analiseFinalTextoAtualizadaEm : null,
  };
}

/** IDs de responsáveis (legado: um UUID; atual: lista separada por vírgula). */
export function parseResponsavelAnaliseIds(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const part of raw.split(/[,;|]/)) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Primeiro e segundo nome para exibição concatenada. */
export function shortPersonName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Usuário';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1]}`;
}

async function resolveResponsaveisShortNames(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const users = await getPrisma().user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const byId = new Map(users.map((u) => [u.id, shortPersonName(u.name)]));
  return userIds.map((id) => byId.get(id) || 'Usuário');
}

function mergeAnaliseJson(
  current: unknown,
  patch: Partial<LicitacaoAnalisePersistida>
): LicitacaoAnalisePersistida {
  const base = parseAnaliseJson(current);
  return {
    ultimaExtracao: patch.ultimaExtracao !== undefined ? patch.ultimaExtracao : base.ultimaExtracao,
    historicoExtracoes: patch.historicoExtracoes ?? base.historicoExtracoes,
    conversas: patch.conversas ?? base.conversas,
    indiceDocumentos: patch.indiceDocumentos ?? base.indiceDocumentos,
    resumoDocumentos: patch.resumoDocumentos !== undefined ? patch.resumoDocumentos : base.resumoDocumentos,
    tabelasDocumentos:
      patch.tabelasDocumentos !== undefined ? patch.tabelasDocumentos : base.tabelasDocumentos,
    analisePronta: patch.analisePronta !== undefined ? patch.analisePronta : base.analisePronta,
    analiseProntaEm: patch.analiseProntaEm !== undefined ? patch.analiseProntaEm : base.analiseProntaEm,
    responsavelAnalise:
      patch.responsavelAnalise !== undefined ? patch.responsavelAnalise : base.responsavelAnalise,
    responsavelAnaliseId:
      patch.responsavelAnaliseId !== undefined
        ? patch.responsavelAnaliseId
        : base.responsavelAnaliseId,
    responsavelAnaliseEm:
      patch.responsavelAnaliseEm !== undefined
        ? patch.responsavelAnaliseEm
        : base.responsavelAnaliseEm,
    analiseUsuario: patch.analiseUsuario !== undefined ? patch.analiseUsuario : base.analiseUsuario,
    analiseUsuarioAtualizadaEm:
      patch.analiseUsuarioAtualizadaEm !== undefined
        ? patch.analiseUsuarioAtualizadaEm
        : base.analiseUsuarioAtualizadaEm,
    linkNotebookLm:
      patch.linkNotebookLm !== undefined ? patch.linkNotebookLm : base.linkNotebookLm,
    checklistAnalise:
      patch.checklistAnalise !== undefined ? patch.checklistAnalise : base.checklistAnalise,
    naoSeHabilita:
      patch.naoSeHabilita !== undefined ? patch.naoSeHabilita : base.naoSeHabilita,
    naoSeHabilitaItens:
      patch.naoSeHabilitaItens !== undefined
        ? patch.naoSeHabilitaItens
        : base.naoSeHabilitaItens,
    analiseManualFinalizada:
      patch.analiseManualFinalizada !== undefined
        ? patch.analiseManualFinalizada
        : base.analiseManualFinalizada,
    analiseManualFinalizadaEm:
      patch.analiseManualFinalizadaEm !== undefined
        ? patch.analiseManualFinalizadaEm
        : base.analiseManualFinalizadaEm,
    origemRegiao:
      patch.origemRegiao !== undefined ? patch.origemRegiao : base.origemRegiao,
    arquivadaMotivo:
      patch.arquivadaMotivo !== undefined ? patch.arquivadaMotivo : base.arquivadaMotivo,
    decisaoAnaliseFinal:
      patch.decisaoAnaliseFinal !== undefined ? patch.decisaoAnaliseFinal : base.decisaoAnaliseFinal,
    decisaoAnaliseFinalEm:
      patch.decisaoAnaliseFinalEm !== undefined
        ? patch.decisaoAnaliseFinalEm
        : base.decisaoAnaliseFinalEm,
    analiseFinalTexto:
      patch.analiseFinalTexto !== undefined ? patch.analiseFinalTexto : base.analiseFinalTexto,
    analiseFinalTextoAtualizadaEm:
      patch.analiseFinalTextoAtualizadaEm !== undefined
        ? patch.analiseFinalTextoAtualizadaEm
        : base.analiseFinalTextoAtualizadaEm,
  };
}

function resolveArquivadaMotivo(row: {
  arquivadaMotivo?: string | null;
  analiseJson?: unknown;
}): LicitacaoArquivadaMotivo | null {
  if (isLicitacaoArquivadaMotivo(row.arquivadaMotivo)) return row.arquivadaMotivo;
  const fromJson = parseAnaliseJson(row.analiseJson).arquivadaMotivo;
  if (isLicitacaoArquivadaMotivo(fromJson)) return fromJson;
  return null;
}

function enrichLicitacaoRow<T extends {
  objeto: string | null;
  valorEstimado: string | null;
  vigenciaContrato: string | null;
  numeroProcesso: string | null;
  orgao: string | null;
  modalidade: string | null;
  analiseJson: unknown;
}>(row: T): T {
  const analise = parseAnaliseJson(row.analiseJson);
  let ultima = analise.ultimaExtracao ?? null;
  if (ultima && typeof ultima.respostaBruta === 'string') {
    ultima = repairExtracaoFromRespostaBruta(ultima, ultima.respostaBruta);
    const parsed = parseLicitacaoResponse(ultima.respostaBruta);
    if (parsed) {
      ultima = mergeExtracaoPreferFilled(
        ultima as LicitacaoCamposExtraidos,
        buildExtracaoFromParsed(parsed)
      );
    }
  }
  if (ultima && analise.resumoDocumentos) {
    ultima = fillExtracaoFromResumo(ultima as LicitacaoCamposExtraidos, analise.resumoDocumentos);
  }
  const indiceText = (analise.indiceDocumentos ?? [])
    .map((d) => [d.texto, d.tabelas].filter(Boolean).join('\n\n'))
    .join('\n\n');
  if (ultima) {
    ultima = fillExtracaoFromText(
      ultima as LicitacaoCamposExtraidos,
      [
        indiceText,
        analise.resumoDocumentos,
        typeof ultima.respostaBruta === 'string' ? ultima.respostaBruta : null,
      ]
        .filter(Boolean)
        .join('\n\n')
    );
  }

  const pick = (col: string | null, fromExtracao: string | null | undefined) =>
    col?.trim() ? col : fromExtracao?.trim() ? fromExtracao.trim() : null;

  return {
    ...row,
    objeto: pick(row.objeto, ultima?.objeto),
    valorEstimado: pick(row.valorEstimado, ultima?.valorEstimado),
    vigenciaContrato: pick(row.vigenciaContrato, ultima?.vigenciaContrato),
    numeroProcesso: pick(row.numeroProcesso, ultima?.numeroProcesso),
    orgao: pick(row.orgao, ultima?.orgao),
    modalidade: pick(row.modalidade, ultima?.modalidade),
    analiseJson:
      ultima && ultima !== analise.ultimaExtracao
        ? { ...analise, ultimaExtracao: ultima }
        : analise,
  };
}

function serializeLicitacao(row: {
  id: string;
  titulo: string;
  numeroProcesso: string | null;
  orgao: string | null;
  modalidade: string | null;
  status: string;
  objeto: string | null;
  valorEstimado: string | null;
  estado?: string | null;
  regiaoKey?: string | null;
  vigenciaContrato: string | null;
  analiseJson: unknown;
  arquivada?: boolean;
  arquivadaEm?: Date | null;
  arquivadaMotivo?: LicitacaoArquivadaMotivo | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  creator?: { id: string; name: string } | null;
  documentos?: Array<{
    id: string;
    originalName: string;
    storagePath: string;
    mimeType: string;
    size: number;
    createdAt: Date;
  }>;
}) {
  const enriched = enrichLicitacaoRow(row);
  const estado =
    enriched.estado?.trim().toUpperCase() ||
    extractEstadoFromAnaliseJson(enriched.analiseJson) ||
    null;
  const regiaoKey =
    enriched.regiaoKey?.trim().toLowerCase() ||
    extractRegiaoKeyFromAnaliseJson(enriched.analiseJson) ||
    null;
  const regiaoLabel = extractRegiaoLabelFromAnaliseJson(enriched.analiseJson) || null;
  const tituloExibicao = buildLicitacaoTituloExibicao({
    titulo: enriched.titulo,
    estado,
    valorEstimado: enriched.valorEstimado,
    analiseJson: enriched.analiseJson,
  });
  return {
    ...enriched,
    estado,
    regiaoKey,
    regiaoLabel,
    tituloExibicao,
    arquivada: row.arquivada === true,
    arquivadaEm: row.arquivadaEm ? row.arquivadaEm.toISOString() : null,
    arquivadaMotivo: resolveArquivadaMotivo(row),
    analiseJson: serializeAnaliseJsonForClient(enriched.analiseJson),
    documentos: row.documentos?.map((d) => ({
      ...d,
      url: d.storagePath.startsWith('/') ? d.storagePath : `/${d.storagePath}`,
    })),
  };
}

async function readDocumentBuffer(storagePath: string): Promise<Buffer> {
  const buf = await readPersistentUpload(storagePath);
  if (!buf) throw new Error('Arquivo do documento não encontrado');
  return buf;
}

export class LicitacaoService {
  async list(filters: LicitacaoListFilters = {}) {
    await syncAllPendingAceitesToLicitacoes();
    const rows = await licitacaoStoreList({
      search: filters.search,
      dataInicio: filters.dataInicio,
      dataFim: filters.dataFim,
      regiaoKey: filters.regiaoKey,
      estado: filters.estado,
      arquivada: filters.arquivada,
      arquivadaMotivo: filters.arquivadaMotivo,
    });

    return rows.map(serializeLicitacao);
  }

  async getById(id: string) {
    const row = await licitacaoStoreGetById(id);
    if (!row) return null;

    const repaired = await this.repairStoredExtractionIfNeeded(id, row);
    return serializeLicitacao(repaired ?? row);
  }

  private async repairStoredExtractionIfNeeded(
    id: string,
    row: NonNullable<Awaited<ReturnType<typeof licitacaoStoreGetById>>>
  ) {
    const analise = parseAnaliseJson(row.analiseJson);
    const bruta = analise.ultimaExtracao?.respostaBruta;
    if (typeof bruta !== 'string') return null;

    if (row.objeto?.trim() && hasMainLicitacaoFields((analise.ultimaExtracao ?? buildExtracaoFromParsed(null)) as LicitacaoCamposExtraidos)) {
      return null;
    }

    const extracao = resolveExtracaoFromAiResponse(
      bruta,
      (analise.ultimaExtracao as LicitacaoCamposExtraidos | undefined) ?? buildExtracaoFromParsed(null)
    );
    if (!hasMainLicitacaoFields(extracao)) return null;

    const reparsed = parseLicitacaoResponse(bruta);
    const resumoDocumentos =
      typeof reparsed?.resumoDocumentos === 'string'
        ? reparsed.resumoDocumentos.slice(0, MAX_STORED_TEXT_CHARS)
        : analise.resumoDocumentos;

    const extracaoPersistida = {
      ...extracao,
      extraidoEm: analise.ultimaExtracao?.extraidoEm ?? new Date().toISOString(),
      respostaBruta: bruta,
    };

    await licitacaoStoreUpdate(id, {
      objeto: extracao.objeto,
      valorEstimado: extracao.valorEstimado,
      vigenciaContrato: extracao.vigenciaContrato,
      numeroProcesso: extracao.numeroProcesso,
      orgao: extracao.orgao,
      modalidade: extracao.modalidade,
      analiseJson: mergeAnaliseJson(analise, {
        ultimaExtracao: extracaoPersistida,
        resumoDocumentos,
        analisePronta: Boolean(resumoDocumentos?.trim() || extracao.objeto),
      }),
    });

    console.info(`[LicitacaoService] campos reparados a partir da resposta salva (${id})`);
    return licitacaoStoreGetById(id);
  }

  async create(userId: string, data: { titulo: string; numeroProcesso?: string; orgao?: string; modalidade?: string }) {
    const titulo = data.titulo?.trim();
    if (!titulo) throw new Error('Informe o título da licitação');

    const row = await licitacaoStoreCreate(userId, {
      titulo,
      numeroProcesso: data.numeroProcesso,
      orgao: data.orgao,
      modalidade: data.modalidade,
    });
    return serializeLicitacao(row);
  }

  async update(
    id: string,
    data: Partial<{
      titulo: string;
      numeroProcesso: string;
      orgao: string;
      modalidade: string;
      status: string;
      objeto: string;
      valorEstimado: string;
      vigenciaContrato: string;
      responsavelAnalise: string;
      linkNotebookLm: string;
      analiseUsuario: string;
      checklistAnalise: Record<string, { checked: boolean; comentario: string }>;
      naoSeHabilita: boolean;
      naoSeHabilitaItens: Array<{ id: string; title: string; isDone: boolean }>;
      decisaoAnaliseFinal: LicitacaoDecisaoAnaliseFinal | null;
      analiseFinalTexto: string;
    }>
  ) {
    const hasAnaliseManual =
      data.responsavelAnalise !== undefined ||
      data.linkNotebookLm !== undefined ||
      data.analiseUsuario !== undefined ||
      data.checklistAnalise !== undefined ||
      data.naoSeHabilita !== undefined ||
      data.naoSeHabilitaItens !== undefined;
    const hasAnaliseFinal =
      data.decisaoAnaliseFinal !== undefined || data.analiseFinalTexto !== undefined;

    let analiseJsonPatch: Partial<LicitacaoAnalisePersistida> | undefined;
    if (hasAnaliseManual || hasAnaliseFinal) {
      const current = await licitacaoStoreGetById(id);
      if (!current) throw new Error('Licitação não encontrada');
      const checklistPatch =
        data.checklistAnalise !== undefined
          ? Object.fromEntries(
              Object.entries(data.checklistAnalise).map(([key, val]) => [
                key,
                {
                  checked: Boolean(val.checked),
                  comentario: val.comentario?.trim() || null,
                },
              ])
            )
          : undefined;
      const patch: Partial<LicitacaoAnalisePersistida> = {
        ...(data.responsavelAnalise !== undefined
          ? { responsavelAnalise: data.responsavelAnalise.trim() || null }
          : {}),
        ...(data.analiseUsuario !== undefined
          ? { analiseUsuario: data.analiseUsuario.trim() || null }
          : {}),
        ...(data.linkNotebookLm !== undefined
          ? { linkNotebookLm: data.linkNotebookLm.trim() || null }
          : {}),
        ...(checklistPatch !== undefined ? { checklistAnalise: checklistPatch } : {}),
        ...(data.naoSeHabilita !== undefined
          ? { naoSeHabilita: data.naoSeHabilita === true }
          : {}),
        ...(data.naoSeHabilitaItens !== undefined
          ? { naoSeHabilitaItens: parseNaoSeHabilitaItens(data.naoSeHabilitaItens) }
          : {}),
        ...(data.decisaoAnaliseFinal !== undefined
          ? {
              decisaoAnaliseFinal:
                data.decisaoAnaliseFinal && isLicitacaoDecisaoAnaliseFinal(data.decisaoAnaliseFinal)
                  ? data.decisaoAnaliseFinal
                  : null,
              decisaoAnaliseFinalEm: data.decisaoAnaliseFinal
                ? new Date().toISOString()
                : null,
            }
          : {}),
        ...(data.analiseFinalTexto !== undefined
          ? {
              analiseFinalTexto: data.analiseFinalTexto.trim() || null,
              analiseFinalTextoAtualizadaEm: new Date().toISOString(),
            }
          : {}),
      };
      if (hasAnaliseManual) {
        patch.analiseUsuarioAtualizadaEm = new Date().toISOString();
        patch.analiseManualFinalizada = false;
        patch.analiseManualFinalizadaEm = null;
      }
      analiseJsonPatch = mergeAnaliseJson(current.analiseJson, patch);
    }

    const row = await licitacaoStoreUpdate(id, {
      ...(data.titulo !== undefined ? { titulo: data.titulo.trim() } : {}),
      ...(data.numeroProcesso !== undefined ? { numeroProcesso: data.numeroProcesso.trim() || null } : {}),
      ...(data.orgao !== undefined ? { orgao: data.orgao.trim() || null } : {}),
      ...(data.modalidade !== undefined ? { modalidade: data.modalidade.trim() || null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.objeto !== undefined ? { objeto: data.objeto.trim() || null } : {}),
      ...(data.valorEstimado !== undefined ? { valorEstimado: data.valorEstimado.trim() || null } : {}),
      ...(data.vigenciaContrato !== undefined ? { vigenciaContrato: data.vigenciaContrato.trim() || null } : {}),
      ...(analiseJsonPatch ? { analiseJson: analiseJsonPatch } : {}),
    });
    return serializeLicitacao(row);
  }

  async finalizarAnaliseManual(id: string) {
    const current = await licitacaoStoreGetById(id);
    if (!current) throw new Error('Licitação não encontrada');

    const analise = parseAnaliseJson(current.analiseJson);
    const linkNotebookLm = analise.linkNotebookLm?.trim() ?? '';
    if (!linkNotebookLm) {
      throw new Error('Informe o link do caderno no Notebook LM para finalizar a análise.');
    }
    try {
      const url = new URL(/^https?:\/\//i.test(linkNotebookLm) ? linkNotebookLm : `https://${linkNotebookLm}`);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('invalid');
      }
    } catch {
      throw new Error('Informe um link válido do caderno no Notebook LM para finalizar a análise.');
    }

    const now = new Date().toISOString();
    const row = await licitacaoStoreUpdate(id, {
      analiseJson: mergeAnaliseJson(current.analiseJson, {
        analiseManualFinalizada: true,
        analiseManualFinalizadaEm: now,
      }),
    });
    return serializeLicitacao(row);
  }

  async assumirAnaliseManual(id: string, userId: string, userName?: string) {
    const current = await licitacaoStoreGetById(id);
    if (!current) throw new Error('Licitação não encontrada');

    const analise = parseAnaliseJson(current.analiseJson);
    const claimedIds = parseResponsavelAnaliseIds(analise.responsavelAnaliseId);

    if (claimedIds.includes(userId)) {
      // Já está na lista — só normaliza nomes curtos se necessário.
      const names = await resolveResponsaveisShortNames(claimedIds);
      const joinedNames = names.join(', ');
      if (analise.responsavelAnalise?.trim() === joinedNames) {
        return serializeLicitacao(current);
      }
      const row = await licitacaoStoreUpdate(id, {
        analiseJson: mergeAnaliseJson(current.analiseJson, {
          responsavelAnalise: joinedNames,
          responsavelAnaliseId: claimedIds.join(','),
        }),
      });
      return serializeLicitacao(row);
    }

    // O último a assumir a tarefa deve vir em primeiro na lista.
    const nextIds = [userId, ...claimedIds];
    let shortName = shortPersonName(userName);
    if (!userName?.trim()) {
      const user = await getPrisma().user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      shortName = shortPersonName(user?.name);
    }

    // Reconstrói a lista de nomes a partir dos IDs (e do nome recém-assumido).
    const existingNames = claimedIds.length
      ? await resolveResponsaveisShortNames(claimedIds)
      : [];
    const nextNames = [shortName, ...existingNames];

    const row = await licitacaoStoreUpdate(id, {
      analiseJson: mergeAnaliseJson(current.analiseJson, {
        responsavelAnalise: nextNames.join(', '),
        responsavelAnaliseId: nextIds.join(','),
        responsavelAnaliseEm: new Date().toISOString(),
      }),
    });
    return serializeLicitacao(row);
  }

  async liberarAnaliseManual(id: string, userId: string, isAdmin: boolean) {
    const current = await licitacaoStoreGetById(id);
    if (!current) throw new Error('Licitação não encontrada');

    const analise = parseAnaliseJson(current.analiseJson);
    const claimedIds = parseResponsavelAnaliseIds(analise.responsavelAnaliseId);

    if (claimedIds.length === 0) {
      // Limpa nome legado sem trava real, se ainda existir.
      if (!analise.responsavelAnalise?.trim()) {
        return serializeLicitacao(current);
      }
      const row = await licitacaoStoreUpdate(id, {
        analiseJson: mergeAnaliseJson(current.analiseJson, {
          responsavelAnalise: null,
          responsavelAnaliseId: null,
          responsavelAnaliseEm: null,
        }),
      });
      return serializeLicitacao(row);
    }

    const isClaimant = claimedIds.includes(userId);
    if (!isClaimant && !isAdmin) {
      throw new Error('Somente quem assumiu a análise (ou um administrador) pode liberá-la.');
    }

    // Quem assumiu remove a si; admin que não está na lista libera todos.
    const nextIds =
      isClaimant ? claimedIds.filter((idItem) => idItem !== userId) : [];

    if (nextIds.length === 0) {
      const row = await licitacaoStoreUpdate(id, {
        analiseJson: mergeAnaliseJson(current.analiseJson, {
          responsavelAnalise: null,
          responsavelAnaliseId: null,
          responsavelAnaliseEm: null,
        }),
      });
      return serializeLicitacao(row);
    }

    const nextNames = await resolveResponsaveisShortNames(nextIds);
    const row = await licitacaoStoreUpdate(id, {
      analiseJson: mergeAnaliseJson(current.analiseJson, {
        responsavelAnalise: nextNames.join(', '),
        responsavelAnaliseId: nextIds.join(','),
        responsavelAnaliseEm: analise.responsavelAnaliseEm ?? new Date().toISOString(),
      }),
    });
    return serializeLicitacao(row);
  }

  async arquivarAnalise(id: string, motivo: LicitacaoArquivadaMotivo) {
    const current = await licitacaoStoreGetById(id);
    if (!current) throw new Error('Licitação não encontrada');

    const resolvedMotivo = resolveArquivadaMotivo(current);
    if (current.arquivada && resolvedMotivo === motivo) {
      return serializeLicitacao(current);
    }

    const row = await licitacaoStoreUpdate(id, {
      arquivada: true,
      arquivadaEm: current.arquivadaEm ?? new Date(),
      arquivadaMotivo: motivo,
      analiseJson: mergeAnaliseJson(current.analiseJson, { arquivadaMotivo: motivo }),
    });
    return serializeLicitacao(row);
  }

  async desarquivarAnalise(id: string) {
    const current = await licitacaoStoreGetById(id);
    if (!current) throw new Error('Licitação não encontrada');
    if (!current.arquivada) return serializeLicitacao(current);

    const row = await licitacaoStoreUpdate(id, {
      arquivada: false,
      arquivadaEm: null,
      arquivadaMotivo: null,
      analiseJson: mergeAnaliseJson(current.analiseJson, { arquivadaMotivo: null }),
    });
    return serializeLicitacao(row);
  }

  async delete(id: string) {
    const current = await licitacaoStoreGetById(id);
    if (!current) throw new Error('Licitação não encontrada');

    // Mantém o aceite na planilha; só desvincula e evita o sync recriar o processo.
    await unlinkAceitesFromDeletedLicitacao(id);

    const docs = await licitacaoStoreDelete(id);
    for (const doc of docs) {
      try {
        const relative = doc.storagePath.replace(/^\/uploads\//, '');
        fs.unlinkSync(path.join(backendUploadsRoot, relative));
      } catch {
        /* ignore */
      }
    }
  }

  async addDocument(
    licitacaoId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number }
  ) {
    if (!file.buffer?.length) throw new Error('Selecione um arquivo');
    if (file.size > MAX_FILE_SIZE) throw new Error('Arquivo muito grande. Máximo: 15 MB');

    const saved = await savePersistentUpload({
      folder: UPLOAD_SUBDIR,
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });

    const storagePath = saved.url;
    const doc = await licitacaoStoreAddDocumento({
      licitacaoId,
      originalName: file.originalname || saved.fileName,
      storagePath,
      mimeType: file.mimetype || 'application/octet-stream',
      size: file.size,
    });

    const licitacao = await licitacaoStoreGetById(licitacaoId);
    const analiseAtual = parseAnaliseJson(licitacao?.analiseJson);

    await licitacaoStoreUpdate(licitacaoId, {
      status: 'DOCUMENTOS_ANEXADOS',
      analiseJson: mergeAnaliseJson(analiseAtual, analiseCacheInvalidada()),
    });

    return {
      ...doc,
      url: storagePath,
    };
  }

  async removeDocument(licitacaoId: string, documentoId: string) {
    const doc = await licitacaoStoreFindDocumento(licitacaoId, documentoId);
    if (!doc) throw new Error('Documento não encontrado');

    await licitacaoStoreDeleteDocumento(documentoId);
    try {
      const relative = doc.storagePath.replace(/^\/uploads\//, '');
      fs.unlinkSync(path.join(backendUploadsRoot, relative));
    } catch {
      /* ignore */
    }

    const licitacao = await licitacaoStoreGetById(licitacaoId);
    const analiseAtual = parseAnaliseJson(licitacao?.analiseJson);
    await licitacaoStoreUpdate(licitacaoId, {
      analiseJson: mergeAnaliseJson(analiseAtual, analiseCacheInvalidada()),
    });
  }

  private async loadDocumentsForAi(licitacaoId: string): Promise<DocumentInput[]> {
    const docs = await licitacaoStoreListDocumentos(licitacaoId);
    if (docs.length === 0) throw new Error('Anexe pelo menos um documento antes de analisar');

    const out: DocumentInput[] = [];
    for (const d of docs) {
      out.push({
        buffer: await readDocumentBuffer(d.storagePath),
        mimeType: d.mimeType,
        name: d.originalName,
      });
    }
    return out;
  }

  private async buildDocumentIndex(
    licitacaoId: string,
    analiseAtual: LicitacaoAnalisePersistida,
    documentInputs: DocumentInput[]
  ): Promise<{ indice: DocumentoIndice[]; analiseAtual: LicitacaoAnalisePersistida }> {
    const extraidoEm = new Date().toISOString();
    const docsMeta = await licitacaoStoreListDocumentos(licitacaoId);
    const indice: DocumentoIndice[] = [];

    for (const meta of docsMeta) {
      const input =
        documentInputs.find((d) => d.name === meta.originalName) ??
        documentInputs[docsMeta.indexOf(meta)];
      if (!input) continue;

      const extracted = await buildDocumentTextForAi(input);
      const texto = extracted
        ? extracted.texto.slice(0, MAX_STORED_TEXT_CHARS)
        : `[Não foi possível extrair texto de "${meta.originalName}".]`;
      const tabelas = extracted?.tabelas?.slice(0, MAX_STORED_TEXT_CHARS) ?? '';

      indice.push({
        documentoId: meta.id,
        nome: meta.originalName,
        texto,
        tabelas: tabelas || undefined,
        extraidoEm,
      });
    }

    const novaAnalise = mergeAnaliseJson(analiseAtual, { indiceDocumentos: indice });
    console.info(`[LicitacaoService] índice de documentos criado: ${indice.length} arquivo(s)`);
    return { indice, analiseAtual: novaAnalise };
  }

  private async askFromCachedAnalysis(
    pergunta: string,
    analise: LicitacaoAnalisePersistida
  ): Promise<{ text: string | null; error?: string }> {
    const { body, error } = buildQaInstructionContext(pergunta, analise);
    if (error || !body) {
      return { text: null, error: error ?? 'Contexto insuficiente para responder.' };
    }

    const instruction = `${body}

Pergunta do usuário: ${pergunta}

Responda de forma concisa com base no material acima.`;

    return callAnthropicTextDetailed(QA_SYSTEM, instruction, 45_000, {
      model: anthropicModelForLicitacaoQa(),
      maxTokens: LICITACOES_MAX_TOKENS_QA,
    });
  }

  private async persistConversa(
    licitacaoId: string,
    analiseAtual: LicitacaoAnalisePersistida,
    pergunta: string,
    resposta: string
  ): Promise<void> {
    const novaConversa: LicitacaoConversa = {
      pergunta,
      resposta,
      em: new Date().toISOString(),
    };

    await licitacaoStoreUpdate(licitacaoId, {
      analiseJson: mergeAnaliseJson(analiseAtual, {
        conversas: [...analiseAtual.conversas, novaConversa],
      }),
    });
  }

  async extrairInformacoes(licitacaoId: string): Promise<LicitacaoExtracao> {
    if (!isAnthropicConfigured()) {
      return { origem: 'indisponivel', observacoes: 'API do Claude não configurada (ANTHROPIC_API_KEY).' };
    }

    const licitacaoAtual = await licitacaoStoreGetById(licitacaoId);
    let analiseAtual = parseAnaliseJson(licitacaoAtual?.analiseJson);
    const documents = await this.loadDocumentsForAi(licitacaoId);
    const indexed = await this.buildDocumentIndex(licitacaoId, analiseAtual, documents);
    analiseAtual = indexed.analiseAtual;

    const trechos = buildRelevantDocumentContext(
      indexed.indice,
      'objeto valor vigencia modalidade orgao processo prazo execucao habilitacao documentos impedimentos licitacao contrato lote area tabela quantitativo planilha metragem julgamento consorcio disputa imovel imóvel',
      MAX_CONTEXT_CHARS
    );

    const tabelasExtraidas = mergeTabelasFromIndice(indexed.indice);

    let raw: string | null = null;
    let erro: string | undefined;
    let extracao = buildExtracaoFromParsed(null);

    if (trechos.trim()) {
      const textResult = await callAnthropicTextDetailed(
        ANALISE_COMPLETA_SYSTEM,
        `Trechos dos documentos:\n\n${trechos}\n\n${
          tabelasExtraidas ? `Tabelas extraídas automaticamente:\n${tabelasExtraidas}\n\n` : ''
        }Produza o JSON completo no formato especificado (campos na raiz do objeto), incluindo resumoDocumentos e tabelasDocumentos (todas as tabelas).`,
        180_000,
        { model: anthropicModelForLicitacaoAnalise(), maxTokens: LICITACOES_MAX_TOKENS_ANALISE }
      );
      raw = textResult.text;
      erro = textResult.error ?? erro;
    }

    if (!raw) {
      const docResult = await callAnthropicWithDocumentsDetailed(
        ANALISE_COMPLETA_SYSTEM,
        'Analise os documentos anexados e produza o JSON completo no formato especificado (campos na raiz), incluindo resumoDocumentos.',
        documents,
        240_000,
        'pdf',
        { model: anthropicModelForLicitacaoAnalise() }
      );
      raw = docResult.text;
      erro = docResult.error ?? erro;
    }

    if (!raw && !hasMainLicitacaoFields(extracao)) {
      const detail = formatAnthropicErrorForUser(erro ?? getLastAnthropicError());
      return { origem: 'indisponivel', observacoes: detail };
    }

    extracao = resolveExtracaoFromAiResponse(raw, extracao);

    const reparsed = raw ? parseLicitacaoResponse(raw) : null;
    const resumoDocumentos =
      typeof reparsed?.resumoDocumentos === 'string'
        ? reparsed.resumoDocumentos.slice(0, MAX_STORED_TEXT_CHARS)
        : null;
    const tabelasDocumentos =
      typeof reparsed?.tabelasDocumentos === 'string'
        ? reparsed.tabelasDocumentos.slice(0, MAX_STORED_TEXT_CHARS)
        : tabelasExtraidas || null;

    const docText = indexed.indice
      .map((d) => [d.texto, d.tabelas].filter(Boolean).join('\n\n'))
      .join('\n\n');
    extracao = fillExtracaoFromText(
      extracao,
      [docText, resumoDocumentos, raw].filter(Boolean).join('\n\n')
    );

    if (!hasMainLicitacaoFields(extracao)) {
      console.warn('[LicitacaoService] análise concluída sem campos estruturados preenchidos');
    } else {
      console.info('[LicitacaoService] campos extraídos:', {
        objeto: Boolean(extracao.objeto),
        valorEstimado: Boolean(extracao.valorEstimado),
        vigenciaContrato: Boolean(extracao.vigenciaContrato),
        numeroProcesso: Boolean(extracao.numeroProcesso),
        orgao: Boolean(extracao.orgao),
        formaJulgamento: Boolean(extracao.formaJulgamento),
        permiteConsorcio: Boolean(extracao.permiteConsorcio),
        formaDisputa: Boolean(extracao.formaDisputa),
        descricaoImovel: Boolean(extracao.descricaoImovel),
      });
    }

    const extraidoEm = new Date().toISOString();
    const extracaoPersistida = { ...extracao, extraidoEm, respostaBruta: raw ?? undefined };

    const novaAnalise = mergeAnaliseJson(analiseAtual, {
      ultimaExtracao: extracaoPersistida,
      historicoExtracoes: [...analiseAtual.historicoExtracoes, extracaoPersistida],
      resumoDocumentos,
      tabelasDocumentos,
      analisePronta: Boolean(resumoDocumentos?.trim() || tabelasDocumentos?.trim() || extracao.objeto),
      analiseProntaEm: extraidoEm,
    });

    await licitacaoStoreUpdate(licitacaoId, {
      status: 'ANALISADO',
      objeto: extracao.objeto,
      valorEstimado: extracao.valorEstimado,
      vigenciaContrato: extracao.vigenciaContrato,
      numeroProcesso: extracao.numeroProcesso,
      orgao: extracao.orgao,
      modalidade: extracao.modalidade,
      analiseJson: novaAnalise,
    });

    console.info(`[LicitacaoService] análise completa salva — perguntas usarão cache`);
    return extracao;
  }

  async perguntar(licitacaoId: string, pergunta: string): Promise<{ resposta: string; origem: 'ia' | 'indisponivel' }> {
    const q = pergunta?.trim();
    if (!q) throw new Error('Informe a pergunta');

    if (!isAnthropicConfigured()) {
      return {
        resposta: 'A API do Claude não está configurada. Configure ANTHROPIC_API_KEY no servidor.',
        origem: 'indisponivel',
      };
    }

    const licitacao = await licitacaoStoreGetById(licitacaoId);
    if (!licitacao) throw new Error('Licitação não encontrada');

    const analiseAtual = parseAnaliseJson(licitacao.analiseJson);
    const docsMeta = await licitacaoStoreListDocumentos(licitacaoId);

    if (!isAnaliseCacheValid(analiseAtual, docsMeta)) {
      return {
        resposta:
          'Os documentos ainda não foram analisados. Clique em **Analisar documentos (IA)** uma vez; depois disso as perguntas serão respondidas com base na análise salva, sem reler os PDFs.',
        origem: 'indisponivel',
      };
    }

    console.info(`[LicitacaoService] Q&A usando cache salvo (${q.length} chars)`);

    const respostaRapida = tryFastPathAnswer(q, {
      conversas: analiseAtual.conversas,
      extracao: analiseAtual.ultimaExtracao as LicitacaoCamposExtraidos | undefined,
      resumoDocumentos: analiseAtual.resumoDocumentos,
    });

    if (respostaRapida) {
      console.info('[LicitacaoService] Q&A resposta instantânea (cache local)');
      const jaSalva = analiseAtual.conversas.some(
        (c) => c.pergunta.trim() === q && c.resposta.trim() === respostaRapida.trim()
      );
      if (!jaSalva) {
        await this.persistConversa(licitacaoId, analiseAtual, q, respostaRapida);
      }
      return { resposta: respostaRapida, origem: 'ia' };
    }

    let result = await this.askFromCachedAnalysis(q, analiseAtual);

    const resposta = result.text;
    if (!resposta) {
      const detail = formatAnthropicErrorForUser(result.error ?? getLastAnthropicError());
      console.error('[LicitacaoService] Q&A falhou:', detail);

      const novaConversa: LicitacaoConversa = {
        pergunta: q,
        resposta: detail,
        em: new Date().toISOString(),
      };

      await licitacaoStoreUpdate(licitacaoId, {
        analiseJson: mergeAnaliseJson(analiseAtual, {
          conversas: [...analiseAtual.conversas, novaConversa],
        }),
      });

      return { resposta: detail, origem: 'indisponivel' };
    }

    await this.persistConversa(licitacaoId, analiseAtual, q, resposta);

    return { resposta, origem: 'ia' };
  }
}

export const licitacaoService = new LicitacaoService();
