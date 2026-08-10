export const GASTOS_OPERACIONAIS_LOCALITIES = [
  { key: 'CENTRAL', label: 'Central' },
  { key: 'GOIAS', label: 'Goiás' },
  { key: 'DISTRITO_FEDERAL', label: 'Distrito Federal' },
  { key: 'PARAIBA', label: 'Paraíba' },
  { key: 'SUL', label: 'Região Sul' },
  { key: 'NORDESTE', label: 'Região Nordeste' }
] as const;

export type GastosOperacionaisLocality =
  (typeof GASTOS_OPERACIONAIS_LOCALITIES)[number]['key'];

/** Localidades exibidas no painel de gastos do Controle Geral de Contratos. */
export const CONTROLE_GERAL_GASTOS_VISIBLE_LOCALITIES = [
  'GOIAS',
  'DISTRITO_FEDERAL',
  'PARAIBA'
] as const satisfies readonly GastosOperacionaisLocality[];

/**
 * Contratos extras sempre mesclados no Controle Geral (fora das localidades padrão),
 * ex.: contratos de sócios em outras regiões.
 */
export const CONTROLE_GERAL_EXTRA_CONTRACTS = [
  'MAPA - UMIPI DE JEQUIE'
] as const;

export function resolveVisibleLocalityItems(
  visibleLocalities?: readonly GastosOperacionaisLocality[]
) {
  if (!visibleLocalities?.length) {
    return [...GASTOS_OPERACIONAIS_LOCALITIES];
  }

  const allowed = new Set(visibleLocalities);
  return GASTOS_OPERACIONAIS_LOCALITIES.filter((locality) => allowed.has(locality.key));
}

/** Contratos do catálogo para as localidades visíveis (inclui linhas sem gastos na planilha). */
export function listContractsForLocalities(
  visibleLocalities?: readonly GastosOperacionaisLocality[]
): readonly string[] {
  const contracts: string[] = [];
  for (const locality of resolveVisibleLocalityItems(visibleLocalities)) {
    for (const contract of CONTRACTS_BY_LOCALITY[locality.key] ?? []) {
      if (!isContractExcludedFromPresentation(contract)) {
        contracts.push(contract);
      }
    }
  }
  return contracts;
}

/** Chaves normalizadas de todos os contratos do catálogo embutido. */
export function getAllCatalogContractKeys(): Set<string> {
  const keys = new Set<string>();
  for (const contract of listContractsForLocalities()) {
    keys.add(normalizeContractOrderKey(contract));
  }
  return keys;
}

