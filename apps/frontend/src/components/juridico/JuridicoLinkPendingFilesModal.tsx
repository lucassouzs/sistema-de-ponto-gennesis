'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileArchive,
  Loader2,
  Paperclip,
  Receipt,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { isZipFile, listZipEntryNames } from '@/lib/zipEntryNames';

export type JuridicoLinkPendingKind = 'anexos' | 'comprovantes';

type Props = {
  isOpen: boolean;
  kind: JuridicoLinkPendingKind;
  onClose: () => void;
  onLinked: () => void;
};

type ProgressState = {
  step: number;
  totalSteps: number;
  label: string;
  detail?: string;
  uploadPercent: number | null;
};

const TIMEOUT_MS = 20 * 60 * 1000;

function kindConfig(kind: JuridicoLinkPendingKind) {
  if (kind === 'anexos') {
    return {
      title: 'Importar só anexos',
      progressTitle: 'Vinculando anexos',
      description: (
        <>
          Envie o ZIP da pasta <strong>DB_ANEXO_ATA_Images</strong> (ou outros ZIPs restantes). O
          sistema vincula automaticamente aos anexos já importados que ainda estão sem arquivo.
        </>
      ),
      emptyError: 'Selecione o ZIP da pasta DB_ANEXO_ATA_Images.',
      dropLabel: 'ZIP de anexos / atas (Images)',
      inputId: 'juridico-link-anexos',
      Icon: Paperclip as LucideIcon,
      looseField: 'anexos' as const,
      zipField: 'anexosZip' as const,
      kindValue: 'anexos' as const,
      linkedKey: 'anexosLinked' as const,
      pendingKey: 'anexosPending' as const,
      itemLabel: 'anexo(s)',
      progressHint: 'O sistema cruza só os anexos sem arquivo.',
      sendingLoose: 'Enviando anexos avulsos…',
      sendingZip: (idx: number, total: number) =>
        `Enviando ZIP de anexos (${idx}/${total})…`,
    };
  }
  return {
    title: 'Vincular comprovantes pendentes',
    progressTitle: 'Vinculando comprovantes',
    description: (
      <>
        Envie o ZIP da pasta <strong>DB_COMPROVANTES_PAGAMENTO_Images</strong> (ou outros ZIPs
        restantes). O sistema vincula automaticamente aos comprovantes já importados que ainda
        estão sem arquivo.
      </>
    ),
    emptyError: 'Selecione o ZIP da pasta DB_COMPROVANTES_PAGAMENTO_Images.',
    dropLabel: 'ZIP de comprovantes (Images)',
    inputId: 'juridico-link-comprovantes',
    Icon: Receipt as LucideIcon,
    looseField: 'comprovantes' as const,
    zipField: 'comprovantesZip' as const,
    kindValue: 'comprovantes' as const,
    linkedKey: 'comprovantesLinked' as const,
    pendingKey: 'comprovantesPending' as const,
    itemLabel: 'comprovante(s)',
    progressHint: 'O sistema cruza só os comprovantes sem arquivo.',
    sendingLoose: 'Enviando comprovantes avulsos…',
    sendingZip: (idx: number, total: number) =>
      `Enviando ZIP de comprovantes (${idx}/${total})…`,
  };
}

