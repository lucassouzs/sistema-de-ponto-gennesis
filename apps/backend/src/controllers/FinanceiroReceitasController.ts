import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

type ConsorcioKey = 'bsb' | 'hub';

const RECEITA_STATUSES = new Set([
  'MOBILIZAÇÃO',
  'RECEBIDO',
  'PENDENTE',
  'PENDENTE PARCIAL',
  'CANCELADA',
]);

function normalizeConsorcio(value: unknown): ConsorcioKey {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'bsb' || raw === 'hub') return raw;
  throw createError('Consórcio inválido. Use "bsb" ou "hub".', 400);
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function parseDecimal(value: unknown, required = false): Prisma.Decimal | null {
  if (value === null || value === undefined || String(value).trim() === '') {
    if (required) throw createError('Valor monetário obrigatório', 400);
    return null;
  }
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Prisma.Decimal(value.toFixed(2));
  }
  const raw = String(value)
    .trim()
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '');
  if (!raw || raw === '-' || raw === '—') {
    if (required) throw createError('Valor monetário inválido', 400);
    return null;
  }
  const normalized =
    raw.includes(',') && raw.includes('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.includes(',')
        ? raw.replace(',', '.')
        : raw;
  const num = Number(normalized);
  if (!Number.isFinite(num)) {
    if (required) throw createError('Valor monetário inválido', 400);
    return null;
  }
  return new Prisma.Decimal(num.toFixed(2));
}

function normalizeReceitaStatus(value: unknown): string {
  const raw = normalizeOptionalString(value) || 'RECEBIDO';
  const upper = raw.toUpperCase();
  if (RECEITA_STATUSES.has(upper)) return upper;
  const compact = upper
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  if (compact.includes('CANCELAD')) return 'CANCELADA';
  if (compact.includes('PENDENTE PARCIAL')) return 'PENDENTE PARCIAL';
  if (compact.includes('PENDENTE')) return 'PENDENTE';
  if (compact.includes('MOBILIZACAO')) return 'MOBILIZAÇÃO';
  if (compact.includes('RECEBIDO')) return 'RECEBIDO';
  return 'RECEBIDO';
}

function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value == null) return null;
  return Number(value.toString());
}

function serializeReceita(row: {
  id: string;
  consorcio: string;
  mes: string;
  nf: string;
  faturamento: Prisma.Decimal | null;
  recebimentoLiquido: Prisma.Decimal | null;
  status: string;
  statusData: string | null;
}) {
  return {
    id: row.id,
    consorcio: row.consorcio,
    mes: row.mes,
    nf: row.nf,
    faturamento: decimalToNumber(row.faturamento),
    recebimentoLiquido: decimalToNumber(row.recebimentoLiquido),
    status: row.status,
    statusData: row.statusData || undefined,
  };
}

function serializeRepasse(row: {
  id: string;
  consorcio: string;
  fornecedor: string;
  parcela: string;
  dataEmissao: string | null;
  boleto: string | null;
  data: string | null;
  valorOriginal: Prisma.Decimal;
  oc: string | null;
  valorFinal: Prisma.Decimal;
  pagamento: string | null;
}) {
  return {
    id: row.id,
    consorcio: row.consorcio,
    fornecedor: row.fornecedor,
    parcela: row.parcela,
    dataEmissao: row.dataEmissao || '',
    boleto: row.boleto || 'NÃO',
    data: row.data || '',
    valorOriginal: decimalToNumber(row.valorOriginal) ?? 0,
    oc: row.oc || '0',
    valorFinal: decimalToNumber(row.valorFinal) ?? 0,
    pagamento: row.pagamento || '',
  };
}

function buildReceitaData(body: Record<string, unknown>, consorcio: ConsorcioKey, sortOrder = 0) {
  const mesRaw = normalizeOptionalString(body.mes);
  if (!mesRaw) throw createError('Mês é obrigatório', 400);
  const mes = normalizeMesField(mesRaw);
  const nf = normalizeOptionalString(body.nf) || '—';
  return {
    consorcio,
    mes,
    nf,
    faturamento: parseDecimal(body.faturamento),
    recebimentoLiquido: parseDecimal(body.recebimentoLiquido),
    status: normalizeReceitaStatus(body.status),
    statusData: normalizeOptionalString(body.statusData),
    sortOrder,
  };
}

