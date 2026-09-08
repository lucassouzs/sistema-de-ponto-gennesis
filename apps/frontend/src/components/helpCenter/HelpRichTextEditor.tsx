'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import {
  Bold,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Underline,
} from 'lucide-react';

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

function ToolbarButton({
  label,
  onMouseDown,
  children,
}: {
  label: string;
  onMouseDown: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => {
        e.preventDefault();
        onMouseDown();
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100"
    >
      {children}
    </button>
  );
}

export function HelpRichTextEditor({
  value,
  onChange,
  placeholder = 'Comece a escrever…',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if ((el.innerHTML || '') === (value || '')) return;
    el.innerHTML = value || '';
    lastHtmlRef.current = value || '';
  }, [value]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const html = el.innerHTML;
    if (html === lastHtmlRef.current) return;
    lastHtmlRef.current = html;
    onChange(html);
  }, [onChange]);

  const run = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const insertLink = () => {
    const url = window.prompt('URL do link');
    if (!url?.trim()) return;
    run('createLink', url.trim());
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-900/50">
        <ToolbarButton label="Negrito" onMouseDown={() => run('bold')}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Itálico" onMouseDown={() => run('italic')}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Sublinhado" onMouseDown={() => run('underline')}>
          <Underline className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />
        <ToolbarButton label="Título 1" onMouseDown={() => run('formatBlock', 'h1')}>
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Título 2" onMouseDown={() => run('formatBlock', 'h2')}>
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Parágrafo" onMouseDown={() => run('formatBlock', 'p')}>
          <span className="text-xs font-semibold">P</span>
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />
        <ToolbarButton label="Lista" onMouseDown={() => run('insertUnorderedList')}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Lista numerada" onMouseDown={() => run('insertOrderedList')}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Link" onMouseDown={insertLink}>
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <div className="relative">
        {!value || value === '<br>' || value === '<div><br></div>' ? (
          <div className="pointer-events-none absolute left-3 top-3 text-sm text-gray-400">
            {placeholder}
          </div>
        ) : null}
        <div
          ref={ref}
          contentEditable
          role="textbox"
          aria-multiline
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          className="min-h-[220px] max-h-[420px] overflow-y-auto bg-white px-3 py-3 text-sm leading-relaxed text-gray-900 outline-none dark:bg-gray-800 dark:text-gray-100 [&_a]:text-red-600 [&_a]:underline dark:[&_a]:text-red-400 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
        />
      </div>
    </div>
  );
}
