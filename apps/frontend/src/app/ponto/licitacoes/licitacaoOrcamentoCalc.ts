/** Cálculo de orçamento de participação em licitação (manutenção predial). */

/** Chave técnica do tipo de gasto (variável nas fórmulas). Built-ins: pessoal, material, … */
export type LicitacaoOrcamentoLineCategory = string;

export type LicitacaoOrcamentoExpenseType = {
  id: string;
  label: string;
  /** Tipos padrão do sistema (não podem ser excluídos). */
  builtin?: boolean;
};

export type LicitacaoOrcamentoLine = {
  id: string;
  category: LicitacaoOrcamentoLineCategory;
  description: string;
  amount: number;
};

export const DEFAULT_LICITACAO_ORCAMENTO_EXPENSE_TYPES: LicitacaoOrcamentoExpenseType[] = [
  { id: 'pessoal', label: 'Mão de Obra', builtin: true },
  { id: 'material', label: 'Material', builtin: true },
  { id: 'sistemas', label: 'Sistemas', builtin: true },
  { id: 'administrativo', label: 'Administrativo', builtin: true },
  { id: 'outros', label: 'Outros', builtin: true },
];

/** @deprecated Use DEFAULT_LICITACAO_ORCAMENTO_EXPENSE_TYPES */
export const LICITACAO_ORCAMENTO_CATEGORIES = DEFAULT_LICITACAO_ORCAMENTO_EXPENSE_TYPES.map(
  (item) => ({ value: item.id, label: item.label })
);

const RESERVED_FORMULA_NAMES = new Set([
  'max',
  'min',
  'encargos_sociais',
  'encargos_sociais_pct',
  'custo_indireto',
  'custo_indireto_pct',
  'lucro',
  'lucro_pct',
  'tributo',
  'tributo_pct',
  'margem_minima',
  'margem_minima_pct',
  'preco_referencia_edital',
  'desconto_simulado',
  'desconto_simulado_pct',
  'custo_direto_total',
  'encargos_sociais_valor',
  'bdi_percent',
  'bdi_valor',
  'custo_indireto_total',
  'impostos_valor',
  'preco_minimo_viavel',
  'desconto_maximo_percentual',
  'preco_lance_simulado',
  'margem_real_simulada',
]);

export function slugifyExpenseTypeKey(
  label: string,
  existingIds: string[] = []
): string {
  let base = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!base) base = 'gasto';
  if (!/^[a-z]/.test(base)) base = `gasto_${base}`;
  const taken = new Set([...existingIds, ...RESERVED_FORMULA_NAMES]);
  let key = base;
  let n = 2;
  while (taken.has(key)) {
    key = `${base}_${n++}`;
  }
  return key;
}

export function buildCustoDiretoFormula(expenseTypes: LicitacaoOrcamentoExpenseType[]): string {
  if (expenseTypes.length === 0) return '0';
  return expenseTypes.map((item) => item.id).join(' + ');
}

/**
 * Detecta fórmulas gerenciadas automaticamente (só soma de identificadores).
 * Não exige match exato com os tipos atuais — assim, ao adicionar/remover tipo,
 * a fórmula antiga ainda é reconhecida e reescrita.
 */
export function isAutoCustoDiretoFormula(expression: string): boolean {
  const normalized = expression.replace(/\s+/g, '').trim();
  if (!normalized || normalized === '0') return true;
  const legacyDefault = 'pessoal+material+sistemas+administrativo+outros';
  if (normalized === legacyDefault) return true;
  return /^[a-z][a-z0-9_]*(?:\+[a-z][a-z0-9_]*)*$/i.test(normalized);
}

/** Entrada em R$ ou % — o outro lado é calculado sobre a base (custo direto + encargos). */
export type DualMoneyPercentMode = 'money' | 'percent';

export type DualMoneyPercent = {
  mode: DualMoneyPercentMode;
  money: number;
  percent: number;
};

export function emptyDualMoneyPercent(
  mode: DualMoneyPercentMode = 'money'
): DualMoneyPercent {
  return { mode, money: 0, percent: 0 };
}

