import { getPrisma } from '../lib/prisma';
import {
  createLicitacaoRegiaoManual,
  getCanonicalRegiaoHeaders,
  normalizeManualRowSnapshot,
} from './licitacaoRegiaoManualStore';
import { getPncpEnviadoAnaliseByNumero, createPncpEnviadoAnalise } from './pncpEnviadoAnaliseStore';
import { clearPncpRejeicaoIfAny } from './PncpRejeitarService';
import {
  fetchLicitacaoRegiaoSheet,
  findLicitacaoRegiaoTab,
  invalidateLicitacaoRegiaoSheetCache,
} from './LicitacoesPlanilhaSheetsService';

const UF_TO_REGIAO: Record<string, string> = {
  DF: 'centro-oeste',
  GO: 'centro-oeste',
  MT: 'centro-oeste',
  MS: 'centro-oeste',
  ES: 'sudeste',
  MG: 'sudeste',
  RJ: 'sudeste',
  SP: 'sudeste',
  AL: 'nordeste',
  BA: 'nordeste',
  CE: 'nordeste',
  MA: 'nordeste',
  PB: 'nordeste',
  PE: 'nordeste',
  PI: 'nordeste',
  RN: 'nordeste',
  SE: 'nordeste',
  PR: 'sul',
  RS: 'sul',
  SC: 'sul',
  AC: 'norte',
  AP: 'norte',
  AM: 'norte',
  PA: 'norte',
  RO: 'norte',
  RR: 'norte',
  TO: 'norte',
};

function ufToRegiaoKey(uf: string | null | undefined): string | null {
  const key = String(uf || '')
    .trim()
    .toUpperCase();
  return UF_TO_REGIAO[key] ?? null;
}

