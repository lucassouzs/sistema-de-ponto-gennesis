'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

function applyInlineMarkdown(text: string): string {
  let s = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Placeholders evitam conflito ** vs * e funcionam com espaços/Tab na frente
  const slots: string[] = [];
  const park = (html: string) => {
    const i = slots.length;
    slots.push(html);
    return `\u0001${i}\u0001`;
  };

  s = s.replace(/__([^_]+)__/g, (_m, inner) => park(`<u>${inner}</u>`));
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, inner) => park(`<strong>${inner}</strong>`));
  s = s.replace(/\*([^*\n]+)\*/g, (_m, inner) => park(`<em>${inner}</em>`));
  s = s.replace(/\u0001(\d+)\u0001/g, (_m, i) => slots[Number(i)] ?? '');
  return s;
}

/** Converte markdown simples (negrito + sublinhado + listas) em HTML para contentEditable. */
export function commentMarkdownToHtml(md: string): string {
  if (!md.trim()) return '';

  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const parts: string[] = [];
  let inList = false;

  for (const line of lines) {
    const bullet = line.match(/^[ \t]*[•\-]\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        parts.push('<ul>');
        inList = true;
      }
      parts.push(`<li>${applyInlineMarkdown(bullet[1]) || '<br>'}</li>`);
      continue;
    }
    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
    if (!line.trim()) {
      parts.push('<div><br></div>');
    } else {
      // Preserva indentação (Tab) com espaços não quebráveis no início
      const leading = line.match(/^[ \t]+/)?.[0] ?? '';
      const rest = line.slice(leading.length);
      const indentHtml = leading.replace(/ /g, '&nbsp;').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
      parts.push(`<div>${indentHtml}${applyInlineMarkdown(rest)}</div>`);
    }
  }
  if (inList) parts.push('</ul>');
  return parts.join('');
}

function isUnderlineElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'u' || tag === 'ins') return true;
  const styleAttr = el.getAttribute('style') || '';
  if (/text-decoration[^;]*underline/i.test(styleAttr)) return true;
  const deco = `${el.style?.textDecoration || ''} ${el.style?.textDecorationLine || ''}`.toLowerCase();
  return deco.includes('underline');
}

function isBoldElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'strong' || tag === 'b') return true;
  const weight = el.style?.fontWeight || '';
  if (weight === 'bold' || weight === '700' || Number(weight) >= 600) return true;
  const styleAttr = el.getAttribute('style') || '';
  return /font-weight\s*:\s*(bold|[6-9]00)/i.test(styleAttr);
}

function isItalicElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'em' || tag === 'i') return true;
  const styleAttr = el.getAttribute('style') || '';
  if (/font-style\s*:\s*italic/i.test(styleAttr)) return true;
  return (el.style?.fontStyle || '').toLowerCase() === 'italic';
}

type ActiveStyles = { bold: boolean; italic: boolean; underline: boolean };