export type LicitacaoOrcamentoFormulaKey =
  | 'custo_direto_total'
  | 'encargos_sociais_valor'
  | 'bdi_percent'
  | 'bdi_valor'
  | 'custo_indireto_total'
  | 'impostos_valor'
  | 'preco_minimo_viavel'
  | 'desconto_maximo_percentual'
  | 'preco_lance_simulado'
  | 'margem_real_simulada';

export const LICITACAO_ORCAMENTO_FORMULA_ORDER: LicitacaoOrcamentoFormulaKey[] = [
  'custo_direto_total',
  'encargos_sociais_valor',
  'custo_indireto_total',
  'bdi_valor',
  'bdi_percent',
  'preco_minimo_viavel',
  'impostos_valor',
  'desconto_maximo_percentual',
  'preco_lance_simulado',
  'margem_real_simulada',
];

export const DEFAULT_LICITACAO_ORCAMENTO_FORMULAS: Record<
  LicitacaoOrcamentoFormulaKey,
  string
> = {
  custo_direto_total: 'pessoal + material + sistemas + administrativo + outros',
  encargos_sociais_valor: 'pessoal * encargos_sociais_pct / 100',
  bdi_percent:
    '(bdi_valor / max(custo_direto_total + encargos_sociais_valor, 0.0001)) * 100',
  bdi_valor: 'custo_indireto + lucro + tributo',
  custo_indireto_total: 'custo_indireto',
  preco_minimo_viavel:
    '(custo_direto_total + encargos_sociais_valor + bdi_valor) / max(1 - margem_minima_pct / 100, 0.0001)',
  impostos_valor: 'tributo',
  desconto_maximo_percentual:
    '((preco_referencia_edital - preco_minimo_viavel) / max(preco_referencia_edital, 0.0001)) * 100',
  preco_lance_simulado:
    'preco_referencia_edital * (1 - desconto_simulado_pct / 100)',
  margem_real_simulada:
    '((preco_lance_simulado - custo_direto_total - encargos_sociais_valor - bdi_valor) / max(preco_lance_simulado, 0.0001)) * 100',
};

/** Fórmulas antigas (BDI em %) que quebram com custo_indireto/lucro/tributo em R$. */
const LEGACY_LICITACAO_ORCAMENTO_FORMULAS: Partial<
  Record<LicitacaoOrcamentoFormulaKey, string[]>
> = {
  bdi_percent: [
    '(((1 + custo_indireto_pct / 100) * (1 + lucro_pct / 100) / (1 - tributo_pct / 100)) - 1) * 100',
  ],
  bdi_valor: [
    '(custo_direto_total + encargos_sociais_valor) * bdi_percent / 100',
  ],
  custo_indireto_total: [
    '(custo_direto_total + encargos_sociais_valor) * custo_indireto_pct / 100',
  ],
  preco_minimo_viavel: [
    '(custo_direto_total + encargos_sociais_valor + bdi_valor) / max(1 - margem_minima_pct / 100 - tributo_pct / 100, 0.0001)',
  ],
  impostos_valor: ['preco_minimo_viavel * tributo_pct / 100'],
  margem_real_simulada: [
    '((preco_lance_simulado - custo_direto_total - encargos_sociais_valor - bdi_valor - preco_lance_simulado * tributo_pct / 100) / max(preco_lance_simulado, 0.0001)) * 100',
  ],
};

function normalizeFormulaExpression(expression: string): string {
  return expression.replace(/\s+/g, ' ').trim();
}

