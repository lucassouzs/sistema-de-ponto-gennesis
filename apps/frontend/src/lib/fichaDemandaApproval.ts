export type PoloFd = 'DF' | 'GO';

export type DemandSheetApprovalStatus =
  | 'WAITING_MANAGER'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type DemandSheetPurchaseStatus =
  | 'WAREHOUSE_DF'
  | 'WAREHOUSE_GO'
  | 'FULLY_FULFILLED_BY_STOCK'
  | 'PARTIALLY_FULFILLED_BY_STOCK'
  | 'PURCHASE_REQUEST'
  | 'SUPPLIES'
  | 'FINISHED';

export const FD_PURCHASE_STATUS_OPTIONS: {
  value: DemandSheetPurchaseStatus;
  label: string;
}[] = [
  { value: 'WAREHOUSE_DF', label: 'Almoxarifado DF' },
  { value: 'WAREHOUSE_GO', label: 'Almoxarifado GO' },
  { value: 'FULLY_FULFILLED_BY_STOCK', label: 'Atendida totalmente pelo estoque' },
  { value: 'PARTIALLY_FULFILLED_BY_STOCK', label: 'Atendida parcialmente pelo estoque' },
  { value: 'PURCHASE_REQUEST', label: 'Solicitação de compra' },
  { value: 'SUPPLIES', label: 'Suprimentos' },
  { value: 'FINISHED', label: 'Finalizado' },
];

export const FD_PURCHASE_STATUS_LABELS: Record<DemandSheetPurchaseStatus, string> =
  Object.fromEntries(
    FD_PURCHASE_STATUS_OPTIONS.map((o) => [o.value, o.label])
  ) as Record<DemandSheetPurchaseStatus, string>;

