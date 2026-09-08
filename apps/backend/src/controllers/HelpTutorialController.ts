import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { HelpTutorialService } from '../services/HelpTutorialService';

const service = new HelpTutorialService();

const VALIDATION_MESSAGES = new Set([
  'Título é obrigatório',
  'Resumo é obrigatório',
  'Setor é obrigatório',
  'Informe ao menos um passo',
  'Informe o conteúdo em markdown',
  'Informe a URL do Google Docs',
  'Informe o conteúdo do editor visual',
  'URL_DOCS_INVALIDA',
]);

function mapValidationMessage(message: string): string {
  if (message === 'URL_DOCS_INVALIDA') {
    return 'Informe uma URL válida do Google Docs ou Google Drive';
  }
  return message;
}

export class HelpTutorialController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const setor = typeof req.query.setor === 'string' ? req.query.setor : undefined;
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const tutorials = await service.list({ setor, q });
      return res.status(200).json({
        success: true,
        data: tutorials,
        count: tutorials.length,
      });
    } catch (error) {
      return next(error);
    }
  }

  async getBySlug(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { slug } = req.params;
      const tutorial = await service.getBySlug(slug);
      if (!tutorial) {
        throw createError('Tutorial não encontrado', 404);
      }
      return res.status(200).json({
        success: true,
        data: tutorial,
      });
    } catch (error) {
      return next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const {
        title,
        summary,
        setor,
        keywords,
        href,
        steps,
        contentType,
        markdown,
        docsUrl,
        richHtml,
      } = req.body || {};
      const tutorial = await service.create({
        title,
        summary,
        setor,
        keywords,
        href,
        steps,
        contentType,
        markdown,
        docsUrl,
        richHtml,
        createdById: req.user?.id,
      });
      return res.status(201).json({
        success: true,
        data: tutorial,
        message: 'Tutorial criado com sucesso',
      });
    } catch (error: any) {
      if (VALIDATION_MESSAGES.has(error?.message)) {
        return next(createError(mapValidationMessage(error.message), 400));
      }
      return next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const {
        title,
        summary,
        setor,
        keywords,
        href,
        steps,
        contentType,
        markdown,
        docsUrl,
        richHtml,
      } = req.body || {};
      const tutorial = await service.update(id, {
        title,
        summary,
        setor,
        keywords,
        href,
        steps,
        contentType,
        markdown,
        docsUrl,
        richHtml,
      });
      return res.status(200).json({
        success: true,
        data: tutorial,
        message: 'Tutorial atualizado com sucesso',
      });
    } catch (error: any) {
      if (error?.message === 'NOT_FOUND') {
        return next(createError('Tutorial não encontrado', 404));
      }
      if (VALIDATION_MESSAGES.has(error?.message)) {
        return next(createError(mapValidationMessage(error.message), 400));
      }
      return next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await service.remove(id);
      return res.status(200).json({
        success: true,
        message: 'Tutorial removido com sucesso',
      });
    } catch (error: any) {
      if (error?.message === 'NOT_FOUND') {
        return next(createError('Tutorial não encontrado', 404));
      }
      return next(error);
    }
  }
}