function migrateLegacyFormulas(
  formulas: Record<LicitacaoOrcamentoFormulaKey, string>
): Record<LicitacaoOrcamentoFormulaKey, string> {
  const next = { ...formulas };
  for (const key of LICITACAO_ORCAMENTO_FORMULA_ORDER) {
    const current = normalizeFormulaExpression(next[key] ?? '');
    const legacyList = LEGACY_LICITACAO_ORCAMENTO_FORMULAS[key] ?? [];
    const isLegacy = legacyList.some(
      (legacy) => normalizeFormulaExpression(legacy) === current
    );
    // BDI (R$) não pode depender de bdi_percent (avaliado depois).
    const bdiValorDependsOnPercent =
      key === 'bdi_valor' && /\bbdi_percent\b/.test(current);
    if (isLegacy || bdiValorDependsOnPercent) {
      next[key] = DEFAULT_LICITACAO_ORCAMENTO_FORMULAS[key];
    }
  }
  return next;
}

export const LICITACAO_ORCAMENTO_FORMULA_LABELS: Record<
  LicitacaoOrcamentoFormulaKey,
  string
> = {
  custo_direto_total: 'Custo direto total',
  encargos_sociais_valor: 'Encargos sociais (R$)',
  bdi_percent: 'BDI (%)',
  bdi_valor: 'BDI (R$)',
  custo_indireto_total: 'Custo indireto total',
  impostos_valor: 'Impostos (R$)',
  preco_minimo_viavel: 'Preço mínimo viável',
  desconto_maximo_percentual: 'Desconto máximo (%)',
  preco_lance_simulado: 'Preço do lance (simulação)',
  margem_real_simulada: 'Margem real no desconto simulado (%)',
};

/** Campos disponíveis nas fórmulas (nome técnico → descrição). */
export function getLicitacaoOrcamentoFormulaFieldGroups(
  expenseTypes: LicitacaoOrcamentoExpenseType[] = DEFAULT_LICITACAO_ORCAMENTO_EXPENSE_TYPES
): Array<{
  title: string;
  fields: Array<{ name: string; label: string }>;
}> {
  return [
    {
      title: 'Totais dos tipos de gasto (soma das linhas)',
      fields: expenseTypes.map((item) => ({ name: item.id, label: item.label })),
    },
    {
      title: 'Valores informados',
      fields: [
        { name: 'encargos_sociais', label: 'Encargos sociais (R$)' },
        { name: 'encargos_sociais_pct', label: 'Encargos sociais (%)' },
        { name: 'custo_indireto', label: 'Custo indireto (R$)' },
        { name: 'custo_indireto_pct', label: 'Custo indireto (%)' },
        { name: 'lucro', label: 'Lucro (R$)' },
        { name: 'lucro_pct', label: 'Lucro (%)' },
        { name: 'tributo', label: 'Tributo (R$)' },
        { name: 'tributo_pct', label: 'Tributo (%)' },
        { name: 'margem_minima', label: 'Margem mínima (R$)' },
        { name: 'margem_minima_pct', label: 'Margem mínima (%)' },
        { name: 'preco_referencia_edital', label: 'Preço-teto / referência do edital' },
        { name: 'desconto_simulado', label: 'Desconto simulado (R$)' },
        { name: 'desconto_simulado_pct', label: 'Desconto simulado (%)' },
      ],
    },
    {
      title: 'Resultados das fórmulas (podem ser usados nas seguintes)',
      fields: LICITACAO_ORCAMENTO_FORMULA_ORDER.map((name) => ({
        name,
        label: LICITACAO_ORCAMENTO_FORMULA_LABELS[name],
      })),
    },
    {
      title: 'Funções',
      fields: [
        { name: 'max(a, b)', label: 'Maior valor entre a e b' },
        { name: 'min(a, b)', label: 'Menor valor entre a e b' },
      ],
    },
  ];
}

/** @deprecated Use getLicitacaoOrcamentoFormulaFieldGroups() */
export const LICITACAO_ORCAMENTO_FORMULA_FIELD_GROUPS =
  getLicitacaoOrcamentoFormulaFieldGroups();

