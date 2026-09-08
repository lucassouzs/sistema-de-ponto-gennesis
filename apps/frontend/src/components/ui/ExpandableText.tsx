'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/** Texto longo com “Ver mais / Ver menos”, no padrão PNCP. */
export function ExpandableText({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const value = text?.trim() || '';

  useEffect(() => {
    setExpanded(false);
  }, [value]);

  useEffect(() => {
    const el = textRef.current;
    if (!el || !value) {
      setNeedsToggle(false);
      return;
    }
    if (expanded) return;
    setNeedsToggle(el.scrollHeight > el.clientHeight + 2);
  }, [value, expanded]);

  if (!value || value === '—') {
    return <p className="text-sm text-gray-500 dark:text-gray-400">—</p>;
  }

  return (
    <div
      className={`min-w-0 max-w-xl ${className ?? ''}`}
      onClick={(event) => event.stopPropagation()}
    >
      <p
        ref={textRef}
        className={`text-sm leading-relaxed text-gray-900 dark:text-gray-100 ${
          expanded ? '' : 'line-clamp-3'
        }`}
      >
        {value}
      </p>
      {needsToggle || expanded ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-red-600 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        >
          {expanded ? (
            <>
              Ver menos
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            </>
          ) : (
            <>
              Ver mais
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}