/** Contratos agrupados por localidade (conforme planilha de referência). */
const CONTRACTS_BY_LOCALITY: Record<GastosOperacionaisLocality, readonly string[]> = {
  CENTRAL: ['ADMINISTRACAO CENTRAL', 'ADM CENTRAL GENNESIS'],
  GOIAS: [
    'BBGO - MANUTENÇÃO',
    'CAPITANIA FLUVIAL - GO',
    'GO - ADM LOCAL',
    'JUSTIÇA FEDERAL GOIAS',
    'SEINFRA - APARECIDA',
    'SEMASDH - GO',
    'TJGO',
    'TJ MANUTENÇÃO CALDAS NOVAS - CORRETIVA',
    'TJ MANUTENÇÃO RIO VERDE - CORRETIVA',
    'TJGO RETROFIT',
    'TJGO RETROFIT PARCEIROS - LOTES 5',
    'TJGO RETROFIT R5 - LOTE 4',
    'TJGO RETROFIT R5 - LOTE 5',
    'UFG'
  ],
  DISTRITO_FEDERAL: [
    'CODEVASF',
    'CRO 11',
    'DF - ADM LOCAL',
    'CONFEA - 508 NORTE',
    'CONFEA - 516 NORTE',
    'HFA - MÃO DE OBRA',
    'HFA - SERVIÇOS EVENTUAIS',
    'ITAMARATY - MÃO DE OBRA',
    'ITAMARATY - SERVIÇOS EVENTUAIS',
    'ICMBIO - DF',
    'PGR',
    'SARAH',
    'SENAC - DF',
    'SEDES',
    'SEDES NORTE',
    'SES - LOTE 10',
    'SES - LOTE 12',
    'SES - LOTE 14',
    'SES - LOTE 17',
    'STM - DF',
    'FHE - DF',
    'MINISTÉRIO DA CULTURA - DF',
    'UNB',
    'UNB - CAR',
    'UNB - CMI',
    'EMBRAPA BSB'
  ],
  PARAIBA: [
    'JP - ADM LOCAL',
    'SEECT PB GENNESIS - ITEM 1',
    'SEECT PB GENNESIS - ITEM 3',
    'SEECT PB ITEM 4',
    'SEFAZ PB - LOTE 01',
    'SEFAZ PB - LOTE 02',
    'SEFAZ PB - LOTE 03',
    'SEFAZ PB - LOTE 04',
    'SEFAZ PB - LOTE 05',
    'ALPB - MANUTENÇÃO PREDIAL'
  ],
  SUL: [
    'BANRISUL - LOTE 1',
    'BANRISUL - LOTE 2',
    'BANRISUL CENTRO',
    'FUNDEPAR - LOTE 04 - CAMPO MOURÃO (DESATIVADO)',
    'CORREIOS - 824',
    'CORREIOS 18 - SOLEDADE',
    'CORREIOS 12',
    'INMETRO - RS',
    'GRUPO HOSPITALAR DA CONCEIÇÃO',
    'PMC/PR - LOTE 04',
    'RS - ADM LOCAL',
    'SERPRO - RS',
    'SMAP - LOTE 01',
    'TRE - RS',
    'SMOBI PRAÇAS - LOTE 01',
    'OBRA PATOS'
  ],
  NORDESTE: [
    'ADM REGIONAL NATAL ECONTECX',
    'ACESSIBILIDADE',
    'CEHAB PE',
    'INCRA - MÃO DE OBRA',
    'INCRA - SERVIÇOS EVENTUAIS',
    'MAPA - UMIPI DE JEQUIE',
    'PARQUE TRES RUAS - JOAO PESSOA',
    'RECEITA FEDERAL - MÃO DE OBRA',
    'RN - ADM LOCAL',
    'SME REFORMA ESCOLAS MACAIBA',
    'SME NATAL 062 - EMERGENCIAL',
    'SEINFRA - PAVIMENTAÇÃO',
    'SEINFRA NATAL TAPA BURACOS ZONA LESTE',
    'SEINFRA NATAL TAPA BURACOS ZONA SUL',
    'SEMTAS NATAL - ZONA OESTE',
    'SME - ZONA NORTE LOTE I - MANUTENÇÃO',
    'SMS NATAL',
    'SMS NATAL DISTRITO LESTE ITEM 1',
    'SMS NATAL DISTRITO OESTE ITEM 2',
    'SMS NATAL DISTRITO SUL ITEM 3',
    'UFPE IMPERMEABILIZAÇÃO',
    'UFPE PINTURA',
    'UFRN - IMPERMEABILIZAÇÃO',
    'UFRN - PINTURA'
  ]
};

/** Contratos omitidos do painel de gastos operacionais. */
export const GASTOS_OPERACIONAIS_EXCLUDED_CONTRACTS = [] as const;

