'use client';

import { useState } from 'react';
import { Banknote, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import { uploadOcBoletoFile } from './ocUploadBoleto';

type Props = {
  url: string;
  name: string;
  onChange: (next: { url: string; name: string }) => void;
  disabled?: boolean;
  inputId?: string;
  labelClassName?: string;
  /** Rótulo do campo (padrão: "Anexar boleto *"). */
  fieldLabel?: string;
};

export function OcBoletoCreationField({
  url,
  name,
  onChange,
  disabled,
  inputId = 'oc-boleto-file',
  labelClassName = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2',
  fieldLabel = 'Anexar boleto *'
}: Props) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const uploaded = await uploadOcBoletoFile(file);
      onChange({ url: uploaded.url, name: uploaded.originalName });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(err.response?.data?.message || err.message || 'Erro ao enviar boleto');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <span className={labelClassName}>{fieldLabel}</span>
      {url ? (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={absoluteUploadUrl(url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            <Banknote className="h-4 w-4 shrink-0" />
            {name.trim() || 'Boleto'}
          </a>
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => onChange({ url: '', name: '' })}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <X className="h-3.5 w-3.5" />
            Remover
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-950/60"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Enviando...
            </>
          ) : (
            <>
              <Banknote className="h-4 w-4 shrink-0" />
              Escolher arquivo
            </>
          )}
          <input
            id={inputId}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            disabled={disabled || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleFile(file);
            }}
          />
        </label>
      )}
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">PDF ou imagem (até 15 MB)</p>
    </div>
  );
}
