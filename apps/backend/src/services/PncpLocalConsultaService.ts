import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  normalizePncpSearchText,
  type PncpConsultaParams,
  type PncpConsultaResult,
  type PncpContratacaoListItem,
} from './PncpConsultaService';
import { listAllPncpEnviadoNumeros, listPncpEnviadosAnaliseByNumeros } from './pncpEnviadoAnaliseStore';

function toYyyymmdd(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 8) {
    throw new Error('Data inválida. Use o formato AAAAMMDD ou AAAA-MM-DD.');
  }
  return digits;
}

function yyyymmddToDateStart(yyyymmdd: string): Date {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function yyyymmddToDateEnd(yyyymmdd: string): Date {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

function parseNumeroControlePncp(raw: string): string | null {
  const m = String(raw || '')
    .trim()
    .match(/^(\d{14})-(\d+)-(\d+)\s*\/\s*(\d{4})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}/${m[4]}`;
}

function rowToItem(row: {
  sequencialCompra: number | null;
  numeroControlePNCP: string;
  processo: string | null;
  numeroCompra?: string | null;
  objeto: string | null;
  orgao: string | null;
  cnpjOrgao: string | null;
  unidadeCompradora: string | null;
  codigoUnidadeCompradora: string | null;
  uf: string;
  municipio: string | null;
  modalidade: string | null;
  situacao: string | null;
  modoDisputa: string | null;
  plataforma: string | null;
  srp: boolean | null;
  valorEstimado: number | null;
  valorHomologado: number | null;
  dataInclusao: Date | null;
  dataAberturaProposta: Date | null;
  dataEncerramentoProposta: Date | null;
  amparoLegal: string | null;
  linkSistemaOrigem: string | null;
  linkPncp: string | null;
}): PncpContratacaoListItem {
  return {
    sequencialCompra: row.sequencialCompra,
    numeroControlePNCP: row.numeroControlePNCP,
    processo: row.processo,
    numeroCompra: row.numeroCompra ?? null,
    objeto: row.objeto,
    orgao: row.orgao,
    cnpjOrgao: row.cnpjOrgao,
    unidadeCompradora: row.unidadeCompradora,
    codigoUnidadeCompradora: row.codigoUnidadeCompradora,
    uf: row.uf,
    municipio: row.municipio,
    modalidade: row.modalidade,
    situacao: row.situacao,
    modoDisputa: row.modoDisputa,
    plataforma: row.plataforma,
    srp: row.srp,
    valorEstimado: row.valorEstimado,
    valorHomologado: row.valorHomologado,
    dataInclusao: row.dataInclusao?.toISOString() ?? null,
    dataAberturaProposta: row.dataAberturaProposta?.toISOString() ?? null,
    dataEncerramentoProposta: row.dataEncerramentoProposta?.toISOString() ?? null,
    amparoLegal: row.amparoLegal,
    linkSistemaOrigem: row.linkSistemaOrigem,
    linkPncp: row.linkPncp,
  };
}

function attachEnviadoAnalise(
  items: PncpContratacaoListItem[],
  enviados: Map<
    string,
    { regiaoKey: string; enviadoAt: Date; enviadoByName?: string | null }
  >
) {
  for (const item of items) {
    const numero = item.numeroControlePNCP || '';
    const enviado = enviados.get(numero);
    item.enviadoAnalise = Boolean(enviado);
    item.enviadoAnaliseRegiaoKey = enviado?.regiaoKey ?? null;
    item.enviadoAnaliseAt = enviado?.enviadoAt?.toISOString() ?? null;
    item.enviadoAnaliseByName = enviado?.enviadoByName?.trim() || null;
  }
  return items;
}

function normalizeStatusAnalise(
  value: PncpConsultaParams['statusAnalise']
): 'disponivel' | 'enviada' | 'all' {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === 'disponivel' || raw === 'enviada') return raw;
  return 'all';
}

/** Consulta o espelho local (sem chamar a API PNCP). */
export async function consultarContratacoesLocais(
  params: PncpConsultaParams
): Promise<PncpConsultaResult> {
  const dataInicial = toYyyymmdd(params.dataInicial);
  const dataFinal = toYyyymmdd(params.dataFinal);
  if (dataInicial > dataFinal) {
    throw new Error('A data inicial não pode ser maior que a data final.');
  }

  const ufsRaw = [
    ...(Array.isArray(params.ufs) ? params.ufs : []),
    ...(params.uf ? [params.uf] : []),
  ];
  const ufs = Array.from(
    new Set(
      ufsRaw
        .map((u) => String(u || '').trim().toUpperCase())
        .filter((u) => /^[A-Z]{2}$/.test(u))
    )
  );

  const pagina = Math.max(1, Number(params.pagina) || 1);
  const tamanhoPagina = Math.min(50, Math.max(10, Number(params.tamanhoPagina) || 20));
  const q = String(params.q || '').trim();

  const idPncp = q ? parseNumeroControlePncp(q) : null;
  if (idPncp) {
    const row = await prisma.pncpContratacao.findUnique({
      where: { numeroControlePNCP: idPncp },
    });
    const items = row ? [rowToItem(row)] : [];
    const enviados = await listPncpEnviadosAnaliseByNumeros(
      items.map((item) => item.numeroControlePNCP || '').filter(Boolean)
    );
    attachEnviadoAnalise(items, enviados);
    const statusAnalise = normalizeStatusAnalise(params.statusAnalise);
    const filtered =
      statusAnalise === 'disponivel'
        ? items.filter((item) => !item.enviadoAnalise)
        : statusAnalise === 'enviada'
          ? items.filter((item) => Boolean(item.enviadoAnalise))
          : items;
    return {
      items: filtered,
      pagina: 1,
      tamanhoPagina,
      totalRegistros: filtered.length,
      totalPaginas: 1,
      empty: filtered.length === 0,
    };
  }

  const dateStart = yyyymmddToDateStart(dataInicial);
  const dateEnd = yyyymmddToDateEnd(dataFinal);

  const where: Prisma.PncpContratacaoWhereInput = {
    OR: [
      { dataInclusao: { gte: dateStart, lte: dateEnd } },
      {
        AND: [
          { dataInclusao: null },
          { syncedAt: { gte: dateStart, lte: dateEnd } },
        ],
      },
    ],
  };

  if (ufs.length === 1) {
    where.uf = ufs[0];
  } else if (ufs.length > 1) {
    where.uf = { in: ufs };
  }

  const rawCodigo = params.codigoModalidadeContratacao;
  const codigos = Array.isArray(rawCodigo)
    ? rawCodigo.filter((n) => Number.isInteger(n) && n > 0)
    : rawCodigo != null && Number(rawCodigo) > 0
      ? [Number(rawCodigo)]
      : [];
  if (codigos.length === 1) {
    where.codigoModalidade = codigos[0];
  } else if (codigos.length > 1) {
    where.codigoModalidade = { in: codigos };
  }

  const valorMin =
    params.valorMin != null && Number.isFinite(params.valorMin) ? Number(params.valorMin) : null;
  const valorMax =
    params.valorMax != null && Number.isFinite(params.valorMax) ? Number(params.valorMax) : null;
  if (valorMin != null || valorMax != null) {
    if (valorMin != null && valorMax != null && valorMin > valorMax) {
      throw new Error('O valor mínimo não pode ser maior que o valor máximo.');
    }
    const valorFilter: Prisma.FloatFilter = {};
    if (valorMin != null) valorFilter.gte = valorMin;
    if (valorMax != null) valorFilter.lte = valorMax;
    where.valorEstimado = valorFilter;
  }

  if (q) {
    const needle = normalizePncpSearchText(q);
    const qDigits = q.replace(/\D/g, '');
    const orFilters: Prisma.PncpContratacaoWhereInput[] = [
      { objetoNorm: { contains: needle } },
      { orgao: { contains: q, mode: 'insensitive' } },
      { processo: { contains: q, mode: 'insensitive' } },
      { municipio: { contains: q, mode: 'insensitive' } },
      { numeroControlePNCP: { contains: q, mode: 'insensitive' } },
      { unidadeCompradora: { contains: q, mode: 'insensitive' } },
    ];
    if (qDigits.length >= 3) {
      // Valor aproximado: comparação textual via toString não existe no Prisma;
      // filtramos numericamente se for número puro razoável.
      const asNum = Number(qDigits);
      if (Number.isFinite(asNum) && asNum > 0) {
        orFilters.push({ valorEstimado: asNum });
        orFilters.push({ valorHomologado: asNum });
      }
    }
    where.AND = [{ OR: orFilters }];
  }

  const statusAnalise = normalizeStatusAnalise(params.statusAnalise);
  if (statusAnalise === 'disponivel' || statusAnalise === 'enviada') {
    const enviadosNumeros = await listAllPncpEnviadoNumeros();
    if (statusAnalise === 'enviada') {
      where.numeroControlePNCP = {
        in: enviadosNumeros.length > 0 ? enviadosNumeros : ['__nenhum_enviado__'],
      };
    } else if (enviadosNumeros.length > 0) {
      const extra: Prisma.PncpContratacaoWhereInput = {
        numeroControlePNCP: { notIn: enviadosNumeros },
      };
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        extra,
      ];
    }
  }

  const totalRegistros = await prisma.pncpContratacao.count({ where });
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / tamanhoPagina) || 1);
  const safePage = Math.min(pagina, totalPaginas);
  const rows = await prisma.pncpContratacao.findMany({
    where,
    orderBy: [{ dataInclusao: 'desc' }, { syncedAt: 'desc' }],
    skip: (safePage - 1) * tamanhoPagina,
    take: tamanhoPagina,
  });

  const items = rows.map(rowToItem);
  const enviados = await listPncpEnviadosAnaliseByNumeros(
    items.map((item) => item.numeroControlePNCP || '').filter(Boolean)
  );
  attachEnviadoAnalise(items, enviados);

  return {
    items,
    pagina: safePage,
    tamanhoPagina,
    totalRegistros,
    totalPaginas,
    empty: items.length === 0,
  };
}
