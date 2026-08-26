export type FormFieldType = 'text' | 'textarea' | 'sim_nao' | 'pills' | 'rating';

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
  sim_nao: 'Sim / Não',
  pills: 'Opções (botões)',
  rating: 'Nota 1 a 5',
};

export function formUid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function newFormQuestion(): FormQuestion {
  return {
    id: formUid(),
    title: 'Nova pergunta',
    type: 'textarea',
    required: false,
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
