import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { parseDateInput } from '../utils/dateInput';
import { assertContractAccess } from '../lib/contractAccess';
import {
  assertPleitoBillingAmount,
  syncPleitoFromBillings
} from '../utils/contractBillingPleitoSync';

function parseRequiredMoney(value: unknown, fieldLabel: string): number {
  if (value === undefined || value === null || value === '') {
    throw createError(`${fieldLabel} é obrigatório`, 400);
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw createError(`${fieldLabel} inválido`, 400);
  }
  return num;
}

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

      const { issueDate, invoiceNumber, serviceOrder, grossValue, netValue, pleitoId } = req.body;

      if (!issueDate) {
        throw createError('Data de emissão é obrigatória', 400);
      }
      if (!invoiceNumber?.trim()) {
        throw createError('Número da nota fiscal é obrigatório', 400);
      }
      if (!serviceOrder?.trim()) {
        throw createError('Ordem de serviço é obrigatória', 400);
      }
      if (!pleitoId?.trim()) {
        throw createError('Selecione o pleito vinculado ao faturamento', 400);
      }

      const gross = parseRequiredMoney(grossValue, 'Valor bruto');
      const net = parseRequiredMoney(netValue, 'Valor líquido');

      const contract = await prisma.contract.findUnique({
        where: { id: contractId }
      });
      if (!contract) {
        throw createError('Contrato não encontrado', 404);
      }

      const pleito = await prisma.pleito.findUnique({ where: { id: String(pleitoId).trim() } });
      if (!pleito) {
        throw createError('Pleito não encontrado', 404);
      }

      const serviceOrderTrimmed = String(serviceOrder).trim();
      const pleitoOs = (pleito.divSe || '').trim();
      if (pleitoOs && pleitoOs !== serviceOrderTrimmed) {
        throw createError('A OS/SE informada não corresponde ao pleito selecionado', 400);
      }

      const billing = await prisma.$transaction(async (tx) => {
        await assertPleitoBillingAmount(tx, pleito, contractId, gross);

        const created = await tx.contractBilling.create({
          data: {
            contractId,
            pleitoId: pleito.id,
            issueDate: parseDateInput(issueDate),
            invoiceNumber: String(invoiceNumber).trim(),
            serviceOrder: serviceOrderTrimmed,
            divSe: serviceOrderTrimmed,
            grossValue: gross,
            netValue: net
          }
        });

        await syncPleitoFromBillings(tx, pleito.id);

        const invoiceTrimmed = String(invoiceNumber).trim();
        if (invoiceTrimmed) {
          await tx.pleito.update({
            where: { id: pleito.id },
            data: { invoiceNumber: invoiceTrimmed }
          });
        }

        return created;
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

      const updateData: Record<string, unknown> = {};
      if (issueDate !== undefined) updateData.issueDate = parseDateInput(issueDate);
      if (invoiceNumber !== undefined) updateData.invoiceNumber = String(invoiceNumber).trim();
      if (serviceOrder !== undefined) {
        const so = String(serviceOrder).trim();
        updateData.serviceOrder = so;
        updateData.divSe = so;
      }
      if (grossValue !== undefined) updateData.grossValue = parseRequiredMoney(grossValue, 'Valor bruto');
      if (netValue !== undefined) {
        updateData.netValue = parseRequiredMoney(netValue, 'Valor líquido');
      } else if (grossValue !== undefined) {
        throw createError('Valor líquido é obrigatório', 400);
      }

      const billing = await prisma.$transaction(async (tx) => {
        const pleitoId = existing.pleitoId;
        if (pleitoId && grossValue !== undefined) {
          const pleito = await tx.pleito.findUnique({ where: { id: pleitoId } });
          if (pleito) {
            await assertPleitoBillingAmount(
              tx,
              pleito,
              contractId,
              Number(updateData.grossValue),
              id
            );
          }
        }

        const updated = await tx.contractBilling.update({
          where: { id },
          data: updateData
        });

        if (pleitoId) {
          await syncPleitoFromBillings(tx, pleitoId);
        }

        return updated;
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

      const pleitoId = existing.pleitoId;

      await prisma.$transaction(async (tx) => {
        await tx.contractBilling.delete({ where: { id } });
        if (pleitoId) {
          await syncPleitoFromBillings(tx, pleitoId);
        }
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
