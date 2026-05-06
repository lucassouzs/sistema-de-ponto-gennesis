import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { parseDateInput } from '../utils/dateInput';
import { assertContractAccess } from '../lib/contractAccess';

export class ContractBillingController {
  /**
   * Listar faturamentos de um contrato
   */
  async getBillingsByContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;

      await assertContractAccess(req, contractId);

      const contract = await prisma.contract.findUnique({
        where: { id: contractId }
      });
      if (!contract) {
        throw createError('Contrato não encontrado', 404);
      }

      const billings = await prisma.contractBilling.findMany({
        where: { contractId },
        orderBy: { issueDate: 'desc' }
      });

      const billingsWithNumbers = billings.map((b) => ({
        ...b,
        grossValue: b.grossValue ? Number(b.grossValue) : 0,
        netValue: b.netValue ? Number(b.netValue) : 0
      }));

      res.json({
        success: true,
        data: billingsWithNumbers
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Criar faturamento
   */
  async createBilling(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      await assertContractAccess(req, contractId);

      const { issueDate, invoiceNumber, serviceOrder, grossValue, netValue } = req.body;

      if (!issueDate) {
        throw createError('Data de emissão é obrigatória', 400);
      }
      if (!invoiceNumber?.trim()) {
        throw createError('Número da nota fiscal é obrigatório', 400);
      }
      if (!serviceOrder?.trim()) {
        throw createError('Ordem de serviço é obrigatória', 400);
      }
      if (grossValue === undefined || grossValue === null || grossValue === '') {
        throw createError('Valor bruto é obrigatório', 400);
      }

      const contract = await prisma.contract.findUnique({
        where: { id: contractId }
      });
      if (!contract) {
        throw createError('Contrato não encontrado', 404);
      }

      const billing = await prisma.contractBilling.create({
        data: {
          contractId,
          issueDate: parseDateInput(issueDate),
          invoiceNumber: String(invoiceNumber).trim(),
          serviceOrder: String(serviceOrder).trim(),
          grossValue: Number(grossValue) || 0,
          netValue: netValue === undefined || netValue === null || netValue === ''
            ? 0
            : Number(netValue) || 0
        }
      });

      res.status(201).json({
        success: true,
        data: {
          ...billing,
          grossValue: Number(billing.grossValue),
          netValue: Number(billing.netValue)
        },
        message: 'Faturamento cadastrado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar faturamento
   */
  async updateBilling(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, id } = req.params;
      await assertContractAccess(req, contractId);

      const { issueDate, invoiceNumber, serviceOrder, grossValue, netValue } = req.body;

      const existing = await prisma.contractBilling.findFirst({
        where: { id, contractId }
      });
      if (!existing) {
        throw createError('Faturamento não encontrado', 404);
      }

      const updateData: any = {};
      if (issueDate !== undefined) updateData.issueDate = parseDateInput(issueDate);
      if (invoiceNumber !== undefined) updateData.invoiceNumber = String(invoiceNumber).trim();
      if (serviceOrder !== undefined) updateData.serviceOrder = String(serviceOrder).trim();
      if (grossValue !== undefined) updateData.grossValue = Number(grossValue) || 0;
      if (netValue !== undefined) {
        updateData.netValue = Number(netValue) || 0;
      } else if (grossValue !== undefined) {
        // Quando o usuário não informa líquido, manter como "não preenchido".
        updateData.netValue = 0;
      }

      const billing = await prisma.contractBilling.update({
        where: { id },
        data: updateData
      });

      res.json({
        success: true,
        data: {
          ...billing,
          grossValue: Number(billing.grossValue),
          netValue: Number(billing.netValue)
        },
        message: 'Faturamento atualizado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Excluir faturamento
   */
  async deleteBilling(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, id } = req.params;
      await assertContractAccess(req, contractId);

      const existing = await prisma.contractBilling.findFirst({
        where: { id, contractId }
      });
      if (!existing) {
        throw createError('Faturamento não encontrado', 404);
      }

      await prisma.contractBilling.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Faturamento excluído com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }
}
