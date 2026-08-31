export type FormFieldType =
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

/** Largura do campo no grid do formulário. */
export type FormFieldWidth = 'half' | 'full';

export type FormFieldFormulaOp = 'sum' | 'subtract' | 'multiply' | 'divide';

export type FormFieldFormulaResultFormat = 'number' | 'valor' | 'percent';

export interface FormFieldFormula {
  op: FormFieldFormulaOp;
  sourceIds: string[];
  resultFormat?: FormFieldFormulaResultFormat;
}

export type FormTableColumnAlign = 'left' | 'center' | 'right';

export type FormTableColumnType = 'text' | 'number' | 'valor' | 'percent';

export interface FormTableColumn {
  id: string;
  title: string;
  align?: FormTableColumnAlign;
  bold?: boolean;
  type?: FormTableColumnType;
}

export interface FormFollowUp {
  whenValue: string;
  type: 'text' | 'textarea' | 'pills';
  placeholder?: string;
  options?: string[];
}

export interface FormQuestion {
  id: string;
  title: string;
  type: FormFieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  /** `half` = 50% (lado a lado); `full` = 100% da linha */
  width?: FormFieldWidth;
  /** Quando true, o campo não pode ser editado no preenchimento. */
  readOnly?: boolean;
  /** Configuração de cálculo automático (tipo `formula`). */
  formula?: FormFieldFormula;
  /** Colunas configuráveis (tipo `table`). */
  tableColumns?: FormTableColumn[];
  followUp?: FormFollowUp | null;
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  questions: FormQuestion[];
}

export interface FormStep {
  id: string;
  title: string;
  description?: string;
  sections: FormSection[];
}

export interface FormTemplateSummary {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormTemplate extends FormTemplateSummary {
  /** Quando true, o formulário é dividido em etapas no preenchimento. */
  multiStepEnabled?: boolean;
  steps?: FormStep[];
  sections: FormSection[];
}

export const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: 'Texto curto',
  textarea: 'Texto longo',
  number: 'Número',
  valor: 'Valor',
  percent: 'Porcentagem',
  date: 'Data',
  datetime: 'Data e hora',
  sim_nao: 'Sim / Não',
  dropdown: 'Lista',
  checkbox: 'Checkbox',
  checklist: 'Checklist',
  pills: 'Opções (botões)',
  profiles: 'Perfis',
  rating: 'Nota 1 a 5',
  slider: 'Controle deslizante',
  attachment: 'Anexos',
  image: 'Imagem',
  table: 'Tabela',
  qrcode: 'QR Code',
  signature: 'Assinatura',
};

/** Tipos com opções editáveis via modal genérico. */
export const FORM_FIELD_TYPES_WITH_OPTIONS: FormFieldType[] = [
  'dropdown',
  'checklist',
  'pills',
  'checkbox',
];

export function formFieldOptionsModalCopy(type: FormFieldType): {
  title: string;
  description: string;
  addLabel: string;
  emptyLabel: string;
  itemPlaceholder: (index: number) => string;
} {
  if (type === 'table') {
    return {
      title: 'Colunas da tabela',
      description: 'Adicione e edite os nomes das colunas.',
      addLabel: 'Adicionar coluna',
      emptyLabel: 'Nenhuma coluna ainda',
      itemPlaceholder: (i) => `Coluna ${i + 1}`,
    };
  }
  if (type === 'checkbox') {
    return {
      title: 'Texto da opção',
      description: 'Edite o texto exibido ao lado do checkbox.',
      addLabel: 'Adicionar opção',
      emptyLabel: 'Nenhuma opção ainda',
      itemPlaceholder: (i) => `Opção ${i + 1}`,
    };
  }
  return {
    title: 'Opções',
    description: 'Adicione e edite as opções deste campo.',
    addLabel: 'Adicionar opção',
    emptyLabel: 'Nenhuma opção ainda',
    itemPlaceholder: (i) => `Opção ${i + 1}`,
  };
}

