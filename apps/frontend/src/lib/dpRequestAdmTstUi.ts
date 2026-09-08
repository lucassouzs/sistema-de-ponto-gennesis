import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

/** Etapas do fluxo ADM/TST (filtro, feedback e badges). */
export type AdmTstFlowStatus =
  | 'IN_REVIEW_DP'
  | 'WAITING_SUPPLIES'
  | 'WAITING_PAYMENT'
  | 'CONCLUDED'
  | 'CANCELLED';

export const ADM_TST_FLOW_STATUSES: AdmTstFlowStatus[] = [
  'IN_REVIEW_DP',
  'WAITING_SUPPLIES',
  'WAITING_PAYMENT',
  'CONCLUDED',
  'CANCELLED',
];

export const ADM_TST_STATUS_LABELS: Record<AdmTstFlowStatus, string> = {
  IN_REVIEW_DP: 'Em análise',
  WAITING_SUPPLIES: 'Aguardando setor de suprimentos',
  WAITING_PAYMENT: 'Aguardando pagamento',
  CONCLUDED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

export const ADM_TST_STATUS_LABEL_CLASS: Record<AdmTstFlowStatus, string> = {
  IN_REVIEW_DP: 'font-semibold text-yellow-800 dark:text-yellow-300',
  WAITING_SUPPLIES: 'font-semibold text-orange-800 dark:text-orange-300',
  WAITING_PAYMENT: 'font-semibold text-orange-800 dark:text-orange-300',
  CONCLUDED: 'font-semibold text-green-700 dark:text-green-300',
  CANCELLED: 'font-semibold text-red-700 dark:text-red-300',
};

export const ADM_TST_STATUS_ROW_BADGE: Record<AdmTstFlowStatus, string> = {
  IN_REVIEW_DP: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  WAITING_SUPPLIES: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  WAITING_PAYMENT: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  CONCLUDED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

/** Status em que a equipe ADM/TST pode registrar feedback. */
export const ADM_TST_MAY_SEND_FEEDBACK_STATUSES: AdmTstFlowStatus[] = [
  'IN_REVIEW_DP',
  'WAITING_SUPPLIES',
  'WAITING_PAYMENT',
];

export function isAdmTstFlowStatus(status: string): status is AdmTstFlowStatus {
  return (ADM_TST_FLOW_STATUSES as readonly string[]).includes(status);
}

export function getAdmTstStatusLabel(status: string): string {
  if (isAdmTstFlowStatus(status)) return ADM_TST_STATUS_LABELS[status];
  return status;
}

export function getAdmTstStatusRowBadge(status: string): string {
  if (isAdmTstFlowStatus(status)) return ADM_TST_STATUS_ROW_BADGE[status];
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

function toColoredSelectOption(value: AdmTstFlowStatus): MultiSelectSearchOption {
  const label = ADM_TST_STATUS_LABELS[value];
  return {
    value,
    label,
    searchText: label,
    labelClassName: ADM_TST_STATUS_LABEL_CLASS[value],
  };
}

/** Opções do select de feedback ADM/TST (com cores alinhadas ao badge da tabela). */
export function buildAdmTstFeedbackSelectOptions(): MultiSelectSearchOption[] {
  return ADM_TST_FLOW_STATUSES.map(toColoredSelectOption);
}

/** Opções do filtro de status ADM/TST — mesmas etapas e rótulos do feedback. */
export function buildAdmTstStatusFilterOptions(): MultiSelectSearchOption[] {
  return labeledToSelectOptions([
    { value: 'all', label: 'Todos' },
    ...ADM_TST_FLOW_STATUSES.map((value) => ({
      value,
      label: ADM_TST_STATUS_LABELS[value],
    })),
  ]).map((opt) => {
    if (opt.value === 'all') return opt;
    const flow = opt.value as AdmTstFlowStatus;
    return toColoredSelectOption(flow);
  });
}
