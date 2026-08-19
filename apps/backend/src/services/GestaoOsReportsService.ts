import { GestaoOsStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  type GestaoOsAccessContext,
  workOrderVisibilityWhere
} from '../lib/gestaoOsAccess';
import { liveExecutionMs } from '../lib/gestaoOsExecution';
import { parsePartsLoose } from '../lib/gestaoOsParts';
import { loadWorkOrderExtras } from './GestaoOsOpsService';

export type GestaoOsReportFilters = {
  from?: Date | null;
  to?: Date | null;
  buildingId?: string | null;
  origin?: string | null;
  assigneeId?: string | null;
  teamUserId?: string | null;
  unitPortal?: boolean;
};

function applyReportFilters(
  visibility: ReturnType<typeof workOrderVisibilityWhere>,
  filters: GestaoOsReportFilters,
  unitIds?: string[]
): Record<string, unknown> {
  const where: Record<string, unknown> = { ...visibility };
  const openedAt: Record<string, Date> = {};
  if (filters.from) openedAt.gte = filters.from;
  if (filters.to) openedAt.lte = filters.to;
  if (Object.keys(openedAt).length) where.openedAt = openedAt;
  if (filters.buildingId) where.buildingId = filters.buildingId;
  if (filters.origin) where.origin = filters.origin;
  if (filters.assigneeId) where.assigneeId = filters.assigneeId;
  if (filters.teamUserId) {
    where.OR = [
      { assigneeId: filters.teamUserId },
      { teamUserIds: { array_contains: [filters.teamUserId] } }
    ];
  }
  if (filters.unitPortal && unitIds) {
    if (!unitIds.length) where.id = { in: [] };
    else if (filters.buildingId && unitIds.includes(filters.buildingId)) {
      where.buildingId = filters.buildingId;
    } else {
      where.buildingId = { in: unitIds };
    }
  }
  return where;
}

export class GestaoOsReportsService {
  async summary(access: GestaoOsAccessContext, filters: GestaoOsReportFilters = {}) {
    const { loadUnitBuildingIds } = await import('../lib/gestaoOsEdital');
    const unitIds = filters.unitPortal ? await loadUnitBuildingIds(access.userId) : undefined;
    const visibility = applyReportFilters(
      workOrderVisibilityWhere(access),
      filters,
      unitIds
    ) as ReturnType<typeof workOrderVisibilityWhere>;

    const openStatuses: GestaoOsStatus[] = [
      'OPEN',
      'UNDER_REVIEW',
      'APPROVED',
      'SAFETY_CHECK',
      'IN_PROGRESS',
      'WAITING_PARTS',
      'REWORK'
    ];

    const [byStatus, overdue, completed, byCategory, byBuilding, byAssignee] = await Promise.all([
      prisma.gestaoOsWorkOrder.groupBy({
        by: ['status'],
        where: visibility,
        _count: { _all: true }
      }),
      prisma.gestaoOsWorkOrder.count({
        where: {
          ...visibility,
          dueAt: { lt: new Date() },
          status: { in: openStatuses }
        }
      }),
      prisma.gestaoOsWorkOrder.findMany({
        where: {
          ...visibility,
          status: { in: ['COMPLETED', 'CLOSED'] },
          OR: [{ startedAt: { not: null } }, { completedAt: { not: null } }]
        },
        select: { id: true, startedAt: true, completedAt: true, status: true },
        take: 2000
      }),
      prisma.gestaoOsWorkOrder.groupBy({
        by: ['category'],
        where: visibility,
        _count: { _all: true },
        orderBy: { _count: { category: 'desc' } },
        take: 20
      }),
      prisma.gestaoOsWorkOrder.groupBy({
        by: ['buildingId'],
        where: { ...visibility, buildingId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { buildingId: 'desc' } },
        take: 20
      }),
      prisma.gestaoOsWorkOrder.groupBy({
        by: ['assigneeId'],
        where: { ...visibility, assigneeId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { assigneeId: 'desc' } },
        take: 20
      })
    ]);

    let mttrHours: number | null = null;
    if (completed.length) {
      const extras = await loadWorkOrderExtras(completed.map((r) => r.id));
      const durations = completed
        .map((row) => {
          const ex = extras.get(row.id);
          return liveExecutionMs({
            status: row.status,
            executionMs: ex?.executionMs,
            lastExecutionResumeAt: ex?.lastExecutionResumeAt,
            startedAt: row.startedAt,
            completedAt: row.completedAt
          });
        })
        .filter((ms) => ms > 0);
      if (durations.length) {
        const totalMs = durations.reduce((sum, ms) => sum + ms, 0);
        mttrHours = Math.round((totalMs / durations.length / (1000 * 60 * 60)) * 10) / 10;
      }
    }

    const buildingIds = byBuilding.map((b) => b.buildingId!).filter(Boolean);
    const assigneeIds = byAssignee.map((a) => a.assigneeId!).filter(Boolean);
    const [buildings, users] = await Promise.all([
      buildingIds.length
        ? prisma.gestaoOsBuilding.findMany({
            where: { id: { in: buildingIds } },
            select: { id: true, name: true }
          })
        : Promise.resolve([]),
      assigneeIds.length
        ? prisma.user.findMany({
            where: { id: { in: assigneeIds } },
            select: { id: true, name: true }
          })
        : Promise.resolve([])
    ]);
    const buildingMap = new Map(buildings.map((b) => [b.id, b.name]));
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const backlog = byStatus.reduce((s, g) => s + g._count._all, 0);
    const openLike = byStatus
      .filter((g) => openStatuses.includes(g.status))
      .reduce((s, g) => s + g._count._all, 0);

    return {
      backlog,
      openLike,
      overdue,
      mttrHours,
      resolved: byStatus
        .filter((g) => g.status === 'COMPLETED' || g.status === 'CLOSED')
        .reduce((s, g) => s + g._count._all, 0),
      pending: openLike,
      byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
      byCategory: byCategory.map((g) => ({ category: g.category, count: g._count._all })),
      byBuilding: byBuilding.map((g) => ({
        buildingId: g.buildingId,
        name: buildingMap.get(g.buildingId!) || '—',
        count: g._count._all
      })),
      byTechnician: byAssignee.map((g) => ({
        assigneeId: g.assigneeId,
        name: userMap.get(g.assigneeId!) || '—',
        count: g._count._all
      })),
      monthlyByCategory: await this.monthlyByCategory(visibility),
      materials: await this.materialsSummary(visibility),
      pendencias: await this.pendencias(visibility)
    };
  }

