import { EXTRATO_TIPO_OPERACAO_AJUSTE_MANUAL } from '@/lib/extratoCaixaAjuste';
import { migrateLegacyFilialFilterIds } from '@/lib/extratoCaixaPolo';

/** Marca “todos selecionados” no preset (evita listas enormes e reexpande ao carregar). */
export const EXTRATO_FILTRO_ALL = '__ALL__';

export type ExtratoCaixaFiltroPayload = {
  ccFilterCodes: string[];
  natureFilterCodes: string[];
  poloFilterIds: string[];
  fornecedorFilterValues: string[];
  historicoFilterValues: string[];
  tipoOperacaoFilterValues: string[];
  movimentoTipoFilter: string[];
  periodFrom: string;
  periodTo: string;
};

export type ExtratoCaixaFiltroSalvo = {
  id: string;
  nome: string;
  payload: ExtratoCaixaFiltroPayload;
  createdAt: string;
  updatedAt: string;
};

export type ExtratoFiltroAllValues = {
  cc: string[];
  nature: string[];
  polo: string[];
  fornecedor: string[];
  historico: string[];
  tipoOperacao: string[];
  movimento: string[];
};

function compactField(selected: string[], allVals: string[]): string[] {
  if (allVals.length > 0 && selected.length >= allVals.length) {
    const set = new Set(allVals);
    if (selected.every((v) => set.has(v))) return [EXTRATO_FILTRO_ALL];
  }
  return [...selected];
}

function expandField(saved: string[], allVals: string[]): string[] {
  if (saved.includes(EXTRATO_FILTRO_ALL)) {
    return allVals.length > 0 ? [...allVals] : [];
  }
  if (allVals.length === 0) return [...saved];
  const set = new Set(allVals);
  const picked = saved.filter((v) => set.has(v));
  return picked.length > 0 ? picked : [...allVals];
}

export function compactExtratoFiltroPayload(
  draft: ExtratoCaixaFiltroPayload,
  all: ExtratoFiltroAllValues
): ExtratoCaixaFiltroPayload {
  return {
    ccFilterCodes: compactField(draft.ccFilterCodes, all.cc),
    natureFilterCodes: compactField(draft.natureFilterCodes, all.nature),
    poloFilterIds: compactField(draft.poloFilterIds, all.polo),
    fornecedorFilterValues: compactField(draft.fornecedorFilterValues, all.fornecedor),
    historicoFilterValues: compactField(draft.historicoFilterValues, all.historico),
    tipoOperacaoFilterValues: compactField(draft.tipoOperacaoFilterValues, all.tipoOperacao),
    movimentoTipoFilter: compactField(draft.movimentoTipoFilter, all.movimento),
    periodFrom: draft.periodFrom ?? '',
    periodTo: draft.periodTo ?? ''
  };
}

export function expandExtratoFiltroPayload(
  payload: ExtratoCaixaFiltroPayload,
  all: ExtratoFiltroAllValues
): ExtratoCaixaFiltroPayload {
  const raw = payload as ExtratoCaixaFiltroPayload & { filialFilterIds?: string[] };
  const rawPoloSource =
    payload.poloFilterIds?.length > 0 ? payload.poloFilterIds : (raw.filialFilterIds ?? []);
  const poloSource = migrateLegacyFilialFilterIds(rawPoloSource);

  return {
    ccFilterCodes: expandField(payload.ccFilterCodes ?? [], all.cc),
    natureFilterCodes: expandField(payload.natureFilterCodes ?? [], all.nature),
    poloFilterIds: expandField(poloSource, all.polo),
    fornecedorFilterValues: expandField(payload.fornecedorFilterValues ?? [], all.fornecedor),
    historicoFilterValues: expandField(payload.historicoFilterValues ?? [], all.historico),
    tipoOperacaoFilterValues: expandField(payload.tipoOperacaoFilterValues ?? [], all.tipoOperacao),
    movimentoTipoFilter: expandField(payload.movimentoTipoFilter ?? [], all.movimento),
    periodFrom: payload.periodFrom ?? '',
    periodTo: payload.periodTo ?? ''
  };
}

export type ExtratoFiltroOptionLabel = { value: string; label: string };

export type ExtratoFiltroLabelMaps = {
  cc: ExtratoFiltroOptionLabel[];
  nature: ExtratoFiltroOptionLabel[];
  polo: ExtratoFiltroOptionLabel[];
  fornecedor: ExtratoFiltroOptionLabel[];
  historico: ExtratoFiltroOptionLabel[];
  tipoOperacao: ExtratoFiltroOptionLabel[];
  movimento: ExtratoFiltroOptionLabel[];
};

export type ExtratoFiltroCampoDesmarcado = {
  campo: string;
  desmarcados: string[];
};

function payloadFieldsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