function normalizeMesField(mesRaw: string): string {
  const raw = mesRaw.trim();
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const month = Number(dmy[2]);
    if (month >= 1 && month <= 12) {
      return `${String(month).padStart(2, '0')}/${year}`;
    }
  }
  const my = raw.match(/^(\d{1,2})[\/\-](\d{2,4})$/);
  if (my) {
    let year = Number(my[2]);
    if (year < 100) year += 2000;
    const month = Number(my[1]);
    if (month >= 1 && month <= 12) {
      return `${String(month).padStart(2, '0')}/${year}`;
    }
  }
  return raw;
}

function buildRepasseData(body: Record<string, unknown>, consorcio: ConsorcioKey, sortOrder = 0) {
  const fornecedor = normalizeOptionalString(body.fornecedor) || '—';
  const parcela = normalizeOptionalString(body.parcela) || 'REPASSE';
  return {
    consorcio,
    fornecedor,
    parcela,
    dataEmissao: normalizeOptionalString(body.dataEmissao),
    boleto: normalizeOptionalString(body.boleto) || 'NÃO',
    data: normalizeOptionalString(body.data),
    valorOriginal: parseDecimal(body.valorOriginal, true)!,
    oc: normalizeOptionalString(body.oc) || '0',
    valorFinal: parseDecimal(body.valorFinal, true)!,
    pagamento: normalizeOptionalString(body.pagamento),
    sortOrder,
  };
}

