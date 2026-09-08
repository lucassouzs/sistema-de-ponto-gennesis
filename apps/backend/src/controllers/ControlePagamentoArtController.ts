import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const n = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (
    n === '-' ||
    n === '—' ||
    n === 'n/a' ||
    n === 'nao tem' ||
    n === 'sem fluig' ||
    n === 'sem valor' ||
    n === 'vazio'
  ) {
    return null;
  }
  return trimmed;
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
  if (['em_aberta', 'em_aberto', 'aberta', 'aberto', 'pendente', 'open', 'a_vencer'].includes(n)) {
    return 'EM_ABERTA';
  }
  if (['pago', 'paga', 'quitado', 'paid'].includes(n)) return 'PAGO';
  if (['vencida', 'vencido', 'atrasada', 'atrasado', 'overdue'].includes(n)) return 'VENCIDA';
  if (['cancelado', 'cancelada', 'baixado', 'baixada'].includes(n)) return 'CANCELADO';
  return raw.toUpperCase().replace(/\s+/g, '_');
}

function normalizeUf(value: unknown): string | null {
  const raw = normalizeOptionalString(value);
  if (!raw) return null;
  return raw.toUpperCase().slice(0, 2);
}

function normalizePago(value: unknown): string | null {
  const raw = normalizeOptionalString(value);
  if (!raw) return null;
  const n = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (['sim', 's', 'yes', 'y', 'x', 'pago', 'ok', 'true', '1'].includes(n)) return 'SIM';
  if (['nao', 'não', 'n', 'no', 'false', '0'].includes(n)) return 'NAO';
  return raw.toUpperCase();
}

type CapInput = Record<string, unknown>;

function buildControlePagamentoArtData(body: CapInput) {
  const profissional = normalizeOptionalString(body.profissional) || 'Não informado';

  return {
    uf: normalizeUf(body.uf),
    empresa: normalizeOptionalString(body.empresa),
    contratante: normalizeOptionalString(body.contratante),
    cnpjCpf: normalizeOptionalString(body.cnpjCpf),
    contrato: normalizeOptionalString(body.contrato),
    observacoes: normalizeOptionalString(body.observacoes),
    vigenciaInicio: parseDate(body.vigenciaInicio),
    vigenciaTermino: parseDate(body.vigenciaTermino),
    renovacao: parseDate(body.renovacao),
    art: normalizeOptionalString(body.art),
    valor: parseValor(body.valor),
    profissional,
    vencDoBoleto: parseDate(body.vencDoBoleto),
    status: normalizeStatus(body.status),
    pago: normalizePago(body.pago),
    solicitaEm: parseDate(body.solicitaEm),
    pagoEm: parseDate(body.pagoEm),
    fluig: normalizeOptionalString(body.fluig),
  };
}

