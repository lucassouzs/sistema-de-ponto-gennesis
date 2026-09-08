import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { parseDateInput } from '../utils/dateInput';
import {
  resolvePleitoCreateCore,
  type ResolvePleitoContractContext
} from '../utils/pleitoCreateHelpers';
import {
  assertPleitoBillingAmount,
  findBillingForPleito,
  getPleitoBillableTotal,
  getPleitoRemainingBalance,
  syncPleitoFromBillings,
  upsertBillingFromPleitoFaturamento
} from '../utils/contractBillingPleitoSync';
import { findIdsByUnaccentSearch } from '../lib/normalizeSearchText';

/** Cópia criada em "Gerar pleito"; distinta da linha principal da OS no contrato. */
const PLEITO_HISTORICO_MARKER = '__PLEITO_HISTORICO__';
const PLEITO_HISTORICO_MARKER_GERADO_100 = '__PLEITO_HISTORICO__GERADO_100__';

function isPleitoHistoricoGerado(reportsBilling: string | null | undefined): boolean {
  const marker = (reportsBilling || '').trim();
  return (
    marker === PLEITO_HISTORICO_MARKER ||
    marker === PLEITO_HISTORICO_MARKER_GERADO_100 ||
    marker.startsWith(PLEITO_HISTORICO_MARKER)
  );
}

