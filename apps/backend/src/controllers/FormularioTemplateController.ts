import { Request, Response, NextFunction } from 'express';
import {
  FormularioTemplateService,
  FormularioSection,
} from '../services/FormularioTemplateService';

interface AuthRequest extends Request {
  user?: { id: string; role: string };
}

const service = new FormularioTemplateService();

export class FormularioTemplateController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await service.list();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async get(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = await service.get(id);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Formulário não encontrado.' });
      }
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const body = req.body as {
        name?: string;
        description?: string;
        sections?: FormularioSection[];
      };
      const data = await service.create(body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'Seções inválidas.') {
        return res.status(400).json({ success: false, message: msg });
      }
      return next(err);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const body = req.body as {
        name?: string;
        description?: string | null;
        sections?: FormularioSection[];
      };
      const data = await service.update(id, body);
      res.json({ success: true, data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'Formulário não encontrado.') {
        return res.status(404).json({ success: false, message: msg });
      }
      if (msg === 'Seções inválidas.') {
        return res.status(400).json({ success: false, message: msg });
      }
      return next(err);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await service.delete(id);
      res.json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'Formulário não encontrado.') {
        return res.status(404).json({ success: false, message: msg });
      }
      return next(err);
    }
  }
}
