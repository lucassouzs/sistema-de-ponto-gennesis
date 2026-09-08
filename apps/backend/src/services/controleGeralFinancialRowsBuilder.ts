import { tabHasLotBreakdown, getLotBreakdownForTab } from '../lib/controleGeralLotBreakdown';
import type { BaseGastosSummary } from './BaseGastosSheetsService';
import type { ControleNfsLotFaturamento, ControleNfsTotalsSummary } from './ControleNfsSheetsService';
import { CONTROLE_NFS_SHEET_TABS } from './ControleNfsSheetsService';

export type ControleGeralFinancialRow = {
  rowKey: string;
  tabKey: string;
  label: string;
  lotKey?: string;
  isLotRow: boolean;
  gastosAcumulado: number;
  gastosAnual: number;
  faturamentoAcumulado: number;
  faturamentoAnual: number;
  resultadoAcumulado: number;
  resultadoAnual: number;
};

export function buildControleGeralFinancialRows(
  nfsSummary: ControleNfsTotalsSummary,
  gastosSummary: BaseGastosSummary,
  nfsLotFaturamento: ControleNfsLotFaturamento[],
  filterYear?: number
): ControleGeralFinancialRow[] {
  const yearValid = filterYear != null && Number.isFinite(filterYear);
  const nfsByTab = new Map(nfsSummary.byTab.map((tab) => [tab.tabKey, tab.valorBruto]));
  const gastosByTab = new Map(gastosSummary.byTab.map((tab) => [tab.tabKey, tab]));
  const gastosByLot = new Map(
    gastosSummary.byLot.map((lot) => [`${lot.tabKey}:${lot.lotKey}`, lot])
  );
  const faturamentoByLot = new Map(
    nfsLotFaturamento.map((lot) => [`${lot.tabKey}:${lot.lotKey}`, lot.valorBruto])
  );

  const rows: ControleGeralFinancialRow[] = [];

  for (const tab of CONTROLE_NFS_SHEET_TABS) {
    if (tabHasLotBreakdown(tab.key)) {
      const lotConfig = getLotBreakdownForTab(tab.key);
      const configuredLots = lotConfig?.lots ?? [];

      for (const lot of configuredLots) {
        const mapKey = `${tab.key}:${lot.lotKey}`;
        const gastos = gastosByLot.get(mapKey);
        const nfsLot = nfsLotFaturamento.find(
          (item) => item.tabKey === tab.key && item.lotKey === lot.lotKey
        );

        const gastosAcumulado = gastos?.gastosAcumulado ?? 0;
        const gastosAnual = yearValid ? (gastos?.gastosAnual ?? 0) : gastosAcumulado;
        const faturamento = faturamentoByLot.get(mapKey) ?? nfsLot?.valorBruto ?? 0;
        const lotLabel = lot.label ?? nfsLot?.label ?? lot.lotKey;

        rows.push({
          rowKey: mapKey,
          tabKey: tab.key,
          label: `${tab.label} — ${lotLabel}`,
          lotKey: lot.lotKey,
          isLotRow: true,
          gastosAcumulado,
          gastosAnual,
          faturamentoAcumulado: faturamento,
          faturamentoAnual: faturamento,
          resultadoAcumulado: faturamento - gastosAcumulado,
          resultadoAnual: faturamento - gastosAnual
        });
      }
      continue;
    }

    const gastos = gastosByTab.get(tab.key);
    const gastosAcumulado = gastos?.gastosAcumulado ?? 0;
    const gastosAnual = yearValid ? (gastos?.gastosAnual ?? 0) : gastosAcumulado;
    const faturamento = nfsByTab.get(tab.key) ?? 0;

    rows.push({
      rowKey: tab.key,
      tabKey: tab.key,
      label: tab.label,
      isLotRow: false,
      gastosAcumulado,
      gastosAnual,
      faturamentoAcumulado: faturamento,
      faturamentoAnual: faturamento,
      resultadoAcumulado: faturamento - gastosAcumulado,
      resultadoAnual: faturamento - gastosAnual
    });
  }

  return rows;
}
