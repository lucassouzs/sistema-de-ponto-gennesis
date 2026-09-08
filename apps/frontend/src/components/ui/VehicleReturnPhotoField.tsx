'use client';

import React, { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a foto'));
    reader.readAsDataURL(file);
  });
}

type VehicleReturnPhotoFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
  photoAlt?: string;
};

const emptyPhotoButtonClassName =
  'flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white text-gray-500 transition-colors hover:border-red-400 hover:bg-red-50/40 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-red-500 dark:hover:bg-red-950/20 dark:hover:text-red-400';

export function VehicleReturnPhotoField({
  value,
  onChange,
  disabled = false,
  emptyLabel = 'Tocar para fotografar o veículo',
  photoAlt = 'Foto do veículo',
}: VehicleReturnPhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File | null | undefined) => {
    if (!file || disabled) return;
    setLoading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onChange(dataUrl);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabled || loading}
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={photoAlt} className="mx-auto max-h-48 w-full object-contain" />
          {!disabled ? (
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
              aria-label="Remover foto"
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
          className={emptyPhotoButtonClassName}
        >
          <Camera className="h-8 w-8" />
          <span className="text-sm font-medium">
            {loading ? 'Carregando foto...' : emptyLabel}
          </span>
        </button>
      )}
    </div>
  );
}

export function isBlankVehiclePhoto(value: string): boolean {
  return !value || !value.startsWith('data:image/');
}
