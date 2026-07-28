'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Video as VideoIcon,
  Upload,
  Download,
  Trash2,
  Loader2,
  ClipboardList,
  Settings2,
  Check,
} from 'lucide-react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Loading } from '@/components/ui/Loading';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import { downloadUploadFile } from '@/lib/downloadUploadFile';

type FieldType = 'text' | 'textarea' | 'sim_nao' | 'pills' | 'rating';

interface FollowUp {
  whenValue: string;
  type: 'text' | 'textarea' | 'pills';
  placeholder?: string;
  options?: string[];
}

interface Question {
  id: string;
  title: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  followUp?: FollowUp | null;
}

interface Section {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
}

interface Template {
  sections: Section[];
  updatedAt: string;
}

export interface ReuniaoAnexoInfo {
  key: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface ReuniaoAnswer {
  value: string | number | null;
  followUp?: string;
}

export interface ReuniaoData {
  identificacao: {
    data: string;
    responsavelPreenchimento: string;
    contrato: string;
  };
  answers: Record<string, ReuniaoAnswer>;
  ata: ReuniaoAnexoInfo | null;
  video: ReuniaoAnexoInfo | null;
}

export interface ReuniaoListPatch {
  data: string;
  responsavelPreenchimento: string;
  contrato: string;
  updatedAt: string;
}

const CONTRATO_OPTIONS = [
  'MRE', 'SES', 'FHE', 'ICMBIO', 'SEDES', 'SENAC', 'MINC', 'CONFEA',
  'TJGO CALDAS NOVAS', 'TJGO RIO VERDE', 'TJGO RETROFIT 01', 'TJGO RETROFIT 04 E 05',
  'UFG', 'SEMASH', 'UNB', 'HUB', 'BBGO', 'POLO', 'DF', 'GO',
];

const EMPTY_DATA: ReuniaoData = {
  identificacao: { data: '', responsavelPreenchimento: '', contrato: '' },
  answers: {},
  ata: null,
  video: null,
};

const inputClasse =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition ' +
  'placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 ' +
  'dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function matchContratoOption(contractName?: string): string {
  if (!contractName) return '';
  const upper = contractName.trim().toUpperCase();
  const exact = CONTRATO_OPTIONS.find((o) => o === upper || o.toUpperCase() === upper);
  if (exact) return exact;
  const partial = CONTRATO_OPTIONS.find(
    (o) => upper.includes(o.toUpperCase()) || o.toUpperCase().includes(upper)
  );
  return partial || '';
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-gray-200">
      {children}
      {required && <span className="ml-0.5 text-red-600 dark:text-red-400">*</span>}
    </label>
  );
}

function PillGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active ? '' : opt)}
            className={`inline-flex h-9 items-center rounded-lg border px-4 text-sm font-medium transition-colors ${
              active
                ? 'border-red-600 bg-red-600 text-white shadow-sm hover:bg-red-700'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function RatingPills({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(active ? null : n)}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition-colors ${
              active
                ? 'border-red-600 bg-red-600 text-white shadow-sm hover:bg-red-700'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {n}
          </button>
        );
      })}
      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">1 = nunca · 5 = sempre</span>
    </div>
  );
}

function QuestionField({
  question,
  index,
  answer,
  onChange,
}: {
  question: Question;
  index: number;
  answer: ReuniaoAnswer | undefined;
  onChange: (next: ReuniaoAnswer) => void;
}) {
  const value = answer?.value ?? (question.type === 'rating' ? null : '');
  const followUpValue = answer?.followUp || '';
  const options =
    question.options?.length
      ? question.options
      : question.type === 'sim_nao'
        ? ['SIM', 'NÃO']
        : [];

  const setValue = (v: string | number | null) => {
    onChange({ value: v, followUp: answer?.followUp });
  };

  const showFollowUp =
    !!question.followUp && String(value ?? '') === question.followUp.whenValue;

  return (
    <div className="space-y-2.5 border-t border-gray-100 pt-4 first:border-t-0 first:pt-0 dark:border-gray-700/70">
      <p className="text-sm font-semibold leading-snug text-gray-800 dark:text-gray-100">
        {index}. {question.title}
        {question.required && <span className="ml-0.5 text-red-600 dark:text-red-400">*</span>}
      </p>

      {(question.type === 'sim_nao' || question.type === 'pills') && (
        <PillGroup options={options} value={String(value ?? '')} onChange={setValue} />
      )}
      {question.type === 'rating' && (
        <RatingPills value={typeof value === 'number' ? value : null} onChange={setValue} />
      )}
      {question.type === 'text' && (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => setValue(e.target.value)}
          placeholder={question.placeholder}
          className={inputClasse}
        />
      )}
      {question.type === 'textarea' && (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => setValue(e.target.value)}
          placeholder={question.placeholder}
          rows={3}
          className={inputClasse + ' resize-none'}
        />
      )}
      {showFollowUp && question.followUp && (
        <div className="pl-1">
          {question.followUp.type === 'pills' ? (
            <PillGroup
              options={question.followUp.options || []}
              value={followUpValue}
              onChange={(v) => onChange({ value: answer?.value ?? '', followUp: v })}
            />
          ) : question.followUp.type === 'text' ? (
            <input
              type="text"
              value={followUpValue}
              onChange={(e) => onChange({ value: answer?.value ?? '', followUp: e.target.value })}
              placeholder={question.followUp.placeholder}
              className={inputClasse}
            />
          ) : (
            <textarea
              value={followUpValue}
              onChange={(e) => onChange({ value: answer?.value ?? '', followUp: e.target.value })}
              placeholder={question.followUp.placeholder}
              rows={2}
              className={inputClasse + ' resize-none'}
            />
          )}
        </div>
      )}
    </div>
  );
}

function AnexoUploadCard({
  tipo,
  titulo,
  descricao,
  icon,
  accept,
  anexo,
  isUploading,
  isDeleting,
  onSelectFile,
  onRemove,
}: {
  tipo: 'ata' | 'video';
  titulo: string;
  descricao: string;
  icon: React.ReactNode;
  accept: string;
  anexo: ReuniaoAnexoInfo | null;
  isUploading: boolean;
  isDeleting: boolean;
  onSelectFile: (file: File) => void;
  onRemove: () => void;
}) {
  const url = anexo?.url ? absoluteUploadUrl(anexo.url) : '';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/60">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 rounded-lg bg-gray-100 p-2.5 dark:bg-gray-700/60">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{titulo}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{descricao}</p>
        </div>
      </div>
      <div className="mt-3">
        {anexo ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{anexo.originalName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{formatBytes(anexo.size)}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    downloadUploadFile(anexo.url, anexo.originalName).catch(() =>
                      toast.error('Erro ao baixar arquivo.')
                    )
                  }
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
                  title="Baixar"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={isDeleting}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                  title="Remover"
                >
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {tipo === 'video' && url && (
              <video src={url} controls className="w-full rounded-lg border border-gray-200 dark:border-gray-700" />
            )}
          </div>
        ) : (
          <label
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 py-6 text-center text-sm font-medium text-gray-500 transition-colors hover:border-red-400/80 hover:text-red-700 dark:border-gray-600 dark:bg-gray-900/30 dark:text-gray-400 ${
              isUploading ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            {isUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
            {isUploading ? 'Enviando...' : 'Clique para enviar'}
            <input
              type="file"
              accept={accept}
              className="hidden"
              disabled={isUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onSelectFile(file);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  contractId: string;
  reuniaoId: string | null;
  /** Nome do contrato da página (ex.: SEDES) para pré-preencher */
  contractName?: string;
  /** Atualiza a linha na lista em tempo real */
  onListPatch?: (reuniaoId: string, patch: ReuniaoListPatch) => void;
};

export function ReuniaoFormModal({
  isOpen,
  onClose,
  contractId,
  reuniaoId,
  contractName,
  onListPatch,
}: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ReuniaoData>(EMPTY_DATA);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [uploadingTipo, setUploadingTipo] = useState<'ata' | 'video' | null>(null);
  const [deletingTipo, setDeletingTipo] = useState<'ata' | 'video' | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef(form);
  formRef.current = form;
  const seededRef = useRef(false);

  const { data: templateRes, isLoading: loadingTemplate } = useQuery({
    queryKey: ['reuniao-template'],
    queryFn: async () => (await api.get('/reunioes/template')).data,
    enabled: isOpen,
  });
  const template = templateRes?.data as Template | undefined;

  const { data: reuniaoResponse, isLoading: loadingReuniao } = useQuery({
    queryKey: ['reuniao', contractId, reuniaoId],
    queryFn: async () => (await api.get(`/reunioes/${contractId}/${reuniaoId}`)).data,
    enabled: isOpen && !!reuniaoId,
  });

  useEffect(() => {
    if (!isOpen) {
      setHydrated(false);
      seededRef.current = false;
      setForm(EMPTY_DATA);
      setSaveStatus('idle');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !reuniaoId) return;
    const d = reuniaoResponse?.data as ReuniaoData | undefined;
    if (!d) return;

    const matched = matchContratoOption(contractName);
    const needsSeed =
      !seededRef.current &&
      !d.identificacao?.contrato &&
      !d.identificacao?.data &&
      !d.identificacao?.responsavelPreenchimento;

    const next: ReuniaoData = {
      identificacao: {
        data: d.identificacao?.data || (needsSeed ? todayYmd() : ''),
        responsavelPreenchimento: d.identificacao?.responsavelPreenchimento || '',
        contrato: d.identificacao?.contrato || (needsSeed ? matched : ''),
      },
      answers: d.answers || {},
      ata: d.ata ?? null,
      video: d.video ?? null,
    };

    setForm(next);
    setHydrated(true);

    if (needsSeed && (next.identificacao.contrato || next.identificacao.data)) {
      seededRef.current = true;
      void api.put(`/reunioes/${contractId}/${reuniaoId}`, { data: next }).then(() => {
        onListPatch?.(reuniaoId, {
          data: next.identificacao.data,
          responsavelPreenchimento: next.identificacao.responsavelPreenchimento,
          contrato: next.identificacao.contrato,
          updatedAt: new Date().toISOString(),
        });
        queryClient.invalidateQueries({ queryKey: ['reunioes', contractId] });
      });
    }
  }, [reuniaoResponse, isOpen, reuniaoId, contractName, contractId, onListPatch, queryClient]);

  const persist = useCallback(
    async (data: ReuniaoData) => {
      if (!reuniaoId) return;
      setSaveStatus('saving');
      try {
        await api.put(`/reunioes/${contractId}/${reuniaoId}`, { data });
        setSaveStatus('saved');
        onListPatch?.(reuniaoId, {
          data: data.identificacao.data,
          responsavelPreenchimento: data.identificacao.responsavelPreenchimento,
          contrato: data.identificacao.contrato,
          updatedAt: new Date().toISOString(),
        });
        queryClient.invalidateQueries({ queryKey: ['reuniao', contractId, reuniaoId] });
        queryClient.invalidateQueries({ queryKey: ['reunioes', contractId] });
      } catch {
        setSaveStatus('error');
      }
    },
    [contractId, reuniaoId, onListPatch, queryClient]
  );

  const scheduleSave = useCallback(
    (data: ReuniaoData) => {
      if (!hydrated || !reuniaoId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveStatus('saving');
      saveTimer.current = setTimeout(() => {
        void persist(data);
      }, 500);
    },
    [hydrated, reuniaoId, persist]
  );

  const updateForm = (updater: (prev: ReuniaoData) => ReuniaoData) => {
    setForm((prev) => {
      const next = updater(prev);
      // Atualiza lista imediatamente nos campos de identificação
      if (reuniaoId) {
        onListPatch?.(reuniaoId, {
          data: next.identificacao.data,
          responsavelPreenchimento: next.identificacao.responsavelPreenchimento,
          contrato: next.identificacao.contrato,
          updatedAt: new Date().toISOString(),
        });
      }
      scheduleSave(next);
      return next;
    });
  };

  const handleClose = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      void persist(formRef.current);
    }
    onClose();
  };

  const uploadAnexo = async (tipo: 'ata' | 'video', file: File) => {
    if (!reuniaoId) return;
    setUploadingTipo(tipo);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/reunioes/${contractId}/${reuniaoId}/anexo/${tipo}`, formData, {
        timeout: 10 * 60 * 1000,
      });
      const anexo = res.data?.data as ReuniaoAnexoInfo;
      setForm((prev) => ({ ...prev, [tipo]: anexo }));
      toast.success(tipo === 'ata' ? 'Ata anexada!' : 'Vídeo anexado!');
      queryClient.invalidateQueries({ queryKey: ['reuniao', contractId, reuniaoId] });
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Erro ao enviar arquivo.');
    } finally {
      setUploadingTipo(null);
    }
  };

  const removeAnexo = async (tipo: 'ata' | 'video') => {
    if (!reuniaoId || !confirm('Remover este anexo?')) return;
    setDeletingTipo(tipo);
    try {
      await api.delete(`/reunioes/${contractId}/${reuniaoId}/anexo/${tipo}`);
      setForm((prev) => ({ ...prev, [tipo]: null }));
      toast.success('Anexo removido.');
    } catch {
      toast.error('Erro ao remover anexo.');
    } finally {
      setDeletingTipo(null);
    }
  };

  const loading = loadingTemplate || loadingReuniao || !hydrated;

  const statusLabel =
    saveStatus === 'saving'
      ? 'Salvando…'
      : saveStatus === 'saved'
        ? 'Salvo'
        : saveStatus === 'error'
          ? 'Erro ao salvar'
          : 'Preencha o formulário';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Formulário de reunião"
      size="5xl"
      contentOverflowVisible
      headerActions={
        <div className="mr-2 flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              saveStatus === 'error'
                ? 'text-red-600 dark:text-red-400'
                : saveStatus === 'saved'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {saveStatus === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saveStatus === 'saved' && <Check className="h-3.5 w-3.5" />}
            {statusLabel}
          </span>
          <Link
            href={`/ponto/contratos/${contractId}/reunioes/configurar`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Editar perguntas
          </Link>
        </div>
      }
    >
      {loading ? (
        <div className="py-16">
          <Loading message="Carregando formulário…" size="md" />
        </div>
      ) : (
        <div className="space-y-6 pb-2">
          {/* Identificação */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-900 dark:text-gray-100">
                Identificação
              </h4>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Data</FieldLabel>
                <DatePickerField
                  value={form.identificacao.data}
                  onChange={(v) =>
                    updateForm((prev) => ({
                      ...prev,
                      identificacao: { ...prev.identificacao, data: v },
                    }))
                  }
                  size="form"
                />
              </div>
              <div>
                <FieldLabel required>Responsável pelo preenchimento</FieldLabel>
                <input
                  type="text"
                  value={form.identificacao.responsavelPreenchimento}
                  onChange={(e) =>
                    updateForm((prev) => ({
                      ...prev,
                      identificacao: {
                        ...prev.identificacao,
                        responsavelPreenchimento: e.target.value,
                      },
                    }))
                  }
                  placeholder="Nome do responsável"
                  className={inputClasse}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Contrato</FieldLabel>
              <StringSingleSelectDropdown
                value={form.identificacao.contrato}
                onChange={(v) =>
                  updateForm((prev) => ({
                    ...prev,
                    identificacao: { ...prev.identificacao, contrato: v },
                  }))
                }
                options={CONTRATO_OPTIONS}
                placeholder="Selecionar contrato..."
                searchPlaceholder="Pesquisar contrato..."
                allowEmpty
                emptyOptionLabel="Nenhum"
              />
            </div>
          </section>

          {(template?.sections || []).map((section) => (
            <section key={section.id} className="space-y-4 border-t border-gray-100 pt-5 dark:border-gray-700">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-900 dark:text-gray-100">
                {section.title}
              </h4>
              {section.description ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm italic text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-300">
                  “{section.description}”
                </p>
              ) : null}
              {section.questions.map((q, idx) => (
                <QuestionField
                  key={q.id}
                  question={q}
                  index={idx + 1}
                  answer={form.answers[q.id]}
                  onChange={(ans) =>
                    updateForm((prev) => ({
                      ...prev,
                      answers: { ...prev.answers, [q.id]: ans },
                    }))
                  }
                />
              ))}
              {section.questions.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Nenhuma pergunta nesta seção.
                </p>
              )}
            </section>
          ))}

          <section className="space-y-4 border-t border-gray-100 pt-5 dark:border-gray-700">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-900 dark:text-gray-100">
              Anexos da reunião
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AnexoUploadCard
                tipo="ata"
                titulo="Ata da reunião"
                descricao="PDF ou Word."
                icon={<FileText className="h-5 w-5 text-gray-600 dark:text-gray-300" />}
                accept=".pdf,.doc,.docx"
                anexo={form.ata}
                isUploading={uploadingTipo === 'ata'}
                isDeleting={deletingTipo === 'ata'}
                onSelectFile={(f) => uploadAnexo('ata', f)}
                onRemove={() => removeAnexo('ata')}
              />
              <AnexoUploadCard
                tipo="video"
                titulo="Vídeo da reunião"
                descricao="MP4, MOV ou WEBM."
                icon={<VideoIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />}
                accept="video/*"
                anexo={form.video}
                isUploading={uploadingTipo === 'video'}
                isDeleting={deletingTipo === 'video'}
                onSelectFile={(f) => uploadAnexo('video', f)}
                onRemove={() => removeAnexo('video')}
              />
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
