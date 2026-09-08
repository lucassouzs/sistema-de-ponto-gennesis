import { resolveContratoNome } from '@/data/juridico-contratos';
import { toMoneyNumber, type JuridicoProcesso } from '@/data/juridico-processos-ativos';

export const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

export const MESES_LONGOS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export type JuridicoDashboardFilters = {
  empresa: string;
  contrato: string;
  polo: string;
  objeto: string;
  ano: string;
  mes: string;
};

export const EMPTY_JURIDICO_DASHBOARD_FILTERS: JuridicoDashboardFilters = {
  empresa: '',
  contrato: '',
  polo: '',
  objeto: '',
  ano: '',
  mes: '',
};

export type JuridicoGroupBucket = {
  key: string;
  label: string;
  processos: number;
  acordos: number;
  valorAcordo: number;
  valorRO: number;
  valorCausa: number;
  valorSentenca: number;
  valorCustas: number;
};

export type JuridicoRankItem = {
  key: string;
  label: string;
  value: number;
  meta?: string;
};

/** Datas da planilha vêm como `dd/MM/yyyy`. */
export function parseBrDate(value?: string | null): Date | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]!.length === 2 ? `20${match[3]}` : match[3]);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isAcordoFechado(row: JuridicoProcesso): boolean {
  const flag = (row.acordo || '').trim().toUpperCase();
  if (flag.startsWith('S')) return true;
  if (flag.startsWith('N')) return false;
  return Boolean((row.dataAcordo || '').trim()) || toMoneyNumber(row.valorAcordo) > 0;
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function objetoKey(piece: string): string {
  return stripAccents(piece).toUpperCase().replace(/[.;]+$/g, '').replace(/\s+/g, ' ').trim();
}

/** Abreviações e grafias diferentes que representam o mesmo objeto. */
const OBJETO_ALIASES: Record<string, string> = {
  RECONHECIMENTO: 'RECONHECIMENTO DE VÍNCULO EMPREGATÍCIO',
  'RECONHECIMENTO DE VINCULO': 'RECONHECIMENTO DE VÍNCULO EMPREGATÍCIO',
  'RECONHECIMENTO DE VINCULO EMPREGATICIO': 'RECONHECIMENTO DE VÍNCULO EMPREGATÍCIO',
  'RECONHECIMENTO DE VINCULO DE EMPREGO': 'RECONHECIMENTO DE VÍNCULO EMPREGATÍCIO',
  VT: 'VALE TRANSPORTE',
  VA: 'VALE ALIMENTAÇÃO',
  'VALE TRANSPORTE': 'VALE TRANSPORTE',
  'VALE ALIMENTACAO': 'VALE ALIMENTAÇÃO',
  'INTEGRACAO DO VT': 'INTEGRAÇÃO DO VALE TRANSPORTE',
  'INTEGRACAO DO VA': 'INTEGRAÇÃO DO VALE ALIMENTAÇÃO',
  'INTEGRACAO DO VALE TRANSPORTE': 'INTEGRAÇÃO DO VALE TRANSPORTE',
  'INTEGRACAO DO VALE ALIMENTACAO': 'INTEGRAÇÃO DO VALE ALIMENTAÇÃO',
  'DANO MORAL': 'DANO MORAL',
  INSALUBRIDADE: 'INSALUBRIDADE',
  'INSALUB': 'INSALUBRIDADE',
  'HORAS EXTRAS': 'HORAS EXTRAS',
  'HORA EXTRA': 'HORAS EXTRAS',
  'ACUMULO DE FUNCAO': 'ACÚMULO DE FUNÇÃO',
  'DESVIO DE FUNCAO': 'DESVIO DE FUNÇÃO',
  'GRUPO ECONOMICO': 'GRUPO ECONÔMICO',
  PERICULOSIDADE: 'PERICULOSIDADE',
  'RESCISAO INDIRETA': 'RESCISÃO INDIRETA',
  'DIFERENCA SALARIAL': 'DIFERENÇA SALARIAL',
  'ASSEDIO MORAL': 'ASSÉDIO MORAL',
  'ACIDENTE DE TRABALHO': 'ACIDENTE DE TRABALHO',
  'MULTA 477': 'MULTA DO ART. 477',
  'MULTA DO ARTIGO 477': 'MULTA DO ART. 477',
  'MULTA POR RESCISAO CONTRATUAL': 'MULTA POR RESCISÃO CONTRATUAL',
  'ADD NOTURNO': 'ADICIONAL NOTURNO',
  'ADD. NOTURNO': 'ADICIONAL NOTURNO',
  'ADICIONAL NOTURNO': 'ADICIONAL NOTURNO',
  'VERBAS RESCISORIAS': 'VERBAS RESCISÓRIAS',
};

/**
 * Objetos do processo. A planilha guarda vários por linha separados por `/`,
 * com grafias/abreviações diferentes entre as colunas OBJETO e OBJETO2.
 */
export function splitObjetos(row: JuridicoProcesso): Array<{ key: string; label: string }> {
  const source = (row.objeto2 || '').trim() || (row.objeto || '').trim();
  if (!source) return [];
  const seen = new Map<string, string>();
  for (const piece of source.split(/[/;]/)) {
    const clean = piece.replace(/\s+/g, ' ').trim();
    if (clean.length < 3) continue;
    const key = objetoKey(clean);
    if (!key) continue;
    const alias = OBJETO_ALIASES[key];
    const label = alias || clean.toUpperCase();
    const finalKey = alias ? objetoKey(alias) : key;
    if (!seen.has(finalKey)) seen.set(finalKey, label);
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label }));
}

