import type { ExtratoCaixaItem } from '@/app/ponto/financeiro/analise-extrato/extratoCaixaTypes';

export const SEM_POLO_KEY = '__sem_polo__';

export type ExtratoResumoPoloRow = {
  key: string;
  label: string;
  totalEntrada: number;
  totalSaida: number;
  totalValor: number;
};

/** Ordem de exibição no resumo por polo. */
const POLO_SORT_ORDER: Record<string, number> = {
  CENTRAL: 0,
  DF: 1,
  GO: 2,
  PB: 3,
  PE: 4,
  RS: 5,
  RN: 6
};

/** Fallback quando o nome do centro de custo não está na tabela (código de filial RM). */
const FILIAL_COD_TO_POLO: Record<number, string> = {
  1: 'DF',
  2: 'RS',
  3: 'RN',
  4: 'PB',
  5: 'GO'
};

/** Nome do centro de custo (normalizado) → sigla do polo. */
const NOME_CENTRO_CUSTO_TO_POLO: Record<string, string> = buildNomeToPoloMap();

function normalizeCentroCustoName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
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
    ['HFA (INATIVAR)', 'DF'],
    ['HFA - SERVICOS E INSUMOS EVENTUAIS (INATIVAR)', 'DF'],
    ['POLO RIO GRANDE DO NORTE', 'RN'],
    ['NATAL', 'RN'],
    ['RN - ADM LOCAL', 'RN'],
    ['ECR - ADM LOCAL', 'RN'],
    ['ALMOXARIFADO NATAL', 'RN'],
    ['MMS NATAL', 'RN'],
    ['ECR BASE NAVAL', 'RN'],
    ['UFRN - IMPERMEABILIZACAO', 'RN'],
    ['UFRN - PINTURA', 'RN'],
    ['INDHA - MAO DE OBRA', 'RN'],
    ['INDHA - SERVICOS EVENTUAIS', 'RN'],
    ['BASE CONTINUADA PARA SATELITE', 'RN'],
    ['INDHA (INATIVAR)', 'RN'],
    ['INDHA - SERVICOS E INSUMOS EVENTUAIS (INATIVAR)', 'RN'],
    ['UFRN MINI USINA (INATIVAR)', 'RN'],
    ['MOSSORO', 'RN'],
    ['FUNDAJ - RN', 'RN'],
    ['POLO PERNAMBUCO', 'PE'],
    ['RECIFE', 'PE'],
    ['RECEITA FEDERAL - MAO DE OBRA', 'PE'],
    ['UFPE IMPERMEABILIZACAO', 'PE'],
    ['UFPE PINTURA', 'PE'],
    ['POLO RIO GRANDE DO SUL', 'RS'],
    ['PORTO ALEGRE', 'RS'],
    ['RS - ADM LOCAL', 'RS'],
    ['CORREIOS 12', 'RS'],
    ['CORREIOS 17', 'RS'],
    ['CORREIOS - 18 (INATIVAR)', 'RS'],
    ['CORREIOS 43', 'RS'],
    ['GEOINFORMACOES', 'RS'],
    ['RS - ALMOXARIFADO', 'RS'],
    ['GRUPO HOSPITALAR DA CONCEICAO', 'RS'],
    ['CORREIOS 18 - NOVO HAMBURGO', 'RS'],
    ['CORREIOS 18 - SAO LEOPOLDO', 'RS'],
    ['CORREIOS 18 - SANTANA DO LIVRAMENTO', 'RS'],
    ['CORREIOS 18 - SAO GABRIEL', 'RS'],
    ['CORREIOS 18 - SOLEDADE', 'RS'],
    ['CORREIOS - 824', 'RS'],
    ['TRE - RS', 'RS'],
    ['SERPRO - RS', 'RS'],
    ['CORSAN - RS', 'RS'],
    ['BANRISUL - LOTE 1', 'RS'],
    ['BANRISUL - LOTE 2', 'RS'],
    ['INMETRO - RS', 'RS'],
    ['SMAP - LOTE 01', 'RS'],
    ['BANRISUL - CENTRO', 'RS'],
    ['POLO PARAIBA', 'PB'],
    ['JOAO PESSOA', 'PB'],
    ['PARQUE TRES RUAS - JOAO PESSOA', 'PB'],
    ['ALMOXARIFADO JOAO PESSOA', 'PB'],
    ['SEINFRA - PAVIMENTACAO', 'PB'],
    ['UFPB - MANUTENCAO PREDIAL', 'PB'],
    ['CAMPINA GRANDE', 'PB'],
    ['ALMOXARIFADO CAMPINA GRANDE', 'PB'],
    ['POLO GOIAS', 'GO'],
    ['GOIAS', 'GO'],
    ['TJ 1A - GOIANIA - PREVENTIVA', 'GO'],
    ['TJ 1B - ANAPOLIS - PREVENTIVA', 'GO'],
    ['JUSTICA FEDERAL DE GOIAS', 'GO'],
    ['TJGO RETROFIT - LOTE 1', 'GO'],
    ['GO - ADM LOCAL', 'GO'],
    ['BBGO - MANUTENCAO', 'GO'],
    ['TJGO RETROFIT PARCEIROS - LOTE 5', 'GO'],
    ['TJGO RETROFIT PARCEIROS - LOTES 5', 'GO'],
    ['TJ 1A - GOIANIA - CORRETIVA', 'GO'],
    ['TJ 1B - ANAPOLIS - CORRETIVA', 'GO'],
    ['TJ MANUTENCAO RIO VERDE - CORRETIVA', 'GO'],
    ['TJ MANUTENCAO CALDAS NOVAS - CORRETIVA', 'GO'],
    ['TJGO RETROFIT R5 - LOTE 4', 'GO'],
    ['TJGO RETROFIT R5 - LOTE 5', 'GO'],
    ['SEINFRA - APARECIDA', 'GO'],
    ['TJGO MANUTENCAO LOTE 02', 'GO'],
    ['UFGO', 'GO'],
    ['TJGO MANUTENCAO LOTE 01', 'GO'],
    ['TJGO MANUTENCAO LOTE 06', 'GO'],
    ['SEMASDH - GO', 'GO'],
    ['CAPITANIA FLUVIAL - GO', 'GO'],
    ['SEFAZ PB - LOTE 1', 'PB'],
    ['SEFAZ PB - LOTE 2', 'PB'],
    ['SME REFORMA ESCOLAS MACAIBA', 'RN']
  ];

  const map: Record<string, string> = {};
  for (const [nome, polo] of pairs) {
    map[normalizeCentroCustoName(nome)] = polo;
  }
  return map;
}

