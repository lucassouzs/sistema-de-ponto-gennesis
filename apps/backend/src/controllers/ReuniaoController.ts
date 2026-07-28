import { Request, Response, NextFunction } from 'express';
import { ReuniaoService, ReuniaoData, ReuniaoTemplate } from '../services/ReuniaoService';

interface AuthRequest extends Request {
  user?: { id: string; role: string };
  file?: Express.Multer.File;
}

const service = new ReuniaoService();

export class ReuniaoController {
  async getTemplate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await service.getTemplate();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async saveTemplate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const body = req.body as { data?: ReuniaoTemplate } & Partial<ReuniaoTemplate>;
      const template = (body.data || body) as ReuniaoTemplate;
      const data = await service.saveTemplate(template);
      return res.json({ success: true, data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'Template inválido.') {
        return res.status(400).json({ success: false, message: msg });
      }
      return next(err);
    }
  }

  async resetTemplate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await service.resetTemplate();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getList(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      const idx = await service.getIndex(contractId);
      res.json({ success: true, data: idx.reunioes });
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      const entry = await service.createReuniao(contractId);
      return res.status(201).json({ success: true, data: entry });
    } catch (err) {
      return next(err);
    }
  }

  async get(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, reuniaoId } = req.params;
      const data = await service.getReuniao(contractId, reuniaoId);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Reunião não encontrada.' });
      }
      return res.json({ success: true, data });
    } catch (err) {
      return next(err);
    }
  }

  async save(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, reuniaoId } = req.params;
      const { data } = req.body as { data: ReuniaoData };
      if (!data) {
        return res.status(400).json({ success: false, message: 'Dados da reunião são obrigatórios.' });
      }
      await service.saveReuniao(contractId, reuniaoId, data);
      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, reuniaoId } = req.params;
      await service.deleteReuniao(contractId, reuniaoId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  async uploadAnexo(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, reuniaoId, tipo } = req.params as {
        contractId: string;
        reuniaoId: string;
        tipo: string;
      };
      if (tipo !== 'ata' && tipo !== 'video') {
        return res.status(400).json({ success: false, message: 'Tipo de anexo inválido.' });
      }
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
      }

      const data = await service.getReuniao(contractId, reuniaoId);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Reunião não encontrada.' });
      }

      const existing = tipo === 'ata' ? data.ata : data.video;
      if (existing?.key) {
        await service.deleteAnexoFile(existing.key).catch(() => {});
      }

      const anexo = await service.uploadAnexo(contractId, reuniaoId, tipo, file);
      const updated: ReuniaoData = { ...data, [tipo]: anexo };
      await service.saveReuniao(contractId, reuniaoId, updated);

      return res.json({ success: true, data: anexo });
    } catch (err) {
      return next(err);
    }
  }

  async deleteAnexo(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, reuniaoId, tipo } = req.params as {
        contractId: string;
        reuniaoId: string;
        tipo: string;
      };
      if (tipo !== 'ata' && tipo !== 'video') {
        return res.status(400).json({ success: false, message: 'Tipo de anexo inválido.' });
      }
      const data = await service.getReuniao(contractId, reuniaoId);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Reunião não encontrada.' });
      }

      const existing = tipo === 'ata' ? data.ata : data.video;
      if (existing?.key) {
        await service.deleteAnexoFile(existing.key).catch(() => {});
      }

      const updated: ReuniaoData = { ...data, [tipo]: null };
      await service.saveReuniao(contractId, reuniaoId, updated);

      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  }
}
