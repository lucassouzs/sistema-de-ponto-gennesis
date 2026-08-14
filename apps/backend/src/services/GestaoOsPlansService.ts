import { GestaoOsPlanType, GestaoOsStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import {
  assertCanManageCadastros,
  type GestaoOsAccessContext
} from '../lib/gestaoOsAccess';
import { gestaoOsService } from './GestaoOsService';

function parsePlanType(value: unknown): GestaoOsPlanType {
  const raw = String(value ?? 'PREVENTIVE').toUpperCase();
  if (raw === 'PREVENTIVE' || raw === 'PMOC' || raw === 'SAFETY') return raw;
  throw createError('Tipo de plano inválido', 400);
}

function parseChecklistItems(value: unknown): Array<{ id: string; label: string; required?: boolean }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const label = String(row.label ?? '').trim();
      if (!label) return null;
      return {
        id: String(row.id ?? `item-${idx + 1}`),
        label,
        required: !!row.required
      };
    })
    .filter(Boolean) as Array<{ id: string; label: string; required?: boolean }>;
}

export class GestaoOsPlansService {
  async ensureDefaultSafetyChecklist(companyId?: string | null) {
    const existing = await prisma.gestaoOsChecklistTemplate.findFirst({
      where: {
        planType: 'SAFETY',
        name: 'Checklist de segurança (SST)',
        ...(companyId ? { companyId } : {})
      }
    });
    if (existing) return existing;
    return prisma.gestaoOsChecklistTemplate.create({
      data: {
        companyId: companyId || null,
        name: 'Checklist de segurança (SST)',
        planType: 'SAFETY',
        category: 'Segurança do trabalho',
        items: [
          { id: 'epi', label: 'EPIs adequados e em bom estado', required: true },
          { id: 'risco', label: 'Área isolada / riscos sinalizados', required: true },
          { id: 'energia', label: 'Energia / fluidos bloqueados (LOTO) se aplicável', required: true },
          { id: 'acesso', label: 'Acesso seguro ao equipamento', required: true },
          { id: 'residuos', label: 'Resíduos e sobras tratados ao final', required: false }
        ] as Prisma.InputJsonValue
      }
    });
  }

  async listTemplates(access: GestaoOsAccessContext, planType?: string) {
    if (access.companyId) {
      await this.ensureDefaultSafetyChecklist(access.companyId);
    }
    return prisma.gestaoOsChecklistTemplate.findMany({
      where: {
        isActive: true,
        ...(access.companyId ? { OR: [{ companyId: access.companyId }, { companyId: null }] } : {}),
        ...(planType ? { planType: parsePlanType(planType) } : {})
      },
      orderBy: { name: 'asc' }
    });
  }

  async createTemplate(
    access: GestaoOsAccessContext,
    body: Record<string, unknown>
  ) {
    assertCanManageCadastros(access);
    const name = String(body.name ?? '').trim();
    if (!name) throw createError('Nome do checklist é obrigatório', 400);
    const items = parseChecklistItems(body.items);
    if (!items.length) throw createError('Informe ao menos um item no checklist', 400);

    return prisma.gestaoOsChecklistTemplate.create({
      data: {
        companyId: access.companyId,
        name,
        planType: parsePlanType(body.planType),
        category: body.category ? String(body.category).trim() : null,
        items: items as Prisma.InputJsonValue
      }
    });
  }

