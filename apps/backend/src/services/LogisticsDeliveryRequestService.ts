import {
  LogisticsDeliveryOutcome,
  LogisticsDeliveryRequestStatus,
  LogisticsDeliveryUrgency,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { PhotoService } from './PhotoService';

const photoService = new PhotoService();

function parseImageContentType(dataUrl: string): string {
  const match = /^data:([^;]+);/.exec(dataUrl);
  return match?.[1] ?? 'image/jpeg';
}

export type CreateLogisticsDeliveryRequestInput = {
  createdBy: string;
  requestedAt: Date;
  urgency?: LogisticsDeliveryUrgency;
  contractId?: string | null;
  costCenterId?: string | null;
  serviceOrderId?: string | null;
  serviceOrderNumber?: string | null;
  purchaseOrderId?: string | null;
  purchaseOrderNumber?: string | null;
  movementId: string;
  supplierId?: string | null;
  driverName?: string | null;
  materialId?: string | null;
  materialName?: string | null;
  materialAttachmentUrl?: string | null;
  materialAttachmentName?: string | null;
  value: number;
  history?: string | null;
  observations?: string | null;
  expectedDelivery?: Date | null;
};

const include = {
  creator: { select: { id: true, name: true, email: true } },
  contract: { select: { id: true, name: true, number: true } },
  costCenter: { select: { id: true, code: true, name: true } },
  purchaseOrder: { select: { id: true, orderNumber: true } },
  supplier: { select: { id: true, code: true, name: true } },
  completion: {
    include: {
      completer: { select: { id: true, name: true, email: true } },
      invoiceAttachments: true,
    },
  },
} satisfies Prisma.LogisticsDeliveryRequestInclude;

export type FinalizeLogisticsDeliveryInput = {
  completedBy: string;
  receivingLocation: string;
  receivingResponsible: string;
  receivedAt: Date;
  deliveryOutcome: LogisticsDeliveryOutcome;
  locationPhotoBase64: string;
  observations?: string | null;
  invoiceAttachments?: Array<{ url: string; name?: string | null }>;
};

function parseOutcome(value: unknown): LogisticsDeliveryOutcome {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'PARTIAL' || normalized === 'PARCIAL') {
    return LogisticsDeliveryOutcome.PARTIAL;
  }
  if (normalized === 'NOT_DELIVERED' || normalized === 'NAO_ENTREGUE' || normalized === 'NÃO ENTREGUE') {
    return LogisticsDeliveryOutcome.NOT_DELIVERED;
  }
  return LogisticsDeliveryOutcome.DELIVERED;
}

function parseStatus(value: unknown): LogisticsDeliveryRequestStatus | undefined {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'PENDING' || normalized === 'PENDENTE') {
    return LogisticsDeliveryRequestStatus.PENDING;
  }
  if (normalized === 'COMPLETED' || normalized === 'FINALIZADA' || normalized === 'FINALIZADO') {
    return LogisticsDeliveryRequestStatus.COMPLETED;
  }
  return undefined;
}

function parseUrgency(value: unknown): LogisticsDeliveryUrgency {
  const normalized = String(value ?? 'NORMAL').trim().toUpperCase();
  if (normalized === 'URGENT' || normalized === 'URGENTE') return LogisticsDeliveryUrgency.URGENT;
  return LogisticsDeliveryUrgency.NORMAL;
}

function parseDecimal(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw createError('Valor inválido', 400);
  return n;
}

export class LogisticsDeliveryRequestService {
  async countPending() {
    return prisma.logisticsDeliveryRequest.count({
      where: { status: LogisticsDeliveryRequestStatus.PENDING },
    });
  }

