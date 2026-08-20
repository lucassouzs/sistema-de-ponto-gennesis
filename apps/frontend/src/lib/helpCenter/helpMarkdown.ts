/** Markdown simples e seguro para tutoriais da Central de Ajuda. */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyInline(text: string): string {
  let s = escapeHtml(text);
  const slots: string[] = [];
  const park = (html: string) => {
    const i = slots.length;
    slots.push(html);
    return `\u0001${i}\u0001`;
  };

  s = s.replace(/`([^`]+)`/g, (_m, inner) =>
    park(`<code class="rounded bg-gray-100 px-1 py-0.5 text-[0.9em] dark:bg-gray-900">${inner}</code>`)
  );
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label, url) =>
    park(
      `<a href="${url}" target="_blank" rel="noopener noreferrer" class="font-medium text-red-600 underline underline-offset-2 dark:text-red-400">${label}</a>`
    )
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, inner) => park(`<strong>${inner}</strong>`));
  s = s.replace(/\*([^*\n]+)\*/g, (_m, inner) => park(`<em>${inner}</em>`));
  s = s.replace(/\u0001(\d+)\u0001/g, (_m, i) => slots[Number(i)] ?? '');
  return s;
}

export function helpMarkdownToHtml(md: string): string {
  if (!md.trim()) return '';

  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const parts: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeBuf: string[] = [];

  const closeLists = () => {
    if (inUl) {
      parts.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      parts.push('</ol>');
      inOl = false;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        parts.push(
          `<pre class="overflow-x-auto rounded-lg bg-gray-900 p-3 text-sm text-gray-100"><code>${escapeHtml(
            codeBuf.join('\n')
          )}</code></pre>`
        );
        codeBuf = [];
        inCode = false;
      } else {
        closeLists();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      const cls =
        level === 1
          ? 'text-xl font-bold text-gray-900 dark:text-gray-100'
          : level === 2
            ? 'text-lg font-semibold text-gray-900 dark:text-gray-100'
            : 'text-base font-semibold text-gray-900 dark:text-gray-100';
      parts.push(`<h${level} class="mt-4 mb-2 ${cls}">${applyInline(heading[2])}</h${level}>`);
      continue;
    }

    const ol = line.match(/^[ \t]*\d+\.\s+(.*)$/);
    if (ol) {
      if (inUl) {
        parts.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        parts.push('<ol class="my-2 list-decimal space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">');
        inOl = true;
      }
      parts.push(`<li>${applyInline(ol[1]) || '<br>'}</li>`);
      continue;
    }

    const ul = line.match(/^[ \t]*[-*•]\s+(.*)$/);
    if (ul) {
      if (inOl) {
        parts.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        parts.push('<ul class="my-2 list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">');
        inUl = true;
      }
      parts.push(`<li>${applyInline(ul[1]) || '<br>'}</li>`);
      continue;
    }

    closeLists();
    if (!line.trim()) {
      parts.push('<div class="h-2"></div>');
    } else {
      parts.push(
        `<p class="my-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">${applyInline(line)}</p>`
      );
    }
  }

  if (inCode) {
    parts.push(
      `<pre class="overflow-x-auto rounded-lg bg-gray-900 p-3 text-sm text-gray-100"><code>${escapeHtml(
        codeBuf.join('\n')
      )}</code></pre>`
    );
  }
  closeLists();
  return parts.join('');
}
