import { z } from 'zod';

/** Anexo enviado em Base64 (evita multipart no MVP). Limite ~2,5 MB decodificados. */
export const dpAttachmentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  dataBase64: z.string().min(1).max(3_500_000),
});

const str = z.string().min(1);
const strOpt = z.string().optional();
const numeroDiasField = z.union([z.string().min(1), z.number()]).transform((v) => String(v));
const diasHotelField = z.union([z.string(), z.number()]).optional();

const admissaoCandidatoSchema = z.object({
  nome: str,
  funcao: str,
  contato: str,
  motivoContratacao: str,
  setor: str,
  observacao: strOpt,
  anexoDocumento: dpAttachmentSchema.optional(),
});

function normalizeAdmissaoDetails(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const data = input as Record<string, unknown>;
  const topMotivo = data.motivoContratacao;
  const topSetor = data.setor;
  const topObservacao = data.observacao;
  if (!Array.isArray(data.candidatos)) return input;
  return {
    ...data,
    candidatos: data.candidatos.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const row = item as Record<string, unknown>;
      return {
        ...row,
        motivoContratacao: row.motivoContratacao ?? topMotivo,
        setor: row.setor ?? topSetor,
        observacao: row.observacao ?? topObservacao,
      };
    }),
  };
}

const medidaDisciplinarItemSchema = z.object({
  employeeId: str,
  punicao: z.enum(['ADVERTENCIA', 'SUSPENSAO']),
  motivo: str,
});

const feriasItemSchema = z.object({
  employeeId: str,
  dataInicial: str,
  dataFinal: str,
  observacao: strOpt,
});

const rescisaoItemSchema = z.object({
  employeeId: str,
  tipoAviso: str,
  tipoRescisao: str,
  motivo: str,
  observacoes: strOpt,
  anexoDocumento: dpAttachmentSchema.optional(),
});

const alteracaoItemSchema = z.object({
  employeeId: str,
  tipoAlteracaoFuncaoOuSalario: z.enum(['FUNCAO', 'SALARIO']).optional(),
  funcaoSalarioAntigo: str,
  funcaoSalarioNovo: str,
  justificativa: str,
});

const atestadoItemSchema = z.object({
  employeeId: str,
  dataInicial: str,
  dataFinal: str,
  numeroDias: numeroDiasField,
  anexoAtestado: dpAttachmentSchema,
});

const retificacaoItemSchema = z.object({
  employeeId: str,
  data: str,
  justificativa: str,
});

const horaExtraItemSchema = z.object({
  employeeId: str,
  justificativa: str,
  datas: str,
  anexoAutorizacao: dpAttachmentSchema,
});

const viagemBeneficioItemSchema = z.object({
  employeeId: str,
  dataInicial: str,
  dataFinal: str,
  numeroDias: numeroDiasField,
  motivoViagem: str,
  diasHotel: diasHotelField,
});

const outrasItemSchema = z.object({
  employeeId: str,
  tipoSolicitacao: str,
  situacao: str,
  justificativa: str,
  datas: strOpt,
  valores: z.string().optional(),
  observacoes: strOpt,
});

const admViagemItemSchema = z.object({
  employeeId: str,
  dataIda: str,
  dataVolta: str,
  cidade: str,
  motivoViagem: str,
  numeroDias: numeroDiasField,
  pedagio: z.enum(['SIM', 'NAO']),
  observacoes: strOpt,
});

const admSimpleItemSchema = z.object({
  employeeId: str,
  detalhes: str,
});

const admAsosItemSchema = z
  .object({
    asoTipo: z.enum(['ADMISSIONAL', 'DEMISSIONAL', 'PERIODICO', 'ALTERACAO_FUNCAO']),
    employeeId: str,
    dataNascimento: str,
    cpf: str,
    setor: str,
    cargo: str,
    novoCargo: strOpt,
    centroCusto: str,
    localTrabalho: str,
    empresa: str,
    seguirPcmso: z.enum(['SIM', 'NAO']),
  })
  .superRefine((data, ctx) => {
    if (data.asoTipo === 'ALTERACAO_FUNCAO' && !data.novoCargo?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['novoCargo'],
        message: 'Informe o novo cargo',
      });
    }
  });

function normalizeAdmAsosDetails(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const data = input as Record<string, unknown>;
  if (Array.isArray(data.asos)) return input;
  if (data.asoTipo || data.employeeId) {
    return { asos: [data] };
  }
  return input;
}