export class FinanceiroReceitasController {
  async listReceitas(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const consorcioRaw = String(req.query.consorcio || '').trim();
      const where = consorcioRaw
        ? { consorcio: normalizeConsorcio(consorcioRaw) }
        : {};
      const rows = await prisma.receitaFinanceira.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      });
      res.json({ success: true, data: rows.map(serializeReceita) });
    } catch (error) {
      next(error);
    }
  }

  async listRepasses(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const consorcioRaw = String(req.query.consorcio || '').trim();
      const where = consorcioRaw
        ? { consorcio: normalizeConsorcio(consorcioRaw) }
        : {};
      const rows = await prisma.repasseFinanceiro.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      });
      res.json({ success: true, data: rows.map(serializeRepasse) });
    } catch (error) {
      next(error);
    }
  }

  async importReceitas(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const consorcio = normalizeConsorcio(req.body?.consorcio);
      const registros = Array.isArray(req.body?.registros) ? req.body.registros : null;
      if (!registros) {
        throw createError('Envie um array "registros"', 400);
      }

      const data = (registros as Record<string, unknown>[]).map((row, index) =>
        buildReceitaData(row, consorcio, index)
      );

      const created = await prisma.$transaction(async (tx) => {
        await tx.receitaFinanceira.deleteMany({ where: { consorcio } });
        if (data.length === 0) return [];
        await tx.receitaFinanceira.createMany({ data });
        return tx.receitaFinanceira.findMany({
          where: { consorcio },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        });
      });

      res.json({
        success: true,
        data: created.map(serializeReceita),
        message: `${created.length} receita(s) salva(s) para ${consorcio.toUpperCase()}.`,
      });
    } catch (error) {
      next(error);
    }
  }

  async importRepasses(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const consorcio = normalizeConsorcio(req.body?.consorcio);
      const registros = Array.isArray(req.body?.registros) ? req.body.registros : null;
      if (!registros) {
        throw createError('Envie um array "registros"', 400);
      }

      const data = (registros as Record<string, unknown>[]).map((row, index) =>
        buildRepasseData(row, consorcio, index)
      );

      const created = await prisma.$transaction(async (tx) => {
        await tx.repasseFinanceiro.deleteMany({ where: { consorcio } });
        if (data.length === 0) return [];
        await tx.repasseFinanceiro.createMany({ data });
        return tx.repasseFinanceiro.findMany({
          where: { consorcio },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        });
      });

      res.json({
        success: true,
        data: created.map(serializeRepasse),
        message: `${created.length} repasse(s) salvo(s) para ${consorcio.toUpperCase()}.`,
      });
    } catch (error) {
      next(error);
    }
  }

  async createReceita(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const consorcio = normalizeConsorcio(req.body?.consorcio);
      const data = buildReceitaData(req.body || {}, consorcio, 0);
      const created = await prisma.receitaFinanceira.create({ data });
      res.status(201).json({
        success: true,
        data: serializeReceita(created),
        message: 'Receita criada com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async createRepasse(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const consorcio = normalizeConsorcio(req.body?.consorcio);
      const data = buildRepasseData(req.body || {}, consorcio, 0);
      const created = await prisma.repasseFinanceiro.create({ data });
      res.status(201).json({
        success: true,
        data: serializeRepasse(created),
        message: 'Repasse criado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async updateReceita(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.receitaFinanceira.findUnique({ where: { id } });
      if (!existing) throw createError('Receita não encontrada', 404);

      const consorcio = normalizeConsorcio(req.body?.consorcio ?? existing.consorcio);
      const data = buildReceitaData(
        {
          mes: req.body?.mes ?? existing.mes,
          nf: req.body?.nf ?? existing.nf,
          faturamento:
            req.body?.faturamento !== undefined
              ? req.body.faturamento
              : existing.faturamento?.toString(),
          recebimentoLiquido:
            req.body?.recebimentoLiquido !== undefined
              ? req.body.recebimentoLiquido
              : existing.recebimentoLiquido?.toString(),
          status: req.body?.status ?? existing.status,
          statusData:
            req.body?.statusData !== undefined ? req.body.statusData : existing.statusData,
        },
        consorcio,
        existing.sortOrder
      );

      const updated = await prisma.receitaFinanceira.update({ where: { id }, data });
      res.json({
        success: true,
        data: serializeReceita(updated),
        message: 'Receita atualizada com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteReceita(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.receitaFinanceira.findUnique({ where: { id } });
      if (!existing) throw createError('Receita não encontrada', 404);
      await prisma.receitaFinanceira.delete({ where: { id } });
      res.json({ success: true, message: 'Receita excluída com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async updateRepasse(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.repasseFinanceiro.findUnique({ where: { id } });
      if (!existing) throw createError('Repasse não encontrado', 404);

      const consorcio = normalizeConsorcio(req.body?.consorcio ?? existing.consorcio);
      const data = buildRepasseData(
        {
          fornecedor: req.body?.fornecedor ?? existing.fornecedor,
          parcela: req.body?.parcela ?? existing.parcela,
          dataEmissao:
            req.body?.dataEmissao !== undefined ? req.body.dataEmissao : existing.dataEmissao,
          boleto: req.body?.boleto !== undefined ? req.body.boleto : existing.boleto,
          data: req.body?.data !== undefined ? req.body.data : existing.data,
          valorOriginal:
            req.body?.valorOriginal !== undefined
              ? req.body.valorOriginal
              : existing.valorOriginal.toString(),
          oc: req.body?.oc !== undefined ? req.body.oc : existing.oc,
          valorFinal:
            req.body?.valorFinal !== undefined
              ? req.body.valorFinal
              : existing.valorFinal.toString(),
          pagamento:
            req.body?.pagamento !== undefined ? req.body.pagamento : existing.pagamento,
        },
        consorcio,
        existing.sortOrder
      );

      const updated = await prisma.repasseFinanceiro.update({ where: { id }, data });
      res.json({
        success: true,
        data: serializeRepasse(updated),
        message: 'Repasse atualizado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteRepasse(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.repasseFinanceiro.findUnique({ where: { id } });
      if (!existing) throw createError('Repasse não encontrado', 404);
      await prisma.repasseFinanceiro.delete({ where: { id } });
      res.json({ success: true, message: 'Repasse excluído com sucesso' });
    } catch (error) {
      next(error);
    }
  }
}
