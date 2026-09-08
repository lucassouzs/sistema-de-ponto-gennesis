import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { FlowService, FLOW_FORBIDDEN, FLOW_NOT_FOUND } from '../services/FlowService';

const flowService = new FlowService();

function requireUser(req: AuthRequest, next: NextFunction) {
  const id = req.user?.id;
  const isAdmin = Boolean(req.user?.isAdmin);
  if (!id) {
    next(createError('Usuário não autenticado', 401));
    return null;
  }
  return { id, isAdmin };
}

function handleFlowError(error: unknown, next: NextFunction) {
  const msg = error instanceof Error ? error.message : '';
  if (msg === FLOW_FORBIDDEN) return next(createError('Sem permissão para acessar o Flow', 403));
  if (msg === FLOW_NOT_FOUND) return next(createError('Diagrama não encontrado', 404));
  next(error);
}

export class FlowController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req, next);
      if (!user) return;
      const data = await flowService.listDiagrams(user.id, user.isAdmin);
      res.json({ success: true, data });
    } catch (error) {
      handleFlowError(error, next);
    }
  }

  async get(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req, next);
      if (!user) return;
      const data = await flowService.getDiagram(user.id, user.isAdmin, req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      handleFlowError(error, next);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req, next);
      if (!user) return;
      const data = await flowService.createDiagram(user.id, user.isAdmin, req.body);
      res.status(201).json({ success: true, data });
    } catch (error) {
      handleFlowError(error, next);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req, next);
      if (!user) return;
      const data = await flowService.updateDiagram(user.id, user.isAdmin, req.params.id, req.body);
      res.json({ success: true, data });
    } catch (error) {
      handleFlowError(error, next);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req, next);
      if (!user) return;
      await flowService.deleteDiagram(user.id, user.isAdmin, req.params.id);
      res.json({ success: true, message: 'Diagrama excluído' });
    } catch (error) {
      handleFlowError(error, next);
    }
  }

  async generate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req, next);
      if (!user) return;
      const { description, existingNodes, currentProcessName, existingEdges } = req.body;
      if (!description?.trim()) {
        return next(createError('Descreva o processo para gerar o fluxograma', 400));
      }
      const data = await flowService.generateFromAi(
        user.id,
        user.isAdmin,
        description.trim(),
        existingNodes,
        typeof currentProcessName === 'string' ? currentProcessName : undefined,
        existingEdges,
      );
      res.json({ success: true, data });
    } catch (error) {
      handleFlowError(error, next);
    }
  }
}
