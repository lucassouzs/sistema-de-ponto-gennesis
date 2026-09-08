import { formUid, type FormQuestion, type FormTableColumn } from '@/components/forms/formStructureTypes';

export type FormTableRow = {
  id: string;
  cells: Record<string, string | number | null>;
};

export type FormTableAnswerData = {
  rows: FormTableRow[];
};

export function defaultTableColumn(title: string): FormTableColumn {
  return {
    id: formUid(),
    title,
    align: 'left',
    bold: false,
    type: 'text',
  };
}

export function resolveTableColumns(question: Pick<FormQuestion, 'options' | 'tableColumns'>): FormTableColumn[] {
  if (question.tableColumns?.length) {
    return question.tableColumns.map((col) => ({
      align: 'left',
      bold: false,
      type: 'text',
      ...col,
      title: col.title?.trim() || 'Coluna',
    }));
  }

  const legacy = question.options?.length ? question.options : ['Coluna 1', 'Coluna 2'];
  return legacy.map((title) => defaultTableColumn(title));
}

export function syncTableColumnTitles(columns: FormTableColumn[]): string[] {
  return columns.map((col) => col.title.trim() || 'Coluna');
}

export function tableColumnHeaderClass(col: FormTableColumn): string {
  const align =
    col.align === 'center'
      ? 'text-center justify-center'
      : col.align === 'right'
        ? 'text-right justify-end'
        : 'text-left justify-start';
  const weight = col.bold ? 'font-bold' : 'font-medium';
  return `${align} ${weight}`;
}

export function tableColumnCellClass(col: FormTableColumn): string {
  if (col.align === 'center') return 'text-center';
  if (col.align === 'right') return 'text-right';
  return 'text-left';
}

export function emptyTableAnswer(columnCount = 2): FormTableAnswerData {
  const cols = Array.from({ length: Math.max(columnCount, 1) }, (_, i) => `col-${i}`);
  return {
    rows: [emptyTableRow(cols)],
  };
}

export function emptyTableRow(columnIds: string[]): FormTableRow {
  const cells: Record<string, string | number | null> = {};
  for (const id of columnIds) cells[id] = null;
  return { id: formUid(), cells };
}

export function parseTableAnswer(
  value: unknown,
  columns: FormTableColumn[],
): FormTableAnswerData {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const data = value as FormTableAnswerData;
    if (Array.isArray(data.rows)) {
      return normalizeTableAnswer(data, columns);
    }
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as FormTableAnswerData;
      if (parsed?.rows) return normalizeTableAnswer(parsed, columns);
    } catch {
      // formato legado em texto livre
    }
  }

  return {
    rows: [emptyTableRow(columns.map((c) => c.id))],
  };
}

function normalizeTableAnswer(
  data: FormTableAnswerData,
  columns: FormTableColumn[],
): FormTableAnswerData {
  const columnIds = columns.map((c) => c.id);
  const rows = data.rows.length
    ? data.rows.map((row) => ({
        id: row.id || formUid(),
        cells: Object.fromEntries(
          columnIds.map((colId) => [colId, row.cells?.[colId] ?? null]),
        ),
      }))
    : [emptyTableRow(columnIds)];

  return { rows };
}

export function serializeTableAnswer(data: FormTableAnswerData): string {
  return JSON.stringify(data);
}

export function isTableCellEmpty(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return !Number.isFinite(value);
  return String(value).trim() === '';
}

export function isTableAnswerEmpty(
  value: unknown,
  columns: FormTableColumn[],
): boolean {
  const data = parseTableAnswer(value, columns);
  if (!data.rows.length) return true;
  return data.rows.every((row) =>
    columns.every((col) => isTableCellEmpty(row.cells[col.id])),
  );
}

export function tableRowHasContent(
  row: FormTableRow,
  columns: FormTableColumn[],
): boolean {
  return columns.some((col) => !isTableCellEmpty(row.cells[col.id]));
}
