'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  QrCode,
  X,
  Upload,
  Trash2,
  FileText,
  Video,
  ExternalLink,
} from 'lucide-react';
import { Modal, useModalRequestClose } from '@/components/ui/Modal';
import { Loading } from '@/components/ui/Loading';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { DateTimePickerField } from '@/components/ui/DateTimePickerField';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { CheckboxIndicator } from '@/components/ui/Checkbox';
import { SignatureField, isBlankSignature } from '@/components/ui/SignatureField';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';
import {
  FormMultiFileField,
  isBlankFormFileValue,
} from '@/components/forms/FormMultiFileField';
import { FormStepsStepper } from '@/components/forms/FormStepsStepper';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import {
  normalizeFormSteps,
  resolveFieldWidth,
  type FormQuestion,
  type FormStep,
} from '@/components/forms/formStructureTypes';
import { fetchEmployeeSelectOptions } from '@/lib/employeeSelectOptions';
import { toPersonSelectOptions } from '@/lib/personSelectOptions';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { FormCurrencyField } from '@/components/forms/FormCurrencyField';
import { FormPercentField } from '@/components/forms/FormPercentField';
import { FormTableField } from '@/components/forms/FormTableField';
import { parseCurrencyInputBr } from '@/lib/maskCurrencyBr';
import { parsePercentInput } from '@/lib/maskPercent';
import {
  evaluateFormula,
  flattenFormQuestions,
  getNumericFieldValue,
  isQuestionReadOnly,
  questionHasFormula,
} from '@/lib/formFormula';
import { normalizeFormQuestion, type FormFieldFormulaResultFormat, type FormTableColumn } from '@/components/forms/formStructureTypes';
import { isTableAnswerEmpty, resolveTableColumns } from '@/lib/formTable';
import type { AcompanhamentoKind } from '@/lib/acompanhamentoTypes';

type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'valor'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'sim_nao'
  | 'dropdown'
  | 'checkbox'
  | 'checklist'
  | 'pills'
  | 'profiles'
  | 'rating'
  | 'slider'
  | 'attachment'
  | 'image'
  | 'table'
  | 'qrcode'
  | 'signature';

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
  width?: 'half' | 'full';
  readOnly?: boolean;
  formula?: {
    op: 'sum' | 'subtract' | 'multiply' | 'divide';
    sourceIds: string[];
    resultFormat?: FormFieldFormulaResultFormat;
  };
  tableColumns?: FormTableColumn[];
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
  formTemplate?: {
    id: string;
    name: string;
    description?: string;
    multiStepEnabled?: boolean;
    steps?: FormStep[];
    sections: Section[];
  } | null;
}

export interface ReuniaoListPatch {
  data: string;
  responsavelPreenchimento: string;
  nome: string;
  updatedAt: string;
  submittedAt?: string;
}

const EMPTY_DATA: ReuniaoData = {
  identificacao: { data: '', responsavelPreenchimento: '', nome: '' },
  answers: {},
  ata: null,
  video: null,
  formTemplate: null,
};

const inputClasse = `${FORM_FIELD_INPUT_CLS} h-10`;
const readOnlyInputCls =
  'cursor-not-allowed bg-gray-50 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300';

function formulaValuesEqual(current: unknown, computed: number | null): boolean {
  if (computed === null) {
    return current === null || current === undefined || current === '';
  }
  if (typeof current === 'number') return current === computed;
  return getNumericFieldValue(current) === computed;
}

