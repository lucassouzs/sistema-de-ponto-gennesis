import {
  MaterialDeliveryPaymentStatus,
  MaterialDeliveryStockShortfallType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

export type ResolveStockShortfallInput = {
  paymentStatus: MaterialDeliveryPaymentStatus | null | undefined;
  movementId?: string | null;
  purchaseOrderId?: string | null;
};

/** Converte rótulos da planilha GERAL (coluna L) para o enum interno. */
export function parseGeralShortfallLabel(raw: unknown): MaterialDeliveryStockShortfallType | null {
  if (raw == null) return null;
  const normalized = String(raw)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (!normalized) return null;
  if (normalized === 'NORMAL') return MaterialDeliveryStockShortfallType.NORMAL;
  if (normalized === 'CORRECAO') return MaterialDeliveryStockShortfallType.CORRECAO;
  return null;
}

export class MaterialDeliveryService {
  /**
   * Replica a fórmula da planilha:
   * - Pagamento vazio → null
   * - Pagamento ≠ boleto → NORMAL
   * - Pagamento = boleto → PROCX(ID Mov; GERAL!E; GERAL!L), senão NORMAL
   * Fallback: OC com furo aberto → CORRECAO (quando GERAL não tem o ID Mov)
   */
  async resolveStockShortfallType(
    input: ResolveStockShortfallInput
  ): Promise<MaterialDeliveryStockShortfallType | null> {
    const { paymentStatus, movementId, purchaseOrderId } = input;

    if (!paymentStatus) return null;

    if (paymentStatus !== MaterialDeliveryPaymentStatus.BOLETO) {
      return MaterialDeliveryStockShortfallType.NORMAL;
    }

    const lookupKey = movementId?.trim();
    if (lookupKey) {
      const geralHit = await prisma.materialDeliveryGeralLookup.findUnique({
        where: { lookupKey },
      });
      if (geralHit) return geralHit.shortfallType;
    }

    if (purchaseOrderId) {
      const openShortfall = await prisma.stockShortfall.findFirst({
        where: {
          purchaseOrderId,
          status: 'ABERTO',
        },
        select: { id: true },
      });
      if (openShortfall) {
        return MaterialDeliveryStockShortfallType.CORRECAO;
      }
    }

    return MaterialDeliveryStockShortfallType.NORMAL;
  }

  /** Importa/atualiza linhas da aba GERAL (coluna E = lookupKey, L = shortfallType). */
  async upsertGeralLookups(
    rows: Array<{ lookupKey: string; shortfallType: MaterialDeliveryStockShortfallType | string }>
  ): Promise<{ upserted: number; skipped: number }> {
    let upserted = 0;
    let skipped = 0;

    for (const row of rows) {
      const lookupKey = row.lookupKey?.trim();
      if (!lookupKey) {
        skipped += 1;
        continue;
      }

      const parsed =
        typeof row.shortfallType === 'string' && row.shortfallType in MaterialDeliveryStockShortfallType
          ? (row.shortfallType as MaterialDeliveryStockShortfallType)
          : parseGeralShortfallLabel(row.shortfallType);

      if (!parsed) {
        skipped += 1;
        continue;
      }

      await prisma.materialDeliveryGeralLookup.upsert({
        where: { lookupKey },
        create: { lookupKey, shortfallType: parsed },
        update: { shortfallType: parsed },
      });
      upserted += 1;
    }

    return { upserted, skipped };
  }
}

export const materialDeliveryService = new MaterialDeliveryService();
