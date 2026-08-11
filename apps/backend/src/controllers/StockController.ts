import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { extractOcNumberFromMovementNotes, parseInvoicesFromMovementNotes } from '../utils/stockMovementNotes';
import { isValidNfNumber } from '../utils/nfInvoiceNumber';
import { stockShortfallService } from '../services/StockShortfallService';
import { PurchaseOrderService } from '../services/PurchaseOrderService';
import {
  applyUnbCostCenterScopeToIdFilter,
  assertCostCenterAllowedForUnbUser,
  getUserUnbCostCenterScope,
} from '../lib/unbCostCenterScope';

const purchaseOrderService = new PurchaseOrderService();

export class StockController {
  /**
   * Listar movimentações de estoque com filtros
   */
  async listMovements(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) throw createError('Usuário não autenticado', 401);
      const { costCenterId, month, year, category, materialId, type, page = 1, limit = 100 } = req.query;

      const where: any = {};

      const unbScope = await getUserUnbCostCenterScope(req.user.id, !!req.user.isAdmin);
      const scoped = applyUnbCostCenterScopeToIdFilter(
        unbScope,
        costCenterId ? String(costCenterId) : undefined,
      );
      if (scoped.denyAll) {
        res.json({
          success: true,
          data: [],
          pagination: { page: 1, limit: Number(limit) || 100, total: 0, totalPages: 0 },
        });
        return;
      }
      if (scoped.costCenterId) {
        where.costCenterId = scoped.costCenterId;
      } else if (scoped.costCenterIds?.length) {
        where.costCenterId = { in: scoped.costCenterIds };
      }

      if (materialId) {
        where.materialId = String(materialId);
      }

      if (type && (type === 'IN' || type === 'OUT')) {
        where.type = String(type);
      }

      if (category) {
        where.material = {
          category: String(category)
        };
      }

