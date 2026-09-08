import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  CircleDollarSign,
  Coins,
  Link2,
  Percent,
  Wallet
} from 'lucide-react';
import type { ControleNfsTabTotals, ControleNfsTotalsSummary } from './controleNfsTypes';

export type ControleNfsCardMetricKey =
  | 'valorBruto'
  | 'valorBrutoNaoPago'
  | 'valorLiquido'
  | 'valorRecebido'
  | 'totalImpostos'
  | 'contaVinculada';

export type ControleNfsCardMetricConfig = {
  key: ControleNfsCardMetricKey;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  cardClassName: string;
  iconWrapClassName: string;
  iconClassName: string;
  hintClassName: string;
  getTabValue: (tab: ControleNfsTabTotals) => number;
  getTotal: (summary: ControleNfsTotalsSummary) => number;
  getTabsWithData: (summary: ControleNfsTotalsSummary) => number;
};

export const CONTROLE_NFS_CARD_METRICS: ControleNfsCardMetricConfig[] = [
  {
    key: 'valorBruto',
    title: 'Valor bruto total',
    subtitle: 'Soma da coluna Valor Bruto',
    icon: Wallet,
    cardClassName:
      'border-red-200 bg-gradient-to-br from-red-50/80 to-white dark:border-red-900/40 dark:from-red-950/20 dark:to-gray-900',
    iconWrapClassName: 'bg-red-100 dark:bg-red-900/30',
    iconClassName: 'text-red-600 dark:text-red-400',
    hintClassName: 'text-red-600/90 dark:text-red-400/90',
    getTabValue: (tab) => tab.valorBruto,
    getTotal: (summary) => summary.valorBruto,
    getTabsWithData: (summary) => summary.tabsWithValorBruto
  },
  {
    key: 'valorBrutoNaoPago',
    title: 'Valor bruto não pago',
    subtitle: 'Status "Não pago" na coluna Valor Bruto',
    icon: AlertCircle,
    cardClassName:
      'border-orange-200 bg-gradient-to-br from-orange-50/80 to-white dark:border-orange-900/40 dark:from-orange-950/20 dark:to-gray-900',
    iconWrapClassName: 'bg-orange-100 dark:bg-orange-900/30',
    iconClassName: 'text-orange-600 dark:text-orange-400',
    hintClassName: 'text-orange-600/90 dark:text-orange-400/90',
    getTabValue: (tab) => tab.valorBrutoNaoPago,
    getTotal: (summary) => summary.valorBrutoNaoPago,
    getTabsWithData: (summary) => summary.tabsWithValorBrutoNaoPago
  },
  {
    key: 'valorLiquido',
    title: 'Valor líquido total',
    subtitle: 'Soma da coluna Líquido',
    icon: Coins,
    cardClassName:
      'border-blue-200 bg-gradient-to-br from-blue-50/80 to-white dark:border-blue-900/40 dark:from-blue-950/20 dark:to-gray-900',
    iconWrapClassName: 'bg-blue-100 dark:bg-blue-900/30',
    iconClassName: 'text-blue-600 dark:text-blue-400',
    hintClassName: 'text-blue-600/90 dark:text-blue-400/90',
    getTabValue: (tab) => tab.valorLiquido,
    getTotal: (summary) => summary.valorLiquido,
    getTabsWithData: (summary) => summary.tabsWithValorLiquido
  },
  {
    key: 'valorRecebido',
    title: 'Valor recebido total',
    subtitle: 'Soma da coluna Recebido',
    icon: CircleDollarSign,
    cardClassName:
      'border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white dark:border-emerald-900/40 dark:from-emerald-950/20 dark:to-gray-900',
    iconWrapClassName: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconClassName: 'text-emerald-600 dark:text-emerald-400',
    hintClassName: 'text-emerald-600/90 dark:text-emerald-400/90',
    getTabValue: (tab) => tab.valorRecebido,
    getTotal: (summary) => summary.valorRecebido,
    getTabsWithData: (summary) => summary.tabsWithValorRecebido
  },
  {
    key: 'totalImpostos',
    title: 'Total de impostos',
    subtitle: 'IRRF, ISS, INSS, CSLL, PIS e COFINS',
    icon: Percent,
    cardClassName:
      'border-amber-200 bg-gradient-to-br from-amber-50/80 to-white dark:border-amber-900/40 dark:from-amber-950/20 dark:to-gray-900',
    iconWrapClassName: 'bg-amber-100 dark:bg-amber-900/30',
    iconClassName: 'text-amber-600 dark:text-amber-400',
    hintClassName: 'text-amber-600/90 dark:text-amber-400/90',
    getTabValue: (tab) => tab.totalImpostos,
    getTotal: (summary) => summary.totalImpostos,
    getTabsWithData: (summary) => summary.tabsWithImpostos
  },
  {
    key: 'contaVinculada',
    title: 'Conta vinculada total',
    subtitle: 'Soma da coluna Conta Vinculada',
    icon: Link2,
    cardClassName:
      'border-violet-200 bg-gradient-to-br from-violet-50/80 to-white dark:border-violet-900/40 dark:from-violet-950/20 dark:to-gray-900',
    iconWrapClassName: 'bg-violet-100 dark:bg-violet-900/30',
    iconClassName: 'text-violet-600 dark:text-violet-400',
    hintClassName: 'text-violet-600/90 dark:text-violet-400/90',
    getTabValue: (tab) => tab.contaVinculada,
    getTotal: (summary) => summary.contaVinculada,
    getTabsWithData: (summary) => summary.tabsWithContaVinculada
  }
];

export function findControleNfsCardMetric(
  key: ControleNfsCardMetricKey
): ControleNfsCardMetricConfig {
  const metric = CONTROLE_NFS_CARD_METRICS.find((item) => item.key === key);
  if (!metric) {
    throw new Error(`Métrica de card não encontrada: ${key}`);
  }
  return metric;
}
