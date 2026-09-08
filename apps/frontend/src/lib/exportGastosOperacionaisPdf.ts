import {
  exportExtratoCaixaPdf,
  type ExportExtratoCaixaPdfInput,
  type ExtratoCaixaResumoRow,
  type ExtratoCaixaPdfSection
} from './exportExtratoCaixaPdf';

export type GastosOperacionaisPdfContractRow = {
  contract: string;
  mesesLabel: string;
  anoLabel: string;
  total: number;
};

export type GastosOperacionaisPdfLocalityGroup = {
  localityLabel: string;
  contractCount: number;
  subtotal: number;
  rows: GastosOperacionaisPdfContractRow[];
};

export type ExportGastosOperacionaisPdfInput = {
  filterLines: string[];
  totalGastos: number;
  contractCount: number;
  localityCount: number;
  groups: GastosOperacionaisPdfLocalityGroup[];
  sheetUpdatedAt?: string;
  generatedAt?: Date;
};

function buildContractLabel(row: GastosOperacionaisPdfContractRow): string {
  return `${row.contract} (${row.mesesLabel}, ${row.anoLabel})`;
}

function buildResumoRow(row: GastosOperacionaisPdfContractRow): ExtratoCaixaResumoRow {
  const total = Math.abs(row.total);
  return {
    key: row.contract,
    label: buildContractLabel(row),
    totalEntrada: 0,
    totalSaida: total,
    totalValor: -total
  };
}

function buildSections(groups: GastosOperacionaisPdfLocalityGroup[]): ExtratoCaixaPdfSection[] {
  return groups.map((group) => ({
    title: group.localityLabel,
    rowLabelHeader: 'Contrato',
    rows: group.rows.map(buildResumoRow),
    totalRowLabel: `Subtotal — ${group.localityLabel}`,
    footnote: `${group.contractCount} ${group.contractCount === 1 ? 'contrato' : 'contratos'}`,
    preserveRowOrder: true
  }));
}

export async function exportGastosOperacionaisPdf(
  input: ExportGastosOperacionaisPdfInput
): Promise<void> {
  const generatedAt = input.generatedAt ?? new Date();
  const datePart = generatedAt.toISOString().slice(0, 10);

  const payload: ExportExtratoCaixaPdfInput = {
    title: 'Gastos Operacionais',
    subtitle: 'QUERY BASE DE GASTOS — gastos operacionais por contrato',
    generatedAt,
    stats: {
      totalEntrada: 0,
      totalSaida: input.totalGastos,
      saldoLiquido: -input.totalGastos,
      qtdEntrada: 0,
      qtdSaida: input.contractCount
    },
    movimentacoesFiltradas: input.contractCount,
    filterLines: input.filterLines,
    includeFilterBox: true,
    filterBoxTitle: 'Filtros aplicados',
    filterBoxEmptyMessage: 'Nenhum filtro restritivo aplicado (todos os contratos visíveis).',
    headerConsolidadoNote: 'Consolidado por contrato — QUERY BASE DE GASTOS',
    includeStatsCards: false,
    resumoColumnLayout: 'saida-only',
    sections: buildSections(input.groups),
    fileName: `gastos-operacionais_${datePart}`,
    footerDocumentLabel: 'Gastos Operacionais'
  };

  await exportExtratoCaixaPdf(payload);
}