  private async monthlyByCategory(visibility: ReturnType<typeof workOrderVisibilityWhere>) {
    const rows = await prisma.gestaoOsWorkOrder.findMany({
      where: visibility,
      select: { category: true, openedAt: true },
      take: 8000
    });
    const map = new Map<string, Record<string, number>>();
    for (const row of rows) {
      const month = row.openedAt.toISOString().slice(0, 7);
      const cur = map.get(month) || {};
      cur[row.category] = (cur[row.category] || 0) + 1;
      map.set(month, cur);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, byCategory]) => ({
        month,
        total: Object.values(byCategory).reduce((s, n) => s + n, 0),
        byCategory: Object.entries(byCategory).map(([category, count]) => ({ category, count }))
      }));
  }

  private async materialsSummary(visibility: ReturnType<typeof workOrderVisibilityWhere>) {
    const rows = await prisma.gestaoOsWorkOrder.findMany({
      where: visibility,
      select: { id: true, category: true, osNumber: true, displayNumber: true }
    });
    const extras = await loadWorkOrderExtras(rows.map((r) => r.id));
    const byName = new Map<string, { quantity: number; cost: number; osCount: number }>();
    for (const row of rows) {
      const parts = extras.get(row.id)?.parts;
      const list = parsePartsLoose(parts);
      if (!list.length) continue;
      const seen = new Set<string>();
      for (const part of list) {
        const name = String(part.name || 'Material').trim() || 'Material';
        const cur = byName.get(name) || { quantity: 0, cost: 0, osCount: 0 };
        cur.quantity += Number(part.quantity) || 0;
        cur.cost += (Number(part.unitCost) || 0) * (Number(part.quantity) || 0);
        if (!seen.has(name)) {
          cur.osCount += 1;
          seen.add(name);
        }
        byName.set(name, cur);
      }
    }
    return [...byName.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 40);
  }

  private async pendencias(visibility: ReturnType<typeof workOrderVisibilityWhere>) {
    const openStatuses: GestaoOsStatus[] = [
      'OPEN',
      'UNDER_REVIEW',
      'APPROVED',
      'SAFETY_CHECK',
      'IN_PROGRESS',
      'WAITING_PARTS',
      'REWORK'
    ];
    const now = new Date();
    const rows = await prisma.gestaoOsWorkOrder.findMany({
      where: { ...visibility, status: { in: openStatuses } },
      select: {
        id: true,
        displayNumber: true,
        osNumber: true,
        status: true,
        category: true,
        dueAt: true,
        openedAt: true,
        locationLabel: true,
        assignee: { select: { name: true } }
      },
      orderBy: { openedAt: 'asc' },
      take: 200
    });
    return rows.map((row) => ({
      id: row.id,
      label: row.osNumber != null ? `OS #${row.osNumber}` : `Chamado #${row.displayNumber}`,
      status: row.status,
      category: row.category,
      locationLabel: row.locationLabel,
      assigneeName: row.assignee?.name ?? null,
      openedAt: row.openedAt.toISOString(),
      dueAt: row.dueAt?.toISOString() ?? null,
      overdue: Boolean(row.dueAt && row.dueAt < now),
      unsolved: row.status === 'REWORK' || row.status === 'WAITING_PARTS'
    }));
  }

  async exportCsv(access: GestaoOsAccessContext, filters: GestaoOsReportFilters = {}) {
    const data = await this.summary(access, filters);
    const lines = [
      'tipo,chave,valor',
      `resumo,abertas,${data.openLike}`,
      `resumo,resolvidas,${data.resolved}`,
      `resumo,atrasadas,${data.overdue}`,
      ...data.byCategory.map((r) => `categoria,${csvCell(r.category)},${r.count}`),
      ...data.monthlyByCategory.flatMap((m) =>
        m.byCategory.map((r) => `volume-mensal,${m.month} ${csvCell(r.category)},${r.count}`)
      ),
      ...data.materials.map(
        (r) => `insumo,${csvCell(r.name)},${r.quantity}|${r.cost}|${r.osCount}`
      ),
      ...data.pendencias.map(
        (r) => `pendencia,${csvCell(r.label)},${r.status}|${csvCell(r.category)}|${r.overdue ? 'atrasada' : 'no-prazo'}`
      )
    ];
    return lines.join('\n');
  }
}

function csvCell(value: string) {
  const t = String(value ?? '');
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

export const gestaoOsReportsService = new GestaoOsReportsService();