/** Serializa o HTML do editor de volta para markdown compatível com preview/PDF. */
export function commentHtmlToMarkdown(root: HTMLElement): string {
  const blocks: string[] = [];

  // Processa filhos aplicando apenas os estilos que ESTE nível introduz
  // (evita duplicar marcadores quando o navegador aninha <i><i>, <b><span bold>, etc.).
  const walkChildren = (node: Node, active: ActiveStyles): string =>
    Array.from(node.childNodes)
      .map((child) => walkInline(child, active))
      .join('');

  const walkInline = (node: Node, active: ActiveStyles): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') return '';

    const nowBold = active.bold || isBoldElement(el);
    const nowItalic = active.italic || isItalicElement(el);
    const nowUnder = active.underline || isUnderlineElement(el);

    let out = walkChildren(el, {
      bold: nowBold,
      italic: nowItalic,
      underline: nowUnder,
    });
    if (!out) return '';

    // Envolve só o que for NOVO neste elemento
    if (!active.italic && nowItalic) out = `*${out}*`;
    if (!active.bold && nowBold) out = `**${out}**`;
    if (!active.underline && nowUnder) out = `__${out}__`;
    return out;
  };

  const pushParagraph = (text: string) => {
    blocks.push(text.replace(/\u00a0/g, ' ').replace(/\s+$/g, ''));
  };

  const base: ActiveStyles = { bold: false, italic: false, underline: false };

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').replace(/\u00a0/g, ' ');
      if (t) pushParagraph(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'ul' || tag === 'ol') {
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        const text = walkChildren(li, base).replace(/\u00a0/g, ' ').trimEnd();
        blocks.push(text ? `• ${text}` : '• ');
      }
      return;
    }

    if (tag === 'li') {
      const text = walkChildren(el, base).replace(/\u00a0/g, ' ').trimEnd();
      blocks.push(text ? `• ${text}` : '• ');
      return;
    }

    if (tag === 'div' || tag === 'p') {
      const onlyList =
        el.children.length === 1 &&
        ['ul', 'ol'].includes(el.children[0].tagName.toLowerCase());
      if (onlyList) {
        visit(el.children[0]);
        return;
      }
      const text = walkInline(el, base).replace(/\u00a0/g, ' ');
      if (!text.trim() && el.querySelector('br') && !(el.textContent ?? '').trim()) {
        blocks.push('');
      } else {
        pushParagraph(text);
      }
      return;
    }

    if (tag === 'br') {
      blocks.push('');
      return;
    }

    if (
      isUnderlineElement(el) ||
      isBoldElement(el) ||
      isItalicElement(el) ||
      tag === 'span'
    ) {
      pushParagraph(walkInline(el, base).replace(/\u00a0/g, ' '));
      return;
    }

    for (const child of Array.from(el.childNodes)) visit(child);
  };

  for (const child of Array.from(root.childNodes)) visit(child);

  while (blocks.length > 0 && blocks[blocks.length - 1] === '') blocks.pop();
  return blocks.join('\n');
}

function isEditorVisuallyEmpty(el: HTMLElement): boolean {
  const text = (el.textContent ?? '').replace(/\u00a0/g, ' ').trim();
  return !text;
}