      if (month || year) {
        const monthNum = month ? parseInt(String(month)) : undefined;
        const yearNum = year ? parseInt(String(year)) : undefined;

        if (monthNum && yearNum) {
          const startDate = new Date(yearNum, monthNum - 1, 1);
          const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);
          where.createdAt = {
            gte: startDate,
            lte: endDate
          };
        } else if (yearNum) {
          const startDate = new Date(yearNum, 0, 1);
          const endDate = new Date(yearNum, 11, 31, 23, 59, 59, 999);
          where.createdAt = {
            gte: startDate,
            lte: endDate
          };
        }
      }

      const limitNum = Math.min(Number(limit), 500);
      const skip = (Number(page) - 1) * limitNum;

      const [movements, total] = await Promise.all([
        prisma.stockMovement.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          include: {
            material: true,
            costCenter: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }),
        prisma.stockMovement.count({ where })
      ]);

      res.json({
        success: true,
        data: movements,
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
   * Obter saldo atual de materiais em estoque
   */
  async getStockBalance(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) throw createError('Usuário não autenticado', 401);
      const { costCenterId, category, search } = req.query;
      const movementsWhere: any = {
        material: {
          isActive: true
        }
      };

      const unbScope = await getUserUnbCostCenterScope(req.user.id, !!req.user.isAdmin);
      const scoped = applyUnbCostCenterScopeToIdFilter(
        unbScope,
        costCenterId ? String(costCenterId) : undefined,
      );
      if (scoped.denyAll) {
        res.json({ success: true, data: [] });
        return;
      }
      if (scoped.costCenterId) {
        movementsWhere.costCenterId = scoped.costCenterId;
      } else if (scoped.costCenterIds?.length) {
        movementsWhere.costCenterId = { in: scoped.costCenterIds };
      }

      if (category) {
        movementsWhere.material.category = String(category);
      }

      if (search) {
        const searchStr = String(search);
        movementsWhere.material.OR = [
          { name: { contains: searchStr, mode: 'insensitive' } },
          { description: { contains: searchStr, mode: 'insensitive' } }
        ];
      }

      const groupedMovements = await prisma.stockMovement.groupBy({
        by: ['materialId', 'costCenterId', 'type'],
        where: movementsWhere,
        _sum: {
          quantity: true
        }
      });

      const materialIds = [...new Set(groupedMovements.map((gm) => gm.materialId))];
      const costCenterIds = [...new Set(groupedMovements.map((gm) => gm.costCenterId).filter(Boolean))] as string[];

      const [materials, costCenters] = await Promise.all([
        prisma.constructionMaterial.findMany({
          where: { id: { in: materialIds } }
        }),
        costCenterIds.length > 0
          ? prisma.costCenter.findMany({ where: { id: { in: costCenterIds } } })
          : Promise.resolve([])
      ]);

      const materialsMap = new Map(materials.map((material) => [material.id, material]));
      const costCentersMap = new Map(costCenters.map((cc) => [cc.id, cc]));

      const balanceByMaterialAndCostCenter = new Map<string, number>();
      groupedMovements.forEach((movement) => {
        const key = `${movement.materialId}:${movement.costCenterId || 'no-cost-center'}`;
        const currentBalance = balanceByMaterialAndCostCenter.get(key) || 0;
        const quantity = movement._sum.quantity || 0;
        const nextBalance = movement.type === 'IN' ? currentBalance + quantity : currentBalance - quantity;
        balanceByMaterialAndCostCenter.set(key, nextBalance);
      });

      const filteredBalances = Array.from(balanceByMaterialAndCostCenter.entries())
        .map(([key, balance]) => {
          const [materialId, rawCostCenterId] = key.split(':');
          const costCenterIdValue = rawCostCenterId === 'no-cost-center' ? null : rawCostCenterId;
          const material = materialsMap.get(materialId);

          if (!material) {
            return null;
          }

          return {
            material: {
              id: material.id,
              name: material.name,
              description: material.description,
              unit: material.unit,
              category: material.category
            },
            costCenter: costCenterIdValue
              ? {
                  id: costCenterIdValue,
                  code: costCentersMap.get(costCenterIdValue)?.code || '',
                  name: costCentersMap.get(costCenterIdValue)?.name || ''
                }
              : null,
            balance
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .filter((item) => item.balance !== 0)
        .sort((a, b) => a.material.name.localeCompare(b.material.name));

      res.json({
        success: true,
        data: filteredBalances
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Criar movimentação de estoque (entrada ou saída)
   */
  async createMovement(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) {
        throw createError('Usuário não autenticado', 401);
      }

      const { materialId, costCenterId, type, quantity, notes } = req.body;

      if (!materialId || !type || !quantity) {
        throw createError('Material, tipo e quantidade são obrigatórios', 400);
      }

      if (type !== 'IN' && type !== 'OUT') {
        throw createError('Tipo deve ser IN (entrada) ou OUT (saída)', 400);
      }

      if (type === 'IN' && notes) {
        const notesStr = String(notes);
        const invoices = parseInvoicesFromMovementNotes(notesStr);
        if (invoices.length > 0) {
          for (const inv of invoices) {
            if (!isValidNfNumber(inv.number)) {
              throw createError('Número da nota fiscal é obrigatório', 400);
            }
          }
          const ocNum = extractOcNumberFromMovementNotes(notesStr);
          if (!ocNum) {
            throw createError('Informe a OC ao anexar nota fiscal na entrada', 400);
          }
          for (const inv of invoices) {
            try {
              await purchaseOrderService.assertInvoiceNumberAvailable(String(inv.number), {
                excludeOrderNumber: ocNum
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Número de NF inválido';
              throw createError(msg, 400);
            }
          }
        }
      }

      const quantityNum = parseFloat(String(quantity));
      if (isNaN(quantityNum) || quantityNum <= 0) {
        throw createError('Quantidade deve ser um número positivo', 400);
      }

      // Verificar se material existe
      const material = await prisma.constructionMaterial.findUnique({
        where: { id: String(materialId) }
      });

      if (!material) {
        throw createError('Material não encontrado', 404);
      }

      // Verificar se centro de custo existe (se fornecido)
      if (costCenterId) {
        const costCenter = await prisma.costCenter.findUnique({
          where: { id: String(costCenterId) }
        });

        if (!costCenter) {
          throw createError('Centro de custo não encontrado', 404);
        }
        await assertCostCenterAllowedForUnbUser(req.user.id, !!req.user.isAdmin, String(costCenterId));
      } else {
        // Usuário UNB não pode lançar movimento sem centro de custo (escaparia o escopo).
        const unbScope = await getUserUnbCostCenterScope(req.user.id, !!req.user.isAdmin);
        if (unbScope !== null) {
          throw createError('Informe um centro de custo UNB para a movimentação', 400);
        }
      }

      // Impedir saídas maiores que o saldo atual no mesmo escopo (material + centro de custo)
      if (type === 'OUT') {
        const movementScopeWhere: any = {
          materialId: String(materialId),
          costCenterId: costCenterId ? String(costCenterId) : null
        };

        const groupedByType = await prisma.stockMovement.groupBy({
          by: ['type'],
          where: movementScopeWhere,
          _sum: {
            quantity: true
          }
        });

        const totalIn = groupedByType.find((item) => item.type === 'IN')?._sum.quantity || 0;
        const totalOut = groupedByType.find((item) => item.type === 'OUT')?._sum.quantity || 0;
        const availableBalance = totalIn - totalOut;

        if (quantityNum > availableBalance) {
          throw createError(
            `Saldo insuficiente para saída. Disponível: ${availableBalance} ${material.unit}`,
            400
          );
        }
      }

      // Criar movimentação
      const movement = await prisma.stockMovement.create({
        data: {
          materialId: String(materialId),
          costCenterId: costCenterId ? String(costCenterId) : null,
          type: String(type),
          quantity: quantityNum,
          notes: notes ? String(notes).trim() : null,
          userId: req.user.id
        },
        include: {
          material: true,
          costCenter: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      if (type === 'IN' && notes) {
        const ocNum = extractOcNumberFromMovementNotes(String(notes));
        if (ocNum) {
          const invoices = parseInvoicesFromMovementNotes(String(notes));
          for (const inv of invoices) {
            if (!isValidNfNumber(inv.number)) continue;
            try {
              await purchaseOrderService.registerInvoiceNumberForOrderNumber(
                ocNum,
                String(inv.number)
              );
            } catch (err) {
              console.error('[PurchaseOrder] registerInvoiceNumber after stock IN', ocNum, err);
            }
          }
          /** Não atrasa a resposta da entrada — sync em background. */
          void Promise.all([
            stockShortfallService.syncForOrderNumber(ocNum).catch((err) => {
              console.error('[StockShortfall] syncForOrderNumber', ocNum, err);
            }),
            purchaseOrderService.syncDocumentsFromStockReceipt(ocNum).catch((err) => {
              console.error('[PurchaseOrder] syncDocumentsFromStockReceipt', ocNum, err);
            })
          ]);
        }
      }

      res.status(201).json({
        success: true,
        data: movement,
        message: `${type === 'IN' ? 'Entrada' : 'Saída'} registrada com sucesso`
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter movimentação por ID
   */
  async getMovementById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const movement = await prisma.stockMovement.findUnique({
        where: { id },
        include: {
          material: true,
          costCenter: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      if (!movement) {
        throw createError('Movimentação não encontrada', 404);
      }

      res.json({
        success: true,
        data: movement
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Excluir movimentação de estoque
   */
  async deleteMovement(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const movement = await prisma.stockMovement.findUnique({
        where: { id }
      });

      if (!movement) {
        throw createError('Movimentação não encontrada', 404);
      }

      await prisma.stockMovement.delete({
        where: { id }
      });

      if (movement.type === 'IN' && movement.notes) {
        const ocNum = extractOcNumberFromMovementNotes(movement.notes);
        if (ocNum) {
          try {
            await stockShortfallService.syncForOrderNumber(ocNum);
          } catch (err) {
            console.error('[StockShortfall] syncForOrderNumber after delete', ocNum, err);
          }
          try {
            await purchaseOrderService.syncBoletoInstallmentsFromStockReceipt(ocNum);
          } catch (err) {
            console.error(
              '[PurchaseOrder] syncBoletoInstallmentsFromStockReceipt after delete',
              ocNum,
              err
            );
          }
        }
      }

      res.json({
        success: true,
        message: 'Movimentação excluída com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Importação em lote de ajustes de estoque (marcados como [AJUSTE_ESTOQUE]).
   */
  async importAdjustments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.id) throw createError('Usuário não autenticado', 401);

      const rows = req.body?.adjustments;
      if (!Array.isArray(rows) || rows.length === 0) {
        throw createError('Envie um array "adjustments" com ao menos um item', 400);
      }

      const ADJUSTMENT_MARKER = '[AJUSTE_ESTOQUE]';
      const norm = (v: unknown) =>
        String(v ?? '')
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ');

      const [materials, costCenters] = await Promise.all([
        prisma.constructionMaterial.findMany({
          select: { id: true, name: true, unit: true, code: true },
        }),
        prisma.costCenter.findMany({
          select: { id: true, name: true, code: true },
        }),
      ]);

      const materialByName = new Map(materials.map((m) => [norm(m.name), m]));
      const materialByCode = new Map(
        materials.filter((m) => m.code).map((m) => [norm(m.code), m]),
      );
      const costCenterByName = new Map(costCenters.map((c) => [norm(c.name), c]));
      const costCenterByCode = new Map(
        costCenters.filter((c) => c.code).map((c) => [norm(c.code), c]),
      );

      const unbScope = await getUserUnbCostCenterScope(req.user.id, !!req.user.isAdmin);
      let created = 0;
      const errors: { index: number; message: string }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = (rows[i] || {}) as Record<string, unknown>;
        try {
          const materialKey = norm(row.material);
          const material =
            materialByName.get(materialKey) ||
            materialByCode.get(materialKey) ||
            materialByName.get(materialKey.replace(/^\[inativo\]\s*/, ''));
          if (!material) {
            errors.push({ index: i, message: `Material não encontrado: ${String(row.material || '').trim()}` });
            continue;
          }

          const typeRaw = String(row.type || '').toUpperCase();
          const type = typeRaw === 'IN' || typeRaw === 'OUT' ? typeRaw : '';
          if (!type) {
            errors.push({ index: i, message: 'Movimento deve ser Entrada ou Saída' });
            continue;
          }

          const quantity = parseFloat(String(row.quantity ?? '').replace(',', '.'));
          if (!Number.isFinite(quantity) || quantity <= 0) {
            errors.push({ index: i, message: 'Quantidade inválida' });
            continue;
          }

          const contratoKey = norm(row.contrato ?? row.costCenter ?? row.costCenterName);
          let costCenterId: string | null = null;
          if (contratoKey) {
            const cc = costCenterByName.get(contratoKey) || costCenterByCode.get(contratoKey);
            if (!cc) {
              errors.push({
                index: i,
                message: `Contrato não encontrado: ${String(row.contrato || row.costCenter || '').trim()}`,
              });
              continue;
            }
            costCenterId = cc.id;
            await assertCostCenterAllowedForUnbUser(req.user.id, !!req.user.isAdmin, costCenterId);
          } else if (unbScope !== null) {
            errors.push({ index: i, message: 'Informe o contrato (centro de custo UNB)' });
            continue;
          }

          if (type === 'OUT') {
            const groupedByType = await prisma.stockMovement.groupBy({
              by: ['type'],
              where: {
                materialId: material.id,
                costCenterId,
              },
              _sum: { quantity: true },
            });
            const totalIn = groupedByType.find((item) => item.type === 'IN')?._sum.quantity || 0;
            const totalOut = groupedByType.find((item) => item.type === 'OUT')?._sum.quantity || 0;
            const availableBalance = totalIn - totalOut;
            if (quantity > availableBalance) {
              errors.push({
                index: i,
                message: `Saldo insuficiente para ${material.name}. Disponível: ${availableBalance} ${material.unit}`,
              });
              continue;
            }
          }

          const extraNotes = String(row.notes ?? '').trim();
          const notes = [ADJUSTMENT_MARKER, extraNotes].filter(Boolean).join('\n');

          await prisma.stockMovement.create({
            data: {
              materialId: material.id,
              costCenterId,
              type,
              quantity,
              notes,
              userId: req.user.id,
            },
          });
          created += 1;
        } catch (err) {
          errors.push({
            index: i,
            message: err instanceof Error ? err.message : 'Erro ao importar linha',
          });
        }
      }

      res.json({
        success: true,
        data: { created, failed: errors.length, errors },
      });
    } catch (error) {
      next(error);
    }
  }
}