function toDec(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function serializePleito(p: any) {
  const dec = (v: unknown) => (v != null ? Number(v) : null);
  return {
    ...p,
    accumulatedBilled: dec(p.accumulatedBilled),
    billingRequest: dec(p.billingRequest),
    budgetAmount1: dec(p.budgetAmount1),
    budgetAmount2: dec(p.budgetAmount2),
    budgetAmount3: dec(p.budgetAmount3),
    budgetAmount4: dec(p.budgetAmount4),
  };
}

export class PleitoController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const {
        search,
        page = 1,
        limit = 20,
        gerados,
        contractId,
        creationMonth,
        creationYear,
        lot,
        budgetStatus,
        pendingBilling
      } = req.query;

      const andParts: Prisma.PleitoWhereInput[] = [];

      if (search) {
        const s = String(search);
        const [pleitoIds, contractIds] = await Promise.all([
          findIdsByUnaccentSearch({
            from: Prisma.sql`pleitos`,
            columns: [
              '"serviceDescription"',
              '"folderNumber"',
              'location',
              'engineer',
              '"divSe"',
              '"invoiceNumber"',
            ],
            search: s,
          }),
          findIdsByUnaccentSearch({
            from: Prisma.sql`contracts`,
            columns: ['name', 'number'],
            search: s,
          }),
        ]);
        andParts.push({
          OR: [
            ...(pleitoIds?.length ? [{ id: { in: pleitoIds } }] : []),
            ...(contractIds?.length
              ? [{ updatedContractId: { in: contractIds } }]
              : []),
            ...(!pleitoIds?.length && !contractIds?.length
              ? [{ id: '__none__' }]
              : []),
          ],
        });
      }

      if (contractId && typeof contractId === 'string' && contractId.trim()) {
        andParts.push({ updatedContractId: contractId.trim() });
      }

      if (creationMonth && typeof creationMonth === 'string' && creationMonth.trim()) {
        const raw = creationMonth.trim().padStart(2, '0');
        const n = parseInt(raw, 10);
        if (n >= 1 && n <= 12) {
          const unpadded = String(n);
          andParts.push({
            OR: [{ creationMonth: raw }, { creationMonth: unpadded }]
          });
        }
      }

      if (creationYear !== undefined && creationYear !== null && String(creationYear).trim() !== '') {
        const y = Number(creationYear);
        if (Number.isFinite(y)) {
          andParts.push({ creationYear: y });
        }
      }

      if (lot && typeof lot === 'string' && lot.trim()) {
        andParts.push({ lot: { contains: lot.trim(), mode: 'insensitive' } });
      }

      if (budgetStatus && typeof budgetStatus === 'string' && budgetStatus.trim()) {
        andParts.push({ budgetStatus: budgetStatus.trim() });
      }

      if (pendingBilling === 'sim') {
        andParts.push({ billingRequest: { gt: 0 } });
      } else if (pendingBilling === 'nao') {
        andParts.push({
          OR: [{ billingRequest: null }, { billingRequest: { lte: 0 } }]
        });
      }

      if (gerados === '1' || gerados === 'true') {
        andParts.push({ billingRequest: { gt: 0 } });
        andParts.push({ reportsBilling: PLEITO_HISTORICO_MARKER });
      }

      const where: Prisma.PleitoWhereInput =
        andParts.length === 0 ? {} : andParts.length === 1 ? andParts[0]! : { AND: andParts };

      const limitNum = Math.min(Number(limit) || 20, 500);
      const skip = (Number(page) - 1) * limitNum;

      const [rows, total] = await Promise.all([
        prisma.pleito.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          include: { updatedContract: { select: { id: true, name: true, number: true } } }
        }),
        prisma.pleito.count({ where })
      ]);

      res.json({
        success: true,
        data: rows.map(serializePleito),
        pagination: {
          page: Number(page),
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getDivSeList(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.pleito.findMany({
        where: { divSe: { not: null } },
        select: { divSe: true },
        distinct: ['divSe'],
        orderBy: { divSe: 'asc' }
      });
      const list = rows.map((r) => r.divSe).filter((v): v is string => !!v && v.trim() !== '');
      res.json({ success: true, data: list });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const row = await prisma.pleito.findUnique({ where: { id } });
      if (!row) throw createError('Registro não encontrado', 404);
      res.json({ success: true, data: serializePleito(row) });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const b = req.body;
      if (!b.serviceDescription?.trim()) {
        throw createError('Descrição do serviço é obrigatória', 400);
      }

      const creationYear = b.creationYear != null && b.creationYear !== '' ? Number(b.creationYear) : null;

      let contractCtx: ResolvePleitoContractContext | undefined;
      if (b.updatedContractId) {
        const c = await prisma.contract.findUnique({
          where: { id: String(b.updatedContractId) },
          select: { costCenterId: true, startDate: true, endDate: true }
        });
        if (c) {
          contractCtx = {
            costCenterId: c.costCenterId,
            contractStartDate: c.startDate,
            contractEndDate: c.endDate
          };
        }
      }

      const core = await resolvePleitoCreateCore(
        b as Record<string, unknown>,
        Number.isInteger(creationYear) ? creationYear : null,
        contractCtx
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
        supervisor: b.supervisor?.trim() || null
      };

      const row = await prisma.pleito.create({ data });

      res.status(201).json({
        success: true,
        data: serializePleito(row),
        message: 'Andamento da OS cadastrado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const b = req.body;
      const existing = await prisma.pleito.findUnique({ where: { id } });
      if (!existing) throw createError('Registro não encontrado', 404);

      const data: Prisma.PleitoUpdateInput = {};
      if (b.creationMonth !== undefined) data.creationMonth = b.creationMonth?.trim() || null;
      if (b.creationYear !== undefined) {
        const vy = b.creationYear != null && b.creationYear !== '' ? Number(b.creationYear) : null;
        data.creationYear = Number.isInteger(vy) ? vy : null;
      }
      if (b.startDate !== undefined) data.startDate = b.startDate ? parseDateInput(b.startDate) : null;
      if (b.endDate !== undefined) data.endDate = b.endDate ? parseDateInput(b.endDate) : null;
      if (b.budgetStatus !== undefined) data.budgetStatus = b.budgetStatus?.trim() || null;
      if (b.folderNumber !== undefined) data.folderNumber = b.folderNumber?.trim() || null;
      if (b.lot !== undefined) data.lot = b.lot?.trim() || null;
      if (b.divSe !== undefined) data.divSe = b.divSe?.trim() || null;
      if (b.location !== undefined) data.location = b.location?.trim() || null;
      if (b.unit !== undefined) data.unit = b.unit?.trim() || null;
      if (b.serviceDescription !== undefined) {
        if (!b.serviceDescription?.trim()) throw createError('Descrição do serviço é obrigatória', 400);
        data.serviceDescription = b.serviceDescription.trim();
      }
      if (b.budget !== undefined) data.budget = b.budget?.trim() || null;
      if (b.executionStatus !== undefined) data.executionStatus = b.executionStatus?.trim() || null;
      if (b.billingStatus !== undefined) data.billingStatus = b.billingStatus?.trim() || null;
      if (b.accumulatedBilled !== undefined) data.accumulatedBilled = toDec(b.accumulatedBilled);
      if (b.billingRequest !== undefined) data.billingRequest = toDec(b.billingRequest);
      if (b.invoiceNumber !== undefined) data.invoiceNumber = b.invoiceNumber?.trim() || null;
      if (b.estimator !== undefined) data.estimator = b.estimator?.trim() || null;
      if (b.budgetAmount1 !== undefined) data.budgetAmount1 = toDec(b.budgetAmount1);
      if (b.budgetAmount2 !== undefined) data.budgetAmount2 = toDec(b.budgetAmount2);
      if (b.budgetAmount3 !== undefined) data.budgetAmount3 = toDec(b.budgetAmount3);
      if (b.budgetAmount4 !== undefined) data.budgetAmount4 = toDec(b.budgetAmount4);
      if (b.pv !== undefined) data.pv = b.pv?.trim() || null;
      if (b.ipi !== undefined) data.ipi = b.ipi?.trim() || null;
      if (b.reportsBilling !== undefined) data.reportsBilling = b.reportsBilling?.trim() || null;
      if (b.engineer !== undefined) data.engineer = b.engineer?.trim() || null;
      if (b.supervisor !== undefined) data.supervisor = b.supervisor?.trim() || null;

      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.pleito.update({ where: { id }, data });

        const wasPaid = (existing.billingStatus || '').trim().toLowerCase() === 'pago';
        const nextBillingStatus =
          b.billingStatus !== undefined
            ? (b.billingStatus || '').trim().toLowerCase()
            : (existing.billingStatus || '').trim().toLowerCase();
        const willBePaid = nextBillingStatus === 'pago';
        const nextInvoice = (
          b.invoiceNumber !== undefined ? b.invoiceNumber : updated.invoiceNumber
        )
          ?.trim()
          .toString();
        const faturar100 = b.faturar100 === true || b.faturar100 === 'true' || b.faturar100 === 1;
        const faturarRestante = b.faturarRestante === true || b.faturarRestante === 'true' || b.faturarRestante === 1;
        const faturarValor = b.faturarValor === true || b.faturarValor === 'true' || b.faturarValor === 1;
        const valorFaturamento =
          b.valorFaturamento != null && b.valorFaturamento !== ''
            ? Number(b.valorFaturamento)
            : 0;

        if (faturar100 && updated.updatedContractId) {
          if (!nextInvoice) {
            throw createError('Informe o número da nota fiscal para faturar o pleito', 400);
          }
          const serviceOrder = (updated.divSe || '').trim();
          if (!serviceOrder) {
            throw createError('O pleito não possui OS/SE para vincular o faturamento', 400);
          }
          const pleitoTotal = getPleitoBillableTotal(updated);
          if (pleitoTotal <= 0) {
            throw createError('O pleito não possui valor apto para faturamento', 400);
          }

          await upsertBillingFromPleitoFaturamento(tx, {
            pleitoId: updated.id,
            contractId: updated.updatedContractId,
            invoiceNumber: nextInvoice,
            serviceOrder,
            grossValue: pleitoTotal,
            netValue: pleitoTotal,
            issueDate: new Date()
          });
          await syncPleitoFromBillings(tx, updated.id);
        } else if (faturarRestante && updated.updatedContractId) {
          if (!nextInvoice) {
            throw createError('Informe o número da nota fiscal para faturar o saldo do pleito', 400);
          }
          const serviceOrder = (updated.divSe || '').trim();
          if (!serviceOrder) {
            throw createError('O pleito não possui OS/SE para vincular o faturamento', 400);
          }

          const remaining = await getPleitoRemainingBalance(
            tx,
            {
              id: updated.id,
              billingRequest: updated.billingRequest,
              budget: updated.budget
            },
          );
          if (remaining <= 0.01) {
            throw createError('O pleito não possui saldo apto para faturamento', 400);
          }

          await upsertBillingFromPleitoFaturamento(tx, {
            pleitoId: updated.id,
            contractId: updated.updatedContractId,
            invoiceNumber: nextInvoice,
            serviceOrder,
            grossValue: remaining,
            netValue: remaining,
            issueDate: new Date()
          });
          await syncPleitoFromBillings(tx, updated.id);
        } else if (faturarValor && updated.updatedContractId) {
          if (!nextInvoice) {
            throw createError('Informe o número da nota fiscal para faturar o pleito', 400);
          }
          if (!Number.isFinite(valorFaturamento) || valorFaturamento <= 0) {
            throw createError('Informe um valor válido para o faturamento parcial', 400);
          }
          const serviceOrder = (updated.divSe || '').trim();
          if (!serviceOrder) {
            throw createError('O pleito não possui OS/SE para vincular o faturamento', 400);
          }

          await assertPleitoBillingAmount(
            tx,
            {
              id: updated.id,
              updatedContractId: updated.updatedContractId,
              divSe: updated.divSe,
              billingRequest: updated.billingRequest,
              budget: updated.budget
            },
            updated.updatedContractId,
            valorFaturamento
          );

          await upsertBillingFromPleitoFaturamento(tx, {
            pleitoId: updated.id,
            contractId: updated.updatedContractId,
            invoiceNumber: nextInvoice,
            serviceOrder,
            grossValue: valorFaturamento,
            netValue: valorFaturamento,
            issueDate: new Date()
          });
          await syncPleitoFromBillings(tx, updated.id);
        } else if (willBePaid && !wasPaid) {
          if (!nextInvoice) {
            throw createError('Informe o número da nota fiscal antes de marcar como pago', 400);
          }
          const linkedBilling = await findBillingForPleito(tx, updated, nextInvoice);
          if (!linkedBilling) {
            throw createError(
              'Não é possível marcar como pago sem faturamento vinculado. Cadastre o faturamento do pleito primeiro.',
              400
            );
          }
        }

        return updated;
      });

      res.json({ success: true, data: serializePleito(row), message: 'Atualizado com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const excluirOrdemServico =
        req.query.excluirOrdemServico === 'true' || req.query.excluirOrdemServico === '1';
      const existing = await prisma.pleito.findUnique({ where: { id } });
      if (!existing) throw createError('Registro não encontrado', 404);

      const isHistoricoGerado = isPleitoHistoricoGerado(existing.reportsBilling);

      const deleteLinkedBillings = async () => {
        await prisma.contractBilling.deleteMany({ where: { pleitoId: id } });
      };

      if (excluirOrdemServico || isHistoricoGerado) {
        await deleteLinkedBillings();
        await prisma.pleito.delete({ where: { id } });
        return res.json({ success: true, message: 'Excluído com sucesso' });
      }

      // OS principal com valor pleiteado acumulado: zera o pleito sem apagar a OS.
      const billingRequest =
        existing.billingRequest != null ? Number(existing.billingRequest) : 0;
      if (billingRequest > 0) {
        await deleteLinkedBillings();
        const row = await prisma.pleito.update({
          where: { id },
          data: {
            billingRequest: null,
            billingStatus: null,
            accumulatedBilled: null,
          },
        });
        return res.json({
          success: true,
          data: serializePleito(row),
          message: 'Pleito removido da ordem de serviço',
        });
      }

      throw createError(
        'Este registro é a ordem de serviço. Aqui só é possível excluir registros de pleito gerado (histórico). Para remover a OS, use a tela do contrato.',
        400
      );
    } catch (error) {
      return next(error);
    }
  }
}
