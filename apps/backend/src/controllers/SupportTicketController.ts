import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { supportTicketService } from '../services/SupportTicketService';

export class SupportTicketController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const data = await supportTicketService.listForTeam({ status, category, q });
      return res.status(200).json({ success: true, data, count: data.length });
    } catch (error) {
      return next(error);
    }
  }

  async listMine(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Não autenticado', 401);
      const data = await supportTicketService.listMine(userId);
      return res.status(200).json({ success: true, data, count: data.length });
    } catch (error) {
      return next(error);
    }
  }

  async pendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const count = await supportTicketService.pendingCount();
      return res.status(200).json({ success: true, count });
    } catch (error) {
      return next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const ticket = await supportTicketService.getById(req.params.id);
      if (!ticket) throw createError('Chamado não encontrado', 404);
      return res.status(200).json({ success: true, data: ticket });
    } catch (error) {
      return next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Não autenticado', 401);
      const { status, assigneeId, resolutionNote } = req.body || {};
      const data = await supportTicketService.update(
        req.params.id,
        { status, assigneeId, resolutionNote },
        userId,
      );
      return res.status(200).json({ success: true, data });
    } catch (error) {
      if (error instanceof Error && error.message === 'Chamado não encontrado') {
        return next(createError(error.message, 404));
      }
      return next(error);
    }
  }
}

export const supportTicketController = new SupportTicketController();
