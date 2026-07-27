import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { parseDateInput } from '../utils/dateInput';
import {
  assertContractAccess,
  assertUserCanCreateContract,
  assertUserCanDeleteContract,
  assertUserCanEditContract,
  getContractAccessForUser
} from '../lib/contractAccess';
import { getTotvsRmRelatorioFinService } from '../services/TotvsRmRelatorioFinService';
import { totvsRmContractLookupCodes } from '../lib/totvsRmContractCostCenterCode';
import { fetchControleGeralFinancialSummary } from '../services/ControleGeralFinancialService';
import { fetchBaseGastosSummary } from '../services/BaseGastosSheetsService';
import {
  normalizeCentroCustoName,
  resolveGastosPoloForContract
} from '../lib/gastosOperacionaisPolo';

/** Igual ao filtro da tela do contrato: não somar pleitos gerados para histórico. */
const PLEITO_HISTORICO_MARKER = '__PLEITO_HISTORICO__';

type GastosOperacionaisDetailRow = {
  contract: string;
  dateISO: string;
  month: number;
  year: number;
  total: number;
  polo?: string | null;
};

type GastosOperacionaisNaturezaDetailRow = {
  contract: string;
  dateISO: string;
  month: number;
  year: number;
  natureza: string;
  total: number;
};

function normalizeGastosCcLookupKey(value: string): string {
  return normalizeCentroCustoName(value);
}

