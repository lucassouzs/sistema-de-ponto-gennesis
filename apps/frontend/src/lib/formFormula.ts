import type {
  FormFieldFormula,
  FormFieldFormulaOp,
  FormFieldFormulaResultFormat,
  FormQuestion,
  FormSection,
} from '@/components/forms/formStructureTypes';
import { parseCurrencyInputBr } from '@/lib/maskCurrencyBr';
import { parsePercentInput } from '@/lib/maskPercent';

export const FORM_FORMULA_OP_LABELS: Record<FormFieldFormulaOp, string> = {
  sum: 'Soma',
  subtract: 'Subtração',
  multiply: 'Multiplicação',
  divide: 'Divisão',
};

export const FORM_NUMERIC_FIELD_TYPES = new Set(['number', 'valor', 'percent']);

/** Tipos que podem receber configuração de fórmula no construtor. */
export const FORM_FORMULA_FIELD_TYPES = new Set(['number', 'valor', 'percent']);

export function isNumericFormFieldType(type: string): boolean {
  return FORM_NUMERIC_FIELD_TYPES.has(type);
}

export function isFormulaCapableFieldType(type: string): boolean {
  return FORM_FORMULA_FIELD_TYPES.has(type);
}

/** Origem permitida na fórmula: mesmo tipo do destino, exceto % (aceita número, valor ou %). */
export function canUseAsFormulaSource(
  target: Pick<FormQuestion, 'type' | 'id'> | null | undefined,
  source: Pick<FormQuestion, 'type' | 'id'>,
): boolean {
  if (!target || target.id === source.id) return false;
  if (!isFormulaCapableFieldType(source.type)) return false;
  if (target.type === 'percent') return true;
  if (!isFormulaCapableFieldType(target.type)) return false;
  return source.type === target.type;
}

export function filterFormulaSourceQuestions(
  target: Pick<FormQuestion, 'type' | 'id'> | null | undefined,
  allQuestions: FormQuestion[],
): FormQuestion[] {
  return allQuestions.filter((q) => canUseAsFormulaSource(target, q));
}

export function questionHasFormula(question: Pick<FormQuestion, 'formula'> | null | undefined): boolean {
  return !!(question?.formula?.sourceIds?.length);
}

export function isQuestionReadOnly(
  question: Pick<FormQuestion, 'readOnly' | 'formula'>,
): boolean {
  return questionHasFormula(question) || question.readOnly === true;
}

export function formulaResultFormat(
  question: Pick<FormQuestion, 'type' | 'formula'>,
): FormFieldFormulaResultFormat {
  if (question.formula?.resultFormat) return question.formula.resultFormat;
  if (question.type === 'valor') return 'valor';
  if (question.type === 'percent') return 'percent';
  return 'number';
}

export function getNumericFieldValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value);
  const fromCurrency = parseCurrencyInputBr(raw);
  if (fromCurrency !== null) return fromCurrency;
  const fromPercent = parsePercentInput(raw);
  if (fromPercent !== null) return fromPercent;
  const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function evaluateFormula(
  formula: FormFieldFormula,
  answers: Record<string, { value?: string | number | null } | undefined>,
): number | null {
  const values = formula.sourceIds.map((id) => getNumericFieldValue(answers[id]?.value));
  if (values.some((v) => v === null)) return null;
  const nums = values as number[];

  switch (formula.op) {
    case 'sum':
      return nums.reduce((acc, v) => acc + v, 0);
    case 'subtract':
      if (nums.length < 2) return null;
      return nums.slice(1).reduce((acc, v) => acc - v, nums[0]!);
    case 'multiply':
      return nums.reduce((acc, v) => acc * v, 1);
    case 'divide': {
      if (nums.length < 2 || nums[1] === 0) return null;
      return nums[0]! / nums[1]!;
    }
    default:
      return null;
  }
}

export function describeFormula(
  formula: FormFieldFormula | undefined,
  questionsById: Map<string, FormQuestion>,
): string {
  if (!formula?.sourceIds.length) return 'Configure a fórmula';
  const labels = formula.sourceIds.map((id) => {
    const q = questionsById.get(id);
    return q?.title?.trim() || 'Campo';
  });
  const op = FORM_FORMULA_OP_LABELS[formula.op] ?? formula.op;
  if (labels.length === 1) return `${op}: ${labels[0]}`;
  if (labels.length === 2) return `${labels[0]} ${op.toLowerCase()} ${labels[1]}`;
  return `${op}: ${labels.join(', ')}`;
}

export function flattenFormQuestions(
  data: { sections?: FormSection[]; steps?: { sections: FormSection[] }[] },
): FormQuestion[] {
  if (data.sections?.length) {
    return data.sections.flatMap((s) => s.questions ?? []);
  }
  if (data.steps?.length) {
    return data.steps.flatMap((step) =>
      (step.sections ?? []).flatMap((section) => section.questions ?? []),
    );
  }
  return [];
}
