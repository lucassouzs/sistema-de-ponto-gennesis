import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

/** Campos mínimos do espelho (espelho-nf/page.tsx) */
export type EspelhoMirrorDraft = {
  measurementRef: string;
  costCenterId: string;
  /** Texto para PDF/Excel; preencha ao exportar a partir do cadastro de centros de custo */
  costCenterLabel?: string;
  dueDate: string;
  empenhoNumber: string;
  processNumber: string;
  serviceOrder: string;
  measurementStartDate?: string;
  measurementEndDate?: string;
  buildingUnit: string;
  obraCno?: string;
  garantiaComplementar?: string;
  observations: string;
  notes: string;
  /** Valores em pt-BR (ex.: 50.000,00) */
  measurementAmount: string;
  laborAmount: string;
  materialAmount: string;
  providerId: string;
  providerName: string;
  takerId: string;
  takerName: string;
  bankAccountId: string;
  bankAccountName: string;
  taxCodeId: string;
  taxCodeCityName: string;
  /** Município do tomador (exibido nas outras informações) */
  municipality?: string;
  /** CNAE e lista de serviço escolhidos no espelho */
  cnae?: string;
  serviceIssqn?: string;
  /** Campos opcionais visíveis no formulário (espelho-nf) */
  nfConstarNaNota?: Record<string, boolean> | null;
};

export type EspelhoExportProvider = {
  id: string;
  cnpj: string;
  municipalRegistration: string;
  stateRegistration: string;
  corporateName: string;
  tradeName: string;
  address: string;
  city: string;
  state: string;
  email: string;
};

export type EspelhoExportTaker = {
  id: string;
  name: string;
  cnpj: string;
  municipalRegistration: string;
  stateRegistration: string;
  corporateName: string;
  address: string;
  city: string;
  state: string;
  contractRef: string;
  serviceDescription: string;
};

export type EspelhoExportBank = {
  id: string;
  name: string;
  bank: string;
  agency: string;
  account: string;
};

export type EspelhoTaxRule = { collectionType: 'RETIDO' | 'RECOLHIDO' };

/** Texto fixo + dinâmico do bloco "Outras informações" (corpo da NF). */
export function buildEspelhoOutrasInformacoesBlock(
  notesComplement: string,
  municipality: string | undefined,
  municipalityUf: string | undefined,
  issRule: EspelhoTaxRule | undefined | null
): string {
  const issAnswer =
    issRule?.collectionType === 'RETIDO'
      ? 'Sim'
      : issRule?.collectionType === 'RECOLHIDO'
        ? 'Não'
        : '—';
  const mun = (municipality ?? '').trim();
  const uf = (municipalityUf ?? '').trim().toUpperCase();
  const munWithUf = mun ? (uf ? `${mun} (${uf})` : mun) : '—';
  const lines = [
    '- Retenção do INSS no Percentual de 11%. Dedução da BC do INSS conforme art. 117, inciso IV da IN RFB No 2110/2022.',
    `O ISS desta NF-e será RETIDO pelo TOMADOR DE SERVIÇO? — ${issAnswer}`,
    `O ISS desta NF-e é devido no Município de ${munWithUf}.`
  ];
  const extra = (notesComplement ?? '').trim();
  return extra ? `${lines.join('\n')}\n\n${extra}` : lines.join('\n');
}

export type EspelhoExportTaxCode = {
  id: string;
  cityName: string;
  issRate: string;
  /** Possui garantia complementar (código tributário) */
  hasComplementaryWarranty?: boolean;
  /** Se possui garantia: a garantia é retida na nota? (null = não se aplica) */
  garantiaRetidaNaNota?: boolean | null;
  /** Alíquota da garantia (%), texto pt-BR (sem o símbolo %) */
  garantiaAliquota?: string;
  cofins: EspelhoTaxRule;
  csll: EspelhoTaxRule;
  inss: EspelhoTaxRule;
  irpj: EspelhoTaxRule;
  pis: EspelhoTaxRule;
  iss: EspelhoTaxRule;
  inssMaterialLimit: string;
  issMaterialLimit: string;
};

export type EspelhoFederalRates = {
  cofins: string;
  csll: string;
  inss: string;
  irpj: string;
  pis: string;
};

export type EspelhoExportBundle = {
  draft: EspelhoMirrorDraft;
  provider: EspelhoExportProvider | null;
  taker: EspelhoExportTaker | null;
  bank: EspelhoExportBank | null;
  taxCode: EspelhoExportTaxCode | null;
  federal: EspelhoFederalRates;
};

const COLS = 12;

function dash(s: string | undefined | null): string {
  const t = (s ?? '').trim();
  return t || '—';
}

function fmtPct(v: string | undefined | null): string {
  const t = (v ?? '').trim();
  return t ? `${t}%` : '—';
}

function ptNumeroExtenso(n: number): string {
  const ones: Record<number, string> = {
    0: 'zero',
    1: 'um',
    2: 'dois',
    3: 'três',
    4: 'quatro',
    5: 'cinco',
    6: 'seis',
    7: 'sete',
    8: 'oito',
    9: 'nove',
    10: 'dez',
    11: 'onze',
    12: 'doze',
    13: 'treze',
    14: 'quatorze',
    15: 'quinze',
    16: 'dezesseis',
    17: 'dezessete',
    18: 'dezoito',
    19: 'dezenove'
  };
  const tens: Record<number, string> = {
    20: 'vinte',
    30: 'trinta',
    40: 'quarenta',
    50: 'cinquenta',
    60: 'sessenta',
    70: 'setenta',
    80: 'oitenta',
    90: 'noventa'
  };
  const round = Math.max(0, Math.min(100, Math.round(n)));
  if (round === 100) return 'cem';
  if (round < 20) return ones[round] ?? String(round);
  const t = Math.floor(round / 10) * 10;
  const u = round % 10;
  if (u === 0) return tens[t] ?? String(round);
  return `${tens[t] ?? ''} e ${ones[u] ?? ''}`.trim();
}

