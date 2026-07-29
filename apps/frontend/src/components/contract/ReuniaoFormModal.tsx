'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Video as VideoIcon,
  Upload,
  Download,
  Trash2,
  Loader2,
  Settings2,
  Check,
  ChevronLeft,
  ChevronRight,
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
    nome: string;
  };
  answers: Record<string, ReuniaoAnswer>;
  ata: ReuniaoAnexoInfo | null;
  video: ReuniaoAnexoInfo | null;
}

export interface ReuniaoListPatch {
  data: string;
  responsavelPreenchimento: string;
  nome: string;
  updatedAt: string;
}

const EMPTY_DATA: ReuniaoData = {
  identificacao: { data: '', responsavelPreenchimento: '', nome: '' },
  answers: {},
  ata: null,
  video: null,
};

const inputClasse =
  'w-full rounded-lg border border-gray-200 bg-gray-50/80 px-3.5 py-2.5 text-sm text-gray-900 transition ' +
  'placeholder:text-gray-400 focus:border-red-500/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/15 ' +
  'dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:bg-gray-900';

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

function pickNome(identificacao?: { nome?: string; contrato?: string } | null): string {
  if (!identificacao) return '';
  return identificacao.nome || identificacao.contrato || '';
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
      {children}
      {required && <span className="ml-0.5 normal-case tracking-normal text-red-500">*</span>}
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
  const normalize = (s: string) =>
    s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const isBinary =
    options.length === 2 && options.every((o) => ['SIM', 'NAO'].includes(normalize(o)));

  if (isBinary) {
    return (
      <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100/80 p-1 dark:border-gray-600 dark:bg-gray-900/60">
        {options.map((opt) => {
          const active = value === opt;
          const isSim = normalize(opt) === 'SIM';
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(active ? '' : opt)}
              className={`min-w-[4.5rem] rounded-md px-4 py-2 text-sm font-semibold transition-all ${
                active
                  ? isSim
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-red-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active ? '' : opt)}
            className={`inline-flex h-9 items-center rounded-lg border px-3.5 text-sm font-medium transition-all ${
              active
                ? 'border-red-500/80 bg-red-50 text-red-700 shadow-sm dark:border-red-400/50 dark:bg-red-950/40 dark:text-red-300'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
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
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-semibold transition-all ${
              active
                ? 'border-red-500 bg-red-600 text-white shadow-sm'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            {n}
          </button>
        );
      })}
      <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">1 = nunca · 5 = sempre</span>
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
    <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-gray-700/80 dark:bg-gray-800/40">
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
          {index}
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm font-medium leading-snug text-gray-800 dark:text-gray-100">
            {question.title}
            {question.required && <span className="ml-0.5 text-red-500">*</span>}
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
              placeholder={question.placeholder || 'Digite aqui...'}
              className={inputClasse}
            />
          )}
          {question.type === 'textarea' && (
            <textarea
              value={String(value ?? '')}
              onChange={(e) => setValue(e.target.value)}
              placeholder={question.placeholder || 'Digite aqui...'}
              rows={2}
              className={inputClasse + ' min-h-[4.5rem] resize-y'}
            />
          )}
          {showFollowUp && question.followUp && (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-3 dark:border-gray-600 dark:bg-gray-900/40">
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
                  className={inputClasse + ' min-h-[3.5rem] resize-y'}
                />
              )}
            </div>
          )}
        </div>
      </div>
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
  /** Atualiza a linha na lista em tempo real */
  onListPatch?: (reuniaoId: string, patch: ReuniaoListPatch) => void;
};

