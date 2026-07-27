export type ControleNfsTab = {
  key: string;
  label: string;
  sheetName: string;
};

export type ControleNfsSheetData = {
  tab: ControleNfsTab;
  spreadsheetId: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
  fetchedAt: string;
};

export type ControleNfsValorBrutoSummary = {
  total: number;
  tabCount: number;
  tabsWithData: number;
  fetchedAt: string;
};

export type ControleNfsTabTotals = {
  tabKey: string;
  label: string;
  valorBruto: number;
  valorBrutoNaoPago: number;
  valorRecebido: number;
  valorLiquido: number;
  totalImpostos: number;
  contaVinculada: number;
  hasContaVinculadaColumn?: boolean;
};

export type ControleNfsCardsDateFilter = {
  emissaoDateFrom?: string;
  emissaoDateTo?: string;
  recebimentoDateFrom?: string;
  recebimentoDateTo?: string;
};

export type ControleNfsCardsFilterState = {
  tabKeys: string[];
  emissaoDateFrom: string;
  emissaoDateTo: string;
  recebimentoDateFrom: string;
  recebimentoDateTo: string;
};

export type ControleNfsFilterOptions = {
  yearsEmissao: number[];
  yearsRecebimento: number[];
};

export type ControleNfsTotalsSummary = {
  valorBruto: number;
  valorBrutoNaoPago: number;
  valorRecebido: number;
  valorLiquido: number;
  totalImpostos: number;
  contaVinculada: number;
  tabCount: number;
  tabsWithValorBruto: number;
  tabsWithValorBrutoNaoPago: number;
  tabsWithValorRecebido: number;
  tabsWithValorLiquido: number;
  tabsWithImpostos: number;
  tabsWithContaVinculada: number;
  byTab: ControleNfsTabTotals[];
  filterOptions?: ControleNfsFilterOptions;
  fetchedAt: string;
};

export const CONTROLE_NFS_SPREADSHEET_URL =
  'https://docs.google.com/spreadsheets/d/1CDe_Sh58Z3gIGcHishuWrrPC58iIdXRUFXld3rdYpZ0/edit';