function buildReforcoGarantiaMensagem(
  draft: EspelhoMirrorDraft,
  taxCode: EspelhoExportTaxCode | null
): string | null {
  if (!taxCode?.hasComplementaryWarranty) return null;
  const med = parseEspelhoBrCurrencyToNumber(draft.measurementAmount);
  const aliquotaNum = parseEspelhoPercentToNumber(taxCode.garantiaAliquota);
  if (med === null || aliquotaNum === null) return null;

  const aliquotaInt = Math.round(aliquotaNum);
  const aliquotaPctDisplay = taxCode.garantiaAliquota && taxCode.garantiaAliquota.trim() !== '';
  const aliquotaPctForMsg = aliquotaPctDisplay ? `${taxCode.garantiaAliquota}%` : `${aliquotaInt}%`;
  const porExtenso = `${ptNumeroExtenso(aliquotaInt)} por cento`;

  const x =
    taxCode.garantiaRetidaNaNota === true
      ? med * (aliquotaNum / 100)
      : med * (aliquotaNum / (100 - aliquotaNum));

  const xDisplay = Number.isFinite(x) ? fmtEspelhoBrl(round2(x)) : '—';

  if (taxCode.garantiaRetidaNaNota === true) {
    return `Como Reforço de Garantia será Retido ${aliquotaPctForMsg} (${porExtenso}) sobre o valor da NF igual a: ${xDisplay}`;
  }
  if (taxCode.garantiaRetidaNaNota === false) {
    return `Como Reforço de Garantia foi Retido ${aliquotaPctForMsg} (${porExtenso}) da Parcela na Medição no Valor de: ${xDisplay}`;
  }
  return null;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Valor (R$) do reforço de garantia retido na NF — medição × alíquota da garantia.
 * Só aplica quando há garantia complementar e ela é retida na nota.
 */
export function computeEspelhoReforcoGarantiaRetidoRs(
  draft: EspelhoMirrorDraft,
  taxCode: EspelhoExportTaxCode | null
): number {
  if (!taxCode?.hasComplementaryWarranty || taxCode.garantiaRetidaNaNota !== true) return 0;
  const med = parseEspelhoBrCurrencyToNumber(draft.measurementAmount);
  const aliquotaNum = parseEspelhoPercentToNumber(taxCode.garantiaAliquota);
  if (med === null || aliquotaNum === null) return 0;
  return round2(med * (aliquotaNum / 100));
}

/** Converte texto de moeda pt-BR (ex.: 50.000,00 ou 50000) em número. */
export function parseEspelhoBrCurrencyToNumber(raw: string): number | null {
  const s = String(raw ?? '')
    .trim()
    .replace(/R\$\s*/gi, '')
    /* NBSP e espaços estreitos (ex.: saída do Intl); reforço além de \s. */
    .replace(/[\s\u00A0\u202F\u2007\u2009]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = s.replace(/,/g, '');
  } else {
    normalized = s.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Percentual do cadastro tributário (ex.: 50 ou 50,5 ou 12.345,67 ao colar). */
export function parseEspelhoPercentToNumber(s: string | undefined | null): number | null {
  const raw = String(s ?? '')
    .trim()
    .replace(/%/g, '')
    .replace(/[\s\u00A0\u202F\u2007\u2009]/g, '');
  if (raw === '') return null;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = raw.replace(/,/g, '');
  } else {
    normalized = raw.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function fmtEspelhoBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function formatEspelhoMirrorCurrencyField(raw: string | undefined | null): string {
  const n = parseEspelhoBrCurrencyToNumber(raw ?? '');
  if (n === null) return '—';
  return fmtEspelhoBrl(n);
}

/** Limites de material = valor da medição × % do código tributário. */
export function computeEspelhoMaterialLimits(
  measurementAmountStr: string,
  inssPctStr: string | undefined | null,
  issPctStr: string | undefined | null
): { inssBrl: string; issBrl: string } {
  const base = parseEspelhoBrCurrencyToNumber(measurementAmountStr);
  const pInss = parseEspelhoPercentToNumber(inssPctStr);
  const pIss = parseEspelhoPercentToNumber(issPctStr);
  if (base === null) {
    return { inssBrl: '—', issBrl: '—' };
  }
  const inssVal = pInss !== null ? round2(base * (pInss / 100)) : null;
  const issVal = pIss !== null ? round2(base * (pIss / 100)) : null;
  return {
    inssBrl: inssVal !== null ? fmtEspelhoBrl(inssVal) : '—',
    issBrl: issVal !== null ? fmtEspelhoBrl(issVal) : '—'
  };
}

/**
 * Base de cálculo INSS/ISS: se material > limite do tributo → medição − limite; senão → medição − material.
 */
export function computeEspelhoBasesCalculoInssIss(
  measurementAmountStr: string,
  materialAmountStr: string,
  inssPctStr: string | undefined | null,
  issPctStr: string | undefined | null
): { baseInss: string; baseIss: string } {
  const med = parseEspelhoBrCurrencyToNumber(measurementAmountStr);
  const mat = parseEspelhoBrCurrencyToNumber(materialAmountStr);
  if (med === null || mat === null) {
    return { baseInss: '—', baseIss: '—' };
  }
  const pInss = parseEspelhoPercentToNumber(inssPctStr);
  const pIss = parseEspelhoPercentToNumber(issPctStr);
  const limInss = pInss !== null ? round2(med * (pInss / 100)) : null;
  const limIss = pIss !== null ? round2(med * (pIss / 100)) : null;

  const oneBase = (lim: number | null): string => {
    if (lim === null) return '—';
    const raw = mat > lim ? med - lim : med - mat;
    return fmtEspelhoBrl(Math.max(0, round2(raw)));
  };

  return {
    baseInss: oneBase(limInss),
    baseIss: oneBase(limIss)
  };
}

type EspelhoTaxLineComputed = { value: string; recolher: string | null };

function buildEspelhoTaxLineForExport(
  base: number | null,
  aliquotaRaw: string | undefined | null,
  collectionType: 'RETIDO' | 'RECOLHIDO' | undefined
): EspelhoTaxLineComputed {
  const aliquota = parseEspelhoPercentToNumber(aliquotaRaw);
  if (base === null || aliquota === null) {
    return { value: '—', recolher: null };
  }
  const calculado = fmtEspelhoBrl(round2((base * aliquota) / 100));
  if (collectionType === 'RECOLHIDO') {
    return { value: fmtEspelhoBrl(0), recolher: `Recolher ${calculado}` };
  }
  return { value: calculado, recolher: null };
}

function computeEspelhoImpostosBundle(b: EspelhoExportBundle): {
  cofins: EspelhoTaxLineComputed;
  csll: EspelhoTaxLineComputed;
  irpj: EspelhoTaxLineComputed;
  pis: EspelhoTaxLineComputed;
  inss: EspelhoTaxLineComputed;
  iss: EspelhoTaxLineComputed;
} {
  const { draft, taxCode, federal } = b;
  const med = parseEspelhoBrCurrencyToNumber(draft.measurementAmount);
  const bases = computeEspelhoBasesCalculoInssIss(
    draft.measurementAmount,
    draft.materialAmount,
    taxCode?.inssMaterialLimit,
    taxCode?.issMaterialLimit
  );
  const baseInss = parseEspelhoBrCurrencyToNumber(bases.baseInss);
  const baseIss = parseEspelhoBrCurrencyToNumber(bases.baseIss);

  return {
    cofins: buildEspelhoTaxLineForExport(med, federal.cofins, taxCode?.cofins?.collectionType),
    csll: buildEspelhoTaxLineForExport(med, federal.csll, taxCode?.csll?.collectionType),
    irpj: buildEspelhoTaxLineForExport(med, federal.irpj, taxCode?.irpj?.collectionType),
    pis: buildEspelhoTaxLineForExport(med, federal.pis, taxCode?.pis?.collectionType),
    inss: buildEspelhoTaxLineForExport(baseInss, federal.inss, taxCode?.inss?.collectionType),
    iss: buildEspelhoTaxLineForExport(baseIss, taxCode?.issRate, taxCode?.iss?.collectionType)
  };
}

function computeEspelhoValorLiquidoBundle(b: EspelhoExportBundle): string {
  const med = parseEspelhoBrCurrencyToNumber(b.draft.measurementAmount);
  if (med === null) return '—';
  const imp = computeEspelhoImpostosBundle(b);
  const retidos = [
    imp.cofins.value,
    imp.csll.value,
    imp.irpj.value,
    imp.pis.value,
    imp.inss.value,
    imp.iss.value
  ].reduce((acc, raw) => acc + (parseEspelhoBrCurrencyToNumber(raw) ?? 0), 0);
  const reforcoGarantiaRetido = computeEspelhoReforcoGarantiaRetidoRs(b.draft, b.taxCode);
  return fmtEspelhoBrl(round2(med - retidos - reforcoGarantiaRetido));
}

function fmtDateBr(iso: string): string {
  if (!iso?.trim()) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, 'dd/MM/yyyy');
}

function nowEmissionBr(): string {
  return format(new Date(), 'dd/MM/yyyy HH:mm');
}

function row(...parts: string[]): string[] {
  const r = [...parts];
  while (r.length < COLS) r.push('');
  return r.slice(0, COLS);
}

function mergeRow(r: number): XLSX.Range {
  return { s: { r, c: 0 }, e: { r, c: COLS - 1 } };
}

function serviceCodeLine(tax: EspelhoExportTaxCode | null): string {
  if (!tax?.cityName) return '—';
  return `Serviço / contrato: ${tax.cityName} (alíquota ISS ${fmtPct(tax.issRate)})`;
}

function issRetidoLine(tax: EspelhoExportTaxCode | null): string {
  const ret = tax?.iss?.collectionType === 'RETIDO';
  return `SIM ( ${ret ? 'X' : ' '} )    NÃO ( ${ret ? ' ' : 'X'} )`;
}

function resolveBundle(
  draft: EspelhoMirrorDraft,
  providers: EspelhoExportProvider[],
  takers: EspelhoExportTaker[],
  banks: EspelhoExportBank[],
  taxCodes: EspelhoExportTaxCode[],
  federal: EspelhoFederalRates
): EspelhoExportBundle {
  return {
    draft,
    provider: providers.find((p) => p.id === draft.providerId) ?? null,
    taker: takers.find((t) => t.id === draft.takerId) ?? null,
    bank: banks.find((b) => b.id === draft.bankAccountId) ?? null,
    taxCode: taxCodes.find((c) => c.id === draft.taxCodeId) ?? null,
    federal
  };
}

/** Monta planilha no padrão “espelho para emissão de NF” (estrutura por seções e mesclagens). */
function buildExcelSheet(b: EspelhoExportBundle): { sheet: XLSX.WorkSheet; merges: XLSX.Range[] } {
  const { draft, provider, taker, bank, taxCode } = b;
  const outrasInformacoesCorpo = buildEspelhoOutrasInformacoesBlock(
    draft.notes,
    draft.municipality,
    taker?.state,
    taxCode?.iss ?? null
  );
  const aoa: string[][] = [];
  const merges: XLSX.Range[] = [];
  let r = 0;

  const pushMergeTitle = (title: string) => {
    aoa.push(row(title));
    merges.push(mergeRow(r));
    r++;
  };

  pushMergeTitle('ESPELHO PARA EMISSÃO DE NOTA FISCAL');
  aoa.push(row());
  r++;
  aoa.push(row('', '', '', '', '', '', '', '', 'Número da Nota', '', '', '—'));
  r++;
  aoa.push(row('', '', '', '', '', '', '', '', 'Data e Hora de Emissão', '', '', nowEmissionBr()));
  r++;
  aoa.push(row('', '', '', '', '', '', '', '', 'Código de Verificação', '', '', '—'));
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('PRESTADOR DE SERVIÇOS');
  aoa.push(
    row(
      'CNPJ',
      dash(provider?.cnpj),
      'Inscrição Municipal',
      dash(provider?.municipalRegistration),
      'Inscrição Estadual',
      dash(provider?.stateRegistration),
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;
  aoa.push(row('Nome/Razão Social', dash(provider?.corporateName || draft.providerName)));
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('Nome Fantasia', dash(provider?.tradeName)));
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('Endereço', dash(provider?.address)));
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Município',
      dash(provider?.city),
      'UF',
      dash(provider?.state),
      'E-mail',
      dash(provider?.email),
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('TOMADOR DE SERVIÇOS');
  aoa.push(
    row(
      'CNPJ',
      dash(taker?.cnpj),
      'Inscrição Municipal',
      dash(taker?.municipalRegistration),
      'Inscrição Estadual (ÓRGÃO PÚBLICO)',
      dash(taker?.stateRegistration),
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;
  aoa.push(row('Nome/Razão Social', dash(taker?.corporateName || draft.takerName)));
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('Endereço', dash(taker?.address)));
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Município',
      dash(taker?.city),
      'UF',
      dash(taker?.state),
      'Contrato',
      dash(taker?.contractRef),
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('DISCRIMINAÇÃO DOS SERVIÇOS');
  const disc =
    (taker?.serviceDescription ?? '').trim() || (draft.notes ?? '').trim() || '—';
  aoa.push(row(disc));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  const refLine = `REFERÊNCIA: ${dash(draft.measurementRef)} | CC: ${dash(draft.costCenterLabel)}`;
  aoa.push(row(refLine));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  const extraInfoLine1 = `Nº Empenho: ${dash(draft.empenhoNumber)} | Nº Processo: ${dash(draft.processNumber)}`;
  aoa.push(row(extraInfoLine1));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  const extraInfoLine2 = `Ordem de Serviço: ${dash(draft.serviceOrder)} | Unidade Predial: ${dash(draft.buildingUnit)}`;
  aoa.push(row(extraInfoLine2));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  const obsLine = `Observações: ${dash(draft.observations)}`;
  aoa.push(row(obsLine));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row());
  r++;

  const medVal = formatEspelhoMirrorCurrencyField(draft.measurementAmount);
  const laborVal = formatEspelhoMirrorCurrencyField(draft.laborAmount);
  const matVal = formatEspelhoMirrorCurrencyField(draft.materialAmount);
  const matLimits = computeEspelhoMaterialLimits(
    draft.measurementAmount,
    taxCode?.inssMaterialLimit,
    taxCode?.issMaterialLimit
  );
  const basesInssIss = computeEspelhoBasesCalculoInssIss(
    draft.measurementAmount,
    draft.materialAmount,
    taxCode?.inssMaterialLimit,
    taxCode?.issMaterialLimit
  );
  const impostosExport = computeEspelhoImpostosBundle(b);
  const valorLiquidoExport = computeEspelhoValorLiquidoBundle(b);
  const issRetidoExport = taxCode?.iss?.collectionType === 'RETIDO' ? impostosExport.iss.value : '—';

  pushMergeTitle('VALORES / INFORMAÇÕES FINANCEIRAS E BANCÁRIAS');
  aoa.push(
    row(
      'Medição (valor total)',
      medVal,
      '',
      '',
      'OBSERVAÇÕES (corpo da NF)',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 4 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Mão-de-obra',
      laborVal,
      'Material aplicado',
      matVal,
      dash(outrasInformacoesCorpo),
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 4 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('Vale-transporte', '—', 'Vale-alimentação', '—'));
  r++;
  aoa.push(row('Limite Material INSS', matLimits.inssBrl, 'Limite Material ISS', matLimits.issBrl));
  r++;
  aoa.push(row('Base de cálculo INSS', basesInssIss.baseInss, 'Base de cálculo ISS', basesInssIss.baseIss));
  r++;
  aoa.push(
    row(
      'Referência código tributário',
      `INSS mat.: ${fmtPct(taxCode?.inssMaterialLimit)} | ISS mat.: ${fmtPct(taxCode?.issMaterialLimit)}`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('ISS retido (R$)', issRetidoExport, '', '', '', '', '', '', '', '', '', ''));
  r++;
  aoa.push(
    row(
      'Centro de custo',
      dash(draft.costCenterLabel),
      'Vencimento',
      fmtDateBr(draft.dueDate),
      dash(outrasInformacoesCorpo),
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 4 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Banco',
      dash(bank?.bank),
      'Agência',
      dash(bank?.agency),
      'C/C',
      dash(bank?.account),
      draft.buildingUnit.trim() ? `Unidade predial: ${draft.buildingUnit}` : '—',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 6 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Conta (nome)',
      dash(bank?.name || draft.bankAccountName),
      '',
      '',
      'Nº Ordem de Serviço / CNO',
      dash(draft.serviceOrder),
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 4 }, e: { r, c: 5 } });
  r++;
  const reforcoGarantiaMensagem = buildReforcoGarantiaMensagem(draft, taxCode);
  aoa.push(
    row(
      'Reforço de garantia (%)',
      reforcoGarantiaMensagem ?? '—',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('RETENÇÕES (VALORES A INFORMAR NA NF)');
  aoa.push(
    row(
      'COFINS',
      impostosExport.cofins.value,
      'CSLL',
      impostosExport.csll.value,
      'INSS',
      impostosExport.inss.value,
      'IRPJ',
      impostosExport.irpj.value,
      'PIS',
      impostosExport.pis.value,
      'ISS',
      impostosExport.iss.value
    )
  );
  r++;
  aoa.push(
    row(
      '',
      impostosExport.cofins.recolher ?? '',
      '',
      impostosExport.csll.recolher ?? '',
      '',
      impostosExport.inss.recolher ?? '',
      '',
      impostosExport.irpj.recolher ?? '',
      '',
      impostosExport.pis.recolher ?? '',
      '',
      impostosExport.iss.recolher ?? ''
    )
  );
  r++;
  aoa.push(
    row(
      `Alíq. federal COFINS ${fmtPct(b.federal.cofins)} (${taxCode?.cofins?.collectionType ?? '—'})`,
      '',
      `CSLL ${fmtPct(b.federal.csll)}`,
      '',
      `INSS ${fmtPct(b.federal.inss)}`,
      '',
      `IRPJ ${fmtPct(b.federal.irpj)}`,
      '',
      `PIS ${fmtPct(b.federal.pis)}`,
      '',
      `ISS ${fmtPct(taxCode?.issRate)} (${taxCode?.iss?.collectionType ?? '—'})`,
      ''
    )
  );
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('VALOR DA NOTA');
  aoa.push(row(medVal));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('TRIBUTAÇÃO DO ISSQN (RESUMO)');
  aoa.push(row(serviceCodeLine(taxCode)));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Deduções',
      '—',
      'Desconto incond.',
      '—',
      'Base de cálculo',
      basesInssIss.baseIss,
      'Alíquota (%)',
      fmtPct(taxCode?.issRate),
      'Valor do ISS',
      impostosExport.iss.value,
      'ISS a recolher',
      impostosExport.iss.recolher ?? '—'
    )
  );
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('OUTRAS INFORMAÇÕES');
  aoa.push(
    row(
      'Retenções federais e contribuições devem observar a legislação vigente e as alíquotas cadastradas no sistema.',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      `O ISS desta NF-e será RETIDO pelo tomador? SIM ( ${taxCode?.iss?.collectionType === 'RETIDO' ? 'X' : ' '} )   NÃO ( ${taxCode?.iss?.collectionType !== 'RETIDO' ? 'X' : ' '} )`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      `O ISS desta NF-e é devido no Contrato ${dash(taxCode?.cityName || draft.taxCodeCityName)}`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('Lista de Serviços - ISSQN', '—', 'CNAE', '—', '', '', '', '', '', '', '', ''));
  r++;
  aoa.push(row('Valor líquido a pagar', valorLiquidoExport, '', '', '', '', '', '', '', '', '', ''));
  r++;
  aoa.push(
    row(
      'Medição — Início',
      dash(draft.measurementStartDate) || '—',
      'Término',
      dash(draft.measurementEndDate) || '—',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = Array.from({ length: COLS }, () => ({ wch: 14 }));

  return { sheet: ws, merges };
}

function pdfCheckPage(doc: jsPDF, y: number, step: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + step > pageH - margin) {
    doc.addPage();
    return margin;
  }
  return y;
}

function pdfBar(doc: jsPDF, y: number, margin: number, contentW: number, title: string): number {
  const h = 6;
  y = pdfCheckPage(doc, y, h + 4, margin);
  doc.setFillColor(0, 0, 0);
  doc.rect(margin, y, contentW, h, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), margin + 2, y + 4.2);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  return y + h + 3.2;
}

function pdfKeyRow(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  pairs: { k: string; v: string }[]
): number {
  const topPad = 1.4;
  const bottomPad = 1.6;
  const rowGap = 1.6;
  const lineH = 4.1;
  const n = pairs.length;
  const colW = contentW / Math.max(n, 1);
  const gap = 1.5;
  const valueMinW = colW * 0.24;

  type PreparedCell = {
    p: { k: string; v: string };
    mode: 'inline' | 'stacked';
    vxOffset: number;
    labelLines: string[];
    valueLines: string[];
    lineCount: number;
  };

  const prepared: PreparedCell[] = [];
  let maxLineCount = 1;
  doc.setFontSize(7);

  pairs.forEach((p) => {
    doc.setFont('helvetica', 'bold');
    const kw = doc.getTextWidth(p.k);

    if (kw + gap + valueMinW > colW) {
      const labelLines = doc.splitTextToSize(p.k, colW - 1);
      const normalizedLabel = Array.isArray(labelLines) ? labelLines : [String(labelLines)];
      doc.setFont('helvetica', 'normal');
      const valueLines = doc.splitTextToSize(p.v, colW - 1);
      const normalizedValue = Array.isArray(valueLines) ? valueLines : [String(valueLines)];
      const lineCount = normalizedLabel.length + normalizedValue.length;
      prepared.push({
        p,
        mode: 'stacked',
        vxOffset: 0,
        labelLines: normalizedLabel,
        valueLines: normalizedValue,
        lineCount,
      });
      maxLineCount = Math.max(maxLineCount, lineCount);
      return;
    }

    const vxOffset = kw + gap;
    doc.setFont('helvetica', 'normal');
    const valueLines = doc.splitTextToSize(p.v, colW - vxOffset - 1);
    const normalizedValue = Array.isArray(valueLines) ? valueLines : [String(valueLines)];
    prepared.push({
      p,
      mode: 'inline',
      vxOffset,
      labelLines: [p.k],
      valueLines: normalizedValue,
      lineCount: normalizedValue.length,
    });
    maxLineCount = Math.max(maxLineCount, normalizedValue.length);
  });

  const dynamicRowH = topPad + maxLineCount * lineH + bottomPad;
  y = pdfCheckPage(doc, y, dynamicRowH + rowGap, margin);
  const textY = y + topPad + 2.2;
  let x = margin;

  prepared.forEach((cell) => {
    if (cell.mode === 'stacked') {
      let cy = textY;
      doc.setFont('helvetica', 'bold');
      cell.labelLines.forEach((line) => {
        doc.text(line, x, cy);
        cy += lineH;
      });
      doc.setFont('helvetica', 'normal');
      cell.valueLines.forEach((line) => {
        doc.text(line, x, cy);
        cy += lineH;
      });
    } else {
      doc.setFont('helvetica', 'bold');
      doc.text(cell.labelLines[0], x, textY);
      doc.setFont('helvetica', 'normal');
      doc.text(cell.valueLines, x + cell.vxOffset, textY);
    }
    x += colW;
  });

  return y + dynamicRowH + rowGap;
}

function pdfWrappedBlock(doc: jsPDF, y: number, margin: number, contentW: number, label: string, text: string): number {
  y = pdfCheckPage(doc, y, 14, margin);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(label, margin, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(dash(text), contentW);
  lines.forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, margin, y);
    y += 4;
  });
  return y + 2;
}

function buildPdf(b: EspelhoExportBundle): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 8;
  const contentW = doc.internal.pageSize.getWidth() - margin * 2;
  let y = margin;
  const { draft, provider, taker, bank, taxCode } = b;
  const outrasInformacoesCorpo = buildEspelhoOutrasInformacoesBlock(
    draft.notes,
    draft.municipality,
    taker?.state,
    taxCode?.iss ?? null
  );

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  const title = 'ESPELHO PARA EMISSÃO DE NOTA FISCAL';
  doc.text(title, margin + contentW / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(7);
  const metaRows: Array<{ label: string; value: string }> = [
    { label: 'Número da Nota:', value: '—' },
    { label: 'Data e Hora de Emissão:', value: nowEmissionBr() },
    { label: 'Código de Verificação:', value: '—' }
  ];
  const metaLabelX = margin + contentW - 62;
  const metaValueX = margin + contentW - 26;
  const metaValueMaxW = 24;
  const metaLineH = 4.2;
  metaRows.forEach(({ label, value }) => {
    y = pdfCheckPage(doc, y, metaLineH + 1, margin);
    doc.setFont('helvetica', 'bold');
    doc.text(label, metaLabelX, y);
    doc.setFont('helvetica', 'normal');
    const valueLines = doc.splitTextToSize(value, metaValueMaxW);
    doc.text(valueLines, metaValueX, y);
    y += Math.max(metaLineH, valueLines.length * 3.4);
  });
  y += 2.5;

  y = pdfBar(doc, y, margin, contentW, 'PRESTADOR DE SERVIÇOS');
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'CNPJ:', v: dash(provider?.cnpj) },
    { k: 'Insc. Mun.:', v: dash(provider?.municipalRegistration) },
    { k: 'Insc. Est.:', v: dash(provider?.stateRegistration) }
  ]);
  y = pdfWrappedBlock(doc, y, margin, contentW, 'Nome/Razão Social:', dash(provider?.corporateName || draft.providerName));
  y = pdfWrappedBlock(doc, y, margin, contentW, 'Nome Fantasia:', dash(provider?.tradeName));
  y = pdfWrappedBlock(doc, y, margin, contentW, 'Endereço:', dash(provider?.address));
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Município:', v: dash(provider?.city) },
    { k: 'UF:', v: dash(provider?.state) },
    { k: 'E-mail:', v: dash(provider?.email) }
  ]);
  y += 2;

  y = pdfBar(doc, y, margin, contentW, 'TOMADOR DE SERVIÇOS');
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'CNPJ:', v: dash(taker?.cnpj) },
    { k: 'Insc. Mun.:', v: dash(taker?.municipalRegistration) },
    { k: 'Insc. Est.:', v: dash(taker?.stateRegistration) }
  ]);
  y = pdfWrappedBlock(doc, y, margin, contentW, 'Nome/Razão Social:', dash(taker?.corporateName || draft.takerName));
  y = pdfWrappedBlock(doc, y, margin, contentW, 'Endereço:', dash(taker?.address));
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Município:', v: dash(taker?.city) },
    { k: 'UF:', v: dash(taker?.state) },
    { k: 'Contrato:', v: dash(taker?.contractRef) }
  ]);
  y += 2;

  y = pdfBar(doc, y, margin, contentW, 'DISCRIMINAÇÃO DOS SERVIÇOS');
  doc.setFontSize(7);
  const discPdf =
    (taker?.serviceDescription ?? '').trim() || (draft.notes ?? '').trim() || '—';
  const discLines = doc.splitTextToSize(discPdf, contentW);
  discLines.forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, margin, y);
    y += 4;
  });
  y += 2;
  doc.setTextColor(0, 120, 40);
  const refText = `REFERÊNCIA: ${dash(draft.measurementRef)} | CC: ${dash(draft.costCenterLabel)}`;
  const refLines = doc.splitTextToSize(refText, contentW);
  refLines.forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, margin, y);
    y += 4;
  });
  doc.setTextColor(0, 0, 0);
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Nº Empenho:', v: dash(draft.empenhoNumber) },
    { k: 'Nº Processo:', v: dash(draft.processNumber) }
  ]);
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Ordem de Serviço:', v: dash(draft.serviceOrder) },
    { k: 'Unidade Predial:', v: dash(draft.buildingUnit) }
  ]);
  if (draft.observations.trim()) {
    y = pdfWrappedBlock(doc, y, margin, contentW, 'Observações:', draft.observations);
  }
  y += 3;

  const medValPdf = formatEspelhoMirrorCurrencyField(draft.measurementAmount);
  const laborValPdf = formatEspelhoMirrorCurrencyField(draft.laborAmount);
  const matValPdf = formatEspelhoMirrorCurrencyField(draft.materialAmount);
  const matLimitsPdf = computeEspelhoMaterialLimits(
    draft.measurementAmount,
    taxCode?.inssMaterialLimit,
    taxCode?.issMaterialLimit
  );
  const basesPdf = computeEspelhoBasesCalculoInssIss(
    draft.measurementAmount,
    draft.materialAmount,
    taxCode?.inssMaterialLimit,
    taxCode?.issMaterialLimit
  );
  const impostosPdf = computeEspelhoImpostosBundle(b);
  const valorLiquidoPdf = computeEspelhoValorLiquidoBundle(b);
  const issRetidoPdf = taxCode?.iss?.collectionType === 'RETIDO' ? impostosPdf.iss.value : '—';

  y = pdfBar(doc, y, margin, contentW, 'VALORES / INFORMAÇÕES FINANCEIRAS E BANCÁRIAS');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('Medição (valor total)', margin + 1, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.text(medValPdf, margin + 55, y + 4);
  y += 8;

  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Mão-de-obra:', v: laborValPdf },
    { k: 'Material aplicado:', v: matValPdf }
  ]);
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Vale-transporte:', v: '—' },
    { k: 'Vale-alimentação:', v: '—' }
  ]);
  doc.setFontSize(6.5);
  y = pdfCheckPage(doc, y, 6, margin);
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Limite Material INSS:', v: matLimitsPdf.inssBrl },
    { k: 'Limite Material ISS:', v: matLimitsPdf.issBrl }
  ]);
  y = pdfCheckPage(doc, y, 5, margin);
  doc.text(
    `Referência código tributário — INSS mat.: ${fmtPct(taxCode?.inssMaterialLimit)} | ISS mat.: ${fmtPct(taxCode?.issMaterialLimit)}`,
    margin,
    y
  );
  y += 5;
  y = pdfKeyRow(
    doc,
    y,
    margin,
    contentW,
    [
      { k: 'Base de cálculo INSS:', v: basesPdf.baseInss },
      { k: 'Base de cálculo ISS:', v: basesPdf.baseIss }
    ]
  );
  y = pdfKeyRow(
    doc,
    y,
    margin,
    contentW,
    [{ k: 'ISS retido (R$):', v: issRetidoPdf }]
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('OUTRAS INFORMAÇÕES (corpo da NF)', margin + 1, y + 3.5);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.splitTextToSize(outrasInformacoesCorpo, contentW).forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, margin, y);
    y += 4;
  });
  y += 2;

  doc.setFontSize(7);
  doc.text(`Número da Ordem de Serviço / Inscrição da Obra (CNO): ${dash(draft.serviceOrder)}`, margin, y);
  y += 5;

  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Centro de custo:', v: dash(draft.costCenterLabel) },
    { k: 'Vencimento:', v: fmtDateBr(draft.dueDate) },
    { k: 'Banco:', v: dash(bank?.bank) }
  ]);
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Agência:', v: dash(bank?.agency) },
    { k: 'C/C:', v: dash(bank?.account) },
    { k: 'Conta (nome):', v: dash(bank?.name || draft.bankAccountName) }
  ]);

  const reforcoGarantiaMensagemPdf = buildReforcoGarantiaMensagem(draft, taxCode);
  const reforcoGarantiaMsg = reforcoGarantiaMensagemPdf ?? '—';
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  const reforcoLines = doc.splitTextToSize(reforcoGarantiaMsg, contentW);
  reforcoLines.forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, margin + 1, y);
    y += 4;
  });
  y += 2;

  y = pdfBar(doc, y, margin, contentW, 'RETENÇÕES');
  const retY = y;
  const cellW = contentW / 6;
  const retLabels = ['COFINS', 'CSLL', 'INSS', 'IRPJ', 'PIS', 'ISS'] as const;
  const retVals = [
    impostosPdf.cofins.value,
    impostosPdf.csll.value,
    impostosPdf.inss.value,
    impostosPdf.irpj.value,
    impostosPdf.pis.value,
    impostosPdf.iss.value
  ];
  retLabels.forEach((lb, i) => {
    doc.setFillColor(255, 255, 255);
    doc.rect(margin + i * cellW, retY - 4, cellW - 0.5, 12, 'FD');
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(lb, margin + i * cellW + 1, retY);
    doc.setFont('helvetica', 'normal');
    const vLines = doc.splitTextToSize(retVals[i] ?? '—', cellW - 2);
    doc.text(vLines, margin + i * cellW + 1, retY + 4.5);
  });
  y = retY + 15;
  doc.setFontSize(5);
  const recHints = [
    impostosPdf.cofins.recolher,
    impostosPdf.csll.recolher,
    impostosPdf.inss.recolher,
    impostosPdf.irpj.recolher,
    impostosPdf.pis.recolher,
    impostosPdf.iss.recolher
  ]
    .filter(Boolean)
    .join('  |  ');
  if (recHints) {
    doc.splitTextToSize(recHints, contentW).forEach((line: string) => {
      y = pdfCheckPage(doc, y, 5, margin);
      doc.text(line, margin, y);
      y += 3.5;
    });
    y += 2;
  }
  doc.setFontSize(6);
  doc.text(
    `Alíq. COFINS ${fmtPct(b.federal.cofins)} (${taxCode?.cofins?.collectionType}) | CSLL ${fmtPct(b.federal.csll)} | INSS ${fmtPct(b.federal.inss)} | IRPJ ${fmtPct(b.federal.irpj)} | PIS ${fmtPct(b.federal.pis)} | ISS ${fmtPct(taxCode?.issRate)} (${taxCode?.iss?.collectionType})`,
    margin,
    y
  );
  y += 6;

  y = pdfBar(doc, y, margin, contentW, 'VALOR DA NOTA');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(medValPdf, margin + contentW / 2, y + 2, { align: 'center' });
  y += 10;

  y = pdfBar(doc, y, margin, contentW, 'TRIBUTAÇÃO DO ISSQN');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(serviceCodeLine(taxCode), margin, y);
  y += 5;
  y = pdfKeyRow(
    doc,
    y,
    margin,
    contentW,
    [
      { k: 'Deduções:', v: '—' },
      { k: 'Desc. incond.:', v: '—' },
      { k: 'Base cálculo:', v: basesPdf.baseIss }
    ]
  );
  y = pdfKeyRow(
    doc,
    y,
    margin,
    contentW,
    [
      { k: 'Alíq.:', v: fmtPct(taxCode?.issRate) },
      { k: 'Valor ISS:', v: impostosPdf.iss.value },
      { k: 'ISS recolher:', v: impostosPdf.iss.recolher ?? '—' }
    ]
  );
  y += 4;

  y = pdfBar(doc, y, margin, contentW, 'OUTRAS INFORMAÇÕES');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  const legal =
    'Retenções e contribuições observam alíquotas e regras cadastradas (federais e municipais) e a legislação aplicável.';
  doc.splitTextToSize(legal, contentW).forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, margin, y);
    y += 4;
  });
  y += 2;
  doc.splitTextToSize(
    `O ISS desta NF-e será RETIDO pelo tomador? ${issRetidoLine(taxCode)}`,
    contentW
  ).forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, margin, y);
    y += 4;
  });
  y += 5;
  const municipioComUfPdf = (() => {
    const mun = (draft.municipality ?? '').trim();
    const uf = (taker?.state ?? '').trim().toUpperCase();
    if (!mun) return '—';
    return uf ? `${mun} (${uf})` : mun;
  })();
  doc.text(`O ISS desta NF-e é devido no Município de ${municipioComUfPdf}`, margin, y + 1);
  y += 8;
  y = pdfKeyRow(doc, y, margin, contentW, [
    { k: 'Lista Serv. ISSQN:', v: dash(draft.serviceIssqn) },
    { k: 'CNAE:', v: dash(draft.cnae) }
  ]);
  doc.setFont('helvetica', 'bold');
  doc.text(`Valor líquido a pagar: ${valorLiquidoPdf}`, margin + contentW / 2, y + 2, { align: 'center' });
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.text(`Medição — Início: ${dash(draft.measurementStartDate)}`, margin + contentW * 0.55, y + 2);
  doc.text(`Término: ${dash(draft.measurementEndDate)}`, margin + contentW * 0.55, y + 6);

  return doc;
}

