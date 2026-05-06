import { z } from 'zod';

/** Anexo enviado em Base64 (evita multipart no MVP). Limite ~2,5 MB decodificados. */
export const dpAttachmentSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  dataBase64: z.string().min(1).max(3_500_000),
});

const str = z.string().min(1);
const strOpt = z.string().optional();

export const dpDetailsSchemas = {
  ADMISSAO: z.object({
    quantidadeNomeFuncaoContato: str,
    funcaoNomeQuantidadeContato: str,
    motivoContratacao: str,
    setor: str,
    observacao: strOpt,
  }),
  FERIAS: z.object({
    employeeId: str,
    dataInicial: str,
    dataFinal: str,
    observacao: strOpt,
  }),
  RESCISAO: z.object({
    employeeId: str,
    tipoAviso: str,
    tipoRescisao: str,
    motivo: str,
    observacoes: strOpt,
  }),
  ALTERACAO_FUNCAO_SALARIO: z.object({
    employeeId: str,
    funcaoSalarioAntigo: str,
    funcaoSalarioNovo: str,
    justificativa: str,
  }),
  ADVERTENCIA_SUSPENSAO: z.object({
    employeeId: str,
    punicao: z.enum(['ADVERTENCIA', 'SUSPENSAO']),
    motivo: str,
  }),
  ATESTADO_MEDICO: z.object({
    employeeId: str,
    dataInicial: str,
    dataFinal: str,
    numeroDias: z.union([z.string().min(1), z.number()]).transform((v) => String(v)),
    anexoAtestado: dpAttachmentSchema,
  }),
  RETIFICACAO_ALOCACAO: z.object({
    employeeId: str,
    data: str,
    justificativa: str,
  }),
  HORA_EXTRA: z.object({
    employeeIds: z.array(z.string().min(1)).min(1).max(1),
    justificativa: str,
    datas: str,
    anexoAutorizacao: dpAttachmentSchema,
  }),
  BENEFICIOS_VIAGEM: z.object({
    employeeId: str,
    dataInicial: str,
    dataFinal: str,
    numeroDias: z.union([z.string().min(1), z.number()]).transform((v) => String(v)),
    motivoViagem: str,
    diasHotel: z.union([z.string(), z.number()]).optional(),
  }),
  OUTRAS_SOLICITACOES: z.object({
    tipoSolicitacao: str,
    employeeIds: z.array(z.string().min(1)).min(1).max(1),
    situacao: str,
    justificativa: str,
    datas: strOpt,
    valores: z.string().optional(),
    observacoes: strOpt,
  }),
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
