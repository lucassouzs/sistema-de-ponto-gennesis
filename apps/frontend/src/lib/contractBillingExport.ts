import * as XLSX from 'xlsx';

export type ContractBillingExportRow = {
  id: string;
  displayId: string;
  osSe: string;
  pleitoLabel: string;
  invoiceNumber: string;
  issueDateLabel: string;
  grossValue: number;
  netValue: number | null;
  status: string;
};

const HEADERS = [
  'ID',
  'OS / SE',
  'Pleito',
  'Nº NF',
  'Data emissão',
  'Valor bruto',
  'Valor líquido',
  'Status',
] as const;

export function exportContractBillingsToXlsx(
  rows: ContractBillingExportRow[],
  filenamePrefix = 'faturamento'
): void {
  const data = rows.map((r) => [
    r.displayId,
    r.osSe,
    r.pleitoLabel,
    r.invoiceNumber,
    r.issueDateLabel,
    Number(r.grossValue) || 0,
    r.netValue == null ? '' : Number(r.netValue) || 0,
    r.status,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([Array.from(HEADERS), ...data]);
  ws['!cols'] = [
    { wch: 8 },
    { wch: 16 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Faturamento');
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filenamePrefix}-${date}.xlsx`);
}