export function sanitizeEspelhoFilenameBase(name: string): string {
  const s = name.trim().slice(0, 60) || 'espelho-nf';
  return s.replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '_');
}

export function exportEspelhoNfExcel(
  draft: EspelhoMirrorDraft,
  providers: EspelhoExportProvider[],
  takers: EspelhoExportTaker[],
  banks: EspelhoExportBank[],
  taxCodes: EspelhoExportTaxCode[],
  federal: EspelhoFederalRates
): void {
  const b = resolveBundle(draft, providers, takers, banks, taxCodes, federal);
  const { sheet } = buildExcelSheet(b);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Espelho da Nota Fiscal');
  const base = sanitizeEspelhoFilenameBase(draft.measurementRef || draft.costCenterLabel || 'espelho-nf');
  XLSX.writeFile(wb, `espelho-nf_${base}.xlsx`);
}

export function exportEspelhoNfPdf(
  draft: EspelhoMirrorDraft,
  providers: EspelhoExportProvider[],
  takers: EspelhoExportTaker[],
  banks: EspelhoExportBank[],
  taxCodes: EspelhoExportTaxCode[],
  federal: EspelhoFederalRates
): void {
  const b = resolveBundle(draft, providers, takers, banks, taxCodes, federal);
  const doc = buildPdf(b);
  const base = sanitizeEspelhoFilenameBase(draft.measurementRef || draft.costCenterLabel || 'espelho-nf');
  doc.save(`espelho-nf_${base}.pdf`);
}

