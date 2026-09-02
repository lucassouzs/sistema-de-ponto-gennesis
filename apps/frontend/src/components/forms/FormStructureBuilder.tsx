'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
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
  GripVertical,
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

function hideNativeDragGhost(e: React.DragEvent) {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  canvas.style.position = 'fixed';
  canvas.style.left = '-20px';
  canvas.style.top = '-20px';
  document.body.appendChild(canvas);
  e.dataTransfer.setDragImage(canvas, 0, 0);
  window.requestAnimationFrame(() => canvas.remove());
}

function insertQuestionIntoList(
  questions: FormQuestion[],
  question: FormQuestion,
  opts?: { beforeQuestionId?: string; afterQuestionId?: string },
): FormQuestion[] {
  const next = [...questions];
  let insertAt = next.length;
  if (opts?.beforeQuestionId) {
    const index = next.findIndex((q) => q.id === opts.beforeQuestionId);
    if (index >= 0) insertAt = index;
  } else if (opts?.afterQuestionId) {
    const index = next.findIndex((q) => q.id === opts.afterQuestionId);
    if (index >= 0) insertAt = index + 1;
  }
  next.splice(insertAt, 0, question);
  return next;
}

function moveQuestionInSections(
  sections: FormSection[],
  from: { sectionId: string; questionId: string },
  to: {
    sectionId: string;
    beforeQuestionId?: string;
    afterQuestionId?: string;
    side?: boolean;
  },
): FormSection[] {
  let moved: FormQuestion | null = null;
  let fromIndex = -1;

  const stripped = sections.map((section) => {
    if (section.id !== from.sectionId) return section;
    fromIndex = section.questions.findIndex((q) => q.id === from.questionId);
    if (fromIndex < 0) return section;
    const questions = [...section.questions];
    moved = questions[fromIndex]!;
    questions.splice(fromIndex, 1);
    return { ...section, questions };
  });

  if (moved === null) return sections;

  const movedQuestion: FormQuestion = moved;
  const nextQuestion: FormQuestion = to.side
    ? { ...movedQuestion, width: 'half' }
    : movedQuestion;

  return stripped.map((section) => {
    if (section.id !== to.sectionId) return section;
    const questions = [...section.questions];
    let insertAt = questions.length;

    if (to.beforeQuestionId) {
      const index = questions.findIndex((q) => q.id === to.beforeQuestionId);
      if (index >= 0) insertAt = index;
    } else if (to.afterQuestionId) {
      const index = questions.findIndex((q) => q.id === to.afterQuestionId);
      if (index >= 0) insertAt = index + 1;
    }

    if (from.sectionId === to.sectionId && fromIndex >= 0 && fromIndex < insertAt) {
      insertAt -= 1;
    }

    questions.splice(insertAt, 0, nextQuestion);
    return { ...section, questions };
  });
}

function placeQuestionAtIndex(
  questions: FormQuestion[],
  questionId: string,
  insertAt: number,
): FormQuestion[] {
  const from = questions.findIndex((q) => q.id === questionId);
  if (from < 0) return questions;
  const next = [...questions];
  const [item] = next.splice(from, 1);
  if (!item) return questions;
  const index = Math.max(0, Math.min(insertAt, next.length));
  next.splice(index, 0, item);
  return next;
}

type GridRenderItem =
  | { key: string; kind: 'question'; question: FormQuestion }
  | { key: string; kind: 'placeholder'; width: FormFieldWidth };

function parseSequenceInsertIndex(
  remaining: FormQuestion[],
  dropTarget: string | null,
  sectionId: string,
): number | null {
  if (!dropTarget) return null;
  if (dropTarget === `below:${sectionId}`) return remaining.length;
  const match = dropTarget.match(/^insert:([^:]+):([^:]+):(before|after)$/);
  if (!match || match[1] !== sectionId) return null;
  const index = remaining.findIndex((q) => q.id === match[2]);
  if (index < 0) return null;
  return match[3] === 'before' ? index : index + 1;
}

