import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { ServiceOrderService } from '../services/ServiceOrderService';

const serviceOrderService = new ServiceOrderService();

export class ServiceOrderController {
  async listContractOptions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) throw createError('Usuário não autenticado', 401);
      const data = await serviceOrderService.listContractOptions(
        req.user.id,
        !!req.user.isAdmin,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async resolveLinkedContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const serviceOrderId =
        typeof req.query.serviceOrderId === 'string' ? req.query.serviceOrderId.trim() : '';
      if (!serviceOrderId) {
        throw createError('serviceOrderId é obrigatório', 400);
      }
      const data = await serviceOrderService.resolveContractForServiceOrder(serviceOrderId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const contractId =
        typeof req.query.contractId === 'string' ? req.query.contractId.trim() : '';
      const costCenterId =
        typeof req.query.costCenterId === 'string' ? req.query.costCenterId.trim() : '';

      if (contractId) {
        const data = await serviceOrderService.listByContract(contractId);
        res.json({ success: true, data });
        return;
      }

      if (!costCenterId) {
        throw createError('contractId ou costCenterId é obrigatório', 400);
      }

      const data = await serviceOrderService.listByCostCenter(costCenterId);
      res.json({ success: true, data });
    } catch (error) {
      if (error instanceof Error && (error.message.includes('Centro de custo') || error.message.includes('Contrato'))) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      next(error);
    }
  }

  /** @deprecated use list with costCenterId query */
  async listByCostCenter(req: AuthRequest, res: Response, next: NextFunction) {
    return this.list(req, res, next);
  }
}
