import {
  MaterialDeliveryCurrentStatus,
  MaterialDeliveryFinalStatus,
  MaterialDeliveryPaymentStatus,
  MaterialDeliveryPolo,
  MaterialDeliveryReceiptType,
  Prisma,
  PurchaseOrderStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { materialDeliveryService } from './MaterialDeliveryService';
import {
  extractOcNumberFromMovementNotes,
  movementNotesMatchOc,
  parseMovementReceiptTypeFromNotes,
} from '../utils/stockMovementNotes';

const OC_RECEIPT_STATUS_ELIGIBLE = new Set<PurchaseOrderStatus>([
  PurchaseOrderStatus.APPROVED,
  PurchaseOrderStatus.PENDING_PROOF_VALIDATION,
  PurchaseOrderStatus.PENDING_PROOF_CORRECTION,
  PurchaseOrderStatus.PENDING_NF_ATTACHMENT,
  PurchaseOrderStatus.SENT,
  PurchaseOrderStatus.FINALIZED,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
  PurchaseOrderStatus.RECEIVED,
]);

function parseDeliverySequence(value: string): number {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const legacy = trimmed.match(/^ENT-\d{4}-(\d+)$/i);
  if (legacy) return parseInt(legacy[1], 10);
  return 0;
}

async function generateDeliveryNumber(): Promise<string> {
  const rows = await prisma.materialDelivery.findMany({
    select: { deliveryNumber: true },
  });
  let max = 0;
  for (const row of rows) {
    const n = parseDeliverySequence(row.deliveryNumber);
    if (n > max) max = n;
  }
  return String(max + 1);
}

function derivePolo(costCenter?: { state?: string | null; polo?: string | null } | null): MaterialDeliveryPolo {
  const state = (costCenter?.state || '').trim().toUpperCase();
  if (state === 'GO') return MaterialDeliveryPolo.GO;
  const polo = (costCenter?.polo || '').toUpperCase();
  if (polo.includes('GOI')) return MaterialDeliveryPolo.GO;
  return MaterialDeliveryPolo.DF;
}

function derivePaymentStatus(order: {
  status: string;
  paymentType: string | null;
  paymentProofUrl: string | null;
}): MaterialDeliveryPaymentStatus {
  if (order.status === 'CANCELLED') return MaterialDeliveryPaymentStatus.CANCELADO;
  if (order.paymentProofUrl) return MaterialDeliveryPaymentStatus.OK;
  const paymentType = (order.paymentType || '').trim().toUpperCase();
  if (paymentType === 'BOLETO') return MaterialDeliveryPaymentStatus.BOLETO;
  if (paymentType === 'AVISTA' || paymentType === 'CARTAO') return MaterialDeliveryPaymentStatus.A_VISTA;
  return MaterialDeliveryPaymentStatus.AGUARDANDO_PAGAMENTO;
}

function normalizeMaterialName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

type ConstructionMaterialRef = { id: string; name: string; unit: string | null };

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

async function computeOcFullyReceived(purchaseOrderId: string): Promise<boolean> {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: { items: { include: { material: true } } },
  });
  if (!po) return false;

  const inMovements = await prisma.stockMovement.findMany({
    where: {
      type: 'IN',
      notes: { contains: po.orderNumber, mode: 'insensitive' },
    },
    select: { materialId: true, quantity: true, notes: true },
    take: 5000,
  });
  const forOc = inMovements.filter((m) => movementNotesMatchOc(m.notes, po.orderNumber));
  if (forOc.length === 0) return false;

  const sumByConstructionMaterial = new Map<string, number>();
  for (const m of forOc) {
    sumByConstructionMaterial.set(
      m.materialId,
      (sumByConstructionMaterial.get(m.materialId) || 0) + Number(m.quantity)
    );
  }

  const constructionMaterials = await prisma.constructionMaterial.findMany({
    where: { isActive: true },
    select: { id: true, name: true, unit: true },
  });
  const cmByNormName = new Map<string, ConstructionMaterialRef>();
  const cmById = new Map<string, ConstructionMaterialRef>();
  for (const cm of constructionMaterials) {
    const ref = { id: cm.id, name: cm.name, unit: cm.unit };
    cmById.set(cm.id, ref);
    cmByNormName.set(normalizeMaterialName(cm.name), ref);
  }

  for (const item of po.items) {
    const eng = item.material;
    if (!eng) continue;
    const cm = resolveConstructionMaterialForEngineering(eng, cmByNormName, cmById);
    if (!cm) continue;
    const ordered = Number(item.quantity);
    if (!Number.isFinite(ordered) || ordered <= 0) continue;
    const received = sumByConstructionMaterial.get(cm.id) || 0;
    const gap = Math.max(0, Math.round((ordered - received) * 1000) / 1000);
    if (gap > 0) return false;
  }

  return true;
}