export type LicitacaoOrcamentoInputs = {
  gastoPessoal: number;
  gastoMaterial: number;
  gastoSistemas: number;
  gastoAdministrativo: number;
  gastoOutros: number;
  /** @deprecated Use encargosSociais */
  encargosSociaisPercent?: number;
  /** @deprecated Use custoIndireto.money — mantido só na leitura legada. */
  custoIndiretoPercent?: number;
  /** @deprecated Use lucro.money */
  lucroPercent?: number;
  /** @deprecated Use tributo.money */
  tributoPercent?: number;
  /** @deprecated Use margemMinima */
  margemMinimaPercent?: number;
  /** @deprecated Use descontoSimulado */
  descontoSimuladoPercent?: number;
  expenseTypes: LicitacaoOrcamentoExpenseType[];
  encargosSociais: DualMoneyPercent;
  custoIndireto: DualMoneyPercent;
  lucro: DualMoneyPercent;
  tributo: DualMoneyPercent;
  margemMinima: DualMoneyPercent;
  descontoSimulado: DualMoneyPercent;
  precoReferenciaEdital: number;
  lines: LicitacaoOrcamentoLine[];
  /** @deprecated Totais sempre vêm da soma das linhas por categoria. */
  syncCategoryTotalsFromLines: boolean;
  formulas: Record<LicitacaoOrcamentoFormulaKey, string>;
  notes?: string;
};

export type LicitacaoOrcamentoLineTemplateItem = {
  id: string;
  category: LicitacaoOrcamentoLineCategory;
  description: string;
};

export type LicitacaoOrcamentoLineTemplatePayload = {
  expenseTypes: LicitacaoOrcamentoExpenseType[];
  lines: LicitacaoOrcamentoLineTemplateItem[];
};

export function linesToTemplate(
  lines: LicitacaoOrcamentoLine[]
): LicitacaoOrcamentoLineTemplateItem[] {
  return lines.map((line) => ({
    id: line.id,
    category: line.category,
    description: line.description.trim(),
  }));
}

export function templateToLines(
  template: LicitacaoOrcamentoLineTemplateItem[]
): LicitacaoOrcamentoLine[] {
  return template.map((item) => ({
    id: item.id,
    category: item.category,
    description: item.description,
    amount: 0,
  }));
}

export function withSyncedCustoDiretoFormula(
  inputs: LicitacaoOrcamentoInputs
): LicitacaoOrcamentoInputs {
  const current = inputs.formulas.custo_direto_total ?? '';
  if (!isAutoCustoDiretoFormula(current)) return inputs;
  return {
    ...inputs,
    formulas: {
      ...inputs.formulas,
      custo_direto_total: buildCustoDiretoFormula(inputs.expenseTypes),
    },
  };
}

export function addExpenseType(
  inputs: LicitacaoOrcamentoInputs,
  label: string
): LicitacaoOrcamentoInputs {
  const trimmed = label.trim();
  if (!trimmed) return inputs;
  const id = slugifyExpenseTypeKey(
    trimmed,
    inputs.expenseTypes.map((item) => item.id)
  );
  const expenseTypes = [
    ...inputs.expenseTypes,
    { id, label: trimmed, builtin: false },
  ];
  return withSyncedCustoDiretoFormula({ ...inputs, expenseTypes });
}

export function renameExpenseType(
  inputs: LicitacaoOrcamentoInputs,
  typeId: string,
  label: string
): LicitacaoOrcamentoInputs {
  const trimmed = label.trim();
  if (!trimmed) return inputs;
  return {
    ...inputs,
    expenseTypes: inputs.expenseTypes.map((item) =>
      item.id === typeId ? { ...item, label: trimmed } : item
    ),
  };
}

export function removeExpenseType(
  inputs: LicitacaoOrcamentoInputs,
  typeId: string
): LicitacaoOrcamentoInputs {
  const target = inputs.expenseTypes.find((item) => item.id === typeId);
  if (!target || target.builtin) return inputs;
  const expenseTypes = inputs.expenseTypes.filter((item) => item.id !== typeId);
  const lines = inputs.lines.filter((line) => line.category !== typeId);
  const next = { ...inputs, expenseTypes, lines };
  // Se a fórmula citava o tipo removido, força reescrita mesmo se o usuário
  // tiver editado manualmente (evita variável desconhecida → total zerado).
  const formula = next.formulas.custo_direto_total ?? '';
  if (isAutoCustoDiretoFormula(formula) || new RegExp(`\\b${typeId}\\b`).test(formula)) {
    return {
      ...next,
      formulas: {
        ...next.formulas,
        custo_direto_total: buildCustoDiretoFormula(expenseTypes),
      },
    };
  }
  return next;
}

