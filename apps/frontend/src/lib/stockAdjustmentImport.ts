import * as XLSX from 'xlsx';
import type { SpreadsheetImportColumn } from '@/components/ui/SpreadsheetImportModal';

export const STOCK_ADJUSTMENT_IMPORT_COLUMNS: ReadonlyArray<SpreadsheetImportColumn> = [
  { name: 'Material', required: true, hint: 'Nome do material cadastrado' },
  { name: 'Movimento', required: true, hint: 'Entrada ou Saída' },
  { name: 'Quantidade', required: true, hint: 'Número positivo' },
  { name: 'Contrato', required: false, hint: 'Nome do contrato / centro de custo' },
  { name: 'Observações', required: false },
];

export type StockAdjustmentImportItem = {
  material: string;
  type: 'IN' | 'OUT';
  quantity: number;
  contrato: string;
  notes: string;
};

function normalizeHeaderKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function pickRowValue(row: Record<string, unknown>, ...keys: string[]): string {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normalizeHeaderKey(String(k)), v]),
  );
  for (const key of keys) {
    const val = normalized[normalizeHeaderKey(key)];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function parseMovementType(raw: string): 'IN' | 'OUT' | null {
  const n = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (['entrada', 'in', 'e', '+'].includes(n)) return 'IN';
  if (['saida', 'out', 's', '-'].includes(n)) return 'OUT';
  return null;
}

export function downloadStockAdjustmentImportTemplate(
  materialNames: string[],
): void {
  const headers = STOCK_ADJUSTMENT_IMPORT_COLUMNS.map((c) => c.name);
  const rows =
    materialNames.length > 0
      ? materialNames.map((name) => [name, '', '', '', ''])
      : [['', 'Entrada', '', '', '']];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 48 },
    { wch: 14 },
    { wch: 14 },
    { wch: 28 },
    { wch: 32 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Ajustes');
  XLSX.writeFile(wb, 'modelo-importacao-ajuste-estoque.xlsx');
}

export async function parseStockAdjustmentsFromFile(file: File): Promise<{
  items: StockAdjustmentImportItem[];
  skipped: { line: number; reasons: string[]; preview: string }[];
  totalRows: number;
}> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Planilha sem abas.');
  }
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
  });

  const items: StockAdjustmentImportItem[] = [];
  const skipped: { line: number; reasons: string[]; preview: string }[] = [];

  rows.forEach((row, index) => {
    const line = index + 2;
    const material = pickRowValue(row, 'Material', 'material', 'item', 'produto');
    const typeRaw = pickRowValue(row, 'Movimento', 'Tipo', 'type');
    const qtyRaw = pickRowValue(row, 'Quantidade', 'Qtd', 'quantity');
    const contrato = pickRowValue(row, 'Contrato', 'Centro de Custo', 'Centro de custo');
    const notes = pickRowValue(row, 'Observações', 'Observacoes', 'Notes');

    const emptyRow = !material && !typeRaw && !qtyRaw && !contrato;
    if (emptyRow) return;

    // Linha só com material (modelo pré-preenchido) — ignora até preencher movimento/qtd.
    if (material && !typeRaw && !qtyRaw) return;

    const reasons: string[] = [];
    if (!material) reasons.push('Material obrigatório');
    const type = parseMovementType(typeRaw);
    if (!type) reasons.push('Movimento deve ser Entrada ou Saída');
    const quantity = Number(String(qtyRaw).replace(',', '.'));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      reasons.push('Quantidade inválida');
    }

    if (reasons.length > 0) {
      skipped.push({
        line,
        reasons,
        preview: material || typeRaw || qtyRaw || `linha ${line}`,
      });
      return;
    }

    items.push({
      material,
      type: type as 'IN' | 'OUT',
      quantity,
      contrato,
      notes,
    });
  });

  return { items, skipped, totalRows: rows.length };
}