function buildSequencePreviewItems(
  questions: FormQuestion[],
  dragged: FormQuestion | undefined,
  insertAt: number | null,
): GridRenderItem[] {
  const remaining = dragged
    ? questions.filter((q) => q.id !== dragged.id)
    : questions;
  const items: GridRenderItem[] = remaining.map((q) => ({
    key: q.id,
    kind: 'question',
    question: q,
  }));
  if (insertAt == null || !dragged) return items;
  items.splice(Math.max(0, Math.min(insertAt, items.length)), 0, {
    key: 'sequence-placeholder',
    kind: 'placeholder',
    width: resolveFieldWidth(dragged),
  });
  return items;
}

function questionGridColumn(
  questions: FormQuestion[],
  index: number,
): 1 | 2 | null {
  let col = 0;
  for (let i = 0; i < questions.length; i++) {
    if (resolveFieldWidth(questions[i]!) === 'full') {
      if (i === index) return null;
      col = 0;
      continue;
    }
    col += 1;
    if (i === index) return col as 1 | 2;
    if (col === 2) col = 0;
  }
  return null;
}

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
  onGripPointerDown,
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
  onGripPointerDown: (
    e: React.PointerEvent,
    sectionId: string,
    questionId: string,
    title: string,
  ) => void;
}) {
  return (
    <div data-field-title className="mb-3 flex min-w-0 items-center gap-1">
      <div
        role="button"
        tabIndex={0}
        title="Arrastar para mover o campo"
        onPointerDown={(e) => onGripPointerDown(e, sectionId, question.id, question.title)}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-gray-300 select-none hover:bg-gray-100 hover:text-gray-500 active:cursor-grabbing dark:hover:bg-gray-700 dark:hover:text-gray-300"
      >
        <GripVertical className="h-4 w-4" />
      </div>
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
  const [dragKind, setDragKind] = useState<'section' | 'step' | 'field' | 'field-move' | null>(
    null,
  );
  const [draggedField, setDraggedField] = useState<{
    sectionId: string;
    questionId: string;
  } | null>(null);
  const [draggedPaletteFieldType, setDraggedPaletteFieldType] =
    useState<FormFieldType | null>(null);
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
  const [dragPointer, setDragPointer] = useState<{ x: number; y: number } | null>(null);
  const [dragPreviewLabel, setDragPreviewLabel] = useState<string | null>(null);
  const dragGhostRef = useRef<HTMLElement | null>(null);
  const fieldElsRef = useRef(new Map<string, HTMLElement>());
  const flipFromRef = useRef(new Map<string, DOMRect>());
  const pointerDragRef = useRef<{
    pointerId: number;
    sectionId: string;
    questionId: string;
    title: string;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  dropTargetRef.current = dropTarget;

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
      setDraggedField(null);
      setDraggedPaletteFieldType(null);
      setDragPointer(null);
      setDragPreviewLabel(null);
      fieldElsRef.current.forEach((el) => {
        el.style.transition = '';
        el.style.transform = '';
      });
      flipFromRef.current = new Map();
      if (dragGhostRef.current) {
        dragGhostRef.current.remove();
        dragGhostRef.current = null;
      }
    };
    window.addEventListener('dragend', clear);
    return () => window.removeEventListener('dragend', clear);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.clientX === 0 && event.clientY === 0) return;
      setDragPointer({ x: event.clientX, y: event.clientY });
    };
    document.addEventListener('dragover', onDragOver);
    return () => document.removeEventListener('dragover', onDragOver);
  }, [dragging]);

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
  const allSectionsRef = useRef(allSections);
  allSectionsRef.current = allSections;

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
    opts?: {
      afterQuestionId?: string;
      beforeQuestionId?: string;
      width?: FormFieldWidth;
    },
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
          return {
            ...s,
            questions: insertQuestionIntoList(s.questions, question, {
              beforeQuestionId: opts?.beforeQuestionId,
              afterQuestionId: opts?.afterQuestionId,
            }),
          };
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
        return {
          ...s,
          questions: insertQuestionIntoList(s.questions, question, {
            beforeQuestionId: opts?.beforeQuestionId,
            afterQuestionId: opts?.afterQuestionId,
          }),
        };
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

  const moveQuestion = (
    fromSectionId: string,
    questionId: string,
    to: {
      sectionId: string;
      beforeQuestionId?: string;
      afterQuestionId?: string;
      side?: boolean;
    },
  ) => {
    setSections((prev) =>
      moveQuestionInSections(prev, { sectionId: fromSectionId, questionId }, to),
    );
    setSelected({ sectionId: to.sectionId, questionId });
  };

  const placeQuestion = (
    fromSectionId: string,
    questionId: string,
    toSectionId: string,
    insertAt: number,
  ) => {
    setSections((prev) => {
      if (fromSectionId === toSectionId) {
        return prev.map((section) =>
          section.id !== toSectionId
            ? section
            : {
                ...section,
                questions: placeQuestionAtIndex(section.questions, questionId, insertAt),
              },
        );
      }
      let moved: FormQuestion | null = null;
      const stripped = prev.map((section) => {
        if (section.id !== fromSectionId) return section;
        const found = section.questions.find((q) => q.id === questionId);
        if (!found) return section;
        moved = found;
        return {
          ...section,
          questions: section.questions.filter((q) => q.id !== questionId),
        };
      });
      if (!moved) return prev;
      const placed: FormQuestion = moved;
      return stripped.map((section) => {
        if (section.id !== toSectionId) return section;
        const questions = [...section.questions];
        questions.splice(Math.max(0, Math.min(insertAt, questions.length)), 0, placed);
        return { ...section, questions };
      });
    });
    setSelected({ sectionId: toSectionId, questionId });
  };

  const handlePaletteClick = (item: PaletteAction) => {
    if (item.kind === 'step') enableMultiStep();
    else if (item.kind === 'section') addSection();
    else addField(item.type);
  };

  const resetFieldMotion = () => {
    fieldElsRef.current.forEach((el) => {
      el.style.transition = '';
      el.style.transform = '';
    });
    flipFromRef.current = new Map();
  };

  const clearDrag = () => {
    setDragging(false);
    setDragKind(null);
    setDropTarget(null);
    setDraggedField(null);
    setDraggedPaletteFieldType(null);
    setDragPointer(null);
    setDragPreviewLabel(null);
    resetFieldMotion();
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
    hideNativeDragGhost(e);
    setDragKind(
      item.kind === 'section' ? 'section' : item.kind === 'step' ? 'step' : 'field'
    );
    setDraggedPaletteFieldType(item.kind === 'field' ? item.type : null);
    setDragPreviewLabel(item.label);
    setDragPointer({ x: e.clientX, y: e.clientY });
    setDragging(true);
  };

  const onGripPointerDown = (
    e: React.PointerEvent,
    sectionId: string,
    questionId: string,
    title: string,
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    pointerDragRef.current = {
      pointerId: e.pointerId,
      sectionId,
      questionId,
      title,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };
  };

  const snapshotFieldRects = () => {
    const map = new Map<string, DOMRect>();
    fieldElsRef.current.forEach((el, id) => {
      map.set(id, el.getBoundingClientRect());
    });
    flipFromRef.current = map;
  };

  const moveQuestionRef = useRef(moveQuestion);
  moveQuestionRef.current = moveQuestion;
  const placeQuestionRef = useRef(placeQuestion);
  placeQuestionRef.current = placeQuestion;
  const snapshotFieldRectsRef = useRef(snapshotFieldRects);
  snapshotFieldRectsRef.current = snapshotFieldRects;
  const clearDragRef = useRef(clearDrag);
  clearDragRef.current = clearDrag;

  useEffect(() => {
    const resolveTarget = (x: number, y: number, draggedId: string) => {
      const hits = document.elementsFromPoint(x, y);
      for (const node of hits) {
        if (!(node instanceof Element)) continue;
        const slot = node.closest('[data-drop-id]');
        if (slot) return slot.getAttribute('data-drop-id');
        const card = node.closest('[data-field-card]');
        if (!card) continue;
        const questionId = card.getAttribute('data-question-id');
        const sectionId = card.getAttribute('data-section-id');
        if (!questionId || !sectionId || questionId === draggedId) continue;
        const rect = card.getBoundingClientRect();
        const spanFull = card.getAttribute('data-span-full') === '1';
        const edge = spanFull
          ? y < rect.top + rect.height / 2
            ? 'before'
            : 'after'
          : x < rect.left + rect.width / 2
            ? 'before'
            : 'after';
        return `insert:${sectionId}:${questionId}:${edge}`;
      }
      return null;
    };

    const onMove = (e: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (!drag.active) {
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
        drag.active = true;
        snapshotFieldRectsRef.current();
        setDragKind('field-move');
        setDraggedField({ sectionId: drag.sectionId, questionId: drag.questionId });
        setDragPreviewLabel(drag.title.trim() || 'Campo');
        setDropTarget(null);
        setDragging(true);
      }
      setDragPointer({ x: e.clientX, y: e.clientY });
      const next = resolveTarget(e.clientX, e.clientY, drag.questionId);
      if (next !== dropTargetRef.current) {
        snapshotFieldRectsRef.current();
        setDropTarget(next);
      }
    };

    const onUp = (e: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      pointerDragRef.current = null;
      if (drag.active) {
        const target = dropTargetRef.current;
        if (target) {
          const toSectionId = target.startsWith('below:')
            ? target.slice(6)
            : target.match(/^insert:([^:]+):/)?.[1];
          if (toSectionId) {
            const section = allSectionsRef.current.find((s) => s.id === toSectionId);
            const remaining = (section?.questions ?? []).filter((q) => q.id !== drag.questionId);
            const insertAt =
              parseSequenceInsertIndex(remaining, target, toSectionId) ?? remaining.length;
            placeQuestionRef.current(
              drag.sectionId,
              drag.questionId,
              toSectionId,
              insertAt,
            );
          }
        }
      }
      clearDragRef.current();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const onCanvasDragOver = (e: React.DragEvent, targetId: string) => {
    const types = Array.from(e.dataTransfer.types);
    if (!types.includes(FORM_DND_MIME) && !types.includes('text/plain')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = dragKind === 'field-move' ? 'move' : 'copy';
    if (dropTarget !== targetId) {
      snapshotFieldRects();
      setDropTarget(targetId);
    }
  };

  useLayoutEffect(() => {
    const from = flipFromRef.current;
    if (from.size === 0) return;

    fieldElsRef.current.forEach((el, id) => {
      const prev = from.get(id);
      if (!prev) return;
      const next = el.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      void el.offsetWidth;
      el.style.transition = 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)';
      el.style.transform = '';
    });

    flipFromRef.current = new Map();
  }, [dropTarget, draggedField]);

  const onCanvasDrop = (
    e: React.DragEvent,
    target?: {
      sectionId?: string;
      beforeQuestionId?: string;
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
      const data = JSON.parse(raw) as {
        kind: string;
        type?: FormFieldType;
        sectionId?: string;
        questionId?: string;
      };
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
      if (data.kind === 'field-move' && data.sectionId && data.questionId && target?.sectionId) {
        if (
          data.sectionId === target.sectionId &&
          (data.questionId === target.beforeQuestionId ||
            data.questionId === target.afterQuestionId)
        ) {
          return;
        }
        moveQuestion(data.sectionId, data.questionId, {
          sectionId: target.sectionId,
          beforeQuestionId: target.beforeQuestionId,
          afterQuestionId: target.afterQuestionId,
          side: target.side,
        });
        return;
      }
      if (data.kind === 'field' && data.type) {
        addField(data.type, target?.sectionId, {
          beforeQuestionId: target?.beforeQuestionId,
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

  /** Coluna (1 ou 2) que o campo ocupa no grid; `null` para largura total. */
  const fieldColumn = (questions: FormQuestion[], index: number): 1 | 2 | null => {
    let col = 0;
    for (let i = 0; i < questions.length; i++) {
      if (resolveFieldWidth(questions[i]!) === 'full') {
        if (i === index) return null;
        col = 0;
        continue;
      }
      col += 1;
      if (i === index) return col as 1 | 2;
      if (col === 2) col = 0;
    }
    return null;
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

  const isFieldDragging =
    dragging && (dragKind === 'field' || dragKind === 'field-move');

  const resolveDraggedFieldWidth = (): FormFieldWidth => {
    if (dragKind === 'field-move' && draggedField) {
      const section = allSections.find((s) => s.id === draggedField.sectionId);
      const question = section?.questions.find((q) => q.id === draggedField.questionId);
      if (question) return resolveFieldWidth(question);
    }
    if (dragKind === 'field' && draggedPaletteFieldType) {
      return defaultFieldWidth(draggedPaletteFieldType);
    }
    return 'half';
  };

  const renderFieldDropSlot = (
    targetId: string,
    width: FormFieldWidth,
    onDrop: (e: React.DragEvent) => void,
    label = 'Solte aqui',
  ) => (
    <div
      className={`${width === 'full' ? 'sm:col-span-2' : ''} min-h-[5.5rem]`}
      data-drop-id={targetId}
      onDragOver={(e) => onCanvasDragOver(e, targetId)}
      onDrop={onDrop}
    >
      <div
        className={`${dropZoneCls(true)} h-full min-h-[5.5rem] w-full animate-[formDropSlotIn_0.28s_cubic-bezier(0.22,1,0.36,1)_both]`}
      >
        {label}
      </div>
    </div>
  );

  /**
   * Metade esquerda (ou superior, em largura total) insere antes do campo;
   * metade direita (ou inferior) insere depois.
   */
  const resolveInsertEdge = (
    e: React.DragEvent<HTMLElement>,
    spanFull: boolean,
  ): 'before' | 'after' => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (spanFull) {
      return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    }
    return e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-transparent">
      <style>{`
        @keyframes formFieldDropIn {
          0% { opacity: 0; transform: translateY(10px) scale(0.96); }
          60% { opacity: 1; transform: translateY(-2px) scale(1.01); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes formDropSlotIn {
          0% { opacity: 0; transform: scale(0.92); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
      {/* Sidebar de componentes — translúcida para o padrão engenharia aparecer */}
      <aside className="flex h-full w-[340px] shrink-0 flex-col border-r border-gray-200/80 bg-white/90 backdrop-blur-sm dark:border-gray-800/80 dark:bg-gray-900/85">
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

              {sections.map((section, sectionIdx) => {
                const belowTargetId = `below:${section.id}`;
                const draggedWidth = resolveDraggedFieldWidth();
                const layoutQuestions =
                  dragKind === 'field-move' && draggedField?.sectionId === section.id
                    ? section.questions.filter((q) => q.id !== draggedField.questionId)
                    : section.questions;

                return (
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
                    {(() => {
                      const moving = dragKind === 'field-move' && !!draggedField;
                      const draggedQuestion = moving
                        ? allSections
                            .find((s) => s.id === draggedField.sectionId)
                            ?.questions.find((q) => q.id === draggedField.questionId)
                        : undefined;
                      const insertAt = moving
                        ? parseSequenceInsertIndex(
                            layoutQuestions,
                            dropTarget,
                            section.id,
                          )
                        : null;
                      const gridItems = moving
                        ? buildSequencePreviewItems(
                            section.questions,
                            draggedQuestion,
                            insertAt,
                          )
                        : section.questions.map((q) => ({
                            key: q.id,
                            kind: 'question' as const,
                            question: q,
                          }));
                      const lastRemaining = layoutQuestions[layoutQuestions.length - 1];
                      const lastCol =
                        layoutQuestions.length > 0
                          ? questionGridColumn(
                              layoutQuestions,
                              layoutQuestions.length - 1,
                            )
                          : null;
                      const afterLastId =
                        lastRemaining && moving
                          ? `insert:${section.id}:${lastRemaining.id}:after`
                          : null;
                      const showAfterLastHit =
                        !!afterLastId &&
                        lastCol === 1 &&
                        insertAt !== layoutQuestions.length;

                      return (
                        <>
                          {gridItems.map((item) => {
                        if (item.kind === 'placeholder') {
                          const placeholderId = dropTarget ?? `below:${section.id}`;
                          return (
                            <React.Fragment key={item.key}>
                              {renderFieldDropSlot(
                                placeholderId,
                                item.width,
                                (e) => e.preventDefault(),
                              )}
                            </React.Fragment>
                          );
                        }

                        const question = item.question;
                        const spanFull = resolveFieldWidth(question) === 'full';
                        const fieldWidth = resolveFieldWidth(question);
                        const hasOptionsModal = FORM_FIELD_TYPES_WITH_OPTIONS.includes(
                          question.type,
                        );
                        const beforeTargetId = `insert:${section.id}:${question.id}:before`;
                        const afterTargetId = `insert:${section.id}:${question.id}:after`;
                        const layoutIndex = layoutQuestions.findIndex((q) => q.id === question.id);
                        const canReceiveDrop =
                          isFieldDragging && dragKind === 'field';
                        const dropsBesideField =
                          !spanFull &&
                          layoutIndex >= 0 &&
                          fieldColumn(layoutQuestions, layoutIndex) === 1;
                        const isBeforeActive =
                          dragKind === 'field' && dropTarget === beforeTargetId;
                        const isAfterActive =
                          dragKind === 'field' && dropTarget === afterTargetId;
                        const afterSlotWidth = dropsBesideField ? 'half' : draggedWidth;

                        const dropPayload = (edge: 'before' | 'after') => ({
                          sectionId: section.id,
                          ...(edge === 'before'
                            ? { beforeQuestionId: question.id }
                            : { afterQuestionId: question.id }),
                          ...(edge === 'after' && dropsBesideField ? { side: true } : {}),
                        });

                        return (
                          <React.Fragment key={question.id}>
                            {isBeforeActive
                              ? renderFieldDropSlot(
                                  beforeTargetId,
                                  draggedWidth,
                                  (e) => onCanvasDrop(e, dropPayload('before')),
                                )
                              : null}
                            <div
                              ref={(el) => {
                                if (el) fieldElsRef.current.set(question.id, el);
                                else fieldElsRef.current.delete(question.id);
                              }}
                              data-field-card
                              data-section-id={section.id}
                              data-question-id={question.id}
                              data-span-full={spanFull ? '1' : '0'}
                              className={`${spanFull ? 'sm:col-span-2' : ''} group relative min-w-0 ${
                                justAddedId === question.id
                                  ? 'animate-[formFieldDropIn_0.4s_ease-out]'
                                  : ''
                              }`}
                              onDragOver={
                                canReceiveDrop
                                  ? (e) =>
                                      onCanvasDragOver(
                                        e,
                                        resolveInsertEdge(e, spanFull) === 'before'
                                          ? beforeTargetId
                                          : afterTargetId,
                                      )
                                  : undefined
                              }
                              onDrop={
                                canReceiveDrop
                                  ? (e) =>
                                      onCanvasDrop(e, dropPayload(resolveInsertEdge(e, spanFull)))
                                  : undefined
                              }
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
                                onGripPointerDown={onGripPointerDown}
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
                            </div>
                            {isAfterActive
                              ? renderFieldDropSlot(
                                  afterTargetId,
                                  afterSlotWidth,
                                  (e) => onCanvasDrop(e, dropPayload('after')),
                                  dropsBesideField ? 'Solte aqui do lado' : 'Solte aqui',
                                )
                              : null}
                          </React.Fragment>
                        );
                      })}
                          {showAfterLastHit && afterLastId ? (
                            <div
                              data-drop-id={afterLastId}
                              className="min-h-[5.5rem]"
                              aria-hidden
                            />
                          ) : null}
                        </>
                      );
                    })()}

                    {dropTarget === belowTargetId && dragKind !== 'field-move'
                      ? renderFieldDropSlot(
                          belowTargetId,
                          draggedWidth,
                          (e) => onCanvasDrop(e, { sectionId: section.id }),
                          'Solte aqui embaixo',
                        )
                      : null}
                  </div>

                  {isFieldDragging ? (
                    <div
                      data-drop-id={belowTargetId}
                      onDragOver={(e) => onCanvasDragOver(e, belowTargetId)}
                      onDrop={(e) => onCanvasDrop(e, { sectionId: section.id })}
                      className="h-8 w-full"
                      aria-hidden
                    />
                  ) : null}
                </section>
                );
              })}

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
      {dragging && dragPreviewLabel && dragPointer
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[100000] flex max-w-xs items-center gap-2 rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-xl dark:border-red-500/70 dark:bg-gray-900 dark:text-gray-100"
              style={{ left: dragPointer.x + 16, top: dragPointer.y + 12 }}
            >
              <GripVertical className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="truncate">{dragPreviewLabel}</span>
            </div>,
            document.body,
          )
        : null}
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
