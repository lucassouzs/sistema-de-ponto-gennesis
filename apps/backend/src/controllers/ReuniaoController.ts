import { Request, Response, NextFunction } from 'express';
import {
  ReuniaoService,
  ReuniaoData,
  ReuniaoTemplate,
  ReuniaoKind,
  parseReuniaoKind,
} from '../services/ReuniaoService';
import { getContractAccessForUser } from '../lib/contractAccess';
import { prisma } from '../lib/prisma';
import { getIsoMonthKey } from '../lib/monthPeriod';
import { getFortnightKey } from '../lib/weekPeriod';

interface AuthRequest extends Request {
  user?: { id: string; role: string; isAdmin: boolean };
  file?: Express.Multer.File;
  reuniaoKind?: ReuniaoKind;
}

const service = new ReuniaoService();

function kindFromReq(req: AuthRequest): ReuniaoKind {
  if (req.reuniaoKind) return req.reuniaoKind;
  return parseReuniaoKind(String(req.params.kind || ''));
}

export function parseReuniaoKindParam(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    req.reuniaoKind = parseReuniaoKind(String(req.params.kind || ''));
    return next();
  } catch {
    return res.status(400).json({ success: false, message: 'Tipo de acompanhamento inválido.' });
  }
}

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

  async getMensalOverview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Não autenticado.' });
      }

      const monthKey = String(req.query.monthKey || getIsoMonthKey()).trim() || getIsoMonthKey();
      const access = await getContractAccessForUser(req.user.id, req.user.isAdmin);

      if (access.filter === 'none') {
        return res.json({ success: true, data: [], monthKey });
      }

      const where = access.filter === 'ids' ? { id: { in: access.ids } } : {};

      const contracts = await prisma.contract.findMany({
        where,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          number: true,
          costCenter: { select: { code: true } },
        },
      });

      const rows = await Promise.all(
        contracts.map((contract) => service.getMensalOverviewRow(contract, monthKey)),
      );

      return res.json({ success: true, data: rows, monthKey });
    } catch (err) {
      return next(err);
    }
  }

  async getSemanalOverview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Não autenticado.' });
      }

      const weekKey = String(req.query.weekKey || getFortnightKey()).trim() || getFortnightKey();
      const access = await getContractAccessForUser(req.user.id, req.user.isAdmin);

      if (access.filter === 'none') {
        return res.json({ success: true, data: [], weekKey });
      }

      const where = access.filter === 'ids' ? { id: { in: access.ids } } : {};

      const contracts = await prisma.contract.findMany({
        where,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          number: true,
          costCenter: { select: { code: true } },
        },
      });

      const rows = await Promise.all(
        contracts.map((contract) => service.getSemanalOverviewRow(contract, weekKey)),
      );

      return res.json({ success: true, data: rows, weekKey });
    } catch (err) {
      return next(err);
    }
  }

  async getList(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      const kind = kindFromReq(req);
      const idx = await service.listReunioes(contractId, kind);
      res.json({ success: true, data: idx });
    } catch (err) {
      next(err);
    }
  }

  async getConfig(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      const kind = kindFromReq(req);
      const config = await service.getContractConfig(contractId, kind);
      res.json({ success: true, data: config });
    } catch (err) {
      next(err);
    }
  }

  async saveConfig(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      const kind = kindFromReq(req);
      const formularioId = String(
        (req.body as { formularioId?: string })?.formularioId || '',
      ).trim();
      const config = await service.saveContractConfig(contractId, kind, formularioId);
      return res.json({ success: true, data: config });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'Selecione um formulário.' || msg === 'Formulário não encontrado.') {
        return res.status(400).json({ success: false, message: msg });
      }
      return next(err);
    }
  }

  async ensurePeriodoAtual(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      const kind = kindFromReq(req);
      const entry = await service.ensurePeriodoAtual(contractId, kind);
      return res.json({ success: true, data: entry });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (
        msg === 'Configure o formulário de relatório mensal antes de preencher.' ||
        msg === 'Configure o formulário de reunião quinzenal antes de preencher.'
      ) {
        return res.status(400).json({ success: false, message: msg });
      }
      return next(err);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      const kind = kindFromReq(req);
      const formularioId = String(
        (req.body as { formularioId?: string })?.formularioId || '',
      ).trim();
      const entry = await service.createReuniao(contractId, kind, { formularioId });
      return res.status(201).json({ success: true, data: entry });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'Selecione um formulário.' || msg === 'Formulário não encontrado.') {
        return res.status(400).json({ success: false, message: msg });
      }
      return next(err);
    }
  }

  async get(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, reuniaoId } = req.params;
      const kind = kindFromReq(req);
      const data = await service.getReuniao(contractId, kind, reuniaoId);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Registro não encontrado.' });
      }
      return res.json({ success: true, data });
    } catch (err) {
      return next(err);
    }
  }

  async save(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, reuniaoId } = req.params;
      const kind = kindFromReq(req);
      const { data, finalize } = req.body as { data: ReuniaoData; finalize?: boolean };
      if (!data) {
        return res.status(400).json({ success: false, message: 'Dados do formulário são obrigatórios.' });
      }
      await service.saveReuniao(contractId, kind, reuniaoId, data, {
        finalize: Boolean(finalize),
      });
      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, reuniaoId } = req.params;
      const kind = kindFromReq(req);
      await service.deleteReuniao(contractId, kind, reuniaoId);
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
      const kind = kindFromReq(req);
      if (tipo !== 'ata' && tipo !== 'video') {
        return res.status(400).json({ success: false, message: 'Tipo de anexo inválido.' });
      }
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado.' });
      }

      const data = await service.getReuniao(contractId, kind, reuniaoId);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Registro não encontrado.' });
      }

      const existing = tipo === 'ata' ? data.ata : data.video;
      if (existing?.key) {
        await service.deleteAnexoFile(existing.key).catch(() => {});
      }

      const anexo = await service.uploadAnexo(contractId, kind, reuniaoId, tipo, file);
      const updated: ReuniaoData = { ...data, [tipo]: anexo };
      await service.saveReuniao(contractId, kind, reuniaoId, updated);

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
      const kind = kindFromReq(req);
      if (tipo !== 'ata' && tipo !== 'video') {
        return res.status(400).json({ success: false, message: 'Tipo de anexo inválido.' });
      }
      const data = await service.getReuniao(contractId, kind, reuniaoId);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Registro não encontrado.' });
      }

      const existing = tipo === 'ata' ? data.ata : data.video;
      if (existing?.key) {
        await service.deleteAnexoFile(existing.key).catch(() => {});
      }

      const updated: ReuniaoData = { ...data, [tipo]: null };
      await service.saveReuniao(contractId, kind, reuniaoId, updated);

      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  }
}
