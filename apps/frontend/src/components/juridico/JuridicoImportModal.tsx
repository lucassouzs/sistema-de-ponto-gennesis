'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileArchive,
  FileSpreadsheet,
  Loader2,
  Paperclip,
  Receipt,
  Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { postJuridicoMultipart } from '@/lib/juridicoMultipartUpload';
import {
  JURIDICO_PROCESSOS_IMPORT_COLUMNS,
  collectAnexos,
  collectComprovantes,
  inspectJuridicoFilePack,
  parseJuridicoProcessosFromFile,
  type JuridicoImportReport,
  type LinkedFilePack,
} from '@/lib/juridicoProcessosImport';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
};

type DropKind = 'planilha' | 'anexos' | 'comprovantes';

type ImportProgressState = {
  step: number;
  totalSteps: number;
  label: string;
  detail?: string;
  uploadPercent: number | null;
};

type ImportResultTotals = {
  created: number;
  updated: number;
  failed: number;
  anexosLinked: number;
  comprovantesLinked: number;
};

function isZipName(name: string) {
  return name.toLowerCase().endsWith('.zip');
}

function DropZone({
  id,
  icon: Icon,
  title,
  hint,
  accept,
  multiple,
  fileLabel,
  ready,
  dragging,
  onFiles,
  onClear,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  fileLabel: string;
  ready: boolean;
  dragging: boolean;
  onFiles: (files: File[]) => void;
  onClear?: () => void;
}) {
  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const list = Array.from(e.dataTransfer.files || []);
        if (list.length) onFiles(list);
      }}
      className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
        ready
          ? 'border-green-500 bg-green-50/80 dark:border-green-600 dark:bg-green-950/20'
          : dragging
            ? 'border-red-400 bg-red-50 dark:bg-red-950/20'
            : 'border-gray-300 bg-gray-50/60 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800/40'
      }`}
    >
      {ready ? (
        <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400" />
      ) : (
        <Icon className="h-7 w-7 text-gray-400" />
      )}
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{fileLabel || hint}</p>
      {ready && onClear ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClear();
          }}
          className="text-xs font-medium text-red-600 underline-offset-2 hover:underline dark:text-red-400"
        >
          Remover
        </button>
      ) : null}
      <input
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const list = Array.from(e.target.files || []);
          if (list.length) onFiles(list);
          e.target.value = '';
        }}
      />
    </label>
  );
}

export function JuridicoImportModal({ isOpen, onClose, onImported }: Props) {
  const [report, setReport] = useState<JuridicoImportReport | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [anexoPack, setAnexoPack] = useState<LinkedFilePack | null>(null);
  const [comprovantePack, setComprovantePack] = useState<LinkedFilePack | null>(null);
  const [anexoFiles, setAnexoFiles] = useState<File[]>([]);
  const [comprovanteFiles, setComprovanteFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgressState | null>(null);
  const [reading, setReading] = useState<DropKind | null>(null);
  const dragKind = useRef<DropKind | null>(null);

  const anexos = useMemo(() => (report ? collectAnexos(report.processos) : []), [report]);
  const comprovantes = useMemo(
    () => (report ? collectComprovantes(report.processos) : []),
    [report],
  );
  const usedSheets = report?.sheets.filter((s) => s.kind !== 'ignorada') || [];

  const reset = () => {
    setReport(null);
    setSheetName('');
    setAnexoPack(null);
    setComprovantePack(null);
    setAnexoFiles([]);
    setComprovanteFiles([]);
    setImportProgress(null);
  };

  const handleClose = () => {
    if (importing) return;
    reset();
    onClose();
  };

  const postImportStep = async (
    fd: FormData,
    progress: Omit<ImportProgressState, 'uploadPercent'>,
  ) => {
    setImportProgress({ ...progress, uploadPercent: 0 });
    const body = await postJuridicoMultipart<{ data?: Partial<ImportResultTotals> }>(
      '/juridico-processos/import',
      fd,
      (loaded, total) => {
        if (!total) {
          setImportProgress((prev) =>
            prev ? { ...prev, ...progress, uploadPercent: null } : prev,
          );
          return;
        }
        const pct = Math.min(100, Math.round((loaded / total) * 100));
        setImportProgress((prev) =>
          prev ? { ...prev, ...progress, uploadPercent: pct } : prev,
        );
      },
    );
    setImportProgress((prev) =>
      prev ? { ...prev, ...progress, uploadPercent: 100 } : prev,
    );
    return body?.data;
  };

  const handleSpreadsheet = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setReading('planilha');
    try {
      const parsed = await parseJuridicoProcessosFromFile(file);
      setReport(parsed);
      setSheetName(file.name);
      setAnexoPack(null);
      setComprovantePack(null);
      setAnexoFiles([]);
      setComprovanteFiles([]);
      toast.success(`${parsed.processos.length} processo(s) lidos da planilha.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao ler a planilha.');
      setReport(null);
      setSheetName('');
    } finally {
      setReading(null);
    }
  };

  const handleAnexos = async (files: File[]) => {
    if (!report) {
      toast.error('Selecione a planilha primeiro.');
      return;
    }
    setReading('anexos');
    try {
      const pack = await inspectJuridicoFilePack(files, anexos);
      setAnexoFiles(files);
      setAnexoPack(pack);
      toast.success(
        `${pack.names.length} arquivo(s) de anexo · ${pack.matched} com vínculo na planilha.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao ler os anexos.');
    } finally {
      setReading(null);
    }
  };

  const handleComprovantes = async (files: File[]) => {
    if (!report) {
      toast.error('Selecione a planilha primeiro.');
      return;
    }
    setReading('comprovantes');
    try {
      const pack = await inspectJuridicoFilePack(files, comprovantes);
      setComprovanteFiles(files);
      setComprovantePack(pack);
      toast.success(
        `${pack.names.length} arquivo(s) de comprovante · ${pack.matched} com vínculo na planilha.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao ler os comprovantes.');
    } finally {
      setReading(null);
    }
  };

  const runImport = async () => {
    if (!report?.processos.length) {
      toast.error('Selecione a planilha de controle jurídico.');
      return;
    }

    const payloadJson = JSON.stringify({ processos: report.processos });
    const anexoZips = anexoFiles.filter((f) => isZipName(f.name));
    const anexoLoose = anexoFiles.filter((f) => !isZipName(f.name));
    const comprovanteZips = comprovanteFiles.filter((f) => isZipName(f.name));
    const comprovanteLoose = comprovanteFiles.filter((f) => !isZipName(f.name));

    const steps: Array<{
      label: string;
      detail?: string;
      build: () => FormData;
    }> = [];

    // 1) Planilha / metadados (sem arquivos grandes)
    steps.push({
      label: 'Salvando processos da planilha…',
      detail: `${report.processos.length} processo(s)`,
      build: () => {
        const fd = new FormData();
        fd.append('payload', payloadJson);
        return fd;
      },
    });

    // 2) Anexos soltos (se houver)
    if (anexoLoose.length) {
      steps.push({
        label: 'Enviando anexos avulsos…',
        detail: `${anexoLoose.length} arquivo(s)`,
        build: () => {
          const fd = new FormData();
          fd.append('payload', payloadJson);
          for (const file of anexoLoose) fd.append('anexos', file);
          return fd;
        },
      });
    }

    // 3) Cada ZIP de anexos
    anexoZips.forEach((file, idx) => {
      steps.push({
        label: `Enviando ZIP de anexos (${idx + 1}/${anexoZips.length})…`,
        detail: file.name,
        build: () => {
          const fd = new FormData();
          fd.append('payload', payloadJson);
          fd.append('anexosZip', file);
          return fd;
        },
      });
    });

    // 4) Comprovantes soltos
    if (comprovanteLoose.length) {
      steps.push({
        label: 'Enviando comprovantes avulsos…',
        detail: `${comprovanteLoose.length} arquivo(s)`,
        build: () => {
          const fd = new FormData();
          fd.append('payload', payloadJson);
          for (const file of comprovanteLoose) fd.append('comprovantes', file);
          return fd;
        },
      });
    }

    // 5) Cada ZIP de comprovantes
    comprovanteZips.forEach((file, idx) => {
      steps.push({
        label: `Enviando ZIP de comprovantes (${idx + 1}/${comprovanteZips.length})…`,
        detail: file.name,
        build: () => {
          const fd = new FormData();
          fd.append('payload', payloadJson);
          fd.append('comprovantesZip', file);
          return fd;
        },
      });
    });

    setImporting(true);
    const totals: ImportResultTotals = {
      created: 0,
      updated: 0,
      failed: 0,
      anexosLinked: 0,
      comprovantesLinked: 0,
    };

    try {
      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i]!;
        const data = await postImportStep(step.build(), {
          step: i + 1,
          totalSteps: steps.length,
          label: step.label,
          detail: step.detail,
        });

        if (i === 0) {
          totals.created = data?.created || 0;
          totals.updated = data?.updated || 0;
          totals.failed = data?.failed || 0;
        }
        totals.anexosLinked += data?.anexosLinked || 0;
        totals.comprovantesLinked += data?.comprovantesLinked || 0;
      }

      setImportProgress({
        step: steps.length,
        totalSteps: steps.length,
        label: 'Importação concluída',
        uploadPercent: 100,
      });

      toast.success(
        `Importação: ${totals.created} novo(s), ${totals.updated} atualizado(s)` +
          (totals.anexosLinked || totals.comprovantesLinked
            ? ` · ${totals.anexosLinked} anexo(s) e ${totals.comprovantesLinked} comprovante(s) vinculados`
            : ''),
      );
      onImported();
      reset();
      onClose();
    } catch (err: unknown) {
      const ax = err as {
        code?: string;
        response?: { data?: { message?: string }; status?: number };
        message?: string;
      };
      const msg =
        ax.code === 'ECONNABORTED'
          ? 'Tempo esgotado no envio. Tente de novo — os ZIPs agora vão um por vez.'
          : ax.message === 'Network Error' ||
              String(ax.message || '')
                .toLowerCase()
                .includes('network error')
            ? 'Conexão com o servidor foi interrompida (timeout no deploy ou processamento longo). Aguarde e tente de novo; se persistir, confira os logs do backend no Railway.'
          : ax.response?.data?.message ||
            (String(ax.message || '').toLowerCase().includes('file too large')
              ? 'Arquivo grande demais. O envio agora é por ZIP; se ainda falhar, divida o ZIP.'
              : ax.message) ||
            'Erro na importação.';
      toast.error(msg);
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const overallPercent = importProgress
    ? Math.round(
        ((importProgress.step - 1) / Math.max(1, importProgress.totalSteps)) * 100 +
          ((importProgress.uploadPercent ?? 50) / Math.max(1, importProgress.totalSteps)),
      )
    : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Importar processos ativos"
      size="5xl"
      confirmBeforeClose={!!report && !importing}
      confirmCloseMessage="Descartar a planilha e os arquivos selecionados?"
    >
      {importProgress ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
                <Loader2 className="h-6 w-6 animate-spin text-red-600" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Importando processos
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Etapa {importProgress.step} de {importProgress.totalSteps}
                </p>
              </div>
            </div>

            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
              {importProgress.label}
            </p>
            {importProgress.detail ? (
              <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                {importProgress.detail}
              </p>
            ) : null}

            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Progresso geral</span>
                <span>{Math.min(100, Math.max(0, overallPercent))}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-red-600 transition-[width] duration-300"
                  style={{ width: `${Math.min(100, Math.max(2, overallPercent))}%` }}
                />
              </div>
              {importProgress.uploadPercent != null ? (
                <>
                  <div className="flex items-center justify-between pt-1 text-xs text-gray-500">
                    <span>Envio desta etapa</span>
                    <span>{importProgress.uploadPercent}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-[width] duration-200"
                      style={{ width: `${importProgress.uploadPercent}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="pt-1 text-xs text-gray-500">Processando no servidor…</p>
              )}
            </div>

            <p className="mt-5 text-center text-xs text-gray-500 dark:text-gray-400">
              Não feche esta janela. ZIPs grandes são enviados um por vez.
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-5">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Envie a planilha <strong>CONTROLE JURÍDICO</strong>. O sistema lê a aba de processos e as
          abas de anexos (atas) e comprovantes, cruzando pelo <strong>ID_PROCESSO</strong>. Depois,
          envie os ZIPs (pode ser vários, inclusive bem grandes) — o envio é feito{' '}
          <strong>um arquivo por vez</strong>.
        </p>

        <div className="grid gap-3 md:grid-cols-3">
          <DropZone
            id="juridico-import-xlsx"
            icon={FileSpreadsheet}
            title="1. Planilha"
            hint=".xlsx do controle jurídico"
            accept=".xlsx,.xls"
            fileLabel={
              reading === 'planilha'
                ? 'Lendo planilha…'
                : sheetName
                  ? `${sheetName} · ${report?.processos.length || 0} processos`
                  : ''
            }
            ready={!!report}
            dragging={dragKind.current === 'planilha'}
            onFiles={handleSpreadsheet}
            onClear={reset}
          />
          <DropZone
            id="juridico-import-anexos"
            icon={Paperclip}
            title="2. Anexos / atas"
            hint="ZIP ou imagens/PDFs (DB_ANEXO_ATA)"
            accept=".zip,image/*,.pdf,.png,.jpg,.jpeg,.webp"
            multiple
            fileLabel={
              reading === 'anexos'
                ? 'Lendo anexos…'
                : anexoPack
                  ? `${anexoPack.names.length} arquivo(s) · ${anexoPack.matched} vinculados`
                  : anexos.length
                    ? `${anexos.length} anexos na planilha`
                    : ''
            }
            ready={!!anexoPack}
            dragging={dragKind.current === 'anexos'}
            onFiles={handleAnexos}
            onClear={() => {
              setAnexoPack(null);
              setAnexoFiles([]);
            }}
          />
          <DropZone
            id="juridico-import-comprovantes"
            icon={Receipt}
            title="3. Comprovantes"
            hint="ZIP ou imagens/PDFs (DB_COMPROVANTES)"
            accept=".zip,image/*,.pdf,.png,.jpg,.jpeg,.webp"
            multiple
            fileLabel={
              reading === 'comprovantes'
                ? 'Lendo comprovantes…'
                : comprovantePack
                  ? `${comprovantePack.names.length} arquivo(s) · ${comprovantePack.matched} vinculados`
                  : comprovantes.length
                    ? `${comprovantes.length} comprovantes na planilha`
                    : ''
            }
            ready={!!comprovantePack}
            dragging={dragKind.current === 'comprovantes'}
            onFiles={handleComprovantes}
            onClear={() => {
              setComprovantePack(null);
              setComprovanteFiles([]);
            }}
          />
        </div>

        {report ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Processos</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                {report.processos.length}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Anexos</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                {anexos.length}
              </p>
              <p className="text-xs text-gray-500">
                {anexoPack ? `${anexoPack.matched} com arquivo` : 'sem arquivos ainda'}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900/40">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Comprovantes
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                {comprovantes.length}
              </p>
              <p className="text-xs text-gray-500">
                {comprovantePack ? `${comprovantePack.matched} com arquivo` : 'sem arquivos ainda'}
              </p>
            </div>
          </div>
        ) : null}

        {usedSheets.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Abas usadas
            </p>
            <div className="flex flex-wrap gap-2">
              {usedSheets.map((sheet) => (
                <span
                  key={sheet.name}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                >
                  {sheet.kind === 'processos' ? (
                    <FileSpreadsheet className="h-3.5 w-3.5 text-red-500" />
                  ) : sheet.kind === 'anexos' ? (
                    <Paperclip className="h-3.5 w-3.5 text-blue-500" />
                  ) : sheet.kind === 'comprovantes' ? (
                    <Receipt className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <FileArchive className="h-3.5 w-3.5 text-gray-400" />
                  )}
                  {sheet.name}
                  <span className="text-gray-400">· {sheet.rows}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Colunas da aba de processos
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Vara, função, contrato e objetos extras são resolvidos pelas abas de cadastro.
            </p>
          </div>
          <ul className="max-h-36 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
            {JURIDICO_PROCESSOS_IMPORT_COLUMNS.map((col) => (
              <li
                key={col.name}
                className="flex items-center justify-between gap-2 px-4 py-1.5 text-sm"
              >
                <span className="font-medium text-gray-800 dark:text-gray-100">
                  {col.name}
                  {col.required ? <span className="ml-1 text-red-600">*</span> : null}
                </span>
                <span className="text-xs text-gray-500">{col.hint || (col.required ? 'Obrigatório' : 'Opcional')}</span>
              </li>
            ))}
          </ul>
        </div>

        {(anexoPack?.unmatched.length || comprovantePack?.unmatched.length) ? (
          <div className="max-h-28 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            <p className="mb-1 font-semibold">Arquivos sem vínculo pelo nome/ID:</p>
            {[...(anexoPack?.unmatched || []).slice(0, 8), ...(comprovantePack?.unmatched || []).slice(0, 8)].map(
              (name) => (
                <p key={name}>{name}</p>
              ),
            )}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={importing}
            onClick={handleClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={importing || !report?.processos.length}
            onClick={() => void runImport()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importando…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Importar {report?.processos.length || 0} processo(s)
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