/** Normaliza nomes para casar variações da planilha (hífens, acentos, espaços). */
export function normalizeContractOrderKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Variações da planilha que devem ser exibidas sob um único nome canônico. */
const GASTOS_OPERACIONAIS_CONTRACT_ALIASES: Readonly<Record<string, string>> = {
  [normalizeContractOrderKey('TJGO MANUTENÇÃO LOTE 02')]: 'TJ MANUTENÇÃO RIO VERDE - CORRETIVA',
  // Cadastro do contrato usa o nome sem o sufixo de localidade; unifica com o catálogo.
  [normalizeContractOrderKey('SENAC')]: 'SENAC - DF',
  [normalizeContractOrderKey('MINISTÉRIO DA CULTURA')]: 'MINISTÉRIO DA CULTURA - DF',
  [normalizeContractOrderKey('FHE')]: 'FHE - DF',
  // Cadastro usa "LOTE 01/04/05"; o catálogo/planilha usa o nome base / "R5 - LOTE 4/5".
  [normalizeContractOrderKey('TJGO RETROFIT - LOTE 01')]: 'TJGO RETROFIT',
  [normalizeContractOrderKey('TJGO RETROFIT - LOTE 1')]: 'TJGO RETROFIT',
  [normalizeContractOrderKey('TJGO RETROFIT - LOTE 04')]: 'TJGO RETROFIT R5 - LOTE 4',
  [normalizeContractOrderKey('TJGO RETROFIT - LOTE 05')]: 'TJGO RETROFIT R5 - LOTE 5',
  [normalizeContractOrderKey('UFGO')]: 'UFG',
  // TOTVS/planilha usa "JUSTIÇA FEDERAL DE GOIÁS"; o catálogo usa "JUSTIÇA FEDERAL GOIAS".
  [normalizeContractOrderKey('JUSTIÇA FEDERAL DE GOIÁS')]: 'JUSTIÇA FEDERAL GOIAS',
  // TOTVS usa "SES GDF - LOTE X"; o catálogo do Controle Geral usa "SES - LOTE X".
  [normalizeContractOrderKey('SES GDF - LOTE 10')]: 'SES - LOTE 10',
  [normalizeContractOrderKey('SES GDF - LOTE 12')]: 'SES - LOTE 12',
  [normalizeContractOrderKey('SES GDF - LOTE 14')]: 'SES - LOTE 14',
  [normalizeContractOrderKey('SES GDF - LOTE 17')]: 'SES - LOTE 17'
};

/** Unifica aliases da planilha no nome exibido no painel de gastos operacionais. */
export function normalizeGastosOperacionaisContractName(contract: string): string {
  const trimmed = contract.trim();
  if (!trimmed) return trimmed;
  return GASTOS_OPERACIONAIS_CONTRACT_ALIASES[normalizeContractOrderKey(trimmed)] ?? trimmed;
}

const excludedContractKeys = new Set(
  GASTOS_OPERACIONAIS_EXCLUDED_CONTRACTS.map((name) => normalizeContractOrderKey(name))
);

export function isContractExcludedFromPresentation(contract: string): boolean {
  return excludedContractKeys.has(normalizeContractOrderKey(contract));
}

const localityByContractKey = new Map<string, GastosOperacionaisLocality>();
for (const [locality, contracts] of Object.entries(CONTRACTS_BY_LOCALITY) as Array<
  [GastosOperacionaisLocality, readonly string[]]
>) {
  for (const contract of contracts) {
    localityByContractKey.set(normalizeContractOrderKey(contract), locality);
  }
}

/** Mapa inicial de localidades do catálogo (usado apenas na migração local). */
export function buildCatalogLocalityOverrideMap(): Record<string, GastosOperacionaisLocality> {
  const map: Record<string, GastosOperacionaisLocality> = {};
  for (const [locality, contracts] of Object.entries(CONTRACTS_BY_LOCALITY) as Array<
    [GastosOperacionaisLocality, readonly string[]]
  >) {
    for (const contract of contracts) {
      map[normalizeContractOrderKey(contract)] = locality;
    }
  }
  return map;
}

