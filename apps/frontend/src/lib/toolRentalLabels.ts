export type ToolRentalRequestStatus =
  | 'OPEN'
  | 'SUPPLIER_RELATION'
  | 'AWAITING_PAYMENT'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export type ToolRentalDemandType = 'NOVA_LOCACAO' | 'RENOVACAO' | 'DEVOLUCAO' | 'COMPRA';

export type ToolRentalPriority = 'NORMAL' | 'URGENT';

export type ToolRentalLogisticsMode =
  | 'ENTREGA_LOGISTICA'
  | 'RETIRADA_LOGISTICA'
  | 'ENTREGA_FORNECEDOR'
  | 'RETIRADA_FORNECEDOR';

export const TOOL_RENTAL_STATUS_LABELS: Record<ToolRentalRequestStatus, string> = {
  OPEN: 'Aberta',
  SUPPLIER_RELATION: 'Relação com o fornecedor',
  AWAITING_PAYMENT: 'Aguardando pagamento',
  COMPLETED: 'Finalizada',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

export const TOOL_RENTAL_STATUS_BADGE: Record<ToolRentalRequestStatus, string> = {
  OPEN: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  SUPPLIER_RELATION: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  AWAITING_PAYMENT: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  COMPLETED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  CANCELLED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

export const TOOL_RENTAL_DEMAND_LABELS: Record<ToolRentalDemandType, string> = {
  NOVA_LOCACAO: 'Nova locação',
  RENOVACAO: 'Renovação',
  DEVOLUCAO: 'Devolução',
  COMPRA: 'Compra',
};

export const TOOL_RENTAL_DEMAND_OPTIONS = (
  [
    { value: 'NOVA_LOCACAO', label: 'Nova locação' },
    { value: 'RENOVACAO', label: 'Renovação' },
    { value: 'DEVOLUCAO', label: 'Devolução' },
    { value: 'COMPRA', label: 'Compra' },
  ] as const
).map((opt) => opt);

export const TOOL_RENTAL_PRIORITY_LABELS: Record<ToolRentalPriority, string> = {
  NORMAL: 'Normal',
  URGENT: 'Urgente',
};

export const TOOL_RENTAL_PRIORITY_OPTIONS = (['NORMAL', 'URGENT'] as const).map((value) => ({
  value,
  label: TOOL_RENTAL_PRIORITY_LABELS[value],
  searchText: TOOL_RENTAL_PRIORITY_LABELS[value],
}));

export const TOOL_RENTAL_LOGISTICS_LABELS: Record<ToolRentalLogisticsMode, string> = {
  ENTREGA_LOGISTICA: 'Entrega pela logística',
  RETIRADA_LOGISTICA: 'Retirada pela logística',
  ENTREGA_FORNECEDOR: 'Entrega pelo fornecedor',
  RETIRADA_FORNECEDOR: 'Retirada pelo fornecedor',
};

export const TOOL_RENTAL_LOGISTICS_OPTIONS = (
  [
    'ENTREGA_LOGISTICA',
    'RETIRADA_LOGISTICA',
    'ENTREGA_FORNECEDOR',
    'RETIRADA_FORNECEDOR',
  ] as const
).map((value) => ({
  value,
  label: TOOL_RENTAL_LOGISTICS_LABELS[value],
  searchText: TOOL_RENTAL_LOGISTICS_LABELS[value],
}));

export function formatToolRentalStatus(status: string): string {
  return TOOL_RENTAL_STATUS_LABELS[status as ToolRentalRequestStatus] || status || '—';
}

export function toolRentalStatusBadgeClass(status: string): string {
  return (
    TOOL_RENTAL_STATUS_BADGE[status as ToolRentalRequestStatus] ||
    TOOL_RENTAL_STATUS_BADGE.OPEN
  );
}

export function formatToolRentalDemand(type: string): string {
  return TOOL_RENTAL_DEMAND_LABELS[type as ToolRentalDemandType] || type || '—';
}

export function formatToolRentalPriority(priority: string): string {
  return TOOL_RENTAL_PRIORITY_LABELS[priority as ToolRentalPriority] || priority || '—';
}

export function formatToolRentalLogistics(mode: string): string {
  return TOOL_RENTAL_LOGISTICS_LABELS[mode as ToolRentalLogisticsMode] || mode || '—';
}
