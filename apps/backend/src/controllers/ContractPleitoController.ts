import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { parseDateInput } from '../utils/dateInput';
import { assertContractModulePermission } from '../lib/contractAccess';
import { resolvePleitoCreateCore } from '../utils/pleitoCreateHelpers';
const toDec = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

function serializePleito(p: any) {
  const dec = (v: unknown) => (v != null ? Number(v) : null);
  return {
    ...p,
    accumulatedBilled: dec(p.accumulatedBilled),
    billingRequest: dec(p.billingRequest),
    budgetAmount1: dec(p.budgetAmount1),
    budgetAmount2: dec(p.budgetAmount2),
    budgetAmount3: dec(p.budgetAmount3),
    budgetAmount4: dec(p.budgetAmount4)
  };
}

export class ContractPleitoController {
  async getPleitosByContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      await assertContractModulePermission(req, contractId, 'ordemServico');

      const contract = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw createError('Contrato não encontrado', 404);

      const rows = await prisma.pleito.findMany({
        where: { updatedContractId: contractId },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ success: true, data: rows.map(serializePleito) });
    } catch (error) {
      return next(error);
    }
  }

  async createPleito(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      await assertContractModulePermission(req, contractId, 'ordemServico');

      const b = req.body;

      const contract = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw createError('Contrato não encontrado', 404);
      if (!b.serviceDescription?.trim()) throw createError('Descrição do serviço é obrigatória', 400);

      const creationYear = b.creationYear != null && b.creationYear !== '' ? Number(b.creationYear) : null;
      const core = await resolvePleitoCreateCore(
        b as Record<string, unknown>,
        Number.isInteger(creationYear) ? creationYear : null,
        {
          costCenterId: contract.costCenterId,
          contractStartDate: contract.startDate,
          contractEndDate: contract.endDate
        }
      );
      const data: Prisma.PleitoCreateInput = {
        mes: core.mes,
        ano: core.ano,
        valorPrevisto: core.valorPrevisto,
        service_orders: { connect: { id: core.serviceOrderId } },
        creationMonth: b.creationMonth?.trim() || null,
        creationYear: Number.isInteger(creationYear) ? creationYear : null,
        startDate: b.startDate ? parseDateInput(b.startDate) : null,
        endDate: b.endDate ? parseDateInput(b.endDate) : null,
        budgetStatus: b.budgetStatus?.trim() || null,
        folderNumber: b.folderNumber?.trim() || null,
        lot: b.lot?.trim() || null,
        divSe: b.divSe?.trim() || null,
        location: b.location?.trim() || null,
        unit: b.unit?.trim() || null,
        serviceDescription: b.serviceDescription.trim(),
        budget: b.budget?.trim() || null,
        executionStatus: b.executionStatus?.trim() || null,
        billingStatus: b.billingStatus?.trim() || null,
        accumulatedBilled: toDec(b.accumulatedBilled),
        billingRequest: toDec(b.billingRequest),
        invoiceNumber: b.invoiceNumber?.trim() || null,
        estimator: b.estimator?.trim() || null,
        budgetAmount1: toDec(b.budgetAmount1),
        budgetAmount2: toDec(b.budgetAmount2),
        budgetAmount3: toDec(b.budgetAmount3),
        budgetAmount4: toDec(b.budgetAmount4),
        pv: b.pv?.trim() || null,
        ipi: b.ipi?.trim() || null,
        reportsBilling: b.reportsBilling?.trim() || null,
        engineer: b.engineer?.trim() || null,
        supervisor: b.supervisor?.trim() || null,
        updatedContract: { connect: { id: contractId } }
      };

      const existing = await prisma.pleito.findUnique({
        where: {
          serviceOrderId_mes_ano: {
            serviceOrderId: core.serviceOrderId,
            mes: core.mes,
            ano: core.ano,
          },
        },
      });

      if (existing) {
        /** Já existe pleito nesta mesma OS + competência (único no BD). Gerar novamente acumula valor pleiteado. */
        const incrementoBR = new Decimal(toDec(b.billingRequest) ?? 0);
        const baseBR =
          existing.billingRequest != null ? new Decimal(existing.billingRequest.toString()) : new Decimal(0);
        const requestedReportsBilling = typeof data.reportsBilling === 'string' ? data.reportsBilling : null;
        const existingReportsBilling = existing.reportsBilling || null;
        const requestedIsGerado100 = requestedReportsBilling === '__PLEITO_HISTORICO__GERADO_100__';
        const reportsBillingToPersist =
          requestedIsGerado100
            ? requestedReportsBilling
            : existingReportsBilling === '__PLEITO_HISTORICO__' || existingReportsBilling === '__PLEITO_HISTORICO__GERADO_100__'
            ? requestedReportsBilling
            : existingReportsBilling;
        const row = await prisma.pleito.update({
          where: { id: existing.id },
          data: {
            valorPrevisto: core.valorPrevisto,
            creationMonth: data.creationMonth,
            creationYear: data.creationYear,
            startDate: data.startDate,
            endDate: data.endDate,
            budgetStatus: data.budgetStatus,
            folderNumber: data.folderNumber,
            lot: data.lot,
            divSe: data.divSe,
            location: data.location,
            unit: data.unit,
            serviceDescription: data.serviceDescription,
            budget: data.budget,
            executionStatus: data.executionStatus,
            billingStatus: data.billingStatus,
            billingRequest: incrementoBR.gt(0) ? baseBR.plus(incrementoBR) : baseBR,
            accumulatedBilled: data.accumulatedBilled,
            invoiceNumber: data.invoiceNumber,
            estimator: data.estimator,
            budgetAmount1: data.budgetAmount1,
            budgetAmount2: data.budgetAmount2,
            budgetAmount3: data.budgetAmount3,
            budgetAmount4: data.budgetAmount4,
            pv: data.pv,
            ipi: data.ipi,
            reportsBilling: reportsBillingToPersist,
            engineer: data.engineer,
            supervisor: data.supervisor,
            updatedContract: { connect: { id: contractId } },
          },
        });
        return res.status(200).json({
          success: true,
          data: serializePleito(row),
          message: 'Pleito atualizado nesta mesma competência — valor pleiteado acumulado.',
        });
      }

      const row = await prisma.pleito.create({ data });
      return res.status(201).json({
        success: true,
        data: serializePleito(row),
        message: 'Andamento da OS cadastrado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }
}