export class ControlePagamentoArtController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const q = String(req.query.q || '').trim();
      const status = String(req.query.status || '').trim();
      const card = String(req.query.card || '').trim().toLowerCase();
      const uf = String(req.query.uf || '').trim();
      const empresa = String(req.query.empresa || '').trim();
      const contratante = String(req.query.contratante || '').trim();
      const profissional = String(req.query.profissional || '').trim();
      const pago = String(req.query.pago || '').trim().toUpperCase();
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

      const andFilters: Prisma.ControlePagamentoArtWhereInput[] = [];
      if (q) {
        andFilters.push({
          OR: [
            { profissional: { contains: q, mode: 'insensitive' } },
            { uf: { contains: q, mode: 'insensitive' } },
            { empresa: { contains: q, mode: 'insensitive' } },
            { contratante: { contains: q, mode: 'insensitive' } },
            { cnpjCpf: { contains: q, mode: 'insensitive' } },
            { contrato: { contains: q, mode: 'insensitive' } },
            { art: { contains: q, mode: 'insensitive' } },
            { fluig: { contains: q, mode: 'insensitive' } },
            { observacoes: { contains: q, mode: 'insensitive' } },
          ],
        });
      }
      if (uf) {
        andFilters.push({ uf: { equals: uf, mode: 'insensitive' } });
      }
      if (empresa) {
        andFilters.push({ empresa: { equals: empresa, mode: 'insensitive' } });
      }
      if (contratante) {
        andFilters.push({ contratante: { equals: contratante, mode: 'insensitive' } });
      }
      if (profissional) {
        andFilters.push({ profissional: { equals: profissional, mode: 'insensitive' } });
      }
      if (pago === 'SIM' || pago === 'NAO') {
        andFilters.push({ pago });
      }
      if (vencDe || vencAte) {
        andFilters.push({
          vencDoBoleto: {
            ...(vencDe ? { gte: vencDe } : {}),
            ...(vencAte ? { lte: vencAte } : {}),
          },
        });
      }

      const searchWhere: Prisma.ControlePagamentoArtWhereInput =
        andFilters.length > 0 ? { AND: andFilters } : {};

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const aVencerWhere: Prisma.ControlePagamentoArtWhereInput = {
        AND: [
          searchWhere,
          {
            status: 'EM_ABERTA',
            OR: [{ vencDoBoleto: null }, { vencDoBoleto: { gte: startOfToday } }],
          },
        ],
      };

      const vencidasWhere: Prisma.ControlePagamentoArtWhereInput = {
        AND: [
          searchWhere,
          {
            OR: [
              { status: 'VENCIDA' },
              { status: 'EM_ABERTA', vencDoBoleto: { lt: startOfToday } },
            ],
          },
        ],
      };

      let where: Prisma.ControlePagamentoArtWhereInput = { ...searchWhere };
      if (status && status !== 'all') {
        where = { AND: [searchWhere, { status: status.toUpperCase() }] };
      } else if (card === 'pagos') {
        where = { AND: [searchWhere, { status: 'PAGO' }] };
      } else if (card === 'a_vencer') {
        where = aVencerWhere;
      } else if (card === 'vencidas') {
        where = vencidasWhere;
      }

      const [rows, total, pagos, aVencer, vencidas] = await Promise.all([
        prisma.controlePagamentoArt.findMany({
          where,
          orderBy: [{ vencDoBoleto: 'asc' }, { profissional: 'asc' }],
        }),
        prisma.controlePagamentoArt.count({ where: searchWhere }),
        prisma.controlePagamentoArt.count({
          where: { ...searchWhere, status: 'PAGO' },
        }),
        prisma.controlePagamentoArt.count({ where: aVencerWhere }),
        prisma.controlePagamentoArt.count({ where: vencidasWhere }),
      ]);

      res.json({
        success: true,
        data: rows,
        meta: { total, pagos, aVencer, vencidas },
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const row = await prisma.controlePagamentoArt.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Registro de pagamento ART não encontrado', 404);
      res.json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = buildControlePagamentoArtData(req.body || {});
      const created = await prisma.controlePagamentoArt.create({ data });
      res.status(201).json({
        success: true,
        data: created,
        message: 'Registro de pagamento ART criado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.controlePagamentoArt.findUnique({ where: { id } });
      if (!existing) throw createError('Registro de pagamento ART não encontrado', 404);

      const merged = {
        ...existing,
        ...req.body,
        valor: req.body?.valor !== undefined ? req.body.valor : existing.valor?.toString(),
      };
      const data = buildControlePagamentoArtData(merged);
      const updated = await prisma.controlePagamentoArt.update({ where: { id }, data });
      res.json({
        success: true,
        data: updated,
        message: 'Registro de pagamento ART atualizado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.controlePagamentoArt.findUnique({ where: { id } });
      if (!existing) throw createError('Registro de pagamento ART não encontrado', 404);
      await prisma.controlePagamentoArt.delete({ where: { id } });
      res.json({ success: true, message: 'Registro de pagamento ART excluído com sucesso' });
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

      const result = await prisma.controlePagamentoArt.deleteMany({
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
        const row = registros[i] as CapInput;
        try {
          const data = buildControlePagamentoArtData(row);
          await prisma.controlePagamentoArt.create({ data });
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
