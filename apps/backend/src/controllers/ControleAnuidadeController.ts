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

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value).trim();
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parseValor(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  if (value instanceof Prisma.Decimal) return value;
  const raw = String(value)
    .trim()
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '');
  if (!raw || raw === '-' || raw === '—' || raw.toLowerCase() === 'n/a') return null;
  // 1.234,56 → 1234.56 | 1234.56 → 1234.56
  const normalized =
    raw.includes(',') && raw.includes('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.includes(',')
        ? raw.replace(',', '.')
        : raw;
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return new Prisma.Decimal(num.toFixed(2));
}

function normalizeStatus(value: unknown): string {
  const raw = normalizeOptionalString(value);
  if (!raw) return 'EM_ABERTA';
  const n = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
  if (['em_aberta', 'em_aberto', 'aberta', 'aberto', 'pendente', 'open'].includes(n)) {
    return 'EM_ABERTA';
  }
  if (['pago', 'paga', 'quitado', 'paid'].includes(n)) return 'PAGO';
  if (['vencida', 'vencido', 'atrasada', 'atrasado', 'overdue'].includes(n)) return 'VENCIDA';
  if (['cancelado', 'cancelada', 'baixado', 'baixada'].includes(n)) return 'CANCELADO';
  return raw.toUpperCase().replace(/\s+/g, '_');
}

type CaInput = Record<string, unknown>;

function buildControleAnuidadeData(body: CaInput) {
  const profissional =
    normalizeOptionalString(body.profissional) || 'Não informado';

  return {
    pagosPelo: normalizeOptionalString(body.pagosPelo),
    empresa: normalizeOptionalString(body.empresa),
    profissional,
    porqueDesconto: normalizeOptionalString(body.porqueDesconto),
    crea: normalizeOptionalString(body.crea),
    cpfCnpj: normalizeOptionalString(body.cpfCnpj),
    valor: parseValor(body.valor),
    dataVencimento: parseDate(body.dataVencimento),
    dataParaPagamento: parseDate(body.dataParaPagamento),
    dataPagamento: parseDate(body.dataPagamento),
    status: normalizeStatus(body.status),
    fluig: normalizeOptionalString(body.fluig),
  };
}