export function fdPurchaseStatusBadgeClass(status: DemandSheetPurchaseStatus | null | undefined): string {
  if (!status) {
    return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
  switch (status) {
    case 'FINISHED':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'PURCHASE_REQUEST':
    case 'SUPPLIES':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'FULLY_FULFILLED_BY_STOCK':
    case 'PARTIALLY_FULFILLED_BY_STOCK':
      return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300';
    default:
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  }
}

export function purchaseStatusLabel(value: DemandSheetPurchaseStatus | null | undefined): string {
  if (!value) return 'Sem status';
  return FD_PURCHASE_STATUS_LABELS[value] ?? value;
}

export interface FdAnexo {
  id: string;
  name: string;
  url?: string;
}

export interface FichaDemandaApprovalRecord {
  id: string;
  numMovRm: string;
  idMovRm: string;
  codigoPedido: string;
  solicitanteId: string;
  solicitanteNome: string;
  contratoId: string;
  contratoNome: string;
  obra: string;
  codFichaDemanda: string;
  faturamentoEstimado: number | string;
  custoEstimado: number | string;
  observacao: string;
  dataHora: string;
  polo: PoloFd;
  anexos: FdAnexo[];
  status: DemandSheetApprovalStatus;
  purchaseStatus?: DemandSheetPurchaseStatus | null;
  purchaseStatusUpdatedAt?: string | null;
  purchaseStatusUpdaterNome?: string | null;
  managerApprovalComment?: string | null;
  managerRejectionReason?: string | null;
  managerApproverNome?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FichaDemandaApprovalFormState {
  numMovRm: string;
  idMovRm: string;
  codigoPedido: string;
  solicitanteId: string;
  contratoId: string;
  obra: string;
  codFichaDemanda: string;
  faturamentoEstimado: string;
  custoEstimado: string;
  observacao: string;
  dataHora: string;
  polo: PoloFd | '';
  anexos: FdAnexo[];
}

export const FD_STATUS_LABELS: Record<DemandSheetApprovalStatus, string> = {
  WAITING_MANAGER: 'Aguardando aprovação do gestor',
  APPROVED: 'Aprovada',
  REJECTED: 'Reprovada',
  CANCELLED: 'Cancelada',
};

export function fdStatusBadgeClass(status: DemandSheetApprovalStatus): string {
  switch (status) {
    case 'WAITING_MANAGER':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'APPROVED':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'REJECTED':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
}

export function formatDateTimePtBr(date: Date = new Date()): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function parseCurrencyToNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  if (!value?.toString().trim()) return 0;
  const s = String(value).replace(/[R$\s]/g, '').trim();
  if (!s) return 0;
  if (s.includes(',')) {
    const cleaned = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isNaN(n) ? 0 : n;
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

export function formatCurrencyInput(value: number): string {
  if (!value) return '';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function currencyDigitsToFormatted(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return formatCurrencyInput(parseInt(digits, 10) / 100);
}

export function adjustCurrency(value: string, deltaCents: number): string {
  const current = Math.round(parseCurrencyToNumber(value) * 100);
  const next = Math.max(0, current + deltaCents);
  return formatCurrencyInput(next / 100);
}

export function emptyFichaDemandaForm(): FichaDemandaApprovalFormState {
  return {
    numMovRm: '',
    idMovRm: '',
    codigoPedido: '',
    solicitanteId: '',
    contratoId: '',
    obra: '',
    codFichaDemanda: '',
    faturamentoEstimado: '',
    custoEstimado: '',
    observacao: '',
    dataHora: formatDateTimePtBr(),
    polo: '',
    anexos: [],
  };
}

export function recordToForm(record: FichaDemandaApprovalRecord): FichaDemandaApprovalFormState {
  const fat =
    typeof record.faturamentoEstimado === 'number'
      ? formatCurrencyInput(record.faturamentoEstimado)
      : String(record.faturamentoEstimado || '');
  const custo =
    typeof record.custoEstimado === 'number'
      ? formatCurrencyInput(record.custoEstimado)
      : String(record.custoEstimado || '');

  return {
    numMovRm: record.numMovRm,
    idMovRm: record.idMovRm,
    codigoPedido: record.codigoPedido,
    solicitanteId: record.solicitanteId,
    contratoId: record.contratoId,
    obra: record.obra,
    codFichaDemanda: record.codFichaDemanda,
    faturamentoEstimado: fat,
    custoEstimado: custo,
    observacao: record.observacao,
    dataHora: record.dataHora,
    polo: record.polo,
    anexos: record.anexos || [],
  };
}

export function validateFichaDemandaForm(form: FichaDemandaApprovalFormState): string | null {
  if (!form.numMovRm.trim()) return 'Informe o NUM MOV RM.';
  if (!form.idMovRm.trim()) return 'Informe o ID MOV RM.';
  if (!form.codigoPedido.trim()) return 'Informe o código do pedido.';
  if (!form.solicitanteId.trim()) return 'Selecione o solicitante.';
  if (!form.contratoId.trim()) return 'Selecione o contrato.';
  if (!form.obra.trim()) return 'Selecione a obra.';
  if (!form.codFichaDemanda.trim()) return 'Informe o código da ficha de demanda.';
  if (!form.faturamentoEstimado.trim()) return 'Informe o faturamento estimado.';
  if (!form.custoEstimado.trim()) return 'Informe o custo estimado.';
  if (!form.observacao.trim()) return 'Informe a observação.';
  if (!form.polo) return 'Selecione o polo.';
  return null;
}

export function formToApiPayload(form: FichaDemandaApprovalFormState) {
  return {
    numMovRm: form.numMovRm.trim(),
    idMovRm: form.idMovRm.trim(),
    codigoPedido: form.codigoPedido.trim(),
    solicitanteId: form.solicitanteId,
    contratoId: form.contratoId,
    obra: form.obra.trim(),
    codFichaDemanda: form.codFichaDemanda.trim(),
    faturamentoEstimado: parseCurrencyToNumber(form.faturamentoEstimado),
    custoEstimado: parseCurrencyToNumber(form.custoEstimado),
    observacao: form.observacao.trim(),
    dataHora: form.dataHora,
    polo: form.polo,
    anexos: form.anexos,
  };
}

export function formatCurrencyDisplay(value: string | number | null | undefined): string {
  const n = typeof value === 'number' ? value : parseCurrencyToNumber(String(value ?? ''));
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
