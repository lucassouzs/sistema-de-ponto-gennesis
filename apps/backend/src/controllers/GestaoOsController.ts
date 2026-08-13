import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { gestaoOsService } from '../services/GestaoOsService';

export class GestaoOsController {
  async summary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsService.summary();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async locationTree(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsService.getLocationTree();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async technicians(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsService.listTechnicians();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const priority = typeof req.query.priority === 'string' ? req.query.priority : undefined;
      const mine = req.query.mine === '1' || req.query.mine === 'true';
      const assignedToMe = req.query.assignedToMe === '1' || req.query.assignedToMe === 'true';
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const data = await gestaoOsService.list({
        search,
        status,
        priority,
        limit,
        requesterId: mine ? req.user.id : undefined,
        assigneeId: assignedToMe ? req.user.id : undefined
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const data = await gestaoOsService.getById(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const body = req.body ?? {};
      const data = await gestaoOsService.create({
        requesterId: req.user.id,
        category: body.category,
        description: body.description,
        priority: body.priority,
        buildingId: body.buildingId,
        sectorId: body.sectorId,
        placeId: body.placeId,
        assetId: body.assetId,
        attachments: body.attachments
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const body = req.body ?? {};
      const data = await gestaoOsService.update(req.params.id, req.user.id, {
        priority: body.priority,
        maintenanceType: body.maintenanceType,
        assigneeId: body.assigneeId,
        providerName: body.providerName,
        category: body.category,
        description: body.description,
        attachments: body.attachments,
        completionNote: body.completionNote
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async transition(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const body = req.body ?? {};
      const data = await gestaoOsService.transitionStatus(req.params.id, req.user.id, {
        status: body.status,
        note: body.note,
        cancelReason: body.cancelReason,
        priority: body.priority,
        maintenanceType: body.maintenanceType,
        assigneeId: body.assigneeId,
        providerName: body.providerName,
        completionNote: body.completionNote,
        rating: body.rating,
        ratingComment: body.ratingComment,
        attachments: body.attachments
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const gestaoOsController = new GestaoOsController();
