'use client';

import React, { useRef, useState } from 'react';
import { CheckCircle, Download, FileSpreadsheet, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';

export type SpreadsheetImportColumn = {
  name: string;
  required?: boolean;
  hint?: string;
};

type SkippedRow = { line: number; reasons: string[]; preview: string };
type BackendError = { index: number; message: string };

type ParseReport = {
  items: Record<string, unknown>[];
  skipped: SkippedRow[];
  totalRows: number;
};

type SpreadsheetImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  templateHint: string;
  columns: ReadonlyArray<SpreadsheetImportColumn>;
  bodyKey: string;
  importPath: string;
  downloadTemplate: () => void;
  parseFile: (file: File) => Promise<ParseReport>;
  onImported: () => void;
  batchSize?: number;
  /** Timeout por lote (ms). Padrão: 120s — importações com normalização externa precisam de mais tempo. */
  requestTimeoutMs?: number;
};

function resolveImportErrorMessage(err: unknown): string {
  const ax = err as {
    code?: string;
    message?: string;
    response?: { status?: number; data?: { message?: string; error?: string } };
  };
  if (ax.code === 'ECONNABORTED' || /timeout/i.test(String(ax.message || ''))) {
    return 'A importação demorou demais e foi interrompida. Tente novamente — a planilha será enviada em lotes menores.';
  }
  if (!ax.response) {
    return 'Não foi possível conectar ao servidor. Confirme se o backend está rodando e tente de novo.';
  }
  const fromBody = ax.response.data?.message || ax.response.data?.error;
  if (fromBody) return fromBody;
  if (ax.response.status === 413) {
    return 'Arquivo/lote grande demais para o servidor. Tente importar em partes menores.';
  }
  return `Erro ao importar (HTTP ${ax.response.status}).`;
}