async function syncPurchaseOrderReceiptStatus(purchaseOrderId: string): Promise<void> {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: { id: true, status: true },
  });
  if (!po || !OC_RECEIPT_STATUS_ELIGIBLE.has(po.status)) return;

  const fullyReceived = await computeOcFullyReceived(purchaseOrderId);
  const nextStatus = fullyReceived
    ? PurchaseOrderStatus.RECEIVED
    : PurchaseOrderStatus.PARTIALLY_RECEIVED;

  if (po.status !== nextStatus) {
    await prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: nextStatus, updatedAt: new Date() },
    });
  }
}

async function syncMaterialRequestReceiptBadge(
  materialRequestId: string | null | undefined,
  receiptType: MaterialDeliveryReceiptType,
  purchaseOrderId: string
): Promise<void> {
  if (!materialRequestId) return;

  const fullyReceived = await computeOcFullyReceived(purchaseOrderId);
  await prisma.materialRequest.update({
    where: { id: materialRequestId },
    data: {
      lastStockReceiptType: fullyReceived ? MaterialDeliveryReceiptType.TOTAL : receiptType,
      updatedAt: new Date(),
    },
  });
}

/**
 * Cria uma entrega por movimentação de entrada (IN) vinculada à OC.
 * Atualiza status da OC e badge da RM.
 */
