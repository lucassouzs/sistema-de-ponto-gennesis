import { Prisma, StockShortfallStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import {
  collectPaymentSlipsForOrderFromMovements,
  extractOcNumberFromMovementNotes,
  movementNotesMatchOc
} from '../utils/stockMovementNotes';

export { extractOcNumberFromMovementNotes } from '../utils/stockMovementNotes';

function normalizeMaterialName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

type ConstructionMaterialRef = {
  id: string;
  name: string;
  unit: string | null;
  category: string | null;
};

function resolveConstructionMaterialForEngineering(
  eng: { id: string; name: string | null; description: string; sinapiCode: string },
  cmByNormName: Map<string, ConstructionMaterialRef>,
  cmById: Map<string, ConstructionMaterialRef>
): ConstructionMaterialRef | null {
  const sinapi = (eng.sinapiCode || '').trim();
  if (sinapi.startsWith('CM-')) {
    const cm = cmById.get(sinapi.slice(3));
    if (cm) return cm;
  }
  for (const key of [eng.name || '', eng.description || '']) {
    const norm = normalizeMaterialName(key);
    if (!norm) continue;
    const cm = cmByNormName.get(norm);
    if (cm) return cm;
  }
  return null;
}

function parseMovementSplitFromNotes(notes: string | null | undefined): 'TOTAL' | 'PARCIAL' | '' {
  if (!notes) return '';
  const raw = notes.match(/Tipo:\s*(TOTAL|PARCIAL)/i)?.[1]?.toUpperCase() ?? '';
  return raw === 'TOTAL' || raw === 'PARCIAL' ? raw : '';
}

export type StockReceiptSummaryLine = {
  materialLabel: string;
  ordered: number;
  received: number;
  gap: number;
  unit: string;
};

export type StockReceiptSummaryBatch = {
  createdAt: string;
  split: 'TOTAL' | 'PARCIAL' | '';
  userName: string;
  items: Array<{ materialName: string; quantity: number; unit: string }>;
};

export type StockReceiptSummary = {
  hasReceipts: boolean;
  hasExits: boolean;
  lines: StockReceiptSummaryLine[];
  batches: StockReceiptSummaryBatch[];
  exitBatches: StockReceiptSummaryBatch[];
};

type StockMovementForBatch = {
  notes: string | null;
  createdAt: Date;
  quantity: number | Prisma.Decimal;
  material: { name: string; unit: string };
  user: { name: string | null } | null;
};

function buildStockMovementBatches(movements: StockMovementForBatch[]): StockReceiptSummaryBatch[] {
  const batchMap = new Map<string, StockReceiptSummaryBatch>();
  for (const m of movements) {
    const key = `${m.notes || ''}::${m.createdAt.toISOString()}`;
    let batch = batchMap.get(key);
    if (!batch) {
      batch = {
        createdAt: m.createdAt.toISOString(),
        split: parseMovementSplitFromNotes(m.notes),
        userName: m.user?.name || '—',
        items: []
      };
      batchMap.set(key, batch);
    }
    batch.items.push({
      materialName: m.material.name,
      quantity: Number(m.quantity),
      unit: m.material.unit
    });
  }

  return Array.from(batchMap.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export class StockShortfallService {
  private lastRebuildAt = 0;
  private static readonly REBUILD_THROTTLE_MS = 30_000;

  /**
   * Recalcula furos a partir de todas as entradas de estoque já vinculadas a OC.
   * Garante que o módulo Furo de Estoque reflita movimentações anteriores à feature.
   */
  async rebuildFromExistingMovements(): Promise<void> {
    const movements = await prisma.stockMovement.findMany({
      where: {
        type: 'IN',
        notes: { not: null }
      },
      select: { notes: true },
      take: 15000,
      orderBy: { createdAt: 'desc' }
    });

    const ocNumbers = new Set<string>();
    for (const m of movements) {
      const oc = extractOcNumberFromMovementNotes(m.notes);
      if (oc) ocNumbers.add(oc);
    }

    let poService: import('./PurchaseOrderService').PurchaseOrderService | null = null;
    for (const orderNumber of ocNumbers) {
      await this.syncForOrderNumber(orderNumber);
      const slips = collectPaymentSlipsForOrderFromMovements(movements, orderNumber);
      if (slips.length > 0) {
        try {
          if (!poService) {
            const { PurchaseOrderService } = await import('./PurchaseOrderService');
            poService = new PurchaseOrderService();
          }
          await poService.syncBoletoInstallmentsFromStockReceipt(orderNumber);
        } catch (err) {
          console.error('[StockShortfall] syncBoletoInstallmentsFromStockReceipt', orderNumber, err);
        }
      }
    }
  }

  /**
   * Recalcula furos da OC após entrada de estoque vinculada à OC.
   * Só mantém registros quando já houve pelo menos um recebimento PARCIAL.
   */
  async syncForOrderNumber(orderNumber: string): Promise<void> {
    const trimmed = orderNumber.trim();
    if (!trimmed) return;

    const po = await prisma.purchaseOrder.findUnique({
      where: { orderNumber: trimmed },
      include: {
        items: { include: { material: true } },
        supplier: true,
        materialRequest: {
          select: {
            costCenterId: true,
            requestNumber: true,
            costCenter: { select: { id: true, code: true, name: true } }
          }
        }
      }
    });
    if (!po) return;

    const ccId = po.materialRequest?.costCenterId ?? null;

    const inMovements = await prisma.stockMovement.findMany({
      where: {
        type: 'IN',
        notes: { contains: trimmed, mode: 'insensitive' }
      },
      select: {
        id: true,
        materialId: true,
        quantity: true,
        costCenterId: true,
        notes: true
      },
      take: 5000,
      orderBy: { createdAt: 'desc' }
    });

    const forOc = inMovements.filter((m) => movementNotesMatchOc(m.notes, trimmed));

    if (forOc.length === 0) {
      await prisma.stockShortfall.deleteMany({ where: { purchaseOrderId: po.id } });
      return;
    }

    const sumByConstructionMaterial = new Map<string, number>();
    for (const m of forOc) {
      sumByConstructionMaterial.set(
        m.materialId,
        (sumByConstructionMaterial.get(m.materialId) || 0) + Number(m.quantity)
      );
    }

    const constructionMaterials = await prisma.constructionMaterial.findMany({
      where: { isActive: true },
      select: { id: true, name: true, unit: true, category: true }
    });
    const cmByNormName = new Map<string, ConstructionMaterialRef>();
    const cmById = new Map<string, ConstructionMaterialRef>();
    for (const cm of constructionMaterials) {
      const ref: ConstructionMaterialRef = {
        id: cm.id,
        name: cm.name,
        unit: cm.unit,
        category: cm.category
      };
      cmById.set(cm.id, ref);
      cmByNormName.set(normalizeMaterialName(cm.name), ref);
    }

    const lines: Array<{
      constructionMaterialId: string;
      engineeringLabel: string;
      unit: string | null;
      ordered: number;
      received: number;
      gap: number;
    }> = [];

    for (const item of po.items) {
      const eng = item.material;
      if (!eng) continue;
      const cm = resolveConstructionMaterialForEngineering(eng, cmByNormName, cmById);
      if (!cm) continue;
      const label = (eng.name || eng.description || cm.name || '').trim();
      if (!label) continue;
      const ordered = Number(item.quantity);
      if (!Number.isFinite(ordered) || ordered <= 0) continue;
      const received = sumByConstructionMaterial.get(cm.id) || 0;
      const gap = Math.max(0, Math.round((ordered - received) * 1000) / 1000);
      lines.push({
        constructionMaterialId: cm.id,
        engineeringLabel: label,
        unit: cm.unit || item.unit,
        ordered,
        received,
        gap
      });
    }

    const hasOpenGap = lines.some((l) => l.gap > 0);
    if (!hasOpenGap) {
      await prisma.stockShortfall.deleteMany({ where: { purchaseOrderId: po.id } });
      return;
    }

    const existing = await prisma.stockShortfall.findMany({ where: { purchaseOrderId: po.id } });
    const existingByMat = new Map(existing.map((e) => [e.constructionMaterialId, e]));

    for (const line of lines) {
      const prev = existingByMat.get(line.constructionMaterialId);
      if (line.gap <= 0) {
        if (prev && prev.status === StockShortfallStatus.ABERTO) {
          await prisma.stockShortfall.delete({ where: { id: prev.id } });
        }
        continue;
      }

      if (prev?.status === StockShortfallStatus.RESOLVIDO) {
        await prisma.stockShortfall.update({
          where: { id: prev.id },
          data: {
            orderedQty: new Prisma.Decimal(line.ordered),
            receivedQty: new Prisma.Decimal(line.received),
            gapQty: new Prisma.Decimal(line.gap),
            engineeringLabel: line.engineeringLabel,
            unit: line.unit,
            costCenterId: ccId,
            orderNumber: po.orderNumber,
            updatedAt: new Date()
          }
        });
        continue;
      }

      await prisma.stockShortfall.upsert({
        where: {
          purchaseOrderId_constructionMaterialId: {
            purchaseOrderId: po.id,
            constructionMaterialId: line.constructionMaterialId
          }
        },
        create: {
          purchaseOrderId: po.id,
          orderNumber: po.orderNumber,
          costCenterId: ccId,
          constructionMaterialId: line.constructionMaterialId,
          engineeringLabel: line.engineeringLabel,
          unit: line.unit,
          orderedQty: new Prisma.Decimal(line.ordered),
          receivedQty: new Prisma.Decimal(line.received),
          gapQty: new Prisma.Decimal(line.gap),
          status: StockShortfallStatus.ABERTO
        },
        update: {
          orderedQty: new Prisma.Decimal(line.ordered),
          receivedQty: new Prisma.Decimal(line.received),
          gapQty: new Prisma.Decimal(line.gap),
          engineeringLabel: line.engineeringLabel,
          unit: line.unit,
          costCenterId: ccId,
          orderNumber: po.orderNumber,
          updatedAt: new Date()
        }
      });
    }

    const lineMatIds = new Set(lines.map((l) => l.constructionMaterialId));
    for (const row of existing) {
      if (!lineMatIds.has(row.constructionMaterialId) && row.status === StockShortfallStatus.ABERTO) {
        await prisma.stockShortfall.delete({ where: { id: row.id } });
      }
    }
  }

  /**
   * Resumo de entradas de estoque vinculadas à OC (por Nº OC nas observações da movimentação).
   */
  async getReceiptSummaryForOrderNumber(
    orderNumber: string,
    preloaded?: {
      items: Array<{
        quantity: unknown;
        unit: string;
        material: { name: string | null; description: string | null } | null;
      }>;
    }
  ): Promise<StockReceiptSummary> {
    const trimmed = orderNumber.trim();
    const empty: StockReceiptSummary = {
      hasReceipts: false,
      hasExits: false,
      lines: [],
      batches: [],
      exitBatches: []
    };
    if (!trimmed) return empty;

    const poItems =
      preloaded?.items ??
      (
        await prisma.purchaseOrder.findUnique({
          where: { orderNumber: trimmed },
          include: { items: { include: { material: true } } }
        })
      )?.items;

    if (!poItems) return empty;

    /** Needle exato do formato gravado nas notas — evita ILIKE case-insensitive (scan mais caro). */
    const needle = `Nº OC: ${trimmed}`;
    const movements = await prisma.stockMovement.findMany({
      where: {
        notes: { contains: needle }
      },
      include: {
        material: { select: { id: true, name: true, unit: true } },
        user: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 500
    });

    const forOc = movements.filter((m) => movementNotesMatchOc(m.notes, trimmed));
    const inMovements = forOc.filter((m) => m.type === 'IN');
    const outMovements = forOc.filter((m) => m.type === 'OUT');
    const exitBatches = buildStockMovementBatches(outMovements);
    const hasExits = exitBatches.length > 0;

    if (inMovements.length === 0) {
      return {
        hasReceipts: false,
        hasExits,
        lines: poItems.map((item) => {
          const eng = item.material;
          const label = (eng?.name || eng?.description || '').trim() || '—';
          const ordered = Number(item.quantity);
          return {
            materialLabel: label,
            ordered: Number.isFinite(ordered) ? ordered : 0,
            received: 0,
            gap: Number.isFinite(ordered) ? Math.max(0, ordered) : 0,
            unit: item.unit || '—'
          };
        }),
        batches: [],
        exitBatches
      };
    }

    const sumByConstructionMaterial = new Map<string, number>();
    for (const m of inMovements) {
      sumByConstructionMaterial.set(
        m.materialId,
        (sumByConstructionMaterial.get(m.materialId) || 0) + Number(m.quantity)
      );
    }

    // Só materiais que aparecem nas entradas (evita carregar o catálogo inteiro a cada open).
    const materialIds = Array.from(sumByConstructionMaterial.keys());
    const constructionMaterials =
      materialIds.length === 0
        ? []
        : await prisma.constructionMaterial.findMany({
            where: { id: { in: materialIds } },
            select: { id: true, name: true, unit: true }
          });
    const cmByNormName = new Map<string, { id: string; unit: string }>();
    for (const cm of constructionMaterials) {
      cmByNormName.set(normalizeMaterialName(cm.name), { id: cm.id, unit: cm.unit });
    }

    const lines: StockReceiptSummaryLine[] = [];
    for (const item of poItems) {
      const eng = item.material;
      const label = (eng?.name || eng?.description || '').trim() || '—';
      const ordered = Number(item.quantity);
      const cm = cmByNormName.get(normalizeMaterialName(label));
      const received = cm ? sumByConstructionMaterial.get(cm.id) || 0 : 0;
      const gap = Math.max(0, Math.round(((Number.isFinite(ordered) ? ordered : 0) - received) * 1000) / 1000);
      lines.push({
        materialLabel: label,
        ordered: Number.isFinite(ordered) ? ordered : 0,
        received,
        gap,
        unit: cm?.unit || item.unit || '—'
      });
    }

    const batches = buildStockMovementBatches(inMovements);

    return { hasReceipts: true, hasExits, lines, batches, exitBatches };
  }

  /** Quantidade de furos abertos — só COUNT (sem rebuild no GET). */
  async countOpenPending(): Promise<number> {
    return prisma.stockShortfall.count({
      where: { status: StockShortfallStatus.ABERTO }
    });
  }

  async list(params: {
    status?: 'ABERTO' | 'RESOLVIDO' | 'ALL';
    costCenterId?: string;
    costCenterIds?: string[];
    category?: string;
    month?: number;
    year?: number;
    search?: string;
    limit?: number;
    skipRebuild?: boolean;
  }) {
    /** Rebuild/sync fica nas mutações de estoque — GET de listagem deve ser rápido. */
    const limit = Math.min(params.limit ?? 200, 500);
    const where: Prisma.StockShortfallWhereInput = {};

    if (params.status && params.status !== 'ALL') {
      where.status = params.status;
    }

    if (params.costCenterId) {
      where.costCenterId = params.costCenterId;
    } else if (params.costCenterIds?.length) {
      where.costCenterId = { in: params.costCenterIds };
    }

    if (params.month && params.year) {
      const start = new Date(params.year, params.month - 1, 1);
      const end = new Date(params.year, params.month, 0, 23, 59, 59, 999);
      where.updatedAt = { gte: start, lte: end };
    } else if (params.year) {
      const start = new Date(params.year, 0, 1);
      const end = new Date(params.year, 11, 31, 23, 59, 59, 999);
      where.updatedAt = { gte: start, lte: end };
    }

    const andParts: Prisma.StockShortfallWhereInput[] = [];
    if (params.category) {
      andParts.push({ constructionMaterial: { category: params.category } });
    }
    if (params.search?.trim()) {
      const s = params.search.trim();
      andParts.push({
        OR: [
          { orderNumber: { contains: s, mode: 'insensitive' } },
          { engineeringLabel: { contains: s, mode: 'insensitive' } },
          { constructionMaterial: { name: { contains: s, mode: 'insensitive' } } }
        ]
      });
    }
    if (andParts.length > 0) {
      where.AND = andParts;
    }

    const rows = await prisma.stockShortfall.findMany({
      where,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        purchaseOrder: {
          select: {
            id: true,
            orderNumber: true,
            orderDate: true,
            supplier: { select: { id: true, name: true } },
            materialRequest: {
              select: {
                requestNumber: true,
                costCenter: { select: { id: true, code: true, name: true } }
              }
            }
          }
        },
        constructionMaterial: { select: { id: true, name: true, unit: true, category: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        resolvedBy: { select: { id: true, name: true } }
      }
    });

    return rows;
  }

  async resolve(id: string, userId: string) {
    const row = await prisma.stockShortfall.findUnique({ where: { id } });
    if (!row) throw createError('Registro não encontrado', 404);
    if (row.status === StockShortfallStatus.RESOLVIDO) {
      return prisma.stockShortfall.findUnique({
        where: { id },
        include: {
          purchaseOrder: {
            select: {
              id: true,
              orderNumber: true,
              orderDate: true,
              supplier: { select: { id: true, name: true } },
              materialRequest: {
                select: {
                  requestNumber: true,
                  costCenter: { select: { id: true, code: true, name: true } }
                }
              }
            }
          },
          constructionMaterial: { select: { id: true, name: true, unit: true, category: true } },
          costCenter: { select: { id: true, code: true, name: true } },
          resolvedBy: { select: { id: true, name: true } }
        }
      });
    }
    return prisma.stockShortfall.update({
      where: { id },
      data: {
        status: StockShortfallStatus.RESOLVIDO,
        resolvedAt: new Date(),
        resolvedByUserId: userId
      },
      include: {
        purchaseOrder: {
          select: {
            id: true,
            orderNumber: true,
            orderDate: true,
            supplier: { select: { id: true, name: true } },
            materialRequest: {
              select: {
                requestNumber: true,
                costCenter: { select: { id: true, code: true, name: true } }
              }
            }
          }
        },
        constructionMaterial: { select: { id: true, name: true, unit: true, category: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        resolvedBy: { select: { id: true, name: true } }
      }
    });
  }
}

export const stockShortfallService = new StockShortfallService();
