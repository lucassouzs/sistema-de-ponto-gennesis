import { getLotBreakdownForTab, tabHasLotBreakdown } from '../lib/controleGeralLotBreakdown';
import type { BaseGastosSummary } from './BaseGastosSheetsService';
import { CONTROLE_NFS_SHEET_TABS } from './ControleNfsSheetsService';

export type GastosOperacionaisRow = {
  rowKey: string;
  tabKey: string;
  label: string;
  lotKey?: string;
  isLotRow: boolean;
  gastosAcumulado: number;
};

export function buildGastosOperacionaisRows(summary: BaseGastosSummary): GastosOperacionaisRow[] {
  const gastosByTab = new Map(summary.byTab.map((tab) => [tab.tabKey, tab.gastosAcumulado]));
  const gastosByLot = new Map(
    summary.byLot.map((lot) => [`${lot.tabKey}:${lot.lotKey}`, lot.gastosAcumulado])
  );

  const rows: GastosOperacionaisRow[] = [];

  for (const tab of CONTROLE_NFS_SHEET_TABS) {
    if (tabHasLotBreakdown(tab.key)) {
      const lotConfig = getLotBreakdownForTab(tab.key);
      for (const lot of lotConfig?.lots ?? []) {
        const mapKey = `${tab.key}:${lot.lotKey}`;
        rows.push({
          rowKey: mapKey,
          tabKey: tab.key,
          label: `${tab.label} — ${lot.label}`,
          lotKey: lot.lotKey,
          isLotRow: true,
          gastosAcumulado: gastosByLot.get(mapKey) ?? 0
        });
      }
      continue;
    }

    rows.push({
      rowKey: tab.key,
      tabKey: tab.key,
      label: tab.label,
      isLotRow: false,
      gastosAcumulado: gastosByTab.get(tab.key) ?? 0
    });
  }

  return rows;
}
