import { PNCP_KEYWORDS_OBJETO_PADRAO } from './pncpKeywords';

export { PNCP_KEYWORDS_OBJETO_PADRAO };

const PNCP_CONSULTA_BASE = 'https://pncp.gov.br/api/consulta/v1';
const PNCP_FETCH_TIMEOUT_MS = 45_000;
/** Limite ao varrer páginas na busca textual (evita rate-limit). */
const PNCP_MAX_PAGES_BUSCA = 6;
const PNCP_PAGE_DELAY_MS = 500;

export const PNCP_MODALIDADES = [
  { codigo: 6, nome: 'Pregão Eletrônico' },
  { codigo: 8, nome: 'Dispensa de Licitação' },
  { codigo: 9, nome: 'Inexigibilidade' },
  { codigo: 4, nome: 'Concorrência Eletrônica' },
  { codigo: 5, nome: 'Concorrência' },
  { codigo: 7, nome: 'Pregão Presencial' },
  { codigo: 1, nome: 'Leilão Eletrônico' },
] as const;

export type PncpConsultaParams = {
  dataInicial: string; // YYYYMMDD
  dataFinal: string; // YYYYMMDD
  /** null/omitido = todas as modalidades. Número único (legado) ou lista. */
  codigoModalidadeContratacao?: number | number[] | null;
  /** UF única (legado) ou lista. Vazio/omitido = todas. */
  uf?: string;
  ufs?: string[];
  pagina?: number;
  tamanhoPagina?: number;
  /** Filtro opcional no objeto/órgão/processo (case-insensitive, sem acento). */
  q?: string;
  /** Valor estimado mínimo (inclusive), em reais. */
  valorMin?: number | null;
  /** Valor estimado máximo (inclusive), em reais. */
  valorMax?: number | null;
  /**
   * Quando true, mantém só contratações cujo objeto casa com as palavras-chave
   * padrão (engenharia, manutenção predial, áreas verdes, etc.).
   */
  filtroKeywords?: boolean;
};

export type PncpContratacaoListItem = {
  sequencialCompra: number | null;
  numeroControlePNCP: string | null;
  processo: string | null;
  objeto: string | null;
  orgao: string | null;
  cnpjOrgao: string | null;
  unidadeCompradora: string | null;
  codigoUnidadeCompradora: string | null;
  uf: string | null;
  municipio: string | null;
  modalidade: string | null;
  situacao: string | null;
  modoDisputa: string | null;
  plataforma: string | null;
  srp: boolean | null;
  valorEstimado: number | null;
  valorHomologado: number | null;
  dataInclusao: string | null;
  dataAberturaProposta: string | null;
  dataEncerramentoProposta: string | null;
  amparoLegal: string | null;
  linkSistemaOrigem: string | null;
  linkPncp: string | null;
};

export type PncpConsultaResult = {
  items: PncpContratacaoListItem[];
  pagina: number;
  tamanhoPagina: number;
  totalRegistros: number | null;
  totalPaginas: number | null;
  empty: boolean;
};

function toYyyymmdd(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 8) {
    throw new Error('Data inválida. Use o formato AAAAMMDD ou AAAA-MM-DD.');
  }
  return digits;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function normalizePncpSearchText(value: string): string {
  return normalizeSearchText(value);
}

function buildPncpPortalLink(item: Record<string, unknown>): string | null {
  const numero = asString(item.numeroControlePNCP);
  // Padrão: CNPJ-1-SEQUENCIAL/ANO → /app/editais/{CNPJ}/{ANO}/{SEQUENCIAL}
  const parsed = numero?.match(/^(\d{14})-\d+-(\d+)\s*\/\s*(\d{4})$/);
  if (parsed) {
    const [, cnpj, seq, ano] = parsed;
    return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`;
  }
  const orgao = asRecord(item.orgaoEntidade);
  const cnpj = asString(orgao.cnpj);
  const ano = asNumber(item.anoCompra);
  const seq = asNumber(item.sequencialCompra);
  if (cnpj && ano && seq != null) {
    return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`;
  }
  return null;
}

