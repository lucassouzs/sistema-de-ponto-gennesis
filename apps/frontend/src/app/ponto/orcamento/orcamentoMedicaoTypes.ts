export type TipoUnidadeFormula = 'm3' | 'm2' | 'm' | 'un';

/** Linha de medição para memória de cálculo dos quantitativos (C, L, H, N, empolamento, descrição) */
export interface LinhaMedicao {
  /** Linha visual de seção (cabeçalho da grade no corpo); não entra em totais nem na carga agregada. */
  cabecalhoSecao?: boolean;
  descricao?: string;
  origemLinhaId?: string;
  /** Rótulo da composição de origem na planilha (ex.: 2.1.1) — memória / carga agregada. */
  origemComposicaoRotulo?: string;
  origemComposicaoDescricao?: string;
  C: number;
  L: number;
  H: number;
  N: number;
  empolamento: number;
  valorManual?: number;
  /**
   * Carga agregada: soma na origem — para m³ soma de volumes; para m² soma de áreas (base para A e para V = A×H na carga).
   */
  volumeM3BrutoSomado?: number;
  /** Unidade da composição de origem (define como interpretar volumeM3BrutoSomado na linha agregada da carga). */
  tipoOrigemMedicao?: TipoUnidadeFormula;
  /** Linha gerada pela agregação automática da carga (não é detalhe por medição). */
  linhaAgregadaCarga?: boolean;
  editavelC?: boolean;
  editavelL?: boolean;
  editavelH?: boolean;
}

/** Rótulo exibido no cabeçalho das colunas de medição e % (memória de cálculo). */
export interface RotulosColunasMedicao {
  /** Primeira coluna (descrição das linhas de medição). Padrão na UI: «DESCRIÇÃO: ». */
  descricao?: string;
  C?: string;
  L?: string;
  H?: string;
  N?: string;
  /** Coluna empolamento / % */
  pct?: string;
}

/**
 * Opções do cabeçalho (só rótulo; ordem dos dados C/L/H/N no cálculo não muda).
 * Inclui letras de coluna e unidades / períodos usuais.
 */
export const ROTULO_COLUNA_MEDICAO_OPCOES = [
  'C',
  'L',
  'H',
  'N',
  '%',
  'Mês',
  'm',
  'M',
  'm²',
  'm³',
  'UN',
  'Kg',
  't',
  'h',
  'dia',
  '—'
] as const;

export interface DimensoesItem {
  tipoUnidade: TipoUnidadeFormula;
  linhas: LinhaMedicao[];
  /** Cabeçalhos editáveis C/L/H/N/% (ex.: Mês, Kg). */
  rotulosColunas?: RotulosColunasMedicao;
}
