/**
 * ID_CONTRATO da planilha jurídica → nome real do contrato.
 * A aba de processos guarda só o ID (ex.: CTRgenpac83), então o nome é resolvido na exibição.
 */
export const JURIDICO_CONTRATOS: Record<string, string> = {
  CTRgenpac3: 'ADM CENTRAL GENNESIS',
  CTRgenpac21: 'BB GOIAS',
  CTRgenpac27: 'CODEVASF',
  CTRgenpac37: 'CRO11',
  CTRgenpac38: 'DF - ADM LOCAL',
  CTRgenpac42: 'EMBRAPA BSB',
  CTRgenpac47: 'HFA - MÃO DE OBRA',
  CTRgenpac48: 'HFA - SERVIÇOS EVENTUAIS',
  CTRgenpac57: 'ITAMARATY - MÃO DE OBRA',
  CTRgenpac58: 'ITAMARATY - SERVIÇOS EVENTUAIS',
  CTRgenpac59: 'JUSTIÇA FEDERAL GOIAS',
  CTRgenpac64: 'PGR',
  CTRgenpac65: 'POLO GOIAS',
  CTRgenpac69: 'SARAH',
  CTRgenpac70: 'SEDES',
  CTRgenpac83: 'SEINFRA - APARECIDA',
  CTRgenpac87: 'SES GDF - LOTE 10',
  CTRgenpac88: 'SES GDF - LOTE 12',
  CTRgenpac89: 'SES GDF - LOTE 14',
  CTRgenpac90: 'SES GDF - LOTE 17',
  CTRgenpac100: 'SUPLAN - PB',
  CTRgenpac101: 'TJ 1A - GOIANIA - CORRETIVA',
  CTRgenpac102: 'TJ 1A - GOIANIA - PREVENTIVA',
  CTRgenpac103: 'TJ 1B - ANÁPOLIS - CORRETIVA',
  CTRgenpac104: 'TJ 1B - ANÁPOLIS - PREVENTIVA',
  CTRgenpac105: 'TJ MANUTENÇÃO CALDAS NOVAS - CORRETIVA',
  CTRgenpac106: 'TJ MANUTENÇÃO CALDAS NOVAS - CORRETIVA',
  CTRgenpac107: 'TJ MANUTENÇÃO RIO VERDE - CORRETIVA',
  CTRgenpac108: 'TJ MANUTENÇÃO RIO VERDE - CORRETIVA',
  CTRgenpac109: 'TJGO RETROFIT - LOTE 1',
  CTRgenpac110: 'TJGO RETROFIT PARCEIROS - LOTE 5',
  CTRgenpac111: 'TJGO RETROFIT R5 - LOTE 4',
  CTRgenpac112: 'TJGO RETROFIT R5 - LOTE 5',
  CTRgenpac120: 'UNB',
  CTRgenpac151: 'UFG',
  '1d918d63': 'HRC',
  '6280e8cd': 'RESTAURANTE PLANALTINA',
  '72a02307': 'ADMINISTRAÇÃO DO SENAC PLANALTINA',
  df5d1fe1: 'ICMBIO - DF',
  '64497ce5': 'CRAS ESTRUTURAL',
  '4ad30005': 'UPS DIVERSIDADE L2 SUL',
  '3cd7d083': 'CRAS CANDAGOLADIA',
  '10d3b9bd': 'CRAS SOBRADINHO',
  dd47c0a9: 'SENAC',
  '80d58ac1': 'SEDE DA FHE - POUPEX',
  '48611376': 'JATAÍ',
  d2099fe2: 'UBS 12 SAMAMBAIA',
  '9dac430e': 'CRAS GAMA',
  b33cb66b: 'TJGO LOTE 02',
  '262843fb': 'TJGO LOTE 06 CALDAS NOVAS',
  b1ef1a08: 'CONFEA',
  b563334f: 'SEMASDH-GO',
  '1538621e': 'STM',
  '0a52e71c': 'MINISTÉRIO DA CULTURA',
  '72bf8e03': 'Núcleo de Gestão de Pessoas da Atenção Primária – NGPAPS',
};

const BY_NORMALIZED_ID = new Map<string, string>(
  Object.entries(JURIDICO_CONTRATOS).map(([id, nome]) => [id.trim().toLowerCase(), nome]),
);

/** Devolve o nome do contrato; se o valor já for um nome (ou for desconhecido), mantém como está. */
export function resolveContratoNome(value?: string | null): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  return BY_NORMALIZED_ID.get(raw.toLowerCase()) || raw;
}