export function applyCategoryTotalsFromLines(
  inputs: LicitacaoOrcamentoInputs
): LicitacaoOrcamentoInputs {
  const totals = resolveCategoryTotals(inputs);
  return {
    ...inputs,
    syncCategoryTotalsFromLines: true,
    gastoPessoal: totals.pessoal ?? 0,
    gastoMaterial: totals.material ?? 0,
    gastoSistemas: totals.sistemas ?? 0,
    gastoAdministrativo: totals.administrativo ?? 0,
    gastoOutros: totals.outros ?? 0,
  };
}

export type LicitacaoOrcamentoResult = {
  custoDiretoTotal: number;
  encargosSociaisValor: number;
  bdiPercent: number;
  bdiValor: number;
  custoIndiretoTotal: number;
  impostosValor: number;
  precoMinimoViavel: number;
  precoReferenciaEdital: number;
  descontoMaximoPercentual: number;
  precoLanceSimulado: number;
  margemRealSimulada: number;
  formulaValues: Record<LicitacaoOrcamentoFormulaKey, number>;
  formulaErrors: Partial<Record<LicitacaoOrcamentoFormulaKey, string>>;
};

export function emptyLicitacaoOrcamentoInputs(): LicitacaoOrcamentoInputs {
  const expenseTypes = DEFAULT_LICITACAO_ORCAMENTO_EXPENSE_TYPES.map((item) => ({
    ...item,
  }));
  return {
    gastoPessoal: 0,
    gastoMaterial: 0,
    gastoSistemas: 0,
    gastoAdministrativo: 0,
    gastoOutros: 0,
    expenseTypes,
    encargosSociais: emptyDualMoneyPercent('percent'),
    custoIndireto: emptyDualMoneyPercent('money'),
    lucro: emptyDualMoneyPercent('money'),
    tributo: emptyDualMoneyPercent('money'),
    margemMinima: emptyDualMoneyPercent('percent'),
    descontoSimulado: emptyDualMoneyPercent('percent'),
    precoReferenciaEdital: 0,
    lines: [],
    syncCategoryTotalsFromLines: true,
    formulas: {
      ...DEFAULT_LICITACAO_ORCAMENTO_FORMULAS,
      custo_direto_total: buildCustoDiretoFormula(expenseTypes),
    },
    notes: '',
  };
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Base dos encargos sociais: total de mão de obra (`pessoal`). */
export function resolveEncargosBase(inputs: {
  lines: LicitacaoOrcamentoLine[];
  expenseTypes?: LicitacaoOrcamentoExpenseType[];
}): number {
  return resolveCategoryTotals(inputs as LicitacaoOrcamentoInputs).pessoal ?? 0;
}

/** Base para BDI / margem: soma de todos os tipos de gasto + encargos sociais. */
export function resolveBdiComponentBase(inputs: LicitacaoOrcamentoInputs): number {
  const totals = resolveCategoryTotals(inputs);
  const custoDireto = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const encargos = asFiniteNumber(inputs.encargosSociais?.money);
  return custoDireto + encargos;
}

export function syncDualFromMoney(money: number, base: number): DualMoneyPercent {
  const m = Math.max(0, asFiniteNumber(money));
  const percent = base > 0 ? (m / base) * 100 : 0;
  return { mode: 'money', money: m, percent };
}

export function syncDualFromPercent(percent: number, base: number): DualMoneyPercent {
  const p = Math.max(0, asFiniteNumber(percent));
  const money = base > 0 ? (base * p) / 100 : 0;
  return { mode: 'percent', money, percent: p };
}

export function resyncDual(field: DualMoneyPercent, base: number): DualMoneyPercent {
  if (field.mode === 'percent') return syncDualFromPercent(field.percent, base);
  return syncDualFromMoney(field.money, base);
}

function normalizeDualMoneyPercent(
  raw: unknown,
  legacyValue: unknown,
  base: number,
  legacyAs: 'money' | 'percent' = 'money'
): DualMoneyPercent {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const mode: DualMoneyPercentMode = o.mode === 'percent' ? 'percent' : 'money';
    const money = asFiniteNumber(o.money);
    const percent = asFiniteNumber(o.percent);
    return resyncDual({ mode, money, percent }, base);
  }
  const legacy = asFiniteNumber(legacyValue);
  return legacyAs === 'percent'
    ? syncDualFromPercent(legacy, base)
    : syncDualFromMoney(legacy, base);
}

