/**
 * Cores apenas no texto para Status Orçamento e Status Execução.
 * Fundo transparente (padrão da tabela / do site) — leitura em claro e escuro.
 */

const EMPTY = 'text-gray-500 dark:text-gray-400';

const BUDGET_STATUS_CLASSES: Record<string, string> = {
  'Analise Fiscal': 'text-sky-700 dark:text-sky-300',
  Engenharia: 'text-blue-700 dark:text-blue-300',
  'Equipe de Orçamento': 'text-amber-800 dark:text-amber-300',
  Aprovado: 'text-green-700 dark:text-green-400',
  Faturado: 'text-emerald-700 dark:text-emerald-400',
  'Stand By': 'text-yellow-800 dark:text-yellow-300'
};

const EXECUTION_STATUS_CLASSES: Record<string, string> = {
  CONCLUÍDA: 'text-blue-700 dark:text-blue-300',
  EXECUÇÃO: 'text-sky-700 dark:text-sky-300',
  FINALIZADA: 'text-green-700 dark:text-green-400',
  GARANTIA: 'text-cyan-700 dark:text-cyan-300',
  'GARANTIA RESOLVIDA': 'text-green-700 dark:text-green-400',
  'PD. EXECUÇÃO': 'text-rose-700 dark:text-rose-300',
  'PD. EMISSÃO': 'text-violet-700 dark:text-violet-300',
  PENDÊNCIA: 'text-orange-700 dark:text-orange-300',
  STANDBY: 'text-pink-700 dark:text-pink-300',
  'NÃO SE ENQUADRA NA GARANTIA': 'text-purple-700 dark:text-purple-300'
};

const UNKNOWN = 'text-slate-700 dark:text-slate-300';

export function budgetStatusPillClass(status: string | null | undefined): string {
  const s = (status || '').trim();
  if (!s) return EMPTY;
  return BUDGET_STATUS_CLASSES[s] ?? UNKNOWN;
}

export function executionStatusPillClass(status: string | null | undefined): string {
  const s = (status || '').trim();
  if (!s) return EMPTY;
  return EXECUTION_STATUS_CLASSES[s] ?? UNKNOWN;
}

/** Select alinhado à tabela: fundo transparente, cor do texto pela função de status. */
export const pleitoStatusSelectBase =
  'min-w-0 w-full rounded-md px-2 py-1.5 text-sm font-semibold bg-transparent border border-gray-200 dark:border-gray-600 shadow-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:focus:ring-offset-gray-900 disabled:opacity-60 cursor-pointer';

/** Texto somente leitura nas tabelas. */
export function pleitoStatusReadOnlySpanClass(
  kind: 'budget' | 'execution',
  status: string | null | undefined
): string {
  const text = kind === 'budget' ? budgetStatusPillClass(status) : executionStatusPillClass(status);
  return `inline-flex max-w-full items-center truncate text-sm font-semibold ${text}`;
}
