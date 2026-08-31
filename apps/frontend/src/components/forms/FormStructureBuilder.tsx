'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  Asterisk,
  Calculator,
  Calendar,
  CalendarClock,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns,
  DollarSign,
  Hash,
  Image as ImageIcon,
  LayoutGrid,
  LayoutList,
  Layers,
  ListChecks,
  ListFilter,
  Lock,
  Maximize2,
  Minimize2,
  Paperclip,
  PenLine,
  Percent,
  Plus,
  QrCode,
  Search,
  SlidersHorizontal,
  Star,
  Table2,
  ToggleLeft,
  Trash2,
  Type,
  UserRound,
  X,
} from 'lucide-react';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import { Button } from '@/components/ui/Button';
import { CheckboxIndicator } from '@/components/ui/Checkbox';
import { Modal } from '@/components/ui/Modal';
import { SignatureField } from '@/components/ui/SignatureField';
import {
  FormMultiFileFieldPreview,
} from '@/components/forms/FormMultiFileField';
import { FormStepsStepper } from '@/components/forms/FormStepsStepper';
import { FormFormulaModal } from '@/components/forms/FormFormulaModal';
import {
  FormTableColumnsModal,
  tableColumnsToSavePayload,
} from '@/components/forms/FormTableColumnsModal';
import { FormTableFieldPreview } from '@/components/forms/FormTableField';
import { describeFormula, isFormulaCapableFieldType, questionHasFormula } from '@/lib/formFormula';
import { defaultTableColumn, resolveTableColumns, syncTableColumnTitles } from '@/lib/formTable';
import {
  FORM_FIELD_TYPE_LABELS,
  FORM_FIELD_TYPES_WITH_OPTIONS,
  defaultFieldWidth,
  formFieldOptionsModalCopy,
  resolveFieldWidth,
  type FormFieldType,
  type FormFieldWidth,
  type FormTableColumn,
  type FormQuestion,
  type FormSection,
  type FormStep,
  formUid,
  newFormQuestion,
  newFormSection,
  newFormStep,
} from '@/components/forms/formStructureTypes';

type PaletteAction =
  | { kind: 'section'; label: string; Icon: typeof Type }
  | { kind: 'step'; label: string; Icon: typeof Type }
  | { kind: 'field'; type: FormFieldType; label: string; Icon: typeof Type };

type PaletteGroup = {
  title: string;
  items: PaletteAction[];
};

const PALETTE_GROUPS: PaletteGroup[] = [
  {
    title: 'Layout',
    items: [
      { kind: 'step', label: 'Etapas', Icon: Layers },
      { kind: 'section', label: 'Seções', Icon: LayoutList },
      { kind: 'field', type: 'table', label: 'Tabelas', Icon: Table2 },
    ],
  },
  {
    title: 'Texto',
    items: [
      { kind: 'field', type: 'text', label: 'Texto curto', Icon: Type },
      { kind: 'field', type: 'textarea', label: 'Texto longo', Icon: AlignLeft },
      { kind: 'field', type: 'number', label: 'Número', Icon: Hash },
      { kind: 'field', type: 'valor', label: 'Valor', Icon: DollarSign },
      { kind: 'field', type: 'percent', label: 'Porcentagem', Icon: Percent },
    ],
  },
  {
    title: 'Data',
    items: [
      { kind: 'field', type: 'date', label: 'Data', Icon: Calendar },
      { kind: 'field', type: 'datetime', label: 'Data e hora', Icon: CalendarClock },
    ],
  },
  {
    title: 'Multi',
    items: [
      { kind: 'field', type: 'sim_nao', label: 'Sim / Não', Icon: ToggleLeft },
      { kind: 'field', type: 'dropdown', label: 'Lista', Icon: ListFilter },
      { kind: 'field', type: 'checkbox', label: 'Checkbox', Icon: CheckSquare },
      { kind: 'field', type: 'checklist', label: 'Checklist', Icon: ListChecks },
      { kind: 'field', type: 'profiles', label: 'Perfis', Icon: UserRound },
      { kind: 'field', type: 'pills', label: 'Botões', Icon: LayoutGrid },
      { kind: 'field', type: 'rating', label: 'Nota 1 a 5', Icon: Star },
    ],
  },
  {
    title: 'Mídia',
    items: [
      { kind: 'field', type: 'attachment', label: 'Anexos', Icon: Paperclip },
      { kind: 'field', type: 'image', label: 'Imagem', Icon: ImageIcon },
      { kind: 'field', type: 'slider', label: 'Deslizante', Icon: SlidersHorizontal },
      { kind: 'field', type: 'qrcode', label: 'QR Code', Icon: QrCode },
      { kind: 'field', type: 'signature', label: 'Assinatura', Icon: PenLine },
    ],
  },
];

const FORM_DND_MIME = 'application/x-form-palette';

type Props = {
  name: string;
  description: string;
  multiStepEnabled: boolean;
  steps: FormStep[];
  sections: FormSection[];
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onStructureChange: (patch: {
    multiStepEnabled?: boolean;
    steps?: FormStep[];
    sections?: FormSection[];
  }) => void;
  footer?: React.ReactNode;
};

const fieldToolbarBtn =
  'inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200';
const fieldToolbarIcon = 'h-3.5 w-3.5';

