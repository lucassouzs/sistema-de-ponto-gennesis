import { Prisma } from '@prisma/client';
import { createError } from '../middleware/errorHandler';

export const PLEITO_HISTORY_MARKER = '__PLEITO_HISTORICO__';
export const PLEITO_HISTORY_MARKER_GERADO_100 = '__PLEITO_HISTORICO__GERADO_100__';

type PleitoBillable = {
  billingRequest?: Prisma.Decimal | number | null;
  budget?: string | null;
};

function parseBudgetToNumber(v: string | null | undefined): number {
  if (!v) return 0;
  const s = String(v).replace(/[R$\s]/g, '').trim();
  if (!s) return 0;
  if (s.includes(',')) {
    const cleaned = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function getPleitoBillableTotal(pleito: PleitoBillable): number {
  const br = pleito.billingRequest != null ? Number(pleito.billingRequest) : 0;
  if (Number.isFinite(br) && br > 0) return br;
  return parseBudgetToNumber(pleito.budget);
}

export async function sumGrossBillingsForPleito(
  tx: Prisma.TransactionClient,
  pleitoId: string,
  excludeBillingId?: string
): Promise<number> {
  const rows = await tx.contractBilling.findMany({
    where: {
      pleitoId,
      ...(excludeBillingId ? { id: { not: excludeBillingId } } : {})
    },
    select: { grossValue: true }
  });
  return rows.reduce((sum, row) => sum + Number(row.grossValue || 0), 0);
}

export async function getPleitoRemainingBalance(
  tx: Prisma.TransactionClient,
  pleito: { id: string; billingRequest?: Prisma.Decimal | number | null; budget?: string | null },
  excludeBillingId?: string
): Promise<number> {
  const total = getPleitoBillableTotal(pleito);
  if (total <= 0) return 0;
  const billed = await sumGrossBillingsForPleito(tx, pleito.id, excludeBillingId);
  return Math.max(0, total - billed);
}

export async function assertPleitoBillingAmount(
  tx: Prisma.TransactionClient,
  pleito: {
    id: string;
    updatedContractId: string | null;
    divSe?: string | null;
    billingRequest?: Prisma.Decimal | number | null;
    budget?: string | null;
  },
  contractId: string,
  grossValue: number,
  excludeBillingId?: string
): Promise<void> {
  if (!pleito.updatedContractId || pleito.updatedContractId !== contractId) {
    throw createError('O pleito selecionado não pertence a este contrato', 400);
  }
  const total = getPleitoBillableTotal(pleito);
  if (total <= 0) {
    throw createError('O pleito selecionado não possui valor apto para faturamento', 400);
  }
  const remaining = await getPleitoRemainingBalance(tx, pleito, excludeBillingId);
  if (grossValue > remaining + 0.01) {
    throw createError(
      `Valor bruto excede o saldo disponível do pleito (R$ ${remaining.toFixed(2).replace('.', ',')})`,
      400
    );
  }
}

export async function syncPleitoFromBillings(
  tx: Prisma.TransactionClient,
  pleitoId: string
): Promise<void> {
  const pleito = await tx.pleito.findUnique({ where: { id: pleitoId } });
  if (!pleito) return;

  const totalBilled = await sumGrossBillingsForPleito(tx, pleitoId);
  const pleitoTotal = getPleitoBillableTotal(pleito);

  const updateData: Prisma.PleitoUpdateInput = {
    accumulatedBilled: totalBilled
  };

  const marker = (pleito.reportsBilling || '').trim();
  const isHistorico =
    marker === PLEITO_HISTORY_MARKER ||
    marker === PLEITO_HISTORY_MARKER_GERADO_100 ||
    marker.startsWith(PLEITO_HISTORY_MARKER);

  if (pleitoTotal > 0 && totalBilled >= pleitoTotal - 0.01) {
    if (isHistorico) {
      updateData.reportsBilling = PLEITO_HISTORY_MARKER_GERADO_100;
    }
    updateData.billingStatus = 'pago';
  } else {
    if (marker === PLEITO_HISTORY_MARKER_GERADO_100) {
      updateData.reportsBilling = PLEITO_HISTORY_MARKER;
    }
    if (totalBilled > 0.01) {
      updateData.billingStatus = 'nao-pago';
    }
  }

  await tx.pleito.update({ where: { id: pleitoId }, data: updateData });
}

export async function findBillingForPleito(
  tx: Prisma.TransactionClient,
  pleito: {
    id: string;
    updatedContractId: string | null;
    divSe?: string | null;
    invoiceNumber?: string | null;
  },
  invoiceNumber?: string | null
) {
  const invoice = (invoiceNumber ?? pleito.invoiceNumber ?? '').trim();
  const serviceOrder = (pleito.divSe ?? '').trim();
  const contractId = pleito.updatedContractId;

  if (!contractId) return null;

  return tx.contractBilling.findFirst({
    where: {
      OR: [
        { pleitoId: pleito.id },
        ...(invoice && serviceOrder
          ? [{ contractId, invoiceNumber: invoice, serviceOrder }]
          : [])
      ]
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function upsertBillingFromPleitoFaturamento(
  tx: Prisma.TransactionClient,
  params: {
    pleitoId: string;
    contractId: string;
    invoiceNumber: string;
    serviceOrder: string;
    grossValue: number;
    netValue: number;
    issueDate: Date;
  }
) {
  const existing = await tx.contractBilling.findFirst({
    where: {
      pleitoId: params.pleitoId,
      invoiceNumber: params.invoiceNumber.trim(),
      serviceOrder: params.serviceOrder.trim()
    }
  });

  if (existing) {
    return tx.contractBilling.update({
      where: { id: existing.id },
      data: {
        issueDate: params.issueDate,
        grossValue: params.grossValue,
        netValue: params.netValue,
        divSe: params.serviceOrder.trim()
      }
    });
  }

  return tx.contractBilling.create({
    data: {
      contractId: params.contractId,
      pleitoId: params.pleitoId,
      issueDate: params.issueDate,
      invoiceNumber: params.invoiceNumber.trim(),
      serviceOrder: params.serviceOrder.trim(),
      divSe: params.serviceOrder.trim(),
      grossValue: params.grossValue,
      netValue: params.netValue
    }
  });
}