export function JuridicoLinkPendingFilesModal({ isOpen, kind, onClose, onLinked }: Props) {
  const cfg = useMemo(() => kindConfig(kind), [kind]);
  const [files, setFiles] = useState<File[]>([]);
  const [entryCount, setEntryCount] = useState(0);
  const [reading, setReading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);

  const reset = () => {
    setFiles([]);
    setEntryCount(0);
    setProgress(null);
  };

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, kind]);

  const handleClose = () => {
    if (linking) return;
    reset();
    onClose();
  };

  const handleFiles = async (list: File[]) => {
    if (!list.length) return;
    setReading(true);
    try {
      let names = 0;
      for (const file of list) {
        if (isZipFile(file)) {
          const entries = await listZipEntryNames(file);
          names += entries.length;
        } else {
          names += 1;
        }
      }
      setFiles(list);
      setEntryCount(names);
      toast.success(`${list.length} arquivo(s) · ${names} item(ns) detectado(s).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao ler o ZIP.');
    } finally {
      setReading(false);
    }
  };

  const runLink = async () => {
    if (!files.length) {
      toast.error(cfg.emptyError);
      return;
    }

    const zips = files.filter((f) => isZipFile(f));
    const loose = files.filter((f) => !isZipFile(f));
    const steps: Array<{ label: string; detail?: string; build: () => FormData }> = [];

    if (loose.length) {
      steps.push({
        label: cfg.sendingLoose,
        detail: `${loose.length} arquivo(s)`,
        build: () => {
          const fd = new FormData();
          fd.append('kind', cfg.kindValue);
          for (const file of loose) fd.append(cfg.looseField, file);
          return fd;
        },
      });
    }

    zips.forEach((file, idx) => {
      steps.push({
        label: cfg.sendingZip(idx + 1, zips.length),
        detail: file.name,
        build: () => {
          const fd = new FormData();
          fd.append('kind', cfg.kindValue);
          fd.append(cfg.zipField, file);
          return fd;
        },
      });
    });

    setLinking(true);
    let totalLinked = 0;
    let lastPending = 0;

    try {
      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i]!;
        setProgress({
          step: i + 1,
          totalSteps: steps.length,
          label: step.label,
          detail: step.detail,
          uploadPercent: 0,
        });

        const res = await api.post('/juridico-processos/link-files', step.build(), {
          timeout: TIMEOUT_MS,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          onUploadProgress: (evt) => {
            if (!evt.total) {
              setProgress((prev) =>
                prev ? { ...prev, label: step.label, detail: step.detail, uploadPercent: null } : prev,
              );
              return;
            }
            const pct = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
            setProgress((prev) =>
              prev
                ? { ...prev, label: step.label, detail: step.detail, uploadPercent: pct }
                : prev,
            );
          },
        });

        const data = res.data?.data as Record<string, number> | undefined;
        totalLinked += data?.[cfg.linkedKey] || 0;
        lastPending = data?.[cfg.pendingKey] || lastPending;
      }

      toast.success(
        `Vinculados ${totalLinked} ${cfg.itemLabel}` +
          (lastPending
            ? ` · ${Math.max(0, lastPending - totalLinked)} ainda pendente(s) nesta etapa`
            : ''),
      );
      onLinked();
      reset();
      onClose();
    } catch (err: unknown) {
      const ax = err as {
        code?: string;
        response?: { data?: { message?: string } };
        message?: string;
      };
      toast.error(
        ax.code === 'ECONNABORTED'
          ? 'Tempo esgotado. Tente enviar um ZIP por vez.'
          : ax.message === 'Network Error' ||
              String(ax.message || '')
                .toLowerCase()
                .includes('network error')
            ? 'Conexão interrompida (ZIP grande ou timeout no servidor). Envie um ZIP por vez e aguarde cada etapa terminar.'
          : ax.response?.data?.message || ax.message || 'Erro ao vincular arquivos.',
      );
    } finally {
      setLinking(false);
      setProgress(null);
    }
  };

  const overallPercent = progress
    ? Math.round(
        ((progress.step - 1) / Math.max(1, progress.totalSteps)) * 100 +
          ((progress.uploadPercent ?? 50) / Math.max(1, progress.totalSteps)),
      )
    : 0;

  const DropIcon = cfg.Icon;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={cfg.title}
      size="lg"
      confirmBeforeClose={!!files.length && !linking}
      confirmCloseMessage="Descartar os arquivos selecionados?"
    >
      {progress ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
                <Loader2 className="h-6 w-6 animate-spin text-red-600" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {cfg.progressTitle}
                </p>
                <p className="text-xs text-gray-500">
                  Etapa {progress.step} de {progress.totalSteps}
                </p>
              </div>
            </div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{progress.label}</p>
            {progress.detail ? (
              <p className="mt-1 truncate text-xs text-gray-500">{progress.detail}</p>
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
            </div>
            <p className="mt-5 text-center text-xs text-gray-500">{cfg.progressHint}</p>
          </div>
        </div>
      ) : null}

      <div className="space-y-5">
        <p className="text-sm text-gray-600 dark:text-gray-400">{cfg.description}</p>

        <label
          htmlFor={cfg.inputId}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const list = Array.from(e.dataTransfer.files || []);
            if (list.length) void handleFiles(list);
          }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            files.length
              ? 'border-green-500 bg-green-50/80 dark:border-green-600 dark:bg-green-950/20'
              : 'border-gray-300 bg-gray-50/60 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800/40'
          }`}
        >
          {files.length ? (
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          ) : (
            <DropIcon className="h-8 w-8 text-gray-400" />
          )}
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{cfg.dropLabel}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {reading
              ? 'Lendo arquivos…'
              : files.length
                ? `${files.length} arquivo(s) · ${entryCount} item(ns)`
                : 'Arraste ou clique para selecionar um ou mais ZIPs'}
          </p>
          {files.length ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                reset();
              }}
              className="text-xs font-medium text-red-600 underline-offset-2 hover:underline dark:text-red-400"
            >
              Remover
            </button>
          ) : null}
          <input
            id={cfg.inputId}
            type="file"
            accept=".zip,image/*,.pdf,.png,.jpg,.jpeg,.webp"
            multiple
            className="hidden"
            onChange={(e) => {
              const list = Array.from(e.target.files || []);
              if (list.length) void handleFiles(list);
              e.target.value = '';
            }}
          />
        </label>

        {files.length ? (
          <ul className="max-h-28 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-3 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300">
            {files.map((file) => (
              <li key={`${file.name}-${file.size}`} className="flex items-center gap-2 truncate">
                <FileArchive className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                {file.name}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={linking}
            onClick={handleClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={linking || !files.length || reading}
            onClick={() => void runLink()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {linking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Vinculando…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Vincular pendentes
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