export function withResyncedDualFields(
  inputs: LicitacaoOrcamentoInputs
): LicitacaoOrcamentoInputs {
  const pessoalBase = resolveEncargosBase(inputs);
  const encargosSociais = resyncDual(inputs.encargosSociais, pessoalBase);
  const withEncargos: LicitacaoOrcamentoInputs = { ...inputs, encargosSociais };
  const bdiBase = resolveBdiComponentBase(withEncargos);
  const precoBase = asFiniteNumber(withEncargos.precoReferenciaEdital);
  return {
    ...withEncargos,
    custoIndireto: resyncDual(withEncargos.custoIndireto, bdiBase),
    lucro: resyncDual(withEncargos.lucro, bdiBase),
    tributo: resyncDual(withEncargos.tributo, bdiBase),
    margemMinima: resyncDual(withEncargos.margemMinima, bdiBase),
    descontoSimulado: resyncDual(withEncargos.descontoSimulado, precoBase),
  };
}

export function normalizeLicitacaoOrcamentoInputs(
  raw: unknown
): LicitacaoOrcamentoInputs {
  const base = emptyLicitacaoOrcamentoInputs();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;

  const linesRaw = Array.isArray(o.lines) ? o.lines : [];
  const lines: LicitacaoOrcamentoLine[] = [];
  for (const item of linesRaw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const categoryRaw = String(row.category ?? 'outros')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
    const category = categoryRaw || 'outros';
    lines.push({
      id: typeof row.id === 'string' && row.id.trim() ? row.id : `line-${lines.length + 1}`,
      category,
      description: typeof row.description === 'string' ? row.description : '',
      amount: asFiniteNumber(row.amount),
    });
  }

  const expenseTypes = normalizeExpenseTypes(o.expenseTypes, lines);

  const formulas = { ...DEFAULT_LICITACAO_ORCAMENTO_FORMULAS };
  if (o.formulas && typeof o.formulas === 'object' && !Array.isArray(o.formulas)) {
    for (const key of LICITACAO_ORCAMENTO_FORMULA_ORDER) {
      const value = (o.formulas as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) {
        formulas[key] = value.trim();
      }
    }
  }
  const migratedFormulas = migrateLegacyFormulas(formulas);
  if (isAutoCustoDiretoFormula(migratedFormulas.custo_direto_total)) {
    migratedFormulas.custo_direto_total = buildCustoDiretoFormula(expenseTypes);
  }

  const precoReferenciaEdital = asFiniteNumber(o.precoReferenciaEdital);
  const pessoalBase = resolveEncargosBase({ lines, expenseTypes });
  const encargosSociais = normalizeDualMoneyPercent(
    o.encargosSociais,
    o.encargosSociaisPercent,
    pessoalBase,
    'percent'
  );
  const draftForBase: LicitacaoOrcamentoInputs = {
    ...base,
    lines,
    expenseTypes,
    encargosSociais,
    precoReferenciaEdital,
  };
  const dualBase = resolveBdiComponentBase(draftForBase);

  return withResyncedDualFields({
    gastoPessoal: asFiniteNumber(o.gastoPessoal),
    gastoMaterial: asFiniteNumber(o.gastoMaterial),
    gastoSistemas: asFiniteNumber(o.gastoSistemas),
    gastoAdministrativo: asFiniteNumber(o.gastoAdministrativo),
    gastoOutros: asFiniteNumber(o.gastoOutros),
    expenseTypes,
    encargosSociais,
    custoIndireto: normalizeDualMoneyPercent(o.custoIndireto, o.custoIndiretoPercent, dualBase, 'money'),
    lucro: normalizeDualMoneyPercent(o.lucro, o.lucroPercent, dualBase, 'money'),
    tributo: normalizeDualMoneyPercent(o.tributo, o.tributoPercent, dualBase, 'money'),
    margemMinima: normalizeDualMoneyPercent(
      o.margemMinima,
      o.margemMinimaPercent,
      dualBase,
      'percent'
    ),
    descontoSimulado: normalizeDualMoneyPercent(
      o.descontoSimulado,
      o.descontoSimuladoPercent,
      precoReferenciaEdital,
      'percent'
    ),
    precoReferenciaEdital,
    lines,
    syncCategoryTotalsFromLines: o.syncCategoryTotalsFromLines !== false,
    formulas: migratedFormulas,
    notes: typeof o.notes === 'string' ? o.notes : '',
  });
}