  async listPlans(access: GestaoOsAccessContext, opts?: { planType?: string }) {
    return prisma.gestaoOsMaintenancePlan.findMany({
      where: {
        ...(opts?.planType ? { planType: parsePlanType(opts.planType) } : {})
      },
      include: {
        building: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true, category: true } },
        checklist: { select: { id: true, name: true, items: true } },
        assignee: { select: { id: true, name: true } },
        runs: { orderBy: { generatedAt: 'desc' }, take: 5 }
      },
      orderBy: [{ nextDueAt: 'asc' }, { name: 'asc' }]
    });
  }

  async createPlan(access: GestaoOsAccessContext, body: Record<string, unknown>) {
    assertCanManageCadastros(access);
    let companyId =
      access.companyId || (typeof body.companyId === 'string' ? body.companyId : null);
    if (!companyId) {
      const first = await prisma.gestaoOsCompany.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' }
      });
      companyId = first?.id ?? null;
    }
    if (!companyId) {
      throw createError('Cadastre uma empresa em Cadastros da Gestão de OS antes de criar planos', 400);
    }
    const name = String(body.name ?? '').trim();
    if (!name) throw createError('Nome do plano é obrigatório', 400);
    const nextDueAt = body.nextDueAt ? new Date(String(body.nextDueAt)) : new Date();
    if (Number.isNaN(nextDueAt.getTime())) throw createError('Data de vencimento inválida', 400);
    const intervalDays = Math.max(1, Number(body.intervalDays ?? 30) || 30);

    return prisma.gestaoOsMaintenancePlan.create({
      data: {
        companyId,
        name,
        planType: parsePlanType(body.planType),
        description: body.description ? String(body.description).trim() : null,
        category: body.category ? String(body.category).trim() : null,
        buildingId: body.buildingId ? String(body.buildingId) : null,
        assetId: body.assetId ? String(body.assetId) : null,
        checklistId: body.checklistId ? String(body.checklistId) : null,
        intervalDays,
        nextDueAt,
        assigneeId: body.assigneeId ? String(body.assigneeId) : null,
        isActive: body.isActive === false ? false : true
      },
      include: {
        building: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true } },
        checklist: true
      }
    });
  }

  async updatePlan(access: GestaoOsAccessContext, id: string, body: Record<string, unknown>) {
    assertCanManageCadastros(access);
    const current = await prisma.gestaoOsMaintenancePlan.findUnique({ where: { id } });
    if (!current) throw createError('Plano não encontrado', 404);
    const data: Prisma.GestaoOsMaintenancePlanUpdateInput = {};
    if (body.name != null) data.name = String(body.name).trim();
    if (body.planType != null) data.planType = parsePlanType(body.planType);
    if (body.description !== undefined) {
      data.description = body.description ? String(body.description).trim() : null;
    }
    if (body.category !== undefined) {
      data.category = body.category ? String(body.category).trim() : null;
    }
    if (body.buildingId !== undefined) {
      data.building = body.buildingId
        ? { connect: { id: String(body.buildingId) } }
        : { disconnect: true };
    }
    if (body.assetId !== undefined) {
      data.asset = body.assetId ? { connect: { id: String(body.assetId) } } : { disconnect: true };
    }
    if (body.checklistId !== undefined) {
      data.checklist = body.checklistId
        ? { connect: { id: String(body.checklistId) } }
        : { disconnect: true };
    }
    if (body.intervalDays != null) data.intervalDays = Math.max(1, Number(body.intervalDays) || 30);
    if (body.nextDueAt != null) {
      const d = new Date(String(body.nextDueAt));
      if (Number.isNaN(d.getTime())) throw createError('Data inválida', 400);
      data.nextDueAt = d;
    }
    if (body.assigneeId !== undefined) {
      data.assignee = body.assigneeId
        ? { connect: { id: String(body.assigneeId) } }
        : { disconnect: true };
    }
    if (body.isActive != null) data.isActive = !!body.isActive;

    return prisma.gestaoOsMaintenancePlan.update({
      where: { id },
      data,
      include: {
        building: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true } },
        checklist: true
      }
    });
  }

  async deletePlan(access: GestaoOsAccessContext, id: string) {
    assertCanManageCadastros(access);
    const current = await prisma.gestaoOsMaintenancePlan.findUnique({ where: { id } });
    if (!current) throw createError('Plano não encontrado', 404);
    await prisma.gestaoOsMaintenancePlan.delete({ where: { id } });
    return { id };
  }

  /** Gera OS para planos vencidos (nextDueAt <= now). */
  async generateDuePlans(access?: GestaoOsAccessContext | null) {
    const now = new Date();
    const duePlans = await prisma.gestaoOsMaintenancePlan.findMany({
      where: {
        isActive: true,
        nextDueAt: { lte: now },
        ...(access?.companyId ? { companyId: access.companyId } : {})
      },
      include: { checklist: true, asset: true, building: true }
    });

    const created: string[] = [];
    for (const plan of duePlans) {
      const systemUserId = plan.assigneeId;
      let requesterId = systemUserId;
      if (!requesterId) {
        const manager = await prisma.gestaoOsMembership.findFirst({
          where: { companyId: plan.companyId, isActive: true, profile: { in: ['MANAGER', 'ADMIN'] } },
          select: { userId: true }
        });
        requesterId = manager?.userId ?? null;
      }
      if (!requesterId) continue;

      const checklistItems = Array.isArray(plan.checklist?.items)
        ? (plan.checklist!.items as Array<{ id: string; label: string }>).map((i) => ({
            id: i.id || randomUUID(),
            label: i.label,
            checked: false
          }))
        : [];

      const maintenanceType =
        plan.planType === 'PMOC' || plan.planType === 'PREVENTIVE' ? 'PREVENTIVE' : 'CORRECTIVE';

      const wo = await gestaoOsService.create(
        {
          requesterId,
          companyId: plan.companyId,
          category: plan.category || (plan.planType === 'PMOC' ? 'Ar-condicionado / Climatização' : 'Preventiva'),
          description: `[${plan.planType}] ${plan.name}${plan.description ? ` — ${plan.description}` : ''}`,
          priority: 'MEDIUM',
          buildingId: plan.buildingId,
          assetId: plan.assetId,
          dueAt: plan.nextDueAt.toISOString(),
          maintenanceType
        },
        {
          userId: requesterId,
          isAdmin: true,
          canAnalisar: true,
          canExecutar: true,
          canEncerrar: true,
          canCadastros: true,
          canMeusChamados: true,
          canViewAll: true,
          memberships: [],
          companyId: plan.companyId,
          profile: null
        }
      );

      if (checklistItems.length) {
        await prisma.gestaoOsWorkOrder.update({
          where: { id: wo.id },
          data: {
            checklistResponses: checklistItems as Prisma.InputJsonValue,
            assigneeId: plan.assigneeId,
            status: GestaoOsStatus.APPROVED,
            approvedAt: now,
            maintenanceType
          }
        });
      } else if (plan.assigneeId) {
        await prisma.gestaoOsWorkOrder.update({
          where: { id: wo.id },
          data: {
            assigneeId: plan.assigneeId,
            status: GestaoOsStatus.APPROVED,
            approvedAt: now,
            maintenanceType
          }
        });
      }

      await prisma.gestaoOsPlanRun.create({
        data: {
          planId: plan.id,
          workOrderId: wo.id,
          dueAt: plan.nextDueAt
        }
      });

      const next = new Date(plan.nextDueAt);
      next.setDate(next.getDate() + plan.intervalDays);
      await prisma.gestaoOsMaintenancePlan.update({
        where: { id: plan.id },
        data: { nextDueAt: next, lastGeneratedAt: now }
      });
      created.push(wo.id);
    }

    return { generated: created.length, workOrderIds: created };
  }

  async pmocOverview(access: GestaoOsAccessContext) {
    const plans = await this.listPlans(access, { planType: 'PMOC' });
    const now = new Date();
    const dueSoon = plans.filter((p) => {
      const diff = p.nextDueAt.getTime() - now.getTime();
      return p.isActive && diff <= 1000 * 60 * 60 * 24 * 30;
    });
    const assets = await prisma.gestaoOsAsset.findMany({
      where: {
        isActive: true,
        category: { contains: 'Climat', mode: 'insensitive' }
      },
      include: {
        place: {
          include: {
            sector: { include: { building: { select: { id: true, name: true } } } }
          }
        }
      },
      take: 200
    });
    return {
      plans,
      dueSoonCount: dueSoon.length,
      climateAssets: assets.map((a) => ({
        id: a.id,
        name: a.name,
        category: a.category,
        building: a.place.sector.building,
        placeName: a.place.name
      }))
    };
  }
}

export const gestaoOsPlansService = new GestaoOsPlansService();
