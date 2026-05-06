import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { parseDateInput } from '../utils/dateInput';
import { assertContractModulePermission } from '../lib/contractAccess';

export class ContractWeeklyProductionController {
  async getProductionsByContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      await assertContractModulePermission(req, contractId, 'producaoSemanal');

      const contract = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw createError('Contrato não encontrado', 404);

      const rows = await prisma.contractWeeklyProduction.findMany({
        where: { contractId },
        orderBy: { createdAt: 'desc' }
      });

      const data = rows.map((r) => ({
        ...r,
        weeklyProductionValue: r.weeklyProductionValue ? Number(r.weeklyProductionValue) : 0
      }));

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async createProduction(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      await assertContractModulePermission(req, contractId, 'producaoSemanal');

      const { divSe, weeklyProductionValue, responsiblePerson, fillingDate } = req.body;

      const contract = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw createError('Contrato não encontrado', 404);
      if (!divSe?.trim()) throw createError('OS / SE é obrigatório', 400);
      if (!responsiblePerson?.trim()) throw createError('Responsável pelo preenchimento é obrigatório', 400);
      const value = Number(weeklyProductionValue);
      if (isNaN(value) || value < 0) throw createError('Valor da produção semanal inválido', 400);

      const fillingDateValue = fillingDate ? parseDateInput(fillingDate) : new Date();
      const row = await prisma.contractWeeklyProduction.create({
        data: {
          contractId,
          fillingDate: fillingDateValue,
          divSe: divSe.trim(),
          weeklyProductionValue: value,
          responsiblePerson: responsiblePerson.trim()
        }
      });

      res.status(201).json({
        success: true,
        data: { ...row, weeklyProductionValue: Number(row.weeklyProductionValue) },
        message: 'Produção semanal cadastrada com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProduction(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, id } = req.params;
      await assertContractModulePermission(req, contractId, 'producaoSemanal');

      const { divSe, weeklyProductionValue, responsiblePerson, fillingDate } = req.body;

      const existing = await prisma.contractWeeklyProduction.findFirst({
        where: { id, contractId }
      });
      if (!existing) throw createError('Produção semanal não encontrada', 404);

      const data: { divSe?: string; weeklyProductionValue?: number; responsiblePerson?: string; fillingDate?: Date } = {};
      if (divSe !== undefined) data.divSe = divSe.trim();
      if (responsiblePerson !== undefined) data.responsiblePerson = responsiblePerson.trim();
      if (fillingDate !== undefined) data.fillingDate = parseDateInput(fillingDate);
      if (weeklyProductionValue !== undefined) {
        const value = Number(weeklyProductionValue);
        if (isNaN(value) || value < 0) throw createError('Valor da produção semanal inválido', 400);
        data.weeklyProductionValue = value;
      }

      const row = await prisma.contractWeeklyProduction.update({
        where: { id },
        data
      });

      res.json({
        success: true,
        data: { ...row, weeklyProductionValue: Number(row.weeklyProductionValue) },
        message: 'Produção semanal atualizada com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteProduction(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, id } = req.params;
      await assertContractModulePermission(req, contractId, 'producaoSemanal');

      const existing = await prisma.contractWeeklyProduction.findFirst({
        where: { id, contractId }
      });
      if (!existing) throw createError('Produção semanal não encontrada', 404);

      await prisma.contractWeeklyProduction.delete({ where: { id } });

      res.json({ success: true, message: 'Produção semanal excluída com sucesso' });
    } catch (error) {
      next(error);
    }
  }
}
