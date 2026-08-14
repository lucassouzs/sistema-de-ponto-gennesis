import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { gestaoOsService } from '../services/GestaoOsService';
import {
  assertCanViewAllWorkOrders,
  assertCanViewWorkOrder,
  resolveGestaoOsAccess
} from '../lib/gestaoOsAccess';

export class GestaoOsController {
  async myAccess(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const access = await resolveGestaoOsAccess({
        userId: req.user.id,
        isAdmin: !!req.user.isAdmin
      });
      res.json({
        success: true,
        data: {
          isAdmin: access.isAdmin,
          canAnalisar: access.canAnalisar,
          canExecutar: access.canExecutar,
          canEncerrar: access.canEncerrar,
          canCadastros: access.canCadastros,
          canMeusChamados: access.canMeusChamados,
          canViewAll: access.canViewAll,
          // legado UI — single tenant
          memberships: [],
          activeCompanyId: null,
          profile: null
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async summary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const access = await resolveGestaoOsAccess({
        userId: req.user.id,
        isAdmin: !!req.user.isAdmin
      });
      assertCanViewAllWorkOrders(access);
      const data = await gestaoOsService.summary(access);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async locationTree(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await resolveGestaoOsAccess({
        userId: req.user.id,
        isAdmin: !!req.user.isAdmin
      });
      const data = await gestaoOsService.getLocationTree(null);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async technicians(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await resolveGestaoOsAccess({
        userId: req.user.id,
        isAdmin: !!req.user.isAdmin
      });
      const data = await gestaoOsService.listTechnicians(null);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const access = await resolveGestaoOsAccess({
        userId: req.user.id,
        isAdmin: !!req.user.isAdmin
      });
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const priority = typeof req.query.priority === 'string' ? req.query.priority : undefined;
      const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
      const mine = req.query.mine === '1' || req.query.mine === 'true';
      const assignedToMe = req.query.assignedToMe === '1' || req.query.assignedToMe === 'true';
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      // Sem visão geral: só mine ou assignedToMe.
      if (!access.canViewAll && !mine && !assignedToMe) {
        throw createError(
          'Sem permissão para listar todos os chamados. Use Meus Chamados (mine=1).',
          403
        );
      }

      const data = await gestaoOsService.list(
        {
          search,
          status,
          priority,
          buildingId,
          limit,
          requesterId: mine ? req.user.id : undefined,
          assigneeId: assignedToMe ? req.user.id : undefined
        },
        access
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const access = await resolveGestaoOsAccess({
        userId: req.user.id,
        isAdmin: !!req.user.isAdmin
      });
      const data = await gestaoOsService.getById(req.params.id, access);
      assertCanViewWorkOrder(access, {
        requesterId: data.requesterId,
        assigneeId: data.assigneeId
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const body = req.body ?? {};
      const access = await resolveGestaoOsAccess({
        userId: req.user.id,
        isAdmin: !!req.user.isAdmin
      });
      if (!access.canMeusChamados) {
        throw createError('Sem permissão para abrir chamados', 403);
      }
      const data = await gestaoOsService.create(
        {
          requesterId: req.user.id,
          category: body.category,
          description: body.description,
          priority: body.priority,
          buildingId: body.buildingId,
          sectorId: body.sectorId,
          placeId: body.placeId,
          assetId: body.assetId,
          attachments: body.attachments,
          companyId: null,
          dueAt: body.dueAt,
          maintenanceType: body.maintenanceType
        },
        access
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const body = req.body ?? {};
      const access = await resolveGestaoOsAccess({
        userId: req.user.id,
        isAdmin: !!req.user.isAdmin
      });
      const data = await gestaoOsService.update(
        req.params.id,
        req.user.id,
        {
          priority: body.priority,
          maintenanceType: body.maintenanceType,
          assigneeId: body.assigneeId,
          providerName: body.providerName,
          category: body.category,
          description: body.description,
          attachments: body.attachments,
          completionNote: body.completionNote,
          dueAt: body.dueAt,
          checklistResponses: body.checklistResponses,
          signatureRequesterUrl: body.signatureRequesterUrl,
          signatureTechnicianUrl: body.signatureTechnicianUrl
        },
        access
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async transition(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const body = req.body ?? {};
      const access = await resolveGestaoOsAccess({
        userId: req.user.id,
        isAdmin: !!req.user.isAdmin
      });
      const data = await gestaoOsService.transitionStatus(
        req.params.id,
        req.user.id,
        {
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
          attachments: body.attachments,
          checklistResponses: body.checklistResponses,
          signatureRequesterUrl: body.signatureRequesterUrl,
          signatureTechnicianUrl: body.signatureTechnicianUrl,
          dueAt: body.dueAt
        },
        access
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}

export const gestaoOsController = new GestaoOsController();
