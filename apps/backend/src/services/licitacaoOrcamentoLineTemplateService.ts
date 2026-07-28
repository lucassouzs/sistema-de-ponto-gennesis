import {
  DEFAULT_LICITACAO_ORCAMENTO_EXPENSE_TYPES,
  linesToTemplate,
  type LicitacaoOrcamentoExpenseType,
  type LicitacaoOrcamentoLine,
  type LicitacaoOrcamentoLineTemplateItem,
  type LicitacaoOrcamentoLineTemplatePayload,
} from '../lib/licitacaoOrcamentoCalc';
import { licitacaoConfigGet, licitacaoConfigSet } from './licitacaoConfigStore';

export const ORCAMENTO_LINE_TEMPLATE_KEY = 'orcamento_line_template';

function parseExpenseTypes(raw: unknown): LicitacaoOrcamentoExpenseType[] {
  const defaults = DEFAULT_LICITACAO_ORCAMENTO_EXPENSE_TYPES.map((item) => ({ ...item }));
  if (!Array.isArray(raw)) return defaults;
  const byId = new Map<string, LicitacaoOrcamentoExpenseType>();
  for (const item of defaults) byId.set(item.id, item);
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const id =
      typeof row.id === 'string'
        ? row.id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
        : '';
    if (!id || !/^[a-z]/.test(id)) continue;
    const label =
      typeof row.label === 'string' && row.label.trim() ? row.label.trim() : id;
    const builtin =
      row.builtin === true ||
      DEFAULT_LICITACAO_ORCAMENTO_EXPENSE_TYPES.some((d) => d.id === id);
    byId.set(id, { id, label, builtin });
  }
  return Array.from(byId.values());
}

function parseTemplateLines(raw: unknown): LicitacaoOrcamentoLineTemplateItem[] {
  if (!Array.isArray(raw)) return [];
  const out: LicitacaoOrcamentoLineTemplateItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : '';
    const category =
      typeof row.category === 'string'
        ? row.category.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
        : '';
    if (!id || !category) continue;
    out.push({
      id,
      category,
      description: typeof row.description === 'string' ? row.description : '',
    });
  }
  return out;
}

function parseTemplatePayload(raw: unknown): LicitacaoOrcamentoLineTemplatePayload {
  // Formato antigo: array de linhas
  if (Array.isArray(raw)) {
    return {
      expenseTypes: DEFAULT_LICITACAO_ORCAMENTO_EXPENSE_TYPES.map((item) => ({ ...item })),
      lines: parseTemplateLines(raw),
    };
  }
  if (!raw || typeof raw !== 'object') {
    return {
      expenseTypes: DEFAULT_LICITACAO_ORCAMENTO_EXPENSE_TYPES.map((item) => ({ ...item })),
      lines: [],
    };
  }
  const o = raw as Record<string, unknown>;
  return {
    expenseTypes: parseExpenseTypes(o.expenseTypes),
    lines: parseTemplateLines(o.lines ?? o),
  };
}

export async function getLicitacaoOrcamentoLineTemplate(): Promise<
  LicitacaoOrcamentoLineTemplatePayload
> {
  try {
    const stored = await licitacaoConfigGet(ORCAMENTO_LINE_TEMPLATE_KEY);
    return parseTemplatePayload(stored);
  } catch {
    return {
      expenseTypes: DEFAULT_LICITACAO_ORCAMENTO_EXPENSE_TYPES.map((item) => ({ ...item })),
      lines: [],
    };
  }
}

export async function saveLicitacaoOrcamentoLineTemplate(params: {
  expenseTypes: LicitacaoOrcamentoExpenseType[];
  lines: LicitacaoOrcamentoLine[] | LicitacaoOrcamentoLineTemplateItem[];
}): Promise<LicitacaoOrcamentoLineTemplatePayload> {
  const payload: LicitacaoOrcamentoLineTemplatePayload = {
    expenseTypes:
      params.expenseTypes.length > 0
        ? params.expenseTypes.map((item) => ({
            id: item.id,
            label: item.label,
            builtin: item.builtin === true,
          }))
        : DEFAULT_LICITACAO_ORCAMENTO_EXPENSE_TYPES.map((item) => ({ ...item })),
    lines: linesToTemplate(
      params.lines.map((item) => ({
        id: item.id,
        category: item.category,
        description: item.description,
        amount: 'amount' in item ? Number((item as LicitacaoOrcamentoLine).amount) || 0 : 0,
      }))
    ),
  };
  await licitacaoConfigSet(ORCAMENTO_LINE_TEMPLATE_KEY, payload);
  return payload;
}