export function poloLabelFromKey(key: string): string {
  if (key === SEM_POLO_KEY) return 'Sem polo';
  return key;
}

export function resolveExtratoPoloFromCentroCusto(
  ccusto?: string | null,
  codFilial?: number | null
): { key: string; label: string } {
  const name = ccusto?.trim() || '';
  if (name) {
    const polo = NOME_CENTRO_CUSTO_TO_POLO[normalizeCentroCustoName(name)];
    if (polo) {
      return { key: polo, label: poloLabelFromKey(polo) };
    }
  }

  if (codFilial != null) {
    const polo = FILIAL_COD_TO_POLO[codFilial];
    if (polo) {
      return { key: polo, label: poloLabelFromKey(polo) };
    }
  }

  return { key: SEM_POLO_KEY, label: poloLabelFromKey(SEM_POLO_KEY) };
}

export function resolveGastosPoloFromContractName(
  contract: string,
  apiPolo?: string | null
): string | null {
  const fromName = resolveExtratoPoloFromCentroCusto(contract);
  if (fromName.key !== SEM_POLO_KEY) return fromName.label;

  const raw = (apiPolo ?? '').trim();
  if (!raw) return null;
  const u = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  if (u === 'DF' || u.includes('BRASILIA') || u.includes('DISTRITO FEDERAL')) return 'DF';
  if (u === 'GO' || u.includes('GOIAS')) return 'GO';
  if (u === 'CENTRAL') return 'CENTRAL';
  if (['PB', 'PE', 'RS', 'RN'].includes(u)) return u;
  if (u.length > 12 || u.includes('LTDA') || u.includes('EMPREEND')) return null;
  return u.length <= 8 ? u : null;
}