export class ControleAnuidadeController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const q = String(req.query.q || '').trim();
      const status = String(req.query.status || '').trim();
      const card = String(req.query.card || '').trim().toLowerCase();
      const empresa = String(req.query.empresa || '').trim();
      const pagosPelo = String(req.query.pagosPelo || '').trim();
      const vencDe = parseDate(req.query.vencDe);
      const vencAteRaw = parseDate(req.query.vencAte);
      const vencAte = vencAteRaw
        ? new Date(
            vencAteRaw.getFullYear(),
            vencAteRaw.getMonth(),
            vencAteRaw.getDate(),
            23,
            59,
            59,
            999
          )
        : null;

      const andFilters: Prisma.ControleAnuidadeWhereInput[] = [];
      if (q) {
        andFilters.push({
          OR: [
            { profissional: { contains: q, mode: 'insensitive' } },
            { empresa: { contains: q, mode: 'insensitive' } },
            { crea: { contains: q, mode: 'insensitive' } },
            { cpfCnpj: { contains: q, mode: 'insensitive' } },
            { pagosPelo: { contains: q, mode: 'insensitive' } },
            { fluig: { contains: q, mode: 'insensitive' } },
            { porqueDesconto: { contains: q, mode: 'insensitive' } },
          ],
        });
      }
      if (empresa) {
        andFilters.push({ empresa: { equals: empresa, mode: 'insensitive' } });
      }
      if (pagosPelo) {
        andFilters.push({ pagosPelo: { equals: pagosPelo, mode: 'insensitive' } });
      }
      if (vencDe || vencAte) {
        andFilters.push({
          dataVencimento: {
            ...(vencDe ? { gte: vencDe } : {}),
            ...(vencAte ? { lte: vencAte } : {}),
          },
        });
      }

      const searchWhere: Prisma.ControleAnuidadeWhereInput =
        andFilters.length > 0 ? { AND: andFilters } : {};

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

      const vencidasWhere: Prisma.ControleAnuidadeWhereInput = {
        AND: [
          searchWhere,
          {
            OR: [
              { status: 'VENCIDA' },
              { status: 'EM_ABERTA', dataVencimento: { lt: startOfToday } },
            ],
          },
        ],
      };

      let where: Prisma.ControleAnuidadeWhereInput = { ...searchWhere };
      if (status && status !== 'all') {
        where = { AND: [searchWhere, { status: status.toUpperCase() }] };
      } else if (card === 'pagos') {
        where = { AND: [searchWhere, { status: 'PAGO' }] };
      } else if (card === 'em_aberta') {
        where = { AND: [searchWhere, { status: 'EM_ABERTA' }] };
      } else if (card === 'vencidas') {
        where = vencidasWhere;
      } else if (card === 'vence_hoje') {
        where = {
          AND: [
            searchWhere,
            {
              status: 'EM_ABERTA',
              dataVencimento: { gte: startOfToday, lt: startOfTomorrow },
            },
          ],
        };
      }

      const [rows, pagos, emAberta, vencidas, venceHoje] = await Promise.all([
        prisma.controleAnuidade.findMany({
          where,
          orderBy: [{ dataVencimento: 'asc' }, { profissional: 'asc' }],
        }),
        prisma.controleAnuidade.count({
          where: { AND: [searchWhere, { status: 'PAGO' }] },
        }),
        prisma.controleAnuidade.count({
          where: { AND: [searchWhere, { status: 'EM_ABERTA' }] },
        }),
        prisma.controleAnuidade.count({ where: vencidasWhere }),
        prisma.controleAnuidade.count({
          where: {
            AND: [
              searchWhere,
              {
                status: 'EM_ABERTA',
                dataVencimento: { gte: startOfToday, lt: startOfTomorrow },
              },
            ],
          },
        }),
      ]);

      res.json({
        success: true,
        data: rows,
        meta: { pagos, emAberta, vencidas, venceHoje },
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const row = await prisma.controleAnuidade.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Registro de anuidade não encontrado', 404);
      res.json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = buildControleAnuidadeData(req.body || {});
      const created = await prisma.controleAnuidade.create({ data });
      res.status(201).json({
        success: true,
        data: created,
        message: 'Registro de anuidade criado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.controleAnuidade.findUnique({ where: { id } });
      if (!existing) throw createError('Registro de anuidade não encontrado', 404);

      const merged = {
        ...existing,
        ...req.body,
        valor: req.body?.valor !== undefined ? req.body.valor : existing.valor?.toString(),
      };
      const data = buildControleAnuidadeData(merged);
      const updated = await prisma.controleAnuidade.update({ where: { id }, data });
      res.json({
        success: true,
        data: updated,
        message: 'Registro de anuidade atualizado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.controleAnuidade.findUnique({ where: { id } });
      if (!existing) throw createError('Registro de anuidade não encontrado', 404);
      await prisma.controleAnuidade.delete({ where: { id } });
      res.json({ success: true, message: 'Registro de anuidade excluído com sucesso' });
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

      const result = await prisma.controleAnuidade.deleteMany({
        where: { id: { in: ids } },
      });

      res.json({
        success: true,
        data: { deleted: result.count },
        message: `${result.count} registro(s) excluído(s) com sucesso`,
      });
    } catch (error) {
      next(error);
    }
  }

  async importMany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { registros } = req.body;
      if (!Array.isArray(registros) || registros.length === 0) {
        throw createError('Envie um array "registros" com ao menos um item', 400);
      }

      let created = 0;
      const errors: { index: number; message: string }[] = [];

      for (let i = 0; i < registros.length; i++) {
        const row = registros[i] as CaInput;
        try {
          const data = buildControleAnuidadeData(row);
          await prisma.controleAnuidade.create({ data });
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