function formatCurrencyBr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBr(isoOrDate: Date | string | null | undefined): string {
  if (!isoOrDate) return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTimeBr(isoOrDate: Date | string | null | undefined): string {
  if (!isoOrDate) return '';
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildPncpEditalUrl(numeroControlePNCP: string | null | undefined): string {
  const m = String(numeroControlePNCP || '')
    .trim()
    .match(/^(\d{14})-\d+-(\d+)\s*\/\s*(\d{4})$/);
  if (!m) return '';
  const [, cnpj, seq, ano] = m;
  return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`;
}

/** Número do edital/pregão no sistema de origem (API PNCP: numeroCompra + ano). */
function formatPncpPregaoNumero(pncp: {
  numeroCompra?: string | null;
  sequencialCompra?: number | null;
  numeroControlePNCP?: string | null;
}): string {
  const controle = String(pncp.numeroControlePNCP || '').trim();
  const anoFromControle = controle.match(/\/(\d{4})$/)?.[1] || '';

  const compraRaw = String(pncp.numeroCompra || '').trim();
  if (compraRaw) {
    // Já veio como 26/2026 ou 90003/2026.
    if (/\d\s*\/\s*\d{4}/.test(compraRaw)) return compraRaw.replace(/\s/g, '');
    if (anoFromControle) return `${compraRaw}/${anoFromControle}`;
    return compraRaw;
  }

  const m = controle.match(/-(\d+)\s*\/\s*(\d{4})$/);
  if (m) {
    const seq = String(Number(m[1]));
    if (seq && m[2]) return `${seq}/${m[2]}`;
  }

  if (pncp.sequencialCompra != null && Number.isFinite(pncp.sequencialCompra)) {
    const seq = String(pncp.sequencialCompra);
    return anoFromControle ? `${seq}/${anoFromControle}` : seq;
  }
  return '';
}

function pickHeader(headers: string[], candidates: string[]): string | null {
  const normalized = candidates.map((c) =>
    c
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  );
  for (const header of headers) {
    const key = header
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (normalized.includes(key)) return header;
  }
  return null;
}

function setField(
  fields: Record<string, string>,
  headers: string[],
  candidates: string[],
  value: string
) {
  const header = pickHeader(headers, candidates);
  if (!header) return;
  const trimmed = value.trim();
  if (trimmed) fields[header] = trimmed;
}

export type EnviarPncpParaAnaliseResult = {
  alreadySent: boolean;
  numeroControlePNCP: string;
  regiaoKey: string;
  regiaoLabel: string;
  rowKey: string;
  enviadoAt: string;
};

export async function enviarPncpParaAnalise(input: {
  numeroControlePNCP: string;
  userId: string;
  regiaoKeyOverride?: string | null;
}): Promise<EnviarPncpParaAnaliseResult> {
  const numero = String(input.numeroControlePNCP || '').trim();
  if (!numero) {
    throw new Error('Informe o número de controle PNCP.');
  }

  const existing = await getPncpEnviadoAnaliseByNumero(numero);
  if (existing) {
    const tab = findLicitacaoRegiaoTab(existing.regiaoKey);
    return {
      alreadySent: true,
      numeroControlePNCP: existing.numeroControlePNCP,
      regiaoKey: existing.regiaoKey,
      regiaoLabel: tab?.label ?? existing.regiaoKey,
      rowKey: existing.rowKey,
      enviadoAt: existing.enviadoAt.toISOString(),
    };
  }

  const pncp = await getPrisma().pncpContratacao.findUnique({
    where: { numeroControlePNCP: numero },
  });
  if (!pncp) {
    throw new Error('Licitação PNCP não encontrada no espelho local.');
  }

  const regiaoKey =
    (input.regiaoKeyOverride && findLicitacaoRegiaoTab(input.regiaoKeyOverride)
      ? input.regiaoKeyOverride.trim()
      : null) || ufToRegiaoKey(pncp.uf);
  if (!regiaoKey) {
    throw new Error(`Não foi possível mapear a UF ${pncp.uf} para uma região.`);
  }

  const tab = findLicitacaoRegiaoTab(regiaoKey);
  if (!tab) {
    throw new Error('Região inválida.');
  }

  let headers: string[] = [];
  try {
    const sheet = await fetchLicitacaoRegiaoSheet(regiaoKey, false);
    headers = sheet.headers.length > 0 ? sheet.headers : getCanonicalRegiaoHeaders(regiaoKey);
  } catch {
    headers = getCanonicalRegiaoHeaders(regiaoKey);
  }

  const fields: Record<string, string> = {};
  setField(fields, headers, ['ESTADO'], pncp.uf || '');
  setField(fields, headers, ['ÓRGÃO', 'ORGAO'], pncp.orgao || pncp.unidadeCompradora || '');
  setField(fields, headers, ['OBJETO'], pncp.objeto || '');
  setField(fields, headers, ['VALOR ESTIMADO'], formatCurrencyBr(pncp.valorEstimado));
  setField(
    fields,
    headers,
    ['Nº DO PREGÃO', 'N DO PREGAO', 'NUMERO DO PREGAO'],
    formatPncpPregaoNumero(pncp)
  );
  setField(
    fields,
    headers,
    ['CÓDIGO / UASG', 'CODIGO / UASG', 'CODIGO UASG'],
    pncp.codigoUnidadeCompradora || pncp.cnpjOrgao || ''
  );
  setField(
    fields,
    headers,
    ['SITE/LOCAL', 'SITE', 'LOCAL'],
    pncp.linkSistemaOrigem || pncp.linkPncp || buildPncpEditalUrl(pncp.numeroControlePNCP)
  );
  // Abertura na coluna da planilha; encerramento fica no snapshot (UI "Período").
  setField(fields, headers, ['ABERTURA'], formatDateBr(pncp.dataAberturaProposta));
  setField(fields, headers, ['HORA'], formatTimeBr(pncp.dataAberturaProposta));
  setField(fields, headers, ['FASE DA LICITAÇÃO', 'FASE DA LICITACAO'], pncp.situacao || '');
  // Em ÓRGÃO a UI mostra esta linha como subtítulo (mesmo padrão da lista PNCP).
  setField(
    fields,
    headers,
    ['EMPRESA', 'EMPRESA '],
    [pncp.codigoUnidadeCompradora, pncp.unidadeCompradora].filter(Boolean).join(' - ')
  );
  setField(
    fields,
    headers,
    ['EDITAL'],
    buildPncpEditalUrl(pncp.numeroControlePNCP) || pncp.linkPncp || ''
  );

  const modalidade = String(pncp.modalidade || '').trim();
  const encerramentoEm = pncp.dataEncerramentoProposta;
  const rowSnapshot = {
    ...normalizeManualRowSnapshot(headers, fields),
    numeroControlePNCP: pncp.numeroControlePNCP,
    ...(modalidade ? { MODALIDADE: modalidade } : {}),
    ...(encerramentoEm
      ? {
          ENCERRAMENTO: formatDateBr(encerramentoEm),
          ENCERRAMENTO_HORA: formatTimeBr(encerramentoEm),
        }
      : {}),
  };

  if (Object.keys(normalizeManualRowSnapshot(headers, fields)).length === 0) {
    throw new Error('Não foi possível montar os campos da licitação.');
  }

  const created = await createLicitacaoRegiaoManual({
    regiaoKey,
    headers,
    rowSnapshot,
    createdBy: input.userId,
  });

  const enviado = await createPncpEnviadoAnalise({
    numeroControlePNCP: pncp.numeroControlePNCP,
    regiaoKey,
    rowKey: created.rowKey,
    enviadoBy: input.userId,
  });

  await clearPncpRejeicaoIfAny(pncp.numeroControlePNCP);

  invalidateLicitacaoRegiaoSheetCache(regiaoKey);

  return {
    alreadySent: false,
    numeroControlePNCP: pncp.numeroControlePNCP,
    regiaoKey,
    regiaoLabel: tab.label,
    rowKey: created.rowKey,
    enviadoAt: enviado.enviadoAt.toISOString(),
  };
}