function QuestionFieldTitleRow({
  question,
  sectionId,
  fieldWidth,
  hasOptionsModal,
  autoFocusTitle,
  updateQuestion,
  removeQuestion,
  setFormulaModal,
  setOptionsModal,
  setTableColumnsModal,
  typeMenuOpen,
  onTypeMenuOpenChange,
}: {
  question: FormQuestion;
  sectionId: string;
  fieldWidth: 'half' | 'full';
  hasOptionsModal: boolean;
  autoFocusTitle?: boolean;
  updateQuestion: (
    sectionId: string,
    questionId: string,
    patch: Partial<FormQuestion>
  ) => void;
  removeQuestion: (sectionId: string, questionId: string) => void;
  setFormulaModal: (value: { sectionId: string; questionId: string }) => void;
  setOptionsModal: (value: { sectionId: string; questionId: string }) => void;
  setTableColumnsModal: (value: { sectionId: string; questionId: string }) => void;
  typeMenuOpen: boolean;
  onTypeMenuOpenChange: (open: boolean) => void;
}) {
  return (
    <div data-field-title className="mb-3 flex min-w-0 items-start gap-1">
      <div className="min-w-0 flex-1">
        <QuestionTitleInput
          value={question.title}
          onChange={(title) => updateQuestion(sectionId, question.id, { title })}
          required={question.required}
          autoEdit={autoFocusTitle}
        />
      </div>
      <div
        data-field-toolbar
        className={`shrink-0 transition-opacity ${
          typeMenuOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inline-flex w-max items-center gap-1">
        <QuestionFieldTypeMenu
          question={question}
          sectionId={sectionId}
          updateQuestion={updateQuestion}
          open={typeMenuOpen}
          onOpenChange={onTypeMenuOpenChange}
        />
        {hasOptionsModal || question.type === 'table' ? (
          <button
            type="button"
            title={
              question.type === 'table' ? 'Editar colunas' : 'Gerenciar opções'
            }
            onClick={() => {
              if (question.type === 'table') {
                setTableColumnsModal({
                  sectionId,
                  questionId: question.id,
                });
                return;
              }
              setOptionsModal({
                sectionId,
                questionId: question.id,
              });
            }}
            className={fieldToolbarBtn}
          >
            {question.type === 'table' ? (
              <Columns className={fieldToolbarIcon} />
            ) : (
              <ListFilter className={fieldToolbarIcon} />
            )}
          </button>
        ) : null}
        {isFormulaCapableFieldType(question.type) ? (
          <button
            type="button"
            title={
              questionHasFormula(question)
                ? 'Editar fórmula'
                : 'Configurar fórmula'
            }
            onClick={() =>
              setFormulaModal({
                sectionId,
                questionId: question.id,
              })
            }
            className={`${fieldToolbarBtn} ${
              questionHasFormula(question)
                ? '!bg-indigo-600 !text-white hover:!bg-indigo-600 hover:!text-white'
                : ''
            }`}
          >
            <Calculator className={fieldToolbarIcon} />
          </button>
        ) : null}
        <button
          type="button"
          title={
            question.required ? 'Remover obrigatória' : 'Marcar como obrigatória'
          }
          onClick={() =>
            updateQuestion(sectionId, question.id, {
              required: !question.required,
            })
          }
          className={`${fieldToolbarBtn} ${
            question.required
              ? '!bg-red-600 !text-white hover:!bg-red-600 hover:!text-white'
              : ''
          }`}
        >
          <Asterisk className={fieldToolbarIcon} />
        </button>
        <button
          type="button"
          title={
            question.readOnly || questionHasFormula(question)
              ? questionHasFormula(question)
                ? 'Campo calculado por fórmula'
                : 'Permitir edição'
              : 'Somente leitura (não editável)'
          }
          disabled={questionHasFormula(question)}
          onClick={() =>
            updateQuestion(sectionId, question.id, {
              readOnly: !question.readOnly,
            })
          }
          className={`${fieldToolbarBtn} ${
            question.readOnly || questionHasFormula(question)
              ? '!bg-gray-700 !text-white hover:!bg-gray-700 hover:!text-white dark:!bg-gray-200 dark:!text-gray-900 dark:hover:!bg-gray-200 dark:hover:!text-gray-900'
              : ''
          } ${questionHasFormula(question) ? 'opacity-80' : ''}`}
        >
          <Lock className={fieldToolbarIcon} />
        </button>
        <button
          type="button"
          title={
            fieldWidth === 'full'
              ? 'Largura total — clique para 50%'
              : 'Meia largura — clique para 100%'
          }
          onClick={() =>
            updateQuestion(sectionId, question.id, {
              width: fieldWidth === 'half' ? 'full' : 'half',
            })
          }
          className={fieldToolbarBtn}
        >
          {fieldWidth === 'full' ? (
            <Minimize2 className={fieldToolbarIcon} />
          ) : (
            <Maximize2 className={fieldToolbarIcon} />
          )}
        </button>
        <button
          type="button"
          title="Remover campo"
          onClick={() => removeQuestion(sectionId, question.id)}
          className={`${fieldToolbarBtn} hover:!bg-red-50 hover:!text-red-600 dark:hover:!bg-red-950/30`}
        >
          <Trash2 className={fieldToolbarIcon} />
        </button>
        </div>
      </div>
    </div>
  );
}

function QuestionTitleInput({
  value,
  onChange,
  required,
  autoEdit = false,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoEdit?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);

  const startEditing = useCallback((e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    setEditing(true);
  }, []);

  const stopEditing = useCallback(() => {
    const trimmed = value.trimEnd();
    if (trimmed !== value) onChange(trimmed);
    setEditing(false);
  }, [onChange, value]);

  const didFocusRef = useRef(false);

  useEffect(() => {
    if (!autoEdit) return;
    setEditing(true);
  }, [autoEdit]);

  useEffect(() => {
    if (!editing) {
      didFocusRef.current = false;
      return;
    }
    if (didFocusRef.current) return;
    didFocusRef.current = true;
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (autoEdit) el.select();
    else el.setSelectionRange(value.length, value.length);
  }, [editing, autoEdit, value.length]);

  const mirrorContent = value ? (
    <>
      {value}
      {required ? ' *' : ''}
    </>
  ) : (
    'Pergunta'
  );

  return (
    <div className="relative min-w-0">
      <div
        aria-hidden
        className="pointer-events-none invisible whitespace-pre-wrap break-normal text-sm font-medium leading-snug select-none"
      >
        {mirrorContent}
      </div>
      {!editing ? (
        <div
          role="textbox"
          tabIndex={0}
          onClick={startEditing}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              startEditing(e);
            }
          }}
          className="absolute inset-0 cursor-text overflow-hidden text-sm font-medium leading-snug text-gray-800 outline-none dark:text-gray-200"
        >
          {value ? (
            <>
              <span className="whitespace-pre-wrap break-normal">{value}</span>
              {required ? (
                <span className="font-semibold text-red-600"> *</span>
              ) : null}
            </>
          ) : (
            <span className="text-gray-400 dark:text-gray-500">Pergunta</span>
          )}
        </div>
      ) : (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={stopEditing}
          onClick={(e) => e.stopPropagation()}
          placeholder="Pergunta"
          className="absolute inset-0 m-0 box-border w-full min-h-0 resize-none border-0 bg-transparent p-0 text-sm font-medium leading-snug text-gray-800 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-200"
        />
      )}
    </div>
  );
}

function questionDefaults(type: FormFieldType): Partial<FormQuestion> {
  const width = defaultFieldWidth(type);
  if (type === 'sim_nao') {
    return { type, options: ['SIM', 'NÃO'], title: 'Nova pergunta', width };
  }
  if (type === 'dropdown' || type === 'checklist' || type === 'pills') {
    return {
      type,
      options: ['Opção 1', 'Opção 2'],
      title: 'Nova pergunta',
      ...(type === 'dropdown' ? { placeholder: 'Selecionar…' } : {}),
      width,
    };
  }
  if (type === 'checkbox') {
    return { type, title: 'Nova pergunta', options: ['Aceito'], width };
  }
  if (type === 'rating') return { type, title: 'Nova pergunta', width };
  if (type === 'slider') {
    return { type, title: 'Nova pergunta', options: ['1', '10'], width };
  }
  if (type === 'text' || type === 'number') {
    return { type, title: 'Nova pergunta', placeholder: '', width };
  }
  if (type === 'valor') {
    return { type, title: 'Nova pergunta', placeholder: 'R$ 0,00', width };
  }
  if (type === 'percent') {
    return { type, title: 'Nova pergunta', placeholder: '0%', width };
  }
  if (type === 'profiles') {
    return { type, title: 'Nova pergunta', placeholder: 'Selecionar perfil…', width };
  }
  if (type === 'date') {
    return { type, title: 'Nova pergunta', placeholder: 'dd/mm/aaaa', width };
  }
  if (type === 'datetime') {
    return { type, title: 'Nova pergunta', placeholder: 'dd/mm/aaaa hh:mm', width };
  }
  if (type === 'attachment') {
    return { type, title: 'Anexos', placeholder: 'Clique ou arraste arquivos', width };
  }
  if (type === 'image') {
    return { type, title: 'Imagem', placeholder: 'Clique ou arraste imagens', width };
  }
  if (type === 'table') {
    const tableColumns = [
      defaultTableColumn('Coluna 1'),
      defaultTableColumn('Coluna 2'),
    ];
    return {
      type,
      title: 'Tabela',
      tableColumns,
      options: syncTableColumnTitles(tableColumns),
      width,
    };
  }
  if (type === 'qrcode') {
    return { type, title: 'QR Code', placeholder: 'Código lido do QR', width };
  }
  if (type === 'signature') {
    return { type, title: 'Assinatura', placeholder: 'Assine aqui', width };
  }
  return { type, title: 'Nova pergunta', width };
}

function patchQuestionType(
  question: FormQuestion,
  nextType: FormFieldType,
): Partial<FormQuestion> {
  if (question.type === nextType) return {};

  const defaults = questionDefaults(nextType);
  const patch: Partial<FormQuestion> = {
    type: nextType,
    width: question.width ?? defaults.width,
    placeholder: defaults.placeholder,
    formula: undefined,
    followUp: null,
    tableColumns: undefined,
    options: undefined,
  };

  if (nextType === 'sim_nao') {
    patch.options = ['SIM', 'NÃO'];
  } else if (nextType === 'dropdown' || nextType === 'checklist' || nextType === 'pills') {
    const keepOptions =
      !!question.options?.length &&
      question.type !== 'table' &&
      !['sim_nao', 'checkbox', 'slider'].includes(question.type);
    patch.options = keepOptions ? question.options : defaults.options;
    if (nextType === 'dropdown') {
      patch.placeholder = 'Selecionar…';
    }
  } else if (nextType === 'checkbox') {
    patch.options = ['Aceito'];
  } else if (nextType === 'slider') {
    patch.options = ['1', '10'];
  } else if (nextType === 'table') {
    patch.tableColumns = defaults.tableColumns;
    patch.options = defaults.options;
  }

  if (questionHasFormula(question)) {
    patch.readOnly = false;
  }

  return patch;
}

const FIELD_TYPE_SWITCH_ITEMS = PALETTE_GROUPS.flatMap((group) =>
  group.items.filter(
    (item): item is Extract<PaletteAction, { kind: 'field' }> => item.kind === 'field',
  ),
);

function QuestionFieldTypeMenu({
  question,
  sectionId,
  updateQuestion,
  open,
  onOpenChange,
}: {
  question: FormQuestion;
  sectionId: string;
  updateQuestion: (
    sectionId: string,
    questionId: string,
    patch: Partial<FormQuestion>,
  ) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const currentItem =
    FIELD_TYPE_SWITCH_ITEMS.find((item) => item.type === question.type) ??
    FIELD_TYPE_SWITCH_ITEMS[0]!;
  const CurrentIcon = currentItem.Icon;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };
    const onScroll = () => onOpenChange(false);
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title={`Tipo: ${FORM_FIELD_TYPE_LABELS[question.type]} — clique para alterar`}
        onClick={() => onOpenChange(!open)}
        className={`${fieldToolbarBtn} ${open ? '!bg-gray-100 !text-gray-800 dark:!bg-gray-700 dark:!text-gray-100' : ''}`}
      >
        <CurrentIcon className={fieldToolbarIcon} />
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800">
          <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Tipo do campo
          </p>
          {PALETTE_GROUPS.map((group) => {
            const fields = group.items.filter(
              (item): item is Extract<PaletteAction, { kind: 'field' }> =>
                item.kind === 'field',
            );
            if (!fields.length) return null;
            return (
              <div
                key={group.title}
                className="border-t border-gray-100 first:border-t-0 dark:border-gray-700"
              >
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {group.title}
                </p>
                {fields.map((item) => {
                  const Icon = item.Icon;
                  const selected = question.type === item.type;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => {
                        updateQuestion(
                          sectionId,
                          question.id,
                          patchQuestionType(question, item.type),
                        );
                        onOpenChange(false);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                        selected
                          ? 'bg-red-50 font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300'
                          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function FormStructureBuilder({
  name,
  description,
  multiStepEnabled,
  steps,
  sections: flatSections,
  onNameChange,
  onDescriptionChange,
  onStructureChange,
  footer,
}: Props) {
  const [search, setSearch] = useState('');
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ sectionId: string; questionId: string } | null>(
    null
  );
  const [dragging, setDragging] = useState(false);
  const [dragKind, setDragKind] = useState<'section' | 'step' | 'field' | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [optionsModal, setOptionsModal] = useState<{
    sectionId: string;
    questionId: string;
  } | null>(null);
  const [formulaModal, setFormulaModal] = useState<{
    sectionId: string;
    questionId: string;
  } | null>(null);
  const [tableColumnsModal, setTableColumnsModal] = useState<{
    sectionId: string;
    questionId: string;
  } | null>(null);
  const [typeMenuQuestionId, setTypeMenuQuestionId] = useState<string | null>(null);
  const [optionsDraft, setOptionsDraft] = useState<string[]>([]);
  const dragGhostRef = useRef<HTMLElement | null>(null);

  const stepActionBtn =
    'inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-gray-700 dark:hover:text-gray-200';

  useEffect(() => {
    if (!justAddedId) return;
    const t = window.setTimeout(() => setJustAddedId(null), 450);
    return () => window.clearTimeout(t);
  }, [justAddedId]);

  useEffect(() => {
    const clear = () => {
      setDragging(false);
      setDragKind(null);
      setDropTarget(null);
      if (dragGhostRef.current) {
        dragGhostRef.current.remove();
        dragGhostRef.current = null;
      }
    };
    window.addEventListener('dragend', clear);
    return () => window.removeEventListener('dragend', clear);
  }, []);

  useEffect(() => {
    if (!multiStepEnabled || !steps.length) {
      setActiveStepId(null);
      return;
    }
    if (!activeStepId || !steps.some((step) => step.id === activeStepId)) {
      setActiveStepId(steps[0]!.id);
    }
  }, [multiStepEnabled, steps, activeStepId]);

  const activeStep = multiStepEnabled
    ? (steps.find((step) => step.id === activeStepId) ?? steps[0])
    : undefined;
  const sections = multiStepEnabled ? (activeStep?.sections ?? []) : flatSections;
  const allSections = multiStepEnabled
    ? steps.flatMap((step) => step.sections)
    : flatSections;

  const allQuestions = useMemo(
    () => allSections.flatMap((section) => section.questions ?? []),
    [allSections],
  );

  const questionsById = useMemo(
    () => new Map(allQuestions.map((q) => [q.id, q])),
    [allQuestions],
  );

  const formulaModalQuestion = formulaModal
    ? allSections
        .flatMap((s) => s.questions)
        .find((q) => q.id === formulaModal.questionId) ?? null
    : null;

  const tableColumnsModalQuestion = tableColumnsModal
    ? allSections
        .flatMap((s) => s.questions)
        .find((q) => q.id === tableColumnsModal.questionId) ?? null
    : null;

  const setSteps = (updater: (prev: FormStep[]) => FormStep[]) => {
    onStructureChange({ steps: updater(steps) });
  };

  const setFlatSections = (updater: (prev: FormSection[]) => FormSection[]) => {
    onStructureChange({ sections: updater(flatSections) });
  };

  const setSections = (updater: (prev: FormSection[]) => FormSection[]) => {
    if (multiStepEnabled) {
      if (!activeStep) return;
      const stepId = activeStep.id;
      setSteps((prev) =>
        prev.map((step) =>
          step.id === stepId ? { ...step, sections: updater(step.sections) } : step
        )
      );
      return;
    }
    setFlatSections(updater);
  };

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return PALETTE_GROUPS;
    return PALETTE_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.label.toLowerCase().includes(q)),
    })).filter((group) => group.items.length > 0);
  }, [search]);

  const updateSection = (sectionId: string, patch: Partial<FormSection>) => {
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)));
  };

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === sectionId);
      if (idx < 0) return prev;
      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(nextIdx, 0, item!);
      return next;
    });
  };

  const updateQuestion = (
    sectionId: string,
    questionId: string,
    patch: Partial<FormQuestion>
  ) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id !== sectionId
          ? s
          : {
              ...s,
              questions: s.questions.map((q) => {
                if (q.id !== questionId) return q;
                const next = { ...q, ...patch };
                if ('formula' in patch && patch.formula === undefined) {
                  delete next.formula;
                }
                return next;
              }),
            }
      )
    );
  };

  const enableMultiStep = () => {
    if (multiStepEnabled) return;
    const step = newFormStep('Etapa 1');
    step.sections = flatSections.length ? [...flatSections] : [];
    onStructureChange({
      multiStepEnabled: true,
      steps: [step],
      sections: [],
    });
    setActiveStepId(step.id);
  };

  const addStep = () => {
    if (!multiStepEnabled) {
      enableMultiStep();
      return;
    }
    const step = newFormStep(`Etapa ${steps.length + 1}`);
    setSteps((prev) => [...prev, step]);
    setActiveStepId(step.id);
  };

  const updateStep = (stepId: string, patch: Partial<FormStep>) => {
    setSteps((prev) => prev.map((step) => (step.id === stepId ? { ...step, ...patch } : step)));
  };

  const removeStep = (stepId: string) => {
    if (steps.length <= 1) return;
    if (!confirm('Remover esta etapa e todo o conteúdo dela?')) return;
    setSteps((prev) => prev.filter((step) => step.id !== stepId));
  };

  const moveStep = (stepId: string, direction: -1 | 1) => {
    setSteps((prev) => {
      const idx = prev.findIndex((step) => step.id === stepId);
      if (idx < 0) return prev;
      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(nextIdx, 0, item!);
      return next;
    });
  };

  const disableMultiStep = () => {
    const mergedSections = steps.flatMap((step) => step.sections);
    onStructureChange({
      multiStepEnabled: false,
      steps: [],
      sections: mergedSections.length ? mergedSections : [newFormSection()],
    });
    setActiveStepId(null);
  };

  const handleStepMenuRemove = () => {
    if (!activeStep) return;
    if (steps.length > 1) {
      removeStep(activeStep.id);
      return;
    }
    if (!confirm('Remover etapas e voltar ao formulário em uma página?')) return;
    disableMultiStep();
  };

  const addSection = () => {
    const section = newFormSection();
    section.questions = [];
    if (!multiStepEnabled) {
      setFlatSections((prev) => [...prev, section]);
      return;
    }
    if (!activeStep) return;
    setSections((prev) => [...prev, section]);
  };

  const addField = (
    type: FormFieldType,
    targetSectionId?: string,
    opts?: { afterQuestionId?: string; width?: FormFieldWidth }
  ) => {
    const question: FormQuestion = {
      id: formUid(),
      required: false,
      followUp: null,
      ...questionDefaults(type),
      title: FORM_FIELD_TYPE_LABELS[type],
      type,
      ...(opts?.width ? { width: opts.width } : {}),
    } as FormQuestion;

    if (!multiStepEnabled) {
      if (flatSections.length === 0) {
        const section = newFormSection();
        section.questions = [question];
        onStructureChange({ sections: [section] });
        setSelected({ sectionId: section.id, questionId: question.id });
        setJustAddedId(question.id);
        return;
      }

      const sectionId =
        targetSectionId || selected?.sectionId || flatSections[flatSections.length - 1]!.id;

      setFlatSections((prev) => {
        const nextSections = prev.map((s) => {
          if (s.id !== sectionId) return s;
          if (!opts?.afterQuestionId) {
            return { ...s, questions: [...s.questions, question] };
          }
          const idx = s.questions.findIndex((q) => q.id === opts.afterQuestionId);
          if (idx < 0) return { ...s, questions: [...s.questions, question] };
          const nextQuestions = [...s.questions];
          nextQuestions.splice(idx + 1, 0, question);
          return { ...s, questions: nextQuestions };
        });
        return nextSections;
      });
      setSelected({ sectionId, questionId: question.id });
      setJustAddedId(question.id);
      return;
    }

    if (!activeStep) return;

    if (sections.length === 0) {
      const section = newFormSection();
      section.questions = [question];
      setSections(() => [section]);
      setSelected({ sectionId: section.id, questionId: question.id });
      setJustAddedId(question.id);
      return;
    }

    const sectionId =
      targetSectionId || selected?.sectionId || sections[sections.length - 1]!.id;

    setSections((prev) => {
      const nextSections = prev.map((s) => {
        if (s.id !== sectionId) return s;
        if (!opts?.afterQuestionId) {
          return { ...s, questions: [...s.questions, question] };
        }
        const idx = s.questions.findIndex((q) => q.id === opts.afterQuestionId);
        if (idx < 0) return { ...s, questions: [...s.questions, question] };
        const nextQuestions = [...s.questions];
        nextQuestions.splice(idx + 1, 0, question);
        return { ...s, questions: nextQuestions };
      });
      return nextSections;
    });
    setSelected({ sectionId, questionId: question.id });
    setJustAddedId(question.id);
  };

  const removeQuestion = (sectionId: string, questionId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id !== sectionId
          ? s
          : { ...s, questions: s.questions.filter((q) => q.id !== questionId) }
      )
    );
    if (selected?.questionId === questionId) setSelected(null);
  };

  const handlePaletteClick = (item: PaletteAction) => {
    if (item.kind === 'step') enableMultiStep();
    else if (item.kind === 'section') addSection();
    else addField(item.type);
  };

  const clearDrag = () => {
    setDragging(false);
    setDragKind(null);
    setDropTarget(null);
    if (dragGhostRef.current) {
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }
  };

  const onPaletteDragStart = (e: React.DragEvent, item: PaletteAction) => {
    const payload = JSON.stringify(
      item.kind === 'section'
        ? { kind: 'section' }
        : item.kind === 'step'
          ? { kind: 'step' }
          : { kind: 'field', type: item.type }
    );
    e.dataTransfer.setData(FORM_DND_MIME, payload);
    e.dataTransfer.setData('text/plain', payload);
    e.dataTransfer.effectAllowed = 'copy';
    setDragKind(
      item.kind === 'section' ? 'section' : item.kind === 'step' ? 'step' : 'field'
    );

    const source = e.currentTarget as HTMLElement;
    const ghost = source.cloneNode(true) as HTMLElement;
    const isDark = document.documentElement.classList.contains('dark');

    ghost.style.width = `${source.offsetWidth}px`;
    ghost.style.position = 'fixed';
    ghost.style.top = '-1000px';
    ghost.style.left = '-1000px';
    ghost.style.zIndex = '9999';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.98';
    ghost.style.transform = 'rotate(2deg) scale(1.04)';
    ghost.style.boxShadow = isDark
      ? '0 16px 36px rgba(0,0,0,0.45)'
      : '0 14px 32px rgba(15,23,42,0.16)';
    ghost.style.borderRadius = '0.75rem';
    ghost.style.border = isDark
      ? '1px solid rgb(248 113 113 / 0.7)'
      : '1px solid rgb(252 165 165)';
    ghost.style.background = isDark ? '#111827' : '#ffffff';
    ghost.style.color = isDark ? '#e5e7eb' : '#374151';

    ghost.querySelectorAll('*').forEach((node) => {
      const el = node as HTMLElement;
      el.style.color = isDark ? '#e5e7eb' : '#374151';
    });

    document.body.appendChild(ghost);
    dragGhostRef.current = ghost;
    e.dataTransfer.setDragImage(ghost, source.offsetWidth / 2, source.offsetHeight / 2);
    setDragging(true);
  };

  const onCanvasDragOver = (e: React.DragEvent, targetId: string) => {
    const types = Array.from(e.dataTransfer.types);
    if (!types.includes(FORM_DND_MIME) && !types.includes('text/plain')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (dropTarget !== targetId) setDropTarget(targetId);
  };

  const onCanvasDrop = (
    e: React.DragEvent,
    target?: {
      sectionId?: string;
      afterQuestionId?: string;
      side?: boolean;
      newSection?: boolean;
    }
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData(FORM_DND_MIME) || e.dataTransfer.getData('text/plain');
    clearDrag();
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { kind: string; type?: FormFieldType };
      if (data.kind === 'step') {
        enableMultiStep();
        return;
      }
      if (data.kind === 'section' || target?.newSection) {
        if (data.kind === 'section') {
          addSection();
          return;
        }
      }
      if (data.kind === 'field' && data.type) {
        addField(data.type, target?.sectionId, {
          afterQuestionId: target?.afterQuestionId,
          width: target?.side ? 'half' : undefined,
        });
      }
    } catch {
      /* ignore invalid payload */
    }
  };

  const dropZoneCls = (active: boolean) =>
    `flex items-center justify-center rounded-lg border-2 border-dashed px-3 text-xs font-medium transition-colors duration-150 sm:text-sm ${
      active
        ? 'border-red-400 bg-red-50 text-red-600 dark:border-red-500/70 dark:bg-red-950/30 dark:text-red-400'
        : 'border-gray-300 bg-gray-50 text-gray-400 dark:border-gray-600 dark:bg-gray-800/50 dark:text-gray-500'
    }`;

  /** Em grid de 2 colunas: half sem par à direita pode receber drop ao lado. */
  const hasOpenSideSlot = (questions: FormQuestion[], index: number) => {
    const q = questions[index]!;
    if (resolveFieldWidth(q) !== 'half') return false;
    const next = questions[index + 1];
    if (next && resolveFieldWidth(next) === 'half') return false;

    let col = 0;
    for (let i = 0; i <= index; i++) {
      const w = resolveFieldWidth(questions[i]!);
      if (w === 'full') {
        col = 0;
        continue;
      }
      col += 1;
      if (i === index) return col === 1;
      if (col === 2) col = 0;
    }
    return false;
  };

  const optionsModalQuestion = optionsModal
    ? allSections
        .find((s) => s.id === optionsModal.sectionId)
        ?.questions.find((q) => q.id === optionsModal.questionId) ?? null
    : null;
  const optionsModalCopy = optionsModalQuestion
    ? formFieldOptionsModalCopy(optionsModalQuestion.type)
    : formFieldOptionsModalCopy('dropdown');

  useEffect(() => {
    if (!optionsModal || !optionsModalQuestion) {
      setOptionsDraft([]);
      return;
    }
    setOptionsDraft(
      optionsModalQuestion.options?.length
        ? [...optionsModalQuestion.options]
        : []
    );
  }, [optionsModal?.sectionId, optionsModal?.questionId, optionsModalQuestion?.id]);

  const closeOptionsModal = () => {
    setOptionsModal(null);
    setOptionsDraft([]);
  };

  const saveOptionsModal = () => {
    if (!optionsModal) return;
    const cleaned = optionsDraft.map((o) => o.trim()).filter(Boolean);
    updateQuestion(optionsModal.sectionId, optionsModal.questionId, {
      options: cleaned,
    });
    closeOptionsModal();
  };


  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-gray-50 dark:bg-gray-900">
      <style>{`
        @keyframes formFieldDropIn {
          0% { opacity: 0; transform: translateY(10px) scale(0.96); }
          60% { opacity: 1; transform: translateY(-2px) scale(1.01); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      {/* Sidebar de componentes — mesmo tom da sidebar do app */}
      <aside className="flex h-full w-[340px] shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-100 p-5 dark:border-gray-800">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar componentes"
              className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            {search.trim() ? (
              <button
                type="button"
                aria-label="Limpar busca"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-scroll p-5">
          {filteredGroups.map((group) => (
            <div key={group.title}>
              <p className="mb-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                {group.title}
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {group.items.map((item) => {
                  const Icon = item.Icon;
                  const key = item.kind === 'section' ? 'section' : item.kind === 'step' ? 'step' : item.type;
                  const stepLocked = item.kind === 'step' && multiStepEnabled;
                  return (
                    <button
                      key={key}
                      type="button"
                      draggable={!stepLocked}
                      disabled={stepLocked}
                      onClick={() => handlePaletteClick(item)}
                      onDragStart={(e) => onPaletteDragStart(e, item)}
                      onDragEnd={clearDrag}
                      className={`flex min-h-[52px] items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-left text-sm font-medium text-gray-700 transition-all duration-200 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 ${
                        stepLocked
                          ? 'cursor-not-allowed opacity-40'
                          : 'cursor-grab hover:border-gray-300 hover:bg-gray-50 active:cursor-grabbing active:scale-95 dark:hover:border-gray-600 dark:hover:bg-white/[0.04]'
                      } ${dragging && !stepLocked ? 'opacity-60' : ''}`}
                      title={stepLocked ? 'Etapas já ativadas neste formulário' : undefined}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0 text-gray-500 dark:text-gray-400" />
                      <span className="leading-snug">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Canvas — preenche a área útil */}
      <div
        className="min-h-0 min-w-0 flex-1 overflow-y-auto"
        onDragOver={(e) => {
          const types = Array.from(e.dataTransfer.types);
          if (!types.includes(FORM_DND_MIME) && !types.includes('text/plain')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => onCanvasDrop(e)}
      >
        <div className="w-full px-6 py-6 sm:px-8 lg:px-10">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-8 lg:p-10">
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="w-full border-0 bg-transparent p-0 text-2xl font-bold text-gray-900 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-100 sm:text-3xl"
              placeholder="Nome do formulário"
            />

            <input
              type="text"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              className="mt-2 w-full border-0 bg-transparent p-0 text-sm text-gray-500 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-400"
              placeholder="Descrição do formulário"
            />

            <div className="mt-8 space-y-6">
              {multiStepEnabled ? (
                <div className="group/stepper relative">
                  <div className="pointer-events-none absolute right-0 top-0 z-10 flex h-8 -translate-y-full items-center justify-end gap-0.5 pb-1 opacity-0 transition-opacity group-hover/stepper:pointer-events-auto group-hover/stepper:opacity-100">
                    {activeStep ? (
                      <>
                        <button
                          type="button"
                          title="Nova etapa"
                          onClick={addStep}
                          className={stepActionBtn}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Mover etapa para a esquerda"
                          disabled={
                            steps.findIndex((step) => step.id === activeStep.id) === 0
                          }
                          onClick={() => moveStep(activeStep.id, -1)}
                          className={stepActionBtn}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Mover etapa para a direita"
                          disabled={
                            steps.findIndex((step) => step.id === activeStep.id) >=
                            steps.length - 1
                          }
                          onClick={() => moveStep(activeStep.id, 1)}
                          className={stepActionBtn}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title={steps.length > 1 ? 'Remover etapa' : 'Remover etapas'}
                          onClick={handleStepMenuRemove}
                          className={`${stepActionBtn} hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    ) : null}
                  </div>
                  <FormStepsStepper
                    className="w-full"
                    steps={steps.map((step) => ({
                      id: step.id,
                      label: step.title,
                    }))}
                    currentIndex={Math.max(
                      0,
                      steps.findIndex((step) => step.id === activeStep?.id)
                    )}
                    mode="navigation"
                    editable
                    onStepLabelChange={(stepId, label) =>
                      updateStep(stepId, { title: label })
                    }
                    onSelect={(index) => {
                      const step = steps[index];
                      if (step) setActiveStepId(step.id);
                    }}
                  />
                </div>
              ) : null}

              {sections.length === 0 ? (
                dragging ? (
                  <div
                    onDragOver={(e) => onCanvasDragOver(e, 'empty')}
                    onDragLeave={() => {
                      if (dropTarget === 'empty') setDropTarget(null);
                    }}
                    onDrop={(e) => onCanvasDrop(e)}
                    className={`${dropZoneCls(dropTarget === 'empty')} min-h-[120px] w-full`}
                  >
                    Solte para adicionar
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                    Arraste componentes da barra lateral
                  </p>
                )
              ) : null}

              {sections.map((section, sectionIdx) => (
                <section key={section.id} className="relative space-y-4">
                  <div className="group relative">
                    <div className="min-w-0 space-y-1">
                      <input
                        type="text"
                        value={section.title}
                        onChange={(e) =>
                          updateSection(section.id, { title: e.target.value })
                        }
                        className="w-full border-0 bg-transparent p-0 text-sm font-semibold uppercase tracking-wide text-gray-800 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-200"
                        placeholder="Título da seção"
                      />
                      <input
                        type="text"
                        value={section.description || ''}
                        onChange={(e) =>
                          updateSection(section.id, { description: e.target.value })
                        }
                        className="w-full border-0 bg-transparent p-0 text-sm text-gray-500 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-400"
                        placeholder="Descrição da seção"
                      />
                    </div>
                    <div className="absolute right-0 top-0 flex shrink-0 items-center gap-1.5 opacity-0 pointer-events-none transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                      <button
                        type="button"
                        title="Subir seção"
                        disabled={sectionIdx === 0}
                        onClick={() => moveSection(section.id, -1)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Descer seção"
                        disabled={sectionIdx === sections.length - 1}
                        onClick={() => moveSection(section.id, 1)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('Remover esta seção e todas as perguntas?')) {
                            setSections((prev) => prev.filter((s) => s.id !== section.id));
                            if (selected?.sectionId === section.id) setSelected(null);
                          }
                        }}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                        title="Remover seção"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    {section.questions.map((question, qIdx) => {
                      const spanFull = resolveFieldWidth(question) === 'full';
                      const fieldWidth = resolveFieldWidth(question);
                      const hasOptionsModal = FORM_FIELD_TYPES_WITH_OPTIONS.includes(
                        question.type
                      );
                      const sideTargetId = `side:${section.id}:${question.id}`;
                      const canSideDrop =
                        dragging &&
                        dragKind === 'field' &&
                        hasOpenSideSlot(section.questions, qIdx);
                      const sideDropActive = dropTarget === sideTargetId;

                      return (
                        <div
                          key={question.id}
                          className={`${spanFull ? 'sm:col-span-2' : ''} group relative min-w-0 transition-all duration-300 ${
                            justAddedId === question.id
                              ? 'animate-[formFieldDropIn_0.4s_ease-out]'
                              : ''
                          }`}
                          onMouseLeave={() => {
                            if (typeMenuQuestionId === question.id) {
                              setTypeMenuQuestionId(null);
                            }
                          }}
                          onClick={() => {
                            setTypeMenuQuestionId(null);
                            setSelected({
                              sectionId: section.id,
                              questionId: question.id,
                            });
                          }}
                        >
                          <QuestionFieldTitleRow
                            question={question}
                            sectionId={section.id}
                            fieldWidth={fieldWidth}
                            hasOptionsModal={hasOptionsModal}
                            autoFocusTitle={justAddedId === question.id}
                            updateQuestion={updateQuestion}
                            removeQuestion={removeQuestion}
                            setFormulaModal={setFormulaModal}
                            setOptionsModal={setOptionsModal}
                            setTableColumnsModal={setTableColumnsModal}
                            typeMenuOpen={typeMenuQuestionId === question.id}
                            onTypeMenuOpenChange={(nextOpen) =>
                              setTypeMenuQuestionId(nextOpen ? question.id : null)
                            }
                          />

                          <FieldPreview
                            question={question}
                            questionsById={questionsById}
                            onOptionsChange={(options) =>
                              updateQuestion(section.id, question.id, { options })
                            }
                            onTableColumnsChange={(tableColumns) =>
                              updateQuestion(section.id, question.id, {
                                ...tableColumnsToSavePayload(tableColumns),
                              })
                            }
                            onPlaceholderChange={(placeholder) =>
                              updateQuestion(section.id, question.id, { placeholder })
                            }
                          />

                          {canSideDrop ? (
                            <div
                              onDragOver={(e) => onCanvasDragOver(e, sideTargetId)}
                              onDragLeave={() => {
                                if (dropTarget === sideTargetId) setDropTarget(null);
                              }}
                              onDrop={(e) =>
                                onCanvasDrop(e, {
                                  sectionId: section.id,
                                  afterQuestionId: question.id,
                                  side: true,
                                })
                              }
                              className="absolute top-0 left-[calc(100%+1.25rem)] z-20 hidden h-full w-full sm:block"
                            >
                              <div
                                className={`${dropZoneCls(sideDropActive)} h-full min-h-[3rem] px-2 text-center`}
                              >
                                Solte aqui do lado
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {dragging && dragKind === 'field' ? (
                    <div
                      onDragOver={(e) => onCanvasDragOver(e, `below:${section.id}`)}
                      onDragLeave={() => {
                        if (dropTarget === `below:${section.id}`) setDropTarget(null);
                      }}
                      onDrop={(e) => onCanvasDrop(e, { sectionId: section.id })}
                      className="mt-2 h-10 w-full transition-all duration-150"
                    >
                      <div
                        className={`${dropZoneCls(dropTarget === `below:${section.id}`)} h-full w-full`}
                      >
                        Solte aqui embaixo
                      </div>
                    </div>
                  ) : null}
                </section>
              ))}

              {dragging && dragKind === 'section' && sections.length > 0 ? (
                <div
                  onDragOver={(e) => onCanvasDragOver(e, 'new-section')}
                  onDragLeave={() => {
                    if (dropTarget === 'new-section') setDropTarget(null);
                  }}
                  onDrop={(e) => onCanvasDrop(e, { newSection: true })}
                  className="mt-2 h-10 w-full transition-all duration-150"
                >
                  <div className={`${dropZoneCls(dropTarget === 'new-section')} h-full w-full`}>
                    Solte aqui para adicionar seção
                  </div>
                </div>
              ) : null}
            </div>

            {footer ? (
              <div className="mt-10 flex justify-end border-t border-gray-100 pt-6 dark:border-gray-700">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Modal
        isOpen={!!optionsModal && !!optionsModalQuestion}
        onClose={closeOptionsModal}
        title={optionsModalCopy.title}
        size="md"
        confirmBeforeClose
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {optionsModalCopy.description}
          </p>

          <div className="space-y-2">
            {optionsDraft.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-400 dark:border-gray-600">
                {optionsModalCopy.emptyLabel}
              </p>
            ) : (
              optionsDraft.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const next = [...optionsDraft];
                      next[idx] = e.target.value;
                      setOptionsDraft(next);
                    }}
                    className={FORM_FIELD_INPUT_CLS}
                    placeholder={optionsModalCopy.itemPlaceholder(idx)}
                  />
                  <button
                    type="button"
                    title="Remover"
                    onClick={() => {
                      setOptionsDraft(optionsDraft.filter((_, i) => i !== idx));
                    }}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Plus className="h-4 w-4" />}
              onClick={() =>
                setOptionsDraft([
                  ...optionsDraft,
                  optionsModalCopy.itemPlaceholder(optionsDraft.length),
                ])
              }
            >
              {optionsModalCopy.addLabel}
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={closeOptionsModal}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="!bg-red-600 hover:!bg-red-700 active:!bg-red-800"
                onClick={saveOptionsModal}
              >
                Salvar
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <FormFormulaModal
        isOpen={!!formulaModal}
        question={formulaModalQuestion}
        allQuestions={allQuestions}
        onClose={() => setFormulaModal(null)}
        onSave={(formula) => {
          if (!formulaModal) return;
          updateQuestion(formulaModal.sectionId, formulaModal.questionId, {
            formula: formula ?? undefined,
            readOnly: formula ? true : false,
          });
          setFormulaModal(null);
        }}
      />

      <FormTableColumnsModal
        isOpen={!!tableColumnsModal}
        columns={resolveTableColumns(tableColumnsModalQuestion ?? {})}
        onClose={() => setTableColumnsModal(null)}
        onSave={(tableColumns) => {
          if (!tableColumnsModal) return;
          updateQuestion(tableColumnsModal.sectionId, tableColumnsModal.questionId, {
            ...tableColumnsToSavePayload(tableColumns),
          });
          setTableColumnsModal(null);
        }}
      />
    </div>
  );
}


function defaultPlaceholder(type: FormFieldType): string {
  switch (type) {
    case 'textarea':
      return 'Texto longo';
    case 'number':
      return '0';
    case 'valor':
      return 'R$ 0,00';
    case 'percent':
      return '0%';
    case 'date':
      return 'dd/mm/aaaa';
    case 'datetime':
      return 'dd/mm/aaaa hh:mm';
    case 'dropdown':
      return 'Selecionar…';
    case 'profiles':
      return 'Selecionar perfil…';
    case 'attachment':
      return 'Clique ou arraste arquivos';
    case 'image':
      return 'Clique ou arraste imagens';
    case 'qrcode':
      return 'Código do QR…';
    case 'signature':
      return 'Área de assinatura';
    default:
      return 'Texto curto';
  }
}

function PlaceholderInput({
  value,
  fallback,
  onChange,
  className = '',
  multiline = false,
}: {
  value?: string;
  fallback: string;
  onChange?: (value: string) => void;
  className?: string;
  multiline?: boolean;
}) {
  const cls = `w-full border-0 bg-transparent p-0 text-sm text-gray-400 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-500 dark:placeholder:text-gray-500 ${className}`;
  if (multiline) {
    return (
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        placeholder={fallback}
        rows={3}
        className={`${cls} min-h-[100px] resize-none`}
      />
    );
  }
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      placeholder={fallback}
      className={cls}
    />
  );
}

function SimNaoPreview({
  options,
  onOptionsChange,
}: {
  options?: string[];
  onOptionsChange?: (options: string[]) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const opts: [string, string] =
    options && options.length >= 2
      ? [options[0]!, options[1]!]
      : ['SIM', 'NÃO'];

  return (
    <div
      className="flex h-10 flex-wrap items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      {opts.map((opt, idx) => {
        const placeholder = idx === 0 ? 'SIM' : 'NÃO';
        const measure = opt || placeholder;
        const checked = selected === idx;
        return (
          <div key={idx} className="inline-flex items-center gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => setSelected(idx)}
              className={`group flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                checked
                  ? 'border-red-600 dark:border-red-500'
                  : 'border-gray-300 bg-white hover:border-red-400 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-red-400'
              }`}
            >
              {checked ? (
                <span className="h-3 w-3 rounded-full bg-red-600 dark:bg-red-500" />
              ) : null}
            </button>
            <span className="inline-grid max-w-full">
              <span
                className="invisible col-start-1 row-start-1 whitespace-pre text-sm font-medium uppercase tracking-wide"
                aria-hidden
              >
                {measure}
              </span>
              <input
                type="text"
                size={1}
                value={opt}
                onChange={(e) => {
                  const next: [string, string] = [opts[0]!, opts[1]!];
                  next[idx] = e.target.value;
                  onOptionsChange?.(next);
                }}
                className="col-start-1 row-start-1 w-full min-w-0 border-0 bg-transparent p-0 text-sm font-medium uppercase tracking-wide text-gray-800 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-200"
                placeholder={placeholder}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CheckboxFieldPreview({
  label,
  onLabelChange,
}: {
  label: string;
  onLabelChange: (label: string) => void;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <div
      className="flex items-center space-x-3 pt-1"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="group shrink-0 rounded focus:outline-none"
        onClick={() => setChecked((v) => !v)}
        aria-pressed={checked}
      >
        <CheckboxIndicator checked={checked} />
      </button>
      <input
        type="text"
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-medium text-gray-700 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-300"
        placeholder="Aceito"
      />
    </div>
  );
}

function SignaturePreview() {
  const [value, setValue] = useState('');
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <SignatureField value={value} onChange={setValue} />
    </div>
  );
}

function RatingPreview() {
  const [value, setValue] = useState<number | null>(null);

  return (
    <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => setValue(active ? null : n)}
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

function parseSliderBound(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function SliderPreview({
  options,
  onOptionsChange,
}: {
  options?: string[];
  onOptionsChange?: (options: string[]) => void;
}) {
  const minLabel = options?.[0] ?? '1';
  const maxLabel = options?.[1] ?? '10';
  const parsedMin = parseSliderBound(minLabel);
  const parsedMax = parseSliderBound(maxLabel);
  const numericScale =
    parsedMin != null && parsedMax != null && parsedMax > parsedMin;
  const min = numericScale ? parsedMin : 1;
  const max = numericScale ? parsedMax : 10;
  const [value, setValue] = useState(() => Math.round((min + max) / 2));

  useEffect(() => {
    setValue((v) => Math.min(max, Math.max(min, v)));
  }, [min, max]);

  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  // O thumb nativo não vai de 0→100% da trilha: o centro fica entre (thumb/2) e (100% - thumb/2).
  const thumbPx = 16;
  const fillWidth = `calc((100% - ${thumbPx}px) * ${pct / 100} + ${thumbPx / 2}px)`;

  return (
    <div className="space-y-2 pt-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3">
        <div className="relative h-4 min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-red-600"
              style={{ width: fillWidth }}
            />
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none bg-transparent accent-red-600 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-red-600 [&::-moz-range-track]:h-full [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-red-600"
            aria-label="Controle deslizante"
          />
        </div>
        {numericScale ? (
          <span className="min-w-[1.5rem] shrink-0 text-right text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-200">
            {value}
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          value={minLabel}
          onChange={(e) => onOptionsChange?.([e.target.value, maxLabel])}
          className="max-w-[45%] border-0 bg-transparent p-0 text-xs text-gray-500 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-400"
          placeholder="Mínimo"
        />
        <input
          type="text"
          value={maxLabel}
          onChange={(e) => onOptionsChange?.([minLabel, e.target.value])}
          className="max-w-[45%] border-0 bg-transparent p-0 text-right text-xs text-gray-500 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-400"
          placeholder="Máximo"
        />
      </div>
    </div>
  );
}

function NumericFieldPreview({
  question,
  questionsById,
  onPlaceholderChange,
}: {
  question: FormQuestion;
  questionsById: Map<string, FormQuestion>;
  onPlaceholderChange?: (placeholder: string) => void;
}) {
  const inputPreviewCls = `${FORM_FIELD_INPUT_CLS} flex h-10 items-center text-gray-400 dark:text-gray-500`;
  const readOnlyCls =
    'cursor-not-allowed bg-gray-50 text-gray-500 dark:bg-gray-800/60 dark:text-gray-400';
  const hasFormula = questionHasFormula(question);

  return (
    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
      <div className={`${inputPreviewCls} ${hasFormula || question.readOnly ? readOnlyCls : ''}`}>
        <PlaceholderInput
          value={question.placeholder}
          fallback={defaultPlaceholder(question.type)}
          onChange={onPlaceholderChange}
        />
      </div>
      {hasFormula ? (
        <p className="text-xs text-indigo-600 dark:text-indigo-400">
          {describeFormula(question.formula, questionsById)}
        </p>
      ) : null}
    </div>
  );
}

function FieldPreview({
  question,
  questionsById,
  onOptionsChange,
  onTableColumnsChange,
  onPlaceholderChange,
}: {
  question: FormQuestion;
  questionsById: Map<string, FormQuestion>;
  onOptionsChange?: (options: string[]) => void;
  onTableColumnsChange?: (columns: FormTableColumn[]) => void;
  onPlaceholderChange?: (placeholder: string) => void;
}) {
  const inputPreviewCls = `${FORM_FIELD_INPUT_CLS} flex h-10 items-center text-gray-400 dark:text-gray-500`;
  const readOnlyCls =
    'cursor-not-allowed bg-gray-50 text-gray-500 dark:bg-gray-800/60 dark:text-gray-400';

  if (question.type === 'textarea') {
    return (
      <div
        className={`${FORM_FIELD_TEXTAREA_CLS} min-h-[140px]`}
        onClick={(e) => e.stopPropagation()}
      >
        <PlaceholderInput
          value={question.placeholder}
          fallback={defaultPlaceholder('textarea')}
          onChange={onPlaceholderChange}
          multiline
        />
      </div>
    );
  }

  if (question.type === 'number' || question.type === 'valor' || question.type === 'percent') {
    return (
      <NumericFieldPreview
        question={question}
        questionsById={questionsById}
        onPlaceholderChange={onPlaceholderChange}
      />
    );
  }

  if (question.type === 'date' || question.type === 'datetime') {
    return (
      <div
        className={`${inputPreviewCls} justify-between gap-2`}
        onClick={(e) => e.stopPropagation()}
      >
        <PlaceholderInput
          value={question.placeholder}
          fallback={defaultPlaceholder(question.type)}
          onChange={onPlaceholderChange}
          className="min-w-0 flex-1"
        />
        <Calendar className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden />
      </div>
    );
  }

  if (question.type === 'sim_nao') {
    return (
      <SimNaoPreview
        options={question.options}
        onOptionsChange={onOptionsChange}
      />
    );
  }

  if (question.type === 'dropdown') {
    return (
      <div
        className={`${inputPreviewCls} justify-between gap-2`}
        onClick={(e) => e.stopPropagation()}
      >
        <PlaceholderInput
          value={question.placeholder}
          fallback={defaultPlaceholder('dropdown')}
          onChange={onPlaceholderChange}
          className="min-w-0 flex-1"
        />
        <ChevronDown
          className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
          aria-hidden
        />
      </div>
    );
  }

  if (question.type === 'checkbox') {
    return (
      <CheckboxFieldPreview
        label={question.options?.[0] ?? ''}
        onLabelChange={(label) => onOptionsChange?.([label])}
      />
    );
  }

  if (question.type === 'checklist') {
    const opts = question.options?.length ? question.options : ['Item 1', 'Item 2'];
    return (
      <div className="space-y-2 pt-1">
        {opts.map((opt) => (
          <div key={opt} className="flex items-center space-x-3">
            <CheckboxIndicator checked={false} />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{opt}</span>
          </div>
        ))}
      </div>
    );
  }

  if (question.type === 'pills') {
    const opts = question.options?.length ? question.options : ['Opção 1', 'Opção 2'];
    return (
      <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
        {opts.map((opt, idx) => {
          const active = idx === 0;
          return (
            <div
              key={idx}
              className={`flex min-w-0 flex-1 items-center rounded-lg border px-4 py-2 transition-colors ${
                active
                  ? 'border-red-600 bg-red-50 dark:bg-red-950/40'
                  : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
              }`}
            >
              <input
                type="text"
                value={opt}
                onChange={(e) => {
                  const next = [...opts];
                  next[idx] = e.target.value;
                  onOptionsChange?.(next);
                }}
                className={`w-full border-0 bg-transparent p-0 text-center text-sm font-medium outline-none placeholder:text-gray-400 focus:ring-0 ${
                  active
                    ? 'text-red-800 dark:text-red-200'
                    : 'text-gray-700 dark:text-gray-200'
                }`}
                placeholder={`Opção ${idx + 1}`}
              />
            </div>
          );
        })}
      </div>
    );
  }

  if (question.type === 'profiles') {
    return (
      <div
        className={`${inputPreviewCls} justify-between gap-2`}
        onClick={(e) => e.stopPropagation()}
      >
        <PlaceholderInput
          value={question.placeholder}
          fallback={defaultPlaceholder('profiles')}
          onChange={onPlaceholderChange}
          className="min-w-0 flex-1"
        />
        <ChevronDown
          className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"
          aria-hidden
        />
      </div>
    );
  }

  if (question.type === 'rating') {
    return <RatingPreview />;
  }

  if (question.type === 'slider') {
    return (
      <SliderPreview
        options={question.options}
        onOptionsChange={onOptionsChange}
      />
    );
  }

  if (question.type === 'attachment' || question.type === 'image') {
    return <FormMultiFileFieldPreview mode={question.type} />;
  }

  if (question.type === 'table') {
    const cols = resolveTableColumns(question);
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <FormTableFieldPreview
          columns={cols}
          onColumnsChange={(tableColumns) => onTableColumnsChange?.(tableColumns)}
        />
      </div>
    );
  }

  if (question.type === 'qrcode') {
    return (
      <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
          <QrCode className="h-6 w-6 text-gray-700 dark:text-gray-200" />
        </div>
        <div className={`min-w-0 flex-1 ${inputPreviewCls}`}>
          <PlaceholderInput
            value={question.placeholder}
            fallback={defaultPlaceholder('qrcode')}
            onChange={onPlaceholderChange}
          />
        </div>
      </div>
    );
  }

  if (question.type === 'signature') {
    return <SignaturePreview />;
  }

  return (
    <div className={inputPreviewCls} onClick={(e) => e.stopPropagation()}>
      <PlaceholderInput
        value={question.placeholder}
        fallback={defaultPlaceholder('text')}
        onChange={onPlaceholderChange}
      />
    </div>
  );
}