export function resolveExtratoPolo(item: ExtratoCaixaItem): { key: string; label: string } {
  return resolveExtratoPoloFromCentroCusto(item.ccusto, item.codFilial);
}

export function sortExtratoResumoPoloRows<T extends { key: string; totalValor: number }>(
  rows: T[]
): T[] {
  const priority = (key: string): number => {
    if (key === 'DF') return 0;
    if (key === 'GO') return 1;
    if (key === SEM_POLO_KEY) return 99;
    return 2;
  };

  return [...rows].sort((a, b) => {
    const pa = priority(a.key);
    const pb = priority(b.key);
    if (pa !== pb) return pa - pb;
    if (pa === 2) return b.totalValor - a.totalValor;
    return 0;
  });
}

export function comparePoloKeys(a: string, b: string): number {
  if (a === SEM_POLO_KEY) return 1;
  if (b === SEM_POLO_KEY) return -1;
  const oa = POLO_SORT_ORDER[a] ?? 99;
  const ob = POLO_SORT_ORDER[b] ?? 99;
  if (oa !== ob) return oa - ob;
  return a.localeCompare(b, 'pt-BR');
}

export function poloGroupKey(item: ExtratoCaixaItem): string {
  return resolveExtratoPolo(item).key;
}

function multiselectFilterShowsAll(selected: string[], allValues: string[]): boolean {
  if (allValues.length === 0) return true;
  return selected.length === 0 || selected.length >= allValues.length;
}

export function extratoMatchesAnyPoloKeys(
  item: ExtratoCaixaItem,
  selectedPoloKeys: string[],
  allPoloKeys: string[]
): boolean {
  if (multiselectFilterShowsAll(selectedPoloKeys, allPoloKeys)) return true;
  return selectedPoloKeys.includes(resolveExtratoPolo(item).key);
}

/** Converte IDs de filtro antigos (código RM de filial) para chaves de polo. */
export function migrateLegacyFilialFilterIds(ids: string[]): string[] {
  const SEM_FILIAL_KEY = '__SEM_FILIAL__';
  const out = new Set<string>();
  for (const id of ids) {
    if (id === SEM_FILIAL_KEY) {
      out.add(SEM_POLO_KEY);
      continue;
    }
    const n = Number(id);
    if (Number.isFinite(n) && FILIAL_COD_TO_POLO[n]) {
      out.add(FILIAL_COD_TO_POLO[n]);
      continue;
    }
    out.add(id);
  }
  return Array.from(out);
}

export function buildExtratoResumoPolo(
  items: ExtratoCaixaItem[],
  sums: {
    entrada: (item: ExtratoCaixaItem) => number;
    saida: (item: ExtratoCaixaItem) => number;
    valor: (item: ExtratoCaixaItem) => number;
  }
): ExtratoResumoPoloRow[] {
  const map = new Map<
    string,
    { label: string; entrada: number; saida: number; valor: number }
  >();

  for (const item of items) {
    const { key, label } = resolveExtratoPolo(item);
    const cur = map.get(key) ?? { label, entrada: 0, saida: 0, valor: 0 };
    cur.entrada += sums.entrada(item);
    cur.saida += sums.saida(item);
    cur.valor += sums.valor(item);
    map.set(key, cur);
  }

  return sortExtratoResumoPoloRows(
    Array.from(map.entries()).map(([key, totals]) => ({
      key,
      label: totals.label,
      totalEntrada: totals.entrada,
      totalSaida: totals.saida,
      totalValor: totals.valor
    }))
  );
}