  async list(params: { search?: string; limit?: number; status?: unknown }) {
    const term = params.search?.trim() ?? '';
    const limit = Math.min(Math.max(params.limit ?? 300, 1), 500);
    const status = parseStatus(params.status);

    const where: Prisma.LogisticsDeliveryRequestWhereInput = {};

    if (status) where.status = status;

    if (term) {
      where.OR = [
        { movementId: { contains: term, mode: 'insensitive' } },
        { driverName: { contains: term, mode: 'insensitive' } },
        { materialName: { contains: term, mode: 'insensitive' } },
        { serviceOrderNumber: { contains: term, mode: 'insensitive' } },
        { purchaseOrderNumber: { contains: term, mode: 'insensitive' } },
        { history: { contains: term, mode: 'insensitive' } },
        { observations: { contains: term, mode: 'insensitive' } },
        { supplier: { name: { contains: term, mode: 'insensitive' } } },
        { purchaseOrder: { orderNumber: { contains: term, mode: 'insensitive' } } },
        { costCenter: { name: { contains: term, mode: 'insensitive' } } },
        { contract: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    return prisma.logisticsDeliveryRequest.findMany({
      where,
      include,
      orderBy: [{ requestedAt: 'desc' }, { displayNumber: 'desc' }],
      take: limit,
    });
  }

  async getById(id: string) {
    const row = await prisma.logisticsDeliveryRequest.findUnique({
      where: { id },
      include,
    });
    if (!row) throw createError('Solicitação não encontrada', 404);
    return row;
  }

  async create(input: CreateLogisticsDeliveryRequestInput) {
    const movementId = input.movementId?.trim();
    if (!movementId) throw createError('ID movimento é obrigatório', 400);
    if (!input.purchaseOrderNumber?.trim() && !input.purchaseOrderId?.trim()) {
      throw createError('Número da OC é obrigatório', 400);
    }

    const value = parseDecimal(input.value);

    return prisma.$transaction(async (tx) => {
      const agg = await tx.logisticsDeliveryRequest.aggregate({ _max: { displayNumber: true } });
      const displayNumber = (agg._max.displayNumber ?? 0) + 1;

      return tx.logisticsDeliveryRequest.create({
        data: {
          displayNumber,
          createdBy: input.createdBy,
          requestedAt: input.requestedAt,
          urgency: input.urgency ?? LogisticsDeliveryUrgency.NORMAL,
          contractId: input.contractId?.trim() || null,
          costCenterId: input.costCenterId?.trim() || null,
          serviceOrderId: input.serviceOrderId?.trim() || null,
          serviceOrderNumber: input.serviceOrderNumber?.trim() || null,
          purchaseOrderId: input.purchaseOrderId?.trim() || null,
          purchaseOrderNumber: input.purchaseOrderNumber?.trim() || null,
          movementId,
          supplierId: input.supplierId?.trim() || null,
          driverName: input.driverName?.trim() || null,
          materialId: input.materialId?.trim() || null,
          materialName: input.materialName?.trim() || null,
          materialAttachmentUrl: input.materialAttachmentUrl?.trim() || null,
          materialAttachmentName: input.materialAttachmentName?.trim() || null,
          value: new Prisma.Decimal(value),
          history: input.history?.trim() || null,
          observations: input.observations?.trim() || null,
          expectedDelivery: input.expectedDelivery ?? null,
        },
        include,
      });
    });
  }

  async update(id: string, body: Record<string, unknown>) {
    await this.getById(id);

    const data: Prisma.LogisticsDeliveryRequestUpdateInput = {};

    if (body.requestedAt !== undefined) {
      const d = new Date(String(body.requestedAt));
      if (Number.isNaN(d.getTime())) throw createError('Data e hora inválida', 400);
      data.requestedAt = d;
    }
    if (body.urgency !== undefined) data.urgency = parseUrgency(body.urgency);
    if (body.movementId !== undefined) {
      const movementId = String(body.movementId ?? '').trim();
      if (!movementId) throw createError('ID movimento é obrigatório', 400);
      data.movementId = movementId;
    }
    if (body.value !== undefined) {
      data.value = new Prisma.Decimal(parseDecimal(body.value));
    }

    const optionalStrings = [
      'serviceOrderId',
      'serviceOrderNumber',
      'purchaseOrderNumber',
      'driverName',
      'materialId',
      'materialName',
      'materialAttachmentUrl',
      'materialAttachmentName',
      'history',
      'observations',
    ] as const;

    for (const field of optionalStrings) {
      if (body[field] !== undefined) {
        (data as Record<string, unknown>)[field] =
          body[field] != null && String(body[field]).trim() !== ''
            ? String(body[field]).trim()
            : null;
      }
    }

    if (body.expectedDelivery !== undefined) {
      const raw = body.expectedDelivery;
      if (!raw) data.expectedDelivery = null;
      else {
        const d = new Date(String(raw));
        data.expectedDelivery = Number.isNaN(d.getTime()) ? null : d;
      }
    }

    if (body.contractId !== undefined) {
      data.contract = body.contractId
        ? { connect: { id: String(body.contractId) } }
        : { disconnect: true };
    }
    if (body.costCenterId !== undefined) {
      data.costCenter = body.costCenterId
        ? { connect: { id: String(body.costCenterId) } }
        : { disconnect: true };
    }
    if (body.purchaseOrderId !== undefined) {
      const poId = String(body.purchaseOrderId ?? '').trim();
      data.purchaseOrder = poId ? { connect: { id: poId } } : { disconnect: true };
    }
    if (body.purchaseOrderNumber !== undefined) {
      const poNumber = String(body.purchaseOrderNumber ?? '').trim();
      if (!poNumber && body.purchaseOrderId === undefined) {
        throw createError('Número da OC é obrigatório', 400);
      }
      data.purchaseOrderNumber = poNumber || null;
    }
    if (body.supplierId !== undefined) {
      data.supplier = body.supplierId
        ? { connect: { id: String(body.supplierId) } }
        : { disconnect: true };
    }

    return prisma.logisticsDeliveryRequest.update({
      where: { id },
      data,
      include,
    });
  }

  async delete(id: string) {
    await this.getById(id);
    await prisma.logisticsDeliveryRequest.delete({ where: { id } });
  }

  async finalize(id: string, input: FinalizeLogisticsDeliveryInput) {
    const existing = await this.getById(id);
    if (existing.status === LogisticsDeliveryRequestStatus.COMPLETED) {
      throw createError('Esta solicitação já foi finalizada', 400);
    }

    const receivingLocation = input.receivingLocation?.trim();
    const receivingResponsible = input.receivingResponsible?.trim();
    if (!receivingLocation) throw createError('Local de recebimento é obrigatório', 400);
    if (!receivingResponsible) throw createError('Responsável pelo recebimento é obrigatório', 400);
    if (!input.locationPhotoBase64?.startsWith('data:image/')) {
      throw createError('Foto do local é obrigatória', 400);
    }

    const upload = await photoService.uploadPhotoFromBase64(
      input.locationPhotoBase64,
      input.completedBy,
      parseImageContentType(input.locationPhotoBase64),
    );

    const invoiceAttachments = (input.invoiceAttachments ?? []).filter((item) => item.url?.trim());

    return prisma.$transaction(async (tx) => {
      await tx.logisticsDeliveryCompletion.create({
        data: {
          deliveryRequestId: id,
          receivingLocation,
          receivingResponsible,
          receivedAt: input.receivedAt,
          deliveryOutcome: input.deliveryOutcome,
          locationPhotoUrl: upload.url,
          locationPhotoKey: upload.key,
          observations: input.observations?.trim() || null,
          completedBy: input.completedBy,
          invoiceAttachments: invoiceAttachments.length
            ? {
                create: invoiceAttachments.map((item) => ({
                  attachmentUrl: item.url.trim(),
                  attachmentName: item.name?.trim() || null,
                })),
              }
            : undefined,
        },
      });

      return tx.logisticsDeliveryRequest.update({
        where: { id },
        data: { status: LogisticsDeliveryRequestStatus.COMPLETED },
        include,
      });
    });
  }
}

export { parseOutcome, parseStatus };

export const logisticsDeliveryRequestService = new LogisticsDeliveryRequestService();
