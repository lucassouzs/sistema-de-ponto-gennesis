import {
  applyCategoryTotalsFromLines,
  buildCustoDiretoFormula,
  computeLicitacaoOrcamentoResult,
  emptyLicitacaoOrcamentoInputs,
  normalizeLicitacaoOrcamentoInputs,
  templateToLines,
} from '../lib/licitacaoOrcamentoCalc';
import { licitacaoService } from './LicitacaoService';
import {
  getLicitacaoOrcamentoLineTemplate,
  saveLicitacaoOrcamentoLineTemplate,
} from './licitacaoOrcamentoLineTemplateService';
import {
  getLicitacaoOrcamentoByLicitacaoId,
  upsertLicitacaoOrcamento,
  type LicitacaoOrcamentoRecord,
} from './licitacaoOrcamentoStore';

function assertLicitacaoLiberadaParaOrcamento(licitacao: {
  arquivada?: boolean | null;
  arquivadaMotivo?: string | null;
}) {
  if (licitacao.arquivada !== true || licitacao.arquivadaMotivo !== 'orcamento') {
    throw new Error(
      'Orçamento liberado apenas para licitações com status Orçamento.'
    );
  }
}

function migrateLegacyTotalsToLines(
  inputs: ReturnType<typeof emptyLicitacaoOrcamentoInputs>
): ReturnType<typeof emptyLicitacaoOrcamentoInputs> {
  if (inputs.lines.length > 0) return inputs;

  const legacy: Array<{ category: typeof inputs.lines[number]['category']; amount: number; label: string }> = [
    { category: 'pessoal', amount: inputs.gastoPessoal, label: 'Pessoal' },
    { category: 'material', amount: inputs.gastoMaterial, label: 'Material' },
    { category: 'sistemas', amount: inputs.gastoSistemas, label: 'Sistemas' },
    { category: 'administrativo', amount: inputs.gastoAdministrativo, label: 'Administrativo' },
    { category: 'outros', amount: inputs.gastoOutros, label: 'Outros' },
  ];

  const lines = legacy
    .filter((item) => item.amount !== 0)
    .map((item, index) => ({
      id: `legacy-${item.category}-${index + 1}`,
      category: item.category,
      description: item.label,
      amount: item.amount,
    }));

  return { ...inputs, lines };
}

export async function getOrCreateLicitacaoOrcamentoView(
  licitacaoId: string
): Promise<LicitacaoOrcamentoRecord & { draft: boolean }> {
  const licitacao = await licitacaoService.getById(licitacaoId);
  if (!licitacao) throw new Error('Licitação não encontrada');
  assertLicitacaoLiberadaParaOrcamento(licitacao);

  const existing = await getLicitacaoOrcamentoByLicitacaoId(licitacaoId);
  if (existing) {
    const inputs = applyCategoryTotalsFromLines(migrateLegacyTotalsToLines(existing.inputs));
    const result = computeLicitacaoOrcamentoResult(inputs);
    return { ...existing, inputs, result, draft: false };
  }

  const inputs = emptyLicitacaoOrcamentoInputs();
  const template = await getLicitacaoOrcamentoLineTemplate();
  if (template.expenseTypes.length > 0) {
    inputs.expenseTypes = template.expenseTypes;
    inputs.formulas = {
      ...inputs.formulas,
      custo_direto_total: buildCustoDiretoFormula(template.expenseTypes),
    };
  }
  if (template.lines.length > 0) {
    inputs.lines = templateToLines(template.lines);
  }

  if (licitacao.valorEstimado) {
    const parsed = Number(
      String(licitacao.valorEstimado)
        .replace(/[R$\s]/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
    );
    if (Number.isFinite(parsed) && parsed > 0) {
      inputs.precoReferenciaEdital = parsed;
    }
  }

  const withTotals = applyCategoryTotalsFromLines(inputs);
  const result = computeLicitacaoOrcamentoResult(withTotals);
  return {
    id: '',
    licitacaoId,
    inputs: withTotals,
    result,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    draft: true,
  };
}

export async function saveLicitacaoOrcamentoForLicitacao(params: {
  licitacaoId: string;
  inputs: unknown;
  userId: string;
}): Promise<LicitacaoOrcamentoRecord & { draft: boolean }> {
  const licitacao = await licitacaoService.getById(params.licitacaoId);
  if (!licitacao) throw new Error('Licitação não encontrada');
  assertLicitacaoLiberadaParaOrcamento(licitacao);

  const normalized = applyCategoryTotalsFromLines(
    normalizeLicitacaoOrcamentoInputs(params.inputs)
  );

  // Estrutura de linhas e tipos de gasto vira padrão para orçamentos futuros.
  await saveLicitacaoOrcamentoLineTemplate({
    expenseTypes: normalized.expenseTypes,
    lines: normalized.lines,
  });

  const saved = await upsertLicitacaoOrcamento({
    licitacaoId: params.licitacaoId,
    inputs: normalized,
    userId: params.userId,
  });

  return { ...saved, draft: false };
}

export async function getOrcamentoLineTemplate() {
  return getLicitacaoOrcamentoLineTemplate();
}

export async function putOrcamentoLineTemplate(raw: unknown) {
  const payload =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : { lines: raw, expenseTypes: [] };

  const expenseTypesRaw = Array.isArray(payload.expenseTypes) ? payload.expenseTypes : [];
  const linesRaw = Array.isArray(payload.lines)
    ? payload.lines
    : Array.isArray(raw)
      ? raw
      : [];

  return saveLicitacaoOrcamentoLineTemplate({
    expenseTypes: expenseTypesRaw.map((item, index) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const id =
        typeof row.id === 'string' && row.id.trim()
          ? row.id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
          : `gasto_${index + 1}`;
      return {
        id,
        label:
          typeof row.label === 'string' && row.label.trim()
            ? row.label.trim()
            : id,
        builtin: row.builtin === true,
      };
    }),
    lines: linesRaw.map((item, index) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        id:
          typeof row.id === 'string' && row.id.trim()
            ? row.id.trim()
            : `line-${index + 1}`,
        category:
          typeof row.category === 'string' && row.category.trim()
            ? row.category.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
            : 'outros',
        description: typeof row.description === 'string' ? row.description : '',
        amount: 0,
      };
    }),
  });
}
