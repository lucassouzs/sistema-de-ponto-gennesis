import { randomUUID } from 'crypto';
import { ServiceOrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { createError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { parseDateInput } from './dateInput';

export function toDecPleito(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export type ResolvePleitoContractContext = {
  costCenterId: string;
  contractStartDate: Date;
  contractEndDate: Date;
};

function parseMesAno(
  b: Record<string, unknown>,
  creationYearParsed: number | null
): { mes: number; ano: number } {
  let mes: number | null = null;
  if (b.mes != null && b.mes !== '') {
    const n = Number(b.mes);
    if (Number.isInteger(n) && n >= 1 && n <= 12) mes = n;
  }
  if (mes == null && b.creationMonth != null && String(b.creationMonth).trim() !== '') {
    const n = parseInt(String(b.creationMonth).trim().padStart(2, '0'), 10);
    if (n >= 1 && n <= 12) mes = n;
  }

  let ano: number | null = null;
  if (b.ano != null && b.ano !== '') {
    const n = Number(b.ano);
    if (Number.isInteger(n) && n > 1900 && n < 2200) ano = n;
  }
  if (ano == null && creationYearParsed != null && Number.isInteger(creationYearParsed)) {
    ano = creationYearParsed;
  }

  if (mes == null || ano == null) {
    throw createError(
      'Informe mês e ano da competência (mes e ano, ou creationMonth e creationYear)',
      400
    );
  }
  return { mes, ano };
}

function resolveValorPrevistoFromPayload(
  b: Record<string, unknown>,
  fallbackFromServiceOrderValor?: number
): number {
  const vp =
    toDecPleito(b.valorPrevisto) ??
    toDecPleito(b.valor) ??
    toDecPleito(b.budgetAmount1) ??
    toDecPleito(b.budgetAmount2) ??
    toDecPleito(b.budgetAmount3) ??
    toDecPleito(b.budgetAmount4) ??
    (fallbackFromServiceOrderValor != null ? fallbackFromServiceOrderValor : null);

  if (vp == null || !Number.isFinite(vp) || vp <= 0) {
    throw createError(
      'Informe valor previsto, ou preencha ao menos um orçamento RD (R01–R04) com valor positivo.',
      400
    );
  }
  return vp;
}

function safeBoundaryDate(raw: unknown, fallback: Date): Date {
  if (raw == null || raw === '') return fallback;
  try {
    const d = raw instanceof Date ? raw : parseDateInput(String(raw));
    if (Number.isNaN(d.getTime())) return fallback;
    return d;
  } catch {
    return fallback;
  }
}

/** Cria registro em `service_orders` vinculado ao centro de custo do contrato (fluxo formulário OS sem UUID prévio). */
async function createLinkedServiceOrder(
  b: Record<string, unknown>,
  ano: number,
  valorNum: number,
  ctx: ResolvePleitoContractContext
): Promise<string> {
  const last = await prisma.service_orders.findFirst({
    where: { costCenterId: ctx.costCenterId, ano },
    orderBy: { numero: 'desc' },
    select: { numero: true }
  });
  const numero = (last?.numero ?? 0) + 1;

  const dataInicio = safeBoundaryDate(b.startDate, ctx.contractStartDate);
  const previsaoFim = safeBoundaryDate(b.endDate, ctx.contractEndDate);
  const descricao =
    typeof b.serviceDescription === 'string' && b.serviceDescription.trim()
      ? b.serviceDescription.trim()
      : null;

  const now = new Date();
  const row = await prisma.service_orders.create({
    data: {
      id: randomUUID(),
      costCenterId: ctx.costCenterId,
      numero,
      ano,
      dataInicio,
      previsaoFim,
      valor: new Decimal(valorNum),
      status: ServiceOrderStatus.NAO_INICIADO,
      descricao,
      updatedAt: now
    }
  });

  return row.id;
}

/** Campos obrigatórios do modelo Pleito após evolução do schema (OS + competência + valor previsto).
 * Se `contractForNewServiceOrder` for informado e o body não tiver `serviceOrderId`,
 * uma linha em `service_orders` é criada automaticamente (mesmo comportamento esperado pela tela "Novo Ordem de Serviço"). */
export async function resolvePleitoCreateCore(
  b: Record<string, unknown>,
  creationYearParsed: number | null,
  contractForNewServiceOrder?: ResolvePleitoContractContext | null
): Promise<{ mes: number; ano: number; valorPrevisto: Decimal; serviceOrderId: string }> {
  const { mes, ano } = parseMesAno(b, creationYearParsed);

  let incomingId = typeof b.serviceOrderId === 'string' ? b.serviceOrderId.trim() : '';

  if (!incomingId) {
    if (!contractForNewServiceOrder) {
      throw createError(
        'serviceOrderId é obrigatório (ordem de serviço vinculada), ou cadastre a OS a partir de um contrato.',
        400
      );
    }

    const vpNum = resolveValorPrevistoFromPayload(b);
    incomingId = await createLinkedServiceOrder(b, ano, vpNum, contractForNewServiceOrder);
  }

  const so = await prisma.service_orders.findUnique({ where: { id: incomingId } });
  if (!so) {
    throw createError('Ordem de serviço não encontrada', 404);
  }

  const vp = resolveValorPrevistoFromPayload(b, Number(so.valor));

  return {
    mes,
    ano,
    valorPrevisto: new Decimal(vp),
    serviceOrderId: incomingId
  };
}