function mapContratacao(raw: unknown): PncpContratacaoListItem {
  const item = asRecord(raw);
  const orgao = asRecord(item.orgaoEntidade);
  const unidade = asRecord(item.unidadeOrgao);
  const amparo = asRecord(item.amparoLegal);

  return {
    sequencialCompra: asNumber(item.sequencialCompra),
    numeroControlePNCP: asString(item.numeroControlePNCP),
    processo: asString(item.processo),
    objeto: asString(item.objetoCompra),
    orgao: asString(orgao.razaoSocial),
    cnpjOrgao: asString(orgao.cnpj),
    unidadeCompradora: asString(unidade.nomeUnidade),
    codigoUnidadeCompradora: asString(unidade.codigoUnidade),
    uf: asString(unidade.ufSigla) || asString(item.uf),
    municipio: asString(unidade.municipioNome),
    modalidade: asString(item.modalidadeNome) || asString(item.modalidadeNomeCompra),
    situacao: asString(item.situacaoCompraNome),
    modoDisputa: asString(item.modoDisputaNome),
    plataforma: asString(item.usuarioNome),
    srp: asBoolean(item.srp),
    valorEstimado: asNumber(item.valorTotalEstimado),
    valorHomologado: asNumber(item.valorTotalHomologado),
    dataInclusao: asString(item.dataInclusao),
    dataAberturaProposta: asString(item.dataAberturaProposta),
    dataEncerramentoProposta: asString(item.dataEncerramentoProposta),
    amparoLegal: asString(amparo.descricao),
    linkSistemaOrigem: asString(item.linkSistemaOrigem),
    linkPncp: buildPncpPortalLink(item),
  };
}

function pncpErrorFromHttp(status: number, text: string): Error {
  const normalized = text.toLowerCase();
  if (
    status === 429 ||
    normalized.includes('limite de requisi') ||
    normalized.includes('limite de requisições excedido')
  ) {
    return new Error(
      'Limite de requisições do PNCP excedido. Aguarde alguns minutos e tente novamente.'
    );
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return new Error(
      'O PNCP está indisponível ou demorou para responder. Tente novamente em alguns minutos.'
    );
  }

  let detail = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  try {
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    detail =
      asString(json.message) ||
      asString(json.detail) ||
      asString(json.title) ||
      detail;
  } catch {
    // corpo HTML/texto
  }
  if (!detail) detail = `HTTP ${status}`;
  return new Error(`PNCP: ${detail}`);
}

function itemKey(item: PncpContratacaoListItem): string {
  return (
    item.numeroControlePNCP ||
    `${item.cnpjOrgao || ''}-${item.processo || ''}-${item.sequencialCompra || ''}`
  );
}

/** Só dígitos — permite achar valor digitado como 339600, 339.600,00 ou R$ 339600. */
function digitsOnly(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

function valorMatchesQuery(valor: number | null, qRaw: string, qDigits: string): boolean {
  if (valor == null || !Number.isFinite(valor)) return false;

  const inteiro = String(Math.trunc(Math.abs(valor)));
  const centavos = Math.round(Math.abs(valor) * 100);
  const centavosStr = String(centavos);

  // Match por dígitos (ex.: "339600" ou "33960000" com centavos)
  if (qDigits.length >= 2) {
    if (inteiro.includes(qDigits) || centavosStr.includes(qDigits)) return true;
    // "339.600,00" → dígitos com centavos
    if (qDigits.length >= 4 && inteiro + '00' === qDigits) return true;
  }

  // Match textual / parcial no valor formatado BR
  const formatted = valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const needle = normalizeSearchText(qRaw);
  return (
    normalizeSearchText(formatted).includes(needle) ||
    normalizeSearchText(String(valor)).includes(needle)
  );
}

function applyTextFilter(items: PncpContratacaoListItem[], qRaw: string): PncpContratacaoListItem[] {
  const q = String(qRaw || '').trim();
  if (!q) return items;
  const needle = normalizeSearchText(q);
  const qDigits = digitsOnly(q);

  return items.filter((item) => {
    const haystack = normalizeSearchText(
      [
        item.objeto,
        item.orgao,
        item.unidadeCompradora,
        item.processo,
        item.municipio,
        item.numeroControlePNCP,
      ]
        .filter(Boolean)
        .join(' ')
    );
    if (haystack.includes(needle)) return true;
    return (
      valorMatchesQuery(item.valorEstimado, q, qDigits) ||
      valorMatchesQuery(item.valorHomologado, q, qDigits)
    );
  });
}

const KEYWORDS_NORMALIZED = PNCP_KEYWORDS_OBJETO_PADRAO.map((k) => normalizeSearchText(k)).filter(
  (k, i, arr) => k.length >= 3 && arr.indexOf(k) === i
);

export function objetoMatchesPncpKeywords(objeto: string | null | undefined): boolean {
  if (KEYWORDS_NORMALIZED.length === 0) return true;
  const texto = normalizeSearchText(objeto || '');
  if (!texto) return false;
  return KEYWORDS_NORMALIZED.some((kw) => texto.includes(kw));
}

/** Filtra pelo objeto: basta casar com qualquer palavra-chave padrão. */
function applyKeywordsObjetoFilter(items: PncpContratacaoListItem[]): PncpContratacaoListItem[] {
  if (KEYWORDS_NORMALIZED.length === 0) return items;
  return items.filter((item) => objetoMatchesPncpKeywords(item.objeto));
}

function paginateItems(
  items: PncpContratacaoListItem[],
  pagina: number,
  tamanhoPagina: number
): PncpConsultaResult {
  const totalRegistros = items.length;
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / tamanhoPagina) || 1);
  const safePage = Math.min(Math.max(1, pagina), totalPaginas);
  const start = (safePage - 1) * tamanhoPagina;
  const pageItems = items.slice(start, start + tamanhoPagina);
  return {
    items: pageItems,
    pagina: safePage,
    tamanhoPagina,
    totalRegistros,
    totalPaginas,
    empty: pageItems.length === 0,
  };
}