/** Ordem de exibição dos contratos no quadro de gastos operacionais. */
export const GASTOS_OPERACIONAIS_CONTRACT_ORDER = [
  'ADMINISTRACAO CENTRAL',
  'ADM CENTRAL GENNESIS',
  'ADM REGIONAL NATAL ECONTECX',
  'BBGO - MANUTENÇÃO',
  'CAPITANIA FLUVIAL - GO',
  'GO - ADM LOCAL',
  'JUSTIÇA FEDERAL GOIAS',
  'SEINFRA - APARECIDA',
  'SEMASDH - GO',
  'TJGO',
  'TJ MANUTENÇÃO CALDAS NOVAS - CORRETIVA',
  'TJ MANUTENÇÃO RIO VERDE - CORRETIVA',
  'TJGO RETROFIT',
  'TJGO RETROFIT PARCEIROS - LOTES 5',
  'TJGO RETROFIT R5 - LOTE 4',
  'TJGO RETROFIT R5 - LOTE 5',
  'UFG',
  'CODEVASF',
  'CRO 11',
  'DF - ADM LOCAL',
  'CONFEA - 508 NORTE',
  'CONFEA - 516 NORTE',
  'HFA - MÃO DE OBRA',
  'HFA - SERVIÇOS EVENTUAIS',
  'ITAMARATY - MÃO DE OBRA',
  'ITAMARATY - SERVIÇOS EVENTUAIS',
  'ICMBIO - DF',
  'PGR',
  'SARAH',
  'SENAC - DF',
  'SEDES',
  'SEDES NORTE',
  'SES - LOTE 10',
  'SES - LOTE 12',
  'SES - LOTE 14',
  'SES - LOTE 17',
  'STM - DF',
  'FHE - DF',
  'MINISTÉRIO DA CULTURA - DF',
  'UNB',
  'UNB - CAR',
  'UNB - CMI',
  'EMBRAPA BSB',
  'JP - ADM LOCAL',
  'SEECT PB GENNESIS - ITEM 1',
  'SEECT PB GENNESIS - ITEM 3',
  'SEECT PB ITEM 4',
  'SEFAZ PB - LOTE 01',
  'SEFAZ PB - LOTE 02',
  'SEFAZ PB - LOTE 03',
  'SEFAZ PB - LOTE 04',
  'SEFAZ PB - LOTE 05',
  'ALPB - MANUTENÇÃO PREDIAL',
  'BANRISUL - LOTE 1',
  'BANRISUL - LOTE 2',
  'BANRISUL CENTRO',
  'FUNDEPAR - LOTE 04 - CAMPO MOURÃO (DESATIVADO)',
  'CORREIOS - 824',
  'CORREIOS 18 - SOLEDADE',
  'CORREIOS 12',
  'INMETRO - RS',
  'GRUPO HOSPITALAR DA CONCEIÇÃO',
  'PMC/PR - LOTE 04',
  'RS - ADM LOCAL',
  'SERPRO - RS',
  'SMAP - LOTE 01',
  'TRE - RS',
  'SMOBI PRAÇAS - LOTE 01',
  'OBRA PATOS',
  'ACESSIBILIDADE',
  'CEHAB PE',
  'INCRA - MÃO DE OBRA',
  'INCRA - SERVIÇOS EVENTUAIS',
  'PARQUE TRES RUAS - JOAO PESSOA',
  'RECEITA FEDERAL - MÃO DE OBRA',
  'RN - ADM LOCAL',
  'SME REFORMA ESCOLAS MACAIBA',
  'SME NATAL 062 - EMERGENCIAL',
  'SEINFRA - PAVIMENTAÇÃO',
  'SEINFRA NATAL TAPA BURACOS ZONA LESTE',
  'SEINFRA NATAL TAPA BURACOS ZONA SUL',
  'SEMTAS NATAL - ZONA OESTE',
  'SME - ZONA NORTE LOTE I - MANUTENÇÃO',
  'SMS NATAL',
  'SMS NATAL DISTRITO LESTE ITEM 1',
  'SMS NATAL DISTRITO OESTE ITEM 2',
  'SMS NATAL DISTRITO SUL ITEM 3',
  'UFPE IMPERMEABILIZAÇÃO',
  'UFPE PINTURA',
  'UFRN - IMPERMEABILIZAÇÃO',
  'UFRN - PINTURA'
] as const;

const catalogDisplayNameByKey = new Map<string, string>(
  GASTOS_OPERACIONAIS_CONTRACT_ORDER.map((name) => [normalizeContractOrderKey(name), name])
);

