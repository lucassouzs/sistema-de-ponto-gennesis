'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import api from '@/lib/api';
import { loadPdfjs } from '@/lib/loadPdfjs';

type DriveFileLike = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
};

type Props = {
  file: DriveFileLike;
  className?: string;
  iconFallback: React.ReactNode;
};

function isImageMime(mime: string) {
  return mime.startsWith('image/');
}

function isVideoMime(mime: string, name: string) {
  return mime.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v|mkv)$/i.test(name);
}

function isPdfMime(mime: string, name: string) {
  return mime.includes('pdf') || /\.pdf$/i.test(name);
}

function isSpreadsheetMime(mime: string, name: string) {
  return (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    /\.(xlsx|xls|csv)$/i.test(name)
  );
}

function isWordMime(mime: string, name: string) {
  return (
    mime.includes('word') ||
    mime.includes('officedocument.wordprocessingml') ||
    /\.(docx|doc)$/i.test(name)
  );
}

function isTextMime(mime: string, name: string) {
  return (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    /\.(txt|md|json|log|xml|html?|css|js|ts)$/i.test(name)
  );
}

/** Preview via URL assinada (imagem/vídeo) — não baixa o arquivo inteiro. */
function canBuildStreamPreview(file: DriveFileLike) {
  return isImageMime(file.mimeType) || isVideoMime(file.mimeType, file.name);
}

/** Preview que baixa conteúdo (limite ~12 MB). */
function canBuildContentPreview(file: DriveFileLike) {
  const { mimeType: mime, name, size } = file;
  if (isVideoMime(mime, name)) return false;
  if (size > 12 * 1024 * 1024) return false;
  return (
    isImageMime(mime) ||
    isPdfMime(mime, name) ||
    isSpreadsheetMime(mime, name) ||
    isWordMime(mime, name) ||
    isTextMime(mime, name)
  );
}

async function fetchFileBuffer(fileId: string): Promise<ArrayBuffer> {
  const res = await api.get(`/drive/files/${fileId}/content`, {
    responseType: 'arraybuffer',
    timeout: 45000,
  });
  return res.data as ArrayBuffer;
}

