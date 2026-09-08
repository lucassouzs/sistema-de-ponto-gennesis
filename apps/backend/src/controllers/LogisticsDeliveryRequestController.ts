import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import {
  logisticsDeliveryRequestService,
  parseOutcome,
} from '../services/LogisticsDeliveryRequestService';

function parseDateTime(value: unknown): Date {
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw createError('Data e hora inválida', 400);
  return d;
}

export class LogisticsDeliveryRequestController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const rows = await logisticsDeliveryRequestService.list({ search, limit, status });
      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  async pendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const count = await logisticsDeliveryRequestService.countPending();
      res.json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const row = await logisticsDeliveryRequestService.getById(req.params.id);
      res.json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const body = req.body ?? {};
      const row = await logisticsDeliveryRequestService.create({
        createdBy: req.user.id,
        requestedAt: parseDateTime(body.requestedAt ?? new Date().toISOString()),
        urgency: body.urgency,
        contractId: body.contractId,
        costCenterId: body.costCenterId,
        serviceOrderId: body.serviceOrderId,
        serviceOrderNumber: body.serviceOrderNumber,
        purchaseOrderId: body.purchaseOrderId,
        purchaseOrderNumber: body.purchaseOrderNumber,
        movementId: String(body.movementId ?? ''),
        supplierId: body.supplierId,
        driverName: body.driverName,
        materialId: body.materialId,
        materialName: body.materialName,
        materialAttachmentUrl: body.materialAttachmentUrl,
        materialAttachmentName: body.materialAttachmentName,
        value: body.value,
        history: body.history,
        observations: body.observations,
        expectedDelivery: body.expectedDelivery ? parseDateTime(body.expectedDelivery) : null,
      });
      res.status(201).json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const row = await logisticsDeliveryRequestService.update(req.params.id, req.body ?? {});
      res.json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await logisticsDeliveryRequestService.delete(req.params.id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async finalize(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const body = req.body ?? {};
      const invoiceAttachments = Array.isArray(body.invoiceAttachments)
        ? body.invoiceAttachments.map((item: { url?: string; name?: string }) => ({
            url: String(item?.url ?? ''),
            name: item?.name != null ? String(item.name) : null,
          }))
        : [];

      const row = await logisticsDeliveryRequestService.finalize(req.params.id, {
        completedBy: req.user.id,
        receivingLocation: String(body.receivingLocation ?? ''),
        receivingResponsible: String(body.receivingResponsible ?? ''),
        receivedAt: parseDateTime(body.receivedAt ?? new Date().toISOString()),
        deliveryOutcome: parseOutcome(body.deliveryOutcome),
        locationPhotoBase64: String(body.locationPhoto ?? ''),
        observations: body.observations,
        invoiceAttachments,
      });
      res.json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }
}

export const logisticsDeliveryRequestController = new LogisticsDeliveryRequestController();
