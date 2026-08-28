'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Eye, FileText, Loader2, Trash2, X } from 'lucide-react';
import { loadPdfjs } from '@/lib/loadPdfjs';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { Z_LIGHTBOX } from '@/lib/zIndex';
import type {
  JuridicoProcessoAnexo,
  JuridicoProcessoComprovante,
} from '@/data/juridico-processos-ativos';

function isImageFile(file: JuridicoProcessoAnexo): boolean {
  return (
    !!file.mimeType?.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.originalName || '')
  );
}

function isPdfFile(file: JuridicoProcessoAnexo): boolean {
  return (
    !!file.mimeType?.includes('pdf') || /\.pdf$/i.test(file.originalName || '')
  );
}

function fileExtLabel(name: string): string {
  const ext = name.split('.').pop()?.toUpperCase();
  return ext && ext.length <= 5 ? ext : 'ARQ';
}

const cardActionBtnCls =
  'inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white shadow-sm backdrop-blur-sm hover:bg-black/75';

type PreviewKind = 'image' | 'pdf' | 'other';

type Props = {
  file: JuridicoProcessoAnexo | JuridicoProcessoComprovante;
  extra?: string;
  /** Quando informado, exibe botão de lixeira no card. */
  onRemove?: () => void;
  removing?: boolean;
};

export function JuridicoFileCard({ file, extra, onRemove, removing }: Props) {
  const href = resolveApiMediaUrl(file.fileUrl);
  const image = isImageFile(file);
  const pdf = isPdfFile(file);
  const [lightbox, setLightbox] = useState<PreviewKind | null>(null);
  const [pdfThumb, setPdfThumb] = useState<string | null>(null);
  const [pdfThumbFailed, setPdfThumbFailed] = useState(false);
  /** Blob same-origin: iframe direto em :5000 é bloqueado por X-Frame-Options. */
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [pdfPreviewError, setPdfPreviewError] = useState(false);

  useEffect(() => {
    if (!href || !pdf) return;
    let cancelled = false;
    setPdfThumb(null);
    setPdfThumbFailed(false);

    (async () => {
      try {
        const response = await fetch(href);
        if (!response.ok) throw new Error('Falha ao baixar PDF');
        const buffer = await response.arrayBuffer();
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ data: buffer }).promise;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 360 / Math.max(base.width, 1) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas indisponível');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setPdfThumb(canvas.toDataURL('image/jpeg', 0.82));
      } catch {
        if (!cancelled) setPdfThumbFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [href, pdf]);

  // O lightbox abre sobre um modal: o Escape precisa fechar só a prévia.
  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setLightbox(null);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [lightbox]);

  // Carrega o PDF como blob para o iframe (API em outra origem bloqueia frame).
  useEffect(() => {
    if (lightbox !== 'pdf' || !href) {
      setPdfPreviewUrl(null);
      setPdfPreviewLoading(false);
      setPdfPreviewError(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setPdfPreviewLoading(true);
    setPdfPreviewError(false);
    setPdfPreviewUrl(null);

    (async () => {
      try {
        const response = await fetch(href);
        if (!response.ok) throw new Error('Falha ao baixar PDF');
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(
          blob.type ? blob : new Blob([blob], { type: 'application/pdf' }),
        );
        if (!cancelled) setPdfPreviewUrl(objectUrl);
      } catch {
        if (!cancelled) setPdfPreviewError(true);
      } finally {
        if (!cancelled) setPdfPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [lightbox, href]);

  const openPreview = () => {
    if (!href) return;
    if (image) setLightbox('image');
    else if (pdf) setLightbox('pdf');
    else setLightbox('other');
  };

  return (
    <>
      <div className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800">
        <button
          type="button"
          onClick={openPreview}
          disabled={!href}
          className="block h-28 w-full overflow-hidden bg-gray-50 text-left disabled:cursor-default dark:bg-gray-900/40"
          title={href ? 'Pré-visualizar' : undefined}
        >
          {href && image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={href}
              alt={file.originalName}
              className="h-full w-full object-cover object-top"
            />
          ) : href && pdf && pdfThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pdfThumb}
              alt={file.originalName}
              className="h-full w-full bg-white object-cover object-top"
            />
          ) : href && pdf && !pdfThumbFailed ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1.5">
              <FileText className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                {fileExtLabel(file.originalName)}
              </span>
            </div>
          )}
        </button>

        <div className="space-y-1 px-2 py-1.5">
          <p
            className="truncate text-xs font-medium text-gray-700 dark:text-gray-300"
            title={file.originalName}
          >
            {file.originalName}
          </p>
          {extra ? <p className="truncate text-[11px] text-gray-500">{extra}</p> : null}
          {!href ? (
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              Arquivo ainda não vinculado
            </p>
          ) : null}
        </div>

        {href || onRemove ? (
          <div className="absolute right-1.5 top-1.5 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
            {href ? (
              <>
                <button
                  type="button"
                  onClick={openPreview}
                  title="Ver"
                  aria-label={`Ver ${file.originalName}`}
                  className={cardActionBtnCls}
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <a
                  href={href}
                  download={file.originalName}
                  title="Baixar"
                  aria-label={`Baixar ${file.originalName}`}
                  className={cardActionBtnCls}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
              </>
            ) : null}
            {onRemove ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                disabled={removing}
                title="Remover"
                aria-label={`Remover ${file.originalName}`}
                className={`${cardActionBtnCls} hover:bg-red-700/90 disabled:opacity-50`}
              >
                {removing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {lightbox && href && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 flex items-center justify-center bg-black/80 p-4"
              style={{ zIndex: Z_LIGHTBOX }}
              role="dialog"
              aria-modal="true"
              aria-label={`Prévia de ${file.originalName}`}
              onClick={() => setLightbox(null)}
            >
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
                aria-label="Fechar"
              >
                <X className="h-[22px] w-[22px]" />
              </button>
              <div
                className="flex max-h-[88vh] max-w-[92vw] flex-col items-center justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                {lightbox === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={href}
                    alt={file.originalName}
                    className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
                  />
                ) : lightbox === 'pdf' ? (
                  pdfPreviewLoading ? (
                    <div className="flex h-[80vh] w-[min(90vw,900px)] items-center justify-center rounded-xl bg-white">
                      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                    </div>
                  ) : pdfPreviewError || !pdfPreviewUrl ? (
                    <div className="max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 text-center text-white">
                      <p className="mb-4 text-sm">Não foi possível pré-visualizar este PDF.</p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                        >
                          Abrir em nova aba
                        </a>
                        <a
                          href={href}
                          download={file.originalName}
                          className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-gray-800"
                        >
                          Baixar
                        </a>
                      </div>
                    </div>
                  ) : (
                    <iframe
                      title={file.originalName}
                      src={pdfPreviewUrl}
                      className="h-[80vh] w-[min(90vw,900px)] rounded-xl bg-white"
                    />
                  )
                ) : (
                  <div className="max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 text-center text-white">
                    <p className="mb-4 text-sm">
                      Não é possível pré-visualizar este tipo de arquivo aqui.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                      >
                        Abrir em nova aba
                      </a>
                      <a
                        href={href}
                        download={file.originalName}
                        className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-gray-800"
                      >
                        Baixar
                      </a>
                    </div>
                  </div>
                )}
                <p className="mt-3 max-w-full truncate text-center text-xs text-white/80">
                  {file.originalName}
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
