export type OsTab =
  | 'orcamento'
  | 'aprovadas'
  | 'execucao'
  | 'pleito'
  | 'faturamento'
  | 'concluidas'
  | 'standby';

export type OsTabCounts = Record<OsTab, number>;

export interface OsPleitoListItem {
  id: string;
  updatedContract?: { id: string; name: string; number: string } | null;
  creationMonth: string | null;
  creationYear: number | null;
  startDate: string | null;
  endDate: string | null;
  budgetStatus: string | null;
  folderNumber: string | null;
  lot: string | null;
  divSe: string | null;
  location: string | null;
  unit: string | null;
  serviceDescription: string;
  budget: string | null;
  executionStatus: string | null;
  billingStatus: string | null;
  accumulatedBilled: number | null;
  billingRequest: number | null;
  budgetAmount1: number | null;
  budgetAmount2: number | null;
  budgetAmount3: number | null;
  budgetAmount4: number | null;
  pv: string | null;
  ipi: string | null;
  reportsBilling: string | null;
  engineer: string | null;
  supervisor: string | null;
  updatedContractId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
