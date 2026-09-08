export type ExtratoCaixaItem = {
  idxcx: number | null;
  codColigada: number | null;
  historico: string;
  codCxa: string;
  codCCusto: string;
  ccusto: string;
  valor: number;
  valorBaixa: number;
  entrada: number;
  saida: number;
  codFilial: number | null;
  data: string | null;
  dataCompensacao: string | null;
  codNatFinanceira: string;
  natureza: string;
  numeroDocumento: string;
  fornecedor: string;
  tipoOperacao: string;
  /** Linha originada de ajuste manual persistido. */
  isAjusteManual?: boolean;
  ajusteId?: string;
};

export type ExtratoCaixaPathFailure = {
  path: string;
  error: string;
};

export type ExtratoCaixaApiResponse = {
  success: boolean;
  message?: string;
  data: {
    configured: boolean;
    items: ExtratoCaixaItem[];
    total: number;
    configuredYears?: number[];
    pathFailures?: ExtratoCaixaPathFailure[];
    message?: string | null;
  };
};
