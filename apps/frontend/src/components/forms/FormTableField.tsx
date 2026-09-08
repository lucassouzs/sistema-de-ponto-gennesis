'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { FormCurrencyField } from '@/components/forms/FormCurrencyField';
import { FormPercentField } from '@/components/forms/FormPercentField';
import { Button } from '@/components/ui/Button';
import type { FormTableColumn } from '@/components/forms/formStructureTypes';
import {
  emptyTableRow,
  parseTableAnswer,
  serializeTableAnswer,
  tableColumnCellClass,
  tableColumnHeaderClass,
  type FormTableAnswerData,
} from '@/lib/formTable';

type Props = {
  columns: FormTableColumn[];
  value: unknown;
  onChange: (value: string) => void;
  readOnly?: boolean;
};

function TableCellInput({
  column,
  value,
  onChange,
  readOnly,
}: {
  column: FormTableColumn;
  value: string | number | null;
  onChange: (value: string | number | null) => void;
  readOnly?: boolean;
}) {
  const align = tableColumnCellClass(column);
  const inputCls =
    'w-full border-0 bg-transparent p-0 text-sm outline-none focus:ring-0 dark:text-gray-100';

  if (column.type === 'valor') {
    return (
      <div className={align}>
        <FormCurrencyField
          value={typeof value === 'number' ? value : null}
          onChange={onChange}
          readOnly={readOnly}
          className={`${inputCls} h-9 px-0 shadow-none ring-0`}
        />
      </div>
    );
  }

  if (column.type === 'percent') {
    return (
      <div className={align}>
        <FormPercentField
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          className={`${inputCls} h-9 px-0 shadow-none ring-0`}
        />
      </div>
    );
  }

  if (column.type === 'number') {
    return (
      <input
        type="number"
        value={value === null || value === undefined ? '' : String(value)}
        readOnly={readOnly}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={`${inputCls} ${align} ${readOnly ? 'cursor-not-allowed text-gray-500' : ''}`}
      />
    );
  }

  return (
    <input
      type="text"
      value={value === null || value === undefined ? '' : String(value)}
      readOnly={readOnly}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} ${align} ${readOnly ? 'cursor-not-allowed text-gray-500' : ''}`}
    />
  );
}

export function FormTableField({ columns, value, onChange, readOnly = false }: Props) {
  const data = parseTableAnswer(value, columns);

  const commit = (next: FormTableAnswerData) => {
    onChange(serializeTableAnswer(next));
  };

  const updateCell = (
    rowId: string,
    columnId: string,
    cellValue: string | number | null,
  ) => {
    commit({
      rows: data.rows.map((row) =>
        row.id === rowId
          ? { ...row, cells: { ...row.cells, [columnId]: cellValue } }
          : row,
      ),
    });
  };

  const addRow = () => {
    commit({
      rows: [...data.rows, emptyTableRow(columns.map((c) => c.id))],
    });
  };

  const removeRow = (rowId: string) => {
    if (data.rows.length <= 1) return;
    commit({ rows: data.rows.filter((row) => row.id !== rowId) });
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
      <table className="w-full min-w-[320px] border-collapse">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900/60">
            {columns.map((col) => (
              <th
                key={col.id}
                className={`border-b border-gray-200 px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-200 ${tableColumnHeaderClass(col)}`}
              >
                {col.title}
              </th>
            ))}
            {!readOnly ? (
              <th className="w-10 border-b border-gray-200 dark:border-gray-700" aria-hidden />
            ) : null}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.id} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
              {columns.map((col) => (
                <td key={`${row.id}-${col.id}`} className="bg-white px-3 py-2 dark:bg-gray-800">
                  <TableCellInput
                    column={col}
                    value={row.cells[col.id] ?? null}
                    readOnly={readOnly}
                    onChange={(cellValue) => updateCell(row.id, col.id, cellValue)}
                  />
                </td>
              ))}
              {!readOnly ? (
                <td className="w-10 bg-white px-1 py-2 text-center dark:bg-gray-800">
                  <button
                    type="button"
                    title="Remover linha"
                    disabled={data.rows.length <= 1}
                    onClick={() => removeRow(row.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      {!readOnly ? (
        <div className="border-t border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={addRow}
          >
            Adicionar linha
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function FormTableFieldPreview({
  columns,
  onColumnsChange,
}: {
  columns: FormTableColumn[];
  onColumnsChange?: (columns: FormTableColumn[]) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600">
      <table className="w-full min-w-[320px] border-collapse">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900/60">
            {columns.map((col) => (
              <th
                key={col.id}
                className={`border-b border-gray-200 px-3 py-2 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-200 ${tableColumnHeaderClass(col)}`}
              >
                <input
                  type="text"
                  value={col.title}
                  onChange={(e) => {
                    if (!onColumnsChange) return;
                    onColumnsChange(
                      columns.map((c) =>
                        c.id === col.id ? { ...c, title: e.target.value } : c,
                      ),
                    );
                  }}
                  className={`w-full border-0 bg-transparent p-0 text-xs outline-none focus:ring-0 dark:text-gray-200 ${
                    col.bold ? 'font-bold' : 'font-medium'
                  } ${tableColumnCellClass(col)}`}
                  placeholder="Título da coluna"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {columns.map((col) => (
              <td key={`preview-${col.id}`} className="bg-white px-3 py-4 dark:bg-gray-800" />
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