async function enrichGastosPoloFromCostCenters(
  detailRows: GastosOperacionaisDetailRow[]
): Promise<GastosOperacionaisDetailRow[]> {
  const costCenters = await prisma.costCenter.findMany({
    where: { isActive: true },
    select: { name: true, code: true, polo: true }
  });

  const poloByName = new Map<string, string>();
  const poloByCode = new Map<string, string>();
  for (const cc of costCenters) {
    const polo = cc.polo?.trim();
    if (!polo) continue;
    poloByName.set(normalizeGastosCcLookupKey(cc.name), polo);
    poloByCode.set(normalizeGastosCcLookupKey(cc.code), polo);
  }

  return detailRows.map((row) => {
    const key = normalizeGastosCcLookupKey(row.contract);
    const costCenterPolo = poloByName.get(key) || poloByCode.get(key) || null;
    const polo = resolveGastosPoloForContract(row.contract, {
      costCenterPolo,
      totvsPolo: row.polo
    });
    return { ...row, polo };
  });
}

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
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserCanEditContract(req.user.id, !!req.user.isAdmin);
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
      const skipAvailableYears =
        req.query.skipAvailableYears === '1' || req.query.skipAvailableYears === 'true';

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
        skipAvailableYears
          ? Promise.resolve([] as Array<{ issueDate: Date }>)
          : prisma.contractBilling.findMany({ select: { issueDate: true } }),
        skipAvailableYears
          ? Promise.resolve([] as Array<{ fillingDate: Date }>)
          : prisma.contractWeeklyProduction.findMany({ select: { fillingDate: true } })
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
          c.pleitos?.filter((p) => {
            const marker = (p.reportsBilling || '').trim();
            return !marker.startsWith(PLEITO_HISTORICO_MARKER);
          }) ?? [];
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

      const availableYears = skipAvailableYears
        ? [new Date().getFullYear(), ...(yearValid ? [yearParam as number] : [])].filter(
            (y, index, arr) => Number.isFinite(y) && arr.indexOf(y) === index
          )
        : Array.from(
            new Set<number>([
              ...allBillingsDates.map((b) => new Date(b.issueDate).getFullYear()),
              ...allProductionsDates.map((p) => new Date(p.fillingDate).getFullYear()),
              new Date().getFullYear(),
              ...(yearValid ? [yearParam as number] : [])
            ])
          )
            .filter((y) => Number.isFinite(y))
            .sort((a, b) => b - a);

      const includeGastosOperacionais =
        req.query.includeGastosOperacionais === '1' ||
        req.query.includeGastosOperacionais === 'true';

      let gastosOperacionais:
        | {
            rows: Array<{
              rowKey: string;
              label: string;
              gastosAcumulado: number;
              isLotRow: boolean;
            }>;
            fetchedAt: string;
          }
        | undefined;

      if (includeGastosOperacionais) {
        const forceRefresh =
          req.query.refresh === '1' ||
          req.query.refresh === 'true' ||
          req.query.gastosRefresh === '1' ||
          req.query.gastosRefresh === 'true';
        const gastosSummary = await fetchBaseGastosSummary(undefined, forceRefresh);
        gastosOperacionais = {
          rows: gastosSummary.byQueryContract.map((item) => ({
            rowKey: item.contract,
            label: item.contract,
            contract: item.contract,
            mesesApuracao: item.mesesApuracao,
            anoMin: item.anoMin,
            anoMax: item.anoMax,
            totalAcumulado: item.totalAcumulado,
            gastosAcumulado: item.totalAcumulado,
            isLotRow: false
          })),
          fetchedAt: gastosSummary.fetchedAt
        };
      }

      res.json({
        success: true,
        data: overview,
        filterYear: year ? filterYear : null,
        availableYears,
        ...(gastosOperacionais ? { gastosOperacionais } : {})
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar controle geral.';
      if (message.includes('Base de Gastos') || message.includes('planilha')) {
        res.status(503).json({ success: false, message });
        return;
      }
      next(error);
    }
  }

  /**
   * Gastos operacionais por centro de custo (TOTVS RM — RELATORIOFIN).
   * Lista todos os CC presentes no relatório, sem depender de contratos cadastrados.
   */
  async getGastosOperacionais(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Não autenticado', 401);
      const access = await getContractAccessForUser(req.user.id, req.user.isAdmin);
      if (access.filter === 'none') {
        throw createError('Sem permissão para acessar contratos', 403);
      }

      const svc = getTotvsRmRelatorioFinService();
      if (!svc.isConfigured()) {
        res.json({
          success: true,
          data: {
            configured: false,
            detailRows: [] as GastosOperacionaisDetailRow[],
            naturezaDetailRows: [] as GastosOperacionaisNaturezaDetailRow[],
            fetchedAt: new Date().toISOString(),
            message:
              'Integração TOTVS RM não configurada. Defina TOTVS_RM_BASE_URL e TOTVS_RM_USER + TOTVS_RM_PASSWORD (Basic) ou TOTVS_RM_BEARER_TOKEN.'
          }
        });
        return;
      }

      try {
        const result = await svc.listGastosOperacionaisDetailRows();
        const detailRows = await enrichGastosPoloFromCostCenters(result.detailRows);
        res.json({
          success: true,
          data: {
            configured: true,
            detailRows,
            naturezaDetailRows: result.naturezaDetailRows,
            fetchedAt: new Date().toISOString(),
            costCenterCount: result.costCenterCount,
            totalRowCount: result.totalRowCount,
            ccColumn: result.ccColumn,
            valueColumn: result.valueColumn,
            dateColumn: result.dateColumn,
            poloColumn: result.poloColumn
          }
        });
      } catch (err) {
        const message = svc.formatAxiosError(err);
        console.warn(`[TOTVS RM GASTOS OPERACIONAIS]: ${message}`);
        res.json({
          success: false,
          message,
          data: {
            configured: true,
            detailRows: [] as GastosOperacionaisDetailRow[],
            naturezaDetailRows: [] as GastosOperacionaisNaturezaDetailRow[],
            fetchedAt: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      next(error);
    }
  }

  /** Solicitações RM de uma natureza (drill-down do modal Gastos Operacionais). */
  async getGastosOperacionaisNaturezaSolicitacoes(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) throw createError('Não autenticado', 401);
      const access = await getContractAccessForUser(req.user.id, req.user.isAdmin);
      if (access.filter === 'none') {
        throw createError('Sem permissão para acessar contratos', 403);
      }

      const contract = String(req.query.contract ?? '').trim();
      const natureza = String(req.query.natureza ?? '').trim();
      const periodFrom = String(req.query.periodFrom ?? '').trim();
      const periodTo = String(req.query.periodTo ?? '').trim();

      if (!contract || !natureza) {
        throw createError('Informe contract e natureza.', 400);
      }

      const svc = getTotvsRmRelatorioFinService();
      if (!svc.isConfigured()) {
        res.json({
          success: true,
          data: {
            configured: false,
            solicitacoes: [],
            message:
              'Integração TOTVS RM não configurada. Defina TOTVS_RM_BASE_URL e TOTVS_RM_USER + TOTVS_RM_PASSWORD (Basic) ou TOTVS_RM_BEARER_TOKEN.'
          }
        });
        return;
      }

      try {
        const solicitacoes = await svc.listGastosOperacionaisNaturezaSolicitacoes({
          contract,
          canonicalNatureza: natureza,
          periodFrom,
          periodTo
        });
        res.json({
          success: true,
          data: {
            configured: true,
            solicitacoes
          }
        });
      } catch (err) {
        const message = svc.formatAxiosError(err);
        console.warn(`[TOTVS RM GASTOS OPERACIONAIS SOLICITACOES]: ${message}`);
        res.json({
          success: false,
          message,
          data: {
            configured: true,
            solicitacoes: []
          }
        });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resumo financeiro por contrato (planilha): gastos da Base de Gastos + faturamento do Controle de NF's.
   */
  async getSheetsFinancialSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Não autenticado', 401);
      const access = await getContractAccessForUser(req.user.id, req.user.isAdmin);
      if (access.filter === 'none') {
        throw createError('Sem permissão para acessar contratos', 403);
      }

      const { year, refresh } = req.query;
      const yearParam = year != null && String(year).trim() !== '' ? Number(year) : null;
      const filterYear = yearParam != null && Number.isFinite(yearParam) ? yearParam : undefined;
      const forceRefresh = refresh === '1' || refresh === 'true';

      const summary = await fetchControleGeralFinancialSummary(filterYear, forceRefresh);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Total pago (TOTVS RM) — soma linhas do RELATORIOFIN cujo centro de custo bate com o do contrato.
   */
  async getTotvsTotalPago(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;

      await assertContractAccess(req, contractId);

      const contract = await prisma.contract.findUnique({
        where: { id: contractId },
        include: {
          costCenter: { select: { code: true, name: true } }
        }
      });
      if (!contract) {
        throw createError('Contrato não encontrado', 404);
      }

      const svc = getTotvsRmRelatorioFinService();
      if (!svc.isConfigured()) {
        res.json({
          success: true,
          data: {
            configured: false,
            total: null as number | null,
            message:
              'Integração TOTVS RM não configurada. Defina TOTVS_RM_BASE_URL e TOTVS_RM_USER + TOTVS_RM_PASSWORD (Basic) ou TOTVS_RM_BEARER_TOKEN.'
          }
        });
        return;
      }

      try {
        const ccCode = contract.costCenter.code;
        const ccName = contract.costCenter.name;
        const lookupCandidates = totvsRmContractLookupCodes(ccCode, ccName);
        const { result: sum, lookupCodeUsed: rmLookupCode } =
          await svc.sumForCostCenterCodesAsync(lookupCandidates, ccName, { omitLines: false });
        res.json({
          success: true,
          data: {
            configured: true,
            total: sum.total,
            matchedRowCount: sum.matchedRowCount,
            totalRowCount: sum.totalRowCount,
            ccColumn: sum.ccColumn,
            valueColumn: sum.valueColumn,
            naturezaColumn: sum.naturezaColumn,
            dateColumn: sum.dateColumn,
            totalsByNatureza: sum.totalsByNatureza,
            sampleCcValuesMatched: sum.sampleCcValuesMatched,
            paidByCalendarMonth: sum.paidByCalendarMonth,
            paidUndated: sum.paidUndated,
            solicitacoesByCalendarMonth: sum.solicitacoesByCalendarMonth,
            solicitacoesUndated: sum.solicitacoesUndated,
            solicitacoesMatchedRowCount: sum.solicitacoesMatchedRowCount,
            solicitacoesDateColumn: sum.solicitacoesDateColumn,
            solicitacoesValueColumn: sum.solicitacoesValueColumn,
            solicitacoesCcColumn: sum.solicitacoesCcColumn,
            costCenterCode: ccCode,
            costCenterName: ccName,
            costCenterCodeRm: rmLookupCode !== ccCode ? rmLookupCode : undefined
          }
        });
      } catch (err) {
        const message = svc.formatAxiosError(err);
        const ccCode = contract.costCenter.code;
        const rmTried = totvsRmContractLookupCodes(ccCode, contract.costCenter.name).join(' | ');
        console.warn(
          `[TOTVS RM RELATORIOFIN] contrato=${contractId} cc=${ccCode} rm=[${rmTried}]: ${message}`
        );
        res.json({
          success: false,
          message,
          data: {
            configured: true,
            total: null as number | null,
            costCenterCode: contract.costCenter.code,
            costCenterName: contract.costCenter.name
          }
        });
      }
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
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserCanDeleteContract(req.user.id, !!req.user.isAdmin);
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