function normalizeExpenseTypes(
  raw: unknown,
  lines: LicitacaoOrcamentoLine[]
): LicitacaoOrcamentoExpenseType[] {
  const defaults = DEFAULT_LICITACAO_ORCAMENTO_EXPENSE_TYPES.map((item) => ({ ...item }));
  const byId = new Map<string, LicitacaoOrcamentoExpenseType>();
  for (const item of defaults) byId.set(item.id, item);

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const idRaw = typeof row.id === 'string' ? row.id.trim().toLowerCase() : '';
      const id = idRaw.replace(/[^a-z0-9_]/g, '_');
      if (!id || !/^[a-z]/.test(id) || RESERVED_FORMULA_NAMES.has(id)) continue;
      const label =
        typeof row.label === 'string' && row.label.trim()
          ? row.label.trim()
          : id;
      const builtin =
        row.builtin === true ||
        DEFAULT_LICITACAO_ORCAMENTO_EXPENSE_TYPES.some((d) => d.id === id);
      byId.set(id, { id, label, builtin });
    }
  }

  // Inclui categorias presentes nas linhas que ainda não estão na lista.
  for (const line of lines) {
    if (!line.category || byId.has(line.category)) continue;
    if (RESERVED_FORMULA_NAMES.has(line.category)) continue;
    byId.set(line.category, {
      id: line.category,
      label: line.category,
      builtin: false,
    });
  }

  const ordered: LicitacaoOrcamentoExpenseType[] = [];
  for (const def of defaults) {
    const current = byId.get(def.id);
    if (current) {
      ordered.push(current);
      byId.delete(def.id);
    }
  }
  for (const item of byId.values()) ordered.push(item);
  return ordered.length > 0 ? ordered : defaults;
}

function sumLinesByCategory(
  lines: LicitacaoOrcamentoLine[],
  category: LicitacaoOrcamentoLineCategory
): number {
  return lines
    .filter((line) => line.category === category)
    .reduce((sum, line) => sum + asFiniteNumber(line.amount), 0);
}

export function resolveCategoryTotals(inputs: {
  lines: LicitacaoOrcamentoLine[];
  expenseTypes?: LicitacaoOrcamentoExpenseType[];
}): Record<string, number> {
  const types =
    inputs.expenseTypes && inputs.expenseTypes.length > 0
      ? inputs.expenseTypes
      : DEFAULT_LICITACAO_ORCAMENTO_EXPENSE_TYPES;
  const totals: Record<string, number> = {};
  for (const type of types) {
    totals[type.id] = sumLinesByCategory(inputs.lines, type.id);
  }
  // Inclui totais de categorias órfãs nas linhas.
  for (const line of inputs.lines) {
    if (!line.category || totals[line.category] !== undefined) continue;
    totals[line.category] = sumLinesByCategory(inputs.lines, line.category);
  }
  return totals;
}