function resolveCostCenterRowLabel(
  m: EspelhoMirrorDraft,
  costCenters?: Array<{ id?: string; code?: string; name?: string }>
): string {
  const fromDraft = m.costCenterLabel?.trim();
  if (fromDraft) return fromDraft;
  if (m.costCenterId && costCenters?.length) {
    const cc = costCenters.find((c) => c.id === m.costCenterId);
    if (cc) return [cc.code, cc.name].filter(Boolean).join(' - ');
  }
  return '';
}

/** Linhas simples para modal “Ver detalhes” (mantém compatibilidade com a tela). */
export function buildEspelhoDetailRows(
  m: EspelhoMirrorDraft,
  costCenters?: Array<{ id?: string; code?: string; name?: string }>,
  taxCodeLimits?: { inssMaterialLimit: string; issMaterialLimit: string } | null,
  issRule?: EspelhoTaxRule | null
): [string, string][] {
  const ccRow = resolveCostCenterRowLabel(m, costCenters);
  const limits = computeEspelhoMaterialLimits(
    m.measurementAmount,
    taxCodeLimits?.inssMaterialLimit,
    taxCodeLimits?.issMaterialLimit
  );
  const bases = computeEspelhoBasesCalculoInssIss(
    m.measurementAmount,
    m.materialAmount,
    taxCodeLimits?.inssMaterialLimit,
    taxCodeLimits?.issMaterialLimit
  );
  return [
    ['Referência da medição', m.measurementRef],
    ['Medição (R$)', formatEspelhoMirrorCurrencyField(m.measurementAmount)],
    ['Mão de obra (R$)', formatEspelhoMirrorCurrencyField(m.laborAmount)],
    ['Material (R$)', formatEspelhoMirrorCurrencyField(m.materialAmount)],
    ['Limite Material INSS', limits.inssBrl],
    ['Limite Material ISS', limits.issBrl],
    ['Base de cálculo INSS', bases.baseInss],
    ['Base de cálculo ISS', bases.baseIss],
    ['Centro de custo', ccRow || '—'],
    ['Vencimento', m.dueDate || '—'],
    ['Nº Empenho', dash(m.empenhoNumber)],
    ['Nº Processo', dash(m.processNumber)],
    ['Ordem de Serviço', dash(m.serviceOrder)],
    ['Início da medição', dash(m.measurementStartDate)],
    ['Fim da medição', dash(m.measurementEndDate)],
    ['Unidade Predial', dash(m.buildingUnit)],
    ['Observações', m.observations.trim() ? m.observations : '—'],
    ['Prestador', m.providerName],
    ['Tomador', m.takerName],
    ['Conta bancária', m.bankAccountName],
    ['Código tributário (contrato)', m.taxCodeCityName],
    [
      'Outras informações',
      buildEspelhoOutrasInformacoesBlock(m.notes, m.municipality, undefined, issRule ?? null)
    ]
  ];
}

/** Garante costCenterLabel nos PDFs/Excel a partir do id e da lista da API. */
export function espelhoMirrorForExport(
  draft: EspelhoMirrorDraft,
  costCenters: Array<{ id?: string; code?: string; name?: string }>
): EspelhoMirrorDraft {
  const label = resolveCostCenterRowLabel(draft, costCenters);
  return { ...draft, costCenterLabel: label || draft.costCenterLabel };
}