/** Percorre páginas do PNCP e filtra localmente (busca e/ou palavras-chave). */
async function fetchModalidadeComBusca(params: {
  dataInicial: string;
  dataFinal: string;
  uf: string;
  codigo: number;
  tamanhoPagina: number;
  pagina: number;
  q?: string;
  filtroKeywords?: boolean;
  timeoutMs?: number;
  maxPages?: number;
}): Promise<PncpConsultaResult> {
  const first = await fetchUmaModalidade({
    dataInicial: params.dataInicial,
    dataFinal: params.dataFinal,
    uf: params.uf,
    codigo: params.codigo,
    pagina: 1,
    tamanhoPagina: Math.min(50, Math.max(params.tamanhoPagina, 20)),
    timeoutMs: params.timeoutMs,
  });

  const totalPaginasApi = Math.max(1, first.totalPaginas || 1);
  const pagesToFetch = Math.min(
    totalPaginasApi,
    params.maxPages ?? PNCP_MAX_PAGES_BUSCA
  );
  const collected: PncpContratacaoListItem[] = [...first.items];

  for (let page = 2; page <= pagesToFetch; page++) {
    await new Promise((r) => setTimeout(r, PNCP_PAGE_DELAY_MS));
    try {
      const next = await fetchUmaModalidade({
        dataInicial: params.dataInicial,
        dataFinal: params.dataFinal,
        uf: params.uf,
        codigo: params.codigo,
        pagina: page,
        tamanhoPagina: Math.min(50, Math.max(params.tamanhoPagina, 20)),
        timeoutMs: params.timeoutMs,
      });
      collected.push(...next.items);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/limite de requisi/i.test(message)) break;
    }
  }

  const seen = new Set<string>();
  let unique: PncpContratacaoListItem[] = [];
  for (const item of collected) {
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  if (params.filtroKeywords) {
    unique = applyKeywordsObjetoFilter(unique);
  }
  if (params.q?.trim()) {
    unique = applyTextFilter(unique, params.q);
  }

  unique.sort((a, b) => {
    const da = a.dataInclusao || a.dataAberturaProposta || '';
    const db = b.dataInclusao || b.dataAberturaProposta || '';
    return db.localeCompare(da);
  });

  return paginateItems(unique, params.pagina, params.tamanhoPagina);
}

export async function fetchPncpPublicacaoPage(params: {
  dataInicial: string;
  dataFinal: string;
  uf: string;
  codigo: number;
  pagina: number;
  tamanhoPagina: number;
  timeoutMs?: number;
}): Promise<PncpConsultaResult> {
  return fetchUmaModalidade(params);
}

