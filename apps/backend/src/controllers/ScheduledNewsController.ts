import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { scheduledNewsService } from '../services/ScheduledNewsService';

const VALIDATION_MESSAGES = new Set([
  'Título é obrigatório',
  'Resumo é obrigatório',
  'Conteúdo é obrigatório',
  'Data de publicação é obrigatória',
  'Data de publicação inválida',
  'Data de expiração inválida',
  'A data de expiração deve ser maior que a data de publicação',
  'Selecione ao menos um setor',
  'Selecione ao menos um cargo',
  'Selecione ao menos um usuário',
  'Imagem é obrigatória',
]);

export class ScheduledNewsController {
  async listAdmin(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await scheduledNewsService.listAdmin({
        page: req.query.page,
        limit: req.query.limit,
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
      });
      return res.status(200).json({ success: true, ...data });
    } catch (error) {
      return next(error);
    }
  }

  async getAdminById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const news = await scheduledNewsService.getAdminById(req.params.id);
      if (!news) throw createError('Notícia não encontrada', 404);
      return res.status(200).json({ success: true, data: news });
    } catch (error) {
      return next(error);
    }
  }

  async listAudienceUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await scheduledNewsService.listAudienceUsers();
      return res.status(200).json({ success: true, data, count: data.length });
    } catch (error) {
      return next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const news = await scheduledNewsService.create(req.body || {}, req.user?.id);
      return res.status(201).json({
        success: true,
        data: news,
        message: 'Notícia criada com sucesso',
      });
    } catch (error: any) {
      if (VALIDATION_MESSAGES.has(error?.message)) {
        return next(createError(error.message, 400));
      }
      return next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const news = await scheduledNewsService.update(req.params.id, req.body || {}, req.user?.id);
      return res.status(200).json({
        success: true,
        data: news,
        message: 'Notícia atualizada com sucesso',
      });
    } catch (error: any) {
      if (error?.message === 'NOT_FOUND') {
        return next(createError('Notícia não encontrada', 404));
      }
      if (VALIDATION_MESSAGES.has(error?.message)) {
        return next(createError(error.message, 400));
      }
      return next(error);
    }
  }

  async publish(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const news = await scheduledNewsService.publish(req.params.id, req.user?.id);
      return res.status(200).json({
        success: true,
        data: news,
        message: 'Notícia publicada com sucesso',
      });
    } catch (error: any) {
      if (error?.message === 'NOT_FOUND') {
        return next(createError('Notícia não encontrada', 404));
      }
      return next(error);
    }
  }

  async cancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const news = await scheduledNewsService.cancel(req.params.id, req.user?.id);
      return res.status(200).json({
        success: true,
        data: news,
        message: 'Notícia cancelada com sucesso',
      });
    } catch (error: any) {
      if (error?.message === 'NOT_FOUND') {
        return next(createError('Notícia não encontrada', 404));
      }
      return next(error);
    }
  }

  async uploadImage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw createError('Imagem é obrigatória', 400);
      const news = await scheduledNewsService.uploadImage(req.params.id, req.file, req.user?.id);
      return res.status(200).json({
        success: true,
        data: news,
        message: 'Imagem enviada com sucesso',
      });
    } catch (error: any) {
      if (error?.message === 'NOT_FOUND') {
        return next(createError('Notícia não encontrada', 404));
      }
      if (VALIDATION_MESSAGES.has(error?.message)) {
        return next(createError(error.message, 400));
      }
      return next(error);
    }
  }

  async getCurrent(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) throw createError('Não autenticado', 401);
      const news = await scheduledNewsService.getCurrentForUser(req.user.id);
      return res.status(200).json({
        success: true,
        data: news,
      });
    } catch (error: any) {
      if (error?.message === 'USER_NOT_FOUND') {
        return next(createError('Usuário não encontrado', 404));
      }
      return next(error);
    }
  }

  async markViewed(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) throw createError('Não autenticado', 401);
      const news = await scheduledNewsService.markViewed(req.params.id, req.user.id);
      return res.status(200).json({
        success: true,
        data: news,
        message: 'Visualização registrada com sucesso',
      });
    } catch (error: any) {
      if (error?.message === 'USER_NOT_FOUND' || error?.message === 'NOT_FOUND') {
        return next(createError('Notícia não encontrada', 404));
      }
      return next(error);
    }
  }
}

export const scheduledNewsController = new ScheduledNewsController();