export async function syncMaterialDeliveryFromStockMovement(stockMovementId: string): Promise<void> {
  const movement = await prisma.stockMovement.findUnique({
    where: { id: stockMovementId },
    select: {
      id: true,
      type: true,
      notes: true,
      userId: true,
      createdAt: true,
      costCenterId: true,
    },
  });
  if (!movement || movement.type !== 'IN' || !movement.notes) return;

  const orderNumber = extractOcNumberFromMovementNotes(movement.notes);
  const receiptTypeRaw = parseMovementReceiptTypeFromNotes(movement.notes);
  if (!orderNumber || !receiptTypeRaw) return;

  const receiptType =
    receiptTypeRaw === 'TOTAL'
      ? MaterialDeliveryReceiptType.TOTAL
      : MaterialDeliveryReceiptType.PARCIAL;

  const existing = await prisma.materialDelivery.findUnique({
    where: { stockMovementId: movement.id },
  });
  if (existing) return;

  const order = await prisma.purchaseOrder.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      orderNumber: true,
      orderDate: true,
      status: true,
      paymentType: true,
      paymentProofUrl: true,
      amountToPay: true,
      supplierId: true,
      supplier: { select: { name: true } },
      materialRequest: {
        select: {
          id: true,
          requestNumber: true,
          costCenterId: true,
          costCenter: { select: { state: true, polo: true } },
        },
      },
    },
  });
  if (!order) return;

  const contract = order.materialRequest?.costCenterId
    ? await prisma.contract.findFirst({
        where: { costCenterId: order.materialRequest.costCenterId },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  const rmNumber = order.materialRequest?.requestNumber?.trim() || null;
  const paymentStatus = derivePaymentStatus(order);
  const isPaid = Boolean(order.paymentProofUrl);
  const orderValue = order.amountToPay;
  const totalPaid = isPaid && orderValue != null ? orderValue : null;

  const stockShortfallType = await materialDeliveryService.resolveStockShortfallType({
    paymentStatus,
    movementId: order.orderNumber,
    purchaseOrderId: order.id,
  });

  await prisma.materialDelivery.create({
    data: {
      deliveryNumber: await generateDeliveryNumber(),
      polo: derivePolo(order.materialRequest?.costCenter),
      stockMovementId: movement.id,
      receiptType,
      movementId: order.orderNumber,
      movementNumber: rmNumber,
      rmNumber,
      contractId: contract?.id ?? null,
      currentStatus: MaterialDeliveryCurrentStatus.APROVADO_SUPRIMENTOS,
      paymentStatus,
      supplierId: order.supplierId,
      supplierName: order.supplier?.name ?? null,
      purchaseOrderId: order.id,
      orderValue,
      expectedDelivery: null,
      totalPaid,
      stockShortfallType,
      deliveryType: null,
      actualDelivery: movement.createdAt,
      finalStatus: MaterialDeliveryFinalStatus.PENDENTE,
      createdBy: movement.userId,
    },
  });

  await syncPurchaseOrderReceiptStatus(order.id);
  await syncMaterialRequestReceiptBadge(order.materialRequest?.id, receiptType, order.id);
}

export async function safeSyncMaterialDeliveryFromStockMovement(
  stockMovementId: string
): Promise<void> {
  try {
    await syncMaterialDeliveryFromStockMovement(stockMovementId);
  } catch (error) {
    console.error('[MaterialDelivery] sync from stock movement failed', stockMovementId, error);
  }
}

/** Atualiza pagamento/status de entregas existentes quando a OC muda (não cria entrega). */
export async function syncMaterialDeliveryPaymentsFromPurchaseOrder(
  purchaseOrderId: string
): Promise<void> {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentType: true,
      paymentProofUrl: true,
      amountToPay: true,
      supplierId: true,
      supplier: { select: { name: true } },
      materialRequest: {
        select: {
          requestNumber: true,
          costCenter: { select: { state: true, polo: true } },
        },
      },
    },
  });
  if (!order) return;

  const deliveries = await prisma.materialDelivery.findMany({
    where: { purchaseOrderId: order.id },
  });
  if (deliveries.length === 0) return;

  const paymentStatus = derivePaymentStatus(order);
  const isPaid = Boolean(order.paymentProofUrl);
  const orderValue = order.amountToPay;
  const totalPaid = isPaid && orderValue != null ? orderValue : null;
  const isCancelled = order.status === 'CANCELLED' || order.status === 'REJECTED';

  const stockShortfallType = await materialDeliveryService.resolveStockShortfallType({
    paymentStatus,
    movementId: order.orderNumber,
    purchaseOrderId: order.id,
  });

  for (const existing of deliveries) {
    const preserveConcluded =
      existing.receivedByEngineering ||
      existing.finalStatus === MaterialDeliveryFinalStatus.CONCLUIDO;

    await prisma.materialDelivery.update({
      where: { id: existing.id },
      data: {
        polo: derivePolo(order.materialRequest?.costCenter),
        paymentStatus,
        supplierId: order.supplierId,
        supplierName: order.supplier?.name ?? null,
        orderValue,
        totalPaid,
        stockShortfallType,
        finalStatus: isCancelled
          ? MaterialDeliveryFinalStatus.CANCELADO
          : preserveConcluded
            ? MaterialDeliveryFinalStatus.CONCLUIDO
            : existing.finalStatus,
        currentStatus: isCancelled
          ? MaterialDeliveryCurrentStatus.CANCELADO
          : preserveConcluded
            ? existing.currentStatus
            : existing.currentStatus,
      },
    });
  }
}

export async function safeSyncMaterialDeliveryPaymentsFromPurchaseOrder(
  purchaseOrderId: string
): Promise<void> {
  try {
    await syncMaterialDeliveryPaymentsFromPurchaseOrder(purchaseOrderId);
  } catch (error) {
    console.error('[MaterialDelivery] sync payments from purchase order failed', purchaseOrderId, error);
  }
}
