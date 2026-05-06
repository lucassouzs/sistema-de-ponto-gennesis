import { Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { assertContractAccess } from '../lib/contractAccess';

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export class ContractAddendumController {
  async listByContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      await assertContractAccess(req, contractId);

      const contract = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw createError('Contrato não encontrado', 404);

      const rows = await prisma.contractAddendum.findMany({
        where: { contractId },
        orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
      });

      res.json({
        success: true,
        data: rows.map((r) => ({
          id: r.id,
          contractId: r.contractId,
          effectiveDate: r.effectiveDate,
          amount: toNum(r.amount),
          note: r.note ?? null,
          createdAt: r.createdAt,
        })),
      });
    } catch (error) {
      return next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      await assertContractAccess(req, contractId);
      const { effectiveDate, amount, note } = req.body as {
        effectiveDate?: string;
        amount?: number | string;
        note?: string | null;
      };

      if (!effectiveDate) throw createError('Data do aditivo é obrigatória', 400);
      const dt = new Date(effectiveDate);
      if (Number.isNaN(dt.getTime())) throw createError('Data do aditivo inválida', 400);

      const num = toNum(amount);
      if (Math.abs(num) < 0.0000001) throw createError('Valor do aditivo deve ser diferente de zero', 400);

      const contract = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw createError('Contrato não encontrado', 404);

      const created = await prisma.contractAddendum.create({
        data: {
          contractId,
          effectiveDate: dt,
          amount: new Decimal(num),
          note: note?.trim() || null,
        },
      });

      res.status(201).json({
        success: true,
        data: {
          id: created.id,
          contractId: created.contractId,
          effectiveDate: created.effectiveDate,
          amount: toNum(created.amount),
          note: created.note ?? null,
          createdAt: created.createdAt,
        },
        message: 'Aditivo registrado com sucesso',
      });
    } catch (error) {
      return next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, id } = req.params;
      await assertContractAccess(req, contractId);

      const contract = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw createError('Contrato não encontrado', 404);

      const row = await prisma.contractAddendum.findFirst({
        where: { id, contractId },
      });
      if (!row) {
        throw createError('Aditivo não encontrado', 404);
      }

      await prisma.contractAddendum.delete({ where: { id } });
      res.json({ success: true, message: 'Aditivo removido com sucesso' });
    } catch (error) {
      return next(error);
    }
  }
}
