import { CONTROLE_NFS_SHEET_TABS } from '../services/ControleNfsSheetsService';

/**
 * Centros de custo / contratos da aba "Base de Gastos" (coluna C)
 * agrupados por contrato do Controle de NF's (aba da planilha).
 */
export const NFS_TAB_GASTOS_COST_CENTERS: Record<string, readonly string[]> = {
  bbgo: ['BBGO - MANUTENÇÃO'],
  codevasf: ['CODEVASF'],
  'capitania-fluvial': ['CAPITANIA FLUVIAL - GO'],
  confea: ['CONFEA - 508 NORTE', 'CONFEA - 516 NORTE'],
  'fhe-df': ['FHE - DF'],
  hfa: ['HFA - MÃO DE OBRA', 'HFA - SERVIÇOS EVENTUAIS'],
  itamaraty: ['ITAMARATY - MÃO DE OBRA', 'ITAMARATY - SERVIÇOS EVENTUAIS'],
  jfgo: ['JUSTIÇA FEDERAL GOIAS', 'JUSTIÇA FEDERAL DE GOIÁS'],
  'ministerio-da-cultura': ['MINISTERIO DA CULTURA - DF'],
  pgr: ['PGR'],
  sedes: ['SEDES', 'SEDES NORTE'],
  'seinfra-aparecida': ['SEINFRA - APARECIDA'],
  'senac-df': ['SENAC - DF'],
  ses: ['SES - LOTE 10', 'SES - LOTE 12', 'SES - LOTE 14', 'SES - LOTE 17'],
  stm: ['STM - DF'],
  'tjgo-manutencao': [
    'TJ MANUTENÇÃO CALDAS NOVAS - CORRETIVA',
    'TJ MANUTENÇÃO RIO VERDE - CORRETIVA',
    'TJGO MANUTENÇÃO LOTE 02',
    'TJGO'
  ],
  'tjgo-retrofit': [
    'TJGO - RETROFIT',
    'TJGO RETROFIT PARCEIROS - LOTES 5',
    'TJGO RETROFIT R5 - LOTE 4',
    'TJGO RETROFIT R5 - LOTE 5'
  ],
  ufg: ['UFG']
};

export function normalizeCostCenterKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mapeia nome normalizado da Base de Gastos → tabKey NFS. */
export function buildGastosLookupKeys(): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const tab of CONTROLE_NFS_SHEET_TABS) {
    const centers = NFS_TAB_GASTOS_COST_CENTERS[tab.key] ?? [];
    for (const center of centers) {
      lookup.set(normalizeCostCenterKey(center), tab.key);
    }
    lookup.set(normalizeCostCenterKey(tab.label), tab.key);
    lookup.set(normalizeCostCenterKey(tab.sheetName), tab.key);
  }

  return lookup;
}

export function resolveNfsTabKeyForGastosContract(contractName: string): string | null {
  const lookup = buildGastosLookupKeys();
  return lookup.get(normalizeCostCenterKey(contractName)) ?? null;
}
