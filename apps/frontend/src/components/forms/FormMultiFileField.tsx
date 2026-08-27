'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  Loader2,
  Paperclip,
  Plus,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { loadPdfjs } from '@/lib/loadPdfjs';

export type FormFileItem = {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  /** Prévia visual (imagem ou 1ª página do PDF). */
  dataUrl?: string;
  /** Arquivo original em data URL (ver / baixar). */
  sourceDataUrl?: string;
  /** Recorte de planilha. */
  previewSheet?: string[][];
  /** Trecho de texto / Word. */
  previewText?: string;
};

/** File original na sessão (ver/baixar sem recarregar). */
const fileBlobStore = new Map<string, File>();

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function isImageMime(mime?: string, name?: string) {
  if (mime?.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name || '');
}

function isPdfMime(mime?: string, name?: string) {
  return !!mime?.includes('pdf') || /\.pdf$/i.test(name || '');
}

function isSpreadsheetMime(mime?: string, name?: string) {
  const m = (mime || '').toLowerCase();
  return (
    m.includes('spreadsheet') ||
    m.includes('excel') ||
    m.includes('csv') ||
    /\.(xlsx|xls|csv)$/i.test(name || '')
  );
}

function isWordMime(mime?: string, name?: string) {
  const m = (mime || '').toLowerCase();
  return (
    m.includes('word') ||
    m.includes('wordprocessingml') ||
    /\.(docx|doc)$/i.test(name || '')
  );
}

function isTextMime(mime?: string, name?: string) {
  const m = (mime || '').toLowerCase();
  return (
    m.startsWith('text/') ||
    m.includes('json') ||
    /\.(txt|md|json|log|xml|html?|css|js|ts)$/i.test(name || '')
  );
}

function fileExtLabel(name: string) {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1]!.toUpperCase() : 'ARQ';
}

function FileKindIcon({ name, mimeType }: { name: string; mimeType?: string }) {
  if (isSpreadsheetMime(mimeType, name)) {
    return <FileSpreadsheet className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />;
  }
  if (isPdfMime(mimeType, name) || isWordMime(mimeType, name)) {
    return <FileText className="h-8 w-8 text-red-600 dark:text-red-400" />;
  }
  return <Paperclip className="h-8 w-8 text-gray-400 dark:text-gray-500" />;
}

function hasBuiltPreview(file: FormFileItem) {
  return Boolean(
    (file.dataUrl && file.dataUrl.length > 32) ||
      (file.previewSheet && file.previewSheet.length > 0) ||
      (file.previewText && file.previewText.trim())
  );
}

function SheetPreview({ rows }: { rows: string[][] }) {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  return (
    <div className="h-full w-full overflow-hidden bg-white dark:bg-gray-950">
      <table className="w-full border-collapse table-fixed">
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri === 0 ? 'bg-gray-100 dark:bg-gray-800' : undefined}>
              {Array.from({ length: cols }, (_, ci) => (
                <td
                  key={ci}
                  className="truncate border border-gray-200 px-1 py-0.5 text-[8px] leading-tight text-gray-800 dark:border-gray-700 dark:text-gray-200"
                >
                  {row[ci] ?? ''}
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
      <pre className="whitespace-pre-wrap break-words font-sans text-[9px] leading-snug text-gray-800 dark:text-gray-200">
        {text}
      </pre>
    </div>
  );
}

function FileCardPreview({ file }: { file: FormFileItem }) {
  if (file.dataUrl && file.dataUrl.length > 32) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={file.dataUrl}
        alt={file.name}
        className="h-full w-full object-cover object-top"
      />
    );
  }
  if (file.previewSheet && file.previewSheet.length > 0) {
    return <SheetPreview rows={file.previewSheet} />;
  }
  if (file.previewText?.trim()) {
    return <TextPreview text={file.previewText} />;
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-gray-50 dark:bg-gray-900/50">
      <FileKindIcon name={file.name} mimeType={file.mimeType} />
      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-700 dark:text-gray-300">
        {fileExtLabel(file.name)}
      </span>
    </div>
  );
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

async function shrinkImageDataUrl(dataUrl: string, maxW = 420): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxW / Math.max(img.width, 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function buildPreviewFromFile(file: File): Promise<Partial<FormFileItem>> {
  const mime = file.type || '';
  const name = file.name;

  if (file.size > 25 * 1024 * 1024) {
    throw new Error('Arquivo muito grande para prévia (máx. 25 MB)');
  }

  if (isImageMime(mime, name)) {
    const raw = await fileToDataUrl(file);
    return { dataUrl: await shrinkImageDataUrl(raw) };
  }

  const buffer = await file.arrayBuffer();
  if (!buffer.byteLength) throw new Error('Arquivo vazio');
  const bytes = new Uint8Array(buffer);

  if (isPdfMime(mime, name)) {
    const pdfjs = await loadPdfjs();
    // Cópia isolada — pdf.js muda o buffer
    const copy = bytes.slice().buffer;
    const pdf = await pdfjs.getDocument({ data: copy }).promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = 320 / Math.max(base.width, 1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.82) };
  }

  if (isSpreadsheetMime(mime, name)) {
    const wb = XLSX.read(bytes, { type: 'array', sheetRows: 12 });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error('Planilha sem abas');
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    }) as (string | number | boolean | null)[][];

    const previewSheet = rows
      .slice(0, 8)
      .map((row) => (row || []).slice(0, 6).map((cell) => String(cell ?? '')))
      .filter((row) => row.some((c) => c.trim()));

    if (!previewSheet.length) throw new Error('Planilha vazia');
    return { previewSheet };
  }

  if (isWordMime(mime, name)) {
    if (!/\.docx$/i.test(name) && !mime.toLowerCase().includes('wordprocessingml')) {
      throw new Error('Prévia só para .docx');
    }
    const mammothMod = await import('mammoth');
    const mammoth = (mammothMod as { default?: typeof mammothMod }).default ?? mammothMod;
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const previewText = String(result.value || '').trim().slice(0, 500);
    if (!previewText) throw new Error('Documento sem texto');
    return { previewText };
  }

  if (isTextMime(mime, name)) {
    const previewText = new TextDecoder().decode(bytes).trim().slice(0, 500);
    if (!previewText) throw new Error('Texto vazio');
    return { previewText };
  }

  return {};
}

