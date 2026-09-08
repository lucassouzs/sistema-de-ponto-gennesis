import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeRequiredString(value: unknown, fieldLabel: string): string {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) throw createError(`${fieldLabel} é obrigatório`, 400);
  return trimmed;
}

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value).trim();
  // dd/mm/yyyy
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeStatus(value: unknown): string {
  const raw = normalizeOptionalString(value);
  if (!raw) return 'ATIVO';
  const n = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (['ativo', 'active', 'sim', 's', '1', 'true'].includes(n)) return 'ATIVO';
  if (['baixada', 'baixado', 'inativo', 'inactive', 'nao', 'n', '0', 'false'].includes(n)) return 'BAIXADA';
  return raw.toUpperCase();
}

type RtInput = Record<string, unknown>;

function buildResponsavelData(body: RtInput) {
  const crea = normalizeRequiredString(body.crea, 'CREA');
  const profissional = normalizeRequiredString(body.profissional, 'Profissional');
  const ufRaw = normalizeRequiredString(body.uf, 'UF');
  const uf = ufRaw.toUpperCase().slice(0, 2);

  return {
    crea,
    uf,
    empresa: normalizeOptionalString(body.empresa),
    profissional,
    cpf: normalizeOptionalString(body.cpf),
    registro: normalizeOptionalString(body.registro),
    dataInicio: parseDate(body.dataInicio),
    titulo: normalizeOptionalString(body.titulo),
    artCargoFuncao: normalizeOptionalString(body.artCargoFuncao),
    protocolo: normalizeOptionalString(body.protocolo),
    baixaEm: parseDate(body.baixaEm),
    anuidade2026: normalizeOptionalString(body.anuidade2026),
    status: normalizeStatus(body.status),
  };
}

export class ResponsavelTecnicoController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const q = String(req.query.q || '').trim();
      const status = String(req.query.status || '').trim();
      const empresa = String(req.query.empresa || '').trim();
      const crea = String(req.query.crea || '').trim();
      const profissional = String(req.query.profissional || '').trim();
      const anuidade = String(req.query.anuidade || '').trim();
      const dataInicioDe = String(req.query.dataInicioDe || '').trim();
      const dataInicioAte = String(req.query.dataInicioAte || '').trim();

      const where: Prisma.ResponsavelTecnicoWhereInput = {};
      if (status && status !== 'all') {
        where.status = status.toUpperCase();
      }
      if (empresa && empresa !== 'all') {
        where.empresa = { equals: empresa, mode: 'insensitive' };
      }
      if (crea && crea !== 'all') {
        const creaNorm = crea.toUpperCase();
        where.OR = [
          { crea: { equals: creaNorm, mode: 'insensitive' } },
          { uf: { equals: creaNorm.slice(0, 2), mode: 'insensitive' } },
          { crea: { contains: creaNorm, mode: 'insensitive' } },
        ];
      }
      if (profissional) {
        const profissionalOr: Prisma.ResponsavelTecnicoWhereInput[] = [
          { profissional: { equals: profissional, mode: 'insensitive' } },
          { registro: { equals: profissional, mode: 'insensitive' } },
        ];
        if (where.OR) {
          where.AND = [{ OR: where.OR }, { OR: profissionalOr }];
          delete where.OR;
        } else {
          where.OR = profissionalOr;
        }
      }
      if (anuidade && anuidade !== 'all') {
        where.anuidade2026 = { equals: anuidade, mode: 'insensitive' };
      }
      if (dataInicioDe || dataInicioAte) {
        where.dataInicio = {};
        if (dataInicioDe) {
          const d = parseDate(dataInicioDe);
          if (d) where.dataInicio.gte = d;
        }
        if (dataInicioAte) {
          const d = parseDate(dataInicioAte);
          if (d) {
            // inclui o dia inteiro
            const end = new Date(d);
            end.setHours(23, 59, 59, 999);
            where.dataInicio.lte = end;
          }
        }
      }
      if (q) {
        const textOr: Prisma.ResponsavelTecnicoWhereInput[] = [
          { crea: { contains: q, mode: 'insensitive' } },
          { profissional: { contains: q, mode: 'insensitive' } },
          { empresa: { contains: q, mode: 'insensitive' } },
          { cpf: { contains: q, mode: 'insensitive' } },
          { registro: { contains: q, mode: 'insensitive' } },
          { protocolo: { contains: q, mode: 'insensitive' } },
          { titulo: { contains: q, mode: 'insensitive' } },
        ];
        // Se já há OR (CREA / profissional), combina com AND
        if (where.OR) {
          where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: where.OR }, { OR: textOr }];
          delete where.OR;
        } else if (where.AND) {
          const andList = Array.isArray(where.AND) ? where.AND : [where.AND];
          where.AND = [...andList, { OR: textOr }];
        } else {
          where.OR = textOr;
        }
      }

      const rows = await prisma.responsavelTecnico.findMany({
        where,
        orderBy: [{ profissional: 'asc' }, { crea: 'asc' }],
      });

      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const row = await prisma.responsavelTecnico.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Responsável técnico não encontrado', 404);
      res.json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = buildResponsavelData(req.body || {});
      const created = await prisma.responsavelTecnico.create({ data });
      res.status(201).json({
        success: true,
        data: created,
        message: 'Responsável técnico criado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.responsavelTecnico.findUnique({ where: { id } });
      if (!existing) throw createError('Responsável técnico não encontrado', 404);

      const merged = { ...existing, ...req.body };
      const data = buildResponsavelData(merged);
      const updated = await prisma.responsavelTecnico.update({ where: { id }, data });
      res.json({
        success: true,
        data: updated,
        message: 'Responsável técnico atualizado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.responsavelTecnico.findUnique({ where: { id } });
      if (!existing) throw createError('Responsável técnico não encontrado', 404);
      await prisma.responsavelTecnico.delete({ where: { id } });
      res.json({ success: true, message: 'Responsável técnico excluído com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async deleteMany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? (req.body.ids as unknown[]).map((id) => String(id).trim()).filter(Boolean)
        : [];
      if (ids.length === 0) {
        throw createError('Envie um array "ids" com ao menos um item', 400);
      }

      const result = await prisma.responsavelTecnico.deleteMany({
        where: { id: { in: ids } },
      });

      res.json({
        success: true,
        data: { deleted: result.count },
        message: `${result.count} responsável(is) excluído(s) com sucesso`,
      });
    } catch (error) {
      next(error);
    }
  }

  async importMany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { responsaveis } = req.body;
      if (!Array.isArray(responsaveis) || responsaveis.length === 0) {
        throw createError('Envie um array "responsaveis" com ao menos um item', 400);
      }

      let created = 0;
      const errors: { index: number; message: string }[] = [];

      for (let i = 0; i < responsaveis.length; i++) {
        const row = responsaveis[i] as RtInput;
        try {
          const data = buildResponsavelData(row);
          await prisma.responsavelTecnico.create({ data });
          created += 1;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Erro ao importar linha';
          errors.push({ index: i, message });
        }
      }

      res.json({
        success: true,
        data: { created, failed: errors.length, errors },
        message: `Importação concluída: ${created} criado(s), ${errors.length} erro(s)`,
      });
    } catch (error) {
      next(error);
    }
  }
}