export function formatCompactBRL(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} Mi`;
  }
  if (abs >= 10_000) {
    return `R$ ${(value / 1_000).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} Mil`;
  }
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatFullBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function contratoLabel(row: JuridicoProcesso): string {
  return resolveContratoNome(row.contrato) || 'Sem contrato';
}

export type JuridicoDashboardOptions = {
  empresas: string[];
  polos: string[];
  anos: string[];
  objetos: Array<{ value: string; label: string }>;
  contratos: Array<{ value: string; label: string }>;
};

export function buildDashboardOptions(rows: JuridicoProcesso[]): JuridicoDashboardOptions {
  const empresas = new Set<string>();
  const polos = new Set<string>();
  const anos = new Set<string>();
  const objetos = new Map<string, string>();
  const contratos = new Map<string, string>();

  for (const row of rows) {
    const empresa = (row.empresa || '').trim();
    if (empresa) empresas.add(empresa);
    const polo = (row.polo || '').trim();
    if (polo) polos.add(polo);
    const abertura = parseBrDate(row.dataAbertura);
    if (abertura) anos.add(String(abertura.getFullYear()));
    for (const objeto of splitObjetos(row)) {
      if (!objetos.has(objeto.key)) objetos.set(objeto.key, objeto.label);
    }
    const contrato = (row.contrato || '').trim();
    if (contrato && !contratos.has(contrato)) contratos.set(contrato, contratoLabel(row));
  }

  return {
    empresas: [...empresas].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    polos: [...polos].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    anos: [...anos].sort((a, b) => b.localeCompare(a)),
    objetos: [...objetos.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    contratos: [...contratos.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
  };
}

export function applyDashboardFilters(
  rows: JuridicoProcesso[],
  filters: JuridicoDashboardFilters,
): JuridicoProcesso[] {
  const mesIndex = filters.mes ? Number(filters.mes) : null;
  return rows.filter((row) => {
    if (filters.empresa && (row.empresa || '').trim() !== filters.empresa) return false;
    if (filters.contrato && (row.contrato || '').trim() !== filters.contrato) return false;
    if (filters.polo && (row.polo || '').trim() !== filters.polo) return false;
    if (filters.objeto && !splitObjetos(row).some((o) => o.key === filters.objeto)) return false;
    if (filters.ano || mesIndex) {
      const abertura = parseBrDate(row.dataAbertura);
      if (!abertura) return false;
      if (filters.ano && String(abertura.getFullYear()) !== filters.ano) return false;
      if (mesIndex && abertura.getMonth() + 1 !== mesIndex) return false;
    }
    return true;
  });
}

export type JuridicoDashboardTotals = {
  processos: number;
  acordos: number;
  valorCausa: number;
  valorSentenca: number;
  valorCustas: number;
  valorRO: number;
  valorAcordo: number;
};

export function computeTotals(rows: JuridicoProcesso[]): JuridicoDashboardTotals {
  const totals: JuridicoDashboardTotals = {
    processos: rows.length,
    acordos: 0,
    valorCausa: 0,
    valorSentenca: 0,
    valorCustas: 0,
    valorRO: 0,
    valorAcordo: 0,
  };
  for (const row of rows) {
    if (isAcordoFechado(row)) totals.acordos += 1;
    totals.valorCausa += toMoneyNumber(row.valorCausa);
    totals.valorSentenca += toMoneyNumber(row.valorSentenca);
    totals.valorCustas += toMoneyNumber(row.valorCustas);
    totals.valorRO += toMoneyNumber(row.valorRO);
    totals.valorAcordo += toMoneyNumber(row.valorAcordo);
  }
  return totals;
}

function groupRows(
  rows: JuridicoProcesso[],
  keyOf: (row: JuridicoProcesso) => string,
  labelOf: (row: JuridicoProcesso) => string,
): JuridicoGroupBucket[] {
  const buckets = new Map<string, JuridicoGroupBucket>();
  for (const row of rows) {
    const key = keyOf(row) || 'sem-dado';
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: labelOf(row),
        processos: 0,
        acordos: 0,
        valorAcordo: 0,
        valorRO: 0,
        valorCausa: 0,
        valorSentenca: 0,
        valorCustas: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.processos += 1;
    if (isAcordoFechado(row)) bucket.acordos += 1;
    bucket.valorAcordo += toMoneyNumber(row.valorAcordo);
    bucket.valorRO += toMoneyNumber(row.valorRO);
    bucket.valorCausa += toMoneyNumber(row.valorCausa);
    bucket.valorSentenca += toMoneyNumber(row.valorSentenca);
    bucket.valorCustas += toMoneyNumber(row.valorCustas);
  }
  return [...buckets.values()].sort((a, b) => b.processos - a.processos);
}

export function groupByEmpresa(rows: JuridicoProcesso[]): JuridicoGroupBucket[] {
  return groupRows(
    rows,
    (row) => (row.empresa || '').trim().toUpperCase() || 'SEM EMPRESA',
    (row) => (row.empresa || '').trim() || 'Sem empresa',
  );
}

export function groupByContrato(rows: JuridicoProcesso[]): JuridicoGroupBucket[] {
  return groupRows(rows, (row) => (row.contrato || '').trim() || 'sem-contrato', contratoLabel);
}

/** Ranking de buckets por um valor, descartando zeros e limitando a quantidade. */
export function rankBuckets(
  buckets: JuridicoGroupBucket[],
  pick: (bucket: JuridicoGroupBucket) => number,
  limit = 10,
): JuridicoRankItem[] {
  return buckets
    .map((bucket) => ({ key: bucket.key, label: bucket.label, value: pick(bucket) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function objetoIndex(rows: JuridicoProcesso[], limit = 15): JuridicoRankItem[] {
  const counts = new Map<string, { label: string; value: number }>();
  for (const row of rows) {
    for (const objeto of splitObjetos(row)) {
      const current = counts.get(objeto.key);
      if (current) current.value += 1;
      else counts.set(objeto.key, { label: objeto.label, value: 1 });
    }
  }
  return [...counts.entries()]
    .map(([key, item]) => ({ key, label: item.label, value: item.value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'pt-BR'))
    .slice(0, limit);
}

export type JuridicoObjetoPorContrato = {
  key: string;
  contrato: string;
  total: number;
  objetos: JuridicoRankItem[];
};

export function objetoIndexByContrato(
  rows: JuridicoProcesso[],
  contratosLimit = 6,
  objetosLimit = 6,
): JuridicoObjetoPorContrato[] {
  const groups = new Map<string, { contrato: string; counts: Map<string, JuridicoRankItem> }>();
  for (const row of rows) {
    const objetos = splitObjetos(row);
    if (!objetos.length) continue;
    const key = (row.contrato || '').trim() || 'sem-contrato';
    let group = groups.get(key);
    if (!group) {
      group = { contrato: contratoLabel(row), counts: new Map() };
      groups.set(key, group);
    }
    for (const objeto of objetos) {
      const current = group.counts.get(objeto.key);
      if (current) current.value += 1;
      else group.counts.set(objeto.key, { key: objeto.key, label: objeto.label, value: 1 });
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const objetos = [...group.counts.values()].sort((a, b) => b.value - a.value);
      return {
        key,
        contrato: group.contrato,
        total: objetos.reduce((sum, item) => sum + item.value, 0),
        objetos: objetos.slice(0, objetosLimit),
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, contratosLimit);
}

export type JuridicoAcordoMes = {
  key: string;
  label: string;
  quantidade: number;
  valor: number;
};

export function acordosPorMes(rows: JuridicoProcesso[]): JuridicoAcordoMes[] {
  const buckets = new Map<string, JuridicoAcordoMes>();
  for (const row of rows) {
    if (!isAcordoFechado(row)) continue;
    const date = parseBrDate(row.dataAcordo);
    if (!date) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: `${MESES_CURTOS[date.getMonth()]}/${String(date.getFullYear()).slice(2)}`,
        quantidade: 0,
        valor: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.quantidade += 1;
    bucket.valor += toMoneyNumber(row.valorAcordo);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export type JuridicoAcordoReclamante = {
  id: string;
  reclamante: string;
  contrato: string;
  empresa: string;
  data: string;
  valor: number;
};

export function acordosPorReclamante(rows: JuridicoProcesso[]): JuridicoAcordoReclamante[] {
  return rows
    .filter(isAcordoFechado)
    .map((row) => ({
      id: row.id,
      reclamante: row.reclamante || row.numeroProcesso,
      contrato: contratoLabel(row),
      empresa: (row.empresa || '').trim() || '—',
      data: (row.dataAcordo || '').trim() || '—',
      valor: toMoneyNumber(row.valorAcordo),
    }))
    .sort((a, b) => b.valor - a.valor || a.reclamante.localeCompare(b.reclamante, 'pt-BR'));
}
