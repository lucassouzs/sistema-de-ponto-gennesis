/** Utilitários compartilhados para formulário de Ordem de Serviço */

export const RVI_RVF_OPCOES = ['FEITO', 'PENDENTE'];

export const STATUS_EXECUCAO_OPCOES = [
  'CONCLUÍDA',
  'EXECUÇÃO',
  'FINALIZADA',
  'GARANTIA',
  'GARANTIA RESOLVIDA',
  'PD. EXECUÇÃO',
  'PENDÊNCIA',
  'STANDBY'
];

export const STATUS_ORCAMENTO_OPCOES = [
  'Analise Fiscal',
  'Engenharia',
  'Equipe de Orçamento',
  'Aprovado',
  'Faturado',
  'Stand By'
];

/** Somente estes status entram na soma "Valor orçado" (controle geral e painel do contrato). */
export function isBudgetStatusInValorOrcadoSum(status: string | null | undefined): boolean {
  const s = (status || '').trim();
  return s === 'Aprovado' || s === 'Faturado';
}

export const OUTRO_STATUS = '__OUTRO__';

export const MESES = [
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' }
];

export function getCurrentMonthYear() {
  const d = new Date();
  return {
    creationMonth: String(d.getMonth() + 1).padStart(2, '0'),
    creationYear: String(d.getFullYear())
  };
}

export function parseBudgetToNumber(v: string | null): number {
  if (!v) return 0;
  const s = String(v).replace(/[R$\s]/g, '').trim();
  if (!s) return 0;
  if (s.includes(',')) {
    const cleaned = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return isNaN(parseFloat(s)) ? 0 : parseFloat(s);
}

export function formatBudgetForInput(v: string | null): string {
  const n = parseBudgetToNumber(v);
  return n === 0 ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function getLatestBudgetFromForm(f: Record<string, string>): string {
  for (let i = 4; i >= 1; i--) {
    const n = parseBudgetToNumber(f[`budgetAmount${i}`]);
    if (n !== 0) return formatBudgetForInput(String(n));
  }
  return '';
}

const toPayloadNum = (v: string) => {
  const n = parseBudgetToNumber(v);
  return n !== 0 ? n : null;
};
const toPayloadStr = (v: string) => (v?.trim() || null);

export function emptyForm(): Record<string, string> {
  const { creationMonth, creationYear } = getCurrentMonthYear();
  return {
    creationMonth,
    creationYear,
    startDate: '',
    endDate: '',
    budgetStatus: '',
    budgetStatusCustom: '',
    folderNumber: '',
    lot: '',
    divSe: '',
    location: '',
    unit: '',
    serviceDescription: '',
    executionStatus: '',
    billingStatus: '',
    accumulatedBilled: '',
    billingRequest: '',
    budgetAmount1: '',
    budgetAmount2: '',
    budgetAmount3: '',
    budgetAmount4: '',
    pv: '',
    ipi: '',
    reportsBilling: '',
    engineer: '',
    supervisor: ''
  };
}

export interface PleitoFormData {
  id?: string;
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
}

export function pleitoToForm(p: PleitoFormData): Record<string, string> {
  const m = p.creationMonth;
  const num = m ? parseInt(String(m).replace(/\D/g, ''), 10) : NaN;
  const monthVal = num >= 1 && num <= 12 ? String(num).padStart(2, '0') : (m || '');
  return {
    creationMonth: monthVal,
    creationYear: p.creationYear != null ? String(p.creationYear) : '',
    startDate: p.startDate ? p.startDate.split('T')[0] : '',
    endDate: p.endDate ? p.endDate.split('T')[0] : '',
    budgetStatus: STATUS_ORCAMENTO_OPCOES.includes(p.budgetStatus || '') ? (p.budgetStatus || '') : (p.budgetStatus ? OUTRO_STATUS : ''),
    budgetStatusCustom: STATUS_ORCAMENTO_OPCOES.includes(p.budgetStatus || '') ? '' : (p.budgetStatus || ''),
    folderNumber: p.folderNumber || '',
    lot: p.lot || '',
    divSe: p.divSe || '',
    location: p.location || '',
    unit: p.unit || '',
    serviceDescription: p.serviceDescription || '',
    executionStatus: p.executionStatus || '',
    billingStatus: (p.billingStatus || '').toString().replace('%', '').trim(),
    accumulatedBilled: formatBudgetForInput(p.accumulatedBilled != null ? String(p.accumulatedBilled) : null),
    billingRequest: formatBudgetForInput(p.billingRequest != null ? String(p.billingRequest) : null),
    budgetAmount1: formatBudgetForInput(p.budgetAmount1 != null ? String(p.budgetAmount1) : null),
    budgetAmount2: formatBudgetForInput(p.budgetAmount2 != null ? String(p.budgetAmount2) : null),
    budgetAmount3: formatBudgetForInput(p.budgetAmount3 != null ? String(p.budgetAmount3) : null),
    budgetAmount4: formatBudgetForInput(p.budgetAmount4 != null ? String(p.budgetAmount4) : null),
    pv: p.pv || '',
    ipi: p.ipi || '',
    reportsBilling: p.reportsBilling || '',
    engineer: p.engineer || '',
    supervisor: p.supervisor || ''
  };
}

export function formToPayload(f: Record<string, string>, contractId?: string | null) {
  const nBudget = parseBudgetToNumber(getLatestBudgetFromForm(f));
  return {
    creationMonth: toPayloadStr(f.creationMonth),
    creationYear: toPayloadStr(f.creationYear),
    startDate: toPayloadStr(f.startDate),
    endDate: toPayloadStr(f.endDate),
    budgetStatus: (f.budgetStatus === OUTRO_STATUS ? f.budgetStatusCustom?.trim() : f.budgetStatus?.trim()) || null,
    folderNumber: toPayloadStr(f.folderNumber),
    lot: toPayloadStr(f.lot),
    divSe: toPayloadStr(f.divSe),
    location: toPayloadStr(f.location),
    unit: toPayloadStr(f.unit),
    serviceDescription: f.serviceDescription.trim(),
    budget: nBudget !== 0 ? nBudget.toFixed(2) : null,
    executionStatus: toPayloadStr(f.executionStatus),
    billingStatus: f.billingStatus ? String(f.billingStatus).replace(',', '.').trim() : null,
    updatedContractId: contractId || null,
    accumulatedBilled: toPayloadNum(f.accumulatedBilled)?.toFixed(2) ?? null,
    billingRequest: toPayloadNum(f.billingRequest)?.toFixed(2) ?? null,
    invoiceNumber: null,
    estimator: null,
    budgetAmount1: toPayloadNum(f.budgetAmount1),
    budgetAmount2: toPayloadNum(f.budgetAmount2),
    budgetAmount3: toPayloadNum(f.budgetAmount3),
    budgetAmount4: toPayloadNum(f.budgetAmount4),
    pv: toPayloadStr(f.pv),
    ipi: toPayloadStr(f.ipi),
    reportsBilling: toPayloadStr(f.reportsBilling),
    engineer: toPayloadStr(f.engineer),
    supervisor: toPayloadStr(f.supervisor)
  };
}

export const currencyChange = (form: Record<string, string>, setForm: (f: Record<string, string>) => void, key: string) =>
  (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '');
    setForm({ ...form, [key]: v ? (Number(v) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '' });
  };