export function extratoFiltroPayloadsEquivalent(
  a: ExtratoCaixaFiltroPayload,
  b: ExtratoCaixaFiltroPayload,
  all: ExtratoFiltroAllValues
): boolean {
  const ca = compactExtratoFiltroPayload(a, all);
  const cb = compactExtratoFiltroPayload(b, all);
  return (
    ca.periodFrom === cb.periodFrom &&
    ca.periodTo === cb.periodTo &&
    payloadFieldsEqual(ca.ccFilterCodes, cb.ccFilterCodes) &&
    payloadFieldsEqual(ca.natureFilterCodes, cb.natureFilterCodes) &&
    payloadFieldsEqual(ca.poloFilterIds, cb.poloFilterIds) &&
    payloadFieldsEqual(ca.fornecedorFilterValues, cb.fornecedorFilterValues) &&
    payloadFieldsEqual(ca.historicoFilterValues, cb.historicoFilterValues) &&
    payloadFieldsEqual(ca.tipoOperacaoFilterValues, cb.tipoOperacaoFilterValues) &&
    payloadFieldsEqual(ca.movimentoTipoFilter, cb.movimentoTipoFilter)
  );
}

export function findMatchingExtratoFiltroSalvo(
  applied: ExtratoCaixaFiltroPayload,
  presets: ExtratoCaixaFiltroSalvo[],
  all: ExtratoFiltroAllValues
): ExtratoCaixaFiltroSalvo | null {
  for (const preset of presets) {
    const expanded = expandExtratoFiltroPayload(preset.payload, all);
    if (extratoFiltroPayloadsEquivalent(applied, expanded, all)) return preset;
  }
  return null;
}

function labelsDesmarcados(
  selected: string[],
  options: ExtratoFiltroOptionLabel[],
  allValues: string[]
): string[] {
  if (allValues.length === 0) return [];
  const selectedSet = new Set(selected);
  const isAllSelected =
    selected.length >= allValues.length && allValues.every((v) => selectedSet.has(v));
  if (isAllSelected) return [];
  return options.filter((o) => !selectedSet.has(o.value)).map((o) => o.label);
}

export function buildExtratoFiltrosDesmarcados(
  applied: ExtratoCaixaFiltroPayload,
  labelMaps: ExtratoFiltroLabelMaps,
  all: ExtratoFiltroAllValues
): ExtratoFiltroCampoDesmarcado[] {
  const campos: ExtratoFiltroCampoDesmarcado[] = [];

  const polo = labelsDesmarcados(applied.poloFilterIds, labelMaps.polo, all.polo);
  if (polo.length > 0) campos.push({ campo: 'Polo', desmarcados: polo });

  const cc = labelsDesmarcados(applied.ccFilterCodes, labelMaps.cc, all.cc);
  if (cc.length > 0) campos.push({ campo: 'Centro de custo', desmarcados: cc });

  const nature = labelsDesmarcados(applied.natureFilterCodes, labelMaps.nature, all.nature);
  if (nature.length > 0) campos.push({ campo: 'Natureza financeira', desmarcados: nature });

  const fornecedor = labelsDesmarcados(
    applied.fornecedorFilterValues,
    labelMaps.fornecedor,
    all.fornecedor
  );
  if (fornecedor.length > 0) campos.push({ campo: 'Fornecedor', desmarcados: fornecedor });

  const historico = labelsDesmarcados(applied.historicoFilterValues, labelMaps.historico, all.historico);
  if (historico.length > 0) campos.push({ campo: 'Histórico', desmarcados: historico });

  const tipoOp = labelsDesmarcados(
    applied.tipoOperacaoFilterValues,
    labelMaps.tipoOperacao,
    all.tipoOperacao
  ).filter((label) => label !== EXTRATO_TIPO_OPERACAO_AJUSTE_MANUAL);
  if (tipoOp.length > 0) campos.push({ campo: 'Tipo de operação', desmarcados: tipoOp });

  const movimento = labelsDesmarcados(applied.movimentoTipoFilter, labelMaps.movimento, all.movimento);
  if (movimento.length > 0) campos.push({ campo: 'Entradas e saídas', desmarcados: movimento });

  return campos;
}

export function describeExtratoFiltroPreset(payload: ExtratoCaixaFiltroPayload): string {
  const parts: string[] = [];
  if (payload.periodFrom || payload.periodTo) {
    const de = payload.periodFrom || '…';
    const ate = payload.periodTo || '…';
    parts.push(`Período ${de}–${ate}`);
  }
  const fields: { label: string; arr: string[] }[] = [
    { label: 'CC', arr: payload.ccFilterCodes },
    { label: 'Natureza', arr: payload.natureFilterCodes },
    { label: 'Polo', arr: payload.poloFilterIds },
    { label: 'Fornecedor', arr: payload.fornecedorFilterValues },
    { label: 'Histórico', arr: payload.historicoFilterValues },
    { label: 'Operação', arr: payload.tipoOperacaoFilterValues },
    { label: 'Mov.', arr: payload.movimentoTipoFilter }
  ];
  for (const { label, arr } of fields) {
    if (arr.includes(EXTRATO_FILTRO_ALL)) parts.push(`${label}: todos`);
    else if (arr.length > 0) parts.push(`${label}: ${arr.length}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Sem restrições';
}
