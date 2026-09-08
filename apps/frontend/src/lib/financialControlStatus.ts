export type FinancialControlStatus =
  | 'PROCESSO_COMPLETO'
  | 'PAGO'
  | 'AGUARDAR_NOTA'
  | 'AGUARDAR_PAGAMENTO'
  | 'LANCADO'
  | 'CANCELADO';

export const FINANCIAL_CONTROL_STATUS_STYLES: Record<
  FinancialControlStatus,
  { bg: string; text: string; label: string; dot: string; cardIcon: string; cardIconText: string }
> = {
  PROCESSO_COMPLETO: {
    bg: 'bg-yellow-200 dark:bg-yellow-900/40',
    text: 'text-yellow-900 dark:text-yellow-200',
    label: 'Processo completo',
    dot: 'bg-yellow-400',
    cardIcon: 'bg-yellow-100 dark:bg-yellow-900/30',
    cardIconText: 'text-yellow-600 dark:text-yellow-400',
  },
  PAGO: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-800 dark:text-green-200',
    label: 'Pago',
    dot: 'bg-green-500',
    cardIcon: 'bg-green-100 dark:bg-green-900/30',
    cardIconText: 'text-green-600 dark:text-green-400',
  },
  AGUARDAR_NOTA: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-800 dark:text-green-200',
    label: 'Aguardar nota',
    dot: 'bg-green-500',
    cardIcon: 'bg-green-100 dark:bg-green-900/30',
    cardIconText: 'text-green-600 dark:text-green-400',
  },
  AGUARDAR_PAGAMENTO: {
    bg: 'bg-sky-100 dark:bg-sky-900/30',
    text: 'text-sky-900 dark:text-sky-200',
    label: 'Aguardar pagamento',
    dot: 'bg-sky-300',
    cardIcon: 'bg-sky-100 dark:bg-sky-900/30',
    cardIconText: 'text-sky-600 dark:text-sky-400',
  },
  LANCADO: {
    bg: 'bg-slate-100 dark:bg-slate-800/60',
    text: 'text-slate-800 dark:text-slate-200',
    label: 'Lançado',
    dot: 'bg-slate-500',
    cardIcon: 'bg-slate-100 dark:bg-slate-800/50',
    cardIconText: 'text-slate-600 dark:text-slate-300',
  },
  CANCELADO: {
    bg: 'bg-red-200 dark:bg-red-900/40',
    text: 'text-red-900 dark:text-red-200',
    label: 'Cancelado',
    dot: 'bg-red-500',
    cardIcon: 'bg-red-100 dark:bg-red-900/30',
    cardIconText: 'text-red-600 dark:text-red-400',
  },
};

export const FINANCIAL_CONTROL_STATUS_OPTIONS: {
  value: FinancialControlStatus;
  label: string;
}[] = [
  { value: 'PROCESSO_COMPLETO', label: 'Processo completo' },
  { value: 'PAGO', label: 'Pago' },
  { value: 'AGUARDAR_NOTA', label: 'Aguardar nota' },
  { value: 'AGUARDAR_PAGAMENTO', label: 'Aguardar pagamento' },
  { value: 'LANCADO', label: 'Lançado' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

/** Opções do filtro da listagem (sem "Pago" isolado — verde entra em Aguardar nota). */
export const FINANCIAL_CONTROL_STATUS_FILTER_OPTIONS: {
  value: FinancialControlStatus;
  label: string;
}[] = [
  { value: 'PROCESSO_COMPLETO', label: 'Processo completo' },
  { value: 'AGUARDAR_NOTA', label: 'Aguardar nota' },
  { value: 'AGUARDAR_PAGAMENTO', label: 'Aguardar pagamento' },
  { value: 'LANCADO', label: 'Lançado' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

export const FINANCIAL_CONTROL_STATUS_EXPORT_LABELS: Record<FinancialControlStatus, string> = {
  PROCESSO_COMPLETO: 'PROCESSO COMPLETO',
  PAGO: 'PAGO',
  AGUARDAR_NOTA: 'AGUARDAR A NOTA',
  AGUARDAR_PAGAMENTO: 'AGUARDAR PAGAMENTO',
  LANCADO: 'LANÇADO',
  CANCELADO: 'CANCELADO',
};

export function isFinancialControlPaidStatus(status: FinancialControlStatus): boolean {
  return status === 'PAGO' || status === 'PROCESSO_COMPLETO';
}

export function isFinancialControlOpenStatus(status: FinancialControlStatus): boolean {
  return status === 'AGUARDAR_PAGAMENTO' || status === 'AGUARDAR_NOTA' || status === 'LANCADO';
}
