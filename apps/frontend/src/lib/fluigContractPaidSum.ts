/**
 * Consolidação de valores "pagos" no Fluig (G4 / G5 relatório DF) por contrato,
 * alinhado às etapas usadas em FluigSolicitacoesPage.
 */

export const FLUIG_CONTRACT_PAID_DATASETS = ['DataSet_G4FollowUp', 'G5-Relatorio-DF-GO-TODOS-SETORES'] as const;

export type FluigContractPaidTarget = {
  name: string;
  number: string;
  costCenter?: { code?: string; name?: string };
};

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Texto de célula Fluig (string ou objeto com display/value). */
export function fluigCellToString(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (typeof val === 'object' && val !== null) {
    const o = val as Record<string, unknown>;
    const v = o.display ?? o.displayValue ?? o.value ?? o.internalValue;
    return v != null ? String(v) : '';
  }
  return String(val);
}

function parseMoneyFromFluig(s: string): number {
  const t = s.replace(/[R$\s]/g, '').trim();
  if (!t) return 0;
  if (t.includes(',')) {
    const n = parseFloat(t.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/** Célula Fluig (string ou objeto) → Date; mesmas regras usadas em FluigSolicitacoesPage. */
function parseFluigCellToDate(val: unknown): Date | null {
  if (val instanceof Date) return val;
  let v: unknown = val;
  if (v != null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    v = o.display ?? o.displayValue ?? o.internalValue ?? o.value ?? o.date ?? '';
  }
  return parseFluigDateTime(v);
}

function parseFluigDateTime(val: unknown): Date | null {
  if (val instanceof Date) return val;
  const s = String(val ?? '').trim();
  if (!s) return null;
  const isoLike = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?)?/);
  if (isoLike) {
    const iso = isoLike[2] ? `${isoLike[1]}T${isoLike[2]}` : `${isoLike[1]}T12:00:00`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (br) {
    const dd = br[1].padStart(2, '0');
    const mm = br[2].padStart(2, '0');
    const yyyy = br[3];
    const hh = (br[4] ?? '12').padStart(2, '0');
    const min = (br[5] ?? '00').padStart(2, '0');
    const ss = (br[6] ?? '00').padStart(2, '0');
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const iso = s.replace(' ', 'T');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isInicioDataColumnName(name: string): boolean {
  const n = stripDiacritics(name).replace(/\s+/g, ' ').toLowerCase().trim();
  if (n === 'inicio data') return true;
  return (
    /\binicio\b/.test(n) &&
    /\bdata\b/.test(n) &&
    !/\bfim\b/.test(n) &&
    !/\btermino\b/.test(n) &&
    !/\bfinal\b/.test(n)
  );
}

/**
 * Escolhe coluna de data de referência (pagamento / movimento / início).
 * `skipKeys` — colunas já usadas para CC, valor, etc.
 */
function pickReferenceDateColumn(
  columns: string[],
  values: Record<string, unknown>[],
  skipKeys: Set<string>
): string | null {
  if (!values.length) return null;
  const tMin = new Date('2010-01-01').getTime();
  const tMax = Date.now() + 365 * 86400000;
  const sampleN = Math.min(values.length, 250);

  const scoreCol = (col: string, nameWeight: number): { col: string; score: number; parsed: number } => {
    let parsed = 0;
    for (let i = 0; i < sampleN; i++) {
      const d = parseFluigCellToDate(values[i][col]);
      if (!d) continue;
      const t = d.getTime();
      if (t < tMin || t > tMax) continue;
      parsed++;
    }
    return { col, score: nameWeight * 1000 + parsed, parsed };
  };

  const candidates = columns.filter((c) => !skipKeys.has(c));
  const ranked: { col: string; score: number; parsed: number }[] = [];

  for (const c of candidates) {
    const kn = stripDiacritics(c).replace(/\s+/g, ' ').toLowerCase();
    if (/titulo|historico|descricao|observ|mensagem|coment|anexo|link|email|telefone|celular|fornecedor|natureza|elemento|orcament|valor|quant|qtd|etapa|fase|status|idmov|num_proces|sequencia|processo\s*$/i.test(kn))
      continue;

    let w = 0;
    if (/data.*pag|pag.*data|dt.*pag|pagamento.*data|data.*pagamento|dtpag/i.test(kn)) w = 80;
    else if (/liquid|efetiv|quitad|realiz.*pag/i.test(kn) && /data|dt/i.test(kn)) w = 70;
    else if (/dh\s*_?mov|data\s*_?mov|dt\s*_?mov|movimento/i.test(kn)) w = 45;
    else if (isInicioDataColumnName(c)) w = 35;
    else if (/\bdata\b|\bdt\b|dh_\b|\/\d{4}/.test(kn)) w = 15;
    else continue;

    if (/vencimento|emiss(ao)?\s*nf|nascimento/.test(kn)) w = Math.min(w, 8);

    ranked.push(scoreCol(c, w));
  }

  ranked.sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.parsed < Math.max(3, Math.ceil(sampleN * 0.02))) {
    // Heurística fraca: qualquer coluna com muitas datas válidas
    let fallback: { col: string; parsed: number } | null = null;
    for (const c of candidates) {
      const kn = stripDiacritics(c).replace(/\s+/g, ' ').toLowerCase();
      if (!/data|dt|dh|hora|time|inicio|mov/i.test(kn)) continue;
      const { parsed } = scoreCol(c, 1);
      if (parsed >= Math.max(5, Math.ceil(sampleN * 0.05))) {
        if (!fallback || parsed > fallback.parsed) fallback = { col: c, parsed };
      }
    }
    return fallback?.col ?? null;
  }
  return best.col;
}

export function extractFluigContent(payload: unknown): {
  columns: string[];
  values: Record<string, unknown>[];
} {
  const content = (payload as { data?: { content?: { columns?: string[]; values?: Record<string, unknown>[] } } })?.data
    ?.content;
  const values = Array.isArray(content?.values) ? content!.values! : [];
  const columns =
    Array.isArray(content?.columns) && content!.columns!.length > 0
      ? (content!.columns as string[])
      : values[0]
        ? Object.keys(values[0])
        : [];
  return { columns, values };
}

function findEtapaColumn(columns: string[], firstRow: Record<string, unknown> | undefined): string | null {
  const pick = (cols: string[]) =>
    cols.find((c) => /^Etapa_Atual$/i.test(c))
    ?? cols.find((c) => /^EtapaAtual$/i.test(c))
    ?? cols.find((c) => /^fase_Atual$/i.test(c))
    ?? cols.find((c) => /^faseAtual$/i.test(c))
    ?? cols.find((c) => /^STATUS$/i.test(c.trim()))
    ?? null;
  return pick(columns) ?? (firstRow ? pick(Object.keys(firstRow)) : null);
}

function resolveCcColumn(columns: string[], firstRow: Record<string, unknown> | undefined): string | null {
  const fromList =
    columns.find((c) => {
      const t = c.trim();
      return (
        /^cc$/i.test(t) ||
        /^contrato$/i.test(t) ||
        /ccusto|cc_custo|centro[\s_-]?custo|centrocusto|cod[\s_-]?ccusto/i.test(t) ||
        /centro\s+de\s+custo\s+mecanismo/i.test(t) ||
        /custo\s+mecanismo|centro.*custo.*mecanismo/i.test(t)
      );
    }) ?? null;

  if (!firstRow) return fromList;
  const matchesCustoMecanismo = (k: string) => {
    const n = k.toLowerCase().replace(/\s+/g, ' ');
    return n.includes('centro') && n.includes('custo') && n.includes('mecanismo');
  };
  if (fromList && firstRow[fromList] != null) return fromList;
  return (
    Object.keys(firstRow).find(matchesCustoMecanismo)
    ?? Object.keys(firstRow).find((k) => k.trim().toLowerCase() === 'contrato')
    ?? fromList
  );
}

function pickValorColumn(columns: string[]): string | null {
  const scored = columns.map((k) => {
    const n = stripDiacritics(k).replace(/\s+/g, ' ').toLowerCase();
    let score = 0;
    if (/\bvalor\b/.test(n)) score += 10;
    if (/total|liquido|nf|bruto|solicitad/.test(n)) score += 4;
    if (/orcamento|orcado|previsto|empenh/.test(n)) score -= 5;
    if (/quant|qtd|percent|%/.test(n)) score -= 25;
    return { k, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.find((x) => x.score >= 10)?.k ?? scored.find((x) => x.score > 0)?.k ?? null;
}

function findExplicitPaymentStatusColumns(columns: string[]): string[] {
  return columns.filter((c) => {
    const n = stripDiacritics(c).replace(/\s+/g, ' ').toLowerCase();
    return (
      (/pag/.test(n) && /sit|status|efetu|realiz/.test(n)) ||
      /^pago$/i.test(c.trim()) ||
      /situacao.*pagamento|situa.*pagamento/i.test(n)
    );
  });
}

function rowExplicitPaid(row: Record<string, unknown>, keys: string[]): boolean {
  for (const k of keys) {
    const v = fluigCellToString(row[k]).trim().toLowerCase();
    if (!v) continue;
    if (/^(sim|s|yes|y|pago|1|true|ok)\b/.test(v)) return true;
    if (/\bpago\b/.test(v) && !/\bn(ao|ão)\b/.test(v)) return true;
  }
  return false;
}

/** Etapas encerradas com pagamento concluído (mesma regra visual da gestão G4/G5). */
function rowPaidByEtapa(datasetId: string, etapaRaw: string): boolean {
  const s = etapaRaw.trim();
  if (datasetId === 'DataSet_G4FollowUp') {
    return /Etapa\s*24\b/i.test(s) || /Etapa\s*147\b/i.test(s);
  }
  if (datasetId.startsWith('G5-Relatorio-DF')) {
    if (/Etapa\s*117\b/i.test(s)) return true;
    if (/\b(finalizad[oa]|encerrad[oa]|conclu[íi]d[oa])\b/i.test(s) && !/\b(não|nao)\s+(finaliz|encerr|conclu)/i.test(s))
      return true;
    if (/\bEtapa\s*(11[0-9]|12[0-9])\b/i.test(s) && /\b(finaliz|pagamento|quitad|liquidad|efetuad|pago)\b/i.test(s))
      return true;
    return false;
  }
  return false;
}

function findSolicitacaoIdColumn(columns: string[]): string | null {
  const idMov = columns.find((c) => c.replace(/[_\s]+/g, '').toLowerCase() === 'idmov');
  if (idMov) return idMov;
  const numProces = columns.find((c) => /^num_proces$/i.test(c.trim()));
  if (numProces) return numProces;
  return (
    columns.find((c) => {
      const n = stripDiacritics(c).replace(/\s+/g, ' ').toLowerCase();
      return (
        n.includes('numero') &&
        n.includes('processo') &&
        !n.includes('sequencia') &&
        !n.includes('etapa')
      );
    }) ?? null
  );
}

function pickTituloColumn(columns: string[]): string | null {
  return (
    columns.find((c) => /^titulo_solicitacao$/i.test(c))
    ?? columns.find((c) => /historico/i.test(c))
    ?? columns.find((c) => /^descricao$/i.test(c))
    ?? null
  );
}

/** Mesma ideia de `matchNaturezaOrcamentariaColumnKey` em FluigSolicitacoesPage (nomes variados no dataset). */
function matchNaturezaOrcamentariaColumnKey(key: string): boolean {
  const raw = key.trim();
  const n = stripDiacritics(raw).replace(/\s+/g, ' ').toLowerCase();
  if (/titulo|historico|descricao|observac|mensagem|coment|anexo|link|url|email/i.test(n)) return false;
  if (/natureza.*(juridica|fiscal)|tipo.*pessoa/i.test(n)) return false;
  const compact = raw.toLowerCase().replace(/\s+/g, '_');
  if (/nat_?orc|natorc|naturorc|cd_?nat|cod_?nat|codigonatureza/i.test(compact)) return true;
  if (n.includes('natureza') && /orc|orcamento|despes|financ|orca\b|budget/i.test(n)) return true;
  if (n.includes('natureza')) return true;
  if ((/cod(igo)?\b|cd_/.test(n) || /^cd\s/.test(n)) && n.includes('natureza')) return true;
  if (/tipo.*(despesa|orcamento)|classificacao.*(desp|orc)|elemento.*desp|carteira.*orc/i.test(n)) return true;
  const lbl = stripDiacritics(raw.replace(/_/g, ' ')).replace(/\s+/g, ' ').toLowerCase();
  if (lbl.includes('natureza') && (lbl.includes('orc') || lbl.includes('despes') || lbl.includes('financeir')))
    return true;
  return false;
}

/** Cabeçalhos comuns em G4/G5 onde vem "3.03.01.32-SALÁRIOS…" sem a palavra "natureza". */
function matchNaturezaExtendedColumnKey(key: string): boolean {
  const raw = key.trim();
  const n = stripDiacritics(raw).replace(/\s+/g, ' ').toLowerCase();
  if (/titulo|historico|descricao|observ|mensagem|coment|anexo|link|email|telefone|celular|filial|fornecedor|pix|boleto|agencia|conta\s*corrente|chave|vencimento/i.test(n))
    return false;
  if (/^valor\b|\bvalor\s|quant|qtd|etapa|fase|status|idmov|num_proces|sequencia|processo\s*$/i.test(n)) return false;
  if (/centro(\s+de)?\s*custo|^cc$|ccusto|centrocusto|custo\s*mecanismo|mecanismo.*custo|^contrato$/i.test(n)) return false;

  if (/\belemento\b/.test(n) && !/elemento.*(pessoa|jurid)/i.test(n)) return true;
  if (/classificacao.*(orc|despesa|desp)/i.test(n)) return true;
  if (/carteira.*orc/i.test(n)) return true;
  if (/evento.*(orc|desp)/i.test(n)) return true;
  if (/conta.*orcament/i.test(n)) return true;
  if (/plano.*(orc|desp)/i.test(n)) return true;
  if (/cod(igo)?(\s+do)?\s*elemento/i.test(n)) return true;
  if (/elemento\s*padrao/i.test(n)) return true;
  if (/unidade.*orcament|ud\s*orc|u\.?\s*d\.?\s*o\.?r\.?c/i.test(n)) return true;
  if (/despesa.*orcament|orcamento.*despesa/i.test(n)) return true;
  if (/mascara|reduzid|nat(ureza)?(\s|_)*desp|elemento(\s|_)*(orcament|orc\.?)/i.test(n)) return true;
  return false;
}

function isNaturezaCandidateColumnKey(key: string): boolean {
  return matchNaturezaOrcamentariaColumnKey(key) || matchNaturezaExtendedColumnKey(key);
}

/** Valor típico de natureza/elemento: código numérico pontilhado + traço + descrição (ex.: 3.03.01.32-SALÁRIOS…). */
function cellLooksLikeOrcNaturezaValue(val: string): boolean {
  const v = val.trim();
  if (v.length < 8) return false;
  // Ex.: 3.03.01.32-SALARIOS E ENCARGOS… ou 3.03.01.32 - COLIGADA
  if (/^\d{1,2}(\.\d{2,3}){2,6}\s*[-–—]/.test(v)) return true;
  if (/^\d{1,2}(\.\d{2,3}){2,6}[A-Za-zÀ-ÿ]/.test(v)) return true;
  return false;
}

function listNaturezaCandidateKeys(columns: string[], firstRow: Record<string, unknown> | undefined): string[] {
  const set = new Set<string>();
  for (const c of columns) {
    if (isNaturezaCandidateColumnKey(c)) set.add(c);
  }
  if (firstRow) {
    for (const c of Object.keys(firstRow)) {
      if (isNaturezaCandidateColumnKey(c)) set.add(c);
    }
  }
  return Array.from(set);
}

function pickBestNaturezaColumn(
  columns: string[],
  firstRow: Record<string, unknown> | undefined,
  values: Record<string, unknown>[],
  skipKeys: Set<string>
): string | null {
  const keys = listNaturezaCandidateKeys(columns, firstRow).filter((k) => !skipKeys.has(k));
  if (keys.length === 0) return null;
  if (keys.length === 1) return keys[0];

  const sample = values.slice(0, Math.min(600, values.length));
  let bestK: string | null = null;
  let bestScore = -1;
  for (const k of keys) {
    let filled = 0;
    let coded = 0;
    for (const row of sample) {
      const v = fluigCellToString(row[k]).trim();
      if (v.length < 4) continue;
      filled++;
      if (cellLooksLikeOrcNaturezaValue(v)) coded++;
    }
    let score = filled + coded * 4;
    const kn = stripDiacritics(k).replace(/\s+/g, ' ').toLowerCase();
    if (/\belemento\b|mascara|classificacao|despesa.*orc|nat_?orc|natureza\b/i.test(kn)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      bestK = k;
    }
  }
  return bestK;
}

function resolveNaturezaForRow(
  row: Record<string, unknown>,
  candidateKeys: string[],
  primaryKey: string | null,
  ccCol: string | null
): string {
  const ordered: string[] = [];
  if (primaryKey) ordered.push(primaryKey);
  for (const k of candidateKeys) {
    if (k === primaryKey) continue;
    if (ccCol && k === ccCol) continue;
    ordered.push(k);
  }
  for (const k of ordered) {
    const v = fluigCellToString(row[k]).trim();
    if (v) return v;
  }
  return '';
}

function rowRelatesToContract(
  row: Record<string, unknown>,
  ccCol: string | null,
  contract: FluigContractPaidTarget
): boolean {
  const num = (contract.number || '').trim();
  const name = (contract.name || '').trim();
  const code = (contract.costCenter?.code || '').trim();
  const ccName = (contract.costCenter?.name || '').trim();

  const lc = (v: unknown) => fluigCellToString(v).toLowerCase();

  if (ccCol) {
    const cv = lc(row[ccCol]);
    if (cv && num && cv.includes(num.toLowerCase())) return true;
    if (cv && code) {
      const compact = code.toLowerCase().replace(/\s+/g, '');
      if (cv.replace(/\s+/g, '').includes(compact)) return true;
      if (cv.includes(code.toLowerCase())) return true;
    }
    if (cv && name.length >= 3 && cv.includes(name.toLowerCase())) return true;
    if (cv && ccName.length >= 3 && cv.includes(ccName.toLowerCase())) return true;
  }

  const contratoKey = Object.keys(row).find((k) => /^contrato$/i.test(k.trim()));
  if (contratoKey) {
    const tv = lc(row[contratoKey]);
    if (num && tv.includes(num.toLowerCase())) return true;
    if (code) {
      const compact = code.toLowerCase().replace(/\s+/g, '');
      if (tv.replace(/\s+/g, '').includes(compact) || tv.includes(code.toLowerCase())) return true;
    }
  }

  if (num.length >= 2) {
    const blob = Object.values(row).map(lc).join('|');
    if (blob.includes(num.toLowerCase())) return true;
  }
  if (name.length >= 4) {
    const blob = Object.values(row).map(lc).join('|');
    if (blob.includes(name.toLowerCase())) return true;
  }
  return false;
}

export type FluigPaidSolicitationRow = {
  datasetId: string;
  solicitationId: string;
  etapa: string;
  valor: number;
  centroCusto: string;
  natureza: string;
  titulo: string;
  /** Data de referência para rateio mensal (coluna detectada no dataset); ausente se a célula veio vazia. */
  referenciaData: Date | null;
};

/** Linhas do Fluig consideradas pagas e ligadas ao contrato (para conferência na UI). */
export function collectPaidFluigRowsForContract(
  payload: unknown,
  datasetId: string,
  contract: FluigContractPaidTarget
): { total: number; rows: FluigPaidSolicitationRow[] } {
  const { columns, values } = extractFluigContent(payload);
  if (!values.length) {
    return { total: 0, rows: [] };
  }

  const first = values[0];
  const ccCol = resolveCcColumn(columns, first);
  const etapaCol = findEtapaColumn(columns, first);
  const valorCol = pickValorColumn(columns);
  if (!valorCol) {
    return { total: 0, rows: [] };
  }

  const paidCols = findExplicitPaymentStatusColumns(columns);
  const idCol = findSolicitacaoIdColumn(columns);
  const tituloCol = pickTituloColumn(columns);
  const skipForNatureza = new Set<string>();
  if (ccCol) skipForNatureza.add(ccCol);
  if (valorCol) skipForNatureza.add(valorCol);
  const naturezaCandidates = listNaturezaCandidateKeys(columns, first).filter((k) => !skipForNatureza.has(k));
  const naturezaPrimary = pickBestNaturezaColumn(columns, first, values, skipForNatureza);

  const dateSkip = new Set(skipForNatureza);
  if (etapaCol) dateSkip.add(etapaCol);
  if (idCol) dateSkip.add(idCol);
  if (tituloCol) dateSkip.add(tituloCol);
  if (paidCols.length) for (const k of paidCols) dateSkip.add(k);
  const dateCol = pickReferenceDateColumn(columns, values, dateSkip);

  const rows: FluigPaidSolicitationRow[] = [];
  let total = 0;

  for (const row of values) {
    if (!rowRelatesToContract(row, ccCol, contract)) continue;

    const paid =
      paidCols.length > 0
        ? rowExplicitPaid(row, paidCols)
        : etapaCol
          ? rowPaidByEtapa(datasetId, fluigCellToString(row[etapaCol]))
          : false;
    if (!paid) continue;

    const valor = parseMoneyFromFluig(fluigCellToString(row[valorCol]));
    total += valor;

    const solicitationId = idCol ? fluigCellToString(row[idCol]).trim() || '—' : '—';
    const etapa = etapaCol ? fluigCellToString(row[etapaCol]).trim() || '—' : '—';
    const centroCusto = ccCol ? fluigCellToString(row[ccCol]).trim() || '—' : '—';
    let titulo = tituloCol ? fluigCellToString(row[tituloCol]).trim() : '';
    if (titulo.length > 120) titulo = `${titulo.slice(0, 117)}…`;
    let natureza = resolveNaturezaForRow(row, naturezaCandidates, naturezaPrimary, ccCol).trim();
    if (natureza.length > 500) natureza = `${natureza.slice(0, 497)}…`;
    const referenciaData = dateCol ? parseFluigCellToDate(row[dateCol]) : null;

    rows.push({
      datasetId,
      solicitationId,
      etapa,
      valor,
      centroCusto: centroCusto.length > 80 ? `${centroCusto.slice(0, 77)}…` : centroCusto,
      natureza: natureza || '—',
      titulo: titulo || '—',
      referenciaData
    });
  }

  return { total, rows };
}

/** Soma valores das linhas do dataset consideradas pagas e vinculadas ao contrato. */
export function sumPaidFluigForContract(
  payload: unknown,
  datasetId: string,
  contract: FluigContractPaidTarget
): number {
  return collectPaidFluigRowsForContract(payload, datasetId, contract).total;
}