function SheetPreview({ rows }: { rows: string[][] }) {
  return (
    <div className="h-full w-full overflow-hidden bg-white p-1.5 dark:bg-gray-950">
      <table className="w-full border-collapse text-[8px] leading-tight text-gray-700 dark:text-gray-300">
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="max-w-[4.5rem] truncate border border-gray-200 px-1 py-0.5 dark:border-gray-700"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TextPreview({ text }: { text: string }) {
  return (
    <div className="h-full w-full overflow-hidden bg-white px-2 py-1.5 dark:bg-gray-950">
      <pre className="whitespace-pre-wrap break-words font-sans text-[9px] leading-snug text-gray-700 dark:text-gray-300">
        {text}
      </pre>
    </div>
  );
}

/**
 * Miniatura do conteúdo (imagem, vídeo, PDF, planilha, Word, texto).
 * Carrega sob demanda quando o card entra na viewport.
 */
export function DriveFileThumb({ file, className = '', iconFallback }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sheetRows, setSheetRows] = useState<string[][] | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);

  const supported = canBuildStreamPreview(file) || canBuildContentPreview(file);

  useEffect(() => {
    if (!supported) return;
    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;
    let started = false;
    let observer: IntersectionObserver | null = null;

    const render = async () => {
      if (started || cancelled) return;
      started = true;

      try {
        const mime = file.mimeType;
        const name = file.name;

        if (isImageMime(mime) || isVideoMime(mime, name)) {
          const res = await api.get<{ success: boolean; data: { url: string } }>(
            `/drive/files/${file.id}/preview`,
          );
          const url = res.data.data?.url;
          if (!url) throw new Error('sem url');
          if (cancelled) return;
          if (isVideoMime(mime, name)) {
            setVideoUrl(url);
          } else {
            setImageUrl(url);
          }
          setReady(true);
          return;
        }

        const data = await fetchFileBuffer(file.id);
        if (cancelled) return;
        if (!(data instanceof ArrayBuffer) || data.byteLength === 0) {
          throw new Error('vazio');
        }

        if (isPdfMime(mime, name)) {
          const pdfjs = await loadPdfjs();
          const pdf = await pdfjs.getDocument({ data }).promise;
          if (cancelled) return;
          const page = await pdf.getPage(1);
          if (cancelled) return;

          const canvas = canvasRef.current;
          if (!canvas) throw new Error('sem canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('sem ctx');

          const targetWidth = Math.max(root.clientWidth || 160, 140);
          const base = page.getViewport({ scale: 1 });
          const scale = targetWidth / base.width;
          const viewport = page.getViewport({ scale });

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await page.render({ canvasContext: context, viewport }).promise;
          if (!cancelled) setReady(true);
          return;
        }

        if (isSpreadsheetMime(mime, name)) {
          const XLSX = await import('xlsx');
          const wb = XLSX.read(data, { type: 'array', sheetRows: 8 });
          const sheetName = wb.SheetNames[0];
          if (!sheetName) throw new Error('sem aba');
          const sheet = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
            header: 1,
            defval: '',
            blankrows: false,
          }) as (string | number | boolean | null)[][];

          const preview = rows.slice(0, 6).map((row) =>
            (row || []).slice(0, 5).map((cell) => String(cell ?? '')),
          );
          if (!preview.length) throw new Error('planilha vazia');
          if (!cancelled) {
            setSheetRows(preview);
            setReady(true);
          }
          return;
        }

        if (isWordMime(mime, name)) {
          if (!/\.docx$/i.test(name) && !mime.includes('wordprocessingml')) {
            throw new Error('doc legado');
          }
          const mammoth = await import('mammoth');
          const result = await mammoth.extractRawText({ arrayBuffer: data });
          const text = (result.value || '').trim().slice(0, 420);
          if (!text) throw new Error('word vazio');
          if (!cancelled) {
            setTextPreview(text);
            setReady(true);
          }
          return;
        }

        if (isTextMime(mime, name)) {
          const text = new TextDecoder().decode(data).slice(0, 420).trim();
          if (!text) throw new Error('texto vazio');
          if (!cancelled) {
            setTextPreview(text);
            setReady(true);
          }
          return;
        }

        throw new Error('tipo sem preview');
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void render();
          observer?.disconnect();
        }
      },
      { rootMargin: '180px' },
    );
    observer.observe(root);

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [file.id, file.mimeType, file.name, file.size, supported]);

  if (!supported || failed) {
    return <>{iconFallback}</>;
  }

  return (
    <div ref={rootRef} className={`relative h-full w-full overflow-hidden ${className}`} aria-hidden>
      {!ready ? (
        <div className="absolute inset-0 animate-pulse bg-gray-200 dark:bg-gray-700" />
      ) : null}

      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : null}

      {videoUrl ? (
        <>
          <video
            src={`${videoUrl}#t=0.5`}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full bg-gray-900 object-cover"
            onLoadedData={(e) => {
              try {
                const v = e.currentTarget;
                if (v.currentTime < 0.1) v.currentTime = 0.5;
              } catch {
                /* ignore seek errors */
              }
            }}
            onError={() => setFailed(true)}
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/15">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white shadow-sm">
              <Play className="h-4 w-4 fill-current" />
            </span>
          </span>
        </>
      ) : null}

      <canvas
        ref={canvasRef}
        className={`block h-full w-full object-cover object-top ${
          ready && !imageUrl && !videoUrl && !sheetRows && !textPreview ? '' : 'hidden'
        }`}
      />

      {sheetRows ? <SheetPreview rows={sheetRows} /> : null}
      {textPreview ? <TextPreview text={textPreview} /> : null}
    </div>
  );
}