/** Preview do comentário (fora do campo / resumo) — mesmo HTML do editor, sem mostrar ** ou __. */
export function LicitacaoCommentFormatted({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  const html = commentMarkdownToHtml(text);
  if (!html) return null;
  return (
    <div
      className={`leading-relaxed [&_b]:font-bold [&_em]:italic [&_i]:italic [&_li]:my-0.5 [&_strong]:font-bold [&_u]:underline [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 ${className}`}
      style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

/**
 * Editor de comentário com negrito (Ctrl+B), sublinhado (Ctrl+U), Tab e lista "-"+espaço.
 */
export function LicitacaoCommentEditor({
  value,
  onChange,
  disabled,
  placeholder = 'Comentário…',
  className = '',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef(value);
  const focusedRef = useRef(false);
  const [showPlaceholder, setShowPlaceholder] = useState(!value.trim());

  const syncPlaceholder = useCallback(() => {
    const el = ref.current;
    setShowPlaceholder(!el || isEditorVisuallyEmpty(el));
  }, []);

  const writeHtmlFromMarkdown = useCallback(
    (md: string) => {
      const el = ref.current;
      if (!el) return;
      el.innerHTML = commentMarkdownToHtml(md);
      syncPlaceholder();
    },
    [syncPlaceholder]
  );

  const emitFromDom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const md = commentHtmlToMarkdown(el);
    syncPlaceholder();
    if (md === lastEmittedRef.current) return;
    lastEmittedRef.current = md;
    onChange(md);
  }, [onChange, syncPlaceholder]);

  // Hidrata / normaliza quando não está focado (evita mostrar __cru__ no editor).
  useEffect(() => {
    const el = ref.current;
    if (!el || focusedRef.current) return;
    lastEmittedRef.current = value;
    writeHtmlFromMarkdown(value);
  }, [value, writeHtmlFromMarkdown]);

  const tryStartBulletFromHyphen = (): boolean => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;

    const text = node.textContent ?? '';
    const offset = range.startOffset;
    const before = text.slice(0, offset);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineBefore = before.slice(lineStart);
    if (!/^[ \t]*-$/.test(lineBefore)) return false;

    const indent = lineBefore.match(/^[ \t]*/)?.[0] ?? '';
    const newBefore = before.slice(0, lineStart) + `${indent}• `;
    node.textContent = newBefore + text.slice(offset);

    const pos = newBefore.length;
    const next = document.createRange();
    next.setStart(node, Math.min(pos, node.textContent?.length ?? pos));
    next.collapse(true);
    sel.removeAllRanges();
    sel.addRange(next);

    emitFromDom();
    return true;
  };

  const tryContinueBulletOnEnter = (): boolean => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return false;

    const text = node.textContent ?? '';
    const offset = range.startOffset;
    const before = text.slice(0, offset);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineBefore = before.slice(lineStart);
    const bulletMatch = lineBefore.match(/^([ \t]*)•\s?(.*)$/);
    if (!bulletMatch) return false;

    const [, indent, rest] = bulletMatch;
    if (!rest.trim()) {
      const newBefore = before.slice(0, lineStart);
      node.textContent = newBefore + '\n' + text.slice(offset);
      const pos = newBefore.length + 1;
      const next = document.createRange();
      next.setStart(node, Math.min(pos, node.textContent?.length ?? pos));
      next.collapse(true);
      sel.removeAllRanges();
      sel.addRange(next);
      emitFromDom();
      return true;
    }

    const newText = before + `\n${indent}• ` + text.slice(offset);
    node.textContent = newText;
    const pos = before.length + 1 + indent.length + 2;
    const next = document.createRange();
    next.setStart(node, Math.min(pos, node.textContent?.length ?? pos));
    next.collapse(true);
    sel.removeAllRanges();
    sel.addRange(next);
    emitFromDom();
    return true;
  };

  const tryOutdentCurrentLine = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;

    const text = node.textContent ?? '';
    const offset = range.startOffset;
    const before = text.slice(0, offset);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineBefore = before.slice(lineStart);
    const leading = lineBefore.match(/^[ \t]{1,4}/)?.[0];
    if (!leading) return;

    const removeLen = leading.length;
    node.textContent = text.slice(0, lineStart) + text.slice(lineStart + removeLen);
    const pos = Math.max(lineStart, offset - removeLen);
    const next = document.createRange();
    next.setStart(node, Math.min(pos, node.textContent?.length ?? pos));
    next.collapse(true);
    sel.removeAllRanges();
    sel.addRange(next);
    emitFromDom();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      e.preventDefault();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      document.execCommand('bold', false);
      emitFromDom();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      document.execCommand('underline', false);
      emitFromDom();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      document.execCommand('italic', false);
      emitFromDom();
      return;
    }

    if (e.key === ' ' && tryStartBulletFromHyphen()) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter' && tryContinueBulletOnEnter()) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        tryOutdentCurrentLine();
      } else {
        document.execCommand('insertText', false, '    ');
        emitFromDom();
      }
    }
  };

  return (
    <div className="relative">
      {showPlaceholder ? (
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 top-1.5 text-xs text-gray-400 dark:text-gray-500"
        >
          {placeholder}
        </span>
      ) : null}
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        aria-disabled={disabled || undefined}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          const el = ref.current;
          if (el) {
            const md = commentHtmlToMarkdown(el);
            lastEmittedRef.current = md;
            // Normaliza o DOM: <u>texto</u> em vez de __texto__ cru
            writeHtmlFromMarkdown(md);
            onChange(md);
          }
        }}
        onInput={emitFromDom}
        onKeyDown={onKeyDown}
        className={`min-h-[4.5rem] w-full overflow-auto rounded border border-gray-200 bg-white px-2 py-1.5 text-xs leading-relaxed text-gray-900 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 [&_b]:font-bold [&_em]:italic [&_i]:italic [&_li]:my-0.5 [&_strong]:font-bold [&_u]:underline [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 ${
          disabled ? 'cursor-not-allowed opacity-60' : ''
        } ${className}`}
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      />
    </div>
  );
}