/** Converte o valor salvo no formulário em lista de arquivos. */
export function parseFormFileValue(raw: unknown): FormFileItem[] {
  if (raw == null || raw === '') return [];
  if (typeof raw === 'number') return [];
  const text = String(raw).trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const obj = item as Record<string, unknown>;
          const name = String(obj.name || '').trim();
          if (!name) return null;
          const previewSheet = Array.isArray(obj.previewSheet)
            ? (obj.previewSheet as unknown[])
                .filter((row): row is unknown[] => Array.isArray(row))
                .map((row) => row.map((cell) => String(cell ?? '')))
            : undefined;
          return {
            id: String(obj.id || uid()),
            name,
            mimeType: obj.mimeType ? String(obj.mimeType) : undefined,
            size: typeof obj.size === 'number' ? obj.size : undefined,
            dataUrl: obj.dataUrl ? String(obj.dataUrl) : undefined,
            sourceDataUrl: obj.sourceDataUrl ? String(obj.sourceDataUrl) : undefined,
            previewSheet: previewSheet?.length ? previewSheet : undefined,
            previewText: obj.previewText ? String(obj.previewText) : undefined,
          } satisfies FormFileItem;
        })
        .filter((x): x is FormFileItem => !!x);
    } catch {
      /* legado */
    }
  }
  return [{ id: uid(), name: text }];
}

export function serializeFormFileValue(files: FormFileItem[]): string {
  if (!files.length) return '';
  return JSON.stringify(files);
}

export function isBlankFormFileValue(raw: unknown): boolean {
  return parseFormFileValue(raw).length === 0;
}

function openFileInNewTab(file: FormFileItem) {
  const blob = fileBlobStore.get(file.id);
  if (blob) {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const href = file.sourceDataUrl || file.dataUrl;
  if (href) {
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }
  toast.error('Arquivo indisponível para visualizar. Envie novamente.');
}

function downloadFormFile(file: FormFileItem) {
  const blob = fileBlobStore.get(file.id);
  let href: string | null = null;
  let revoke = false;
  if (blob) {
    href = URL.createObjectURL(blob);
    revoke = true;
  } else if (file.sourceDataUrl) {
    href = file.sourceDataUrl;
  } else if (file.dataUrl) {
    href = file.dataUrl;
  }
  if (!href) {
    toast.error('Arquivo indisponível para baixar. Envie novamente.');
    return;
  }
  const a = document.createElement('a');
  a.href = href;
  a.download = file.name || 'arquivo';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) {
    window.setTimeout(() => URL.revokeObjectURL(href!), 1500);
  }
}

const cardActionBtnCls =
  'rounded-md bg-black/55 p-1 text-white transition-colors hover:bg-black/75 disabled:opacity-50';

type FormMultiFileFieldProps = {
  value: string;
  onChange: (value: string) => void;
  mode: 'attachment' | 'image';
  disabled?: boolean;
  placeholder?: string;
};