function uniqueEmployeeRefine<T extends { employeeId: string }>(
  arrayKey: string,
  data: Record<string, T[]>,
  ctx: z.RefinementCtx
) {
  const seen = new Set<string>();
  const items = data[arrayKey] ?? [];
  items.forEach((item, index) => {
    if (seen.has(item.employeeId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [arrayKey, index, 'employeeId'],
        message: 'Não é permitido repetir o mesmo colaborador',
      });
    }
    seen.add(item.employeeId);
  });
}

function employeeArraySchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.array(itemSchema).min(1).max(20);
}

export const dpDetailsSchemas = {
  ADMISSAO: z.preprocess(
    normalizeAdmissaoDetails,
    z
      .object({
        candidatos: z.array(admissaoCandidatoSchema).min(1).max(30),
        quantidade: z.coerce.number().int().min(1).max(30).optional(),
        quantidadeNomeFuncaoContato: strOpt,
        funcaoNomeQuantidadeContato: strOpt,
        motivoContratacao: strOpt,
        setor: strOpt,
        observacao: strOpt,
      })
      .transform((data) => ({
        candidatos: data.candidatos,
        quantidade: data.candidatos.length,
      }))
  ),
  FERIAS: z
    .object({ ferias: employeeArraySchema(feriasItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('ferias', data, ctx)),
  RESCISAO: z
    .object({ rescisoes: employeeArraySchema(rescisaoItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('rescisoes', data, ctx)),
  ALTERACAO_FUNCAO_SALARIO: z
    .object({ alteracoes: employeeArraySchema(alteracaoItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('alteracoes', data, ctx)),
  ADVERTENCIA_SUSPENSAO: z
    .object({ medidas: employeeArraySchema(medidaDisciplinarItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('medidas', data, ctx)),
  ATESTADO_MEDICO: z
    .object({ atestados: employeeArraySchema(atestadoItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('atestados', data, ctx)),
  RETIFICACAO_ALOCACAO: z
    .object({ retificacoes: employeeArraySchema(retificacaoItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('retificacoes', data, ctx)),
  HORA_EXTRA: z
    .object({ horasExtras: employeeArraySchema(horaExtraItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('horasExtras', data, ctx)),
  BENEFICIOS_VIAGEM: z
    .object({ viagensBeneficio: employeeArraySchema(viagemBeneficioItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('viagensBeneficio', data, ctx)),
  OUTRAS_SOLICITACOES: z
    .object({ itens: employeeArraySchema(outrasItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('itens', data, ctx)),
  ADM_VIAGENS: z
    .object({ viagens: employeeArraySchema(admViagemItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('viagens', data, ctx)),
  ADM_EPI_FARDAMENTO: z
    .object({ itens: employeeArraySchema(admSimpleItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('itens', data, ctx)),
  ADM_MANUTENCAO_ESCRITORIO: z
    .object({ itens: employeeArraySchema(admSimpleItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('itens', data, ctx)),
  ADM_MATERIAL_ESCRITORIO: z
    .object({ itens: employeeArraySchema(admSimpleItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('itens', data, ctx)),
  ADM_INFORMATICA: z
    .object({ itens: employeeArraySchema(admSimpleItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('itens', data, ctx)),
  ADM_TREINAMENTOS_NR: z
    .object({ itens: employeeArraySchema(admSimpleItemSchema) })
    .superRefine((data, ctx) => uniqueEmployeeRefine('itens', data, ctx)),
  ADM_ASOS: z.preprocess(
    normalizeAdmAsosDetails,
    z
      .object({ asos: employeeArraySchema(admAsosItemSchema) })
      .superRefine((data, ctx) => uniqueEmployeeRefine('asos', data, ctx))
  ),
} as const;

export type DpRequestTypeKey = keyof typeof dpDetailsSchemas;

export function parseDpRequestDetails(requestType: string, details: unknown): Record<string, unknown> {
  const schema = dpDetailsSchemas[requestType as DpRequestTypeKey];
  if (!schema) {
    throw new Error(`Tipo de solicitação DP sem schema de detalhes: ${requestType}`);
  }
  const parsed = schema.safeParse(details ?? {});
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(msg);
  }
  return parsed.data as Record<string, unknown>;
}
