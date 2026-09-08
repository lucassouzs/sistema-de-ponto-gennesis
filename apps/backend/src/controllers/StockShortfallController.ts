import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { stockShortfallService } from '../services/StockShortfallService';
import { createError } from '../middleware/errorHandler';
import {
  applyUnbCostCenterScopeToIdFilter,
  getUserUnbCostCenterScope,
} from '../lib/unbCostCenterScope';

export class StockShortfallController {
  async countPending(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) throw createError('Não autenticado', 401);
      const unbScope = await getUserUnbCostCenterScope(req.user.id, !!req.user.isAdmin);
      if (unbScope !== null) {
        if (unbScope.length === 0) {
          res.json({ success: true, count: 0 });
          return;
        }
        const data = await stockShortfallService.list({
          status: 'ABERTO',
          costCenterIds: unbScope,
          limit: 500,
        });
        res.json({ success: true, count: data.length });
        return;
      }
      const count = await stockShortfallService.countOpenPending();
      res.json({ success: true, count });
    } catch (error) {
      next(error);
    }
  }

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) throw createError('Não autenticado', 401);
      const { status, costCenterId, category, month, year, search, limit } = req.query;
      const st = status ? String(status).toUpperCase() : 'ALL';
      const statusFilter =
        st === 'ABERTO' || st === 'RESOLVIDO' ? (st as 'ABERTO' | 'RESOLVIDO') : 'ALL';

      const unbScope = await getUserUnbCostCenterScope(req.user.id, !!req.user.isAdmin);
      const scoped = applyUnbCostCenterScopeToIdFilter(
        unbScope,
        costCenterId ? String(costCenterId) : undefined,
      );
      if (scoped.denyAll) {
        res.json({ success: true, data: [] });
        return;
      }

      const data = await stockShortfallService.list({
        status: statusFilter,
        costCenterId: scoped.costCenterId,
        costCenterIds: scoped.costCenterIds,
        category: category ? String(category) : undefined,
        month: month ? parseInt(String(month), 10) : undefined,
        year: year ? parseInt(String(year), 10) : undefined,
        search: search ? String(search) : undefined,
        limit: limit ? parseInt(String(limit), 10) : undefined
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async resolve(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) throw createError('Não autenticado', 401);
      const { id } = req.params;
      const updated = await stockShortfallService.resolve(String(id), req.user.id);
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
}