export function FormMultiFileField({
  value,
  onChange,
  mode,
  disabled = false,
  placeholder,
}: FormMultiFileFieldProps) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const files = useMemo(() => parseFormFileValue(value), [value]);
  const filesRef = useRef(files);
  filesRef.current = files;
  const isImage = mode === 'image';

  const commit = (next: FormFileItem[]) => {
    onChange(serializeFormFileValue(next));
  };

  const addFiles = async (list: FileList | File[] | null) => {
    if (disabled || busy || !list?.length) return;
    const incoming = Array.from(list).filter((file) =>
      isImage ? isImageMime(file.type, file.name) : true
    );
    if (!incoming.length) return;

    setBusy(true);
    try {
      const mapped: FormFileItem[] = [];
      for (const file of incoming) {
        const item: FormFileItem = {
          id: uid(),
          name: file.name,
          mimeType: file.type || undefined,
          size: file.size,
        };
        fileBlobStore.set(item.id, file);
        try {
          if (file.size <= 15 * 1024 * 1024) {
            item.sourceDataUrl = await fileToDataUrl(file);
          }
        } catch {
          /* ver/baixar ainda funciona via fileBlobStore na sessão */
        }
        try {
          const preview = await buildPreviewFromFile(file);
          Object.assign(item, preview);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'erro desconhecido';
          console.error('[FormMultiFileField] prévia falhou', file.name, err);
          toast.error(`Não foi possível gerar prévia de “${file.name}”: ${msg}`);
        }
        mapped.push(item);
      }
      commit([...filesRef.current, ...mapped]);
    } finally {
      setBusy(false);
    }
  };

  const removeAt = (id: string) => {
    fileBlobStore.delete(id);
    commit(filesRef.current.filter((f) => f.id !== id));
  };

  const label =
    placeholder ||
    (isImage ? 'Clique ou arraste imagens' : 'Clique ou arraste arquivos');
  const hint = isImage ? 'PNG, JPG, WEBP…' : 'PDF, DOC, planilhas, imagens…';
  const accept = isImage ? 'image/*' : undefined;
  const blocked = disabled || busy;

  return (
    <div className="space-y-2">
      {files.length === 0 ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            if (!blocked) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (blocked) return;
            void addFiles(e.dataTransfer.files);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
            dragOver
              ? 'border-red-500 bg-red-50 dark:bg-red-950/40'
              : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500 dark:hover:bg-gray-700/80'
          } ${blocked ? 'pointer-events-none opacity-60' : ''}`}
        >
          {busy ? (
            <Loader2 className="h-7 w-7 animate-spin text-red-600 dark:text-red-400" />
          ) : isImage ? (
            <ImagePlus className="h-7 w-7 text-gray-400 dark:text-gray-500" strokeWidth={1.4} />
          ) : (
            <Paperclip className="h-7 w-7 text-gray-400 dark:text-gray-500" strokeWidth={1.4} />
          )}
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
            {busy ? 'Gerando prévia…' : label}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{hint}</span>
          <input
            type="file"
            multiple
            accept={accept}
            className="hidden"
            disabled={blocked}
            onChange={(e) => {
              void addFiles(e.target.files);
              e.currentTarget.value = '';
            }}
          />
        </label>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {files.map((file) => (
            <li
              key={file.id}
              className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800"
            >
              <div className="h-28 w-full overflow-hidden bg-gray-50 dark:bg-gray-900/40">
                <FileCardPreview file={file} />
              </div>
              <p
                className="truncate px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300"
                title={file.name}
              >
                {file.name}
              </p>
              <div className="absolute right-1.5 top-1.5 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => openFileInNewTab(file)}
                  disabled={blocked}
                  title="Ver"
                  aria-label={`Ver ${file.name}`}
                  className={cardActionBtnCls}
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => downloadFormFile(file)}
                  disabled={blocked}
                  title="Baixar"
                  aria-label={`Baixar ${file.name}`}
                  className={cardActionBtnCls}
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeAt(file.id)}
                  disabled={blocked}
                  title="Remover"
                  aria-label={`Remover ${file.name}`}
                  className={`${cardActionBtnCls} hover:bg-red-600`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
          {!disabled ? (
            <li>
              <label
                className={`flex h-full min-h-[7.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-500 transition-colors hover:border-gray-400 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900/40 dark:hover:bg-gray-800 ${
                  blocked ? 'pointer-events-none opacity-60' : ''
                }`}
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin text-red-600" />
                ) : (
                  <Plus className="h-5 w-5" />
                )}
                <span className="text-xs font-medium">{busy ? 'Gerando…' : 'Adicionar'}</span>
                <input
                  type="file"
                  multiple
                  accept={accept}
                  className="hidden"
                  disabled={blocked}
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

/** Prévia estática no builder (sem upload real). */
export function FormMultiFileFieldPreview({ mode }: { mode: 'attachment' | 'image' }) {
  const isImage = mode === 'image';
  return (
    <div
      className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 bg-white px-4 py-5 text-center dark:border-gray-600 dark:bg-gray-800"
      onClick={(e) => e.stopPropagation()}
    >
      {isImage ? (
        <ImagePlus className="h-7 w-7 text-gray-400 dark:text-gray-500" strokeWidth={1.4} />
      ) : (
        <Paperclip className="h-7 w-7 text-gray-400 dark:text-gray-500" strokeWidth={1.4} />
      )}
      <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
        {isImage ? 'Clique ou arraste imagens' : 'Clique ou arraste arquivos'}
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {isImage ? 'PNG, JPG, WEBP…' : 'PDF, DOC, planilhas, imagens…'}
      </span>
    </div>
  );
}
