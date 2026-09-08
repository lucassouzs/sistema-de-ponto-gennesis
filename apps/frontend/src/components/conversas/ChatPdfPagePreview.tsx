'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import api from '@/lib/api';
import { loadPdfjs } from '@/lib/loadPdfjs';

export const PDF_ATTACHMENT_WIDTH = 340;
export const PDF_PREVIEW_MAX_HEIGHT = 140;

type ChatPdfPagePreviewProps = {
  src: string;
  fileName?: string;
  fileKey?: string | null;
  className?: string;
  maxHeight?: number;
};

export function ChatPdfPagePreview({ src, fileName, fileKey, className, maxHeight = PDF_PREVIEW_MAX_HEIGHT }: ChatPdfPagePreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas || !src.trim()) return;

    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let started = false;

    const render = async () => {
      if (started || cancelled) return;
      started = true;

      try {
        const pdfjs = await loadPdfjs();

        const response = await api.get('/chats/direct/attachments/download', {
          params: {
            url: src,
            fileName: fileName || 'documento.pdf',
            ...(fileKey ? { fileKey } : {}),
          },
          responseType: 'arraybuffer',
          timeout: 45000,
        });

        const data = response.data as ArrayBuffer;
        if (!(data instanceof ArrayBuffer) || data.byteLength === 0) {
          throw new Error('empty pdf');
        }

        const pdf = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const containerWidth = PDF_ATTACHMENT_WIDTH;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const context = canvas.getContext('2d');
        if (!context) throw new Error('no canvas context');

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.maxWidth = '100%';
        canvas.style.display = 'block';

        await page.render({ canvasContext: context, viewport }).promise;
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void render();
          observer?.disconnect();
        }
      },
      { rootMargin: '160px' }
    );
    observer.observe(root);

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [src, fileName, fileKey]);

  if (failed) return null;

  return (
    <div
      ref={rootRef}
      className={clsx(
        'relative overflow-hidden bg-white pointer-events-none',
        !ready && 'min-h-[88px]',
        className
      )}
      style={{ width: PDF_ATTACHMENT_WIDTH, maxWidth: '100%', maxHeight }}
      aria-hidden
    >
      {!ready ? (
        <div className="absolute inset-0 bg-white/90 dark:bg-gray-100/90 animate-pulse" />
      ) : null}
      <canvas
        ref={canvasRef}
        className={clsx('block w-full max-w-full', !ready && 'invisible absolute')}
      />
    </div>
  );
}
