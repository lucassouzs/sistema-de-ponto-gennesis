import { GestaoOsStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import {
  type GestaoOsAccessContext,
  workOrderVisibilityWhere
} from '../lib/gestaoOsAccess';
import { computeSlaMeta, isOpenGestaoOsStatus } from '../lib/gestaoOsSla';
import { parsePartsLoose, partsTotalCost } from '../lib/gestaoOsParts';
import { liveExecutionMs } from '../lib/gestaoOsExecution';
import { loadAssetWarrantyMap } from '../lib/gestaoOsChecklistCopy';
import { isAssignableGestaoOsTechnician } from '../lib/gestaoOsTechnicians';

const OPEN: GestaoOsStatus[] = [
  'OPEN',
  'UNDER_REVIEW',
  'APPROVED',
  'SAFETY_CHECK',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'REWORK'
];

type ExtrasRow = {
  id: string;
  slaHoursApplied: number | null;
  slaWarnedAt: Date | null;
  parts: unknown;
  relatedWorkOrderId: string | null;
  startPhotoUrl: string | null;
  endPhotoUrl: string | null;
  executionMs: number | null;
  lastExecutionResumeAt: Date | null;
};

export async function loadWorkOrderExtras(
  ids: string[]
): Promise<Map<string, ExtrasRow>> {
  const map = new Map<string, ExtrasRow>();
  if (!ids.length) return map;
  const found = await prisma.$queryRawUnsafe<ExtrasRow[]>(
    `SELECT "id", "slaHoursApplied", "slaWarnedAt", "parts", "relatedWorkOrderId", "startPhotoUrl", "endPhotoUrl",
            COALESCE("executionMs", 0) AS "executionMs", "lastExecutionResumeAt"
     FROM "gestao_os_work_orders"
     WHERE "id" IN (${ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')})`
  );
  for (const row of found) map.set(row.id, row);
  return map;
}

export async function loadOsNumbers(ids: string[]): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  if (!ids.length) return map;
  const found = await prisma.$queryRawUnsafe<{ id: string; osNumber: number | null }[]>(
    `SELECT "id", "osNumber" FROM "gestao_os_work_orders" WHERE "id" IN (${ids
      .map((id) => `'${id.replace(/'/g, "''")}'`)
      .join(',')})`
  );
  for (const row of found) map.set(row.id, row.osNumber);
  return map;
}

export function enrichWorkOrderWithExtras<T extends { id: string; status: GestaoOsStatus; dueAt?: Date | string | null }>(
  row: T,
  extras?: ExtrasRow | null
) {
  const parts = extras?.parts != null ? parsePartsLoose(extras.parts) : [];
  const sla = computeSlaMeta({
    dueAt: row.dueAt,
    slaHoursApplied: extras?.slaHoursApplied ?? null,
    status: row.status
  });
  return {
    ...row,
    slaHoursApplied: extras?.slaHoursApplied ?? null,
    slaWarnedAt: extras?.slaWarnedAt ? extras.slaWarnedAt.toISOString() : null,
    parts,
    partsTotalCost: partsTotalCost(parts),
    relatedWorkOrderId: extras?.relatedWorkOrderId ?? null,
    startPhotoUrl: extras?.startPhotoUrl ?? null,
    endPhotoUrl: extras?.endPhotoUrl ?? null,
    executionMs: extras?.executionMs ?? 0,
    lastExecutionResumeAt: extras?.lastExecutionResumeAt
      ? extras.lastExecutionResumeAt.toISOString()
      : null,
    slaOverdue: sla.overdue,
    slaWarning: sla.warning,
    slaRemainingMs: sla.remainingMs
  };
}

export class GestaoOsOpsService {
  async technicianWorkload(access: GestaoOsAccessContext) {
    const visibility = workOrderVisibilityWhere(access) as Prisma.GestaoOsWorkOrderWhereInput;
    const openRows = await prisma.gestaoOsWorkOrder.findMany({
      where: { ...visibility, status: { in: OPEN }, assigneeId: { not: null } },
      select: {
        id: true,
        assigneeId: true,
        status: true,
        priority: true,
        buildingId: true,
        category: true,
        dueAt: true,
        displayNumber: true,
        startedAt: true
      }
    });
    const extras = await loadWorkOrderExtras(openRows.map((r) => r.id));
    const byTech = new Map<
      string,
      {
        assigneeId: string;
        openCount: number;
        overdueCount: number;
        warningCount: number;
        openExecutionMs: number;
        byBuilding: Record<string, number>;
        byCategory: Record<string, number>;
      }
    >();

    for (const row of openRows) {
      const aid = row.assigneeId!;
      let bucket = byTech.get(aid);
      if (!bucket) {
        bucket = {
          assigneeId: aid,
          openCount: 0,
          overdueCount: 0,
          warningCount: 0,
          openExecutionMs: 0,
          byBuilding: {},
          byCategory: {}
        };
        byTech.set(aid, bucket);
      }
      bucket.openCount += 1;
      const meta = enrichWorkOrderWithExtras(row, extras.get(row.id));
      bucket.openExecutionMs += liveExecutionMs({
        status: row.status,
        executionMs: meta.executionMs,
        lastExecutionResumeAt: meta.lastExecutionResumeAt,
        startedAt: row.startedAt
      });
      if (meta.slaOverdue) bucket.overdueCount += 1;
      else if (meta.slaWarning) bucket.warningCount += 1;
      if (row.buildingId) {
        bucket.byBuilding[row.buildingId] = (bucket.byBuilding[row.buildingId] ?? 0) + 1;
      }
      if (row.category) {
        bucket.byCategory[row.category] = (bucket.byCategory[row.category] ?? 0) + 1;
      }
    }

    const ids = [...byTech.keys()];
    const users = ids.length
      ? await prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, email: true }
        })
      : [];
    const nameMap = new Map(users.map((u) => [u.id, u]));

    return [...byTech.values()]
      .map((b) => ({
        ...b,
        openHours: Math.round((b.openExecutionMs / (1000 * 60 * 60)) * 10) / 10,
        name: nameMap.get(b.assigneeId)?.name || '—',
        email: nameMap.get(b.assigneeId)?.email || null
      }))
      .sort((a, b) => b.openCount - a.openCount || b.overdueCount - a.overdueCount);
  }

  /** Sugere técnico com menor carga aberta; prioriza quem já atende o mesmo prédio. */
  async suggestAssignee(
    access: GestaoOsAccessContext,
    input: { buildingId?: string | null; category?: string | null }
  ) {
    const workload = await this.technicianWorkload(access);
    const technicians = await prisma.user.findMany({
      where: { isActive: true, employee: { isNot: null } },
      select: { id: true, name: true, email: true, employee: { select: { position: true } } },
      take: 300
    });
    const eligible = technicians.filter(isAssignableGestaoOsTechnician);
    if (!eligible.length) return null;

    const loadMap = new Map(workload.map((w) => [w.assigneeId, w]));
    const scored = eligible.map((t) => {
      const load = loadMap.get(t.id);
      const openCount = load?.openCount ?? 0;
      const buildingBoost =
        input.buildingId && load?.byBuilding[input.buildingId]
          ? -1.5
          : 0;
      const categoryBoost =
        input.category && load?.byCategory[input.category] ? -0.5 : 0;
      return {
        id: t.id,
        name: t.name,
        email: t.email,
        openCount,
        score: openCount + buildingBoost + categoryBoost
      };
    });
    scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
    return scored[0] ?? null;
  }

  async assetHistory(access: GestaoOsAccessContext, assetId: string) {
    if (!assetId) throw createError('Ativo inválido', 400);
    const visibility = workOrderVisibilityWhere(access) as Prisma.GestaoOsWorkOrderWhereInput;
    const asset = await prisma.gestaoOsAsset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, category: true, code: true }
    });
    if (!asset) throw createError('Ativo não encontrado', 404);
    const warrantyMap = await loadAssetWarrantyMap([assetId]);
    const warrantyEndsAt = warrantyMap.get(assetId) ?? null;

    const rows = await prisma.gestaoOsWorkOrder.findMany({
      where: { ...visibility, assetId },
      orderBy: { openedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        displayNumber: true,
        status: true,
        priority: true,
        maintenanceType: true,
        category: true,
        description: true,
        openedAt: true,
        completedAt: true,
        closedAt: true,
        dueAt: true
      }
    });
    const osMap = await loadOsNumbers(rows.map((r) => r.id));

    const corrective = rows.filter(
      (r) => r.maintenanceType === 'CORRECTIVE' || r.maintenanceType == null
    );
    const preventive = rows.filter((r) => r.maintenanceType === 'PREVENTIVE');
    const lastPreventive = preventive[0] ?? null;

    const failureDates = corrective
      .map((r) => r.openedAt.getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);

    let mtbfHours: number | null = null;
    if (failureDates.length >= 2) {
      let total = 0;
      for (let i = 1; i < failureDates.length; i++) {
        total += failureDates[i]! - failureDates[i - 1]!;
      }
      mtbfHours =
        Math.round((total / (failureDates.length - 1) / (1000 * 60 * 60)) * 10) / 10;
    }

    const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const recurrence90dCount = rows.filter(
      (r) => r.openedAt.getTime() >= since90d.getTime() && r.status !== 'CANCELLED'
    ).length;

    return {
      asset: {
        ...asset,
        warrantyEndsAt: warrantyEndsAt ? warrantyEndsAt.toISOString() : null
      },
      totalOrders: rows.length,
      recurrence90dCount,
      correctiveCount: corrective.length,
      preventiveCount: preventive.length,
      openCount: rows.filter((r) => isOpenGestaoOsStatus(r.status)).length,
      lastPreventive: lastPreventive
        ? {
            id: lastPreventive.id,
            displayNumber: lastPreventive.displayNumber,
            osNumber: osMap.get(lastPreventive.id) ?? null,
            openedAt: lastPreventive.openedAt.toISOString(),
            completedAt: lastPreventive.completedAt?.toISOString() ?? null
          }
        : null,
      mtbfHours,
      recent: rows.slice(0, 20).map((r) => ({
        id: r.id,
        displayNumber: r.displayNumber,
        osNumber: osMap.get(r.id) ?? null,
        status: r.status,
        priority: r.priority,
        maintenanceType: r.maintenanceType,
        category: r.category,
        description: r.description,
        openedAt: r.openedAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null
      }))
    };
  }

  async planCompliance(access: GestaoOsAccessContext) {
    const companyFilter = access.companyId ? { companyId: access.companyId } : {};
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const plans = await prisma.gestaoOsMaintenancePlan.findMany({
      where: { ...companyFilter, isActive: true },
      select: {
        id: true,
        name: true,
        planType: true,
        nextDueAt: true,
        intervalDays: true,
        lastGeneratedAt: true,
        buildingId: true,
        assetId: true
      },
      orderBy: { nextDueAt: 'asc' }
    });

    const overdue = plans.filter((p) => p.nextDueAt.getTime() < now.getTime());
    const due7 = plans.filter(
      (p) => p.nextDueAt.getTime() >= now.getTime() && p.nextDueAt.getTime() <= in7.getTime()
    );
    const due30 = plans.filter(
      (p) => p.nextDueAt.getTime() > in7.getTime() && p.nextDueAt.getTime() <= in30.getTime()
    );
    const onTrack = plans.filter((p) => p.nextDueAt.getTime() > in30.getTime());

    const total = plans.length || 1;
    const compliancePct = Math.round((onTrack.length / total) * 1000) / 10;

    return {
      summary: {
        total: plans.length,
        overdue: overdue.length,
        dueIn7Days: due7.length,
        dueIn30Days: due30.length,
        onTrack: onTrack.length,
        compliancePct: plans.length ? compliancePct : 100
      },
      plans: plans.map((p) => {
        const ms = p.nextDueAt.getTime() - now.getTime();
        let bucket: 'overdue' | 'due7' | 'due30' | 'onTrack' = 'onTrack';
        if (ms < 0) bucket = 'overdue';
        else if (p.nextDueAt <= in7) bucket = 'due7';
        else if (p.nextDueAt <= in30) bucket = 'due30';
        return {
          id: p.id,
          name: p.name,
          planType: p.planType,
          nextDueAt: p.nextDueAt.toISOString(),
          intervalDays: p.intervalDays,
          lastGeneratedAt: p.lastGeneratedAt?.toISOString() ?? null,
          buildingId: p.buildingId,
          assetId: p.assetId,
          bucket
        };
      })
    };
  }

  /** Itens da Agenda: OS com prazo (SLA) + planos de manutenção. */
  async agenda(
    access: GestaoOsAccessContext,
    input: { from: Date; to: Date; ownerUserId?: string | null }
  ) {
    const from = input.from;
    const to = input.to;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw createError('Período inválido', 400);
    }
    const ownerId = input.ownerUserId || access.userId;
    const visibility = workOrderVisibilityWhere(access) as Prisma.GestaoOsWorkOrderWhereInput;
    const viewingOther = ownerId !== access.userId;

    const personFilter: Prisma.GestaoOsWorkOrderWhereInput = viewingOther
      ? { assigneeId: ownerId }
      : {
          OR: [{ requesterId: ownerId }, { assigneeId: ownerId }]
        };

    const woRows = await prisma.gestaoOsWorkOrder.findMany({
      where: {
        ...visibility,
        ...personFilter,
        status: { in: OPEN },
        dueAt: { gte: from, lte: to }
      },
      select: {
        id: true,
        displayNumber: true,
        status: true,
        category: true,
        locationLabel: true,
        dueAt: true,
        assigneeId: true,
        requesterId: true,
        priority: true
      },
      orderBy: { dueAt: 'asc' },
      take: 400
    });
    const osMap = await loadOsNumbers(woRows.map((r) => r.id));
    const extras = await loadWorkOrderExtras(woRows.map((r) => r.id));

    const workOrders = woRows.map((row) => {
      const osNumber = osMap.get(row.id) ?? null;
      const meta = enrichWorkOrderWithExtras(row, extras.get(row.id));
      const start = row.dueAt ? new Date(row.dueAt) : from;
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const title =
        osNumber != null
          ? `OS #${osNumber} · ${row.category}`
          : `Chamado #${row.displayNumber} · ${row.category}`;
      const href = access.canViewAll
        ? `/ponto/sistema-gestao-os?id=${row.id}`
        : `/ponto/meus-chamados?id=${row.id}`;
      return {
        id: `wo:${row.id}`,
        kind: 'work_order' as const,
        workOrderId: row.id,
        title,
        description: [row.locationLabel, meta.slaOverdue ? 'Atrasada' : meta.slaWarning ? 'No prazo em risco' : null]
          .filter(Boolean)
          .join(' · '),
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        color: meta.slaOverdue ? '#EF4444' : meta.slaWarning ? '#F59E0B' : '#DC2626',
        href,
        overdue: meta.slaOverdue
      };
    });

    const planItems: Array<{
      id: string;
      kind: 'plan';
      planId: string;
      title: string;
      description: string;
      startAt: string;
      endAt: string;
      color: string;
      href: string;
      overdue: boolean;
    }> = [];

    const companyFilter = access.companyId ? { companyId: access.companyId } : {};
    const plans = await prisma.gestaoOsMaintenancePlan.findMany({
      where: {
        ...companyFilter,
        isActive: true,
        nextDueAt: { gte: from, lte: to }
      },
      select: {
        id: true,
        name: true,
        planType: true,
        nextDueAt: true,
        scheduledTime: true,
        technicianIds: true,
        assigneeId: true
      },
      orderBy: { nextDueAt: 'asc' },
      take: 400
    });

    const typeColor: Record<string, string> = {
      PREVENTIVE: '#22C55E',
      PMOC: '#06B6D4',
      SAFETY: '#A855F7'
    };
    const typeLabel: Record<string, string> = {
      PREVENTIVE: 'Preventiva',
      PMOC: 'PMOC',
      SAFETY: 'SST'
    };

    const seeAllPlans = access.isAdmin || access.canAnalisar || access.canCadastros;

    for (const plan of plans) {
      const ids = Array.isArray(plan.technicianIds)
        ? (plan.technicianIds as unknown[]).map((x) => String(x))
        : [];
      const assigned = plan.assigneeId === ownerId || ids.includes(ownerId);
      if (viewingOther || !seeAllPlans) {
        if (!assigned) continue;
      }
      let start = new Date(plan.nextDueAt);
      const hm = String(plan.scheduledTime || '').trim();
      if (/^\d{2}:\d{2}$/.test(hm)) {
        const [h, m] = hm.split(':').map(Number);
        start.setHours(h, m, 0, 0);
      }
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      planItems.push({
        id: `plan:${plan.id}`,
        kind: 'plan',
        planId: plan.id,
        title: `${typeLabel[plan.planType] || 'Plano'} · ${plan.name}`,
        description: 'Plano de manutenção',
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        color: typeColor[plan.planType] || '#22C55E',
        href: access.canViewAll ? `/ponto/sistema-gestao-os/planos?plan=${plan.id}` : '',
        overdue: start.getTime() < Date.now()
      });
    }

    return [...workOrders, ...planItems].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
  }

  /** Sino in-app: OS atribuídas, SLA no fim do prazo, planos vencidos e garantias. */
  async inbox(access: GestaoOsAccessContext) {
    const visibility = workOrderVisibilityWhere(access) as Prisma.GestaoOsWorkOrderWhereInput;
    const now = new Date();
    const assigned = await prisma.gestaoOsWorkOrder.findMany({
      where: {
        ...visibility,
        assigneeId: access.userId,
        status: { in: OPEN }
      },
      select: {
        id: true,
        displayNumber: true,
        status: true,
        dueAt: true,
        category: true,
        locationLabel: true
      },
      orderBy: { openedAt: 'desc' },
      take: 80
    });
    const extras = await loadWorkOrderExtras(assigned.map((r) => r.id));
    const osMap = await loadOsNumbers(assigned.map((r) => r.id));

    const slaRows =
      access.canAnalisar || access.canViewAll
        ? await prisma.gestaoOsWorkOrder.findMany({
            where: { ...visibility, status: { in: OPEN }, dueAt: { not: null } },
            select: { id: true, status: true, dueAt: true },
            take: 400
          })
        : assigned;
    const slaExtras =
      slaRows === assigned ? extras : await loadWorkOrderExtras(slaRows.map((r) => r.id));
    let slaOverdueCount = 0;
    let slaWarningCount = 0;
    for (const row of slaRows) {
      const meta = enrichWorkOrderWithExtras(row, slaExtras.get(row.id));
      if (meta.slaOverdue) slaOverdueCount += 1;
      else if (meta.slaWarning) slaWarningCount += 1;
    }

    let overduePlansCount = 0;
    let warrantyExpiringCount = 0;
    let warrantyExpiredCount = 0;
    const canSeeOps = access.canAnalisar || access.canCadastros || access.canViewAll;
    if (canSeeOps) {
      overduePlansCount = await prisma.gestaoOsMaintenancePlan.count({
        where: {
          isActive: true,
          nextDueAt: { lte: now },
          ...(access.companyId ? { companyId: access.companyId } : {})
        }
      });
      const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      try {
        const warranties = await prisma.$queryRawUnsafe<
          { expired: bigint; expiring: bigint }[]
        >(
          `SELECT
             COUNT(*) FILTER (WHERE "warrantyEndsAt" < NOW())::bigint AS expired,
             COUNT(*) FILTER (WHERE "warrantyEndsAt" >= NOW() AND "warrantyEndsAt" <= '${horizon.toISOString()}'::timestamp)::bigint AS expiring
           FROM "gestao_os_assets"
           WHERE "isActive" = true AND "warrantyEndsAt" IS NOT NULL`
        );
        warrantyExpiredCount = Number(warranties[0]?.expired ?? 0);
        warrantyExpiringCount = Number(warranties[0]?.expiring ?? 0);
      } catch {
        warrantyExpiredCount = 0;
        warrantyExpiringCount = 0;
      }
    }

    return {
      assignedCount: assigned.length,
      slaOverdueCount,
      slaWarningCount,
      overduePlansCount,
      warrantyExpiringCount,
      warrantyExpiredCount,
      preview: assigned.slice(0, 5).map((row) => ({
        id: row.id,
        displayNumber: row.displayNumber,
        osNumber: osMap.get(row.id) ?? null,
        category: row.category,
        locationLabel: row.locationLabel
      }))
    };
  }

  /** Marca e lista OS próximas do estouro / atrasadas para alerta. */
  async scanSlaAlerts(access: GestaoOsAccessContext) {
    const visibility = workOrderVisibilityWhere(access) as Prisma.GestaoOsWorkOrderWhereInput;
    const rows = await prisma.gestaoOsWorkOrder.findMany({
      where: {
        ...visibility,
        status: { in: OPEN },
        dueAt: { not: null }
      },
      select: {
        id: true,
        displayNumber: true,
        status: true,
        dueAt: true,
        category: true,
        locationLabel: true,
        priority: true,
        requesterId: true,
        assigneeId: true,
        requester: { select: { email: true, name: true } },
        assignee: { select: { email: true, name: true } }
      },
      take: 500
    });
    const extras = await loadWorkOrderExtras(rows.map((r) => r.id));
    const osMap = await loadOsNumbers(rows.map((r) => r.id));
    const warnings: Array<{ id: string; kind: 'warning' | 'overdue' }> = [];
    const toWarn: Array<(typeof rows)[number] & { osNumber: number | null }> = [];

    for (const row of rows) {
      const ex = extras.get(row.id);
      const meta = enrichWorkOrderWithExtras(row, ex);
      if (meta.slaOverdue) {
        warnings.push({ id: row.id, kind: 'overdue' });
        if (!ex?.slaWarnedAt) toWarn.push({ ...row, osNumber: osMap.get(row.id) ?? null });
      } else if (meta.slaWarning) {
        warnings.push({ id: row.id, kind: 'warning' });
        if (!ex?.slaWarnedAt) toWarn.push({ ...row, osNumber: osMap.get(row.id) ?? null });
      }
    }

    return { warnings, pendingNotify: toWarn, extras };
  }
}

export const gestaoOsOpsService = new GestaoOsOpsService();