function parseSliderBound(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
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

function isAnswerEmpty(question: Question, answer: ReuniaoAnswer | undefined): boolean {
  if (question.type === 'signature') {
    return isBlankSignature(typeof answer?.value === 'string' ? answer.value : '');
  }
  if (question.type === 'attachment' || question.type === 'image') {
    return isBlankFormFileValue(answer?.value);
  }
  if (question.type === 'rating') {
    return typeof answer?.value !== 'number' || answer.value < 1 || answer.value > 5;
  }
  if (question.type === 'checkbox') {
    return (
      answer?.value !== 'true' && answer?.value !== 'SIM' && answer?.value !== 1
    );
  }
  if (question.type === 'checklist') {
    const selected = String(answer?.value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return selected.length === 0;
  }
  if (question.type === 'valor') {
    const v = answer?.value;
    if (typeof v === 'number') return !Number.isFinite(v);
    if (v === null || v === undefined || v === '') return true;
    return parseCurrencyInputBr(String(v)) === null;
  }
  if (question.type === 'percent') {
    const v = answer?.value;
    if (typeof v === 'number') return !Number.isFinite(v);
    if (v === null || v === undefined || v === '') return true;
    return parsePercentInput(String(v)) === null;
  }
  if (questionHasFormula(question)) {
    const v = answer?.value;
    if (typeof v === 'number' && Number.isFinite(v)) return false;
    return true;
  }
  if (question.type === 'table') {
    return isTableAnswerEmpty(answer?.value, resolveTableColumns(question));
  }
  if (answer == null || answer.value === null || answer.value === undefined) {
    return true;
  }
  return String(answer.value).trim() === '';
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-2 block text-sm font-medium text-gray-800 dark:text-gray-200">
      <span className="break-words whitespace-pre-wrap">{children}</span>
      {required ? <span className="text-sm font-semibold text-red-600"> *</span> : null}
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
    <div className="flex gap-2 pt-1">
      {options.map((opt) => (
        <ButtonSeg
          key={opt}
          active={value === opt}
          onClick={() => onChange(value === opt ? '' : opt)}
          label={opt}
        />
      ))}
    </div>
  );
}

function SimNaoGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const opts =
    options.length >= 2 ? [options[0]!, options[1]!] : ['SIM', 'NÃO'];
  return (
    <div className="flex h-10 flex-wrap items-center gap-2">
      {opts.map((opt) => {
        const checked = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(checked ? '' : opt)}
            className="inline-flex items-center gap-2"
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                checked
                  ? 'border-red-600 dark:border-red-500'
                  : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
              }`}
            >
              {checked ? (
                <span className="h-3 w-3 rounded-full bg-red-600 dark:bg-red-500" />
              ) : null}
            </span>
            <span className="text-sm font-medium uppercase tracking-wide text-gray-800 dark:text-gray-200">
              {opt}
            </span>
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
    <div className="flex gap-2 pt-1">
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
    </div>
  );
}

function QuestionField({
  question,
  answer,
  allAnswers,
  onChange,
  profileOptions,
}: {
  question: Question;
  answer: ReuniaoAnswer | undefined;
  allAnswers: Record<string, ReuniaoAnswer>;
  onChange: (next: ReuniaoAnswer) => void;
  profileOptions: MultiSelectSearchOption[];
}) {
  const normalizedQuestion = normalizeFormQuestion(question as Parameters<typeof normalizeFormQuestion>[0]);
  const value = answer?.value ?? (normalizedQuestion.type === 'rating' ? null : '');
  const followUpValue = answer?.followUp || '';
  const hasFormula = questionHasFormula(normalizedQuestion);
  const computedValue =
    hasFormula && normalizedQuestion.formula
      ? evaluateFormula(normalizedQuestion.formula, allAnswers)
      : null;
  const options =
    normalizedQuestion.options?.length
      ? normalizedQuestion.options
      : normalizedQuestion.type === 'sim_nao'
        ? ['SIM', 'NÃO']
        : [];

  const setValue = (v: string | number | null) => {
    onChange({ value: v, followUp: answer?.followUp });
  };

  const showFollowUp =
    !!normalizedQuestion.followUp && String(value ?? '') === normalizedQuestion.followUp.whenValue;

  const sliderMinLabel = options[0] ?? '1';
  const sliderMaxLabel = options[1] ?? '10';
  const parsedMin = parseSliderBound(sliderMinLabel);
  const parsedMax = parseSliderBound(sliderMaxLabel);
  const numericSlider =
    parsedMin != null && parsedMax != null && parsedMax > parsedMin;
  const sliderMin = numericSlider ? parsedMin : 1;
  const sliderMax = numericSlider ? parsedMax : 10;
  const sliderValue =
    typeof value === 'number'
      ? value
      : Number(value) || Math.round((sliderMin + sliderMax) / 2);
  const sliderPct =
    sliderMax === sliderMin
      ? 0
      : ((sliderValue - sliderMin) / (sliderMax - sliderMin)) * 100;
  const thumbPx = 16;
  const sliderFill = `calc((100% - ${thumbPx}px) * ${sliderPct / 100} + ${thumbPx / 2}px)`;
  const locked = isQuestionReadOnly(normalizedQuestion);
  const displayValue = hasFormula ? computedValue : value;

  return (
    <div>
      <FieldLabel required={normalizedQuestion.required}>{normalizedQuestion.title}</FieldLabel>

      {normalizedQuestion.type === 'sim_nao' && (
        <SimNaoGroup options={options} value={String(value ?? '')} onChange={setValue} />
      )}
      {question.type === 'pills' && (
        <PillGroup options={options} value={String(value ?? '')} onChange={setValue} />
      )}
      {question.type === 'rating' && (
        <RatingPills value={typeof value === 'number' ? value : null} onChange={setValue} />
      )}
      {question.type === 'text' && (
        <input
          type="text"
          value={String(value ?? '')}
          readOnly={locked}
          disabled={locked}
          onChange={(e) => setValue(e.target.value)}
          placeholder={question.placeholder || 'Texto curto'}
          className={`${inputClasse} ${locked ? readOnlyInputCls : ''}`}
        />
      )}
      {question.type === 'textarea' && (
        <textarea
          value={String(value ?? '')}
          readOnly={locked}
          disabled={locked}
          onChange={(e) => setValue(e.target.value)}
          placeholder={question.placeholder || 'Texto longo'}
          rows={4}
          className={`${FORM_FIELD_TEXTAREA_CLS} min-h-[140px] ${locked ? readOnlyInputCls : ''}`}
        />
      )}
      {normalizedQuestion.type === 'number' && (
        <input
          type="number"
          value={displayValue === null || displayValue === undefined ? '' : String(displayValue)}
          readOnly={locked}
          disabled={locked}
          onChange={(e) => setValue(e.target.value)}
          placeholder={normalizedQuestion.placeholder || '0'}
          className={`${inputClasse} ${locked ? readOnlyInputCls : ''}`}
        />
      )}
      {normalizedQuestion.type === 'valor' && (
        <FormCurrencyField
          value={typeof displayValue === 'number' ? displayValue : null}
          onChange={(v) => setValue(v)}
          placeholder={normalizedQuestion.placeholder || 'R$ 0,00'}
          className={inputClasse}
          readOnly={locked}
        />
      )}
      {normalizedQuestion.type === 'percent' && (
        <FormPercentField
          value={
            typeof displayValue === 'number'
              ? displayValue
              : displayValue ?? null
          }
          onChange={(v) => setValue(v)}
          placeholder={normalizedQuestion.placeholder || '0%'}
          className={inputClasse}
          readOnly={locked}
        />
      )}
      {normalizedQuestion.type === 'date' && (
        <DatePickerField
          value={String(value ?? '')}
          onChange={(v) => setValue(v)}
          placeholder={question.placeholder || 'dd/mm/aaaa'}
          size="form"
          noFocusRing
        />
      )}
      {question.type === 'datetime' && (
        <DateTimePickerField
          value={String(value ?? '')}
          onChange={(v) => setValue(v)}
          placeholder={question.placeholder || 'dd/mm/aaaa hh:mm'}
          noFocusRing
        />
      )}
      {question.type === 'dropdown' && (
        <StringSingleSelectDropdown
          value={String(value ?? '')}
          onChange={(v) => setValue(v)}
          options={options}
          placeholder={question.placeholder || 'Selecionar…'}
          emptyOptionLabel={question.placeholder || 'Selecionar…'}
          emptyOptionsMessage="Nenhuma opção cadastrada neste campo."
          matchTriggerWidth
          disableSearch={options.length <= 8}
        />
      )}
      {question.type === 'profiles' && (
        <SingleSelectSearchDropdown
          value={String(value ?? '')}
          onChange={(v) => setValue(v)}
          options={profileOptions}
          placeholder={question.placeholder || 'Selecionar perfil…'}
          searchPlaceholder="Pesquisar por nome ou CPF…"
          emptyOptionLabel={question.placeholder || 'Selecionar perfil…'}
          emptyOptionsMessage="Nenhuma pessoa disponível."
          allowEmpty
          matchTriggerWidth
          noFocusRing
        />
      )}
      {question.type === 'checkbox' && (
        <label className="inline-flex cursor-pointer items-center space-x-3 pt-1">
          <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              checked={value === 'true' || value === 'SIM' || value === 1}
              onChange={(e) => setValue(e.target.checked ? 'true' : '')}
              className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
            />
            <CheckboxIndicator
              checked={value === 'true' || value === 'SIM' || value === 1}
            />
          </span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {options[0] || 'Aceito'}
          </span>
        </label>
      )}
      {question.type === 'checklist' && (
        <div className="space-y-2 pt-1">
          {options.map((opt) => {
            const selected = String(value ?? '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            const checked = selected.includes(opt);
            return (
              <label key={opt} className="flex cursor-pointer items-center space-x-3">
                <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selected, opt]
                        : selected.filter((x) => x !== opt);
                      setValue(next.join(', '));
                    }}
                    className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
                  />
                  <CheckboxIndicator checked={checked} />
                </span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {opt}
                </span>
              </label>
            );
          })}
        </div>
      )}
      {question.type === 'slider' && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-3">
            <div className="relative h-4 min-w-0 flex-1">
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-full rounded-full bg-red-600"
                  style={{ width: sliderFill }}
                />
              </div>
              <input
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={1}
                value={sliderValue}
                onChange={(e) => setValue(Number(e.target.value))}
                className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none bg-transparent accent-red-600 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-red-600 [&::-moz-range-track]:h-full [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-red-600"
                aria-label={question.title}
              />
            </div>
            {numericSlider ? (
              <span className="min-w-[1.5rem] shrink-0 text-right text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                {sliderValue}
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>{sliderMinLabel}</span>
            <span>{sliderMaxLabel}</span>
          </div>
        </div>
      )}
      {(question.type === 'attachment' || question.type === 'image') && (
        <FormMultiFileField
          mode={question.type}
          value={typeof value === 'string' ? value : ''}
          onChange={(v) => setValue(v)}
          placeholder={question.placeholder}
        />
      )}
      {question.type === 'table' && (
        <FormTableField
          columns={resolveTableColumns(question)}
          value={value}
          readOnly={locked}
          onChange={(v) => setValue(v)}
        />
      )}
      {question.type === 'qrcode' && (
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
            <QrCode className="h-6 w-6 text-gray-700 dark:text-gray-200" />
          </div>
          <input
            type="text"
            value={String(value ?? '')}
            onChange={(e) => setValue(e.target.value)}
            placeholder={question.placeholder || 'Código do QR…'}
            className={`min-w-0 flex-1 ${inputClasse}`}
          />
        </div>
      )}
      {question.type === 'signature' && (
        <SignatureField
          value={typeof value === 'string' ? value : ''}
          onChange={(v) => setValue(v)}
        />
      )}
      {showFollowUp && question.followUp && (
        <div className="mt-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-3 dark:border-gray-600 dark:bg-gray-900/40">
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
              onChange={(e) =>
                onChange({ value: answer?.value ?? '', followUp: e.target.value })
              }
              placeholder={question.followUp.placeholder}
              className={inputClasse}
            />
          ) : (
            <textarea
              value={followUpValue}
              onChange={(e) =>
                onChange({ value: answer?.value ?? '', followUp: e.target.value })
              }
              placeholder={question.followUp.placeholder}
              rows={2}
              className={`${FORM_FIELD_TEXTAREA_CLS} min-h-[3.5rem]`}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ReuniaoFormCloseButton() {
  const requestClose = useModalRequestClose();
  return (
    <button
      type="button"
      onClick={() => requestClose?.()}
      className="shrink-0 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
      aria-label="Fechar"
    >
      <X className="h-6 w-6" />
    </button>
  );
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  contractId: string;
  kind: AcompanhamentoKind;
  reuniaoId: string | null;
  /** Atualiza a linha na lista em tempo real */
  onListPatch?: (reuniaoId: string, patch: ReuniaoListPatch) => void;
};

function ReuniaoAnexosSection({
  contractId,
  kind,
  reuniaoId,
  ata,
  video,
  onAnexoChange,
}: {
  contractId: string;
  kind: AcompanhamentoKind;
  reuniaoId: string;
  ata: ReuniaoAnexoInfo | null;
  video: ReuniaoAnexoInfo | null;
  onAnexoChange: (tipo: 'ata' | 'video', value: ReuniaoAnexoInfo | null) => void;
}) {
  const [uploading, setUploading] = useState<'ata' | 'video' | null>(null);
  const ataInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const apiBase = `/reunioes/${contractId}/${kind}/${reuniaoId}`;

  const handleUpload = async (tipo: 'ata' | 'video', file: File) => {
    setUploading(tipo);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(`${apiBase}/anexo/${tipo}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onAnexoChange(tipo, res.data?.data ?? null);
      toast.success(tipo === 'ata' ? 'Ata enviada!' : 'Vídeo enviado!');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Erro ao enviar arquivo.';
      toast.error(msg);
    } finally {
      setUploading(null);
      if (tipo === 'ata' && ataInputRef.current) ataInputRef.current.value = '';
      if (tipo === 'video' && videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  const handleRemove = async (tipo: 'ata' | 'video') => {
    if (!confirm(`Remover ${tipo === 'ata' ? 'a ata' : 'o vídeo'} desta reunião?`)) return;
    setUploading(tipo);
    try {
      await api.delete(`${apiBase}/anexo/${tipo}`);
      onAnexoChange(tipo, null);
      toast.success('Anexo removido.');
    } catch {
      toast.error('Erro ao remover anexo.');
    } finally {
      setUploading(null);
    }
  };

  const renderAnexo = (tipo: 'ata' | 'video', info: ReuniaoAnexoInfo | null, label: string) => (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="mb-3 flex items-center gap-2">
        {tipo === 'ata' ? (
          <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        ) : (
          <Video className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        )}
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</h4>
      </div>
      {info?.url ? (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={info.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
          >
            <ExternalLink className="h-4 w-4" />
            {info.originalName || (tipo === 'ata' ? 'Ata' : 'Vídeo')}
          </a>
          <button
            type="button"
            onClick={() => void handleRemove(tipo)}
            disabled={uploading === tipo}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            <Trash2 className="h-4 w-4" />
            Remover
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (tipo === 'ata' ? ataInputRef : videoInputRef).current?.click()}
          disabled={uploading === tipo}
          className="inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {uploading === tipo ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Enviar {tipo === 'ata' ? 'ata (PDF/Word)' : 'vídeo'}
        </button>
      )}
    </div>
  );

  return (
    <section className="space-y-4 border-t border-gray-200 pt-6 dark:border-gray-700">
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Gravação da reunião
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Anexe a ata e o vídeo gravado nesta reunião quinzenal.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {renderAnexo('ata', ata, 'Ata da reunião')}
        {renderAnexo('video', video, 'Vídeo da reunião')}
      </div>
      <input
        ref={ataInputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload('ata', file);
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*,.mp4,.mov,.webm,.avi,.mkv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload('video', file);
        }}
      />
    </section>
  );
}

export function ReuniaoFormModal({
  isOpen,
  onClose,
  contractId,
  kind,
  reuniaoId,
  onListPatch,
}: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ReuniaoData>(EMPTY_DATA);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [activeFillStep, setActiveFillStep] = useState(0);
  const seededRef = useRef(false);
  const hydratedReuniaoIdRef = useRef<string | null>(null);

  const { data: templateRes, isLoading: loadingTemplate } = useQuery({
    queryKey: ['reuniao-template'],
    queryFn: async () => (await api.get('/reunioes/template')).data,
    enabled: isOpen && !form.formTemplate?.sections?.length,
  });

  const formTemplateId = form.formTemplate?.id || '';

  const { data: liveFormRes } = useQuery({
    queryKey: ['formulario-template', formTemplateId],
    queryFn: async () => (await api.get(`/formularios/${formTemplateId}`)).data,
    enabled: isOpen && !!formTemplateId,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-for-reuniao-form'],
    queryFn: fetchEmployeeSelectOptions,
    enabled: isOpen,
  });

  const profileSelectOptions = useMemo(
    () =>
      toPersonSelectOptions(
        employees.map((employee) => ({
          value: employee.name,
          name: employee.name,
          cpf: employee.cpf,
          profilePhotoUrl: employee.profilePhotoUrl,
        }))
      ),
    [employees]
  );

  const templateSections =
    form.formTemplate?.sections?.length
      ? form.formTemplate.sections
      : ((templateRes?.data as Template | undefined)?.sections ?? []);

  const apiBase = reuniaoId ? `/reunioes/${contractId}/${kind}/${reuniaoId}` : '';

  const { data: reuniaoResponse, isLoading: loadingReuniao } = useQuery({
    queryKey: ['reuniao', kind, contractId, reuniaoId],
    queryFn: async () => (await api.get(apiBase)).data,
    enabled: isOpen && !!reuniaoId,
  });

  useEffect(() => {
    if (!isOpen) {
      setHydrated(false);
      seededRef.current = false;
      hydratedReuniaoIdRef.current = null;
      setForm(EMPTY_DATA);
      setSaving(false);
      setActiveFillStep(0);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !reuniaoId) return;
    const d = reuniaoResponse?.data as ReuniaoData | undefined;
    if (!d) return;
    if (hydratedReuniaoIdRef.current === reuniaoId) return;
    hydratedReuniaoIdRef.current = reuniaoId;

    const needsSeed =
      !seededRef.current &&
      !pickNome(d.identificacao) &&
      !d.identificacao?.data &&
      !d.identificacao?.responsavelPreenchimento;

    const snapshot = d.formTemplate ?? null;
    const next: ReuniaoData = {
      identificacao: {
        data: d.identificacao?.data || (needsSeed ? todayYmd() : ''),
        responsavelPreenchimento: d.identificacao?.responsavelPreenchimento || '',
        nome: pickNome(d.identificacao),
      },
      answers: d.answers || {},
      ata: d.ata ?? null,
      video: d.video ?? null,
      formTemplate: snapshot,
    };

    setForm(next);
    setHydrated(true);

    if (needsSeed && next.identificacao.data) {
      seededRef.current = true;
    }
  }, [reuniaoResponse, isOpen, reuniaoId]);

  // Atualiza estrutura/opções do formulário a partir do template vivo (Lista, etc.)
  useEffect(() => {
    const tpl = liveFormRes?.data as
      | {
          name?: string;
          description?: string;
          multiStepEnabled?: boolean;
          sections?: Section[];
          steps?: FormStep[];
        }
      | undefined;
    if (!tpl?.sections?.length && !tpl?.steps?.length) return;

    setForm((prev) => {
      if (!prev.formTemplate) return prev;
      return {
        ...prev,
        formTemplate: {
          ...prev.formTemplate,
          name: tpl.name || prev.formTemplate.name,
          description:
            tpl.description !== undefined
              ? tpl.description
              : prev.formTemplate.description,
          multiStepEnabled:
            tpl.multiStepEnabled !== undefined
              ? tpl.multiStepEnabled
              : prev.formTemplate.multiStepEnabled,
          sections: tpl.sections || prev.formTemplate.sections,
          steps: tpl.steps || prev.formTemplate.steps,
        },
      };
    });
  }, [liveFormRes]);

  const persist = useCallback(
    async (data: ReuniaoData, opts?: { finalize?: boolean }) => {
      if (!reuniaoId) return false;
      setSaving(true);
      try {
        const now = new Date().toISOString();
        await api.put(apiBase, { data, finalize: Boolean(opts?.finalize) });
        onListPatch?.(reuniaoId, {
          data: data.identificacao.data,
          responsavelPreenchimento: data.identificacao.responsavelPreenchimento,
          nome: data.identificacao.nome,
          updatedAt: now,
          ...(opts?.finalize ? { submittedAt: now } : {}),
        });
        queryClient.invalidateQueries({ queryKey: ['reuniao', kind, contractId, reuniaoId] });
        queryClient.invalidateQueries({ queryKey: ['reunioes', kind, contractId] });
        if (opts?.finalize) {
          queryClient.invalidateQueries({ queryKey: [`reunioes-${kind}-overview`] });
        }
        return true;
      } catch {
        toast.error(kind === 'mensal' ? 'Erro ao salvar relatório.' : 'Erro ao salvar reunião.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [apiBase, contractId, kind, onListPatch, queryClient, reuniaoId]
  );

  const updateForm = (updater: (prev: ReuniaoData) => ReuniaoData) => {
    setForm((prev) => updater(prev));
  };

  const loading =
    (loadingTemplate && !form.formTemplate?.sections?.length) ||
    loadingReuniao ||
    !hydrated;

  const allSections = templateSections;
  const formSteps = useMemo(() => {
    if (form.formTemplate?.multiStepEnabled !== true) return [];
    return normalizeFormSteps({
      steps: form.formTemplate?.steps,
      sections: templateSections,
    });
  }, [form.formTemplate?.multiStepEnabled, form.formTemplate?.steps, templateSections]);
  const multiStep = formSteps.length > 1;
  const currentStep = formSteps[activeFillStep];
  const visibleSections = multiStep ? currentStep?.sections ?? [] : allSections;
  const formTitle = form.formTemplate?.name?.trim() || 'Formulário de reunião';
  const formDescription = form.formTemplate?.description?.trim() || '';

  const allTemplateQuestions = useMemo(() => {
    if (!form.formTemplate) return [] as Question[];
    return flattenFormQuestions({
      sections: templateSections,
      steps: formSteps,
    }) as Question[];
  }, [form.formTemplate, templateSections, formSteps]);

  useEffect(() => {
    if (!form.formTemplate) return;
    const formulaQuestions = allTemplateQuestions.filter((q) => questionHasFormula(q));
    if (!formulaQuestions.length) return;

    setForm((prev) => {
      let changed = false;
      const nextAnswers = { ...prev.answers };
      for (const q of formulaQuestions) {
        if (!q.formula) continue;
        const computed = evaluateFormula(q.formula, nextAnswers);
        const current = nextAnswers[q.id]?.value;
        if (!formulaValuesEqual(current, computed)) {
          nextAnswers[q.id] = { ...nextAnswers[q.id], value: computed };
          changed = true;
        }
      }
      if (!changed) return prev;
      return { ...prev, answers: nextAnswers };
    });
  }, [form.answers, form.formTemplate, allTemplateQuestions]);

  const validateSections = (
    sections: Section[],
    answers: Record<string, ReuniaoAnswer>
  ): string | null => {
    for (const section of sections) {
      for (const q of section.questions) {
        if (!q.required) continue;
        if (isAnswerEmpty(q, answers[q.id])) {
          return `Preencha: ${q.title}`;
        }
      }
    }
    return null;
  };

  const findFirstValidationError = (): { message: string; stepIndex: number } | null => {
    if (multiStep) {
      for (let i = 0; i < formSteps.length; i += 1) {
        const err = validateSections((formSteps[i]?.sections as Section[]) ?? [], form.answers);
        if (err) return { message: err, stepIndex: i };
      }
      return null;
    }

    const err = validateSections(allSections, form.answers);
    return err ? { message: err, stepIndex: 0 } : null;
  };

  const handleStepSelect = (targetIndex: number) => {
    if (targetIndex === activeFillStep) return;

    if (targetIndex < activeFillStep) {
      setActiveFillStep(targetIndex);
      return;
    }

    for (let i = activeFillStep; i < targetIndex; i += 1) {
      const err = validateSections((formSteps[i]?.sections as Section[]) ?? [], form.answers);
      if (err) {
        toast.error(err);
        setActiveFillStep(i);
        return;
      }
    }

    setActiveFillStep(targetIndex);
  };

  const handleNextStep = () => {
    const err = validateSections(
      (currentStep?.sections as Section[]) ?? [],
      form.answers
    );
    if (err) {
      toast.error(err);
      return;
    }
    setActiveFillStep((prev) => Math.min(prev + 1, formSteps.length - 1));
  };

  const handleFinish = async () => {
    const validation = findFirstValidationError();
    if (validation) {
      if (multiStep) setActiveFillStep(validation.stepIndex);
      toast.error(validation.message);
      return;
    }
    const ok = await persist(form, { finalize: true });
    if (!ok) return;
    toast.success(kind === 'mensal' ? 'Relatório salvo!' : 'Reunião salva!');
    onClose();
  };

  const renderSection = (section: Section) => (
    <section key={section.id} className="space-y-4">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-200">
          {section.title}
        </h4>
        {section.description ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{section.description}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {section.questions.map((q) => {
          const full = resolveFieldWidth(q as FormQuestion) === 'full';
          return (
            <div key={q.id} className={`min-w-0 ${full ? 'sm:col-span-2' : ''}`}>
              <QuestionField
                question={q}
                answer={form.answers[q.id]}
                allAnswers={form.answers}
                profileOptions={profileSelectOptions}
                onChange={(ans) =>
                  updateForm((prev) => ({
                    ...prev,
                    answers: { ...prev.answers, [q.id]: ans },
                  }))
                }
              />
            </div>
          );
        })}
        {section.questions.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 sm:col-span-2">
            Nenhuma pergunta nesta seção.
          </p>
        )}
      </div>
    </section>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      panelClassName="!max-w-[1500px] w-full"
      contentClassName="sm:p-8 lg:p-10"
      contentOverflowVisible
      confirmBeforeClose
      showCloseButton={false}
    >
      {loading ? (
        <div className="py-16">
          <Loading message="Carregando formulário…" size="md" />
        </div>
      ) : (
        <div className="space-y-8 pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
                {formTitle}
              </h2>
              {formDescription ? (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {formDescription}
                </p>
              ) : null}
            </div>
            <ReuniaoFormCloseButton />
          </div>

          <div className="space-y-8">
            {multiStep ? (
              <FormStepsStepper
                steps={formSteps.map((step, index) => ({
                  id: step.id,
                  label: step.title.trim() || `Etapa ${index + 1}`,
                }))}
                currentIndex={activeFillStep}
                mode="progress"
                onSelect={handleStepSelect}
              />
            ) : null}

            {visibleSections.length > 0 ? (
              visibleSections.map(renderSection)
            ) : (
              <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhuma pergunta neste formulário.
              </p>
            )}

            {kind === 'semanal' && reuniaoId ? (
              <ReuniaoAnexosSection
                contractId={contractId}
                kind={kind}
                reuniaoId={reuniaoId}
                ata={form.ata}
                video={form.video}
                onAnexoChange={(tipo, value) =>
                  updateForm((prev) => ({ ...prev, [tipo]: value }))
                }
              />
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-6 dark:border-gray-700">
            {multiStep && activeFillStep > 0 ? (
              <button
                type="button"
                onClick={() => setActiveFillStep((prev) => Math.max(prev - 1, 0))}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                Anterior
              </button>
            ) : null}
            {multiStep && activeFillStep < formSteps.length - 1 ? (
              <button
                type="button"
                onClick={handleNextStep}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                Próxima etapa
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleFinish()}
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