/**
 * Nome canônico para exibição/agregação: aplica aliases e, quando a chave
 * normalizada existe no catálogo, usa o nome oficial do catálogo.
 */
export function resolveCanonicalGastosContractName(contract: string): string {
  const aliased = normalizeGastosOperacionaisContractName(contract);
  if (!aliased) return aliased;
  return catalogDisplayNameByKey.get(normalizeContractOrderKey(aliased)) ?? aliased;
}

/** Chave estável para somar o mesmo centro de custo apesar de acentos/hífens. */
export function getGastosContractAggregateKey(contract: string): string {
  return normalizeContractOrderKey(resolveCanonicalGastosContractName(contract));
}

const orderIndexByKey = new Map<string, number>(
  GASTOS_OPERACIONAIS_CONTRACT_ORDER.map((name, index) => [normalizeContractOrderKey(name), index])
);

export function getContractOrderIndex(contract: string): number | undefined {
  return orderIndexByKey.get(normalizeContractOrderKey(contract));
}

export function compareContractsByCustomOrder(a: string, b: string): number {
  const indexA = getContractOrderIndex(a);
  const indexB = getContractOrderIndex(b);

  if (indexA != null && indexB != null) return indexA - indexB;
  if (indexA != null) return -1;
  if (indexB != null) return 1;
  return a.localeCompare(b, 'pt-BR');
}

export function sortContractsByCustomOrder<T extends { contract: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => compareContractsByCustomOrder(a.contract, b.contract));
}

export function sortContractNamesByCustomOrder(names: string[]): string[] {
  return [...names].sort(compareContractsByCustomOrder);
}

export function getContractLocality(contract: string): GastosOperacionaisLocality | undefined {
  return localityByContractKey.get(normalizeContractOrderKey(contract));
}

/** Infere localidade para contratos novos do cadastro que ainda não estão no catálogo embutido. */
export function inferContractLocalityFromHints(
  contract: string,
  costCenter?: { code?: string; name?: string } | null
): GastosOperacionaisLocality | undefined {
  const fromCatalog = getContractLocality(contract);
  if (fromCatalog) return fromCatalog;

  const key = normalizeContractOrderKey(contract);
  for (const [catalogKey, locality] of Array.from(localityByContractKey)) {
    if (key === catalogKey) return locality;
    if (key.length >= 8 && catalogKey.length >= 8 && (key.includes(catalogKey) || catalogKey.includes(key))) {
      return locality;
    }
  }

  const haystack = normalizeContractOrderKey(
    [contract, costCenter?.name, costCenter?.code].filter(Boolean).join(' ')
  );
  if (/\bDF\b|BRASILIA|DISTRITO FEDERAL/.test(haystack)) return 'DISTRITO_FEDERAL';
  if (
    /\bPB\b|PARAIBA|JOAO PESSOA|CAMPINA GRANDE|\bJP\b|SEECT|SEFAZ PB|ALPB/.test(haystack)
  ) {
    return 'PARAIBA';
  }
  if (/\bGO\b|GOIAS|GOIANIA|APARECIDA|ANAPOLIS|RIO VERDE|CALDAS NOVAS|UFG|TJGO/.test(haystack)) {
    return 'GOIAS';
  }

  return undefined;
}

export function contractMatchesLocality(
  contract: string,
  locality: GastosOperacionaisLocality | null
): boolean {
  if (!locality) return true;
  return getContractLocality(contract) === locality;
}

export function contractMatchesLocalities(
  contract: string,
  localities: GastosOperacionaisLocality[]
): boolean {
  if (!localities.length) return true;
  const contractLocality = getContractLocality(contract);
  return contractLocality != null && localities.includes(contractLocality);
}

export function getLocalityLabel(locality: GastosOperacionaisLocality): string {
  return GASTOS_OPERACIONAIS_LOCALITIES.find((item) => item.key === locality)?.label ?? locality;
}
