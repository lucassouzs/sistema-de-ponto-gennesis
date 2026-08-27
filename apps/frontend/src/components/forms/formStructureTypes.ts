export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
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
  followUp?: FormFollowUp | null;
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  questions: FormQuestion[];
}

export interface FormTemplateSummary {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormTemplate extends FormTemplateSummary {
  sections: FormSection[];
}

export const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: 'Texto curto',
  textarea: 'Texto longo',
  number: 'Número',
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

/** Tipos com opções/colunas editáveis via modal. */
export const FORM_FIELD_TYPES_WITH_OPTIONS: FormFieldType[] = [
  'dropdown',
  'checklist',
  'pills',
  'checkbox',
  'table',
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
