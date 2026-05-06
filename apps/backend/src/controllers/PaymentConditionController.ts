import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const DEFAULTS: Array<{
  code: string;
  label: string;
  paymentType: string;
  parcelCount: number;
  parcelDueDays: number[];
  sortOrder: number;
  isSystem: boolean;
}> = [
  { code: 'AVISTA', label: 'À vista', paymentType: 'AVISTA', parcelCount: 1, parcelDueDays: [0], sortOrder: 0, isSystem: true },
  { code: 'BOLETO_30', label: 'Boleto 30 dias', paymentType: 'BOLETO', parcelCount: 1, parcelDueDays: [30], sortOrder: 10, isSystem: true },
  { code: 'BOLETO_28', label: 'Boleto 28 dias', paymentType: 'BOLETO', parcelCount: 1, parcelDueDays: [28], sortOrder: 20, isSystem: true }
];

function jsonDays(days: number[]): Prisma.InputJsonValue {
  return days as unknown as Prisma.InputJsonValue;
}

async function ensureDefaultPaymentConditions(): Promise<void> {
  const n = await prisma.paymentCondition.count();
  if (n > 0) return;
  await prisma.paymentCondition.createMany({
    data: DEFAULTS.map((d) => ({
      code: d.code,
      label: d.label,
      paymentType: d.paymentType,
      parcelCount: d.parcelCount,
      parcelDueDays: jsonDays(d.parcelDueDays),
      sortOrder: d.sortOrder,
      isSystem: d.isSystem,
      isActive: true
    })),
    skipDuplicates: true
  });
}

function normalizeParcelDueDays(input: unknown): number[] {
  if (input == null) return [];
  if (Array.isArray(input)) {
    return input.map((x) => {
      const n = Number(x);
      if (!Number.isFinite(n) || n < 0) throw createError('Cada prazo deve ser um número ≥ 0', 400);
      return Math.round(n);
    });
  }
  throw createError('parcelDueDays deve ser um array de números (dias)', 400);
}

function validateParcels(paymentType: string, parcelCount: number, days: number[]): void {
  if (!Number.isInteger(parcelCount) || parcelCount < 1) {
    throw createError('Número de parcelas deve ser ≥ 1', 400);
  }
  if (days.length !== parcelCount) {
    throw createError(`Informe exatamente ${parcelCount} prazo(s) (um por parcela)`, 400);
  }
  if (paymentType === 'AVISTA') {
    if (parcelCount !== 1 || days[0] !== 0) {
      throw createError('À vista: use 1 parcela e prazo 0 dias', 400);
    }
  }
}

function generateCodeFromLabel(label: string): string {
  const base = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 36);
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return base ? `${base}_${suffix}` : `COND_${suffix}`;
}

export class PaymentConditionController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await ensureDefaultPaymentConditions();
      const { paymentType, activeOnly } = req.query;
      const where: any = {};
      if (paymentType && typeof paymentType === 'string') {
        where.paymentType = paymentType;
      }
      if (activeOnly === 'true' || activeOnly === undefined) {
        where.isActive = true;
      }
      const rows = await prisma.paymentCondition.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }]
      });
      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await ensureDefaultPaymentConditions();
      const { label, paymentType, parcelCount, parcelDueDays } = req.body;
      if (!label || typeof label !== 'string' || !label.trim()) {
        throw createError('Nome da condição é obrigatório', 400);
      }
      if (paymentType !== 'AVISTA' && paymentType !== 'BOLETO') {
        throw createError('paymentType deve ser AVISTA ou BOLETO', 400);
      }
      const finalDays =
        parcelDueDays !== undefined
          ? normalizeParcelDueDays(parcelDueDays)
          : paymentType === 'AVISTA'
            ? [0]
            : [30];
      const finalCount =
        parcelCount !== undefined && Number(parcelCount) >= 1
          ? Math.floor(Number(parcelCount))
          : finalDays.length;
      validateParcels(paymentType, finalCount, finalDays);

      let code = generateCodeFromLabel(label.trim());
      for (let i = 0; i < 5; i++) {
        const exists = await prisma.paymentCondition.findUnique({ where: { code } });
        if (!exists) break;
        code = `${generateCodeFromLabel(label.trim())}_${i}`;
      }
      const row = await prisma.paymentCondition.create({
        data: {
          code,
          label: label.trim(),
          paymentType,
          parcelCount: finalCount,
          parcelDueDays: jsonDays(finalDays),
          sortOrder: 100,
          isSystem: false,
          isActive: true
        }
      });
      res.status(201).json({ success: true, data: row, message: 'Condição criada' });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { label, sortOrder, isActive, parcelCount, parcelDueDays } = req.body;
      const row = await prisma.paymentCondition.findUnique({ where: { id } });
      if (!row) throw createError('Condição não encontrada', 404);
      const data: any = {};
      if (label !== undefined) {
        if (typeof label !== 'string' || !label.trim()) throw createError('Nome inválido', 400);
        data.label = label.trim();
      }
      if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);
      if (isActive !== undefined) data.isActive = Boolean(isActive);

      let nextCount = row.parcelCount;
      let nextDays: number[];
      try {
        nextDays = normalizeParcelDueDays(row.parcelDueDays);
      } catch {
        nextDays = [0];
      }
      if (parcelCount !== undefined) {
        nextCount = Number(parcelCount);
      }
      if (parcelDueDays !== undefined) {
        nextDays = normalizeParcelDueDays(parcelDueDays);
      }
      if (parcelCount !== undefined || parcelDueDays !== undefined) {
        validateParcels(row.paymentType, nextCount, nextDays);
        data.parcelCount = nextCount;
        data.parcelDueDays = jsonDays(nextDays);
      }

      const updated = await prisma.paymentCondition.update({ where: { id }, data });
      res.json({ success: true, data: updated, message: 'Condição atualizada' });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const row = await prisma.paymentCondition.findUnique({ where: { id } });
      if (!row) throw createError('Condição não encontrada', 404);
      if (row.isSystem) throw createError('Condição padrão do sistema não pode ser excluída', 400);
      await prisma.paymentCondition.delete({ where: { id } });
      res.json({ success: true, message: 'Condição excluída' });
    } catch (error) {
      next(error);
    }
  }
}