export function ReuniaoFormModal({
  isOpen,
  onClose,
  contractId,
  reuniaoId,
  onListPatch,
}: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ReuniaoData>(EMPTY_DATA);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [uploadingTipo, setUploadingTipo] = useState<'ata' | 'video' | null>(null);
  const [deletingTipo, setDeletingTipo] = useState<'ata' | 'video' | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(1);
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

  const { data: employeesData } = useQuery({
    queryKey: ['reuniao-employee-options'],
    queryFn: async () => {
      const res = await api.get('/users', {
        params: { page: 1, limit: 10000, status: 'all' },
      });
      return res.data;
    },
    enabled: isOpen,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const employeeNameOptions = useMemo(() => {
    const list = Array.isArray(employeesData?.data) ? employeesData.data : [];
    return list
      .map((u: { name?: string; employee?: { id?: string; position?: string } }) => {
        const name = String(u.name || '').trim();
        if (!name || !u.employee?.id) return '';
        if (u.employee.position === 'Administrador') return '';
        if (name.localeCompare('Administrador', 'pt-BR', { sensitivity: 'accent' }) === 0) return '';
        return name;
      })
      .filter(Boolean)
      .sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'));
  }, [employeesData]);

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
      setStep(1);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !reuniaoId) return;
    const d = reuniaoResponse?.data as ReuniaoData | undefined;
    if (!d) return;

    const needsSeed =
      !seededRef.current &&
      !pickNome(d.identificacao) &&
      !d.identificacao?.data &&
      !d.identificacao?.responsavelPreenchimento;

    const next: ReuniaoData = {
      identificacao: {
        data: d.identificacao?.data || (needsSeed ? todayYmd() : ''),
        responsavelPreenchimento: d.identificacao?.responsavelPreenchimento || '',
        nome: pickNome(d.identificacao),
      },
      answers: d.answers || {},
      ata: d.ata ?? null,
      video: d.video ?? null,
    };

    setForm(next);
    setHydrated(true);

    if (needsSeed && next.identificacao.data) {
      seededRef.current = true;
      void api.put(`/reunioes/${contractId}/${reuniaoId}`, { data: next }).then(() => {
        onListPatch?.(reuniaoId, {
          data: next.identificacao.data,
          responsavelPreenchimento: next.identificacao.responsavelPreenchimento,
          nome: next.identificacao.nome,
          updatedAt: new Date().toISOString(),
        });
        queryClient.invalidateQueries({ queryKey: ['reunioes', contractId] });
      });
    }
  }, [reuniaoResponse, isOpen, reuniaoId, contractId, onListPatch, queryClient]);

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
          nome: data.identificacao.nome,
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
          nome: next.identificacao.nome,
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

  const allSections = template?.sections || [];
  const stepSections = useMemo(() => {
    // Distribui seções dinâmicas em 3 etapas:
    // 1ª etapa: identificação + 1ª seção
    // 2ª etapa: seções do meio
    // 3ª etapa: seções restantes + anexos
    if (allSections.length === 0) return [[], [], []] as Section[][];
    if (allSections.length === 1) return [[allSections[0]], [], []] as Section[][];
    if (allSections.length === 2) return [[allSections[0]], [allSections[1]], []] as Section[][];
    const first = [allSections[0]];
    const middle = allSections.slice(1, -1);
    const last = [allSections[allSections.length - 1]];
    return [first, middle, last] as Section[][];
  }, [allSections]);

  const STEP_LABELS = ['Identificação', 'Gestão', 'Finalização'] as const;

  const statusLabel =
    saveStatus === 'saving'
      ? 'Salvando…'
      : saveStatus === 'saved'
        ? 'Salvo'
        : saveStatus === 'error'
          ? 'Erro ao salvar'
          : `Etapa ${step} de 3`;

  const validateStep = (current: number): string | null => {
    if (current === 1) {
      if (!form.identificacao.nome.trim()) {
        return 'Informe o título.';
      }
      if (!form.identificacao.responsavelPreenchimento.trim()) {
        return 'Selecione o responsável pelo preenchimento.';
      }
    }
    const sections = stepSections[current - 1] || [];
    for (const section of sections) {
      for (const q of section.questions) {
        if (!q.required) continue;
        const ans = form.answers[q.id];
        const empty =
          ans == null ||
          ans.value === null ||
          ans.value === undefined ||
          String(ans.value).trim() === '';
        if (empty) return `Preencha: ${q.title}`;
      }
    }
    return null;
  };

  const goNext = () => {
    const error = validateStep(step);
    if (error) {
      toast.error(error);
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const handleFinish = () => {
    const error = validateStep(3);
    if (error) {
      toast.error(error);
      return;
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      void persist(formRef.current);
    }
    toast.success('Reunião finalizada!');
    onClose();
  };

  const renderSection = (section: Section) => (
    <section key={section.id} className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="h-4 w-1 rounded-full bg-red-500/80" aria-hidden />
        <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
          {section.title}
        </h4>
      </div>
      {section.description ? (
        <blockquote className="relative overflow-hidden rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-orange-50/50 px-4 py-3 dark:border-amber-800/40 dark:from-amber-950/30 dark:to-orange-950/20">
          <span
            aria-hidden
            className="pointer-events-none absolute -left-1 -top-3 select-none text-5xl font-serif leading-none text-amber-300/60 dark:text-amber-600/40"
          >
            “
          </span>
          <p className="relative pl-3 text-sm italic leading-relaxed text-amber-900/90 dark:text-amber-200/90">
            {section.description}
          </p>
        </blockquote>
      ) : null}
      <div className="space-y-2.5">
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
          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma pergunta nesta seção.</p>
        )}
      </div>
    </section>
  );

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
          {/* Indicador de etapas */}
          <nav aria-label="Etapas do formulário" className="px-1 pt-1">
            <ol className="relative flex items-start justify-between">
              {/* Linha de fundo */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-[16.66%] right-[16.66%] top-4 h-[2px] rounded-full bg-gray-200 dark:bg-gray-700"
              />
              {/* Linha de progresso */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-[16.66%] top-4 h-[2px] rounded-full bg-red-500 transition-all duration-300 ease-out dark:bg-red-400"
                style={{ width: `${((step - 1) / 2) * (100 - 33.32)}%` }}
              />

              {[1, 2, 3].map((n) => {
                const active = step === n;
                const done = step > n;
                return (
                  <li key={n} className="relative z-[1] flex w-1/3 flex-col items-center gap-2">
                    <button
                      type="button"
                      aria-current={active ? 'step' : undefined}
                      aria-label={`Etapa ${n}: ${STEP_LABELS[n - 1]}`}
                      onClick={() => {
                        if (n < step) setStep(n);
                        else if (n > step) {
                          for (let s = step; s < n; s++) {
                            const err = validateStep(s);
                            if (err) {
                              toast.error(err);
                              return;
                            }
                          }
                          setStep(n);
                        }
                      }}
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-200 ${
                        active
                          ? 'scale-110 bg-red-600 text-white shadow-md shadow-red-600/30 ring-4 ring-red-500/20 dark:bg-red-500 dark:shadow-red-500/25 dark:ring-red-400/20'
                          : done
                            ? 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400'
                            : 'border-2 border-gray-300 bg-white text-gray-400 hover:border-gray-400 hover:text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500 dark:hover:border-gray-500 dark:hover:text-gray-300'
                      }`}
                    >
                      {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : n}
                    </button>
                    <span
                      className={`text-center text-[11px] font-medium leading-tight tracking-wide transition-colors sm:text-xs ${
                        active
                          ? 'text-red-600 dark:text-red-400'
                          : done
                            ? 'text-gray-700 dark:text-gray-300'
                            : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {STEP_LABELS[n - 1]}
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>

          {step === 1 && (
            <>
              <section className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-4 w-1 rounded-full bg-red-500/80" aria-hidden />
                  <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                    Identificação
                  </h4>
                </div>
                <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-gray-700/80 dark:bg-gray-800/40">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <FieldLabel required>Título</FieldLabel>
                      <input
                        type="text"
                        value={form.identificacao.nome}
                        onChange={(e) =>
                          updateForm((prev) => ({
                            ...prev,
                            identificacao: { ...prev.identificacao, nome: e.target.value },
                          }))
                        }
                        placeholder="Ex.: Acompanhamento semanal, Kick-off, Revisão de cronograma…"
                        className={inputClasse}
                      />
                    </div>
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
                      <StringSingleSelectDropdown
                        value={form.identificacao.responsavelPreenchimento}
                        onChange={(v) =>
                          updateForm((prev) => ({
                            ...prev,
                            identificacao: {
                              ...prev.identificacao,
                              responsavelPreenchimento: v,
                            },
                          }))
                        }
                        options={
                          form.identificacao.responsavelPreenchimento &&
                          !employeeNameOptions.includes(form.identificacao.responsavelPreenchimento)
                            ? [form.identificacao.responsavelPreenchimento, ...employeeNameOptions]
                            : employeeNameOptions
                        }
                        placeholder="Selecionar funcionário..."
                        searchPlaceholder="Pesquisar funcionário..."
                        emptyOptionsMessage="Nenhum funcionário encontrado."
                        emptySearchMessage="Nenhum funcionário para esta pesquisa."
                        allowEmpty
                        emptyOptionLabel="Nenhum"
                      />
                    </div>
                  </div>
                </div>
              </section>
              {stepSections[0].map(renderSection)}
            </>
          )}

          {step === 2 && (
            <>
              {stepSections[1].length > 0 ? (
                stepSections[1].map(renderSection)
              ) : (
                <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Nenhuma pergunta nesta etapa.
                </p>
              )}
            </>
          )}

          {step === 3 && (
            <>
              {stepSections[2].map(renderSection)}
              <section className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-4 w-1 rounded-full bg-red-500/80" aria-hidden />
                  <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                    Anexos da reunião
                  </h4>
                </div>
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
            </>
          )}

          {/* Navegação das etapas */}
          <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 1}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </button>
            {step < 3 ? (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                Avançar
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                <Check className="h-4 w-4" />
                Finalizar
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