export function SpreadsheetImportModal({
  isOpen,
  onClose,
  title,
  templateHint,
  columns,
  bodyKey,
  importPath,
  downloadTemplate,
  parseFile,
  onImported,
  batchSize = 100,
  requestTimeoutMs = 120_000,
}: SpreadsheetImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = `import-file-${bodyKey}`;
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [skipped, setSkipped] = useState<SkippedRow[]>([]);
  const [backendErrors, setBackendErrors] = useState<BackendError[]>([]);
  const [progress, setProgress] = useState<{
    batch: number;
    totalBatches: number;
    processed: number;
    total: number;
    created: number;
    failed: number;
  } | null>(null);

  const reset = () => {
    setFileName('');
    setItems([]);
    setSkipped([]);
    setBackendErrors([]);
    setProgress(null);
    setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (isImporting) return;
    reset();
    onClose();
  };

  const applyParseReport = (report: ParseReport, name: string) => {
    setFileName(name);
    setItems(report.items);
    setSkipped(report.skipped);
    setBackendErrors([]);
    if (report.items.length === 0) {
      toast.error(
        report.skipped.length > 0
          ? 'Nenhum registro válido na planilha. Veja os avisos abaixo.'
          : 'Nenhum registro encontrado na planilha.'
      );
    } else {
      toast.success(`${report.items.length} registro(s) prontos para importar.`);
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    try {
      const report = await parseFile(file);
      applyParseReport(report, file.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao ler o arquivo.');
      reset();
    }
  };

  const handleImport = async () => {
    if (items.length === 0) {
      toast.error('Selecione uma planilha com registros válidos.');
      return;
    }
    setIsImporting(true);
    setBackendErrors([]);
    const totalBatches = Math.max(1, Math.ceil(items.length / batchSize));
    let created = 0;
    let failed = 0;
    const errors: BackendError[] = [];

    try {
      for (let batch = 0; batch < totalBatches; batch++) {
        const slice = items.slice(batch * batchSize, (batch + 1) * batchSize);
        setProgress({
          batch: batch + 1,
          totalBatches,
          processed: Math.min((batch + 1) * batchSize, items.length),
          total: items.length,
          created,
          failed,
        });
        const res = await api.post(importPath, { [bodyKey]: slice }, { timeout: requestTimeoutMs });
        const data = res.data?.data as
          | { created?: number; failed?: number; errors?: BackendError[] }
          | undefined;
        created += Number(data?.created || 0);
        failed += Number(data?.failed || 0);
        const batchErrors = (data?.errors || []).map((e) => ({
          index: e.index + batch * batchSize,
          message: e.message,
        }));
        errors.push(...batchErrors);
        setProgress({
          batch: batch + 1,
          totalBatches,
          processed: Math.min((batch + 1) * batchSize, items.length),
          total: items.length,
          created,
          failed,
        });
      }
      setBackendErrors(errors);
      onImported();
      toast.success(`Importação concluída: ${created} criado(s), ${failed} erro(s).`);
      if (failed === 0) {
        reset();
        onClose();
      }
    } catch (err: unknown) {
      toast.error(resolveImportErrorMessage(err));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="xl">
      <div className="space-y-6">
        {isImporting && progress ? (
          <div className="space-y-5 py-8">
            <p className="text-center text-sm font-medium text-gray-800 dark:text-gray-200">
              Importando…
            </p>
            <div className="w-full space-y-2">
              <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                <span>
                  Lote {progress.batch} de {progress.totalBatches}
                </span>
                <span className="font-semibold tabular-nums">
                  {progress.processed} / {progress.total}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-red-600 transition-all duration-150"
                  style={{
                    width: `${Math.min(100, (progress.processed / progress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 text-xs text-gray-600 dark:text-gray-400">
              <span>{progress.created} criado(s)</span>
              {progress.failed > 0 ? (
                <span className="text-amber-700 dark:text-amber-400">{progress.failed} com erro</span>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Modelo de planilha
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{templateHint}</p>
              </div>
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                <Download className="h-4 w-4" />
                Baixar modelo
              </button>
            </div>

            <div>
              <label className="mb-3 block text-sm font-semibold text-gray-900 dark:text-gray-100">
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-red-600 dark:text-red-400" />
                  Sua planilha
                </span>
              </label>
              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                accept=".xlsx,.xls,.csv,.json"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                className="sr-only"
              />
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-all ${
                  items.length > 0
                    ? 'border-green-500 bg-green-50/80 dark:border-green-600 dark:bg-green-950/25'
                    : isDragging
                      ? 'border-red-500 bg-red-50/80 dark:border-red-500 dark:bg-red-950/20'
                      : 'border-gray-300 bg-gray-50/50 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800/40'
                }`}
              >
                {items.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex justify-center">
                      <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/40">
                        <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fileName}</p>
                    <p className="text-sm text-green-700 dark:text-green-400">
                      {items.length} registro(s) prontos para importar
                    </p>
                    <button
                      type="button"
                      onClick={reset}
                      className="text-xs font-medium text-red-600 underline-offset-2 hover:underline dark:text-red-400"
                    >
                      Remover arquivo
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Upload className="mx-auto h-8 w-8 text-gray-400" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Arraste o arquivo aqui ou escolha no computador
                    </p>
                    <label
                      htmlFor={fileInputId}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      Escolher arquivo
                    </label>
                    <p className="text-xs text-gray-500">.xlsx, .xls, .csv ou .json</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Colunas da planilha
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  O código é gerado automaticamente.
                </p>
              </div>
              <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
                {columns.map((col) => (
                  <li
                    key={col.name}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"
                  >
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {col.name}
                      {col.required ? (
                        <span className="ml-1 text-red-600 dark:text-red-400">*</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-gray-500">
                      {col.hint || (col.required ? 'Obrigatório' : 'Opcional')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {(skipped.length > 0 || backendErrors.length > 0) && (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                {skipped.map((item) => (
                  <p key={`skip-${item.line}`} className="text-xs text-amber-800 dark:text-amber-300">
                    Linha {item.line}: {item.reasons.join(' · ')}
                  </p>
                ))}
                {backendErrors.map((item) => (
                  <p key={`err-${item.index}`} className="text-xs text-red-700 dark:text-red-300">
                    Registro {item.index + 1}: {item.message}
                  </p>
                ))}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleClose}
                disabled={isImporting}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting || items.length === 0}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {items.length > 0 ? `Importar ${items.length} registro(s)` : 'Importar'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