function maxFn(...args: number[]): number {
  return Math.max(...args.map((n) => asFiniteNumber(n)));
}

function minFn(...args: number[]): number {
  return Math.min(...args.map((n) => asFiniteNumber(n)));
}

/** Avalia expressão aritmética com variáveis e max()/min(). */
export function evaluateLicitacaoOrcamentoFormula(
  expression: string,
  variables: Record<string, number>
): number {
  const trimmed = expression.trim();
  if (!trimmed) throw new Error('Fórmula vazia');

  if (!/^[0-9a-zA-Z_+\-*/().,\s]+$/.test(trimmed)) {
    throw new Error('Fórmula contém caracteres não permitidos');
  }

  let expr = trimmed;
  const names = Object.keys(variables).sort((a, b) => b.length - a.length);
  for (const name of names) {
    const value = asFiniteNumber(variables[name]);
    expr = expr.replace(new RegExp(`\\b${name}\\b`, 'g'), `(${value})`);
  }

  if (/[a-zA-Z_]/.test(expr.replace(/\b(max|min)\b/g, ''))) {
    throw new Error('Variável desconhecida na fórmula');
  }

  // eslint-disable-next-line no-new-func
  const fn = new Function('max', 'min', `"use strict"; return (${expr});`);
  const result = fn(maxFn, minFn);
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error('Resultado inválido');
  }
  return result;
}

export function computeLicitacaoOrcamentoResult(
  inputsRaw: LicitacaoOrcamentoInputs
): LicitacaoOrcamentoResult {
  const inputs = normalizeLicitacaoOrcamentoInputs(inputsRaw);
  const categories = resolveCategoryTotals(inputs);

  const variables: Record<string, number> = {
    ...categories,
    encargos_sociais: inputs.encargosSociais.money,
    encargos_sociais_pct: inputs.encargosSociais.percent,
    custo_indireto: inputs.custoIndireto.money,
    lucro: inputs.lucro.money,
    tributo: inputs.tributo.money,
    custo_indireto_pct: inputs.custoIndireto.percent,
    lucro_pct: inputs.lucro.percent,
    tributo_pct: inputs.tributo.percent,
    margem_minima: inputs.margemMinima.money,
    margem_minima_pct: inputs.margemMinima.percent,
    preco_referencia_edital: inputs.precoReferenciaEdital,
    desconto_simulado: inputs.descontoSimulado.money,
    desconto_simulado_pct: inputs.descontoSimulado.percent,
  };

  const formulaValues = {} as Record<LicitacaoOrcamentoFormulaKey, number>;
  const formulaErrors: Partial<Record<LicitacaoOrcamentoFormulaKey, string>> = {};

  for (const key of LICITACAO_ORCAMENTO_FORMULA_ORDER) {
    try {
      const value = evaluateLicitacaoOrcamentoFormula(inputs.formulas[key], variables);
      formulaValues[key] = value;
      variables[key] = value;
    } catch (error) {
      formulaValues[key] = 0;
      variables[key] = 0;
      formulaErrors[key] = error instanceof Error ? error.message : 'Erro na fórmula';
    }
  }

  return {
    custoDiretoTotal: formulaValues.custo_direto_total,
    encargosSociaisValor: formulaValues.encargos_sociais_valor,
    bdiPercent: formulaValues.bdi_percent,
    bdiValor: formulaValues.bdi_valor,
    custoIndiretoTotal: formulaValues.custo_indireto_total,
    impostosValor: formulaValues.impostos_valor,
    precoMinimoViavel: formulaValues.preco_minimo_viavel,
    precoReferenciaEdital: inputs.precoReferenciaEdital,
    descontoMaximoPercentual: formulaValues.desconto_maximo_percentual,
    precoLanceSimulado: formulaValues.preco_lance_simulado,
    margemRealSimulada: formulaValues.margem_real_simulada,
    formulaValues,
    formulaErrors,
  };
}
