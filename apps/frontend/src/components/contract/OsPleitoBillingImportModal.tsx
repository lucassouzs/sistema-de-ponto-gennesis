'use client';

import React, { useRef, useState } from 'react';
import { CheckCircle, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import {
  buildGerarPleitoPayload,
  downloadOsPleitoBillingTemplate,
  normalizeOsKey,
  osImportRowToPayload,
  parseOsPleitoBillingWorkbook,
  type OsImportParseResult,
  type OsImportSkipped,
} from '@/lib/osPleitoBillingImport';

type ExistingPleito = {
  id: string;
  divSe?: string | null;
  serviceOrderId?: string | null;
  serviceDescription: string;
  startDate?: string | null;
  endDate?: string | null;
  budgetStatus?: string | null;
  folderNumber?: string | null;
  lot?: string | null;
  location?: string | null;
  unit?: string | null;
  budget?: string | null;
  executionStatus?: string | null;
  billingRequest?: number | null;
  budgetAmount1?: number | null;
  budgetAmount2?: number | null;
  budgetAmount3?: number | null;
  budgetAmount4?: number | null;
  pv?: string | null;
  ipi?: string | null;
  engineer?: string | null;
  supervisor?: string | null;
  reportsBilling?: string | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  contractId: string;
  existingPleitos: ExistingPleito[];
  onImported: () => void;
};

type CreatedOs = ExistingPleito & { id: string };

function errMessage(err: unknown): string {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message || ax.message || 'Erro na importação';
}

export function OsPleitoBillingImportModal({
  isOpen,
  onClose,
  contractId,
  existingPleitos,
  onImported,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<OsImportParseResult | null>(null);
  const [skipped, setSkipped] = useState<OsImportSkipped[]>([]);
  const [progress, setProgress] = useState<string | null>(null);

  const reset = () => {
    setFileName('');
    setParsed(null);
    setSkipped([]);
    setProgress(null);
    setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (isImporting) return;
    reset();
    onClose();
  };

  const applyFile = async (file: File) => {
    try {
      const report = await parseOsPleitoBillingWorkbook(file);
      setFileName(file.name);
      setParsed(report);
      setSkipped(report.skipped);
      const total =
        report.osRows.length + report.pleitoRows.length + report.faturamentoRows.length;
      if (total === 0) {
        toast.error(
          report.skipped.length > 0
            ? 'Nenhuma linha válida. Veja os avisos abaixo.'
            : 'Planilha vazia ou sem abas OS / Pleito / Faturamento.'
        );
      }
    } catch {
      toast.error('Não foi possível ler a planilha.');
      reset();
    }
  };

  const runImport = async () => {
    if (!parsed) return;
    const { osRows, pleitoRows, faturamentoRows } = parsed;
    if (osRows.length + pleitoRows.length + faturamentoRows.length === 0) {
      toast.error('Nada para importar.');
      return;
    }

    setIsImporting(true);
    let createdOs = 0;
    let createdPleitos = 0;
    let createdBillings = 0;
    const failures: string[] = [];

    const osByKey = new Map<string, CreatedOs>();
    for (const p of existingPleitos) {
      const key = normalizeOsKey(p.divSe);
      if (!key) continue;
      // Preferência: OS “fonte” (sem marcador histórico) sobrescreve se já houver
      const prev = osByKey.get(key);
      const isHist = (p.reportsBilling || '').includes('__PLEITO_HISTORICO__');
      if (!prev || (prev.reportsBilling || '').includes('__PLEITO_HISTORICO__') || !isHist) {
        if (!isHist) osByKey.set(key, p as CreatedOs);
        else if (!prev) osByKey.set(key, p as CreatedOs);
      }
    }

    const historicoByKey = new Map<string, CreatedOs>();

    try {
      for (const row of osRows) {
        setProgress(`Criando OS ${row.divSe}…`);
        try {
          const payload = osImportRowToPayload(row, contractId);
          const res = await api.post(`/contracts/${contractId}/pleitos`, payload);
          const created = (res.data?.data || res.data) as CreatedOs;
          if (created?.id) {
            osByKey.set(normalizeOsKey(row.divSe), {
              ...created,
              divSe: created.divSe || payload.divSe,
              serviceDescription: created.serviceDescription || row.serviceDescription,
            });
            createdOs += 1;
          }
        } catch (err) {
          failures.push(`OS linha ${row.line} (${row.divSe}): ${errMessage(err)}`);
        }
      }

      const resolveSource = (divSe: string): CreatedOs | undefined => {
        return osByKey.get(normalizeOsKey(divSe));
      };

      for (const row of pleitoRows) {
        setProgress(`Gerando pleito ${row.divSe}…`);
        const source = resolveSource(row.divSe);
        if (!source?.id) {
          failures.push(`Pleito linha ${row.line} (${row.divSe}): OS não encontrada no contrato/planilha`);
          continue;
        }
        try {
          const payload = buildGerarPleitoPayload(source, row.billingRequest);
          const res = await api.post(`/contracts/${contractId}/pleitos`, payload);
          const created = (res.data?.data || res.data) as CreatedOs;
          if (created?.id) {
            historicoByKey.set(normalizeOsKey(row.divSe), created);
            createdPleitos += 1;
          }
        } catch (err) {
          failures.push(`Pleito linha ${row.line} (${row.divSe}): ${errMessage(err)}`);
        }
      }

      for (const row of faturamentoRows) {
        setProgress(`Faturando ${row.divSe}…`);
        const key = normalizeOsKey(row.divSe);
        const pleito =
          historicoByKey.get(key) ||
          osByKey.get(key) ||
          existingPleitos.find((p) => normalizeOsKey(p.divSe) === key);
        if (!pleito?.id) {
          failures.push(
            `Faturamento linha ${row.line} (${row.divSe}): OS/pleito não encontrado — importe a aba OS antes`
          );
          continue;
        }
        try {
          await api.post(`/contracts/${contractId}/billings`, {
            issueDate: row.issueDate,
            invoiceNumber: row.invoiceNumber,
            serviceOrder: (pleito.divSe || row.divSe).trim(),
            pleitoId: pleito.id,
            grossValue: row.grossValue,
            netValue: row.netValue,
          });
          createdBillings += 1;
        } catch (err) {
          failures.push(`Faturamento linha ${row.line} (${row.divSe}): ${errMessage(err)}`);
        }
      }

      onImported();

      const parts = [
        createdOs ? `${createdOs} OS` : null,
        createdPleitos ? `${createdPleitos} pleito(s)` : null,
        createdBillings ? `${createdBillings} faturamento(s)` : null,
      ].filter(Boolean);

      if (parts.length) {
        toast.success(`Importado: ${parts.join(', ')}.`);
      }
      if (failures.length) {
        toast.error(`${failures.length} linha(s) com erro. Veja o detalhe no modal.`);
        setSkipped((prev) => [
          ...prev,
          ...failures.map((msg, i) => ({
            sheet: 'Erro',
            line: i + 1,
            reasons: [msg],
            preview: '',
          })),
        ]);
      } else if (parts.length) {
        handleClose();
      } else {
        toast.error('Nenhum registro foi importado.');
      }
    } finally {
      setIsImporting(false);
      setProgress(null);
    }
  };

  const totalValid =
    (parsed?.osRows.length || 0) +
    (parsed?.pleitoRows.length || 0) +
    (parsed?.faturamentoRows.length || 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Importar OS, Pleito e Faturamento"
      size="lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Use a planilha com as abas <strong>OS</strong>, <strong>Pleito</strong> e{' '}
          <strong>Faturamento</strong>. Preencha as três para cadastrar tudo de uma vez; abas
          vazias são ignoradas.
        </p>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-100">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Modelo da planilha
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  downloadOsPleitoBillingTemplate();
                  toast.success('Modelo baixado.');
                } catch {
                  toast.error('Erro ao baixar o modelo.');
                }
              }}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Download className="h-4 w-4" />
              Baixar modelo
            </button>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-600 dark:text-gray-400">
            <li>
              No exemplo, o que já vem preenchido é obrigatório; o que está em branco é opcional.
            </li>
            <li>
              Abas: <strong>OS</strong>, <strong>Pleito</strong> e <strong>Faturamento</strong> —
              use a mesma OS/SE nas três para cadastrar tudo de uma vez.
            </li>
          </ul>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void applyFile(file);
          }}
          className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            isDragging
              ? 'border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/30'
              : 'border-gray-300 dark:border-gray-600'
          }`}
        >
          <Upload className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Arraste o arquivo .xlsx ou selecione no computador
          </p>
          <input
            ref={fileInputRef}
            id="os-pleito-billing-import-file"
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void applyFile(file);
            }}
          />
          <label
            htmlFor="os-pleito-billing-import-file"
            className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white dark:bg-gray-100 dark:text-gray-900"
          >
            Selecionar arquivo
          </label>
          {fileName ? (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{fileName}</p>
          ) : null}
        </div>

        {parsed ? (
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg border border-gray-200 p-2 dark:border-gray-700">
              <p className="text-xs text-gray-500">OS</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{parsed.osRows.length}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-2 dark:border-gray-700">
              <p className="text-xs text-gray-500">Pleito</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {parsed.pleitoRows.length}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 p-2 dark:border-gray-700">
              <p className="text-xs text-gray-500">Faturamento</p>
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {parsed.faturamentoRows.length}
              </p>
            </div>
          </div>
        ) : null}

        {progress ? (
          <p className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {progress}
          </p>
        ) : null}

        {skipped.length > 0 ? (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/30">
            <p className="mb-1 font-medium text-amber-800 dark:text-amber-200">
              Avisos ({skipped.length})
            </p>
            <ul className="space-y-1 text-amber-900 dark:text-amber-100">
              {skipped.slice(0, 40).map((s, i) => (
                <li key={`${s.sheet}-${s.line}-${i}`}>
                  [{s.sheet}] linha {s.line}: {s.reasons.join('; ')}
                  {s.preview ? ` — ${s.preview}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void runImport()}
            disabled={isImporting || totalValid === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Importar{totalValid > 0 ? ` (${totalValid})` : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}

