import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { assertContractAccess } from '../lib/contractAccess';
import { computedBaseAnnualValue } from '../lib/contractAnnualMath';

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export class ContractAnnualValueController {
  /**
   * Listar todos os valores anuais de um contrato
   */
  async getAnnualValues(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      await assertContractAccess(req, contractId);

      const contract = await prisma.contract.findUnique({
        where: { id: contractId }
      });
      if (!contract) {
        throw createError('Contrato não encontrado', 404);
      }

      const values = await prisma.contractAnnualValue.findMany({
        where: { contractId },
        orderBy: { year: 'asc' }
      });

      const baseAnnual = computedBaseAnnualValue(
        toNum(contract.valuePlusAddenda),
        contract.startDate,
        contract.endDate
      );

      const withNumbers = values.map((v) => ({
        ...v,
        value: toNum(v.value),
        budgetAdjustmentDelta: v.budgetAdjustmentDelta != null ? toNum(v.budgetAdjustmentDelta) : null,
        budgetAdjustmentEffectiveDate: v.budgetAdjustmentEffectiveDate
          ? v.budgetAdjustmentEffectiveDate.toISOString()
          : null,
        computedBaseAnnual: baseAnnual
      }));

      res.json({
        success: true,
        data: withNumbers,
        computedBaseAnnual: baseAnnual
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Definir ajuste de valor anual (orçamento do órgão) para um ano civil.
   * Body: { budgetAdjustmentDelta?: number | null, budgetAdjustmentEffectiveDate?: string | null }
   * Para remover o ajuste: envie budgetAdjustmentDelta: null ou 0 e budgetAdjustmentEffectiveDate: null
   */
  async setAnnualValue(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, year } = req.params;
      await assertContractAccess(req, contractId);

      const yearNum = parseInt(year, 10);
      if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
        throw createError('Ano inválido', 400);
      }

      const contract = await prisma.contract.findUnique({
        where: { id: contractId }
      });
      if (!contract) {
        throw createError('Contrato não encontrado', 404);
      }

      const baseAnnual = computedBaseAnnualValue(
        toNum(contract.valuePlusAddenda),
        contract.startDate,
        contract.endDate
      );
      if (baseAnnual === null) {
        throw createError('Não foi possível calcular o valor anual base (vigência inválida)', 400);
      }

      const body = req.body as {
        budgetAdjustmentDelta?: number | null;
        budgetAdjustmentEffectiveDate?: string | null;
        /** legado: ignorado se ajuste for enviado */
        value?: number | null;
      };

      const rawDelta = body.budgetAdjustmentDelta;
      const rawDate = body.budgetAdjustmentEffectiveDate;

      const clearing =
        rawDelta === null ||
        rawDelta === undefined ||
        (typeof rawDelta === 'number' && Math.abs(rawDelta) < 1e-9);

      if (clearing && (rawDate === null || rawDate === undefined || rawDate === '')) {
        await prisma.contractAnnualValue.deleteMany({
          where: { contractId, year: yearNum }
        });
        return res.json({
          success: true,
          data: null,
          message: 'Ajuste de valor anual removido'
        });
      }

      if (clearing && rawDate) {
        throw createError('Informe um valor de ajuste ou remova a data', 400);
      }

      const delta = typeof rawDelta === 'number' ? rawDelta : Number(rawDelta);
      if (!Number.isFinite(delta)) {
        throw createError('Valor de ajuste inválido', 400);
      }

      if (!rawDate || String(rawDate).trim() === '') {
        throw createError('Informe a data do aditivo para aplicar o ajuste', 400);
      }

      const d = new Date(String(rawDate));
      if (Number.isNaN(d.getTime())) {
        throw createError('Data do aditivo inválida', 400);
      }

      const finalAnnual = baseAnnual + delta;

      const annualValue = await prisma.contractAnnualValue.upsert({
        where: {
          contractId_year: { contractId, year: yearNum }
        },
        create: {
          contractId,
          year: yearNum,
          value: finalAnnual,
          budgetAdjustmentDelta: delta,
          budgetAdjustmentEffectiveDate: d
        },
        update: {
          value: finalAnnual,
          budgetAdjustmentDelta: delta,
          budgetAdjustmentEffectiveDate: d
        }
      });

      return res.json({
        success: true,
        data: {
          ...annualValue,
          value: toNum(annualValue.value),
          budgetAdjustmentDelta: annualValue.budgetAdjustmentDelta != null ? toNum(annualValue.budgetAdjustmentDelta) : null,
          budgetAdjustmentEffectiveDate: annualValue.budgetAdjustmentEffectiveDate
            ? annualValue.budgetAdjustmentEffectiveDate.toISOString()
            : null,
          computedBaseAnnual: baseAnnual
        },
        message: 'Ajuste de valor anual salvo com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }
}
