'use client';

import React from 'react';

type MimeKind =
  | 'pdf'
  | 'sheet'
  | 'doc'
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'presentation'
  | 'zip'
  | 'file';

function extOf(name?: string): string {
  if (!name) return '';
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function resolveMimeKind(mimeType?: string, fileName?: string): MimeKind {
  const mime = (mimeType || '').toLowerCase();
  const ext = extOf(fileName);

  if (mime.includes('pdf') || ext === 'pdf') return 'pdf';
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    ['xls', 'xlsx', 'csv', 'ods', 'tsv'].includes(ext)
  ) {
    return 'sheet';
  }
  if (
    mime.includes('presentation') ||
    mime.includes('powerpoint') ||
    ['ppt', 'pptx', 'odp', 'key'].includes(ext)
  ) {
    return 'presentation';
  }
  if (
    mime.includes('word') ||
    mime.includes('officedocument.wordprocessingml') ||
    mime.includes('msword') ||
    ['doc', 'docx', 'odt', 'rtf'].includes(ext)
  ) {
    return 'doc';
  }
  if (
    mime.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic', 'tif', 'tiff'].includes(ext)
  ) {
    return 'image';
  }
  if (mime.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'wmv'].includes(ext)) {
    return 'video';
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
    return 'audio';
  }
  if (
    mime.includes('zip') ||
    mime.includes('rar') ||
    mime.includes('compressed') ||
    mime.includes('x-7z') ||
    ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)
  ) {
    return 'zip';
  }
  if (mime.startsWith('text/') || ['txt', 'md', 'json', 'xml', 'log'].includes(ext)) {
    return 'text';
  }
  return 'file';
}

/** Silhueta de documento (canto dobrado) — base dos ícones estilo Drive. */
function DocShell({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden>
      <path
        fill="currentColor"
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
      />
      <path fill="#fff" fillOpacity="0.28" d="M14 2v6h6" />
      {children}
    </svg>
  );
}

function PdfGlyph() {
  return (
    <DocShell>
      <text
        x="12"
        y="17.5"
        textAnchor="middle"
        fill="#fff"
        fontSize="6.5"
        fontWeight="800"
        fontFamily="Arial,Helvetica,sans-serif"
        letterSpacing="-0.3"
      >
        PDF
      </text>
    </DocShell>
  );
}

function SheetGlyph() {
  return (
    <DocShell>
      <g fill="none" stroke="#fff" strokeWidth="1.1">
        <rect x="6.5" y="11" width="11" height="8" rx="0.8" />
        <path d="M6.5 13.5h11M6.5 16h11M10.2 11v8M13.8 11v8" />
      </g>
    </DocShell>
  );
}

function DocGlyph() {
  return (
    <DocShell>
      <g stroke="#fff" strokeWidth="1.55" strokeLinecap="round">
        <path d="M7.2 12.2h9.6" />
        <path d="M7.2 15h9.6" />
        <path d="M7.2 17.8h6.5" />
      </g>
    </DocShell>
  );
}

function ImageGlyph() {
  return (
    <DocShell>
      <circle cx="9" cy="12.2" r="1.4" fill="#fff" />
      <path fill="#fff" d="M6.8 19h10.4l-3.3-4.4-2.2 2.6-1.5-1.8L6.8 19z" />
    </DocShell>
  );
}

function VideoGlyph() {
  return (
    <DocShell>
      <path fill="#fff" d="M9.5 12v6.5l5.8-3.25L9.5 12z" />
    </DocShell>
  );
}

function AudioGlyph() {
  return (
    <DocShell>
      <path
        fill="#fff"
        d="M10.5 11.2v5.2a1.6 1.6 0 1 1-1.15-1.53V12.8l5.2-1.15v3.4a1.6 1.6 0 1 1-1.15-1.53v-2.8l-4.05.98z"
      />
    </DocShell>
  );
}

function TextGlyph() {
  return (
    <DocShell>
      <g stroke="#fff" strokeWidth="1.4" strokeLinecap="round">
        <path d="M7.2 12h9.6" />
        <path d="M7.2 14.5h9.6" />
        <path d="M7.2 17h7" />
      </g>
    </DocShell>
  );
}

function PresentationGlyph() {
  return (
    <DocShell>
      <rect x="6.8" y="11.2" width="10.4" height="6.8" rx="0.7" fill="#fff" fillOpacity="0.95" />
      <path fill="currentColor" fillOpacity="0.85" d="M8 16.8h3V13.2H8zm4.2 0H15.2v-2H12.2z" />
    </DocShell>
  );
}

function ZipGlyph() {
  return (
    <DocShell>
      <g fill="#fff">
        <rect x="10.6" y="10.2" width="2.8" height="1.8" rx="0.25" />
        <rect x="10.6" y="12.5" width="2.8" height="1.8" rx="0.25" />
        <rect x="10.6" y="14.8" width="2.8" height="1.8" rx="0.25" />
        <rect x="9.4" y="17" width="5.2" height="2.2" rx="0.4" />
      </g>
    </DocShell>
  );
}

function FileGlyph() {
  return (
    <DocShell>
      <g stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.9">
        <path d="M7.5 13h9" />
        <path d="M7.5 15.8h6" />
      </g>
    </DocShell>
  );
}

const KIND_META: Record<MimeKind, { color: string; Glyph: React.FC }> = {
  pdf: { color: 'text-[#EA4335]', Glyph: PdfGlyph },
  sheet: { color: 'text-[#0F9D58]', Glyph: SheetGlyph },
  doc: { color: 'text-[#4285F4]', Glyph: DocGlyph },
  image: { color: 'text-[#EA4335]', Glyph: ImageGlyph },
  video: { color: 'text-[#A142F4]', Glyph: VideoGlyph },
  audio: { color: 'text-[#F9AB00]', Glyph: AudioGlyph },
  text: { color: 'text-[#4285F4]', Glyph: TextGlyph },
  presentation: { color: 'text-[#F4B400]', Glyph: PresentationGlyph },
  zip: { color: 'text-[#5F6368]', Glyph: ZipGlyph },
  file: { color: 'text-[#5F6368]', Glyph: FileGlyph },
};

interface DriveMimeIconProps {
  mimeType?: string;
  fileName?: string;
  /** Classes de tamanho do ícone (ex.: h-5 w-5). */
  className?: string;
  title?: string;
}

/** Ícone de tipo de arquivo no visual do Google Drive. */
export function DriveMimeIcon({
  mimeType,
  fileName,
  className = 'h-5 w-5',
  title,
}: DriveMimeIconProps) {
  const kind = resolveMimeKind(mimeType, fileName);
  const { color, Glyph } = KIND_META[kind];
  return (
    <span className={`inline-flex shrink-0 ${color} ${className}`} title={title}>
      <Glyph />
    </span>
  );
}
