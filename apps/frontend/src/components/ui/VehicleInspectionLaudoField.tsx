'use client';

import React, { useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';

type VehicleInspectionLaudoFieldProps = {
  value: string;
  fileName: string;
  onChange: (value: string, fileName: string) => void;
  disabled?: boolean;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler o laudo'));
    reader.readAsDataURL(file);
  });
}

export function VehicleInspectionLaudoField({
  value,
  fileName,
  onChange,
  disabled = false
}: VehicleInspectionLaudoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File | null | undefined) => {
    if (!file || disabled) return;
    setLoading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onChange(dataUrl, file.name);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled || loading}
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900">
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
            <FileText className="h-10 w-10 text-red-600 dark:text-red-400" />
            <p className="max-w-full truncate text-sm font-medium text-gray-900 dark:text-gray-100">
              {fileName || 'Laudo anexado'}
            </p>
          </div>
          {!disabled ? (
            <button
              type="button"
              onClick={() => onChange('', '')}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
              aria-label="Remover laudo"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => inputRef.current?.click()}
          className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white text-gray-500 transition-colors hover:border-red-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-red-500 dark:hover:text-red-400"
        >
          <FileText className="h-10 w-10" />
          <span className="text-sm font-medium">
            {loading ? 'Carregando laudo...' : 'Tocar para anexar o laudo (PDF)'}
          </span>
        </button>
      )}
    </div>
  );
}

export function isBlankInspectionLaudo(value: string): boolean {
  return !value || !value.startsWith('data:');
}