async function fetchUmaModalidade(params: {
  dataInicial: string;
  dataFinal: string;
  uf: string;
  codigo: number;
  pagina: number;
  tamanhoPagina: number;
  timeoutMs?: number;
}): Promise<PncpConsultaResult> {
  const qs = new URLSearchParams({
    dataInicial: params.dataInicial,
    dataFinal: params.dataFinal,
    codigoModalidadeContratacao: String(params.codigo),
    uf: params.uf,
    pagina: String(params.pagina),
    tamanhoPagina: String(params.tamanhoPagina),
  });

  const url = `${PNCP_CONSULTA_BASE}/contratacoes/publicacao?${qs.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    params.timeoutMs ?? PNCP_FETCH_TIMEOUT_MS
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Timeout ao consultar o PNCP. Tente novamente.');
    }
    throw new Error('Falha de rede ao consultar o PNCP.');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) {
    return {
      items: [],
      pagina: params.pagina,
      tamanhoPagina: params.tamanhoPagina,
      totalRegistros: 0,
      totalPaginas: 0,
      empty: true,
    };
  }

  const text = await response.text();
  if (!response.ok) {
    throw pncpErrorFromHttp(response.status, text);
  }

  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error('Resposta inválida do PNCP. Tente novamente.');
  }

  const rawList = Array.isArray(json.data) ? json.data : [];
  const items = rawList.map(mapContratacao);

  return {
    items,
    pagina: asNumber(json.numeroPagina) || params.pagina,
    tamanhoPagina: asNumber(json.tamanhoPagina) || params.tamanhoPagina,
    totalRegistros: asNumber(json.totalRegistros),
    totalPaginas: asNumber(json.totalPaginas),
    empty: Boolean(json.empty) || items.length === 0,
  };
}

async function fetchPncpJson(url: string, timeoutMs = PNCP_FETCH_TIMEOUT_MS): Promise<{
  ok: boolean;
  status: number;
  json: Record<string, unknown> | null;
  empty: boolean;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Timeout ao consultar o PNCP. Tente novamente.');
    }
    throw new Error('Falha de rede ao consultar o PNCP.');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) {
    return { ok: true, status: 204, json: null, empty: true };
  }

  const text = await response.text();
  if (!response.ok) {
    throw pncpErrorFromHttp(response.status, text);
  }

  try {
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    return { ok: true, status: response.status, json, empty: false };
  } catch {
    throw new Error('Resposta inválida do PNCP. Tente novamente.');
  }
}

/** Ex.: 00394494000136-1-000562/2026 */
function parseNumeroControlePncp(qRaw: string): {
  cnpj: string;
  sequencial: number;
  ano: number;
} | null {
  const m = String(qRaw || '')
    .trim()
    .match(/^(\d{14})-(\d+)-(\d+)\s*\/\s*(\d{4})$/);
  if (!m) return null;
  const sequencial = Number(m[3]);
  const ano = Number(m[4]);
  if (!Number.isInteger(sequencial) || sequencial <= 0) return null;
  if (!Number.isInteger(ano) || ano < 2000) return null;
  return { cnpj: m[1], sequencial, ano };
}

async function fetchPorNumeroControle(
  qRaw: string,
  tamanhoPagina: number
): Promise<PncpConsultaResult | null> {
  const parsed = parseNumeroControlePncp(qRaw);
  if (!parsed) return null;

  const url = `${PNCP_CONSULTA_BASE}/orgaos/${parsed.cnpj}/compras/${parsed.ano}/${parsed.sequencial}`;
  try {
    const { json, empty } = await fetchPncpJson(url);
    if (empty || !json) {
      return {
        items: [],
        pagina: 1,
        tamanhoPagina,
        totalRegistros: 0,
        totalPaginas: 0,
        empty: true,
      };
    }
    const item = mapContratacao(json);
    return {
      items: [item],
      pagina: 1,
      tamanhoPagina,
      totalRegistros: 1,
      totalPaginas: 1,
      empty: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    // 404 / não encontrado → lista vazia (não quebra a tela)
    if (/HTTP 404|não encontrad|not found/i.test(message)) {
      return {
        items: [],
        pagina: 1,
        tamanhoPagina,
        totalRegistros: 0,
        totalPaginas: 0,
        empty: true,
      };
    }
    throw err;
  }
}

export async function consultarContratacoesPublicacao(
  params: PncpConsultaParams
): Promise<PncpConsultaResult> {
  const dataInicial = toYyyymmdd(params.dataInicial);
  const dataFinal = toYyyymmdd(params.dataFinal);
  if (dataInicial > dataFinal) {
    throw new Error('A data inicial não pode ser maior que a data final.');
  }

  const uf = String(params.uf || '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) {
    throw new Error('Informe a UF com 2 letras (ex.: DF, SP).');
  }

  const rawCodigo = params.codigoModalidadeContratacao;
  const todas =
    rawCodigo == null ||
    rawCodigo === 0 ||
    !Number.isFinite(Number(rawCodigo)) ||
    Number(rawCodigo) <= 0;

  const modalidades = todas
    ? PNCP_MODALIDADES.map((m) => m.codigo)
    : [Number(rawCodigo)];

  if (!todas && (!Number.isInteger(modalidades[0]) || modalidades[0] <= 0)) {
    throw new Error('Informe um código de modalidade válido.');
  }

  const pagina = Math.max(1, Number(params.pagina) || 1);
  const tamanhoPagina = Math.min(50, Math.max(10, Number(params.tamanhoPagina) || 50));
  const q = String(params.q || '').trim();
  const filtroKeywords = Boolean(params.filtroKeywords);
  // Só varre páginas na busca textual. Palavras-chave filtram a página atual (1 request).
  const precisaVarrer = Boolean(q);

  // Colou o Id contratação PNCP → busca direta (ignora varredura de páginas).
  if (q && parseNumeroControlePncp(q)) {
    const byId = await fetchPorNumeroControle(q, tamanhoPagina);
    if (byId) {
      if (!filtroKeywords) return byId;
      const items = applyKeywordsObjetoFilter(byId.items);
      return { ...byId, items, empty: items.length === 0, totalRegistros: items.length };
    }
  }

  if (!todas) {
    if (precisaVarrer) {
      return fetchModalidadeComBusca({
        dataInicial,
        dataFinal,
        uf,
        codigo: modalidades[0],
        tamanhoPagina,
        pagina,
        q,
        filtroKeywords,
      });
    }

    const page = await fetchUmaModalidade({
      dataInicial,
      dataFinal,
      uf,
      codigo: modalidades[0],
      pagina,
      tamanhoPagina,
    });
    if (!filtroKeywords) return page;
    const items = applyKeywordsObjetoFilter(page.items);
    return {
      ...page,
      items,
      empty: items.length === 0,
    };
  }

  // Todas: uma modalidade por vez, sem retry, com pausa curta (evita rate-limit).
  const results: PncpConsultaResult[] = [];
  let rateLimited = false;

  for (let i = 0; i < modalidades.length; i++) {
    try {
      const result = precisaVarrer
        ? await fetchModalidadeComBusca({
            dataInicial,
            dataFinal,
            uf,
            codigo: modalidades[i],
            // Coleta o máximo filtrado por modalidade; pagina no merge final.
            tamanhoPagina: 5000,
            pagina: 1,
            q,
            filtroKeywords,
            timeoutMs: 35_000,
            maxPages: 4,
          })
        : await fetchUmaModalidade({
            dataInicial,
            dataFinal,
            uf,
            codigo: modalidades[i],
            pagina,
            tamanhoPagina,
            timeoutMs: 35_000,
          });
      results.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/limite de requisi/i.test(message)) {
        rateLimited = true;
        // Se já temos algo, devolve parcial em vez de travar a tela.
        if (results.length > 0) break;
        break;
      }
      // ignora falha pontual de uma modalidade e segue nas demais
    }
    if (i < modalidades.length - 1) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  if (results.length === 0) {
    throw new Error(
      rateLimited
        ? 'Limite de requisições do PNCP excedido. Aguarde alguns minutos e tente novamente.'
        : 'Não foi possível consultar o PNCP. Tente novamente.'
    );
  }

  const seen = new Set<string>();
  let items: PncpContratacaoListItem[] = [];
  for (const result of results) {
    for (const item of result.items) {
      const key = itemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }

  if (!precisaVarrer && filtroKeywords) {
    items = applyKeywordsObjetoFilter(items);
  }

  items.sort((a, b) => {
    const da = a.dataInclusao || a.dataAberturaProposta || '';
    const db = b.dataInclusao || b.dataAberturaProposta || '';
    return db.localeCompare(da);
  });

  if (precisaVarrer) {
    // Busca textual: cada modalidade já veio filtrada; re-pagina o conjunto unificado.
    return paginateItems(items, pagina, tamanhoPagina);
  }

  const totalRegistrosApi = results.reduce((sum, r) => sum + (r.totalRegistros || 0), 0);
  const totalPaginasApi = Math.max(1, ...results.map((r) => r.totalPaginas || 0), 1);

  return {
    items,
    pagina,
    tamanhoPagina,
    totalRegistros: totalRegistrosApi || items.length,
    totalPaginas: totalPaginasApi,
    empty: items.length === 0,
  };
}
