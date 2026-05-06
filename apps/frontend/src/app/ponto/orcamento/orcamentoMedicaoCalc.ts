import type { LinhaMedicao, TipoUnidadeFormula } from './orcamentoMedicaoTypes';

/** Calcula A (área) = C×L×N, V (volume) = A×H ou C×L×H×N */
export function calcA(linha: LinhaMedicao): number {
  if (linha.cabecalhoSecao) return 0;
  const tipoOrigAg = linha.tipoOrigemMedicao ?? 'm3';
  if (linha.linhaAgregadaCarga && tipoOrigAg === 'm2' && linha.volumeM3BrutoSomado != null) {
    return linha.volumeM3BrutoSomado;
  }
  const { C, L, N } = linha;
  return (C || 0) * (L || 0) * (N && N > 0 ? N : 1);
}

export function calcV(linha: LinhaMedicao, tipo: TipoUnidadeFormula): number {
  if (linha.cabecalhoSecao) return 0;
  const tipoOrigV = linha.tipoOrigemMedicao ?? 'm3';
  if (linha.linhaAgregadaCarga && linha.volumeM3BrutoSomado != null) {
    if (tipoOrigV === 'm2') {
      return linha.volumeM3BrutoSomado * (linha.H || 0);
    }
    if (tipoOrigV === 'm3') {
      return linha.volumeM3BrutoSomado;
    }
  }
  const { C, H, N } = linha;
  const A = calcA(linha);
  const n = N && N > 0 ? N : 1;
  switch (tipo) {
    case 'm3':
      return A * (H || 0);
    case 'm2':
      return A;
    case 'm':
      return (C || 0) * n;
    default:
      return 1;
  }
}

/** Calcula SUBTOTAL = V × empolamento. Se C,L,H vazios e valorManual preenchido, usa valorManual. */
export function calcularQuantidadeLinha(linha: LinhaMedicao, tipo: TipoUnidadeFormula): number {
  if (linha.cabecalhoSecao) return 0;
  const tipoOrigQ = linha.tipoOrigemMedicao ?? 'm3';
  const fator =
    linha.empolamento != null && linha.empolamento > 0
      ? linha.empolamento
      : (linha as unknown as { percPerda?: number }).percPerda != null
        ? 1 + (linha as unknown as { percPerda: number }).percPerda / 100
        : 1;
  /** Base agregada (m³): valorManual já soma os subtotais das demolições; ainda falta o % da linha de carga. */
  if (linha.linhaAgregadaCarga && tipoOrigQ === 'm3' && linha.valorManual != null && linha.valorManual >= 0) {
    return linha.valorManual * fator;
  }
  const temDimensoes = (linha.C || 0) !== 0 || (linha.L || 0) !== 0 || (linha.H || 0) !== 0;
  if (!temDimensoes && linha.valorManual != null && linha.valorManual >= 0) {
    return linha.valorManual * fator;
  }
  return calcV(linha, tipo) * fator;
}

export function inferirTipoUnidadePorDimensao(linhas: LinhaMedicao[] | undefined): TipoUnidadeFormula {
  const filtradas = linhas?.filter(ln => !ln.cabecalhoSecao);
  if (!filtradas?.length) return 'un';
  if (filtradas.some(ln => ln.linhaAgregadaCarga)) return 'm3';
  const hasH = filtradas.some(ln => (ln.H || 0) > 0);
  if (hasH) return 'm3';
  const hasL = filtradas.some(ln => (ln.L || 0) > 0);
  if (hasL) return 'm2';
  const hasC = filtradas.some(ln => (ln.C || 0) > 0);
  if (hasC) return 'm';
  return 'un';
}
