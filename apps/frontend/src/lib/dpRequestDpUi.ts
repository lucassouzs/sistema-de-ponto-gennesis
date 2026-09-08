import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

/** Etapas do feedback do Departamento Pessoal. */
export type DpFlowFeedbackStatus =
  | 'IN_REVIEW_DP'
  | 'IN_FINANCEIRO'
  | 'WAITING_RETURN_ACCOUNTING'
  | 'WAITING_RETURN'
  | 'WAITING_RETURN_ADM_TST'
  | 'WAITING_RETURN_ENGINEERING'
  | 'CONCLUDED'
  | 'CANCELLED';

export const DP_FLOW_FEEDBACK_STATUSES: DpFlowFeedbackStatus[] = [
  'IN_REVIEW_DP',
  'IN_FINANCEIRO',
  'WAITING_RETURN_ACCOUNTING',
  'WAITING_RETURN',
  'WAITING_RETURN_ADM_TST',
  'WAITING_RETURN_ENGINEERING',
  'CONCLUDED',
  'CANCELLED',
];

export const DP_STATUS_LABELS: Record<DpFlowFeedbackStatus, string> = {
  IN_REVIEW_DP: 'Em análise',
  IN_FINANCEIRO: 'No financeiro',
  WAITING_RETURN_ACCOUNTING: 'Pendência contábil',
  WAITING_RETURN: 'Pendência colaborador',
  WAITING_RETURN_ADM_TST: 'Pendência ADM/TST',
  WAITING_RETURN_ENGINEERING: 'Pendência engenharia',
  CONCLUDED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

export const DP_STATUS_LABEL_CLASS: Record<DpFlowFeedbackStatus, string> = {
  IN_REVIEW_DP: 'font-semibold text-yellow-800 dark:text-yellow-300',
  IN_FINANCEIRO: 'font-semibold text-indigo-800 dark:text-indigo-300',
  WAITING_RETURN_ACCOUNTING: 'font-semibold text-orange-800 dark:text-orange-300',
  WAITING_RETURN: 'font-semibold text-amber-800 dark:text-amber-300',
  WAITING_RETURN_ADM_TST: 'font-semibold text-orange-800 dark:text-orange-300',
  WAITING_RETURN_ENGINEERING: 'font-semibold text-orange-800 dark:text-orange-300',
  CONCLUDED: 'font-semibold text-green-700 dark:text-green-300',
  CANCELLED: 'font-semibold text-red-700 dark:text-red-300',
};

/** Status exibidos no filtro da fila DP (inclui etapas de tramitação). */
export const DP_FLOW_FILTER_STATUSES: DpFlowFeedbackStatus[] = [...DP_FLOW_FEEDBACK_STATUSES];

function toColoredSelectOption(value: DpFlowFeedbackStatus): MultiSelectSearchOption {
  const label = DP_STATUS_LABELS[value];
  return {
    value,
    label,
    searchText: label,
    labelClassName: DP_STATUS_LABEL_CLASS[value],
  };
}

/** Opções do select de feedback DP (com cores alinhadas ao badge da tabela). */
export function buildDpFeedbackSelectOptions(): MultiSelectSearchOption[] {
  return DP_FLOW_FEEDBACK_STATUSES.map(toColoredSelectOption);
}

/** Opções do filtro de status DP — mesmas etapas e rótulos do feedback. */
export function buildDpStatusFilterOptions(): MultiSelectSearchOption[] {
  return labeledToSelectOptions([
    { value: 'all', label: 'Todos' },
    ...DP_FLOW_FILTER_STATUSES.map((value) => ({
      value,
      label: DP_STATUS_LABELS[value],
    })),
  ]).map((opt) => {
    if (opt.value === 'all') return opt;
    const flow = opt.value as DpFlowFeedbackStatus;
    return toColoredSelectOption(flow);
  });
}