const FULL_WIDTH_TYPES = new Set<FormFieldType>([
  'textarea',
  'checklist',
  'rating',
  'slider',
  'table',
  'qrcode',
  'signature',
]);

export function defaultFieldWidth(type: FormFieldType): FormFieldWidth {
  return FULL_WIDTH_TYPES.has(type) ? 'full' : 'half';
}

export function resolveFieldWidth(question: FormQuestion): FormFieldWidth {
  return question.width || defaultFieldWidth(question.type);
}

export function formUid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function newFormQuestion(): FormQuestion {
  return {
    id: formUid(),
    title: 'Nova pergunta',
    type: 'textarea',
    required: false,
    width: 'full',
    followUp: null,
  };
}

export function newFormSection(): FormSection {
  return {
    id: formUid(),
    title: 'Nova seção',
    description: '',
    questions: [newFormQuestion()],
  };
}

export function newFormStep(title = 'Nova etapa'): FormStep {
  return {
    id: formUid(),
    title,
    description: '',
    sections: [],
  };
}

export function normalizeFormQuestion(question: FormQuestion): FormQuestion {
  if ((question.type as string) !== 'formula') return question;

  const resultFormat = question.formula?.resultFormat ?? 'valor';
  const type: FormFieldType =
    resultFormat === 'percent' ? 'percent' : resultFormat === 'valor' ? 'valor' : 'number';

  return {
    ...question,
    type,
    readOnly: true,
    placeholder:
      question.placeholder === 'Calculado automaticamente' ? '' : question.placeholder,
  };
}

export function normalizeFormSection(section: FormSection): FormSection {
  return {
    ...section,
    questions: (section.questions ?? []).map(normalizeFormQuestion),
  };
}

export function normalizeFormSteps(data: {
  steps?: FormStep[];
  sections?: FormSection[];
}): FormStep[] {
  if (data.steps?.length) {
    return data.steps.map((step) => ({
      id: step.id || formUid(),
      title: step.title?.trim() || 'Nova etapa',
      description: step.description?.trim() || '',
      sections: Array.isArray(step.sections)
        ? step.sections.map(normalizeFormSection)
        : [],
    }));
  }

  const sections = data.sections?.length
    ? data.sections.map(normalizeFormSection)
    : [newFormSection()];
  return [
    {
      id: formUid(),
      title: 'Etapa 1',
      description: '',
      sections,
    },
  ];
}

export function flattenFormSections(steps: FormStep[]): FormSection[] {
  return steps.flatMap((step) => step.sections);
}

export type FormEditorStructure = {
  multiStepEnabled: boolean;
  steps: FormStep[];
  sections: FormSection[];
};

export function loadFormEditorStructure(tpl: {
  multiStepEnabled?: boolean;
  steps?: FormStep[];
  sections?: FormSection[];
}): FormEditorStructure {
  const multiStepEnabled = tpl.multiStepEnabled === true;

  if (multiStepEnabled) {
    return {
      multiStepEnabled: true,
      steps: normalizeFormSteps({ steps: tpl.steps, sections: tpl.sections }),
      sections: [],
    };
  }

  if (tpl.sections?.length) {
    return {
      multiStepEnabled: false,
      steps: [],
      sections: tpl.sections.map(normalizeFormSection),
    };
  }

  if (tpl.steps?.length === 1) {
    return {
      multiStepEnabled: false,
      steps: [],
      sections: tpl.steps[0]!.sections.map(normalizeFormSection),
    };
  }

  return { multiStepEnabled: false, steps: [], sections: [newFormSection()] };
}

export function buildFormSavePayload(structure: FormEditorStructure) {
  if (structure.multiStepEnabled) {
    return {
      multiStepEnabled: true,
      steps: structure.steps,
      sections: flattenFormSections(structure.steps),
    };
  }

  return {
    multiStepEnabled: false,
    steps: undefined,
    sections: structure.sections,
  };
}
