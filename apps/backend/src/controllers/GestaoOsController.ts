import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { gestaoOsService } from '../services/GestaoOsService';
import {
  assertCanViewAllWorkOrders,
  assertCanViewWorkOrder,
  resolveGestaoOsAccess,
  resolveGestaoOsAccessAllowPersonal
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
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const priority = typeof req.query.priority === 'string' ? req.query.priority : undefined;
      const buildingId = typeof req.query.buildingId === 'string' ? req.query.buildingId : undefined;
      const mine = req.query.mine === '1' || req.query.mine === 'true';
      const assignedToMe = req.query.assignedToMe === '1' || req.query.assignedToMe === 'true';
      const involved = req.query.involved === '1' || req.query.involved === 'true';
      const unitPortal = req.query.unitPortal === '1' || req.query.unitPortal === 'true';
      const overdue = req.query.overdue === '1' || req.query.overdue === 'true';
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const access =
        mine || assignedToMe || involved || unitPortal
          ? await resolveGestaoOsAccessAllowPersonal({
              userId: req.user.id,
              isAdmin: !!req.user.isAdmin
            })
          : await resolveGestaoOsAccess({
              userId: req.user.id,
              isAdmin: !!req.user.isAdmin
            });

      // Sem visão geral: só o que a pessoa abriu, recebeu ou a unidade que gerencia.
      if (!access.canViewAll && !mine && !assignedToMe && !involved && !unitPortal) {
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
          overdue,
          unitPortal,
          requesterId: mine && !involved && !unitPortal ? req.user.id : undefined,
          assigneeId: assignedToMe && !involved && !unitPortal ? req.user.id : undefined,
          involvedUserId: involved && !unitPortal ? req.user.id : undefined
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
      const access = await resolveGestaoOsAccessAllowPersonal({
        userId: req.user.id,
        isAdmin: !!req.user.isAdmin
      });
      const data = await gestaoOsService.getById(req.params.id, access);
      try {
        assertCanViewWorkOrder(access, {
          requesterId: data.requesterId,
          assigneeId: data.assigneeId,
          teamUserIds: (data as { teamUserIds?: unknown }).teamUserIds
        });
      } catch (err) {
        const { loadUnitBuildingIds } = await import('../lib/gestaoOsEdital');
        const unitIds = await loadUnitBuildingIds(access.userId);
        if (!data.buildingId || !unitIds.includes(data.buildingId)) throw err;
      }
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
          maintenanceType: body.maintenanceType,
          relatedWorkOrderId: body.relatedWorkOrderId,
          autoAssign: body.autoAssign === true,
          origin: body.origin,
          sacKind: body.sacKind,
          teamUserIds: body.teamUserIds
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
          safetyChecklistResponses: body.safetyChecklistResponses,
          safetyPhotoUrl: body.safetyPhotoUrl,
          signatureRequesterUrl: body.signatureRequesterUrl,
          signatureTechnicianUrl: body.signatureTechnicianUrl,
          parts: body.parts,
          relatedWorkOrderId: body.relatedWorkOrderId,
          startPhotoUrl: body.startPhotoUrl,
          endPhotoUrl: body.endPhotoUrl,
          autoAssign: body.autoAssign === true,
          teamUserIds: body.teamUserIds
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
          dueAt: body.dueAt,
          safetyChecklistResponses: body.safetyChecklistResponses,
          safetyPhotoUrl: body.safetyPhotoUrl,
          parts: body.parts,
          startPhotoUrl: body.startPhotoUrl,
          endPhotoUrl: body.endPhotoUrl,
          autoAssign: body.autoAssign === true,
          relatedWorkOrderId: body.relatedWorkOrderId,
          teamUserIds: body.teamUserIds,
          fiscalRating: body.fiscalRating,
          fiscalRatingComment: body.fiscalRatingComment,
          closeQrToken: body.closeQrToken
        },
        access
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async listComments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const access = await resolveGestaoOsAccess({
        userId: req.user.id,
        isAdmin: !!req.user.isAdmin
      });
      const data = await gestaoOsService.listComments(req.params.id, access);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async createComment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const access = await resolveGestaoOsAccess({
        userId: req.user.id,
        isAdmin: !!req.user.isAdmin
      });
      const content = typeof req.body?.content === 'string' ? req.body.content : '';
      const data = await gestaoOsService.createComment(req.params.id, req.user.id, content, access);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async deleteComment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await gestaoOsService.deleteComment(
        req.params.commentId,
        req.user.id,
        !!req.user.isAdmin
      );
      res.json({ success: true, message: 'Comentário excluído' });
    } catch (error) {
      next(error);
    }
  }

  async atteste(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const access = await resolveGestaoOsAccess({
        userId: req.user.id,
        isAdmin: !!req.user.isAdmin
      });
      const body = req.body ?? {};
      const data = await gestaoOsService.atteste(
        req.params.id,
        req.user.id,
        {
          fiscalRating: body.fiscalRating,
          fiscalRatingComment: body.fiscalRatingComment
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
