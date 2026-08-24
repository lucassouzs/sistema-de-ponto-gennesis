import { NextFunction, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { NfeRecebidaService } from '../services/NfeRecebidaService';

const service = new NfeRecebidaService();

export class NfeRecebidaController {
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const emitenteRaw = req.query.emitente;
      const emitente = Array.isArray(emitenteRaw)
        ? emitenteRaw.map(String)
        : typeof emitenteRaw === 'string'
          ? emitenteRaw
          : undefined;
      const periodFrom =
        typeof req.query.periodFrom === 'string' ? req.query.periodFrom : undefined;
      const periodTo = typeof req.query.periodTo === 'string' ? req.query.periodTo : undefined;
      const scope = req.query.scope === 'outros' ? 'outros' : 'ano';
      const page = req.query.page ? Number(req.query.page) : 1;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 50;
      const data = await service.list({
        q,
        emitente,
        page,
        pageSize,
        periodFrom,
        periodTo,
        scope,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async listEmitentes(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await service.listEmitentes();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getDetalhe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);
      const data = await service.getDetalhe(id);
      if (!data) throw createError('NF não encontrada', 404);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async downloadXml(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);
      const file = await service.getXmlFile(id);
      if (!file) throw createError('XML da NF não encontrado no servidor', 404);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${file.downloadName.replace(/"/g, '')}"`
      );
      res.sendFile(file.absolutePath);
    } catch (error) {
      next(error);
    }
  }

  /** DANFE em PDF (busca XML completo na SEFAZ pela chave se só houver resumo). */
  async downloadDanfe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);
      const file = await service.getDanfePdf(id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${file.downloadName.replace(/"/g, '')}"`
      );
      res.send(file.buffer);
    } catch (error) {
      next(error);
    }
  }

  async buscar(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const periodFrom =
        typeof req.body?.periodFrom === 'string' ? req.body.periodFrom : undefined;
      const periodTo = typeof req.body?.periodTo === 'string' ? req.body.periodTo : undefined;
      const resetNsu = Boolean(req.body?.resetNsu);
      const data = await service.buscar({ periodFrom, periodTo, resetNsu });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async reimportar(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await service.reimportLocal();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}
