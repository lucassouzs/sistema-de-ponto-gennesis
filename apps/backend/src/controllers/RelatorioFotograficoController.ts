import { Request, Response, NextFunction } from 'express';
import {
  RelatorioFotograficoService,
  RelatorioFotograficoData,
  RelatorioCamposData,
} from '../services/RelatorioFotograficoService';

interface AuthRequest extends Request {
  user?: { id: string; role: string };
}

const service = new RelatorioFotograficoService();

export class RelatorioFotograficoController {
  async getList(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      const idx = await service.getIndex(contractId);
      res.json({ success: true, data: idx.relatorios });
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      const { titulo, campos } = req.body as {
        titulo?: string;
        campos?: Partial<RelatorioCamposData>;
      };
      if (!titulo?.trim()) {
        return res.status(400).json({ success: false, message: 'Título é obrigatório.' });
      }
      const entry = await service.createRelatorio(contractId, titulo.trim(), campos);
      return res.status(201).json({ success: true, data: entry });
    } catch (err) {
      return next(err);
    }
  }

  async get(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, relatorioId } = req.params;
      const data = await service.getRelatorio(contractId, relatorioId);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Relatório não encontrado.' });
      }
      return res.json({ success: true, data });
    } catch (err) {
      return next(err);
    }
  }

  async save(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, relatorioId } = req.params;
      const { data, titulo } = req.body as { data: RelatorioFotograficoData; titulo?: string };
      if (!data) {
        return res.status(400).json({ success: false, message: 'Dados do relatório são obrigatórios.' });
      }
      await service.saveRelatorio(contractId, relatorioId, data, titulo);
      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  }

  async rename(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, relatorioId } = req.params;
      const { titulo } = req.body as { titulo?: string };
      if (!titulo?.trim()) {
        return res.status(400).json({ success: false, message: 'Título é obrigatório.' });
      }
      await service.renameRelatorio(contractId, relatorioId, titulo.trim());
      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, relatorioId } = req.params;
      await service.deleteRelatorio(contractId, relatorioId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
}
