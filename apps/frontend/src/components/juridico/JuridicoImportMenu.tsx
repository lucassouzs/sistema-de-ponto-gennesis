'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Paperclip, Receipt, Upload } from 'lucide-react';

export type JuridicoImportAction = 'full' | 'link-anexos' | 'link-comprovantes';

type Props = {
  onAction: (action: JuridicoImportAction) => void;
};

const ITEMS: Array<{
  id: JuridicoImportAction;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}> = [
  {
    id: 'full',
    label: 'Importar planilha',
    icon: FileSpreadsheet,
    iconClass: 'text-blue-600 dark:text-blue-400',
  },
  {
    id: 'link-anexos',
    label: 'Importar só anexos',
    icon: Paperclip,
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  {
    id: 'link-comprovantes',
    label: 'Vincular comprovantes',
    icon: Receipt,
    iconClass: 'text-emerald-600 dark:text-emerald-400',
  },
];

export function JuridicoImportMenu({ onAction }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const handleSelect = (action: JuridicoImportAction) => {
    setOpen(false);
    onAction(action);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        aria-label="Importar"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Importar"
      >
        <Upload className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-max overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
              onClick={() => handleSelect(item.id)}
            >
              <item.icon className={`h-4 w-4 shrink-0 ${item.iconClass}`} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
