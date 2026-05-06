import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { parseDateInput } from '../utils/dateInput';
import {
  assertContractAccess,
  assertUserCanCreateContract,
  getContractAccessForUser
} from '../lib/contractAccess';

/** Igual ao filtro da tela do contrato: não somar pleitos gerados para histórico. */
const PLEITO_HISTORICO_MARKER = '__PLEITO_HISTORICO__';

/** Igual ao frontend: só pleitos com status de orçamento Aprovado ou Faturado entram em "Valor orçado". */
function isBudgetStatusInValorOrcadoSum(budgetStatus: string | null | undefined): boolean {
  const s = (budgetStatus || '').trim();
  return s === 'Aprovado' || s === 'Faturado';
}

/** Valor orçado da OS: último R04…R01 preenchido; senão campo budget (texto). */
function valorOrcadoFromPleito(p: {
  budget: string | null;
  budgetAmount1: unknown;
  budgetAmount2: unknown;
  budgetAmount3: unknown;
  budgetAmount4: unknown;
}): number {
  const amounts = [p.budgetAmount4, p.budgetAmount3, p.budgetAmount2, p.budgetAmount1];
  for (const v of amounts) {
    if (v != null && Number(v) !== 0) return Number(v);
  }
  if (p.budget?.trim()) {
    const s = String(p.budget).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export class ContractController {
  /**
   * Listar todos os contratos
   */
  async getAllContracts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Não autenticado', 401);
      const access = await getContractAccessForUser(req.user.id, req.user.isAdmin);
      if (access.filter === 'none') {
        throw createError('Sem permissão para acessar contratos', 403);
      }

      const { search, page = 1, limit = 20 } = req.query;

      const where: any = {};

      if (access.filter === 'ids') {
        where.id = { in: access.ids };
      }

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { number: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const limitNum = Math.min(Number(limit) || 20, 200);
      const skip = (Number(page) - 1) * limitNum;

      const [contracts, total] = await Promise.all([
        prisma.contract.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          include: {
            costCenter: {
              select: { id: true, code: true, name: true }
            }
          }
        }),
        prisma.contract.count({ where })
      ]);

      // Converter Decimal para número na resposta
      const contractsWithNumbers = contracts.map((c) => ({
        ...c,
        valuePlusAddenda: c.valuePlusAddenda ? Number(c.valuePlusAddenda) : 0
      }));

      res.json({
        success: true,
        data: contractsWithNumbers,
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

  /**
   * Obter contrato por ID
   */
  async getContractById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      await assertContractAccess(req, id);

      const contract = await prisma.contract.findUnique({
        where: { id },
        include: {
          costCenter: {
            select: { id: true, code: true, name: true }
          }
        }
      });

      if (!contract) {
        throw createError('Contrato não encontrado', 404);
      }

      res.json({
        success: true,
        data: {
          ...contract,
          valuePlusAddenda: contract.valuePlusAddenda ? Number(contract.valuePlusAddenda) : 0
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Criar novo contrato
   */
  async createContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserCanCreateContract(req.user.id, req.user.isAdmin);

      const { name, number, startDate, endDate, validityCycle, costCenterId, valuePlusAddenda } = req.body;

      if (!name?.trim()) {
        throw createError('Nome do contrato é obrigatório', 400);
      }
      if (!number?.trim()) {
        throw createError('Número do contrato é obrigatório', 400);
      }
      if (!startDate) {
        throw createError('Data de início da vigência é obrigatória', 400);
      }
      if (!endDate) {
        throw createError('Data de fim da vigência é obrigatória', 400);
      }
      if (!costCenterId) {
        throw createError('Centro de custo é obrigatório', 400);
      }
      if (valuePlusAddenda === undefined || valuePlusAddenda === null || valuePlusAddenda === '') {
        throw createError('Valor mais aditivos é obrigatório', 400);
      }

      const costCenterExists = await prisma.costCenter.findUnique({
        where: { id: costCenterId }
      });
      if (!costCenterExists) {
        throw createError('Centro de custo não encontrado', 404);
      }

      const numberExists = await prisma.contract.findUnique({
        where: { number: String(number).trim() }
      });
      if (numberExists) {
        throw createError('Já existe um contrato com este número', 409);
      }

      const value = Number(valuePlusAddenda) || 0;
      const start = parseDateInput(startDate);
      const end = parseDateInput(endDate);

      if (end < start) {
        throw createError('Data de fim da vigência deve ser posterior à data de início', 400);
      }

      const creatorId = req.user.id;
      const isAdminCreator = req.user.isAdmin;

      const contract = await prisma.$transaction(async (tx) => {
        const created = await tx.contract.create({
          data: {
            name: name.trim(),
            number: String(number).trim(),
            startDate: start,
            endDate: end,
            costCenterId,
            valuePlusAddenda: value
          },
          include: {
            costCenter: {
              select: { id: true, code: true, name: true }
            }
          }
        });

        if (!isAdminCreator) {
          await tx.userContractPermission.upsert({
            where: {
              userId_contractId: { userId: creatorId, contractId: created.id }
            },
            create: {
              userId: creatorId,
              contractId: created.id,
              accessOrcamento: true,
              accessRelatorios: true,
              accessOrdemServico: true,
              accessProducaoSemanal: true,
              updatedBy: creatorId
            },
            update: { updatedBy: creatorId }
          });
        }

        return created;
      });

      res.status(201).json({
        success: true,
        data: {
          ...contract,
          valuePlusAddenda: Number(contract.valuePlusAddenda)
        },
        message: 'Contrato criado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar contrato
   */
  async updateContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await assertContractAccess(req, id);

      const { name, number, startDate, endDate, costCenterId, valuePlusAddenda } = req.body;

      const existing = await prisma.contract.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Contrato não encontrado', 404);
      }

      if (number && String(number).trim() !== existing.number) {
        const numberExists = await prisma.contract.findUnique({
          where: { number: String(number).trim() }
        });
        if (numberExists) {
          throw createError('Já existe um contrato com este número', 409);
        }
      }

      if (costCenterId) {
        const costCenterExists = await prisma.costCenter.findUnique({
          where: { id: costCenterId }
        });
        if (!costCenterExists) {
          throw createError('Centro de custo não encontrado', 404);
        }
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (number !== undefined) updateData.number = String(number).trim();
      if (startDate !== undefined) updateData.startDate = parseDateInput(startDate);
      if (endDate !== undefined) updateData.endDate = parseDateInput(endDate);
      if (costCenterId !== undefined) updateData.costCenterId = costCenterId;
      if (valuePlusAddenda !== undefined) updateData.valuePlusAddenda = Number(valuePlusAddenda) || 0;

      if (updateData.endDate && updateData.startDate && updateData.endDate < updateData.startDate) {
        throw createError('Data de fim da vigência deve ser posterior à data de início', 400);
      }

      const contract = await prisma.contract.update({
        where: { id },
        data: updateData,
        include: {
          costCenter: {
            select: { id: true, code: true, name: true }
          }
        }
      });

      res.json({
        success: true,
        data: {
          ...contract,
          valuePlusAddenda: Number(contract.valuePlusAddenda)
        },
        message: 'Contrato atualizado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Controle geral: listar todos os contratos com dados agregados
   * (faturamento, ordens de serviço, produção semanal)
   */
  async getOverview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Não autenticado', 401);
      const access = await getContractAccessForUser(req.user.id, req.user.isAdmin);
      if (access.filter === 'none') {
        throw createError('Sem permissão para acessar contratos', 403);
      }

      const { year } = req.query;
      const filterYear = year ? Number(year) : new Date().getFullYear();

      const overviewWhere =
        access.filter === 'ids' ? { id: { in: access.ids } } : {};

      const [contracts, allBillingsDates, allProductionsDates] = await Promise.all([
        prisma.contract.findMany({
        where: overviewWhere,
        orderBy: { name: 'asc' },
        include: {
          costCenter: {
            select: { id: true, code: true, name: true }
          },
          billings: {
            select: { grossValue: true, issueDate: true }
          },
          pleitos: {
            select: {
              creationYear: true,
              budgetStatus: true,
              budget: true,
              budgetAmount1: true,
              budgetAmount2: true,
              budgetAmount3: true,
              budgetAmount4: true,
              reportsBilling: true
            }
          },
          weeklyProductions: {
            where: year
              ? {
                  fillingDate: {
                    gte: new Date(filterYear, 0, 1),
                    lt: new Date(filterYear + 1, 0, 1)
                  }
                }
              : undefined,
            select: { weeklyProductionValue: true }
          }
        }
      }),
        prisma.contractBilling.findMany({ select: { issueDate: true } }),
        prisma.contractWeeklyProduction.findMany({ select: { fillingDate: true } })
      ]);

      const yearParam = year != null && String(year).trim() !== '' ? Number(year) : null;
      const yearValid = yearParam != null && Number.isFinite(yearParam);

      const overview = contracts.map((c) => {
        const billings = c.billings ?? [];
        /** Faturamento acumulado (bruto), todos os anos. */
        const faturamentoAcumulado = billings.reduce(
          (s, b) => s + Number(b.grossValue || 0),
          0
        );
        /** Faturamento anual (bruto), apenas no ano do filtro. */
        const faturamentoAnual = yearValid
          ? billings
              .filter((b) => new Date(b.issueDate).getFullYear() === yearParam)
              .reduce((s, b) => s + Number(b.grossValue || 0), 0)
          : 0;
        const totalProducao =
          c.weeklyProductions?.reduce(
            (s, p) => s + Number(p.weeklyProductionValue || 0),
            0
          ) ?? 0;
        const pleitosAll =
          c.pleitos?.filter(
            (p) => (p.reportsBilling || '').trim() !== PLEITO_HISTORICO_MARKER
          ) ?? [];
        const pleitosNoAno = yearValid
          ? pleitosAll.filter((p) => p.creationYear === yearParam)
          : pleitosAll;
        const valorOrcado = pleitosNoAno
          .filter((p) => isBudgetStatusInValorOrcadoSum(p.budgetStatus))
          .reduce((s, p) => s + valorOrcadoFromPleito(p), 0);
        /** Pendente acompanha o mesmo escopo temporal do filtro de ano. */
        const baseFaturamento = yearValid ? faturamentoAnual : faturamentoAcumulado;
        const pendenteFaturamento = valorOrcado - baseFaturamento;
        return {
          id: c.id,
          name: c.name,
          number: c.number,
          startDate: c.startDate,
          endDate: c.endDate,
          costCenter: c.costCenter,
          valuePlusAddenda: c.valuePlusAddenda ? Number(c.valuePlusAddenda) : 0,
          faturamentoAcumulado,
          faturamentoAnual,
          /** Indica se o faturamento anual aplica ao ano (quando não há ano no filtro, a UI pode exibir "—"). */
          faturamentoAnualAplica: yearValid,
          totalProducaoSemanal: totalProducao,
          valorOrcado,
          pendenteFaturamento
        };
      });

      const availableYears = Array.from(
        new Set<number>([
          ...allBillingsDates.map((b) => new Date(b.issueDate).getFullYear()),
          ...allProductionsDates.map((p) => new Date(p.fillingDate).getFullYear()),
          new Date().getFullYear(),
          ...(yearValid ? [yearParam] : [])
        ])
      )
        .filter((y) => Number.isFinite(y))
        .sort((a, b) => b - a);

      res.json({
        success: true,
        data: overview,
        filterYear: year ? filterYear : null,
        availableYears
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Deletar contrato
   */
  async deleteContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      await assertContractAccess(req, id);

      const existing = await prisma.contract.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Contrato não encontrado', 404);
      }

      await prisma.contract.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Contrato excluído com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }
}
