'use client';

import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Paperclip, Plus, Receipt } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { JuridicoFileCard } from '@/components/juridico/JuridicoFileCard';
import api from '@/lib/api';
import type { JuridicoProcesso } from '@/data/juridico-processos-ativos';

type FileKind = 'anexos' | 'comprovantes';

type Props = {
  isOpen: boolean;
  processoId: string | null;
  processoLabel?: string;
  numeroProcesso?: string;
  onClose: () => void;
  /** Chamado após adicionar ou remover arquivos (ex.: atualizar a lista). */
  onChanged?: () => void;
};

export function JuridicoProcessoAnexosModal({
  isOpen,
  processoId,
  processoLabel,
  numeroProcesso: numeroProcessoProp,
  onClose,
  onChanged,
}: Props) {
  const queryClient = useQueryClient();
  const anexosInputRef = useRef<HTMLInputElement>(null);
  const comprovantesInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<FileKind | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const queryKey = ['juridico-processos', processoId, 'anexos-modal'] as const;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    enabled: isOpen && !!processoId,
    queryFn: async () => {
      const res = await api.get(`/juridico-processos/${processoId}`);
      return res.data?.data as JuridicoProcesso;
    },
  });

  const anexos = data?.anexos || [];
  const comprovantes = data?.comprovantes || [];
  const numeroProcesso =
    data?.numeroProcesso?.trim() || numeroProcessoProp?.trim() || '';
  const modalTitle = numeroProcesso
    ? `Processo ${numeroProcesso}`
    : processoLabel
      ? `Processo — ${processoLabel}`
      : 'Processo';

  const notifyChanged = () => {
    void queryClient.invalidateQueries({ queryKey: ['juridico-processos'] });
    onChanged?.();
  };

  const handleUpload = async (kind: FileKind, fileList: FileList | null) => {
    if (!processoId || !fileList?.length) return;
    const files = Array.from(fileList);
    setUploading(kind);
    try {
      const fd = new FormData();
      for (const file of files) fd.append('files', file);
      const res = await api.post(`/juridico-processos/${processoId}/${kind}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(res.data?.message || 'Arquivo(s) adicionado(s).');
      await refetch();
      notifyChanged();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Não foi possível enviar o(s) arquivo(s).';
      toast.error(message);
    } finally {
      setUploading(null);
      if (kind === 'anexos' && anexosInputRef.current) anexosInputRef.current.value = '';
      if (kind === 'comprovantes' && comprovantesInputRef.current) {
        comprovantesInputRef.current.value = '';
      }
    }
  };

  const handleRemove = async (kind: FileKind, fileId: string, fileName: string) => {
    if (!processoId) return;
    const label = kind === 'anexos' ? 'anexo' : 'comprovante';
    if (!window.confirm(`Remover o ${label} "${fileName}"?`)) return;

    setRemovingId(fileId);
    try {
      const res = await api.delete(`/juridico-processos/${processoId}/${kind}/${fileId}`);
      toast.success(res.data?.message || 'Arquivo removido.');
      await refetch();
      notifyChanged();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Não foi possível remover o arquivo.';
      toast.error(message);
    } finally {
      setRemovingId(null);
    }
  };

  const addBtnCls =
    'inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="2xl">
      <div className="space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando arquivos…
          </div>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-gray-600 dark:text-gray-300">
            {(error as { response?: { data?: { message?: string } } })?.response?.data
              ?.message || 'Não foi possível carregar os anexos.'}
          </p>
        ) : (
          <>
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Anexos / atas ({anexos.length})
                  </h3>
                </div>
                <button
                  type="button"
                  className={addBtnCls}
                  disabled={!!uploading || !processoId}
                  onClick={() => anexosInputRef.current?.click()}
                >
                  {uploading === 'anexos' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Adicionar
                </button>
                <input
                  ref={anexosInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.zip,image/*,application/pdf"
                  onChange={(e) => void handleUpload('anexos', e.target.files)}
                />
              </div>
              {!anexos.length ? (
                <p className="text-sm text-gray-500">Nenhum anexo vinculado.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {anexos.map((file) => (
                    <JuridicoFileCard
                      key={file.id}
                      file={file}
                      removing={removingId === file.id}
                      onRemove={() =>
                        void handleRemove('anexos', file.id, file.originalName)
                      }
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Comprovantes ({comprovantes.length})
                  </h3>
                </div>
                <button
                  type="button"
                  className={addBtnCls}
                  disabled={!!uploading || !processoId}
                  onClick={() => comprovantesInputRef.current?.click()}
                >
                  {uploading === 'comprovantes' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Adicionar
                </button>
                <input
                  ref={comprovantesInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.zip,image/*,application/pdf"
                  onChange={(e) => void handleUpload('comprovantes', e.target.files)}
                />
              </div>
              {!comprovantes.length ? (
                <p className="text-sm text-gray-500">Nenhum comprovante vinculado.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {comprovantes.map((file) => (
                    <JuridicoFileCard
                      key={file.id}
                      file={file}
                      extra={
                        file.dataPagamento ? `Pago em ${file.dataPagamento}` : undefined
                      }
                      removing={removingId === file.id}
                      onRemove={() =>
                        void handleRemove('comprovantes', file.id, file.originalName)
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
