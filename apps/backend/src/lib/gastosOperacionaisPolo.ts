/** Siglas de polo exibidas em Gastos Operacionais (DF, GO, CENTRAL, …). */

const KNOWN_POLO_SIGLAS = new Set(['CENTRAL', 'DF', 'GO', 'PB', 'PE', 'RS', 'RN']);

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeCentroCustoName(value: string): string {
  return stripAccents(value).trim().toUpperCase().replace(/\s+/g, ' ');
}

function buildNomeToPoloMap(): Record<string, string> {
  const pairs: Array<[string, string]> = [
    ['ADMINISTRACAO CENTRAL', 'CENTRAL'],
    ['DESPESAS GERAIS', 'CENTRAL'],
    ['POLO DISTRITO FEDERAL', 'DF'],
    ['BRASILIA', 'DF'],
    ['UNB - ADM LOCAL', 'DF'],
    ['UNB - CMI', 'DF'],
    ['UNB - CMP', 'DF'],
    ['UNB - CAR', 'DF'],
    ['UNB - SB', 'DF'],
    ['UNB - MUTIRAO', 'DF'],
    ['CB011', 'DF'],
    ['HFA - SERVICOS EVENTUAIS', 'DF'],
    ['HFA - MAO DE OBRA', 'DF'],
    ['CODEVASF', 'DF'],
    ['ITAMARATY - MAO DE OBRA', 'DF'],
    ['ITAMARATY - SERVICOS EVENTUAIS', 'DF'],
    ['SEDES', 'DF'],
    ['SARAH', 'DF'],
    ['PGR', 'DF'],
    ['EMBRAPA BSB', 'DF'],
    ['SES GDF - LOTE 10', 'DF'],
    ['SES GDF - LOTE 12', 'DF'],
    ['SES GDF - LOTE 14', 'DF'],
    ['SES GDF - LOTE 17', 'DF'],
    ['MDR', 'DF'],
    ['T2', 'DF'],
    ['DF - ADM LOCAL', 'DF'],
    ['DF - ALMOXARIFADO', 'DF'],
    ['SEDES NORTE', 'DF'],
    ['UNB', 'DF'],
    ['SENAC - DF', 'DF'],
    ['ICMBIO - DF', 'DF'],
    ['MINISTERIO DA CULTURA - DF', 'DF'],
    ['FHE - DF', 'DF'],
    ['CONFEA - 508 NORTE', 'DF'],
    ['STM - DF', 'DF'],
    ['CONFEA - 516 NORTE', 'DF'],
    ['POLO RIO GRANDE DO NORTE', 'RN'],
    ['NATAL', 'RN'],
    ['RN - ADM LOCAL', 'RN'],
    ['POLO PERNAMBUCO', 'PE'],
    ['RECIFE', 'PE'],
    ['POLO RIO GRANDE DO SUL', 'RS'],
    ['PORTO ALEGRE', 'RS'],
    ['RS - ADM LOCAL', 'RS'],
    ['BANRISUL - LOTE 1', 'RS'],
    ['BANRISUL - LOTE 2', 'RS'],
    ['BANRISUL CENTRO', 'RS'],
    ['POLO PARAIBA', 'PB'],
    ['JOAO PESSOA', 'PB'],
    ['CAMPINA GRANDE', 'PB'],
    ['SEFAZ PB - LOTE 1', 'PB'],
    ['SEFAZ PB - LOTE 2', 'PB'],
    ['SME REFORMA ESCOLAS MACAIBA', 'RN'],
    ['POLO GOIAS', 'GO'],
    ['GOIAS', 'GO'],
    ['JUSTICA FEDERAL GOIAS', 'GO'],
    ['JUSTICA FEDERAL DE GOIAS', 'GO'],
    ['GO - ADM LOCAL', 'GO'],
    ['BBGO - MANUTENCAO', 'GO'],
    ['CAPITANIA FLUVIAL - GO', 'GO'],
    ['SEINFRA - APARECIDA', 'GO'],
    ['SEMASDH - GO', 'GO'],
    ['TJGO', 'GO'],
    ['TJ MANUTENCAO CALDAS NOVAS - CORRETIVA', 'GO'],
    ['TJ MANUTENCAO RIO VERDE - CORRETIVA', 'GO'],
    ['TJGO RETROFIT', 'GO'],
    ['TJGO RETROFIT PARCEIROS - LOTE 5', 'GO'],
    ['TJGO RETROFIT R5 - LOTE 4', 'GO'],
    ['TJGO RETROFIT R5 - LOTE 5', 'GO'],
    ['UFG', 'GO']
  ];

  const map: Record<string, string> = {};
  for (const [nome, polo] of pairs) {
    map[normalizeCentroCustoName(nome)] = polo;
  }
  return map;
}

const NOME_CENTRO_CUSTO_TO_POLO = buildNomeToPoloMap();

/** Converte valores de cadastro/TOTVS para sigla curta (DF, GO, …). */
export function normalizePoloSigla(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;

  const u = stripAccents(text).trim().toUpperCase();
  if (KNOWN_POLO_SIGLAS.has(u)) return u;

  if (u === 'BRASILIA' || u.includes('BRASILIA') || u.includes('DISTRITO FEDERAL')) return 'DF';
  if (u === 'GOIAS' || u.includes('GOIAS')) return 'GO';
  if (u.includes('PARAIBA') || u.endsWith(' PB') || u.startsWith('PB ')) return 'PB';
  if (u.includes('PERNAMBUCO') || u.endsWith(' PE')) return 'PE';
  if (u.includes('RIO GRANDE DO SUL') || u.endsWith(' RS')) return 'RS';
  if (u.includes('RIO GRANDE DO NORTE') || u.endsWith(' RN')) return 'RN';
  if (u.includes('CENTRAL')) return 'CENTRAL';

  // Nome de empresa/coligada — não é polo
  if (u.length > 12 || u.includes('LTDA') || u.includes(' S.A') || u.includes('EMPREEND')) {
    return null;
  }

  return u.length <= 8 ? u : null;
}

export function resolveGastosPoloForContract(
  contractName: string,
  hints?: { costCenterPolo?: string | null; totvsPolo?: string | null }
): string | null {
  const key = normalizeCentroCustoName(contractName);
  const fromMap = NOME_CENTRO_CUSTO_TO_POLO[key];
  if (fromMap) return fromMap;

  const fromCc = normalizePoloSigla(hints?.costCenterPolo);
  if (fromCc) return fromCc;

  const fromTotvs = normalizePoloSigla(hints?.totvsPolo);
  if (fromTotvs) return fromTotvs;

  return null;
}
